/**
 * @module lib/byok
 * Scratchy v2 — Bring Your Own Key (BYOK) Management
 *
 * Allows users to provide their own API keys for LLM providers.
 * Keys are encrypted at rest using AES-256-GCM with the server's
 * ENCRYPTION_KEY. BYOK users bypass token quotas but are still
 * subject to message rate limits.
 *
 * Supported providers:
 *   - anthropic  (Claude)
 *   - openai     (GPT-4, etc.)
 *   - google     (Gemini)
 *   - openrouter (multi-provider)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Encryption helpers (AES-256-GCM)                                  */
/* ------------------------------------------------------------------ */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

import { createHash } from 'node:crypto';

/** Derive a 32-byte key from the env secret (SHA-256 if needed) */
let _key = null;
function getKey() {
  if (_key) return _key;
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY not set in environment');
  // If already 32 bytes hex (64 chars), use directly
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    _key = Buffer.from(raw, 'hex');
  } else {
    _key = createHash('sha256').update(raw).digest();
  }
  return _key;
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string} — base64 encoded: iv + ciphertext + tag
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Pack: iv(12) + encrypted(N) + tag(16)
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/**
 * Decrypt a base64-encoded ciphertext.
 * @param {string} encoded — base64 from encrypt()
 * @returns {string} — plaintext
 */
export function decrypt(encoded) {
  const key = getKey();
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}

/* ------------------------------------------------------------------ */
/*  Provider validation                                               */
/* ------------------------------------------------------------------ */

/** @type {Record<string, {prefix: string, testUrl: string, testHeaders: (key: string) => Record<string, string>}>} */
const PROVIDERS = {
  anthropic: {
    prefix: 'sk-ant-',
    testUrl: 'https://api.anthropic.com/v1/messages',
    testHeaders: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    }),
    testBody: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  },
  openai: {
    prefix: 'sk-',
    testUrl: 'https://api.openai.com/v1/models',
    testHeaders: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
  google: {
    prefix: 'AIza',
    testUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    testHeaders: (key) => ({}),
    testUrlFn: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
  },
  openrouter: {
    prefix: 'sk-or-',
    testUrl: 'https://openrouter.ai/api/v1/models',
    testHeaders: (key) => ({ 'Authorization': `Bearer ${key}` }),
  },
};

/**
 * Detect provider from key format.
 * @param {string} key
 * @returns {string|null}
 */
export function detectProvider(key) {
  if (!key || typeof key !== 'string') return null;
  for (const [provider, config] of Object.entries(PROVIDERS)) {
    if (key.startsWith(config.prefix)) return provider;
  }
  return null;
}

/**
 * Validate an API key by making a lightweight test request.
 * @param {string} key
 * @param {string} [provider] — auto-detected if not specified
 * @returns {Promise<{valid: boolean, provider: string, error?: string}>}
 */
export async function validateKey(key, provider) {
  if (!provider) provider = detectProvider(key);
  if (!provider) return { valid: false, provider: 'unknown', error: 'Unrecognized key format' };

  const config = PROVIDERS[provider];
  if (!config) return { valid: false, provider, error: 'Unsupported provider' };

  try {
    const url = config.testUrlFn ? config.testUrlFn(key) : config.testUrl;
    const opts = {
      method: config.testBody ? 'POST' : 'GET',
      headers: config.testHeaders(key),
      signal: AbortSignal.timeout(10_000),
    };
    if (config.testBody) opts.body = config.testBody;

    const resp = await fetch(url, opts);

    // Anthropic returns 400 for min token request but 401/403 for bad key
    if (provider === 'anthropic' && (resp.status === 200 || resp.status === 400)) {
      return { valid: true, provider };
    }

    if (resp.ok || resp.status === 200) {
      return { valid: true, provider };
    }

    if (resp.status === 401 || resp.status === 403) {
      return { valid: false, provider, error: 'Invalid or expired API key' };
    }

    return { valid: false, provider, error: `Unexpected status: ${resp.status}` };
  } catch (err) {
    return { valid: false, provider, error: `Validation failed: ${err.message}` };
  }
}

/* ------------------------------------------------------------------ */
/*  BYOK Manager (database operations)                                */
/* ------------------------------------------------------------------ */

export class BYOKManager {
  /** @type {import('better-sqlite3').Database} */
  #db;
  #stmts = {};

  constructor(db) {
    this.#db = db;
    this._ensureTable();
    this._prepare();
  }

  _ensureTable() {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS user_api_keys (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider  TEXT NOT NULL,
        keyEnc    TEXT NOT NULL,
        label     TEXT DEFAULT '',
        isActive  INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(userId, provider)
      );
    `);
  }

  _prepare() {
    this.#stmts.upsert = this.#db.prepare(`
      INSERT INTO user_api_keys (userId, provider, keyEnc, label)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(userId, provider) DO UPDATE SET
        keyEnc = excluded.keyEnc,
        label = excluded.label,
        isActive = 1
    `);
    this.#stmts.get = this.#db.prepare(
      `SELECT * FROM user_api_keys WHERE userId = ? AND provider = ? AND isActive = 1`
    );
    this.#stmts.listUser = this.#db.prepare(
      `SELECT id, provider, label, isActive, createdAt FROM user_api_keys WHERE userId = ?`
    );
    this.#stmts.deactivate = this.#db.prepare(
      `UPDATE user_api_keys SET isActive = 0 WHERE userId = ? AND provider = ?`
    );
    this.#stmts.delete = this.#db.prepare(
      `DELETE FROM user_api_keys WHERE userId = ? AND provider = ?`
    );
    this.#stmts.updatePlan = this.#db.prepare(
      `UPDATE users SET plan = ?, updatedAt = datetime('now') WHERE id = ?`
    );
  }

  /**
   * Store a user's API key (encrypted).
   * Auto-upgrades plan to 'byok' if currently 'free'.
   */
  async setKey(userId, key, label = '') {
    const provider = detectProvider(key);
    if (!provider) throw new Error('Unrecognized API key format');

    // Validate the key
    const result = await validateKey(key, provider);
    if (!result.valid) throw new Error(result.error || 'Invalid API key');

    // Encrypt and store
    const keyEnc = encrypt(key);
    this.#stmts.upsert.run(userId, provider, keyEnc, label || provider);

    // Auto-upgrade plan + access tier
    this.#stmts.updatePlan.run('byok', userId);
    // Upgrade accessTier so user can actually chat
    this.#db.prepare(
      `UPDATE users SET accessTier = 'byok', updatedAt = datetime('now') WHERE id = ? AND accessTier IN ('none', 'free')`
    ).run(userId);

    return { provider, label: label || provider };
  }

  /**
   * Get a user's decrypted API key for a provider.
   * @returns {string|null}
   */
  getKey(userId, provider) {
    const row = this.#stmts.get.get(userId, provider);
    if (!row) return null;
    return decrypt(row.keyEnc);
  }

  /**
   * List a user's stored keys (without the actual key values).
   */
  listKeys(userId) {
    return this.#stmts.listUser.all(userId);
  }

  /**
   * Deactivate a key (soft delete).
   */
  deactivateKey(userId, provider) {
    this.#stmts.deactivate.run(userId, provider);
    // Check if user has any remaining active keys
    const remaining = this.listKeys(userId).filter(k => k.isActive);
    if (remaining.length === 0) {
      // Downgrade back to free (unless they have a paid plan)
      this.#stmts.updatePlan.run('free', userId);
    }
  }

  /**
   * Delete a key permanently.
   */
  deleteKey(userId, provider) {
    this.#stmts.delete.run(userId, provider);
    const remaining = this.listKeys(userId).filter(k => k.isActive);
    if (remaining.length === 0) {
      this.#stmts.updatePlan.run('free', userId);
    }
  }
}

/** @type {BYOKManager|null} */
let _instance = null;

export function initBYOK(db) {
  if (_instance) return _instance;
  _instance = new BYOKManager(db);
  return _instance;
}

export function getBYOK() {
  if (!_instance) throw new Error('BYOKManager not initialized');
  return _instance;
}
