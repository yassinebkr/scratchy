/**
 * captcha.js — CAPTCHA detection and solving for Scratchy v2 crawler
 *
 * Detects Cloudflare Turnstile, Cloudflare challenge pages, hCaptcha,
 * reCAPTCHA v2, and reCAPTCHA v3. Provides solving strategies via
 * auto-solve wait, external API services, or graceful fallback.
 *
 * @module crawler/captcha
 */

// ─── Detection patterns ─────────────────────────────────────────────────────

/**
 * @typedef {Object} CaptchaInfo
 * @property {string} type - CAPTCHA type identifier
 * @property {boolean} detected - Always true when returned
 * @property {string|null} selector - CSS selector to locate the CAPTCHA element
 * @property {string} [siteKey] - Site key if detected (for API solvers)
 */

/**
 * @typedef {Object} CaptchaPattern
 * @property {string} type - CAPTCHA type identifier
 * @property {string|null} selector - CSS selector for the CAPTCHA element
 * @property {RegExp[]} htmlPatterns - Patterns to search in raw HTML
 * @property {function} [extractSiteKey] - Optional function to extract site key from HTML
 */

/** @type {CaptchaPattern[]} */
const CAPTCHA_PATTERNS = [
  {
    type: 'cloudflare-turnstile',
    selector: '.cf-turnstile, [data-sitekey][class*="turnstile"]',
    htmlPatterns: [
      /class\s*=\s*["'][^"']*cf-turnstile/i,
      /challenges\.cloudflare\.com\/turnstile/i,
      /cdn-cgi\/challenge-platform/i,
    ],
    extractSiteKey: (html) => {
      const m = html.match(/data-sitekey\s*=\s*["']([^"']+)["']/i);
      return m?.[1] || null;
    },
  },
  {
    type: 'cloudflare-challenge',
    selector: '#challenge-form, #challenge-running',
    htmlPatterns: [
      /cf_chl_opt\s*=/i,
      /Checking your browser/i,
      /Just a moment\.\.\./i,
      /Enable JavaScript and cookies to continue/i,
      /<title>\s*Just a moment\s*<\/title>/i,
      /cdn-cgi\/challenge-platform\/h\/[bg]\//i,
      /_cf_chl_tk/i,
    ],
  },
  {
    type: 'hcaptcha',
    selector: '.h-captcha, [data-sitekey][class*="hcaptcha"]',
    htmlPatterns: [
      /class\s*=\s*["'][^"']*h-captcha/i,
      /hcaptcha\.com\/1\/api\.js/i,
      /js\.hcaptcha\.com/i,
    ],
    extractSiteKey: (html) => {
      const m = html.match(/class\s*=\s*["'][^"']*h-captcha["'][^>]*data-sitekey\s*=\s*["']([^"']+)/i)
        || html.match(/data-sitekey\s*=\s*["']([^"']+)["'][^>]*class\s*=\s*["'][^"']*h-captcha/i);
      return m?.[1] || null;
    },
  },
  {
    type: 'recaptcha-v2',
    selector: '.g-recaptcha, [data-sitekey][class*="g-recaptcha"]',
    htmlPatterns: [
      /class\s*=\s*["'][^"']*g-recaptcha(?!.*invisible)/i,
      /google\.com\/recaptcha\/api2?\.(js|enterprise)/i,
      /recaptcha\/api\/siteverify/i,
    ],
    extractSiteKey: (html) => {
      const m = html.match(/class\s*=\s*["'][^"']*g-recaptcha["'][^>]*data-sitekey\s*=\s*["']([^"']+)/i)
        || html.match(/data-sitekey\s*=\s*["']([^"']+)["'][^>]*class\s*=\s*["'][^"']*g-recaptcha/i);
      return m?.[1] || null;
    },
  },
  {
    type: 'recaptcha-v3',
    selector: null, // v3 is invisible — no visible element
    htmlPatterns: [
      /grecaptcha\.execute\s*\(/i,
      /recaptcha\/api\.js\?.*render=/i,
      /g-recaptcha-badge/i,
      /class\s*=\s*["'][^"']*g-recaptcha[^"']*["'][^>]*data-size\s*=\s*["']invisible/i,
    ],
    extractSiteKey: (html) => {
      const m = html.match(/grecaptcha\.execute\s*\(\s*["']([^"']+)["']/i)
        || html.match(/render=([A-Za-z0-9_-]+)/i);
      return m?.[1] || null;
    },
  },
];

// ─── Challenge page patterns (fast check) ───────────────────────────────────

/** Patterns that indicate the page is a challenge/block page, not real content. */
const CHALLENGE_PATTERNS = [
  // Cloudflare
  /cf_chl_opt\s*=/i,
  /<title>\s*Just a moment\s*<\/title>/i,
  /Checking your browser/i,
  /challenges\.cloudflare\.com/i,
  /cdn-cgi\/challenge-platform/i,
  // Cloudflare WAF block
  /Attention Required!\s*\|\s*Cloudflare/i,
  /Sorry, you have been blocked/i,
  // PerimeterX / HUMAN
  /px-captcha/i,
  /Access to this page has been denied/i,
  // Akamai
  /akam\/13\//i,
  // DataDome
  /dd\.datadome\.(co|com)/i,
  // Generic bot block
  /blocked by.*security/i,
  /unusual traffic from your computer/i,
  /enable JavaScript.*cookies/i,
];

// ─── Detection API ──────────────────────────────────────────────────────────

/**
 * Detect CAPTCHA presence in an HTML page.
 *
 * Scans raw HTML against known patterns for Cloudflare Turnstile,
 * Cloudflare challenge pages, hCaptcha, reCAPTCHA v2, and reCAPTCHA v3.
 *
 * @param {string} html - Raw HTML string to scan
 * @param {string} [url=''] - Page URL (for context, currently unused but reserved)
 * @returns {CaptchaInfo|null} CAPTCHA info if detected, null otherwise
 *
 * @example
 * ```js
 * const captcha = detectCaptcha(html, 'https://example.com');
 * if (captcha) {
 *   console.log(`Found ${captcha.type} CAPTCHA`);
 *   // → { type: 'cloudflare-turnstile', detected: true, selector: '.cf-turnstile', siteKey: '0x...' }
 * }
 * ```
 */
export function detectCaptcha(html, url = '') {
  if (!html || typeof html !== 'string') return null;

  for (const pattern of CAPTCHA_PATTERNS) {
    const matched = pattern.htmlPatterns.some(re => re.test(html));
    if (matched) {
      const info = {
        type: pattern.type,
        detected: true,
        selector: pattern.selector,
      };

      // Try to extract site key if extractor is available
      if (pattern.extractSiteKey) {
        const siteKey = pattern.extractSiteKey(html);
        if (siteKey) info.siteKey = siteKey;
      }

      return info;
    }
  }

  return null;
}

/**
 * Quick check if a page is a challenge/block page (not real content).
 *
 * This is faster than full CAPTCHA detection — just checks for known
 * challenge page indicators. Use this to decide whether to escalate
 * to browser tier.
 *
 * @param {string} html - Raw HTML string
 * @returns {boolean} True if the page appears to be a challenge or block page
 *
 * @example
 * ```js
 * if (isChallengePage(html)) {
 *   // Escalate to browser tier or CAPTCHA solver
 * }
 * ```
 */
export function isChallengePage(html) {
  if (!html || typeof html !== 'string') return false;

  // Quick heuristic: challenge pages are usually small
  // Real content pages are almost always > 5KB
  // (But don't rely on this alone — some API responses are small)
  const isSmall = html.length < 50000;

  // Check patterns
  for (const pattern of CHALLENGE_PATTERNS) {
    if (pattern.test(html)) {
      // For large pages, require stronger signals
      if (!isSmall) {
        // Only Cloudflare challenge-specific patterns should match on large pages
        if (pattern.source.includes('cf_chl_opt') ||
            pattern.source.includes('Just a moment') ||
            pattern.source.includes('challenge-platform')) {
          return true;
        }
        continue;
      }
      return true;
    }
  }

  return false;
}

// ─── Solving API ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} SolveResult
 * @property {boolean} solved - Whether the CAPTCHA was successfully solved
 * @property {string} [token] - CAPTCHA solution token (if solved via API)
 * @property {string} [method] - Method used to solve ('auto', 'api', 'none')
 * @property {number} [elapsed] - Time taken in milliseconds
 * @property {string} [error] - Error message if solving failed
 */

/**
 * @typedef {Object} SolveOptions
 * @property {string} [solverApiKey] - API key for solving service
 * @property {string} [solverService='2captcha'] - Service to use ('2captcha' or 'capsolver')
 * @property {number} [timeout=30000] - Timeout in milliseconds
 */

/**
 * Attempt to solve a CAPTCHA on a Playwright page.
 *
 * Strategy cascade:
 * 1. Wait for auto-solve (Cloudflare Turnstile non-interactive often auto-passes in 5-10s)
 * 2. Use external API solver (2Captcha/CapSolver) if API key is configured
 * 3. Return { solved: false } if no solver is available
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {CaptchaInfo} captchaInfo - Detection result from detectCaptcha()
 * @param {SolveOptions} [opts={}] - Solving options
 * @returns {Promise<SolveResult>}
 *
 * @example
 * ```js
 * const captcha = detectCaptcha(html, url);
 * if (captcha) {
 *   const result = await solveCaptcha(page, captcha, {
 *     solverApiKey: process.env.CAPTCHA_API_KEY,
 *     solverService: '2captcha',
 *     timeout: 30000,
 *   });
 *   if (result.solved) {
 *     // Page should now be accessible — re-fetch content
 *   }
 * }
 * ```
 */
export async function solveCaptcha(page, captchaInfo, opts = {}) {
  const {
    solverApiKey = null,
    solverService = '2captcha',
    timeout = 30000,
  } = opts;

  const start = Date.now();

  // ── Strategy 1: Auto-solve (wait for challenge to pass) ──────────────
  // Cloudflare Turnstile non-interactive and some challenge pages auto-resolve
  if (captchaInfo.type === 'cloudflare-turnstile' || captchaInfo.type === 'cloudflare-challenge') {
    const result = await waitForAutoSolve(page, captchaInfo, Math.min(timeout, 15000));
    if (result.solved) {
      return { ...result, elapsed: Date.now() - start };
    }
  }

  // For other CAPTCHA types, brief auto-solve attempt (some sites auto-dismiss)
  if (captchaInfo.type !== 'cloudflare-turnstile' && captchaInfo.type !== 'cloudflare-challenge') {
    const result = await waitForAutoSolve(page, captchaInfo, Math.min(timeout, 5000));
    if (result.solved) {
      return { ...result, elapsed: Date.now() - start };
    }
  }

  // ── Strategy 2: API solver ───────────────────────────────────────────
  if (solverApiKey && captchaInfo.siteKey) {
    const remaining = timeout - (Date.now() - start);
    if (remaining > 5000) {
      try {
        const result = await solveWithApi(page, captchaInfo, {
          apiKey: solverApiKey,
          service: solverService,
          timeout: remaining,
        });
        if (result.solved) {
          return { ...result, elapsed: Date.now() - start };
        }
      } catch (err) {
        // API solver failed — fall through to strategy 3
        return {
          solved: false,
          method: 'api',
          elapsed: Date.now() - start,
          error: `API solver error: ${err.message}`,
        };
      }
    }
  }

  // ── Strategy 3: No solver available ──────────────────────────────────
  return {
    solved: false,
    method: 'none',
    elapsed: Date.now() - start,
    error: solverApiKey
      ? 'API solver failed or timed out'
      : 'No CAPTCHA solver configured (set solverApiKey)',
  };
}

// ─── Auto-solve (wait for challenge to pass) ────────────────────────────────

/**
 * Wait for a CAPTCHA to auto-solve (Cloudflare challenges often pass automatically).
 *
 * Monitors the page for navigation or CAPTCHA element disappearance.
 *
 * @param {import('playwright').Page} page
 * @param {CaptchaInfo} captchaInfo
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<SolveResult>}
 * @private
 */
async function waitForAutoSolve(page, captchaInfo, timeout) {
  const start = Date.now();

  try {
    // For Cloudflare challenges, wait for navigation (challenge redirects on success)
    if (captchaInfo.type === 'cloudflare-challenge') {
      try {
        await page.waitForNavigation({ timeout, waitUntil: 'domcontentloaded' });
        // Check if we're past the challenge
        const html = await page.content();
        if (!isChallengePage(html)) {
          return { solved: true, method: 'auto', elapsed: Date.now() - start };
        }
      } catch {
        // Navigation timeout — challenge didn't auto-pass
      }
    }

    // For Turnstile, try clicking the checkbox if present and wait
    if (captchaInfo.type === 'cloudflare-turnstile') {
      try {
        // Turnstile renders in an iframe
        const frame = page.frames().find(f =>
          f.url().includes('challenges.cloudflare.com')
        );
        if (frame) {
          // Try clicking the checkbox
          const checkbox = await frame.$('input[type="checkbox"]');
          if (checkbox) {
            await checkbox.click();
          }
        }
      } catch {
        // Ignore click errors — may already be solving
      }

      // Wait and check if solved
      await sleep(Math.min(timeout - (Date.now() - start), 8000));

      // Check if challenge is gone
      const html = await page.content();
      if (!isChallengePage(html) && !detectCaptcha(html)?.type?.includes('cloudflare')) {
        return { solved: true, method: 'auto', elapsed: Date.now() - start };
      }
    }

    // For other types, wait briefly and check if CAPTCHA element is gone
    if (captchaInfo.selector) {
      const remaining = Math.max(0, timeout - (Date.now() - start));
      if (remaining > 0) {
        try {
          await page.waitForSelector(captchaInfo.selector, {
            state: 'detached',
            timeout: remaining,
          });
          return { solved: true, method: 'auto', elapsed: Date.now() - start };
        } catch {
          // Selector still present — not auto-solved
        }
      }
    }
  } catch {
    // Any error during auto-solve — not critical
  }

  return { solved: false, method: 'auto', elapsed: Date.now() - start };
}

// ─── API-based solving ──────────────────────────────────────────────────────

/**
 * Solve CAPTCHA using an external API service (2Captcha or CapSolver).
 *
 * @param {import('playwright').Page} page
 * @param {CaptchaInfo} captchaInfo
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.service - '2captcha' or 'capsolver'
 * @param {number} opts.timeout
 * @returns {Promise<SolveResult>}
 * @private
 */
async function solveWithApi(page, captchaInfo, { apiKey, service, timeout }) {
  const pageUrl = page.url();

  if (service === 'capsolver') {
    return solveWithCapSolver(pageUrl, captchaInfo, apiKey, timeout);
  }

  // Default: 2Captcha
  return solveWith2Captcha(pageUrl, captchaInfo, apiKey, timeout);
}

/**
 * Solve via 2Captcha API.
 * @param {string} pageUrl
 * @param {CaptchaInfo} captchaInfo
 * @param {string} apiKey
 * @param {number} timeout
 * @returns {Promise<SolveResult>}
 * @private
 */
async function solveWith2Captcha(pageUrl, captchaInfo, apiKey, timeout) {
  const typeMap = {
    'cloudflare-turnstile': 'turnstile',
    'hcaptcha': 'hcaptcha',
    'recaptcha-v2': 'userrecaptcha',
    'recaptcha-v3': 'userrecaptcha',
  };

  const method = typeMap[captchaInfo.type];
  if (!method) {
    return { solved: false, method: 'api', error: `Unsupported CAPTCHA type for 2Captcha: ${captchaInfo.type}` };
  }

  // Submit task
  const params = new URLSearchParams({
    key: apiKey,
    method,
    sitekey: captchaInfo.siteKey || '',
    pageurl: pageUrl,
    json: '1',
  });

  if (captchaInfo.type === 'recaptcha-v3') {
    params.set('version', 'v3');
    params.set('action', 'verify');
    params.set('min_score', '0.5');
  }

  const submitRes = await fetch(`https://2captcha.com/in.php?${params}`);
  const submitData = await submitRes.json();

  if (submitData.status !== 1) {
    return { solved: false, method: 'api', error: `2Captcha submit error: ${submitData.request}` };
  }

  const taskId = submitData.request;

  // Poll for result
  const pollStart = Date.now();
  const pollInterval = 5000;

  while (Date.now() - pollStart < timeout) {
    await sleep(pollInterval);

    const resultRes = await fetch(
      `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`
    );
    const resultData = await resultRes.json();

    if (resultData.status === 1) {
      return { solved: true, method: 'api', token: resultData.request };
    }

    if (resultData.request !== 'CAPCHA_NOT_READY') {
      return { solved: false, method: 'api', error: `2Captcha error: ${resultData.request}` };
    }
  }

  return { solved: false, method: 'api', error: '2Captcha timeout' };
}

/**
 * Solve via CapSolver API.
 * @param {string} pageUrl
 * @param {CaptchaInfo} captchaInfo
 * @param {string} apiKey
 * @param {number} timeout
 * @returns {Promise<SolveResult>}
 * @private
 */
async function solveWithCapSolver(pageUrl, captchaInfo, apiKey, timeout) {
  const typeMap = {
    'cloudflare-turnstile': 'AntiTurnstileTaskProxyLess',
    'hcaptcha': 'HCaptchaTaskProxyLess',
    'recaptcha-v2': 'ReCaptchaV2TaskProxyLess',
    'recaptcha-v3': 'ReCaptchaV3TaskProxyLess',
  };

  const taskType = typeMap[captchaInfo.type];
  if (!taskType) {
    return { solved: false, method: 'api', error: `Unsupported CAPTCHA type for CapSolver: ${captchaInfo.type}` };
  }

  const task = {
    type: taskType,
    websiteURL: pageUrl,
    websiteKey: captchaInfo.siteKey || '',
  };

  if (captchaInfo.type === 'recaptcha-v3') {
    task.pageAction = 'verify';
    task.minScore = 0.5;
  }

  // Create task
  const createRes = await fetch('https://api.capsolver.com/createTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey: apiKey, task }),
  });
  const createData = await createRes.json();

  if (createData.errorId && createData.errorId !== 0) {
    return { solved: false, method: 'api', error: `CapSolver error: ${createData.errorDescription}` };
  }

  const taskId = createData.taskId;
  if (!taskId) {
    // Some tasks return solution immediately
    if (createData.solution?.token) {
      return { solved: true, method: 'api', token: createData.solution.token };
    }
    return { solved: false, method: 'api', error: 'CapSolver: no task ID returned' };
  }

  // Poll for result
  const pollStart = Date.now();
  const pollInterval = 3000;

  while (Date.now() - pollStart < timeout) {
    await sleep(pollInterval);

    const resultRes = await fetch('https://api.capsolver.com/getTaskResult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    });
    const resultData = await resultRes.json();

    if (resultData.status === 'ready') {
      const token = resultData.solution?.token
        || resultData.solution?.gRecaptchaResponse
        || resultData.solution?.text;
      if (token) {
        return { solved: true, method: 'api', token };
      }
    }

    if (resultData.status === 'failed') {
      return { solved: false, method: 'api', error: `CapSolver failed: ${resultData.errorDescription}` };
    }
  }

  return { solved: false, method: 'api', error: 'CapSolver timeout' };
}

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 * @private
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}
