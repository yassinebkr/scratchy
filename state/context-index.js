/**
 * @module state/context-index
 * Context index store backed by SQLite.
 * Indexes documents (tool docs, skill docs, component schemas, etc.) for search.
 * All functions are synchronous (better-sqlite3 is sync).
 */

import crypto from 'node:crypto';

/** @type {import('better-sqlite3').Database} */
let db;

/**
 * Initialize the context-index module with a database instance.
 * @param {import('better-sqlite3').Database} database
 */
export function init(database) {
  db = database;
}

function d() {
  if (!db) throw new Error('context-index.init(db) must be called before using the context index');
  return db;
}

/**
 * Generate SHA-256 hash of content.
 * @param {string} content
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Upsert a document chunk into the index.
 * Auto-generates chunkHash from content SHA-256. Skips update if chunkHash unchanged.
 * @param {string} source - File path or identifier
 * @param {string} content - Document content
 * @param {Object} [opts]
 * @param {string} [opts.category='tool']
 * @param {Buffer|null} [opts.embedding=null]
 * @returns {{ id: string, created: boolean, skipped: boolean }}
 */
export function upsert(source, content, opts = {}) {
  if (!source || typeof source !== 'string') throw new Error('source must be a non-empty string');
  if (!content || typeof content !== 'string') throw new Error('content must be a non-empty string');

  const { category = 'tool', embedding = null } = opts;
  const chunkHash = hashContent(content);
  const now = new Date().toISOString();

  // Check if source already exists
  const existing = d().prepare('SELECT id, chunkHash FROM context_index WHERE source = ?').get(source);

  if (existing) {
    if (existing.chunkHash === chunkHash) {
      // Content unchanged — skip
      return { id: existing.id, created: false, skipped: true };
    }
    // Update existing
    d().prepare(`
      UPDATE context_index SET content = ?, embedding = ?, category = ?, chunkHash = ?, updatedAt = ?
      WHERE id = ?
    `).run(content, embedding, category, chunkHash, now, existing.id);
    return { id: existing.id, created: false, skipped: false };
  }

  // Insert new
  const id = crypto.randomUUID();
  d().prepare(`
    INSERT INTO context_index (id, source, content, embedding, category, chunkHash, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, source, content, embedding, category, chunkHash, now);
  return { id, created: true, skipped: false };
}

/**
 * Search context index with text-based filtering.
 * Note: cosine similarity on embeddings will be added in Phase 2c.
 * @param {Object} [opts]
 * @param {string} [opts.category] - Filter by category
 * @param {string} [opts.sourcePrefix] - Filter by source prefix (e.g. 'skills/')
 * @param {number} [opts.limit=50]
 * @returns {Object[]}
 */
export function search(opts = {}) {
  const clauses = [];
  const params = [];

  if (opts.category) {
    clauses.push('category = ?');
    params.push(opts.category);
  }
  if (opts.sourcePrefix) {
    clauses.push('source LIKE ?');
    params.push(`${opts.sourcePrefix}%`);
  }

  const limit = opts.limit || 50;
  params.push(limit);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return d().prepare(`SELECT * FROM context_index ${where} ORDER BY updatedAt DESC LIMIT ?`).all(...params);
}

/**
 * Get a context index entry by ID.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function get(id) {
  return d().prepare('SELECT * FROM context_index WHERE id = ?').get(id);
}

/**
 * Delete a context index entry by ID.
 * @param {string} id
 * @returns {boolean}
 */
function deleteEntry(id) {
  const result = d().prepare('DELETE FROM context_index WHERE id = ?').run(id);
  return result.changes > 0;
}
export { deleteEntry as delete };

/**
 * Delete all entries with a given source.
 * @param {string} source
 * @returns {number} Number of entries deleted
 */
export function deleteBySource(source) {
  const result = d().prepare('DELETE FROM context_index WHERE source = ?').run(source);
  return result.changes;
}

/**
 * Reindex: delete all entries. Returns the count of deleted entries.
 * Callers should re-populate after calling this.
 * @returns {number}
 */
export function reindex() {
  const result = d().prepare('DELETE FROM context_index').run();
  return result.changes;
}

/**
 * Generate a compact manifest of indexed entries.
 * Returns one line per entry: "source — first 80 chars of content"
 * @param {string} [category] - Optional category filter
 * @returns {string[]}
 */
export function generateManifest(category) {
  let rows;
  if (category) {
    rows = d().prepare('SELECT source, content FROM context_index WHERE category = ? ORDER BY source').all(category);
  } else {
    rows = d().prepare('SELECT source, content FROM context_index ORDER BY source').all();
  }

  return rows.map(row => {
    const preview = row.content.replace(/\n/g, ' ').slice(0, 80);
    return `${row.source} — ${preview}`;
  });
}
