/**
 * @module state/sessions
 * Session management backed by SQLite.
 * All functions are synchronous (better-sqlite3 is sync).
 */

/** @type {import('better-sqlite3').Database} */
let db;

/** Default session TTL: 24 hours in milliseconds */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Initialize the sessions module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

function d() {
  if (!db) throw new Error('sessions.init(db) must be called before using the session store');
  return db;
}

/**
 * @typedef {Object} Session
 * @property {string} token
 * @property {string} userId
 * @property {string} createdAt
 * @property {string} expiresAt
 */

/**
 * Create a new session.
 * @param {string} userId
 * @param {string} token - Pre-generated token (use auth.generateToken)
 * @param {number} [ttlMs=SESSION_TTL_MS] - Time-to-live in milliseconds
 * @returns {Session}
 */
export function createSession(userId, token, ttlMs = SESSION_TTL_MS) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  d().prepare(`
    INSERT INTO sessions (token, userId, createdAt, expiresAt)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, now.toISOString(), expiresAt.toISOString());

  return { token, userId, createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() };
}

/**
 * Get a session by token. Returns undefined if expired or not found.
 * @param {string} token
 * @returns {Session|undefined}
 */
export function getSession(token) {
  const session = d().prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return undefined;

  // Check expiry
  if (new Date(session.expiresAt) <= new Date()) {
    // Expired — clean it up and return nothing
    d().prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return undefined;
  }

  return session;
}

/**
 * Delete a session (logout).
 * @param {string} token
 * @returns {boolean} True if a session was deleted
 */
export function deleteSession(token) {
  const result = d().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  return result.changes > 0;
}

/**
 * Remove all expired sessions.
 * @returns {number} Number of sessions cleaned up
 */
export function cleanExpired() {
  // Use JS ISO format for comparison since sessions are stored with ISO timestamps
  const now = new Date().toISOString();
  const result = d().prepare('DELETE FROM sessions WHERE expiresAt <= ?').run(now);
  return result.changes;
}
