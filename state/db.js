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
      plan          TEXT NOT NULL DEFAULT 'free'    CHECK (plan IN ('free', 'pro', 'max', 'team', 'byok', 'enterprise')),
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

    -- Agent definitions (specialist agents)
    CREATE TABLE IF NOT EXISTS agents (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      systemPrompt  TEXT NOT NULL DEFAULT '',
      model         TEXT NOT NULL DEFAULT 'sonnet',
      temperature   REAL NOT NULL DEFAULT 0.7,
      surfaces      TEXT NOT NULL DEFAULT '[]',
      mcpServers    TEXT NOT NULL DEFAULT '[]',
      skills        TEXT NOT NULL DEFAULT '[]',
      avatar        TEXT,
      enabled       INTEGER NOT NULL DEFAULT 1,
      isBuiltin     INTEGER NOT NULL DEFAULT 0,
      userId        TEXT REFERENCES users(id) ON DELETE CASCADE,
      createdAt     TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Memory chunks (auto-extracted facts + semantic memories)
    CREATE TABLE IF NOT EXISTS memory_chunks (
      id               TEXT PRIMARY KEY,
      userId           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agentId          TEXT REFERENCES agents(id) ON DELETE SET NULL,
      source           TEXT NOT NULL DEFAULT 'extraction',
      content          TEXT NOT NULL,
      embedding        BLOB,
      category         TEXT NOT NULL DEFAULT 'semantic' CHECK (category IN ('core','episodic','semantic','procedural','stale')),
      tags             TEXT NOT NULL DEFAULT '[]',
      confidence       REAL NOT NULL DEFAULT 1.0,
      sourceRef        TEXT,
      consolidatedInto TEXT DEFAULT NULL,
      accessCount      INTEGER NOT NULL DEFAULT 0,
      createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
      accessedAt       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Context index (indexed docs)
    CREATE TABLE IF NOT EXISTS context_index (
      id          TEXT PRIMARY KEY,
      source      TEXT NOT NULL,
      content     TEXT NOT NULL,
      embedding   BLOB,
      category    TEXT NOT NULL DEFAULT 'tool' CHECK (category IN ('tool','skill','component','protocol','ops','agent')),
      chunkHash   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Admin configuration (global key-value settings)
    CREATE TABLE IF NOT EXISTS admin_config (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- User preferences (locale, theme, OAuth tokens, API keys)
    CREATE TABLE IF NOT EXISTS user_preferences (
      userId              TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      locale              TEXT NOT NULL DEFAULT 'en',
      theme               TEXT NOT NULL DEFAULT 'system',
      defaultAgentId      TEXT REFERENCES agents(id) ON DELETE SET NULL,
      onboardingComplete  INTEGER NOT NULL DEFAULT 0,
      oauthTokens         TEXT NOT NULL DEFAULT '{}',
      apiKeys             TEXT NOT NULL DEFAULT '{}',
      updatedAt           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Agent conversations (per-agent history isolation)
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id          TEXT PRIMARY KEY,
      agentId     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      userId      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT,
      messages    TEXT NOT NULL DEFAULT '[]',
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_memory_chunks_userId ON memory_chunks(userId);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_agentId ON memory_chunks(agentId);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_category ON memory_chunks(category);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_consolidated ON memory_chunks(consolidatedInto);
    CREATE INDEX IF NOT EXISTS idx_context_index_category ON context_index(category);
    CREATE INDEX IF NOT EXISTS idx_context_index_source ON context_index(source);
    CREATE INDEX IF NOT EXISTS idx_agents_userId ON agents(userId);
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_agentId ON agent_conversations(agentId);
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_userId ON agent_conversations(userId);

    -- Notes (widget: notes)
    CREATE TABLE IF NOT EXISTS notes (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL,
      title     TEXT NOT NULL DEFAULT 'Untitled',
      content   TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notes_userId    ON notes(userId);
    CREATE INDEX IF NOT EXISTS idx_notes_updatedAt ON notes(updatedAt);

    -- Calendar events (widget: calendar)
    CREATE TABLE IF NOT EXISTS calendar_events (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL,
      title     TEXT NOT NULL,
      startTime TEXT NOT NULL,
      endTime   TEXT,
      allDay    INTEGER NOT NULL DEFAULT 0,
      color     TEXT DEFAULT 'blue',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_events_userId    ON calendar_events(userId);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_startTime ON calendar_events(startTime);

    -- Emails (widget: email)
    CREATE TABLE IF NOT EXISTS emails (
      id        TEXT PRIMARY KEY,
      userId    TEXT NOT NULL,
      "to"      TEXT NOT NULL,
      subject   TEXT NOT NULL DEFAULT '(no subject)',
      body      TEXT NOT NULL DEFAULT '',
      sentAt    TEXT,
      status    TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','failed')),
      resendId  TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_emails_userId ON emails(userId);
    CREATE INDEX IF NOT EXISTS idx_emails_sentAt ON emails(sentAt);
  `);

  // Migrate existing memory_chunks tables to v2 schema (consolidation support)
  _migrateMemoryChunksV2(db);
}

/**
 * Migrate memory_chunks table to v2: add consolidatedInto, accessCount columns
 * and expand category CHECK to include 'stale'.
 * Safe to call multiple times (idempotent).
 * @param {import('better-sqlite3').Database} db
 */
function _migrateMemoryChunksV2(db) {
  const cols = db.pragma('table_info(memory_chunks)');
  const colNames = cols.map(c => c.name);

  // Already migrated if consolidatedInto column exists
  if (colNames.includes('consolidatedInto')) return;

  // Recreate table with expanded schema (only way to update CHECK constraint in SQLite)
  db.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE memory_chunks_v2 (
      id               TEXT PRIMARY KEY,
      userId           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agentId          TEXT REFERENCES agents(id) ON DELETE SET NULL,
      source           TEXT NOT NULL DEFAULT 'extraction',
      content          TEXT NOT NULL,
      embedding        BLOB,
      category         TEXT NOT NULL DEFAULT 'semantic' CHECK (category IN ('core','episodic','semantic','procedural','stale')),
      tags             TEXT NOT NULL DEFAULT '[]',
      confidence       REAL NOT NULL DEFAULT 1.0,
      sourceRef        TEXT,
      consolidatedInto TEXT DEFAULT NULL,
      accessCount      INTEGER NOT NULL DEFAULT 0,
      createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
      accessedAt       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO memory_chunks_v2 (id, userId, agentId, source, content, embedding, category, tags, confidence, sourceRef, createdAt, accessedAt)
      SELECT id, userId, agentId, source, content, embedding, category, tags, confidence, sourceRef, createdAt, accessedAt
      FROM memory_chunks;

    DROP TABLE memory_chunks;
    ALTER TABLE memory_chunks_v2 RENAME TO memory_chunks;

    CREATE INDEX IF NOT EXISTS idx_memory_chunks_userId ON memory_chunks(userId);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_agentId ON memory_chunks(agentId);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_category ON memory_chunks(category);
    CREATE INDEX IF NOT EXISTS idx_memory_chunks_consolidated ON memory_chunks(consolidatedInto);

    PRAGMA foreign_keys = ON;
  `);
}
