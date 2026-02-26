/**
 * @module state/users
 * User store backed by SQLite. Replaces the JSON file from v1.
 * All functions are synchronous (better-sqlite3 is sync).
 */

import crypto from 'node:crypto';
import { getDb } from './db.js';

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the users module with a database instance.
 * Must be called before any other function.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

/** Lazily get the db — allows init() or direct getDb() usage */
function d() {
  if (!db) throw new Error('users.init(db) must be called before using the user store');
  return db;
}

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} username
 * @property {string} passwordHash
 * @property {string|null} displayName
 * @property {'admin'|'user'} role
 * @property {'free'|'pro'|'team'|'byok'|'enterprise'} plan
 * @property {string|null} apiKey
 * @property {string} capabilities - JSON string
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Create a new user.
 * @param {string} username
 * @param {string} passwordHash - Pre-hashed password (use auth.hashPassword)
 * @param {Object} [opts]
 * @param {string} [opts.displayName]
 * @param {'admin'|'user'} [opts.role='user']
 * @param {'free'|'pro'|'team'|'byok'|'enterprise'} [opts.plan='free']
 * @param {string|null} [opts.apiKey=null]
 * @param {any[]} [opts.capabilities=[]]
 * @returns {User}
 */
export function createUser(username, passwordHash, opts = {}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const {
    displayName = null,
    role = 'user',
    plan = 'free',
    apiKey = null,
    capabilities = [],
  } = opts;

  d().prepare(`
    INSERT INTO users (id, username, passwordHash, displayName, role, plan, apiKey, capabilities, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, passwordHash, displayName, role, plan, apiKey, JSON.stringify(capabilities), now, now);

  return getUser(id);
}

/**
 * Get a user by ID.
 * @param {string} userId
 * @returns {User|undefined}
 */
export function getUser(userId) {
  return d().prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

/**
 * Get a user by username (case-insensitive).
 * @param {string} username
 * @returns {User|undefined}
 */
export function getUserByUsername(username) {
  return d().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

/**
 * Update a user with a partial patch.
 * Only allowed fields are updated; unknown keys are ignored.
 * @param {string} userId
 * @param {Partial<Pick<User, 'username'|'passwordHash'|'displayName'|'role'|'plan'|'apiKey'|'capabilities'>>} patch
 * @returns {User|undefined} The updated user, or undefined if not found
 */
export function updateUser(userId, patch) {
  const allowed = ['username', 'passwordHash', 'displayName', 'role', 'plan', 'apiKey', 'capabilities'];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (key in patch) {
      sets.push(`${key} = ?`);
      values.push(key === 'capabilities' ? JSON.stringify(patch[key]) : patch[key]);
    }
  }

  if (sets.length === 0) return getUser(userId);

  sets.push('updatedAt = ?');
  values.push(new Date().toISOString());
  values.push(userId);

  d().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getUser(userId);
}

/**
 * List all users.
 * @returns {User[]}
 */
export function listUsers() {
  return d().prepare('SELECT * FROM users ORDER BY createdAt ASC').all();
}

/**
 * Delete a user by ID. Cascades to sessions and canvas_state.
 * @param {string} userId
 * @returns {boolean} True if a user was deleted
 */
export function deleteUser(userId) {
  const result = d().prepare('DELETE FROM users WHERE id = ?').run(userId);
  return result.changes > 0;
}
