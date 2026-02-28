/**
 * @module state/canvas
 * Canvas state persistence backed by SQLite.
 * Replaces .canvas-state.json from v1.
 * All functions are synchronous (better-sqlite3 is sync).
 */

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the canvas module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

function d() {
  if (!db) throw new Error('canvas.init(db) must be called before using the canvas store');
  return db;
}

/**
 * Get the canvas state (ops array) for a user.
 * @param {string} userId
 * @returns {any[]} Parsed ops array, or empty array if none stored
 */
export function getCanvasState(userId) {
  const row = d().prepare('SELECT ops FROM canvas_state WHERE userId = ?').get(userId);
  if (!row) return [];

  try {
    return JSON.parse(row.ops);
  } catch {
    return [];
  }
}

/**
 * Set (replace) the canvas state for a user.
 * @param {string} userId
 * @param {any[]} ops - Array of canvas operations
 */
export function setCanvasState(userId, ops) {
  const json = JSON.stringify(ops);
  const now = new Date().toISOString();

  d().prepare(`
    INSERT INTO canvas_state (userId, ops, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(userId) DO UPDATE SET ops = excluded.ops, updatedAt = excluded.updatedAt
  `).run(userId, json, now);
}

/**
 * Clear the canvas state for a user.
 * @param {string} userId
 * @returns {boolean} True if state was cleared
 */
export function clearCanvasState(userId) {
  const result = d().prepare('DELETE FROM canvas_state WHERE userId = ?').run(userId);
  return result.changes > 0;
}
