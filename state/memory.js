/**
 * @module state/memory
 * Memory chunk store backed by SQLite.
 * Stores auto-extracted facts, semantic memories, and user-provided knowledge.
 * All functions are synchronous (better-sqlite3 is sync).
 */

import crypto from 'node:crypto';

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the memory module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

function d() {
  if (!db) throw new Error('memory.init(db) must be called before using the memory store');
  return db;
}

/** JSON fields that should be parsed on read */
const JSON_FIELDS = ['tags'];

/**
 * Parse JSON fields in a memory chunk row.
 * @param {Object} row
 * @returns {Object} Row with parsed JSON fields
 */
function parseRow(row) {
  if (!row) return undefined;
  const parsed = { ...row };
  for (const field of JSON_FIELDS) {
    if (typeof parsed[field] === 'string') {
      try { parsed[field] = JSON.parse(parsed[field]); } catch { parsed[field] = []; }
    }
  }
  return parsed;
}

/**
 * Store a new memory chunk.
 * @param {string} userId
 * @param {string} content
 * @param {Object} [opts]
 * @param {string|null} [opts.agentId=null]
 * @param {string} [opts.source='extraction']
 * @param {string} [opts.category='semantic']
 * @param {string[]} [opts.tags=[]]
 * @param {number} [opts.confidence=1.0]
 * @param {string|null} [opts.sourceRef=null]
 * @param {Buffer|null} [opts.embedding=null]
 * @returns {Object} The created memory chunk
 */
export function store(userId, content, opts = {}) {
  if (!userId) throw new Error('userId is required');
  if (!content || typeof content !== 'string') throw new Error('content must be a non-empty string');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const {
    agentId = null,
    source = 'extraction',
    category = 'semantic',
    tags = [],
    confidence = 1.0,
    sourceRef = null,
    embedding = null,
  } = opts;

  d().prepare(`
    INSERT INTO memory_chunks (id, userId, agentId, source, content, embedding, category, tags, confidence, sourceRef, createdAt, accessedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, agentId, source, content, embedding, category, JSON.stringify(tags), confidence, sourceRef, now, now);

  return get(id);
}

/**
 * Search memory chunks with text-based filtering.
 * Note: cosine similarity on embeddings will be added in Phase 2c.
 * @param {string} userId
 * @param {Object} [opts]
 * @param {string|null} [opts.agentId] - Filter by agent (null = global only)
 * @param {string} [opts.category] - Filter by category
 * @param {string[]} [opts.tags] - Filter by tags (any match)
 * @param {number} [opts.limit=50]
 * @returns {Object[]}
 */
export function search(userId, opts = {}) {
  const clauses = ['userId = ?'];
  const params = [userId];

  if (opts.agentId !== undefined) {
    if (opts.agentId === null) {
      clauses.push('agentId IS NULL');
    } else {
      clauses.push('agentId = ?');
      params.push(opts.agentId);
    }
  }
  if (opts.category) {
    clauses.push('category = ?');
    params.push(opts.category);
  }
  if (opts.tags && opts.tags.length > 0) {
    // Match any chunk that contains any of the specified tags
    const tagClauses = opts.tags.map(() => "tags LIKE ?");
    clauses.push(`(${tagClauses.join(' OR ')})`);
    for (const tag of opts.tags) {
      params.push(`%${JSON.stringify(tag).slice(1, -1)}%`);
    }
  }

  const limit = opts.limit || 50;
  params.push(limit);

  const where = clauses.join(' AND ');
  const rows = d().prepare(`SELECT * FROM memory_chunks WHERE ${where} ORDER BY accessedAt DESC LIMIT ?`).all(...params);
  return rows.map(parseRow);
}

/**
 * Get a memory chunk by ID.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function get(id) {
  const row = d().prepare('SELECT * FROM memory_chunks WHERE id = ?').get(id);
  return parseRow(row);
}

/**
 * Update a memory chunk with a partial patch.
 * @param {string} id
 * @param {Object} patch
 * @returns {Object|undefined}
 */
export function update(id, patch) {
  const allowed = ['content', 'category', 'tags', 'confidence', 'sourceRef', 'source', 'embedding', 'agentId'];
  const sets = [];
  const values = [];

  for (const key of allowed) {
    if (key in patch) {
      let val = patch[key];
      if (JSON_FIELDS.includes(key)) {
        val = JSON.stringify(val);
      }
      sets.push(`${key} = ?`);
      values.push(val);
    }
  }

  if (sets.length === 0) return get(id);

  values.push(id);
  d().prepare(`UPDATE memory_chunks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return get(id);
}

/**
 * Delete a memory chunk by ID.
 * @param {string} id
 * @returns {boolean}
 */
function deleteChunk(id) {
  const result = d().prepare('DELETE FROM memory_chunks WHERE id = ?').run(id);
  return result.changes > 0;
}
export { deleteChunk as delete };

/**
 * Delete all memory chunks for a user.
 * @param {string} userId
 * @returns {number} Number of chunks deleted
 */
export function deleteByUser(userId) {
  const result = d().prepare('DELETE FROM memory_chunks WHERE userId = ?').run(userId);
  return result.changes;
}

/**
 * Update the accessedAt timestamp for a chunk.
 * @param {string} id
 * @returns {boolean}
 */
export function touchAccessed(id) {
  const now = new Date().toISOString();
  const result = d().prepare('UPDATE memory_chunks SET accessedAt = ? WHERE id = ?').run(now, id);
  return result.changes > 0;
}

/**
 * Count memory chunks for a user.
 * @param {string} userId
 * @returns {number}
 */
export function countByUser(userId) {
  const row = d().prepare('SELECT COUNT(*) as count FROM memory_chunks WHERE userId = ?').get(userId);
  return row.count;
}
