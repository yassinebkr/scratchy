/**
 * @module profiles
 * @description Browser fingerprint profiles for stealth crawling.
 *
 * Provides statistically consistent browser profiles based on real 2025–2026
 * browser distributions.  Every field within a profile is internally coherent:
 * the User-Agent, platform string, screen dimensions, WebGL renderer, hardware
 * concurrency, and language list all match the device/OS the profile represents.
 *
 * Chrome ≈ 60 %, Firefox ≈ 25 %, Safari ≈ 15 % of real-world traffic.
 */

// ---------------------------------------------------------------------------
// Chrome Profiles (5 desktop + 1 bonus)
// ---------------------------------------------------------------------------

/** @type {BrowserProfile[]} */
export const CHROME_PROFILES = [
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'Win32',
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 1,
    hardwareConcurrency: 8,
    languages: ['en-US', 'en'],
    timezone: 'America/New_York',
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer:
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    plugins: [
      'PDF Viewer',
      'Chrome PDF Viewer',
      'Chromium PDF Viewer',
      'Microsoft Edge PDF Viewer',
      'WebKit built-in PDF',
    ],
    oscpu: undefined, // Chrome does not expose oscpu
  },
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    platform: 'Win32',
    screenWidth: 2560,
    screenHeight: 1440,
    devicePixelRatio: 1,
    hardwareConcurrency: 16,
    languages: ['en-US', 'en'],
    timezone: 'America/Chicago',
    webglVendor: 'Google Inc. (AMD)',
    webglRenderer:
      'ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    plugins: [
      'PDF Viewer',
      'Chrome PDF Viewer',
      'Chromium PDF Viewer',
      'Microsoft Edge PDF Viewer',
      'WebKit built-in PDF',
    ],
    oscpu: undefined,
  },
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    screenWidth: 1440,
    screenHeight: 900,
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    languages: ['en-US', 'en'],
    timezone: 'America/Los_Angeles',
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)',
    plugins: [
      'PDF Viewer',
      'Chrome PDF Viewer',
      'Chromium PDF Viewer',
      'Microsoft Edge PDF Viewer',
      'WebKit built-in PDF',
    ],
    oscpu: undefined,
  },
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    screenWidth: 1680,
    screenHeight: 1050,
    devicePixelRatio: 2,
    hardwareConcurrency: 10,
    languages: ['en-GB', 'en'],
    timezone: 'Europe/London',
    webglVendor: 'Google Inc. (Apple)',
    webglRenderer: 'ANGLE (Apple, Apple M2 Pro, OpenGL 4.1)',
    plugins: [
      'PDF Viewer',
      'Chrome PDF Viewer',
      'Chromium PDF Viewer',
      'Microsoft Edge PDF Viewer',
      'WebKit built-in PDF',
    ],
    oscpu: undefined,
  },
  {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'Linux x86_64',
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 1,
    hardwareConcurrency: 4,
    languages: ['en-US', 'en'],
    timezone: 'America/New_York',
    webglVendor: 'Google Inc. (Mesa)',
    webglRenderer:
      'ANGLE (Mesa, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
    plugins: [
      'PDF Viewer',
      'Chrome PDF Viewer',
      'Chromium PDF Viewer',
      'Microsoft Edge PDF Viewer',
      'WebKit built-in PDF',
    ],
    oscpu: undefined,
  },
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    platform: 'Win32',
    screenWidth: 1366,
    screenHeight: 768,
    devicePixelRatio: 1,
    hardwareConcurrency: 4,
    languages: ['de-DE', 'de', 'en-US', 'en'],
    timezone: 'Europe/Berlin',
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer:
      'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    plugins: [
      'PDF Viewer',
      'Chrome PDF Viewer',
      'Chromium PDF Viewer',
      'Microsoft Edge PDF Viewer',
      'WebKit built-in PDF',
    ],
    oscpu: undefined,
  },
];

// ---------------------------------------------------------------------------
// Firefox Profiles (3 desktop)
// ---------------------------------------------------------------------------

/** @type {BrowserProfile[]} */
export const FIREFOX_PROFILES = [
  {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
    platform: 'Win32',
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 1,
    hardwareConcurrency: 8,
    languages: ['en-US', 'en'],
    timezone: 'America/New_York',
    webglVendor: 'Mozilla',
    webglRenderer: 'Mozilla',
    plugins: [], // Firefox 134 exposes no plugin names
    oscpu: 'Windows NT 10.0; Win64; x64',
  },
  {
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0',
    platform: 'Linux x86_64',
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 1,
    hardwareConcurrency: 4,
    languages: ['en-US', 'en'],
    timezone: 'America/Chicago',
    webglVendor: 'Mozilla',
    webglRenderer: 'Mozilla',
    plugins: [],
    oscpu: 'Linux x86_64',
  },
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
    platform: 'MacIntel',
    screenWidth: 1440,
    screenHeight: 900,
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    languages: ['en-US', 'en'],
    timezone: 'America/Los_Angeles',
    webglVendor: 'Mozilla',
    webglRenderer: 'Mozilla',
    plugins: [],
    oscpu: 'Intel Mac OS X 10.15',
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pick a random profile for the given browser type.
 *
 * @param {'chrome'|'firefox'} [browserType='chrome'] - Target browser family.
 * @returns {BrowserProfile} A deep-copied profile so callers can mutate safely.
 */
export function getRandomProfile(browserType = 'chrome') {
  const pool =
    browserType === 'firefox' ? FIREFOX_PROFILES : CHROME_PROFILES;
  const idx = Math.floor(Math.random() * pool.length);
  // Deep-copy so the caller can safely modify the returned object.
  return JSON.parse(JSON.stringify(pool[idx]));
}

/**
 * Build HTTP headers that are consistent with a given profile.
 *
 * The header ordering deliberately mirrors real Chrome/Firefox requests to
 * defeat header-order fingerprinting.
 *
 * @param {BrowserProfile} profile
 * @returns {Record<string, string>}
 */
export function getHeadersForProfile(profile) {
  const isFirefox = profile.userAgent.includes('Firefox');
  const isChrome = !isFirefox;

  /** Accept-Language from the languages array (e.g. "en-US,en;q=0.9") */
  const acceptLanguage = profile.languages
    .map((lang, i) => {
      if (i === 0) return lang;
      const q = Math.max(0.1, 1 - i * 0.1).toFixed(1);
      return `${lang};q=${q}`;
    })
    .join(',');

  /** @type {Record<string, string>} */
  const headers = {};

  if (isChrome) {
    // Chrome header order
    headers['Accept'] =
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
    headers['Accept-Language'] = acceptLanguage;
    headers['Accept-Encoding'] = 'gzip, deflate, br, zstd';
    headers['Cache-Control'] = 'max-age=0';
    headers['Connection'] = 'keep-alive';
    headers['Upgrade-Insecure-Requests'] = '1';

    // Sec-CH-UA hints — derive from major version in the UA string
    const majorMatch = profile.userAgent.match(/Chrome\/(\d+)/);
    const major = majorMatch ? majorMatch[1] : '131';
    headers['Sec-CH-UA'] =
      `"Chromium";v="${major}", "Not A(Brand";v="99", "Google Chrome";v="${major}"`;
    headers['Sec-CH-UA-Mobile'] = '?0';
    headers['Sec-CH-UA-Platform'] = profile.platform === 'Win32'
      ? '"Windows"'
      : profile.platform === 'MacIntel'
        ? '"macOS"'
        : '"Linux"';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
  } else {
    // Firefox header order
    headers['Accept'] =
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    headers['Accept-Language'] = acceptLanguage;
    headers['Accept-Encoding'] = 'gzip, deflate, br, zstd';
    headers['Connection'] = 'keep-alive';
    headers['Upgrade-Insecure-Requests'] = '1';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
    headers['Priority'] = 'u=0, i';
  }

  headers['User-Agent'] = profile.userAgent;

  return headers;
}

// ---------------------------------------------------------------------------
// JSDoc type definition (for IDE / documentation only)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} BrowserProfile
 * @property {string}   userAgent           - Full User-Agent string.
 * @property {string}   platform            - navigator.platform value.
 * @property {number}   screenWidth         - screen.width in CSS px.
 * @property {number}   screenHeight        - screen.height in CSS px.
 * @property {number}   devicePixelRatio    - window.devicePixelRatio.
 * @property {number}   hardwareConcurrency - navigator.hardwareConcurrency.
 * @property {string[]} languages           - navigator.languages array.
 * @property {string}   timezone            - IANA timezone string.
 * @property {string}   webglVendor         - UNMASKED_VENDOR_WEBGL value.
 * @property {string}   webglRenderer       - UNMASKED_RENDERER_WEBGL value.
 * @property {string[]} plugins             - navigator.plugins names.
 * @property {string|undefined} oscpu       - navigator.oscpu (Firefox only).
 */
