/**
 * @module browser-pool
 * @description Playwright browser pool with stealth patches.
 *
 * Manages a bounded pool of reusable browser contexts so that multiple
 * concurrent page fetches don't each spin up their own browser.  Every
 * context is warmed (visits a neutral page to build a cookie jar) and
 * patched with stealth evasion scripts before it's handed out.
 *
 * Usage:
 * ```js
 * import { BrowserPool } from './browser-pool.js';
 *
 * const pool = new BrowserPool({ maxContexts: 3 });
 * const html = await pool.fetchWithBrowser('https://example.com', {
 *   waitFor: '#content',
 *   timeout: 15_000,
 * });
 * await pool.close();
 * ```
 */

import { chromium } from 'playwright';
import { applyStealthPatches } from './stealth.js';
import { getRandomProfile, getHeadersForProfile } from './profiles.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default Chromium launch flags for stealth. */
const DEFAULT_LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--disable-default-apps',
  '--disable-background-networking',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-default-browser-check',
];

/** How long a context may sit idle in the pool before being closed (ms). */
const IDLE_TTL_MS = 60_000;

/** Neutral warm-up URL (builds first-party cookies & TLS session). */
const WARM_URL = 'https://www.google.com';

// ---------------------------------------------------------------------------
// Pool entry bookkeeping
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PoolEntry
 * @property {import('playwright').BrowserContext} context
 * @property {import('./profiles.js').BrowserProfile} profile
 * @property {boolean} inUse
 * @property {NodeJS.Timeout|null} idleTimer
 * @property {string|undefined} proxy
 */

// ---------------------------------------------------------------------------
// BrowserPool
// ---------------------------------------------------------------------------

/**
 * Bounded pool of stealth-patched Playwright browser contexts.
 */
export class BrowserPool {
  /** @type {import('playwright').Browser|null} */
  #browser = null;

  /** @type {PoolEntry[]} */
  #entries = [];

  /** @type {number} */
  #maxContexts;

  /** @type {boolean} */
  #headless;

  /** @type {Function[]} Queue of resolve callbacks waiting for a free slot. */
  #waitQueue = [];

  /** @type {boolean} */
  #closed = false;

  /**
   * @param {object} [opts]
   * @param {number} [opts.maxContexts=3]  - Max concurrent browser contexts.
   * @param {boolean} [opts.headless=true] - Run headless (set false + Xvfb to dodge headless detection).
   */
  constructor(opts = {}) {
    this.#maxContexts = opts.maxContexts ?? 3;
    this.#headless = opts.headless ?? true;
  }

  // -----------------------------------------------------------------------
  // Browser lifecycle
  // -----------------------------------------------------------------------

  /**
   * Lazily launch the Chromium browser instance.
   * @returns {Promise<import('playwright').Browser>}
   */
  async #ensureBrowser() {
    if (this.#browser && this.#browser.isConnected()) return this.#browser;

    try {
      this.#browser = await chromium.launch({
        headless: this.#headless,
        args: DEFAULT_LAUNCH_ARGS,
      });
    } catch (err) {
      if (
        err.message?.includes('Executable doesn') ||
        err.message?.includes('browserType.launch') ||
        err.message?.includes('ENOENT')
      ) {
        throw new Error(
          'Playwright browsers are not installed. Run `npx playwright install chromium` first.\n' +
            `Original error: ${err.message}`,
        );
      }
      throw err;
    }

    return this.#browser;
  }

  // -----------------------------------------------------------------------
  // Context creation / warming
  // -----------------------------------------------------------------------

  /**
   * Create a fresh browser context with stealth patches applied.
   *
   * @param {object} [opts]
   * @param {string} [opts.userAgent]
   * @param {string} [opts.proxy]
   * @param {{width:number, height:number}} [opts.viewport]
   * @returns {Promise<PoolEntry>}
   */
  async #createEntry(opts = {}) {
    const browser = await this.#ensureBrowser();
    const profile = getRandomProfile('chrome');

    // Allow caller overrides.
    if (opts.userAgent) profile.userAgent = opts.userAgent;

    /** @type {import('playwright').BrowserContextOptions} */
    const ctxOpts = {
      userAgent: profile.userAgent,
      viewport: opts.viewport ?? {
        width: profile.screenWidth,
        height: profile.screenHeight,
      },
      locale: profile.languages[0],
      timezoneId: profile.timezone,
      deviceScaleFactor: profile.devicePixelRatio,
      extraHTTPHeaders: getHeadersForProfile(profile),
      // Bypass CSP so our init-scripts aren't blocked.
      bypassCSP: true,
    };

    if (opts.proxy) {
      // Per-context proxy requires a fresh browser in Playwright.
      // We re-use the shared browser for non-proxy contexts, but for proxy
      // contexts we need a separate browser.  To keep things simple and
      // bounded, proxy contexts still count toward #maxContexts.
      // NOTE: Playwright only supports per-browser proxy, not per-context.
      // A pragmatic workaround: launch a second browser for proxy contexts.
      // For now we keep it simple: proxy goes through the shared browser's
      // environment proxy.  Full per-context proxy isolation is a future
      // enhancement.  Callers should set HTTP_PROXY / HTTPS_PROXY env vars.
    }

    const context = await browser.newContext(ctxOpts);

    // Apply stealth patches to every new page created in this context.
    context.on('page', async (page) => {
      try {
        await applyStealthPatches(page, profile);
      } catch {
        // If the page is already closed the patch fails silently.
      }
    });

    // Warm the context: visit a neutral page to build cookies / TLS state.
    const warmPage = await context.newPage();
    await applyStealthPatches(warmPage, profile);
    try {
      await warmPage.goto(WARM_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 10_000,
      });
    } catch {
      // Warm-up is best-effort — don't fail the whole acquire.
    }
    await warmPage.close();

    /** @type {PoolEntry} */
    const entry = {
      context,
      profile,
      inUse: false,
      idleTimer: null,
      proxy: opts.proxy,
    };

    this.#entries.push(entry);
    return entry;
  }

  // -----------------------------------------------------------------------
  // Idle management
  // -----------------------------------------------------------------------

  /**
   * Start the idle timer for an entry.  If the timer fires the context is
   * destroyed to free resources.
   */
  #startIdleTimer(entry) {
    this.#clearIdleTimer(entry);
    entry.idleTimer = setTimeout(async () => {
      if (!entry.inUse) {
        await this.#destroyEntry(entry);
      }
    }, IDLE_TTL_MS);
  }

  /** Cancel a running idle timer. */
  #clearIdleTimer(entry) {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // Entry destruction
  // -----------------------------------------------------------------------

  /**
   * Destroy a single pool entry, closing its context.
   * @param {PoolEntry} entry
   */
  async #destroyEntry(entry) {
    this.#clearIdleTimer(entry);
    const idx = this.#entries.indexOf(entry);
    if (idx !== -1) this.#entries.splice(idx, 1);
    try {
      await entry.context.close();
    } catch {
      // Already closed — ignore.
    }
  }

  // -----------------------------------------------------------------------
  // Public API: acquire / release
  // -----------------------------------------------------------------------

  /**
   * Acquire a browser context from the pool (or create a new one if the
   * pool isn't full yet).  Returns a `{ context, profile, page }` bundle.
   *
   * If all slots are occupied the call awaits until one is freed.
   *
   * @param {object} [opts]
   * @param {string} [opts.userAgent]
   * @param {string} [opts.proxy]
   * @param {{width:number, height:number}} [opts.viewport]
   * @returns {Promise<{context: import('playwright').BrowserContext, profile: import('./profiles.js').BrowserProfile, page: import('playwright').Page}>}
   */
  async acquire(opts = {}) {
    if (this.#closed) throw new Error('BrowserPool is closed');

    // 1. Try to reuse an idle entry (matching proxy if requested).
    let entry = this.#entries.find(
      (e) => !e.inUse && (e.proxy ?? null) === (opts.proxy ?? null),
    );

    // 2. If none free, create a new one if under the limit.
    if (!entry && this.#entries.length < this.#maxContexts) {
      entry = await this.#createEntry(opts);
    }

    // 3. If still nothing, wait for a release.
    if (!entry) {
      await new Promise((resolve) => this.#waitQueue.push(resolve));
      // After being woken we retry.
      return this.acquire(opts);
    }

    this.#clearIdleTimer(entry);
    entry.inUse = true;

    // Open a fresh page in the context.
    const page = await entry.context.newPage();
    await applyStealthPatches(page, entry.profile);

    return { context: entry.context, profile: entry.profile, page };
  }

  /**
   * Return a context to the pool so it can be reused.
   *
   * All open pages in the context are closed to keep it clean for the
   * next consumer.
   *
   * @param {import('playwright').BrowserContext} context
   */
  async release(context) {
    const entry = this.#entries.find((e) => e.context === context);
    if (!entry) return; // Already destroyed.

    // Close all pages to reset state.
    for (const page of context.pages()) {
      try {
        await page.close();
      } catch {
        // Ignore.
      }
    }

    entry.inUse = false;
    this.#startIdleTimer(entry);

    // Wake up one waiter if any.
    const waiter = this.#waitQueue.shift();
    if (waiter) waiter();
  }

  // -----------------------------------------------------------------------
  // Public API: fetchWithBrowser  (full lifecycle helper)
  // -----------------------------------------------------------------------

  /**
   * Full-lifecycle browser fetch: acquire context → navigate → wait →
   * extract HTML → (optional screenshot) → release.
   *
   * @param {string} url - URL to navigate to.
   * @param {object} [opts]
   * @param {string}  [opts.waitFor]    - CSS selector to wait for after load.
   * @param {number}  [opts.timeout=30000] - Navigation timeout in ms.
   * @param {boolean} [opts.screenshot]  - If true, capture a screenshot buffer.
   * @param {string}  [opts.userAgent]
   * @param {string}  [opts.proxy]
   * @param {{width:number, height:number}} [opts.viewport]
   * @returns {Promise<{html: string, url: string, status: number|null, screenshot?: Buffer, profile: import('./profiles.js').BrowserProfile}>}
   */
  async fetchWithBrowser(url, opts = {}) {
    const timeout = opts.timeout ?? 30_000;
    const { context, profile, page } = await this.acquire({
      userAgent: opts.userAgent,
      proxy: opts.proxy,
      viewport: opts.viewport,
    });

    try {
      // Navigate.
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      // Optional: wait for a specific selector.
      if (opts.waitFor) {
        await page.waitForSelector(opts.waitFor, {
          timeout: Math.min(timeout, 15_000),
        });
      }

      // Small extra settle time for lazy-loaded content.
      await page.waitForTimeout(500);

      // Extract HTML.
      const html = await page.content();
      const status = response?.status() ?? null;

      // Optional screenshot.
      let screenshot;
      if (opts.screenshot) {
        screenshot = await page.screenshot({ fullPage: true, type: 'png' });
      }

      return { html, url: page.url(), status, screenshot, profile };
    } catch (err) {
      // If the page crashed, destroy the context rather than returning it.
      await this.#destroyEntry(
        this.#entries.find((e) => e.context === context) ?? { context, idleTimer: null },
      );
      throw err;
    } finally {
      // Release only if the entry still exists (wasn't destroyed above).
      if (this.#entries.some((e) => e.context === context)) {
        await this.release(context);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /**
   * Gracefully shut down the pool: close all contexts and the browser.
   */
  async close() {
    this.#closed = true;

    // Reject all waiters.
    for (const waiter of this.#waitQueue) {
      waiter(); // They'll get an error on the next acquire() call.
    }
    this.#waitQueue = [];

    // Destroy all entries.
    await Promise.all(
      [...this.#entries].map((e) => this.#destroyEntry(e)),
    );

    // Close the browser.
    if (this.#browser) {
      try {
        await this.#browser.close();
      } catch {
        // Ignore.
      }
      this.#browser = null;
    }
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  /**
   * Return pool status for logging / monitoring.
   * @returns {{total: number, inUse: number, idle: number, max: number}}
   */
  get stats() {
    const inUse = this.#entries.filter((e) => e.inUse).length;
    return {
      total: this.#entries.length,
      inUse,
      idle: this.#entries.length - inUse,
      max: this.#maxContexts,
    };
  }
}
