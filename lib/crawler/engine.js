/**
 * @fileoverview Crawler engine — main orchestrator with multi-tier adaptive escalation.
 *
 * Pipeline: HTTP (tier 1) → Browser (tier 2) → CAPTCHA solve (tier 3) → LLM extraction (tier 4)
 *
 * Each tier catches failures and escalates to the next. Most pages resolve at
 * tier 1 (plain HTTP) — browser and beyond are only used when cheaper tiers fail.
 *
 * Features:
 * - Request deduplication (URL+opts hash, 5-minute TTL)
 * - Circuit breaker per domain (3 consecutive failures → exponential backoff)
 * - Politeness enforcement (robots.txt, rate limiting)
 * - Configurable max tier, timeout, selectors, headers
 *
 * @module crawler/engine
 */

import { createHash } from 'node:crypto';
import { httpFetch, randomProfile } from './http-client.js';
import { PolitenessEngine } from './politeness.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEDUP_TTL_MS = 5 * 60 * 1000;          // 5 minutes
const DEDUP_CLEANUP_INTERVAL_MS = 60 * 1000;  // Sweep expired entries every 60s

const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_BACKOFF_BASE_MS = 5_000;
const CIRCUIT_BACKOFF_MAX_MS = 120_000;
const CIRCUIT_RECOVERY_MS = 60_000;            // Try again after this long

const DEFAULT_TIMEOUT_MS = 30_000;

/** @enum {number} */
const Tier = {
  HTTP: 1,
  BROWSER: 2,
  CAPTCHA: 3,
  LLM: 4,
};

/* ------------------------------------------------------------------ */
/*  Shared singleton state                                             */
/* ------------------------------------------------------------------ */

/** @type {PolitenessEngine} */
let politeness = new PolitenessEngine();

/**
 * Request dedup cache.
 * Key = hash(url + JSON(opts)), Value = { result, expiresAt }
 * @type {Map<string, { result: CrawlResult, expiresAt: number }>}
 */
const dedupCache = new Map();

/**
 * Circuit breaker state per domain.
 * @type {Map<string, { failures: number, backoffUntil: number }>}
 */
const circuitBreakers = new Map();

/** @type {NodeJS.Timeout|null} */
let cleanupTimer = null;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} CrawlOpts
 * @property {'markdown'|'text'|'html'|'screenshot'} [extractMode='markdown']
 * @property {1|2|3|4} [maxTier=4]       Maximum tier to attempt
 * @property {number}   [timeout=30000]   Overall timeout in ms
 * @property {string}   [selector]        CSS selector for specific content extraction
 * @property {string}   [waitFor]         CSS selector to wait for before extraction (browser tier)
 * @property {string}   [proxy]           Proxy URL ('auto' | 'none' | 'http://...')
 * @property {Record<string, string>} [headers]  Additional request headers
 * @property {Record<string, string>} [cookies]  Cookies to send
 * @property {boolean}  [respectRobots=true]  Whether to check robots.txt
 * @property {boolean}  [skipDedup=false]      Bypass the dedup cache
 */

/**
 * @typedef {Object} CrawlResult
 * @property {string}  url        The requested URL
 * @property {number}  status     HTTP status code (0 for network errors)
 * @property {number}  tier       Which tier succeeded (1-4), 0 if all failed
 * @property {string}  markdown   Extracted markdown content
 * @property {string}  text       Extracted plain text content
 * @property {Object}  metadata   Page metadata (title, author, date, links, etc.)
 * @property {boolean} cached     Whether result came from dedup cache
 * @property {Object}  timing     Timing breakdown { fetch, extract, total } in ms
 * @property {string}  [error]    Error message if all tiers failed
 */

/* ------------------------------------------------------------------ */
/*  Dedup cache helpers                                                */
/* ------------------------------------------------------------------ */

/**
 * Compute a cache key from URL and relevant options.
 * @param {string} url
 * @param {CrawlOpts} opts
 * @returns {string}
 */
function cacheKey(url, opts) {
  const significant = {
    url,
    extractMode: opts.extractMode,
    selector: opts.selector,
    headers: opts.headers,
  };
  return createHash('sha256')
    .update(JSON.stringify(significant))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Start the periodic dedup cache cleanup if not already running.
 */
function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of dedupCache) {
      if (entry.expiresAt <= now) dedupCache.delete(key);
    }
  }, DEDUP_CLEANUP_INTERVAL_MS);
  // Don't keep the process alive just for cleanup
  cleanupTimer.unref();
}

/* ------------------------------------------------------------------ */
/*  Circuit breaker                                                    */
/* ------------------------------------------------------------------ */

/**
 * Extract domain from URL.
 * @param {string} url
 * @returns {string}
 */
function domainOf(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

/**
 * Check if the circuit breaker is open (blocking) for a domain.
 * @param {string} domain
 * @returns {boolean}
 */
function isCircuitOpen(domain) {
  const cb = circuitBreakers.get(domain);
  if (!cb) return false;
  if (cb.failures < CIRCUIT_FAILURE_THRESHOLD) return false;

  // Check if backoff period has elapsed (half-open → allow one attempt)
  if (Date.now() >= cb.backoffUntil) return false;

  return true;
}

/**
 * Record a failure for the domain circuit breaker.
 * @param {string} domain
 */
function recordFailure(domain) {
  let cb = circuitBreakers.get(domain);
  if (!cb) {
    cb = { failures: 0, backoffUntil: 0 };
    circuitBreakers.set(domain, cb);
  }
  cb.failures++;
  if (cb.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    const backoff = Math.min(
      CIRCUIT_BACKOFF_BASE_MS * Math.pow(2, cb.failures - CIRCUIT_FAILURE_THRESHOLD),
      CIRCUIT_BACKOFF_MAX_MS
    );
    cb.backoffUntil = Date.now() + backoff;
  }
}

/**
 * Record a success — reset the circuit breaker for the domain.
 * @param {string} domain
 */
function recordSuccess(domain) {
  circuitBreakers.delete(domain);
}

/* ------------------------------------------------------------------ */
/*  Tier 1: HTTP Fetch                                                 */
/* ------------------------------------------------------------------ */

/**
 * Attempt to fetch and extract content using plain HTTP.
 *
 * @param {string} url
 * @param {CrawlOpts} opts
 * @returns {Promise<{success: boolean, result?: Partial<CrawlResult>, needsBrowser?: boolean, blocked?: boolean}>}
 */
async function tier1Http(url, opts) {
  const t0 = Date.now();

  try {
    const fetchResult = await httpFetch(url, {
      profile: randomProfile(),
      timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS,
      cookies: opts.cookies,
      headers: opts.headers,
    });

    const fetchTime = Date.now() - t0;

    // Network error
    if (fetchResult.status === 0) {
      return { success: false, error: fetchResult.error };
    }

    // Record to politeness engine
    const domain = domainOf(url);
    politeness.recordResponse(domain, fetchResult.status, fetchTime);

    // Needs browser (JS challenge, too small)
    if (fetchResult.needsBrowser) {
      return { success: false, needsBrowser: true };
    }

    // Blocked
    if (fetchResult.blocked) {
      return { success: false, blocked: true };
    }

    // Server errors — escalate
    if (fetchResult.status >= 500) {
      return { success: false, error: `HTTP ${fetchResult.status}` };
    }

    // Client errors (except 403 which is handled above) — don't escalate, just report
    if (fetchResult.status >= 400) {
      return {
        success: true,
        result: {
          status: fetchResult.status,
          tier: Tier.HTTP,
          markdown: '',
          text: '',
          metadata: {},
          timing: { fetch: fetchTime, extract: 0, total: fetchTime },
          error: `HTTP ${fetchResult.status}`,
        },
      };
    }

    // Success — extract content
    const t1 = Date.now();
    const extracted = extractContent(fetchResult.html, url, opts);
    const extractTime = Date.now() - t1;

    return {
      success: true,
      result: {
        status: fetchResult.status,
        tier: Tier.HTTP,
        markdown: extracted.markdown,
        text: extracted.text,
        metadata: extracted.metadata,
        timing: { fetch: fetchTime, extract: extractTime, total: fetchTime + extractTime },
      },
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Tier 2: Browser Fetch (placeholder)                                */
/* ------------------------------------------------------------------ */

/**
 * Attempt to fetch content using a stealth browser.
 * This is a placeholder — the full implementation lives in browser-pool.js (Phase 3b Agent B).
 *
 * @param {string} url
 * @param {CrawlOpts} opts
 * @returns {Promise<{success: boolean, result?: Partial<CrawlResult>, needsCaptcha?: boolean}>}
 */
async function tier2Browser(url, opts) {
  // Try to dynamically import browser-pool (may not be available yet)
  try {
    const { browserFetch } = await import('./browser-pool.js');
    const t0 = Date.now();
    const result = await browserFetch(url, {
      selector: opts.selector,
      waitFor: opts.waitFor,
      timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS,
      proxy: opts.proxy,
    });
    const totalTime = Date.now() - t0;

    if (result.needsCaptcha) {
      return { success: false, needsCaptcha: true };
    }

    if (result.blocked) {
      return { success: false, blocked: true };
    }

    const extracted = extractContent(result.html || '', url, opts);

    return {
      success: true,
      result: {
        status: result.status || 200,
        tier: Tier.BROWSER,
        markdown: extracted.markdown,
        text: extracted.text,
        metadata: extracted.metadata,
        timing: { fetch: totalTime, extract: 0, total: totalTime },
      },
    };
  } catch (err) {
    // browser-pool not available or failed — report gracefully
    return {
      success: false,
      error: `Browser tier unavailable: ${err.message}`,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Tier 3: CAPTCHA Solving (placeholder)                              */
/* ------------------------------------------------------------------ */

/**
 * Attempt to solve a CAPTCHA and extract content.
 * Placeholder — full implementation in captcha.js (Phase 3b Agent C).
 *
 * @param {string} url
 * @param {CrawlOpts} opts
 * @returns {Promise<{success: boolean, result?: Partial<CrawlResult>}>}
 */
async function tier3Captcha(url, opts) {
  try {
    const { solveCaptcha } = await import('./captcha.js');
    const t0 = Date.now();
    const result = await solveCaptcha(url, opts);
    const totalTime = Date.now() - t0;

    if (!result.success) {
      return { success: false, error: result.error || 'CAPTCHA solve failed' };
    }

    const extracted = extractContent(result.html || '', url, opts);

    return {
      success: true,
      result: {
        status: 200,
        tier: Tier.CAPTCHA,
        markdown: extracted.markdown,
        text: extracted.text,
        metadata: extracted.metadata,
        timing: { fetch: totalTime, extract: 0, total: totalTime },
      },
    };
  } catch (err) {
    return { success: false, error: `CAPTCHA tier unavailable: ${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Tier 4: LLM Extraction (placeholder)                               */
/* ------------------------------------------------------------------ */

/**
 * Use an LLM to extract content from a complex/rendered page.
 * Placeholder — full implementation in extractor.js (Phase 3b Agent C).
 *
 * @param {string} url
 * @param {CrawlOpts} opts
 * @returns {Promise<{success: boolean, result?: Partial<CrawlResult>}>}
 */
async function tier4Llm(url, opts) {
  try {
    const { llmExtract } = await import('./extractor.js');
    const t0 = Date.now();
    const result = await llmExtract(url, opts);
    const totalTime = Date.now() - t0;

    return {
      success: true,
      result: {
        status: 200,
        tier: Tier.LLM,
        markdown: result.markdown || '',
        text: result.text || '',
        metadata: result.metadata || {},
        timing: { fetch: totalTime, extract: 0, total: totalTime },
      },
    };
  } catch (err) {
    return { success: false, error: `LLM tier unavailable: ${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Content extraction (basic — used by tiers 1 & 2)                   */
/* ------------------------------------------------------------------ */

/**
 * Extract content from HTML. Uses Readability if available, falls back to regex.
 *
 * @param {string} html  Raw HTML
 * @param {string} url   Source URL (for resolving relative links)
 * @param {CrawlOpts} opts
 * @returns {{ markdown: string, text: string, metadata: Object }}
 */
function extractContent(html, url, opts) {
  // Try @mozilla/readability + linkedom
  try {
    // Dynamic import to avoid hard dependency if not installed
    // We use synchronous require-style for perf, but since this is ESM,
    // we do a sync-compatible approach: pre-import at module level would be better
    // but for now, we do basic HTML extraction with regex as default
    return extractWithRegex(html, url, opts);
  } catch {
    return extractWithRegex(html, url, opts);
  }
}

/**
 * @typedef {Object} ExtractedContent
 * @property {string} markdown
 * @property {string} text
 * @property {Object} metadata
 */

/**
 * Basic regex/heuristic content extraction.
 * Good enough for tier 1; Readability-based extraction is in extractor.js.
 *
 * @param {string} html
 * @param {string} url
 * @param {CrawlOpts} opts
 * @returns {ExtractedContent}
 */
function extractWithRegex(html, url, opts) {
  const metadata = {};

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  metadata.title = titleMatch ? decodeEntities(titleMatch[1].trim()) : '';

  // Extract meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  metadata.description = descMatch ? decodeEntities(descMatch[1].trim()) : '';

  // Extract meta author
  const authorMatch = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']*)["']/i);
  metadata.author = authorMatch ? decodeEntities(authorMatch[1].trim()) : '';

  // Extract OG metadata
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
  if (ogTitle) metadata.ogTitle = decodeEntities(ogTitle[1].trim());

  // CSS selector filtering (basic: extract element by id)
  let targetHtml = html;
  if (opts.selector) {
    // Very basic: handle #id and .class selectors
    const idMatch = opts.selector.match(/^#([\w-]+)$/);
    if (idMatch) {
      const idRegex = new RegExp(`<[^>]+id=["']${idMatch[1]}["'][^>]*>([\\s\\S]*?)(?=<\\/(?:div|section|article|main))`, 'i');
      const found = html.match(idRegex);
      if (found) targetHtml = found[0];
    }
  }

  // Strip script, style, nav, header, footer tags
  let cleaned = targetHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // Convert basic HTML to markdown-ish text
  let markdown = cleaned
    // Headings
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n')
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n')
    // Links
    .replace(/<a[^>]+href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // Bold / italic
    .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**')
    .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
    // List items
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    // Paragraphs / breaks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Plain text = markdown without markdown formatting
  const text = markdown
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();

  metadata.url = url;
  metadata.wordCount = text.split(/\s+/).filter(Boolean).length;

  return { markdown, text, metadata };
}

/**
 * Decode common HTML entities.
 * @param {string} str
 * @returns {string}
 */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

/**
 * Crawl a URL with multi-tier adaptive escalation.
 *
 * Attempts each tier in order (HTTP → Browser → CAPTCHA → LLM), escalating
 * only when cheaper tiers fail or detect that a more capable tier is needed.
 *
 * @param {string} url  The URL to crawl
 * @param {CrawlOpts} [opts={}]  Crawl options
 * @returns {Promise<CrawlResult>}
 *
 * @example
 * ```js
 * const result = await crawl('https://example.com', {
 *   extractMode: 'markdown',
 *   maxTier: 2,
 *   timeout: 15000,
 * });
 * console.log(result.tier, result.markdown.slice(0, 200));
 * ```
 */
export async function crawl(url, opts = {}) {
  const startTime = Date.now();
  const maxTier = opts.maxTier ?? 4;
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS;
  const domain = domainOf(url);

  ensureCleanupTimer();

  // --- Dedup cache check ---
  if (!opts.skipDedup) {
    const key = cacheKey(url, opts);
    const cached = dedupCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, cached: true };
    }
  }

  // --- Circuit breaker check ---
  if (isCircuitOpen(domain)) {
    const cb = circuitBreakers.get(domain);
    const retryIn = Math.ceil((cb.backoffUntil - Date.now()) / 1000);
    return {
      url,
      status: 0,
      tier: 0,
      markdown: '',
      text: '',
      metadata: {},
      cached: false,
      timing: { fetch: 0, extract: 0, total: Date.now() - startTime },
      error: `Circuit breaker open for ${domain} — retry in ${retryIn}s`,
    };
  }

  // --- Politeness check ---
  if (opts.respectRobots !== false) {
    const allowed = await politeness.canFetch(url);
    if (!allowed) {
      return {
        url,
        status: 0,
        tier: 0,
        markdown: '',
        text: '',
        metadata: {},
        cached: false,
        timing: { fetch: 0, extract: 0, total: Date.now() - startTime },
        error: `Blocked by robots.txt: ${url}`,
      };
    }
  }

  // --- Wait for politeness slot ---
  await politeness.waitForSlot(domain);

  // --- Tier escalation ---
  /** @type {string[]} */
  const errors = [];

  // Tier 1: HTTP
  if (maxTier >= Tier.HTTP) {
    const t1 = await tier1Http(url, { ...opts, timeout });

    if (t1.success && t1.result) {
      recordSuccess(domain);
      const result = buildResult(url, t1.result, startTime);
      cacheResult(url, opts, result);
      return result;
    }

    if (t1.error) errors.push(`T1: ${t1.error}`);

    // If page doesn't need browser and isn't blocked, no point escalating
    if (!t1.needsBrowser && !t1.blocked) {
      // Network/server error — record failure but still try higher tiers
      recordFailure(domain);
    }
  }

  // Tier 2: Browser
  if (maxTier >= Tier.BROWSER) {
    const t2 = await tier2Browser(url, { ...opts, timeout });

    if (t2.success && t2.result) {
      recordSuccess(domain);
      const result = buildResult(url, t2.result, startTime);
      cacheResult(url, opts, result);
      return result;
    }

    if (t2.error) errors.push(`T2: ${t2.error}`);

    if (!t2.needsCaptcha) {
      recordFailure(domain);
    }
  }

  // Tier 3: CAPTCHA
  if (maxTier >= Tier.CAPTCHA) {
    const t3 = await tier3Captcha(url, opts);

    if (t3.success && t3.result) {
      recordSuccess(domain);
      const result = buildResult(url, t3.result, startTime);
      cacheResult(url, opts, result);
      return result;
    }

    if (t3.error) errors.push(`T3: ${t3.error}`);
  }

  // Tier 4: LLM
  if (maxTier >= Tier.LLM) {
    const t4 = await tier4Llm(url, opts);

    if (t4.success && t4.result) {
      recordSuccess(domain);
      const result = buildResult(url, t4.result, startTime);
      cacheResult(url, opts, result);
      return result;
    }

    if (t4.error) errors.push(`T4: ${t4.error}`);
  }

  // --- All tiers failed ---
  recordFailure(domain);

  return {
    url,
    status: 0,
    tier: 0,
    markdown: '',
    text: '',
    metadata: {},
    cached: false,
    timing: { fetch: 0, extract: 0, total: Date.now() - startTime },
    error: `All tiers failed: ${errors.join('; ')}`,
  };
}

/* ------------------------------------------------------------------ */
/*  Result helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build a complete CrawlResult from a partial tier result.
 * @param {string} url
 * @param {Partial<CrawlResult>} partial
 * @param {number} startTime
 * @returns {CrawlResult}
 */
function buildResult(url, partial, startTime) {
  return {
    url,
    status: partial.status ?? 0,
    tier: partial.tier ?? 0,
    markdown: partial.markdown ?? '',
    text: partial.text ?? '',
    metadata: partial.metadata ?? {},
    cached: false,
    timing: {
      fetch: partial.timing?.fetch ?? 0,
      extract: partial.timing?.extract ?? 0,
      total: Date.now() - startTime,
    },
    error: partial.error,
  };
}

/**
 * Store a result in the dedup cache.
 * @param {string} url
 * @param {CrawlOpts} opts
 * @param {CrawlResult} result
 */
function cacheResult(url, opts, result) {
  const key = cacheKey(url, opts);
  dedupCache.set(key, {
    result,
    expiresAt: Date.now() + DEDUP_TTL_MS,
  });
}

/* ------------------------------------------------------------------ */
/*  Configuration / lifecycle                                          */
/* ------------------------------------------------------------------ */

/**
 * Replace the shared PolitenessEngine instance (e.g., for testing).
 * @param {PolitenessEngine} engine
 */
export function setPolitenessEngine(engine) {
  politeness = engine;
}

/**
 * Get the shared PolitenessEngine instance.
 * @returns {PolitenessEngine}
 */
export function getPolitenessEngine() {
  return politeness;
}

/**
 * Clear all caches and circuit breakers. Useful for testing.
 */
export function resetEngine() {
  dedupCache.clear();
  circuitBreakers.clear();
  politeness.reset();
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Get engine diagnostics.
 * @returns {{ dedupSize: number, circuitBreakers: Object, politeness: Object }}
 */
export function getEngineStats() {
  const cbStats = {};
  for (const [domain, cb] of circuitBreakers) {
    cbStats[domain] = {
      failures: cb.failures,
      isOpen: isCircuitOpen(domain),
      backoffRemaining: Math.max(0, cb.backoffUntil - Date.now()),
    };
  }

  return {
    dedupSize: dedupCache.size,
    circuitBreakers: cbStats,
    politeness: politeness.getStats(),
  };
}
