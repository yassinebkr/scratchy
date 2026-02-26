/**
 * @module state/memory
 * Memory chunk store backed by SQLite.
 * Stores auto-extracted facts, semantic memories, and user-provided knowledge.
 * All functions are synchronous (better-sqlite3 is sync).
 */

import crypto from 'node:crypto';
import { cosineSimilarity, deserializeEmbedding } from '../lib/embeddings.js';

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
  // Ensure accessCount is numeric (may be missing on pre-migration rows)
  if (parsed.accessCount == null) parsed.accessCount = 0;
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
  const allowed = ['content', 'category', 'tags', 'confidence', 'sourceRef', 'source', 'embedding', 'agentId', 'consolidatedInto'];
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
 * Update the accessedAt timestamp and increment access count for a chunk.
 * @param {string} id
 * @returns {boolean}
 */
export function touchAccessed(id) {
  const now = new Date().toISOString();
  const result = d().prepare(
    'UPDATE memory_chunks SET accessedAt = ?, accessCount = COALESCE(accessCount, 0) + 1 WHERE id = ?'
  ).run(now, id);
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

// ---------------------------------------------------------------------------
// Consolidation support methods (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Find memory chunks matching any of the specified topic tags.
 * @param {string} userId
 * @param {string[]} tags - Tags to match (any match)
 * @returns {Object[]} Matching chunks
 */
export function getChunksByTopic(userId, tags) {
  if (!tags || tags.length === 0) return [];
  return search(userId, { tags, limit: 10000 });
}

/**
 * Group chunks by embedding cosine similarity using union-find clustering.
 * Only considers non-stale, non-consolidated chunks that have embeddings.
 * @param {string} userId
 * @param {number} [threshold=0.85] - Minimum cosine similarity to group together
 * @returns {Object[][]} Array of clusters (each cluster is an array of chunk objects)
 */
export function getChunkClusters(userId, threshold = 0.85) {
  const rows = d().prepare(`
    SELECT * FROM memory_chunks
    WHERE userId = ? AND category != 'stale' AND consolidatedInto IS NULL AND embedding IS NOT NULL
    ORDER BY createdAt DESC
  `).all(userId);

  const chunks = rows.map(parseRow);
  if (chunks.length < 2) return chunks.length === 1 ? [chunks] : [];

  // Deserialize embeddings
  const embeddings = chunks.map(c => deserializeEmbedding(c.embedding));

  // Union-Find with path compression and union by rank
  const parent = chunks.map((_, i) => i);
  const rank = new Array(chunks.length).fill(0);

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) parent[ra] = rb;
    else if (rank[ra] > rank[rb]) parent[rb] = ra;
    else { parent[rb] = ra; rank[ra]++; }
  }

  // Compute pairwise similarities and union similar chunks
  for (let i = 0; i < chunks.length; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim >= threshold) {
        union(i, j);
      }
    }
  }

  // Group by root
  const groups = new Map();
  for (let i = 0; i < chunks.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(chunks[i]);
  }

  return [...groups.values()];
}

/**
 * Flag source chunks as consolidated into a merged chunk.
 * Uses a transaction for atomicity.
 * @param {string[]} chunkIds - IDs of source chunks to flag
 * @param {string} mergedChunkId - ID of the merged chunk they were consolidated into
 */
export function markConsolidated(chunkIds, mergedChunkId) {
  if (!chunkIds || chunkIds.length === 0) return;
  const stmt = d().prepare('UPDATE memory_chunks SET consolidatedInto = ? WHERE id = ?');
  const tx = d().transaction(() => {
    for (const id of chunkIds) {
      stmt.run(mergedChunkId, id);
    }
  });
  tx();
}

/**
 * Soft-delete a chunk by setting its category to 'stale' (recoverable).
 * @param {string} chunkId
 * @returns {boolean} True if a row was updated
 */
export function softDelete(chunkId) {
  const result = d().prepare("UPDATE memory_chunks SET category = 'stale' WHERE id = ?").run(chunkId);
  return result.changes > 0;
}

/**
 * Get unconsolidated chunks with confidence above 0.5 (consolidation candidates).
 * Excludes stale chunks.
 * @param {string} userId
 * @returns {Object[]} Candidate chunks sorted by confidence descending
 */
export function getConsolidationCandidates(userId) {
  const rows = d().prepare(`
    SELECT * FROM memory_chunks
    WHERE userId = ? AND consolidatedInto IS NULL AND category != 'stale' AND confidence > 0.5
    ORDER BY confidence DESC
  `).all(userId);
  return rows.map(parseRow);
}

/**
 * Return access frequency and recency statistics per chunk.
 * @param {string} userId
 * @returns {Array<{id: string, accessedAt: string, accessCount: number, createdAt: string}>}
 */
export function getAccessStats(userId) {
  const rows = d().prepare(`
    SELECT id, accessedAt, accessCount, createdAt FROM memory_chunks
    WHERE userId = ? AND category != 'stale'
  `).all(userId);

  return rows.map(r => ({
    id: r.id,
    accessedAt: r.accessedAt,
    accessCount: r.accessCount || 0,
    createdAt: r.createdAt,
  }));
}

/**
 * Update the confidence score for a chunk (clamped to [0, 1]).
 * @param {string} chunkId
 * @param {number} newConfidence
 * @returns {boolean} True if a row was updated
 */
export function updateConfidence(chunkId, newConfidence) {
  const clamped = Math.max(0, Math.min(1, newConfidence));
  const result = d().prepare('UPDATE memory_chunks SET confidence = ? WHERE id = ?').run(clamped, chunkId);
  return result.changes > 0;
}

/**
 * Get all distinct user IDs that have memory chunks.
 * @returns {string[]}
 */
export function getAllUserIds() {
  const rows = d().prepare('SELECT DISTINCT userId FROM memory_chunks').all();
  return rows.map(r => r.userId);
}
