/**
 * @module state/admin-config
 * Global admin configuration store backed by SQLite.
 * Key-value pairs with JSON-encoded values.
 * All functions are synchronous (better-sqlite3 is sync).
 */

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the admin-config module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

function d() {
  if (!db) throw new Error('admin-config.init(db) must be called before using the config store');
  return db;
}

/**
 * Get a config value by key.
 * @param {string} key
 * @returns {any} Parsed JSON value, or undefined if key doesn't exist
 */
export function get(key) {
  const row = d().prepare('SELECT value FROM admin_config WHERE key = ?').get(key);
  if (!row) return undefined;
  try {
    return JSON.parse(row.value);
  } catch {
    return undefined;
  }
}

/**
 * Set a config value. Creates or updates the key.
 * @param {string} key
 * @param {any} value - Will be JSON-encoded
 */
export function set(key, value) {
  const now = new Date().toISOString();
  const json = JSON.stringify(value);
  d().prepare(`
    INSERT INTO admin_config (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).run(key, json, now);
}

/**
 * Get all config key-value pairs.
 * @returns {Object} Object of all key-value pairs (values are parsed JSON)
 */
export function getAll() {
  const rows = d().prepare('SELECT key, value FROM admin_config ORDER BY key').all();
  const result = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}

/**
 * Delete a config key.
 * @param {string} key
 * @returns {boolean} True if a key was deleted
 */
function deleteKey(key) {
  const result = d().prepare('DELETE FROM admin_config WHERE key = ?').run(key);
  return result.changes > 0;
}
export { deleteKey as delete };

/**
 * Set default values. Only sets keys that don't already exist.
 * @param {Object} defaults - Object of key-value pairs
 */
export function setDefaults(defaults) {
  const stmt = d().prepare(`
    INSERT INTO admin_config (key, value, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(defaults)) {
    stmt.run(key, JSON.stringify(value), now);
  }
}
