/**
 * @module lib/context-search
 * Semantic search layer for context_index and memory_chunks.
 * Uses brute-force cosine similarity over all embeddings in the relevant table.
 * Formats results as TOON for LLM prompt injection.
 */

import {
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
} from './embeddings.js';
import { serialize } from '../protocol/toon.js';

/**
 * Search the context index using semantic similarity.
 *
 * @param {string} query - Natural language query
 * @param {Object} opts
 * @param {import('./embeddings.js').EmbeddingProvider} opts.embedder - Embedding provider
 * @param {Object} opts.contextIndex - state/context-index module
 * @param {number} [opts.topK=5] - Max results
 * @param {string} [opts.category] - Filter by category
 * @param {number} [opts.minScore=0.3] - Minimum cosine similarity
 * @returns {Promise<Array<{source: string, content: string, score: number, category: string}>>}
 */
export async function searchContext(query, opts) {
  const { embedder, contextIndex, topK = 5, category, minScore = 0.3 } = opts;

  if (!query || typeof query !== 'string') return [];

  // Embed the query
  const queryVec = await embedder.embed(query);

  // Get all rows (with optional category filter)
  const searchOpts = { limit: 10000 };
  if (category) searchOpts.category = category;
  const rows = contextIndex.search(searchOpts);

  // Score each row by cosine similarity
  const scored = [];
  for (const row of rows) {
    if (!row.embedding) continue;
    const rowVec = deserializeEmbedding(row.embedding);
    const score = cosineSimilarity(queryVec, rowVec);
    if (score >= minScore) {
      scored.push({
        source: row.source,
        content: row.content,
        score: Math.round(score * 1000) / 1000,
        category: row.category,
      });
    }
  }

  // Sort by score descending, take topK
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * Search memory chunks using semantic similarity.
 *
 * @param {string} query - Natural language query
 * @param {Object} opts
 * @param {import('./embeddings.js').EmbeddingProvider} opts.embedder - Embedding provider
 * @param {Object} opts.memory - state/memory module
 * @param {string} opts.userId - Required user ID filter
 * @param {string} [opts.agentId] - Optional agent ID filter
 * @param {string} [opts.category] - Optional category filter
 * @param {number} [opts.topK=5] - Max results
 * @param {number} [opts.minScore=0.3] - Minimum cosine similarity
 * @returns {Promise<Array<{content: string, category: string, confidence: number, score: number, tags: string[], id: string}>>}
 */
export async function searchMemory(query, opts) {
  const { embedder, memory, userId, agentId, category, topK = 5, minScore = 0.3 } = opts;

  if (!query || typeof query !== 'string') return [];
  if (!userId) throw new Error('userId is required for memory search');

  // Embed the query
  const queryVec = await embedder.embed(query);

  // Get all memory chunks for the user
  const searchOpts = { limit: 10000 };
  if (agentId !== undefined) searchOpts.agentId = agentId;
  if (category) searchOpts.category = category;
  const rows = memory.search(userId, searchOpts);

  // Score each row
  const scored = [];
  for (const row of rows) {
    if (!row.embedding) continue;
    const rowVec = deserializeEmbedding(row.embedding);
    const score = cosineSimilarity(queryVec, rowVec);
    if (score >= minScore) {
      scored.push({
        id: row.id,
        content: row.content,
        category: row.category,
        confidence: row.confidence,
        tags: row.tags || [],
        score: Math.round(score * 1000) / 1000,
      });
    }
  }

  // Sort by score descending, take topK
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, topK);

  // Touch accessed timestamps
  for (const r of results) {
    memory.touchAccessed(r.id);
  }

  return results;
}

/**
 * Format search results as TOON for LLM prompt injection.
 *
 * @param {Array} results - Results from searchContext or searchMemory
 * @param {Object} [opts]
 * @param {string} [opts.label='recalled'] - Root key name
 * @param {string[]} [opts.fields] - Fields to include (default depends on result type)
 * @returns {string} TOON-formatted string
 */
export function formatResultsAsToon(results, opts = {}) {
  const { label = 'recalled' } = opts;

  if (!results || results.length === 0) return '';

  // Detect if these are memory results (have confidence) or context results (have source)
  const isMemory = 'confidence' in (results[0] || {});

  const rows = results.map(r => {
    if (isMemory) {
      return {
        fact: r.content,
        category: r.category,
        confidence: r.confidence,
      };
    }
    return {
      source: r.source,
      content: r.content.replace(/\n/g, ' ').slice(0, 120),
      score: r.score,
    };
  });

  return serialize({ [label]: rows });
}
