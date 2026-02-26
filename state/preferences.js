/**
 * @module state/preferences
 * User preferences and encrypted key vault backed by SQLite.
 * Includes AES-256-GCM encryption for API keys and OAuth tokens.
 * All functions are synchronous (better-sqlite3 is sync).
 */

import crypto from 'node:crypto';

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the preferences module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

function d() {
  if (!db) throw new Error('preferences.init(db) must be called before using the preferences store');
  return db;
}

/* ------------------------------------------------------------------ */
/*  Encryption helpers (AES-256-GCM)                                  */
/* ------------------------------------------------------------------ */

const IV_LENGTH = 12;        // 96 bits, recommended for GCM
const AUTH_TAG_LENGTH = 16;  // 128 bits

/**
 * Encrypt a string with AES-256-GCM.
 * @param {string} plaintext
 * @param {Buffer} encryptionKey - 32-byte key
 * @returns {string} Format: iv:authTag:ciphertext (all hex)
 */
export function encrypt(plaintext, encryptionKey) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with AES-256-GCM.
 * @param {string} encryptedStr - Format: iv:authTag:ciphertext (all hex)
 * @param {Buffer} encryptionKey - 32-byte key
 * @returns {string} Decrypted plaintext
 * @throws {Error} If decryption fails (wrong key, tampered data, etc.)
 */
export function decrypt(encryptedStr, encryptionKey) {
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/* ------------------------------------------------------------------ */
/*  Preferences CRUD                                                  */
/* ------------------------------------------------------------------ */

/**
 * Get user preferences.
 * @param {string} userId
 * @returns {Object|undefined} Preferences object (without decrypted secrets)
 */
export function get(userId) {
  const row = d().prepare('SELECT * FROM user_preferences WHERE userId = ?').get(userId);
  if (!row) return undefined;
  return {
    userId: row.userId,
    locale: row.locale,
    theme: row.theme,
    defaultAgentId: row.defaultAgentId,
    onboardingComplete: !!row.onboardingComplete,
    updatedAt: row.updatedAt,
  };
}

/**
 * Set (create or update) user preferences.
 * @param {string} userId
 * @param {Object} patch - Partial preferences to update
 * @returns {Object} Updated preferences
 */
export function set(userId, patch) {
  const existing = d().prepare('SELECT * FROM user_preferences WHERE userId = ?').get(userId);
  const now = new Date().toISOString();

  if (!existing) {
    // Insert new row with defaults + patch
    const locale = patch.locale || 'en';
    const theme = patch.theme || 'system';
    const defaultAgentId = patch.defaultAgentId || null;
    const onboardingComplete = patch.onboardingComplete ? 1 : 0;

    d().prepare(`
      INSERT INTO user_preferences (userId, locale, theme, defaultAgentId, onboardingComplete, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, locale, theme, defaultAgentId, onboardingComplete, now);
  } else {
    // Update existing
    const allowed = ['locale', 'theme', 'defaultAgentId', 'onboardingComplete'];
    const sets = [];
    const values = [];

    for (const key of allowed) {
      if (key in patch) {
        let val = patch[key];
        if (key === 'onboardingComplete') val = val ? 1 : 0;
        sets.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (sets.length === 0) return get(userId);

    sets.push('updatedAt = ?');
    values.push(now);
    values.push(userId);

    d().prepare(`UPDATE user_preferences SET ${sets.join(', ')} WHERE userId = ?`).run(...values);
  }

  return get(userId);
}

/**
 * Get the locale for a user.
 * @param {string} userId
 * @returns {string} Locale string (default 'en')
 */
export function getLocale(userId) {
  const row = d().prepare('SELECT locale FROM user_preferences WHERE userId = ?').get(userId);
  return row ? row.locale : 'en';
}

/**
 * Set the locale for a user.
 * @param {string} userId
 * @param {string} locale
 */
export function setLocale(userId, locale) {
  set(userId, { locale });
}

/* ------------------------------------------------------------------ */
/*  Encrypted key vault                                               */
/* ------------------------------------------------------------------ */

/**
 * Store an API key (encrypted).
 * @param {string} userId
 * @param {string} provider - Key identifier (e.g. 'openai', 'anthropic')
 * @param {string} key - API key to store
 * @param {Buffer} encryptionKey - 32-byte encryption key
 */
export function setApiKey(userId, provider, key, encryptionKey) {
  _ensureRow(userId);
  const row = d().prepare('SELECT apiKeys FROM user_preferences WHERE userId = ?').get(userId);
  const keys = _decryptObj(row.apiKeys, encryptionKey);
  keys[provider] = key;
  const encrypted = encrypt(JSON.stringify(keys), encryptionKey);
  const now = new Date().toISOString();
  d().prepare('UPDATE user_preferences SET apiKeys = ?, updatedAt = ? WHERE userId = ?').run(encrypted, now, userId);
}

/**
 * Get an API key (decrypted).
 * @param {string} userId
 * @param {string} provider
 * @param {Buffer} encryptionKey - 32-byte encryption key
 * @returns {string|undefined}
 */
export function getApiKey(userId, provider, encryptionKey) {
  const row = d().prepare('SELECT apiKeys FROM user_preferences WHERE userId = ?').get(userId);
  if (!row) return undefined;
  const keys = _decryptObj(row.apiKeys, encryptionKey);
  return keys[provider];
}

/**
 * Store an OAuth token (encrypted).
 * @param {string} userId
 * @param {string} provider
 * @param {Object} tokenData
 * @param {Buffer} encryptionKey - 32-byte encryption key
 */
export function setOAuthToken(userId, provider, tokenData, encryptionKey) {
  _ensureRow(userId);
  const row = d().prepare('SELECT oauthTokens FROM user_preferences WHERE userId = ?').get(userId);
  const tokens = _decryptObj(row.oauthTokens, encryptionKey);
  tokens[provider] = tokenData;
  const encrypted = encrypt(JSON.stringify(tokens), encryptionKey);
  const now = new Date().toISOString();
  d().prepare('UPDATE user_preferences SET oauthTokens = ?, updatedAt = ? WHERE userId = ?').run(encrypted, now, userId);
}

/**
 * Get an OAuth token (decrypted).
 * @param {string} userId
 * @param {string} provider
 * @param {Buffer} encryptionKey - 32-byte encryption key
 * @returns {Object|undefined}
 */
export function getOAuthToken(userId, provider, encryptionKey) {
  const row = d().prepare('SELECT oauthTokens FROM user_preferences WHERE userId = ?').get(userId);
  if (!row) return undefined;
  const tokens = _decryptObj(row.oauthTokens, encryptionKey);
  return tokens[provider];
}

/**
 * Ensure a preferences row exists for the user.
 * @param {string} userId
 */
function _ensureRow(userId) {
  const exists = d().prepare('SELECT 1 FROM user_preferences WHERE userId = ?').get(userId);
  if (!exists) {
    const now = new Date().toISOString();
    d().prepare(`
      INSERT INTO user_preferences (userId, updatedAt)
      VALUES (?, ?)
    `).run(userId, now);
  }
}

/**
 * Decrypt a JSON object stored as an encrypted string.
 * Returns empty object for the initial '{}' default.
 * Throws if decryption fails on actual encrypted data (wrong key, tampered).
 * @param {string} str
 * @param {Buffer} encryptionKey
 * @returns {Object}
 */
function _decryptObj(str, encryptionKey) {
  if (!str || str === '{}') return {};
  // If it looks like our encrypted format (iv:authTag:ciphertext), decrypt it
  if (str.includes(':')) {
    return JSON.parse(decrypt(str, encryptionKey));
  }
  // Fall back to plain JSON (shouldn't normally happen)
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
