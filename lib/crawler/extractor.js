/**
 * extractor.js — Content extraction cascade for Scratchy v2 crawler
 *
 * Tiered extraction:
 *   Tier 0: Domain-specific parsers (Wikipedia, GitHub, Reddit, HN)
 *   Tier 1: Mozilla Readability.js (primary for articles)
 *   Tier 2: Custom fallback (heuristic extraction)
 *
 * @module crawler/extractor
 */

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

// ─── Domain-specific parser registry ────────────────────────────────────────

/**
 * Registry mapping domain patterns to custom extractor functions.
 * Each extractor receives (document, url) and returns { title, content } or null.
 * @type {Map<string, function>}
 */
const domainRegistry = new Map();

/**
 * Register a custom extractor for a domain pattern.
 * @param {string} domain - Domain pattern (e.g. 'en.wikipedia.org')
 * @param {function} extractor - (document, url) => { title, content } | null
 */
export function registerDomainExtractor(domain, extractor) {
  domainRegistry.set(domain, extractor);
}

/**
 * Get the matching domain extractor for a URL.
 * Checks exact match first, then suffix match (e.g. '.wikipedia.org').
 * @param {string} hostname
 * @returns {function|null}
 */
function getDomainExtractor(hostname) {
  // Exact match
  if (domainRegistry.has(hostname)) return domainRegistry.get(hostname);
  // Suffix match (e.g. register 'wikipedia.org' to match 'en.wikipedia.org')
  for (const [domain, extractor] of domainRegistry) {
    if (hostname.endsWith('.' + domain) || hostname === domain) {
      return extractor;
    }
  }
  return null;
}

// ─── Built-in domain extractors ─────────────────────────────────────────────

/**
 * Wikipedia: extract article body, skip infoboxes and navboxes.
 */
registerDomainExtractor('wikipedia.org', (doc, url) => {
  const content = doc.querySelector('#mw-content-text .mw-parser-output');
  if (!content) return null;

  // Remove unwanted elements
  const removeSelectors = [
    '.infobox', '.navbox', '.sidebar', '.sistersitebox', '.mw-editsection',
    '.reference', '.reflist', '.refbegin', '.mw-empty-elt', '.noprint',
    '.mw-jump-link', '#toc', '.toc', '.mbox-small', '.metadata',
    '.hatnote', '.shortdescription', 'style', 'script'
  ];
  for (const sel of removeSelectors) {
    for (const el of content.querySelectorAll(sel)) el.remove();
  }

  const title = doc.querySelector('#firstHeading')?.textContent?.trim()
    || doc.querySelector('h1')?.textContent?.trim()
    || '';

  return { title, content: content.innerHTML };
});

/**
 * GitHub: extract README content or file content.
 */
registerDomainExtractor('github.com', (doc, url) => {
  // README in repo page
  const readme = doc.querySelector('[data-testid="read-me-content"]')
    || doc.querySelector('#readme article')
    || doc.querySelector('.markdown-body');
  if (readme) {
    const title = doc.querySelector('[itemprop="name"] a')?.textContent?.trim()
      || doc.querySelector('strong[itemprop="name"]')?.textContent?.trim()
      || doc.querySelector('h1')?.textContent?.trim() || '';
    return { title, content: readme.innerHTML };
  }

  // File blob content
  const blob = doc.querySelector('.blob-code-content')
    || doc.querySelector('[data-testid="raw-content"]');
  if (blob) {
    const title = doc.querySelector('.final-path')?.textContent?.trim()
      || doc.querySelector('[data-testid="breadcrumbs-filename"]')?.textContent?.trim()
      || '';
    return { title, content: blob.innerHTML };
  }

  return null;
});

/**
 * Reddit: extract post title, selftext, and top comments.
 */
registerDomainExtractor('reddit.com', (doc, url) => {
  // Old reddit
  const postTitle = doc.querySelector('a.title')?.textContent?.trim()
    || doc.querySelector('[data-testid="post-title"]')?.textContent?.trim()
    || doc.querySelector('h1')?.textContent?.trim();

  if (!postTitle) return null;

  const selftext = doc.querySelector('.expando .md')
    || doc.querySelector('[data-testid="post-content"]')
    || doc.querySelector('[slot="text-body"]');

  const comments = [];
  // Old reddit comments
  for (const c of doc.querySelectorAll('.comment .md')) {
    const text = c.textContent?.trim();
    if (text && comments.length < 20) comments.push(text);
  }
  // New reddit comments
  if (comments.length === 0) {
    for (const c of doc.querySelectorAll('[id^="comment-content"]')) {
      const text = c.textContent?.trim();
      if (text && comments.length < 20) comments.push(text);
    }
  }

  let html = `<h1>${escapeHtml(postTitle)}</h1>`;
  if (selftext) html += selftext.innerHTML;
  if (comments.length > 0) {
    html += '<h2>Comments</h2>';
    for (const c of comments) {
      html += `<blockquote>${escapeHtml(c)}</blockquote>`;
    }
  }

  return { title: postTitle, content: html };
});

/**
 * Hacker News: extract post and comments.
 */
registerDomainExtractor('news.ycombinator.com', (doc, url) => {
  const titleEl = doc.querySelector('.titleline a')
    || doc.querySelector('.storylink');
  const title = titleEl?.textContent?.trim();
  if (!title) return null;

  const postLink = titleEl?.getAttribute('href') || '';

  // Submission text (for Ask HN, Show HN)
  const toptext = doc.querySelector('.toptext');

  const comments = [];
  for (const c of doc.querySelectorAll('.commtext')) {
    const text = c.textContent?.trim();
    if (text && comments.length < 30) comments.push(text);
  }

  let html = `<h1>${escapeHtml(title)}</h1>`;
  if (postLink && !postLink.startsWith('item?')) {
    html += `<p>Link: <a href="${escapeHtml(postLink)}">${escapeHtml(postLink)}</a></p>`;
  }
  if (toptext) html += toptext.innerHTML;
  if (comments.length > 0) {
    html += '<h2>Comments</h2>';
    for (const c of comments) {
      html += `<blockquote>${escapeHtml(c)}</blockquote>`;
    }
  }

  return { title, content: html };
});

// ─── HTML to Markdown conversion ────────────────────────────────────────────

/**
 * Convert an HTML string to clean Markdown.
 * Handles headings, bold/italic, links, images, code blocks, lists, tables.
 * Strips scripts, styles, comments, and hidden elements.
 *
 * @param {string} html - HTML string to convert
 * @param {string} [baseUrl=''] - Base URL for resolving relative links
 * @returns {string} Markdown text
 */
export function htmlToMarkdown(html, baseUrl = '') {
  if (!html || typeof html !== 'string') return '';

  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);

  // Strip unwanted elements
  const stripSelectors = [
    'script', 'style', 'noscript', 'svg', 'iframe',
    '[hidden]', '[aria-hidden="true"]', '.hidden', '.sr-only',
    'nav', 'footer', 'header:not(article header)',
    '.ad', '.ads', '.advertisement', '.social-share',
    'comment' // HTML comments are parsed as comments
  ];
  for (const sel of stripSelectors) {
    try {
      for (const el of document.querySelectorAll(sel)) el.remove();
    } catch { /* selector may not be valid in linkedom */ }
  }

  // Remove HTML comments
  const walker = document.createTreeWalker(document.body, 128 /* NodeFilter.SHOW_COMMENT */);
  const commentsToRemove = [];
  while (walker.nextNode()) commentsToRemove.push(walker.currentNode);
  for (const c of commentsToRemove) c.parentNode?.removeChild(c);

  return nodeToMarkdown(document.body, baseUrl).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Recursively convert a DOM node to Markdown.
 * @param {Node} node
 * @param {string} baseUrl
 * @returns {string}
 */
function nodeToMarkdown(node, baseUrl) {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    return node.textContent.replace(/\s+/g, ' ');
  }

  if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';

  const tag = node.tagName?.toLowerCase() || '';
  const children = () => {
    let out = '';
    for (const child of node.childNodes) {
      out += nodeToMarkdown(child, baseUrl);
    }
    return out;
  };

  switch (tag) {
    // Headings
    case 'h1': return `\n\n# ${children().trim()}\n\n`;
    case 'h2': return `\n\n## ${children().trim()}\n\n`;
    case 'h3': return `\n\n### ${children().trim()}\n\n`;
    case 'h4': return `\n\n#### ${children().trim()}\n\n`;
    case 'h5': return `\n\n##### ${children().trim()}\n\n`;
    case 'h6': return `\n\n###### ${children().trim()}\n\n`;

    // Block elements
    case 'p':
    case 'div':
    case 'section':
    case 'article':
    case 'main':
      return `\n\n${children().trim()}\n\n`;

    case 'br':
      return '\n';

    case 'hr':
      return '\n\n---\n\n';

    // Inline formatting
    case 'strong':
    case 'b': {
      const text = children().trim();
      return text ? `**${text}**` : '';
    }
    case 'em':
    case 'i': {
      const text = children().trim();
      return text ? `*${text}*` : '';
    }
    case 'del':
    case 's': {
      const text = children().trim();
      return text ? `~~${text}~~` : '';
    }
    case 'code': {
      // Inline code (not inside <pre>)
      if (node.parentNode?.tagName?.toLowerCase() !== 'pre') {
        return `\`${node.textContent}\``;
      }
      return node.textContent;
    }

    // Code blocks
    case 'pre': {
      const codeEl = node.querySelector('code');
      const code = codeEl ? codeEl.textContent : node.textContent;
      const lang = codeEl?.getAttribute('class')?.match(/language-(\w+)/)?.[1] || '';
      return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
    }

    // Links
    case 'a': {
      const href = resolveUrl(node.getAttribute('href'), baseUrl);
      const text = children().trim();
      if (!href || href.startsWith('javascript:')) return text;
      if (!text) return href;
      return `[${text}](${href})`;
    }

    // Images
    case 'img': {
      const src = resolveUrl(node.getAttribute('src'), baseUrl);
      const alt = node.getAttribute('alt') || '';
      if (!src) return '';
      return `![${alt}](${src})`;
    }

    // Lists
    case 'ul':
    case 'ol':
      return `\n\n${formatList(node, baseUrl, tag === 'ol')}\n\n`;

    case 'li': {
      const text = children().trim();
      return text ? `- ${text}\n` : '';
    }

    // Blockquotes
    case 'blockquote': {
      const text = children().trim();
      return `\n\n${text.split('\n').map(l => `> ${l}`).join('\n')}\n\n`;
    }

    // Tables
    case 'table':
      return `\n\n${formatTable(node, baseUrl)}\n\n`;

    // Figure
    case 'figure': {
      const img = node.querySelector('img');
      const caption = node.querySelector('figcaption');
      let result = '';
      if (img) {
        const src = resolveUrl(img.getAttribute('src'), baseUrl);
        const alt = caption?.textContent?.trim() || img.getAttribute('alt') || '';
        result = `![${alt}](${src})`;
      }
      return `\n\n${result}\n\n`;
    }

    // Time
    case 'time':
      return node.textContent;

    // Skip these containers — just render children
    case 'span':
    case 'label':
    case 'small':
    case 'abbr':
    case 'mark':
    case 'sup':
    case 'sub':
      return children();

    default:
      return children();
  }
}

/**
 * Format a list (ul/ol) to Markdown.
 * @param {Element} listEl
 * @param {string} baseUrl
 * @param {boolean} ordered
 * @param {number} depth
 * @returns {string}
 */
function formatList(listEl, baseUrl, ordered, depth = 0) {
  const lines = [];
  let index = 1;
  const indent = '  '.repeat(depth);

  for (const child of listEl.children) {
    if (child.tagName?.toLowerCase() !== 'li') continue;

    // Check for nested lists inside this li
    const nestedList = child.querySelector('ul, ol');
    let text = '';

    for (const n of child.childNodes) {
      const tag = n.tagName?.toLowerCase();
      if (tag === 'ul' || tag === 'ol') continue; // handle nested list separately
      text += nodeToMarkdown(n, baseUrl);
    }
    text = text.trim();

    const prefix = ordered ? `${index}. ` : '- ';
    if (text) lines.push(`${indent}${prefix}${text}`);

    if (nestedList) {
      const nestedOrdered = nestedList.tagName?.toLowerCase() === 'ol';
      lines.push(formatList(nestedList, baseUrl, nestedOrdered, depth + 1));
    }

    index++;
  }

  return lines.join('\n');
}

/**
 * Format an HTML table to Markdown.
 * @param {Element} tableEl
 * @param {string} baseUrl
 * @returns {string}
 */
function formatTable(tableEl, baseUrl) {
  const rows = [];

  for (const tr of tableEl.querySelectorAll('tr')) {
    const cells = [];
    for (const cell of tr.querySelectorAll('th, td')) {
      cells.push(nodeToMarkdown(cell, baseUrl).trim().replace(/\|/g, '\\|').replace(/\n/g, ' '));
    }
    rows.push(cells);
  }

  if (rows.length === 0) return '';

  const colCount = Math.max(...rows.map(r => r.length));
  const normalised = rows.map(r => {
    while (r.length < colCount) r.push('');
    return r;
  });

  const lines = [];
  lines.push('| ' + normalised[0].join(' | ') + ' |');
  lines.push('| ' + normalised[0].map(() => '---').join(' | ') + ' |');
  for (let i = 1; i < normalised.length; i++) {
    lines.push('| ' + normalised[i].join(' | ') + ' |');
  }

  return lines.join('\n');
}

/**
 * Resolve a relative URL against a base.
 * @param {string|null} href
 * @param {string} baseUrl
 * @returns {string}
 */
function resolveUrl(href, baseUrl) {
  if (!href) return '';
  if (href.startsWith('data:') || href.startsWith('mailto:') || href.startsWith('tel:')) return href;
  try {
    return new URL(href, baseUrl || undefined).href;
  } catch {
    return href;
  }
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Metadata extraction ────────────────────────────────────────────────────

/**
 * Extract metadata from an HTML document.
 * Priority chains for each field are documented inline.
 *
 * @param {Document} doc - Parsed DOM document
 * @param {string} url - Page URL for resolving relative links
 * @returns {{ title: string, author: string, date: string, language: string, description: string, images: string[], links: string[] }}
 */
export function extractMetadata(doc, url) {
  const meta = (name) => {
    // Check both name and property attributes
    const el = doc.querySelector(`meta[property="${name}"]`)
      || doc.querySelector(`meta[name="${name}"]`);
    return el?.getAttribute('content')?.trim() || '';
  };

  // Title: og:title → <title> → first <h1>
  const title = meta('og:title')
    || doc.querySelector('title')?.textContent?.trim()
    || doc.querySelector('h1')?.textContent?.trim()
    || '';

  // Author: og:author → article:author → meta author → .byline / [rel=author]
  const author = meta('og:author')
    || meta('article:author')
    || meta('author')
    || doc.querySelector('.byline')?.textContent?.trim()
    || doc.querySelector('[rel="author"]')?.textContent?.trim()
    || '';

  // Date: article:published_time → meta date → time[datetime] → time element text
  const date = meta('article:published_time')
    || meta('date')
    || meta('publish_date')
    || meta('DC.date')
    || doc.querySelector('time[datetime]')?.getAttribute('datetime')
    || doc.querySelector('time')?.textContent?.trim()
    || '';

  // Language: html[lang] → meta language → og:locale
  const language = doc.documentElement?.getAttribute('lang')?.trim()
    || meta('language')
    || meta('og:locale')
    || '';

  // Description: og:description → meta description → twitter:description
  const description = meta('og:description')
    || meta('description')
    || meta('twitter:description')
    || '';

  // Images: og:image → twitter:image → first large <img>
  const images = [];
  const ogImage = meta('og:image') || meta('twitter:image');
  if (ogImage) images.push(resolveUrl(ogImage, url));

  // Find large images in content (width/height > 200 or no dimensions specified in main content)
  for (const img of doc.querySelectorAll('article img, main img, .content img')) {
    const src = img.getAttribute('src');
    if (!src) continue;
    const resolved = resolveUrl(src, url);
    if (resolved && !images.includes(resolved)) {
      const w = parseInt(img.getAttribute('width') || '0', 10);
      const h = parseInt(img.getAttribute('height') || '0', 10);
      // Include if dimensions unknown or large enough
      if ((!w && !h) || w > 200 || h > 200) {
        images.push(resolved);
        if (images.length >= 10) break;
      }
    }
  }

  // Links: all <a> hrefs, deduped
  const linkSet = new Set();
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
    const resolved = resolveUrl(href, url);
    if (resolved) linkSet.add(resolved);
  }
  const links = [...linkSet];

  return { title, author, date, language, description, images, links };
}

// ─── Tier 0: Domain-specific extraction ─────────────────────────────────────

/**
 * Attempt domain-specific extraction.
 * @param {Document} doc
 * @param {string} url
 * @returns {{ title: string, content: string } | null}
 */
function tier0Extract(doc, url) {
  try {
    const hostname = new URL(url).hostname;
    const extractor = getDomainExtractor(hostname);
    if (!extractor) return null;
    const result = extractor(doc, url);
    if (result && result.content) return result;
    return null;
  } catch {
    return null;
  }
}

// ─── Tier 1: Readability extraction ─────────────────────────────────────────

/**
 * Attempt extraction using Mozilla Readability.
 * @param {Document} doc
 * @param {string} url
 * @returns {{ title: string, content: string } | null}
 */
function tier1Extract(doc, url) {
  try {
    // Readability modifies the DOM, so clone it
    const clone = doc.cloneNode(true);
    const reader = new Readability(clone, { charThreshold: 100 });
    const article = reader.parse();
    if (!article || !article.content || article.content.trim().length < 50) return null;
    return { title: article.title || '', content: article.content };
  } catch {
    return null;
  }
}

// ─── Tier 2: Custom fallback extraction ─────────────────────────────────────

/**
 * Custom fallback: extract main content via heuristics.
 * Tries <main>, <article>, role="main", then <body> as last resort.
 * Strips nav, footer, sidebar, and ad elements.
 *
 * @param {Document} doc
 * @param {string} url
 * @returns {{ title: string, content: string } | null}
 */
function tier2Extract(doc, url) {
  try {
    // Title
    const title = doc.querySelector('title')?.textContent?.trim()
      || doc.querySelector('h1')?.textContent?.trim()
      || '';

    // Find main content container
    const main = doc.querySelector('main')
      || doc.querySelector('article')
      || doc.querySelector('[role="main"]')
      || doc.querySelector('.content')
      || doc.querySelector('#content')
      || doc.body;

    if (!main) return null;

    // Clone to avoid mutating
    const clone = main.cloneNode(true);

    // Strip unwanted elements
    const stripSelectors = [
      'nav', 'footer', 'header', 'aside',
      '.sidebar', '.nav', '.menu', '.footer', '.header',
      '.ad', '.ads', '.advertisement', '.social-share', '.share-buttons',
      '.related', '.recommended', '.comments', '.comment-section',
      'script', 'style', 'noscript', 'iframe', 'svg',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '[role="complementary"]'
    ];
    for (const sel of stripSelectors) {
      try {
        for (const el of clone.querySelectorAll(sel)) el.remove();
      } catch { /* ignore invalid selectors in linkedom */ }
    }

    const html = clone.innerHTML;
    if (!html || html.trim().length < 100) return null;

    return { title, content: html };
  } catch {
    return null;
  }
}

// ─── Main extraction function ───────────────────────────────────────────────

/**
 * Extract content from an HTML page using a tiered cascade.
 *
 * Tier 0: Domain-specific (Wikipedia, GitHub, Reddit, HN)
 * Tier 1: Mozilla Readability.js
 * Tier 2: Custom heuristic fallback
 *
 * Metadata is always extracted regardless of which tier succeeds.
 *
 * @param {string} html - Raw HTML string
 * @param {string} url - Page URL (used for resolving relative links and domain detection)
 * @param {object} [opts={}] - Options
 * @param {number} [opts.maxTier=2] - Maximum tier to attempt (0, 1, or 2)
 * @param {string} [opts.selector] - CSS selector to extract specific content from
 * @returns {Promise<{ markdown: string, text: string, metadata: object, tier: number }>}
 */
export async function extractContent(html, url, opts = {}) {
  const { maxTier = 2, selector } = opts;

  if (!html || typeof html !== 'string') {
    return {
      markdown: '',
      text: '',
      metadata: { title: '', author: '', date: '', language: '', description: '', images: [], links: [] },
      tier: -1,
    };
  }

  // Parse the HTML once
  const { document: doc } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);

  // Try to preserve the original html lang attribute
  const langMatch = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  if (langMatch && doc.documentElement) {
    doc.documentElement.setAttribute('lang', langMatch[1]);
  }

  // Extract metadata (always, regardless of tier)
  const metadata = extractMetadata(doc, url);

  // If a specific selector is requested, extract just that
  if (selector) {
    const selected = doc.querySelector(selector);
    if (selected) {
      const md = htmlToMarkdown(selected.innerHTML, url);
      return {
        markdown: md,
        text: md.replace(/[#*`\[\]()>|\\~_-]/g, ' ').replace(/\s+/g, ' ').trim(),
        metadata,
        tier: 0,
      };
    }
  }

  // Tier cascade
  const tiers = [
    { tier: 0, fn: () => tier0Extract(doc, url) },
    { tier: 1, fn: () => tier1Extract(doc, url) },
    { tier: 2, fn: () => tier2Extract(doc, url) },
  ];

  for (const { tier, fn } of tiers) {
    if (tier > maxTier) break;

    const result = fn();
    if (result && result.content) {
      const markdown = htmlToMarkdown(result.content, url);
      if (markdown.trim().length > 20) {
        // Use extracted title from tier if better than metadata
        if (result.title && (!metadata.title || metadata.title.length < result.title.length)) {
          metadata.title = result.title;
        }

        const text = markdown
          .replace(/!\[.*?\]\(.*?\)/g, '') // strip images
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip link syntax, keep text
          .replace(/[#*`>|\\~_]/g, '') // strip markdown formatting chars
          .replace(/```[\s\S]*?```/g, '') // strip code blocks
          .replace(/\n{2,}/g, '\n')
          .replace(/\s+/g, ' ')
          .trim();

        return { markdown, text, metadata, tier };
      }
    }
  }

  // Nothing extracted — return metadata only
  return {
    markdown: '',
    text: '',
    metadata,
    tier: -1,
  };
}
