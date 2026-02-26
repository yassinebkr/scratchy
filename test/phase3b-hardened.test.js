/**
 * Phase 3b — Hardened contract tests for Scratchy v2 web crawler.
 *
 * Inspired by NullClaw's contract-based testing philosophy:
 * every implementation must satisfy the same behavioral contract.
 *
 * Uses Node.js built-in test runner (node --test).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractContent,
  htmlToMarkdown,
  extractMetadata,
  registerDomainExtractor,
} from '../lib/crawler/extractor.js';
import { parseHTML } from 'linkedom';
import { SessionStore } from '../lib/crawler/session-store.js';
import { detectCaptcha, isChallengePage } from '../lib/crawler/captcha.js';
import { httpFetch } from '../lib/crawler/http-client.js';
import { PolitenessEngine } from '../lib/crawler/politeness.js';
import {
  crawl,
  resetEngine,
  getEngineStats,
  setPolitenessEngine,
  getPolitenessEngine,
} from '../lib/crawler/engine.js';

// ════════════════════════════════════════════════════════════════════
// CONTRACT: Extractor Output Shape
// ════════════════════════════════════════════════════════════════════
//
// Every extraction tier must return:
//   { markdown: string, text: string, metadata: { title, author, date, language, description, images, links }, tier: number }
//
// metadata.images and metadata.links must be arrays.
// null/undefined/empty inputs must never crash.

/**
 * NullClaw-style contract: verify that an extraction result satisfies the
 * output contract regardless of which tier produced it.
 */
function contractExtractorResult(result, label) {
  // Shape
  assert.equal(typeof result.markdown, 'string', `${label}: markdown must be string`);
  assert.equal(typeof result.text, 'string', `${label}: text must be string`);
  assert.equal(typeof result.tier, 'number', `${label}: tier must be number`);
  assert.ok(result.metadata && typeof result.metadata === 'object', `${label}: metadata must be object`);

  // Metadata fields
  const m = result.metadata;
  assert.equal(typeof m.title, 'string', `${label}: metadata.title must be string`);
  assert.equal(typeof m.author, 'string', `${label}: metadata.author must be string`);
  assert.equal(typeof m.date, 'string', `${label}: metadata.date must be string`);
  assert.equal(typeof m.language, 'string', `${label}: metadata.language must be string`);
  assert.equal(typeof m.description, 'string', `${label}: metadata.description must be string`);
  assert.ok(Array.isArray(m.images), `${label}: metadata.images must be array`);
  assert.ok(Array.isArray(m.links), `${label}: metadata.links must be array`);
}

// ════════════════════════════════════════════════════════════════════
// 1. CONTRACT TESTS — EXTRACTION PIPELINE
// ════════════════════════════════════════════════════════════════════

describe('Contract: Extractor output shape', () => {
  // A rich article HTML used across all tiers
  const RICH_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Contract Test Article</title>
  <meta property="og:title" content="OG Contract Title">
  <meta property="og:description" content="OG description for contract test">
  <meta name="author" content="Contract Author">
  <meta property="article:published_time" content="2025-06-15T10:00:00Z">
</head>
<body>
  <article>
    <h1>Contract Article Heading</h1>
    <p>This is a sufficiently long paragraph for extraction to work properly. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
    <p>Another paragraph to make the content substantial enough for Readability. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.</p>
    <a href="https://example.com/link1">Link one</a>
    <a href="https://example.com/link2">Link two</a>
  </article>
</body>
</html>`;

  it('non-domain-specific extraction satisfies contract (tier 1 or 2)', async () => {
    const result = await extractContent(RICH_HTML, 'https://blog.example.com/post');
    contractExtractorResult(result, 'tier 1/2');
    assert.ok(result.tier >= 0, `tier should be >= 0, got ${result.tier}`);
  });

  it('domain-specific Wikipedia extraction satisfies contract (tier 0)', async () => {
    const wikiHTML = `
<!DOCTYPE html>
<html lang="en">
<head><title>Test - Wikipedia</title></head>
<body>
  <h1 id="firstHeading">Wiki Contract</h1>
  <div id="mw-content-text"><div class="mw-parser-output">
    <p>This is the lead section of a Wikipedia article. It must be long enough for extraction. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.</p>
    <h2>History</h2>
    <p>The history section has more content here. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>
  </div></div>
</body>
</html>`;
    const result = await extractContent(wikiHTML, 'https://en.wikipedia.org/wiki/Test');
    contractExtractorResult(result, 'tier 0 Wikipedia');
    assert.equal(result.tier, 0);
  });

  it('fallback extraction satisfies contract (tier 2)', async () => {
    // Minimal HTML that won't pass Readability but has a main element
    const fallbackHTML = `
<html lang="fr"><head><title>Fallback Test</title><meta name="description" content="Fallback desc"></head>
<body><main>
  <p>Some content that is long enough for the fallback extractor to pick up. It needs at least 100 characters of inner HTML and 20 chars of markdown output.</p>
  <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident.</p>
</main></body></html>`;
    const result = await extractContent(fallbackHTML, 'https://unknown-site.example.com/page');
    contractExtractorResult(result, 'tier 2 fallback');
  });

  it('same HTML through every tier satisfies contract', async () => {
    // tier 0 via Wikipedia domain
    const r0 = await extractContent(RICH_HTML, 'https://en.wikipedia.org/wiki/Fake');
    contractExtractorResult(r0, 'same HTML tier 0');

    // tier <=1 via generic domain  
    const r1 = await extractContent(RICH_HTML, 'https://generic.example.com/page');
    contractExtractorResult(r1, 'same HTML tier 1/2');

    // tier 2 only
    const r2 = await extractContent(RICH_HTML, 'https://another.example.com/', { maxTier: 2 });
    contractExtractorResult(r2, 'same HTML maxTier=2');
  });

  describe('null / undefined / empty never crash', () => {
    for (const [label, input] of [
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['number 0', 0],
      ['boolean false', false],
    ]) {
      it(`extractContent(${label}) returns gracefully`, async () => {
        const result = await extractContent(input, 'https://example.com');
        contractExtractorResult(result, label);
        assert.equal(result.tier, -1);
        assert.equal(result.markdown, '');
      });
    }

    for (const [label, input] of [
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
    ]) {
      it(`htmlToMarkdown(${label}) returns empty string`, () => {
        assert.equal(htmlToMarkdown(input), '');
      });
    }
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. CONTRACT TESTS — SESSION STORE
// ════════════════════════════════════════════════════════════════════

/**
 * NullClaw-style contract: verify SessionStore satisfies behavioral invariants.
 * Mirrors contractBasics / contractCrud from NullClaw's contract_test.zig.
 */
async function contractSessionStore(store) {
  // ── Basics (empty store) ──────────────────────────────────────
  // isWarmed returns false on fresh store
  assert.equal(store.isWarmed('nonexistent.example.com'), false, 'empty store: isWarmed returns false');

  // hasCloudflare returns false on fresh store
  const hasCf = await store.hasCloudflare('nonexistent.example.com');
  assert.equal(hasCf, false, 'empty store: hasCloudflare returns false');

  // getCookies returns empty on unknown domain
  const cookies = await store.getCookies('https://nonexistent.example.com/');
  assert.equal(cookies, '', 'empty store: getCookies returns empty string');

  // ── CRUD ──────────────────────────────────────────────────────
  // Set cookies
  await store.setCookies('crud-test.com', ['session=abc; Path=/', 'token=xyz; Path=/']);

  // Get cookies
  const retrieved = await store.getCookies('https://crud-test.com/page');
  assert.ok(retrieved.includes('session=abc'), 'CRUD: get after set - session');
  assert.ok(retrieved.includes('token=xyz'), 'CRUD: get after set - token');

  // Size incremented
  assert.ok(store.size >= 1, 'CRUD: size after set');

  // Clear
  store.clearDomain('crud-test.com');
  const afterClear = await store.getCookies('https://crud-test.com/page');
  assert.equal(afterClear, '', 'CRUD: getCookies after clear returns empty');

  // ── Domain isolation ──────────────────────────────────────────
  await store.setCookies('domain-a.com', ['a=1; Path=/']);
  await store.setCookies('domain-b.com', ['b=2; Path=/']);

  const aCookies = await store.getCookies('https://domain-a.com/');
  const bCookies = await store.getCookies('https://domain-b.com/');

  assert.ok(aCookies.includes('a=1'), 'isolation: domain A has its cookie');
  assert.ok(!aCookies.includes('b=2'), 'isolation: domain A does not have B cookie');
  assert.ok(bCookies.includes('b=2'), 'isolation: domain B has its cookie');
  assert.ok(!bCookies.includes('a=1'), 'isolation: domain B does not have A cookie');

  // Cleanup
  store.clear();

  // ── Warming ───────────────────────────────────────────────────
  assert.equal(store.isWarmed('warm-test.com'), false, 'warming: not warmed initially');
  store.markWarmed('warm-test.com');
  assert.equal(store.isWarmed('warm-test.com'), true, 'warming: warmed after mark');

  store.clear();
}

describe('Contract: SessionStore', () => {
  it('satisfies the full behavioral contract', async () => {
    const store = new SessionStore();
    await contractSessionStore(store);
  });

  it('warming TTL expiry works', async () => {
    const store = new SessionStore();
    store.warmingTtl = 40; // 40ms
    store.markWarmed('ttl-test.com');
    assert.equal(store.isWarmed('ttl-test.com'), true);

    await new Promise(r => setTimeout(r, 80));
    assert.equal(store.isWarmed('ttl-test.com'), false, 'should expire after TTL');
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. EDGE CASE BLITZ — EXTRACTOR
// ════════════════════════════════════════════════════════════════════

describe('Extractor edge cases', () => {
  describe('Empty / minimal HTML', () => {
    for (const [label, html] of [
      ['empty string', ''],
      ['bare html tags', '<html></html>'],
      ['html+body empty', '<html><body></body></html>'],
      ['just whitespace in body', '<html><body>   \n\t  </body></html>'],
    ]) {
      it(`handles ${label} gracefully`, async () => {
        const result = await extractContent(html, 'https://example.com/empty');
        contractExtractorResult(result, label);
        // Should not crash, markdown may be empty or minimal
        assert.equal(typeof result.markdown, 'string');
      });
    }
  });

  describe('Malformed HTML', () => {
    it('unclosed tags', async () => {
      const html = '<html><body><p>Unclosed paragraph<div><span>Nested badly</p></div></span><h1>Heading without close</body>';
      const result = await extractContent(html, 'https://example.com/bad');
      contractExtractorResult(result, 'unclosed tags');
    });

    it('nested tables', async () => {
      const html = '<html><body><table><tr><td><table><tr><td>Inner cell</td></tr></table></td></tr></table><p>Extra content for extraction. Lorem ipsum dolor sit amet, consectetur adipiscing elit. More text to pad the content.</p></body></html>';
      const result = await extractContent(html, 'https://example.com/tables');
      contractExtractorResult(result, 'nested tables');
    });

    it('missing head element', async () => {
      const html = '<html><body><p>No head at all but has enough content. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.</p></body></html>';
      const result = await extractContent(html, 'https://example.com/nohead');
      contractExtractorResult(result, 'missing head');
    });

    it('only a script tag (no content)', async () => {
      const html = '<html><head></head><body><script>var x = 1;</script></body></html>';
      const result = await extractContent(html, 'https://example.com/scriptonly');
      contractExtractorResult(result, 'script only');
    });
  });

  describe('Unicode content', () => {
    it('Chinese characters (你好世界)', async () => {
      const html = '<html lang="zh"><head><title>中文测试</title></head><body><article><p>你好世界。这是一个中文内容的测试页面，用于验证提取器处理中文的能力。需要足够多的内容才能通过提取器的阈值检测。</p></article></body></html>';
      const result = await extractContent(html, 'https://example.com/chinese');
      contractExtractorResult(result, 'Chinese');
      assert.equal(result.metadata.language, 'zh');
    });

    it('Arabic characters (مرحبا) RTL', async () => {
      const html = '<html lang="ar" dir="rtl"><head><title>اختبار عربي</title></head><body><article><p>مرحبا بالعالم. هذه صفحة اختبار للمحتوى العربي. نحتاج إلى محتوى كافٍ لتمرير عتبة المستخرج وضمان عدم حدوث أي أعطال.</p></article></body></html>';
      const result = await extractContent(html, 'https://example.com/arabic');
      contractExtractorResult(result, 'Arabic');
      assert.equal(result.metadata.language, 'ar');
    });

    it('Emoji content (🚀🔥)', async () => {
      const html = '<html lang="en"><head><title>Emoji Test 🚀</title></head><body><article><p>This page has emoji: 🚀🔥💡✅ and lots of content to pass thresholds. The extractor should handle emoji gracefully without crashing or corrupting the output. Lorem ipsum dolor sit amet.</p></article></body></html>';
      const result = await extractContent(html, 'https://example.com/emoji');
      contractExtractorResult(result, 'Emoji');
      assert.ok(result.markdown.includes('🚀') || result.text.includes('🚀'), 'emoji should be preserved');
    });

    it('mixed RTL/LTR text', async () => {
      const html = '<html lang="en"><head><title>Mixed Direction</title></head><body><article><p>English text mixed with عربي and then back to English. Also some עברית Hebrew text. This must be long enough for extraction. Lorem ipsum dolor sit amet.</p></article></body></html>';
      const result = await extractContent(html, 'https://example.com/mixed');
      contractExtractorResult(result, 'mixed RTL/LTR');
    });
  });

  describe('Huge content (performance)', () => {
    it('100KB HTML does not crash or hang', { timeout: 5000 }, async () => {
      const paragraph = '<p>' + 'A'.repeat(500) + '</p>\n';
      const bigBody = paragraph.repeat(200); // ~100KB
      const html = `<html><head><title>Big Page</title></head><body><article>${bigBody}</article></body></html>`;
      assert.ok(html.length > 100_000, 'fixture should be >100KB');
      const result = await extractContent(html, 'https://example.com/big');
      contractExtractorResult(result, 'huge content');
    });
  });

  describe('HTML entities', () => {
    it('decodes &amp; &lt; &#x27; &nbsp;', () => {
      const html = '<p>Entities: &amp; &lt; &#x27; &nbsp; &gt; &quot;</p>';
      const md = htmlToMarkdown(html);
      assert.ok(md.includes('&'), 'should decode &amp;');
      assert.ok(md.includes('<'), 'should decode &lt;');
      assert.ok(md.includes("'"), 'should decode &#x27;');
    });
  });

  describe('Script / style stripping', () => {
    it('<script> content never appears in markdown', () => {
      const html = '<div><p>Visible text</p><script>const SECRET = "hidden_payload";</script></div>';
      const md = htmlToMarkdown(html);
      assert.ok(!md.includes('hidden_payload'), 'script content must be stripped');
      assert.ok(!md.includes('SECRET'), 'script variables must be stripped');
      assert.ok(md.includes('Visible text'), 'visible text should remain');
    });

    it('<style> content never appears in markdown', () => {
      const html = '<div><p>Visible content</p><style>.secret-class { color: red; display: none; }</style></div>';
      const md = htmlToMarkdown(html);
      assert.ok(!md.includes('secret-class'), 'style content must be stripped');
      assert.ok(!md.includes('display'), 'CSS properties must be stripped');
      assert.ok(md.includes('Visible content'), 'visible text should remain');
    });

    it('multiple scripts and styles are all stripped', () => {
      const html = `
        <div>
          <script>var a = 1;</script>
          <p>Keep this</p>
          <style>body { margin: 0; }</style>
          <script type="application/json">{"key":"value"}</script>
          <p>And this</p>
        </div>`;
      const md = htmlToMarkdown(html);
      assert.ok(!md.includes('var a'), 'first script stripped');
      assert.ok(!md.includes('margin'), 'style stripped');
      assert.ok(!md.includes('"key"'), 'json script stripped');
      assert.ok(md.includes('Keep this'));
      assert.ok(md.includes('And this'));
    });
  });

  describe('Deeply nested HTML', () => {
    it('50 levels of <div> nesting', async () => {
      let html = '<html><head><title>Deep</title></head><body>';
      for (let i = 0; i < 50; i++) html += '<div>';
      html += '<p>The deepest content that still needs to be found by the extractor. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Enough content here.</p>';
      for (let i = 0; i < 50; i++) html += '</div>';
      html += '</body></html>';

      const result = await extractContent(html, 'https://example.com/deep');
      contractExtractorResult(result, '50-level nesting');
      // Content should still be extractable
      assert.ok(result.markdown.includes('deepest content') || result.text.includes('deepest content'),
        'deep content should be extracted');
    });
  });

  describe('Multiple title/h1 tags', () => {
    it('handles multiple <title> tags', async () => {
      const html = '<html><head><title>First Title</title><title>Second Title</title></head><body><article><p>Content for extraction. Lorem ipsum dolor sit amet, consectetur adipiscing elit. More content padding here.</p></article></body></html>';
      const result = await extractContent(html, 'https://example.com/multititle');
      contractExtractorResult(result, 'multiple titles');
      // Should pick one, not crash
      assert.ok(result.metadata.title.length > 0, 'should have a title');
    });

    it('handles multiple <h1> tags', async () => {
      const html = '<html><head><title>Page</title></head><body><article><h1>First Heading</h1><h1>Second Heading</h1><p>Content for extraction. Lorem ipsum dolor sit amet, consectetur adipiscing elit. More content padding here for threshold.</p></article></body></html>';
      const result = await extractContent(html, 'https://example.com/multih1');
      contractExtractorResult(result, 'multiple h1s');
    });
  });

  describe('og:title vs <title> priority', () => {
    it('og:title takes precedence over <title>', () => {
      const { document: doc } = parseHTML(`<!DOCTYPE html><html><head>
        <title>Page Title</title>
        <meta property="og:title" content="OG Title">
      </head><body></body></html>`);
      const meta = extractMetadata(doc, 'https://example.com');
      assert.equal(meta.title, 'OG Title');
    });

    it('falls back to <title> when og:title missing', () => {
      const { document: doc } = parseHTML(`<!DOCTYPE html><html><head>
        <title>Fallback Title</title>
      </head><body></body></html>`);
      const meta = extractMetadata(doc, 'https://example.com');
      assert.equal(meta.title, 'Fallback Title');
    });

    it('falls back to <h1> when both og:title and <title> missing', () => {
      const { document: doc } = parseHTML(`<!DOCTYPE html><html><head></head><body><h1>H1 Title</h1></body></html>`);
      const meta = extractMetadata(doc, 'https://example.com');
      assert.equal(meta.title, 'H1 Title');
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. EDGE CASES — CAPTCHA DETECTION
// ════════════════════════════════════════════════════════════════════

describe('Captcha detection edge cases', () => {
  it('partial match: "cloudflare" in body text is NOT a challenge', () => {
    const html = `<html><head><title>Blog Post</title></head>
<body><article><p>We use cloudflare for our CDN infrastructure. It provides excellent performance and security features for our websites. This is just a normal article about web infrastructure.</p></article></body></html>`;
    // isChallengePage should not be triggered by casual mention
    assert.equal(isChallengePage(html), false, '"cloudflare" in article text should not trigger');
  });

  it('combined Turnstile AND reCAPTCHA detects first match', () => {
    const html = `<html><body>
      <div class="cf-turnstile" data-sitekey="0xTURNSTILE"></div>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
      <div class="g-recaptcha" data-sitekey="6LeRECAPTCHA"></div>
      <script src="https://www.google.com/recaptcha/api.js"></script>
    </body></html>`;
    const result = detectCaptcha(html);
    assert.ok(result, 'should detect a captcha');
    // Turnstile comes first in CAPTCHA_PATTERNS, so it should be detected first
    assert.equal(result.type, 'cloudflare-turnstile');
    assert.equal(result.siteKey, '0xTURNSTILE');
  });

  it('minified HTML: no whitespace, compressed patterns', () => {
    const html = '<html><head><title>Just a moment...</title></head><body><div id="challenge-running">Checking your browser</div><script>var cf_chl_opt={cType:"managed"}</script></body></html>';
    assert.equal(isChallengePage(html), true, 'should detect even in minified HTML');
    const captcha = detectCaptcha(html);
    assert.ok(captcha, 'detectCaptcha should find challenge');
    assert.equal(captcha.type, 'cloudflare-challenge');
  });

  it('case sensitivity: CF-TURNSTILE vs cf-turnstile', () => {
    const upper = '<div class="CF-TURNSTILE" data-sitekey="0xUPPER"></div>';
    const lower = '<div class="cf-turnstile" data-sitekey="0xLOWER"></div>';

    const rLower = detectCaptcha(lower);
    assert.ok(rLower, 'lowercase should be detected');
    assert.equal(rLower.type, 'cloudflare-turnstile');

    // The regex uses /i flag, so uppercase should also match
    const rUpper = detectCaptcha(upper);
    assert.ok(rUpper, 'uppercase should also be detected');
  });

  it('very large HTML (>200KB): isChallengePage returns fast', { timeout: 1000 }, () => {
    // Normal content page that's very large — should return false quickly
    let bigHtml = '<html><head><title>Huge Normal Page</title></head><body>';
    bigHtml += '<p>Normal content. </p>'.repeat(15000); // ~300KB
    bigHtml += '</body></html>';
    assert.ok(bigHtml.length > 200_000, 'fixture should be >200KB');

    const start = Date.now();
    const result = isChallengePage(bigHtml);
    const elapsed = Date.now() - start;
    // Should be fast (< 500ms even for large content)
    assert.ok(elapsed < 500, `isChallengePage took ${elapsed}ms — too slow`);
    assert.equal(result, false, 'large normal page should not be a challenge');
  });

  it('returns null for HTML with only recaptcha class but no patterns', () => {
    // A page mentioning recaptcha in text but not having actual widget markup
    const html = '<html><body><p>We solved the recaptcha problem using a novel approach. No actual widgets here.</p></body></html>';
    const result = detectCaptcha(html);
    assert.equal(result, null, 'text mention should not trigger detection');
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. ERROR PATH TESTS — HTTP CLIENT
// ════════════════════════════════════════════════════════════════════

describe('http-client error paths', () => {
  it('invalid URL (not a URL)', async () => {
    const result = await httpFetch('not-a-url-at-all');
    assert.equal(result.status, 0, 'should fail with status 0');
    assert.ok(result.error, 'should have error message');
  });

  it('DNS resolution failure (nonexistent domain)', async () => {
    const result = await httpFetch('https://this-domain-definitely-does-not-exist-xyz123.invalid/', { timeout: 5000 });
    assert.equal(result.status, 0);
    assert.ok(result.error, 'should report DNS error');
  });

  it('connection timeout with short timeout', async () => {
    // Use httpbin delay endpoint with a very short timeout
    const result = await httpFetch('https://httpbin.org/delay/10', { timeout: 1000 });
    assert.equal(result.status, 0);
    assert.equal(result.error, 'timeout');
  });

  it('invalid protocol (ftp://)', async () => {
    const result = await httpFetch('ftp://example.com/file');
    assert.equal(result.status, 0);
    assert.ok(result.error, 'should report error for ftp');
  });

  it('HTTP 500 response does not crash', async () => {
    const result = await httpFetch('https://httpbin.org/status/500', { timeout: 10000 });
    assert.equal(result.status, 500);
    assert.equal(typeof result.html, 'string');
  });

  it('result always has expected shape even on error', async () => {
    const result = await httpFetch('https://this-does-not-exist.invalid/', { timeout: 3000 });
    assert.equal(typeof result.status, 'number');
    assert.equal(typeof result.html, 'string');
    assert.ok(typeof result.headers === 'object');
    assert.equal(typeof result.needsBrowser, 'boolean');
    assert.equal(typeof result.blocked, 'boolean');
    assert.ok(typeof result.cookies === 'object');
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. RESOURCE MANAGEMENT TESTS
// ════════════════════════════════════════════════════════════════════

describe('Resource management', () => {
  describe('PolitenessEngine.reset()', () => {
    it('clears all state: domains, robots cache, active domains, waiters', async () => {
      const engine = new PolitenessEngine({ defaultDelay: 10 });

      // Add some state
      engine._getOrCreateDomain('a.com');
      engine._getOrCreateDomain('b.com');
      engine._robotsCache.set('a.com', { parser: null, fetchedAt: Date.now() });
      engine._activeDomains.add('a.com');

      // Verify state exists
      assert.ok(engine._domains.size > 0);
      assert.ok(engine._robotsCache.size > 0);
      assert.ok(engine._activeDomains.size > 0);

      engine.reset();

      assert.equal(engine._domains.size, 0, 'domains should be cleared');
      assert.equal(engine._robotsCache.size, 0, 'robots cache should be cleared');
      assert.equal(engine._activeDomains.size, 0, 'active domains should be cleared');
      assert.deepEqual(engine._domainWaiters, [], 'waiters should be cleared');
      assert.deepEqual(engine.getStats(), {}, 'stats should be empty');
    });
  });

  describe('SessionStore.clear()', () => {
    it('frees all cookie jars and warming state', async () => {
      const store = new SessionStore();
      await store.setCookies('a.com', ['x=1; Path=/']);
      await store.setCookies('b.com', ['y=2; Path=/']);
      store.markWarmed('a.com');
      store.markWarmed('b.com');

      assert.equal(store.size, 2);
      assert.equal(store.isWarmed('a.com'), true);

      store.clear();

      assert.equal(store.size, 0, 'jars should be cleared');
      assert.equal(store.isWarmed('a.com'), false, 'warming should be cleared');
      assert.equal(store.isWarmed('b.com'), false, 'warming should be cleared');
      const cookies = await store.getCookies('https://a.com/');
      assert.equal(cookies, '', 'cookies should be gone');
    });
  });

  describe('Engine.resetEngine()', () => {
    it('clears dedup cache and circuit breakers', async () => {
      // Use the module's resetEngine and verify via getEngineStats
      resetEngine();
      setPolitenessEngine(new PolitenessEngine({ defaultDelay: 50 }));

      // Create some state by crawling
      await crawl('https://httpbin.org/html', { maxTier: 1, timeout: 15000, respectRobots: false });
      const before = getEngineStats();
      assert.ok(before.dedupSize > 0, 'should have dedup entries');

      resetEngine();
      const after = getEngineStats();
      assert.equal(after.dedupSize, 0, 'dedup should be cleared');
      assert.deepEqual(after.circuitBreakers, {}, 'circuit breakers should be cleared');
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. SPECIAL CHARACTER TESTS (NullClaw-style)
// ════════════════════════════════════════════════════════════════════

describe('Special characters (NullClaw-style)', () => {
  describe('URLs with Unicode', () => {
    it('handles URL with Unicode path: https://example.com/日本語', async () => {
      // Should not crash when extracting, even if fetch fails
      const html = '<html><head><title>Japanese Page</title></head><body><p>Content here</p></body></html>';
      const result = await extractContent(html, 'https://example.com/日本語');
      contractExtractorResult(result, 'unicode URL');
    });

    it('handles URL with query params containing special chars', async () => {
      const html = '<html><head><title>Query Test</title></head><body><p>Content for query test</p></body></html>';
      const result = await extractContent(html, 'https://example.com/search?q=hello%20world&tag=café&emoji=🎉');
      contractExtractorResult(result, 'special query params');
    });
  });

  describe('HTML with null bytes', () => {
    it('handles null bytes in HTML without crashing', async () => {
      const html = '<html><head><title>Null Test</title></head><body><p>Before null\x00After null. Content padding to reach threshold. Lorem ipsum dolor sit amet.</p></body></html>';
      const result = await extractContent(html, 'https://example.com/null');
      contractExtractorResult(result, 'null bytes');
    });

    it('htmlToMarkdown handles null bytes', () => {
      const md = htmlToMarkdown('<p>Hello\x00World</p>');
      assert.equal(typeof md, 'string', 'should return a string');
    });
  });

  describe('Cookies with special characters', () => {
    it('stores and retrieves cookies with special values', async () => {
      const store = new SessionStore();
      await store.setCookies('special.com', [
        'data=hello%20world; Path=/',
        'encoded=a%3Db%26c%3Dd; Path=/',
      ]);
      const cookies = await store.getCookies('https://special.com/');
      assert.ok(cookies.includes('data=hello%20world'), 'URL-encoded cookie should persist');
    });

    it('setCookies handles empty/null cookie strings gracefully', async () => {
      const store = new SessionStore();
      // Should not throw
      await store.setCookies('safe.com', [null, undefined, '', 'valid=yes; Path=/']);
      const cookies = await store.getCookies('https://safe.com/');
      assert.ok(cookies.includes('valid=yes'), 'valid cookie should be stored');
    });
  });

  describe('extractMetadata with edge-case HTML', () => {
    it('handles meta tags with empty content', () => {
      const { document: doc } = parseHTML(`<!DOCTYPE html><html><head>
        <meta property="og:title" content="">
        <title>Actual Title</title>
      </head><body></body></html>`);
      const meta = extractMetadata(doc, 'https://example.com');
      // Empty og:title should fall through to <title>
      assert.ok(typeof meta.title === 'string');
    });

    it('handles no metadata at all', () => {
      const { document: doc } = parseHTML(`<!DOCTYPE html><html><head></head><body><p>Just text</p></body></html>`);
      const meta = extractMetadata(doc, 'https://example.com');
      assert.equal(typeof meta.title, 'string');
      assert.equal(typeof meta.author, 'string');
      assert.ok(Array.isArray(meta.images));
      assert.ok(Array.isArray(meta.links));
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// 8. ADDITIONAL SESSION-STORE EDGE CASES
// ════════════════════════════════════════════════════════════════════

describe('SessionStore additional edge cases', () => {
  it('domain normalisation: uppercase, leading dots, protocol', async () => {
    const store = new SessionStore();

    // Uppercase
    await store.setCookies('UPPER.COM', ['u=1; Path=/']);
    const upper = await store.getCookies('https://upper.com/');
    assert.ok(upper.includes('u=1'), 'uppercase domain should normalise');

    // Leading dot
    await store.setCookies('.dotted.com', ['d=1; Path=/']);
    const dotted = await store.getCookies('https://dotted.com/');
    assert.ok(dotted.includes('d=1'), 'leading dot should normalise');
  });

  it('serialise() and restore() round-trips warming state cookies', async () => {
    const store = new SessionStore();
    await store.setCookies('round.com', ['s=trip; Path=/']);
    store.markWarmed('round.com');

    const data = await store.serialise();
    const restored = new SessionStore();
    await restored.restore(data);

    const cookies = await restored.getCookies('https://round.com/');
    assert.ok(cookies.includes('s=trip'), 'cookies should survive round-trip');
    // Note: warming state is NOT serialised (by design), so it won't persist
  });

  it('restore() handles null/undefined/corrupt gracefully', async () => {
    const store = new SessionStore();
    await store.restore(null);
    assert.equal(store.size, 0);

    await store.restore(undefined);
    assert.equal(store.size, 0);

    await store.restore({ 'bad.com': 'not-a-jar' });
    // Should not crash, just skip corrupt entries
    assert.equal(store.size, 0);
  });

  it('getJar returns same jar on subsequent calls', () => {
    const store = new SessionStore();
    const jar1 = store.getJar('same.com');
    const jar2 = store.getJar('same.com');
    assert.equal(jar1, jar2, 'should return same jar instance');
  });

  it('clearDomain only clears the targeted domain', async () => {
    const store = new SessionStore();
    await store.setCookies('keep.com', ['k=1; Path=/']);
    await store.setCookies('remove.com', ['r=1; Path=/']);
    store.markWarmed('keep.com');
    store.markWarmed('remove.com');

    store.clearDomain('remove.com');

    assert.ok((await store.getCookies('https://keep.com/')).includes('k=1'), 'keep.com should remain');
    assert.equal(await store.getCookies('https://remove.com/'), '', 'remove.com should be gone');
    assert.equal(store.isWarmed('keep.com'), true, 'keep.com warming should remain');
    assert.equal(store.isWarmed('remove.com'), false, 'remove.com warming should be gone');
  });

  it('hasCloudflareBot detects __cf_bm cookie', async () => {
    const store = new SessionStore();
    await store.setCookies('cf.com', ['__cf_bm=botcookie; Path=/']);
    const has = await store.hasCloudflareBot('cf.com');
    assert.equal(has, true);
  });

  it('hasCloudflareBot returns false without __cf_bm', async () => {
    const store = new SessionStore();
    await store.setCookies('clean.com', ['session=abc; Path=/']);
    const has = await store.hasCloudflareBot('clean.com');
    assert.equal(has, false);
  });
});

// ════════════════════════════════════════════════════════════════════
// 9. HTMLTOMARKDOWN EDGE CASES
// ════════════════════════════════════════════════════════════════════

describe('htmlToMarkdown edge cases', () => {
  it('handles empty tags gracefully', () => {
    const md = htmlToMarkdown('<p></p><h1></h1><div></div>');
    assert.equal(typeof md, 'string');
  });

  it('preserves relative URLs without baseUrl', () => {
    const md = htmlToMarkdown('<a href="/relative">Link</a>');
    assert.ok(md.includes('[Link]'), 'link text should be present');
  });

  it('handles deeply nested formatting', () => {
    const md = htmlToMarkdown('<p><strong><em>Bold and italic</em></strong></p>');
    assert.ok(md.includes('Bold and italic'));
  });

  it('handles figure with figcaption', () => {
    const md = htmlToMarkdown('<figure><img src="https://example.com/img.jpg" alt="photo"><figcaption>A photo caption</figcaption></figure>');
    assert.ok(md.includes('A photo caption') || md.includes('photo'));
    assert.ok(md.includes('https://example.com/img.jpg'));
  });

  it('handles empty table', () => {
    const md = htmlToMarkdown('<table></table>');
    assert.equal(typeof md, 'string');
  });

  it('handles table with only headers', () => {
    const md = htmlToMarkdown('<table><tr><th>Col A</th><th>Col B</th></tr></table>');
    assert.ok(md.includes('Col A'));
  });

  it('handles br tags', () => {
    const md = htmlToMarkdown('<p>Line one<br>Line two</p>');
    assert.ok(md.includes('Line one'));
    assert.ok(md.includes('Line two'));
  });

  it('handles del/strikethrough', () => {
    const md = htmlToMarkdown('<del>deleted text</del>');
    assert.ok(md.includes('~~deleted text~~'));
  });

  it('handles nested lists', () => {
    const md = htmlToMarkdown('<ul><li>Top<ul><li>Nested</li></ul></li></ul>');
    assert.ok(md.includes('Top'));
    assert.ok(md.includes('Nested'));
  });
});

// ════════════════════════════════════════════════════════════════════
// 10. POLITENESS ENGINE EDGE CASES
// ════════════════════════════════════════════════════════════════════

describe('PolitenessEngine edge cases', () => {
  it('_getOrCreateDomain creates state with correct defaults', () => {
    const engine = new PolitenessEngine({ defaultDelay: 500 });
    const state = engine._getOrCreateDomain('new.com');
    assert.equal(state.delay, 500);
    assert.equal(state.baseDelay, 500);
    assert.equal(state.consecutiveFails, 0);
    assert.equal(state.lastRequestAt, 0);
    assert.deepEqual(state.responseTimes, []);
  });

  it('exponential backoff on consecutive 429s', () => {
    const engine = new PolitenessEngine({ defaultDelay: 100 });
    const state = engine._getOrCreateDomain('back.com');

    engine.recordResponse('back.com', 429, 100);
    assert.equal(state.consecutiveFails, 1);
    const backoff1 = state.backoffUntil;

    engine.recordResponse('back.com', 429, 100);
    assert.equal(state.consecutiveFails, 2);
    // Second backoff should be longer
    assert.ok(state.backoffUntil >= backoff1, 'backoff should increase');

    // Reset on success
    engine.recordResponse('back.com', 200, 100);
    assert.equal(state.consecutiveFails, 0);
    assert.equal(state.backoffUntil, 0);
  });

  it('503 also triggers backoff', () => {
    const engine = new PolitenessEngine({ defaultDelay: 100 });
    engine._getOrCreateDomain('srv.com');
    engine.recordResponse('srv.com', 503, 100);
    const stats = engine.getStats();
    assert.equal(stats['srv.com'].consecutiveFails, 1);
  });

  it('getStats returns correct shape', () => {
    const engine = new PolitenessEngine();
    engine._getOrCreateDomain('test.com');
    engine.recordResponse('test.com', 200, 150);

    const stats = engine.getStats();
    assert.ok('test.com' in stats);
    assert.equal(typeof stats['test.com'].delay, 'number');
    assert.equal(typeof stats['test.com'].consecutiveFails, 'number');
    assert.equal(typeof stats['test.com'].avgResponseTime, 'number');
    assert.equal(typeof stats['test.com'].isActive, 'boolean');
  });
});
