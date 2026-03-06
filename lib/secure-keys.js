/**
 * @module lib/secure-keys
 * Encrypted API key store for Scratchy v2.
 *
 * Stores API keys encrypted at rest (AES-256-GCM) in the admin_config table.
 * Falls back to process.env for backwards compatibility.
 *
 * Architecture:
 *   - ENCRYPTION_KEY stays in .env (it's the master key — can't encrypt itself)
 *   - All other API keys are encrypted in admin_config with prefix "sk:"
 *   - getKey() checks DB first, then falls back to process.env
 *   - Keys are NEVER logged, NEVER returned in full via API
 *
 * Security properties:
 *   - AES-256-GCM authenticated encryption (same as BYOK)
 *   - Keys encrypted at rest in SQLite
 *   - In-memory cache cleared on explicit invalidation
 *   - Masked display: only first 4 + last 4 chars visible
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import * as adminConfig from '../state/admin-config.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** Prefix for encrypted keys in admin_config */
const KEY_PREFIX = 'sk:';

/** Known key names and their env var equivalents */
const KEY_REGISTRY = {
  GEMINI_API_KEY:        { label: 'Gemini API Key',         envVar: 'GEMINI_API_KEY',        sensitive: true },
  OPENAI_API_KEY:        { label: 'OpenAI API Key',         envVar: 'OPENAI_API_KEY',        sensitive: true },
  STRIPE_SECRET_KEY:     { label: 'Stripe Secret Key',      envVar: 'STRIPE_SECRET_KEY',     sensitive: true },
  STRIPE_WEBHOOK_SECRET: { label: 'Stripe Webhook Secret',  envVar: 'STRIPE_WEBHOOK_SECRET', sensitive: true },
  STRIPE_PRICE_PRO:      { label: 'Stripe Pro Price ID',    envVar: 'STRIPE_PRICE_PRO',      sensitive: false },
  STRIPE_PRICE_TEAM:     { label: 'Stripe Team Price ID',   envVar: 'STRIPE_PRICE_TEAM',     sensitive: false },
  RESEND_API_KEY:        { label: 'Resend API Key',         envVar: 'RESEND_API_KEY',        sensitive: true },
  RESEND_SENDER:         { label: 'Resend Sender Email',    envVar: 'RESEND_SENDER',         sensitive: false },
  GOOGLE_CLIENT_ID:      { label: 'Google OAuth Client ID', envVar: 'GOOGLE_CLIENT_ID',      sensitive: false },
  GOOGLE_CLIENT_SECRET:  { label: 'Google OAuth Secret',    envVar: 'GOOGLE_CLIENT_SECRET',  sensitive: true },
  GOOGLE_REDIRECT_URI:   { label: 'Google OAuth Redirect',  envVar: 'GOOGLE_REDIRECT_URI',   sensitive: false },
};

/* ------------------------------------------------------------------ */
/*  Encryption (same scheme as byok.js)                               */
/* ------------------------------------------------------------------ */

let _masterKey = null;

/**
 * Derive the 32-byte master key from ENCRYPTION_KEY env var.
 * @returns {Buffer}
 */
function getMasterKey() {
  if (_masterKey) return _masterKey;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY not set in environment — required for secure key store');
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    _masterKey = Buffer.from(raw, 'hex');
  } else {
    _masterKey = createHash('sha256').update(raw).digest();
  }
  return _masterKey;
}

/**
 * Encrypt a plaintext value.
 * @param {string} plaintext
 * @returns {string} base64-encoded ciphertext (iv + encrypted + tag)
 */
function encrypt(plaintext) {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext.
 * @param {string} encoded
 * @returns {string} plaintext
 */
function decrypt(encoded) {
  const key = getMasterKey();
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('Invalid encrypted value');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

/* ------------------------------------------------------------------ */
/*  In-memory cache (decrypted values, cleared on set/delete)         */
/* ------------------------------------------------------------------ */

/** @type {Map<string, string|null>} */
const _cache = new Map();

/** Clear the entire cache (call after set/delete or on security events) */
export function clearCache() {
  _cache.clear();
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Get a key value by name.
 * Priority: encrypted DB store → process.env fallback.
 *
 * @param {string} name - Key name (e.g. 'GEMINI_API_KEY')
 * @returns {string|undefined} Decrypted value, or undefined if not set anywhere
 */
export function getKey(name) {
  // Check cache first
  if (_cache.has(name)) {
    const cached = _cache.get(name);
    return cached === null ? undefined : cached;
  }

  // Try encrypted store (may throw if DB not initialized yet)
  try {
    const dbKey = `${KEY_PREFIX}${name}`;
    const encrypted = adminConfig.get(dbKey);
    if (encrypted && typeof encrypted === 'string') {
      try {
        const value = decrypt(encrypted);
        _cache.set(name, value);
        return value;
      } catch (err) {
        console.error(`[secure-keys] Failed to decrypt ${name}:`, err.message);
        // Fall through to env
      }
    }
  } catch {
    // DB not ready — fall through to env
  }

  // Fallback to process.env
  const reg = KEY_REGISTRY[name];
  const envVar = reg?.envVar || name;
  const envValue = process.env[envVar];
  if (envValue) {
    _cache.set(name, envValue);
    return envValue;
  }

  _cache.set(name, null);
  return undefined;
}

/**
 * Store a key value (encrypted at rest).
 *
 * @param {string} name - Key name
 * @param {string} value - Plaintext key value
 */
export function setKey(name, value) {
  if (!name || typeof name !== 'string') throw new Error('Key name must be a non-empty string');
  if (!value || typeof value !== 'string') throw new Error('Key value must be a non-empty string');

  const encrypted = encrypt(value.trim());
  const dbKey = `${KEY_PREFIX}${name}`;
  adminConfig.set(dbKey, encrypted);

  // Invalidate cache for this key
  _cache.delete(name);

  console.log(`[secure-keys] Stored key: ${name} (${maskValue(value.trim())})`);
}

/**
 * Delete a key from the encrypted store.
 * Falls back to process.env if set there (can't delete env vars at runtime).
 *
 * @param {string} name - Key name
 * @returns {boolean} True if key was deleted from DB
 */
export function deleteKey(name) {
  const dbKey = `${KEY_PREFIX}${name}`;
  const deleted = adminConfig.delete(dbKey);
  _cache.delete(name);

  if (deleted) {
    console.log(`[secure-keys] Deleted key: ${name}`);
  }
  return deleted;
}

/**
 * List all configured keys with masked values and source info.
 * NEVER returns actual key values.
 *
 * @returns {Array<{name: string, label: string, source: 'db'|'env'|'none', masked: string, sensitive: boolean}>}
 */
export function listKeys() {
  const results = [];

  for (const [name, reg] of Object.entries(KEY_REGISTRY)) {
    const dbKey = `${KEY_PREFIX}${name}`;
    const dbValue = adminConfig.get(dbKey);
    let source = 'none';
    let masked = '—';

    if (dbValue && typeof dbValue === 'string') {
      try {
        const decrypted = decrypt(dbValue);
        source = 'db';
        masked = maskValue(decrypted);
      } catch {
        source = 'none';
        masked = '⚠ decrypt error';
      }
    } else if (process.env[reg.envVar]) {
      source = 'env';
      masked = maskValue(process.env[reg.envVar]);
    }

    results.push({
      name,
      label: reg.label,
      source,
      masked,
      sensitive: reg.sensitive,
    });
  }

  return results;
}

/**
 * Check if a key is configured (either in DB or env).
 *
 * @param {string} name
 * @returns {boolean}
 */
export function hasKey(name) {
  return getKey(name) !== undefined;
}

/**
 * Migrate a key from .env to encrypted DB store.
 * Reads from process.env, encrypts, stores in DB.
 * Does NOT delete from env (you do that manually by editing .env).
 *
 * @param {string} name - Key name
 * @returns {boolean} True if migrated, false if not found in env
 */
export function migrateFromEnv(name) {
  const reg = KEY_REGISTRY[name];
  const envVar = reg?.envVar || name;
  const value = process.env[envVar];

  if (!value) return false;

  // Don't migrate if already in DB
  const dbKey = `${KEY_PREFIX}${name}`;
  if (adminConfig.get(dbKey)) {
    console.log(`[secure-keys] ${name} already in DB, skipping migration`);
    return false;
  }

  setKey(name, value);
  console.log(`[secure-keys] Migrated ${name} from .env to encrypted store`);
  return true;
}

/**
 * Migrate ALL known keys from .env to encrypted store.
 * Safe to call multiple times — skips already-migrated keys.
 *
 * @returns {{migrated: string[], skipped: string[], missing: string[]}}
 */
export function migrateAll() {
  const migrated = [];
  const skipped = [];
  const missing = [];

  for (const [name, reg] of Object.entries(KEY_REGISTRY)) {
    const dbKey = `${KEY_PREFIX}${name}`;
    if (adminConfig.get(dbKey)) {
      skipped.push(name);
      continue;
    }
    const envValue = process.env[reg.envVar];
    if (envValue) {
      setKey(name, envValue);
      migrated.push(name);
    } else {
      missing.push(name);
    }
  }

  if (migrated.length > 0) {
    console.log(`[secure-keys] Migrated ${migrated.length} keys: ${migrated.join(', ')}`);
  }

  return { migrated, skipped, missing };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Mask a key value for display. Shows first 4 + last 4 chars only.
 * @param {string} value
 * @returns {string}
 */
function maskValue(value) {
  if (!value || value.length < 12) return '••••••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/**
 * Get the key registry (metadata only, no values).
 * @returns {Record<string, {label: string, envVar: string, sensitive: boolean}>}
 */
export function getRegistry() {
  return { ...KEY_REGISTRY };
}
