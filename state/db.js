/**
 * @module state/db
 * SQLite wrapper using better-sqlite3 with WAL mode.
 * Provides singleton database access and schema initialization.
 */

import Database from 'better-sqlite3';

/** @type {Map<string, import('better-sqlite3').Database>} */
const instances = new Map();

/**
 * Get or create a singleton better-sqlite3 instance for the given path.
 * Enables WAL mode and foreign keys on first open.
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {import('better-sqlite3').Database}
 */
export function getDb(dbPath) {
  if (instances.has(dbPath)) {
    return instances.get(dbPath);
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  instances.set(dbPath, db);
  return db;
}

/**
 * Create all required tables if they don't exist.
 * @param {import('better-sqlite3').Database} db
 */
export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      passwordHash  TEXT NOT NULL,
      displayName   TEXT,
      role          TEXT NOT NULL DEFAULT 'user'    CHECK (role IN ('admin', 'user')),
      plan          TEXT NOT NULL DEFAULT 'free'    CHECK (plan IN ('free', 'pro', 'team', 'byok', 'enterprise')),
      apiKey        TEXT,
      capabilities  TEXT NOT NULL DEFAULT '[]',
      createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token     TEXT PRIMARY KEY,
      userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      expiresAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS canvas_state (
      userId  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ops     TEXT NOT NULL DEFAULT '[]',
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS widget_state (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      widgetId  TEXT NOT NULL,
      state     TEXT NOT NULL DEFAULT '{}',
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(userId, widgetId)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_userId   ON sessions(userId);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions(expiresAt);
    CREATE INDEX IF NOT EXISTS idx_widget_state_userId ON widget_state(userId);
  `);
}
