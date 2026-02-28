// OSS stub — no user preferences
export function init() {}
export function encrypt(s) { return s; }
export function decrypt(s) { return s; }
export function get() { return { userId: 'default', locale: 'en', theme: 'system', defaultAgentId: null, onboardingComplete: true }; }
export function set(userId, patch) { return { userId, ...patch }; }
export function getLocale() { return 'en'; }
export function setLocale() {}
export function setApiKey() {}
export function getApiKey() { return null; }
export function setOAuthToken() {}
export function getOAuthToken() { return null; }
