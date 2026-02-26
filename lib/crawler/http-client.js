/**
 * @fileoverview TLS-aware HTTP fetcher for the crawler pipeline (Tier 1).
 *
 * Uses Node.js 22 built-in fetch() as the primary transport, with realistic
 * browser header profiles to reduce fingerprint-based blocking.
 *
 * Key features:
 * - Realistic header ordering for Chrome, Firefox, Safari profiles
 * - Cookie jar support (pass cookies in, get cookies out)
 * - Redirect following (max 5 hops)
 * - Timeout support
 * - JS-required page detection (small body / challenge patterns)
 * - Anti-bot block detection (403 + known patterns)
 *
 * @module crawler/http-client
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const JS_REQUIRED_MIN_SIZE = 1024;   // bytes — responses smaller than this are suspicious

/**
 * Known patterns indicating JS is required to render the page.
 * @type {RegExp[]}
 */
const JS_CHALLENGE_PATTERNS = [
  /Please enable JavaScript/i,
  /You need to enable JavaScript/i,
  /<noscript>/i,
  /challenge-platform/i,                    // Cloudflare Turnstile
  /cf-challenge/i,                          // Cloudflare challenge page
  /cdn-cgi\/challenge-platform/i,           // Cloudflare challenge JS
  /_cf_chl_opt/i,                           // Cloudflare challenge config
  /window\.__CF\$cv\$params/i,             // Cloudflare JS challenge
  /Checking your browser/i,                 // Generic JS challenge
  /Verifying you are human/i,               // Cloudflare interstitial
  /Just a moment\.\.\./i,                   // Cloudflare "Just a moment"
  /Attention Required/i,                    // Cloudflare block page
  /Pardon Our Interruption/i,              // Akamai
  /Access to this page has been denied/i,   // PerimeterX
  /press & hold/i,                          // PerimeterX challenge
];

/**
 * Known anti-bot block patterns in 403 response bodies.
 * @type {RegExp[]}
 */
const BLOCK_PATTERNS = [
  /Access Denied/i,
  /Request blocked/i,
  /bot detected/i,
  /automated access/i,
  /suspicious activity/i,
  /rate limit/i,
  /too many requests/i,
  /captcha/i,
  /blocked by.*security/i,
  /web application firewall/i,
  /waf.*block/i,
  /distil.*networks/i,                      // Distil/Imperva
  /perimeterx/i,
  /datadome/i,
  /kasada/i,
  /shape.*security/i,
];

/* ------------------------------------------------------------------ */
/*  Header Profiles                                                    */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} HeaderProfile
 * @property {string} userAgent
 * @property {Record<string, string>} headers  Ordered headers (object insertion order = send order)
 */

/**
 * Realistic browser header profiles.
 * Header ORDER matters for fingerprinting — these match real browser network stacks.
 *
 * @type {Record<string, () => Record<string, string>>}
 */
const HEADER_PROFILES = {
  chrome: (url) => ({
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-US,en;q=0.9',
    'Priority': 'u=0, i',
  }),

  firefox: (url) => ({
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/png,image/svg+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'DNT': '1',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Priority': 'u=0, i',
    'TE': 'trailers',
  }),

  safari: (url) => ({
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
  }),
};

/** @type {string[]} */
const PROFILE_NAMES = Object.keys(HEADER_PROFILES);

/* ------------------------------------------------------------------ */
/*  Cookie helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Serialize a cookie map into a Cookie header string.
 * @param {Record<string, string>} cookies
 * @returns {string}
 */
function serializeCookies(cookies) {
  if (!cookies || typeof cookies !== 'object') return '';
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

/**
 * Parse Set-Cookie headers from a response into a simple key→value map.
 * Only extracts name=value, ignoring attributes (Path, Domain, Expires, etc.)
 *
 * @param {Headers} headers  Fetch API Headers object
 * @returns {Record<string, string>}
 */
function parseSetCookies(headers) {
  const cookies = {};
  // getSetCookie() returns an array of raw Set-Cookie values (Node 22+)
  const raw = headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const eqIdx = line.indexOf('=');
    if (eqIdx < 1) continue;
    const name = line.slice(0, eqIdx).trim();
    // Value runs until first ';' (which starts attributes)
    const rest = line.slice(eqIdx + 1);
    const semiIdx = rest.indexOf(';');
    const value = semiIdx >= 0 ? rest.slice(0, semiIdx).trim() : rest.trim();
    cookies[name] = value;
  }
  return cookies;
}

/* ------------------------------------------------------------------ */
/*  Main fetcher                                                       */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} HttpFetchResult
 * @property {number}  status        HTTP status code
 * @property {string}  html          Response body as text
 * @property {Record<string, string>} headers  Selected response headers
 * @property {string|null} redirectUrl  Final URL after redirects (null if no redirect)
 * @property {boolean} needsBrowser  True if page appears to require JS rendering
 * @property {boolean} blocked       True if response looks like an anti-bot block
 * @property {Record<string, string>} cookies  Cookies received (Set-Cookie parsed)
 */

/**
 * Fetch a URL with realistic browser headers and anti-detection heuristics.
 *
 * @param {string} url  The URL to fetch
 * @param {Object} [opts]
 * @param {string}  [opts.profile='chrome']  Header profile: 'chrome' | 'firefox' | 'safari'
 * @param {number}  [opts.timeout=15000]     Request timeout in ms
 * @param {Record<string, string>} [opts.cookies]  Cookies to send (name→value map)
 * @param {Record<string, string>} [opts.headers]  Additional/override headers
 * @param {string}  [opts.proxy]             Proxy URL (not yet implemented — placeholder)
 * @param {number}  [opts.maxRedirects=5]    Maximum redirect hops
 * @returns {Promise<HttpFetchResult>}
 */
export async function httpFetch(url, opts = {}) {
  const {
    profile = 'chrome',
    timeout = DEFAULT_TIMEOUT_MS,
    cookies: inCookies = null,
    headers: extraHeaders = null,
    maxRedirects = MAX_REDIRECTS,
  } = opts;

  // Build headers from profile
  const profileFn = HEADER_PROFILES[profile] ?? HEADER_PROFILES.chrome;
  const baseHeaders = profileFn(url);

  // Merge extra headers (overrides profile headers)
  const mergedHeaders = { ...baseHeaders };
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      mergedHeaders[k] = v;
    }
  }

  // Add cookies
  if (inCookies && Object.keys(inCookies).length > 0) {
    mergedHeaders['Cookie'] = serializeCookies(inCookies);
  }

  // Follow redirects manually to track the final URL
  let currentUrl = url;
  let redirectCount = 0;
  let finalResponse = null;
  /** @type {Record<string, string>} */
  let collectedCookies = { ...(inCookies || {}) };

  while (redirectCount <= maxRedirects) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: mergedHeaders,
        signal: controller.signal,
        redirect: 'manual',   // Handle redirects ourselves
      });
      clearTimeout(timer);

      // Collect cookies from this response
      const newCookies = parseSetCookies(response.headers);
      Object.assign(collectedCookies, newCookies);

      // Check for redirect (3xx)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          // Redirect without Location — treat as final
          finalResponse = response;
          break;
        }

        // Resolve relative URLs
        currentUrl = new URL(location, currentUrl).href;
        redirectCount++;

        // Update Cookie header for next hop
        if (Object.keys(collectedCookies).length > 0) {
          mergedHeaders['Cookie'] = serializeCookies(collectedCookies);
        }

        // Consume the body to free resources
        await response.text().catch(() => {});
        continue;
      }

      finalResponse = response;
      break;
    } catch (err) {
      clearTimeout(timer);

      if (err.name === 'AbortError') {
        return {
          status: 0,
          html: '',
          headers: {},
          redirectUrl: currentUrl !== url ? currentUrl : null,
          needsBrowser: false,
          blocked: false,
          cookies: collectedCookies,
          error: 'timeout',
        };
      }

      return {
        status: 0,
        html: '',
        headers: {},
        redirectUrl: null,
        needsBrowser: false,
        blocked: false,
        cookies: collectedCookies,
        error: err.message,
      };
    }
  }

  // Too many redirects
  if (!finalResponse) {
    return {
      status: 0,
      html: '',
      headers: {},
      redirectUrl: currentUrl,
      needsBrowser: false,
      blocked: false,
      cookies: collectedCookies,
      error: `Too many redirects (>${maxRedirects})`,
    };
  }

  // Read body
  let html = '';
  try {
    html = await finalResponse.text();
  } catch (err) {
    html = '';
  }

  // Extract selected response headers
  const responseHeaders = {};
  for (const key of ['content-type', 'content-length', 'server', 'x-powered-by', 'cache-control', 'etag', 'last-modified']) {
    const val = finalResponse.headers.get(key);
    if (val) responseHeaders[key] = val;
  }

  const redirectUrl = currentUrl !== url ? currentUrl : null;

  // Detect JS-required pages
  const needsBrowser = detectJsRequired(finalResponse.status, html);

  // Detect anti-bot blocks
  const blocked = detectBlock(finalResponse.status, html);

  return {
    status: finalResponse.status,
    html,
    headers: responseHeaders,
    redirectUrl,
    needsBrowser,
    blocked,
    cookies: collectedCookies,
  };
}

/* ------------------------------------------------------------------ */
/*  Detection heuristics                                               */
/* ------------------------------------------------------------------ */

/**
 * Detect if a page requires JavaScript to render meaningful content.
 *
 * Heuristics:
 * 1. Response body is suspiciously small (<1KB) for a 200 response
 * 2. Body matches known JS-challenge / Cloudflare challenge patterns
 *
 * @param {number} status  HTTP status code
 * @param {string} html    Response body
 * @returns {boolean}
 */
function detectJsRequired(status, html) {
  // Only check 200 OK or 403 (challenge pages often return 403)
  if (status !== 200 && status !== 403) return false;

  // Small body heuristic — most real pages are >1KB
  if (status === 200 && html.length > 0 && html.length < JS_REQUIRED_MIN_SIZE) {
    // Could be a tiny valid page, so also check for <script> tags
    if (/<script/i.test(html)) return true;
  }

  // Pattern matching
  for (const pattern of JS_CHALLENGE_PATTERNS) {
    if (pattern.test(html)) return true;
  }

  return false;
}

/**
 * Detect if a response is an anti-bot block.
 *
 * @param {number} status  HTTP status code
 * @param {string} html    Response body
 * @returns {boolean}
 */
function detectBlock(status, html) {
  // 403 + known block pattern
  if (status === 403) {
    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.test(html)) return true;
    }
  }

  // 429 is always a rate-limit block
  if (status === 429) return true;

  return false;
}

/* ------------------------------------------------------------------ */
/*  Utility exports                                                    */
/* ------------------------------------------------------------------ */

/**
 * Get a random browser profile name.
 * Weighted: Chrome 60%, Firefox 25%, Safari 15%
 *
 * @returns {string}
 */
export function randomProfile() {
  const r = Math.random();
  if (r < 0.60) return 'chrome';
  if (r < 0.85) return 'firefox';
  return 'safari';
}

/**
 * Get the list of available profile names.
 * @returns {string[]}
 */
export function getProfileNames() {
  return [...PROFILE_NAMES];
}
