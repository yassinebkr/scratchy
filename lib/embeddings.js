/**
 * @module lib/embeddings
 * Pluggable embedding pipeline for context search and memory retrieval.
 * Supports OpenAI text-embedding-3-small and a deterministic mock provider for tests.
 */

import OpenAI from 'openai';

/**
 * @typedef {Object} EmbeddingProvider
 * @property {(text: string) => Promise<Float32Array>} embed - Embed a single text
 * @property {(texts: string[]) => Promise<Float32Array[]>} embedBatch - Embed multiple texts
 * @property {number} dimensions - Embedding dimensions
 */

/**
 * Create an OpenAI embedding provider using text-embedding-3-small (1536 dims).
 * @param {string} apiKey - OpenAI API key
 * @param {Object} [opts]
 * @param {string} [opts.model='text-embedding-3-small']
 * @param {number} [opts.dimensions=1536]
 * @returns {EmbeddingProvider}
 */
export function createOpenAIProvider(apiKey, opts = {}) {
  const model = opts.model || 'text-embedding-3-small';
  const dimensions = opts.dimensions || 1536;
  const client = new OpenAI({ apiKey });

  return {
    dimensions,

    async embed(text) {
      const resp = await client.embeddings.create({
        model,
        input: text,
        dimensions,
      });
      return new Float32Array(resp.data[0].embedding);
    },

    async embedBatch(texts) {
      if (texts.length === 0) return [];
      const resp = await client.embeddings.create({
        model,
        input: texts,
        dimensions,
      });
      // Sort by index to maintain input order
      const sorted = resp.data.sort((a, b) => a.index - b.index);
      return sorted.map(d => new Float32Array(d.embedding));
    },
  };
}

/**
 * Create a deterministic mock embedding provider for tests.
 * Generates reproducible vectors based on text content hash.
 * Texts with shared words will have higher cosine similarity.
 *
 * @param {number} [dimensions=1536] - Embedding dimensions
 * @returns {EmbeddingProvider}
 */
export function createMockProvider(dimensions = 1536) {
  /**
   * Generate a deterministic pseudo-random vector from a seed.
   * Uses a simple hash-based PRNG for reproducibility.
   */
  function hashVector(text) {
    const vec = new Float32Array(dimensions);
    // Tokenize into words for semantic-ish similarity
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);

    // Base vector from full text hash
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }

    // Seed the vector from the hash
    let seed = Math.abs(hash) || 1;
    for (let i = 0; i < dimensions; i++) {
      // xorshift32
      seed ^= seed << 13;
      seed ^= seed >> 17;
      seed ^= seed << 5;
      vec[i] = (seed >>> 0) / 4294967296 - 0.5;
    }

    // Add word-based components for semantic similarity
    for (const word of words) {
      let wordSeed = 0;
      for (let i = 0; i < word.length; i++) {
        wordSeed = ((wordSeed << 5) - wordSeed + word.charCodeAt(i)) | 0;
      }
      wordSeed = Math.abs(wordSeed) || 1;
      for (let i = 0; i < Math.min(64, dimensions); i++) {
        wordSeed ^= wordSeed << 13;
        wordSeed ^= wordSeed >> 17;
        wordSeed ^= wordSeed << 5;
        vec[i] += ((wordSeed >>> 0) / 4294967296 - 0.5) * 0.3;
      }
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) vec[i] /= norm;
    }

    return vec;
  }

  return {
    dimensions,

    async embed(text) {
      return hashVector(text);
    },

    async embedBatch(texts) {
      return texts.map(t => hashVector(t));
    },
  };
}

/**
 * Compute cosine similarity between two Float32Arrays.
 * Returns a value between -1 and 1 (1 = identical direction).
 *
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} Cosine similarity
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) throw new Error('Vectors must have same dimensions');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Serialize a Float32Array to a Buffer for SQLite BLOB storage.
 * @param {Float32Array} arr
 * @returns {Buffer}
 */
export function serializeEmbedding(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Deserialize a Buffer from SQLite BLOB storage to Float32Array.
 * @param {Buffer} buf
 * @returns {Float32Array}
 */
export function deserializeEmbedding(buf) {
  // Copy to ensure alignment
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; i++) view[i] = buf[i];
  return new Float32Array(ab);
}
