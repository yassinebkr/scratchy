/**
 * session-store.js — Cookie and session persistence for Scratchy v2 crawler
 *
 * Provides per-domain cookie storage using tough-cookie CookieJar,
 * session warming tracking, and Cloudflare cookie detection.
 *
 * @module crawler/session-store
 */

import { CookieJar, Cookie } from 'tough-cookie';

/**
 * Per-domain cookie storage and session management.
 *
 * Features:
 * - Per-domain CookieJar instances (in-memory)
 * - Set/get cookies compatible with HTTP headers
 * - Cloudflare cf_clearance detection
 * - Session warming tracking
 * - Automatic cookie expiry (handled by tough-cookie)
 *
 * @example
 * ```js
 * const store = new SessionStore();
 * await store.setCookies('example.com', ['session=abc123; Path=/; HttpOnly']);
 * const cookieHeader = await store.getCookies('https://example.com/page');
 * // → 'session=abc123'
 * ```
 */
export class SessionStore {
  constructor() {
    /**
     * Map of domain → CookieJar.
     * @type {Map<string, CookieJar>}
     * @private
     */
    this._jars = new Map();

    /**
     * Set of warmed domains.
     * @type {Map<string, number>}
     * @private
     */
    this._warmed = new Map();

    /**
     * Warming TTL in milliseconds (default: 30 minutes).
     * After this period, a domain is considered "cold" again.
     * @type {number}
     */
    this.warmingTtl = 30 * 60 * 1000;
  }

  /**
   * Get or create a CookieJar for a domain.
   *
   * @param {string} domain - Domain name (e.g. 'example.com')
   * @returns {CookieJar} The cookie jar for this domain
   */
  getJar(domain) {
    const key = this._normaliseDomain(domain);
    if (!this._jars.has(key)) {
      this._jars.set(key, new CookieJar());
    }
    return this._jars.get(key);
  }

  /**
   * Store cookies from Set-Cookie headers for a domain.
   *
   * @param {string} domain - Domain name (e.g. 'example.com')
   * @param {string|string[]} cookies - One or more Set-Cookie header values
   * @returns {Promise<void>}
   *
   * @example
   * ```js
   * await store.setCookies('example.com', [
   *   'session=abc; Path=/; HttpOnly',
   *   'cf_clearance=xyz; Path=/; Secure'
   * ]);
   * ```
   */
  async setCookies(domain, cookies) {
    const jar = this.getJar(domain);
    const cookieList = Array.isArray(cookies) ? cookies : [cookies];
    const url = `https://${this._normaliseDomain(domain)}/`;

    for (const cookieStr of cookieList) {
      if (!cookieStr || typeof cookieStr !== 'string') continue;
      try {
        await jar.setCookie(cookieStr, url);
      } catch {
        // Skip malformed cookies silently
      }
    }
  }

  /**
   * Get the Cookie header value for a URL.
   * Returns a string suitable for the Cookie HTTP header.
   *
   * @param {string} url - Full URL to get cookies for
   * @returns {Promise<string>} Cookie header value (e.g. 'session=abc; token=xyz')
   *
   * @example
   * ```js
   * const header = await store.getCookies('https://example.com/api/data');
   * // → 'session=abc123; cf_clearance=xyz'
   * ```
   */
  async getCookies(url) {
    let domain;
    try {
      domain = new URL(url).hostname;
    } catch {
      return '';
    }

    const jar = this.getJar(domain);
    try {
      return await jar.getCookieString(url);
    } catch {
      return '';
    }
  }

  /**
   * Get all Cookie objects for a URL (full tough-cookie Cookie instances).
   *
   * @param {string} url - Full URL to get cookies for
   * @returns {Promise<Cookie[]>} Array of Cookie objects
   */
  async getCookieObjects(url) {
    let domain;
    try {
      domain = new URL(url).hostname;
    } catch {
      return [];
    }

    const jar = this.getJar(domain);
    try {
      return await jar.getCookies(url);
    } catch {
      return [];
    }
  }

  /**
   * Clear all cookies for a domain.
   *
   * @param {string} domain - Domain name to clear cookies for
   */
  clearDomain(domain) {
    const key = this._normaliseDomain(domain);
    this._jars.delete(key);
    this._warmed.delete(key);
  }

  /**
   * Check if we have a valid Cloudflare cf_clearance cookie for a domain.
   * This cookie is required to bypass Cloudflare's bot protection after
   * solving a challenge.
   *
   * @param {string} domain - Domain name to check
   * @returns {Promise<boolean>} True if a valid cf_clearance cookie exists
   *
   * @example
   * ```js
   * if (await store.hasCloudflare('example.com')) {
   *   // Can skip browser challenge — reuse existing clearance
   * }
   * ```
   */
  async hasCloudflare(domain) {
    const key = this._normaliseDomain(domain);
    const jar = this.getJar(key);
    const url = `https://${key}/`;

    try {
      const cookies = await jar.getCookies(url);
      return cookies.some(c => c.key === 'cf_clearance' && !this._isExpired(c));
    } catch {
      return false;
    }
  }

  /**
   * Check if a Cloudflare __cf_bm cookie exists for a domain.
   * This is Cloudflare's bot management cookie (shorter-lived than cf_clearance).
   *
   * @param {string} domain - Domain name to check
   * @returns {Promise<boolean>}
   */
  async hasCloudflareBot(domain) {
    const key = this._normaliseDomain(domain);
    const jar = this.getJar(key);
    const url = `https://${key}/`;

    try {
      const cookies = await jar.getCookies(url);
      return cookies.some(c => c.key === '__cf_bm' && !this._isExpired(c));
    } catch {
      return false;
    }
  }

  /**
   * Mark a domain as "warmed" (homepage visited, cookies established).
   * Session warming prevents direct deep-link access which triggers bot detection.
   *
   * @param {string} domain - Domain name
   */
  markWarmed(domain) {
    const key = this._normaliseDomain(domain);
    this._warmed.set(key, Date.now());
  }

  /**
   * Check if a domain has been warmed recently (within warmingTtl).
   *
   * @param {string} domain - Domain name
   * @returns {boolean} True if the domain was warmed within the TTL
   *
   * @example
   * ```js
   * if (!store.isWarmed('example.com')) {
   *   // Visit homepage first to build cookie jar
   *   await warmSession('https://example.com');
   *   store.markWarmed('example.com');
   * }
   * ```
   */
  isWarmed(domain) {
    const key = this._normaliseDomain(domain);
    const warmedAt = this._warmed.get(key);
    if (!warmedAt) return false;
    if (Date.now() - warmedAt > this.warmingTtl) {
      this._warmed.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get a summary of all stored domains and their cookie counts.
   * Useful for debugging and monitoring.
   *
   * @returns {Promise<Array<{ domain: string, cookieCount: number, warmed: boolean, hasCloudflare: boolean }>>}
   */
  async getSummary() {
    const summary = [];
    for (const [domain, jar] of this._jars) {
      const url = `https://${domain}/`;
      let cookieCount = 0;
      let hasCf = false;
      try {
        const cookies = await jar.getCookies(url);
        cookieCount = cookies.length;
        hasCf = cookies.some(c => c.key === 'cf_clearance');
      } catch { /* ignore */ }

      summary.push({
        domain,
        cookieCount,
        warmed: this.isWarmed(domain),
        hasCloudflare: hasCf,
      });
    }
    return summary;
  }

  /**
   * Get total number of tracked domains.
   * @returns {number}
   */
  get size() {
    return this._jars.size;
  }

  /**
   * Clear all stored data (cookies + warming state).
   */
  clear() {
    this._jars.clear();
    this._warmed.clear();
  }

  /**
   * Serialise all cookies to a plain object for persistence.
   * Can be restored later with {@link SessionStore#restore}.
   *
   * @returns {Promise<Object<string, Object>>} Map of domain → serialised jar
   */
  async serialise() {
    const data = {};
    for (const [domain, jar] of this._jars) {
      try {
        data[domain] = await jar.serialize();
      } catch { /* skip */ }
    }
    return data;
  }

  /**
   * Restore cookies from a previously serialised state.
   *
   * @param {Object<string, Object>} data - Output of {@link SessionStore#serialise}
   * @returns {Promise<void>}
   */
  async restore(data) {
    if (!data || typeof data !== 'object') return;
    for (const [domain, serialised] of Object.entries(data)) {
      try {
        const jar = await CookieJar.deserialize(serialised);
        this._jars.set(domain, jar);
      } catch { /* skip corrupt entries */ }
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Normalise a domain name: lowercase, strip leading dots/www.
   * @param {string} domain
   * @returns {string}
   * @private
   */
  _normaliseDomain(domain) {
    if (!domain) return '';
    let d = domain.toLowerCase().trim();
    // Strip protocol if accidentally included
    if (d.includes('://')) {
      try { d = new URL(d).hostname; } catch { /* use as-is */ }
    }
    // Strip leading dots
    while (d.startsWith('.')) d = d.slice(1);
    return d;
  }

  /**
   * Check if a tough-cookie Cookie is expired.
   * @param {Cookie} cookie
   * @returns {boolean}
   * @private
   */
  _isExpired(cookie) {
    if (!cookie.expires || cookie.expires === 'Infinity') return false;
    const expires = cookie.expires instanceof Date ? cookie.expires : new Date(cookie.expires);
    return expires.getTime() < Date.now();
  }
}
