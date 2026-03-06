/**
 * @module lib/embeddings
 * Pluggable embedding pipeline for context search and memory retrieval.
 * Supports OpenAI text-embedding-3-small, Gemini text-embedding-004 (API key + OAuth),
 * and a deterministic mock provider for tests.
 */

import OpenAI from 'openai';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
 * Create a Gemini embedding provider using text-embedding-004 (768 dims).
 * Uses Google's generative AI REST API directly (no SDK dependency).
 *
 * @param {string} apiKey - Gemini API key
 * @param {Object} [opts]
 * @param {string} [opts.model='text-embedding-004']
 * @param {number} [opts.dimensions=768]
 * @returns {EmbeddingProvider}
 */
export function createGeminiProvider(apiKey, opts = {}) {
  const model = opts.model || 'text-embedding-004';
  const dimensions = opts.dimensions || 768;
  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}`;

  return {
    dimensions,

    async embed(text) {
      const res = await fetch(`${baseUrl}:embedContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: dimensions,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini embedding failed (${res.status}): ${err}`);
      }
      const data = await res.json();
      return new Float32Array(data.embedding.values);
    },

    async embedBatch(texts) {
      if (texts.length === 0) return [];
      // Gemini batchEmbedContents endpoint
      const res = await fetch(`${baseUrl}:batchEmbedContents?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: texts.map(text => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            outputDimensionality: dimensions,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini batch embedding failed (${res.status}): ${err}`);
      }
      const data = await res.json();
      return data.embeddings.map(e => new Float32Array(e.values));
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Gemini OAuth Provider (uses Gemini CLI credentials)               */
/* ------------------------------------------------------------------ */

/** Gemini CLI OAuth client credentials (public, embedded in CLI binary) */
const GEMINI_CLI_CLIENT_ID = '';
const GEMINI_CLI_CLIENT_SECRET = '';
const GEMINI_CLI_CREDS_PATH = join(homedir(), '.gemini', 'oauth_creds.json');
const TOKEN_REFRESH_URL = 'https://oauth2.googleapis.com/token';

/**
 * Load and optionally refresh Gemini CLI OAuth credentials.
 * Returns a valid access_token.
 *
 * @returns {Promise<string>} access_token
 */
async function getGeminiOAuthToken() {
  let creds;
  try {
    creds = JSON.parse(readFileSync(GEMINI_CLI_CREDS_PATH, 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot read Gemini CLI creds at ${GEMINI_CLI_CREDS_PATH}: ${err.message}`);
  }

  // Check if token is still valid (with 60s safety margin)
  const now = Date.now();
  if (creds.expiry_date && creds.expiry_date > now + 60_000) {
    return creds.access_token;
  }

  // Token expired — refresh it
  if (!creds.refresh_token) {
    throw new Error('Gemini OAuth token expired and no refresh_token available');
  }

  console.log('[embeddings] Gemini OAuth token expired, refreshing...');

  const body = new URLSearchParams({
    client_id: GEMINI_CLI_CLIENT_ID,
    client_secret: GEMINI_CLI_CLIENT_SECRET,
    refresh_token: creds.refresh_token,
    grant_type: 'refresh_token',
  });

  const res = await fetch(TOKEN_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini OAuth refresh failed (${res.status}): ${errText}`);
  }

  const refreshed = await res.json();

  // Update creds file
  creds.access_token = refreshed.access_token;
  creds.expiry_date = now + (refreshed.expires_in || 3600) * 1000;
  if (refreshed.id_token) creds.id_token = refreshed.id_token;

  try {
    writeFileSync(GEMINI_CLI_CREDS_PATH, JSON.stringify(creds, null, 2), 'utf-8');
    console.log('[embeddings] Gemini OAuth token refreshed, expires in', refreshed.expires_in, 's');
  } catch (writeErr) {
    console.warn('[embeddings] Could not persist refreshed token:', writeErr.message);
  }

  return creds.access_token;
}

/**
 * Create a Gemini embedding provider using OAuth (Gemini CLI credentials).
 * Reads access_token from ~/.gemini/oauth_creds.json, auto-refreshes on expiry.
 *
 * @param {Object} [opts]
 * @param {string} [opts.model='text-embedding-004']
 * @param {number} [opts.dimensions=768]
 * @returns {EmbeddingProvider}
 */
export function createGeminiOAuthProvider(opts = {}) {
  const model = opts.model || 'text-embedding-004';
  const dimensions = opts.dimensions || 768;
  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}`;

  return {
    dimensions,

    async embed(text) {
      const token = await getGeminiOAuthToken();
      const res = await fetch(`${baseUrl}:embedContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: dimensions,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini OAuth embedding failed (${res.status}): ${err}`);
      }
      const data = await res.json();
      return new Float32Array(data.embedding.values);
    },

    async embedBatch(texts) {
      if (texts.length === 0) return [];
      const token = await getGeminiOAuthToken();
      const res = await fetch(`${baseUrl}:batchEmbedContents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          requests: texts.map(text => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            outputDimensionality: dimensions,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini OAuth batch embedding failed (${res.status}): ${err}`);
      }
      const data = await res.json();
      return data.embeddings.map(e => new Float32Array(e.values));
    },
  };
}

/**
 * Create the best available Gemini embedding provider.
 * Priority: API Key → null.
 *
 * Note: Gemini CLI OAuth tokens do NOT have the right scope for the
 * embeddings API (generativelanguage.googleapis.com). Only API keys work.
 * Get a free key from https://aistudio.google.com/app/apikey
 *
 * @param {Object} [opts]
 * @returns {EmbeddingProvider|null}
 */
export function createBestGeminiProvider(opts = {}) {
  // Try secure key store first, fall back to process.env
  let apiKey;
  try {
    apiKey = _secureKeys?.getKey('GEMINI_API_KEY');
  } catch { /* secure store not ready yet */ }
  if (!apiKey) apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    console.log('[embeddings] Using Gemini API key provider (gemini-embedding-001)');
    return createGeminiProvider(apiKey, { model: 'gemini-embedding-001', ...opts });
  }

  return null;
}

/** @type {import('./secure-keys.js')|null} */
let _secureKeys = null;

/**
 * Late-bind the secure key store (called after DB init).
 * @param {import('./secure-keys.js')} secureKeys
 */
export function setSecureKeys(secureKeys) {
  _secureKeys = secureKeys;
}

/**
 * Create a fallback provider chain — tries each provider in order,
 * falls back to the next on failure. Logs warnings on fallback.
 *
 * All providers MUST share the same dimensions (use mock as last resort).
 *
 * @param {Array<{name: string, provider: EmbeddingProvider}>} chain
 * @returns {EmbeddingProvider}
 */
export function createFallbackProvider(chain) {
  if (chain.length === 0) throw new Error('Fallback chain must have at least one provider');

  const dimensions = chain[0].provider.dimensions;

  return {
    dimensions,

    async embed(text) {
      let lastErr;
      for (const { name, provider } of chain) {
        try {
          return await provider.embed(text);
        } catch (err) {
          lastErr = err;
          console.warn(`[embeddings] ${name} embed failed, trying next: ${err.message}`);
        }
      }
      throw lastErr;
    },

    async embedBatch(texts) {
      if (texts.length === 0) return [];
      let lastErr;
      for (const { name, provider } of chain) {
        try {
          return await provider.embedBatch(texts);
        } catch (err) {
          lastErr = err;
          console.warn(`[embeddings] ${name} embedBatch failed, trying next: ${err.message}`);
        }
      }
      throw lastErr;
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
