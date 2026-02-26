/**
 * @fileoverview Politeness engine — rate limiting, robots.txt respect, and adaptive throttling.
 *
 * Ensures the crawler is a good citizen:
 * - Per-domain request queuing with configurable delay (default 2s)
 * - robots.txt parsing and caching (1h TTL)
 * - Adaptive throttling based on server response times
 * - Exponential backoff on 429/503 responses
 * - Concurrent domain limit (max 5 simultaneously)
 *
 * @module crawler/politeness
 */

import robotsParser from 'robots-parser';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_DELAY_MS = 2000;
const ROBOTS_TTL_MS = 60 * 60 * 1000;        // 1 hour
const SLOW_RESPONSE_THRESHOLD_MS = 3000;       // double delay if response > 3s
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60_000;
const MAX_CONCURRENT_DOMAINS = 5;
const DEFAULT_USER_AGENT = 'ScratchyBot/2.0';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extract domain (host) from a URL string.
 * @param {string} url
 * @returns {string}
 */
function domainOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Sleep for `ms` milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/*  DomainState — per-domain bookkeeping                               */
/* ------------------------------------------------------------------ */

/**
 * Internal per-domain state.
 * @typedef {Object} DomainState
 * @property {number} delay           Current inter-request delay (ms)
 * @property {number} baseDelay       Configured base delay (ms)
 * @property {number} lastRequestAt   Timestamp of last completed request
 * @property {number} consecutiveFails Count of consecutive 429/503 responses
 * @property {number} backoffUntil    Timestamp until which requests are paused
 * @property {Promise<void>|null} queue  Chain of pending requests (serial queue)
 * @property {number[]} responseTimes  Recent response times for adaptive throttling
 */

/* ------------------------------------------------------------------ */
/*  RobotsCache                                                        */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} RobotsCacheEntry
 * @property {object} parser   robots-parser instance
 * @property {number} fetchedAt  Timestamp when fetched
 */

/* ------------------------------------------------------------------ */
/*  PolitenessEngine                                                   */
/* ------------------------------------------------------------------ */

/**
 * Rate-limiting, robots.txt, and adaptive throttling engine.
 *
 * @example
 * ```js
 * const politeness = new PolitenessEngine({ defaultDelay: 2000 });
 *
 * if (await politeness.canFetch(url)) {
 *   await politeness.waitForSlot(domainOf(url));
 *   const res = await fetch(url);
 *   politeness.recordResponse(domainOf(url), res.status, elapsed);
 * }
 * ```
 */
export class PolitenessEngine {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.defaultDelay=2000]       Base delay between requests to same domain (ms)
   * @param {number} [opts.maxConcurrentDomains=5]  Max domains being fetched simultaneously
   * @param {string} [opts.userAgent='ScratchyBot/2.0']  User-agent for robots.txt checks
   * @param {number} [opts.robotsTTL=3600000]       How long to cache robots.txt (ms)
   */
  constructor(opts = {}) {
    /** @type {number} */
    this.defaultDelay = opts.defaultDelay ?? DEFAULT_DELAY_MS;

    /** @type {number} */
    this.maxConcurrentDomains = opts.maxConcurrentDomains ?? MAX_CONCURRENT_DOMAINS;

    /** @type {string} */
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;

    /** @type {number} */
    this.robotsTTL = opts.robotsTTL ?? ROBOTS_TTL_MS;

    /** @type {Map<string, DomainState>} */
    this._domains = new Map();

    /** @type {Map<string, RobotsCacheEntry>} */
    this._robotsCache = new Map();

    /** @type {Set<string>} */
    this._activeDomains = new Set();

    /** @type {Array<{domain: string, resolve: Function}>} */
    this._domainWaiters = [];
  }

  /* -------------------------------------------------------------- */
  /*  robots.txt                                                     */
  /* -------------------------------------------------------------- */

  /**
   * Check whether `url` is allowed by the target's robots.txt.
   *
   * Fetches and caches robots.txt per domain (TTL = 1 hour).
   * If robots.txt cannot be fetched (network error, 4xx/5xx), we assume allowed
   * (fail-open — standard crawler behavior per RFC 9309 §2.4).
   *
   * @param {string} url  The URL to check
   * @returns {Promise<boolean>}  `true` if fetching is allowed
   */
  async canFetch(url) {
    const domain = domainOf(url);
    const cached = this._robotsCache.get(domain);

    if (cached && Date.now() - cached.fetchedAt < this.robotsTTL) {
      return cached.parser.isAllowed(url, this.userAgent) !== false;
    }

    // Fetch robots.txt
    const origin = new URL(url).origin;
    const robotsUrl = `${origin}/robots.txt`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': this.userAgent },
        redirect: 'follow',
      });
      clearTimeout(timeout);

      let robotsTxt = '';
      if (res.ok) {
        robotsTxt = await res.text();
      }

      const parser = robotsParser(robotsUrl, robotsTxt);

      // Respect Crawl-delay directive if present
      const crawlDelay = parser.getCrawlDelay(this.userAgent);
      if (crawlDelay && crawlDelay > 0) {
        const state = this._getOrCreateDomain(domain);
        const crawlDelayMs = crawlDelay * 1000;
        // Use the larger of our default or the site's directive
        state.baseDelay = Math.max(state.baseDelay, crawlDelayMs);
        state.delay = Math.max(state.delay, crawlDelayMs);
      }

      this._robotsCache.set(domain, {
        parser,
        fetchedAt: Date.now(),
      });

      return parser.isAllowed(url, this.userAgent) !== false;
    } catch (err) {
      // Fetch failed — fail open (allow)
      // Cache a permissive parser so we don't retry every request
      const parser = robotsParser(robotsUrl, '');
      this._robotsCache.set(domain, {
        parser,
        fetchedAt: Date.now(),
      });
      return true;
    }
  }

  /* -------------------------------------------------------------- */
  /*  Rate limiting / slot management                                */
  /* -------------------------------------------------------------- */

  /**
   * Wait until a request slot is available for `domain`.
   *
   * Enforces:
   * 1. Max concurrent domains (waits if at capacity)
   * 2. Per-domain delay (waits since last request)
   * 3. Backoff period (if domain is in backoff from 429/503)
   *
   * Call this BEFORE making a request. Pair with {@link recordResponse} after.
   *
   * @param {string} domain  Hostname, e.g. 'example.com'
   * @returns {Promise<void>}  Resolves when it's safe to send the request
   */
  async waitForSlot(domain) {
    // 1. Concurrent domain limit
    await this._acquireDomainSlot(domain);

    // 2. Serial queue per domain — ensures only one in-flight at a time
    const state = this._getOrCreateDomain(domain);
    const previous = state.queue ?? Promise.resolve();

    let resolveGate;
    state.queue = new Promise(r => { resolveGate = r; });

    // Wait for the previous request in this domain's queue
    await previous;

    // 3. Backoff check
    const now = Date.now();
    if (state.backoffUntil > now) {
      await sleep(state.backoffUntil - now);
    }

    // 4. Inter-request delay
    const elapsed = Date.now() - state.lastRequestAt;
    if (elapsed < state.delay) {
      await sleep(state.delay - elapsed);
    }

    // Mark request start — the caller should call recordResponse() to release the gate
    state._resolveGate = resolveGate;
  }

  /**
   * Record a completed response for adaptive throttling.
   *
   * MUST be called after every request that was preceded by {@link waitForSlot},
   * even if the request failed.
   *
   * @param {string} domain        Hostname
   * @param {number} statusCode    HTTP status code (0 for network errors)
   * @param {number} responseTimeMs  How long the request took
   */
  recordResponse(domain, statusCode, responseTimeMs = 0) {
    const state = this._getOrCreateDomain(domain);
    state.lastRequestAt = Date.now();

    // Release the serial queue gate
    if (state._resolveGate) {
      state._resolveGate();
      state._resolveGate = null;
    }

    // Handle 429 / 503 — exponential backoff
    if (statusCode === 429 || statusCode === 503) {
      state.consecutiveFails++;
      const backoff = Math.min(
        BACKOFF_BASE_MS * Math.pow(2, state.consecutiveFails - 1),
        BACKOFF_MAX_MS
      );
      state.backoffUntil = Date.now() + backoff;
      return;
    }

    // Success — reset failure counter
    state.consecutiveFails = 0;
    state.backoffUntil = 0;

    // Adaptive throttling — track response times
    if (responseTimeMs > 0) {
      state.responseTimes.push(responseTimeMs);
      // Keep last 10 measurements
      if (state.responseTimes.length > 10) {
        state.responseTimes.shift();
      }

      const avgResponse = state.responseTimes.reduce((a, b) => a + b, 0) / state.responseTimes.length;

      if (avgResponse > SLOW_RESPONSE_THRESHOLD_MS) {
        // Server is slow — double the delay (up to 30s)
        state.delay = Math.min(state.delay * 2, 30_000);
      } else if (state.delay > state.baseDelay && avgResponse < SLOW_RESPONSE_THRESHOLD_MS / 2) {
        // Server recovered — gradually reduce delay back toward base
        state.delay = Math.max(state.baseDelay, Math.floor(state.delay * 0.75));
      }
    }
  }

  /**
   * Release a domain slot when completely done with it.
   * Called automatically when recording responses, but can be called
   * manually for cleanup on aborted requests.
   *
   * @param {string} domain
   */
  releaseDomain(domain) {
    const state = this._getOrCreateDomain(domain);
    // Release gate if still held
    if (state._resolveGate) {
      state._resolveGate();
      state._resolveGate = null;
    }
  }

  /* -------------------------------------------------------------- */
  /*  Domain state helpers                                           */
  /* -------------------------------------------------------------- */

  /**
   * Get or create the per-domain state object.
   * @param {string} domain
   * @returns {DomainState}
   * @private
   */
  _getOrCreateDomain(domain) {
    let state = this._domains.get(domain);
    if (!state) {
      state = {
        delay: this.defaultDelay,
        baseDelay: this.defaultDelay,
        lastRequestAt: 0,
        consecutiveFails: 0,
        backoffUntil: 0,
        queue: null,
        _resolveGate: null,
        responseTimes: [],
      };
      this._domains.set(domain, state);
    }
    return state;
  }

  /**
   * Acquire a slot in the concurrent-domains pool.
   * If the domain is already active, this is a no-op.
   * If we're at capacity, waits until a slot frees up.
   *
   * @param {string} domain
   * @returns {Promise<void>}
   * @private
   */
  async _acquireDomainSlot(domain) {
    // Already active — no new slot needed
    if (this._activeDomains.has(domain)) return;

    // Room available
    if (this._activeDomains.size < this.maxConcurrentDomains) {
      this._activeDomains.add(domain);
      return;
    }

    // At capacity — wait for a slot
    return new Promise(resolve => {
      this._domainWaiters.push({ domain, resolve });
    });
  }

  /**
   * Mark a domain as inactive and wake any waiters.
   * Call when you're completely done with a domain (e.g., batch finished).
   *
   * @param {string} domain
   */
  deactivateDomain(domain) {
    if (!this._activeDomains.has(domain)) return;
    this._activeDomains.delete(domain);

    // Wake the next waiter, if any
    if (this._domainWaiters.length > 0) {
      const waiter = this._domainWaiters.shift();
      this._activeDomains.add(waiter.domain);
      waiter.resolve();
    }
  }

  /* -------------------------------------------------------------- */
  /*  Stats / diagnostics                                            */
  /* -------------------------------------------------------------- */

  /**
   * Get current status of all tracked domains.
   * Useful for debugging and monitoring.
   *
   * @returns {Object<string, {delay: number, consecutiveFails: number, backoffUntil: number, avgResponseTime: number}>}
   */
  getStats() {
    const stats = {};
    for (const [domain, state] of this._domains) {
      const avg = state.responseTimes.length > 0
        ? state.responseTimes.reduce((a, b) => a + b, 0) / state.responseTimes.length
        : 0;
      stats[domain] = {
        delay: state.delay,
        consecutiveFails: state.consecutiveFails,
        backoffUntil: state.backoffUntil > Date.now() ? state.backoffUntil - Date.now() : 0,
        avgResponseTime: Math.round(avg),
        isActive: this._activeDomains.has(domain),
      };
    }
    return stats;
  }

  /**
   * Clear all state. Useful for testing.
   */
  reset() {
    this._domains.clear();
    this._robotsCache.clear();
    this._activeDomains.clear();
    this._domainWaiters = [];
  }
}
