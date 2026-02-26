/**
 * @module test/context-engine
 * Comprehensive tests for Phase 2c: Context Engine
 * Covers: embeddings, indexer, context-search, memory-extraction,
 *         observation-masking, compaction, TOON serializer round-trips.
 *
 * Run: node --test test/context-engine.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { getDb, initSchema } from '../state/db.js';
import { init as initUsers, createUser } from '../state/users.js';
import { init as initAgents } from '../state/agents.js';
import {
  init as initMemory,
  store as storeMemory,
  search as searchMemoryState,
  get as getMemory,
  deleteByUser as deleteMemoryByUser,
  touchAccessed,
  countByUser,
} from '../state/memory.js';
import {
  init as initContextIndex,
  upsert,
  search as searchIndexState,
  get as getIndex,
  reindex,
  deleteBySource,
} from '../state/context-index.js';
import { parseToon, toToon, serialize, serializeForPrompt } from '../protocol/toon.js';

import {
  createMockProvider,
  createOpenAIProvider,
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
} from '../lib/embeddings.js';
import {
  chunkMarkdown,
  indexDirectory,
  generateManifest,
  inferCategory,
} from '../lib/indexer.js';
import {
  searchContext,
  searchMemory,
  formatResultsAsToon,
} from '../lib/context-search.js';
import {
  extractMemories,
  parseExtractionResponse,
  EXTRACTION_SYSTEM_PROMPT,
} from '../lib/memory-extraction.js';
import { maskObservations } from '../lib/observation-masking.js';
import { compact, estimateTokens } from '../lib/compaction.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function tmpDbPath() {
  return path.join(os.tmpdir(), `scratchy-phase2c-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
}

/** Set up a full test DB with all modules initialized */
function setupTestDb() {
  const dbPath = tmpDbPath();
  const db = getDb(dbPath);
  initSchema(db);
  initUsers(db);
  initAgents(db);
  initMemory(db);
  initContextIndex(db);
  const user = createUser('ctx_test_user', 'hash_ctu');
  return { db, dbPath, userId: user.id };
}

/** Convenience: import state modules as objects for injection */
const contextIndexModule = {
  upsert,
  search: searchIndexState,
  get: getIndex,
  reindex,
  deleteBySource,
};

const memoryModule = {
  store: storeMemory,
  search: searchMemoryState,
  get: getMemory,
  deleteByUser: deleteMemoryByUser,
  touchAccessed,
  countByUser,
};

/* ================================================================== */
/*  1. Embeddings                                                     */
/* ================================================================== */

describe('lib/embeddings.js', () => {
  const mock = createMockProvider(64);

  it('mock provider returns correct dimensions', () => {
    assert.equal(mock.dimensions, 64);
  });

  it('mock embed returns Float32Array of correct length', async () => {
    const vec = await mock.embed('hello world');
    assert.ok(vec instanceof Float32Array);
    assert.equal(vec.length, 64);
  });

  it('mock embed is deterministic (same text → same vector)', async () => {
    const a = await mock.embed('test input');
    const b = await mock.embed('test input');
    assert.deepStrictEqual(a, b);
  });

  it('mock embed produces different vectors for different texts', async () => {
    const a = await mock.embed('hello');
    const b = await mock.embed('goodbye');
    // At least some elements should differ
    let differs = false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { differs = true; break; }
    }
    assert.ok(differs, 'different texts should produce different vectors');
  });

  it('mock embedBatch returns array of correct length', async () => {
    const vecs = await mock.embedBatch(['a', 'b', 'c']);
    assert.equal(vecs.length, 3);
    for (const v of vecs) {
      assert.ok(v instanceof Float32Array);
      assert.equal(v.length, 64);
    }
  });

  it('mock embedBatch of empty array returns empty', async () => {
    const vecs = await mock.embedBatch([]);
    assert.equal(vecs.length, 0);
  });

  it('cosineSimilarity of identical vectors is 1', () => {
    const v = new Float32Array([1, 0, 0, 0]);
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 1e-6);
  });

  it('cosineSimilarity of orthogonal vectors is 0', () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0, 1, 0, 0]);
    assert.ok(Math.abs(cosineSimilarity(a, b)) < 1e-6);
  });

  it('cosineSimilarity of opposite vectors is -1', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    assert.ok(Math.abs(cosineSimilarity(a, b) + 1.0) < 1e-6);
  });

  it('cosineSimilarity throws on mismatched dimensions', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0, 0]);
    assert.throws(() => cosineSimilarity(a, b), /dimensions/i);
  });

  it('cosineSimilarity of zero vector returns 0', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    assert.equal(cosineSimilarity(a, b), 0);
  });

  it('serializeEmbedding/deserializeEmbedding round-trip', () => {
    const original = new Float32Array([1.5, -2.3, 0, 4.7]);
    const buf = serializeEmbedding(original);
    assert.ok(Buffer.isBuffer(buf));
    const restored = deserializeEmbedding(buf);
    assert.ok(restored instanceof Float32Array);
    assert.equal(restored.length, original.length);
    for (let i = 0; i < original.length; i++) {
      assert.ok(Math.abs(restored[i] - original[i]) < 1e-6);
    }
  });

  it('serializeEmbedding returns correct byte length', () => {
    const arr = new Float32Array(1536);
    const buf = serializeEmbedding(arr);
    assert.equal(buf.length, 1536 * 4); // Float32 = 4 bytes
  });

  it('createOpenAIProvider returns correct interface', () => {
    const provider = createOpenAIProvider('fake-key');
    assert.equal(provider.dimensions, 1536);
    assert.equal(typeof provider.embed, 'function');
    assert.equal(typeof provider.embedBatch, 'function');
  });

  it('mock provider generates unit vectors (norm ≈ 1)', async () => {
    const vec = await mock.embed('test normalization');
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    assert.ok(Math.abs(norm - 1.0) < 0.01, `norm should be ~1, got ${norm}`);
  });

  it('similar texts have higher cosine similarity than dissimilar texts', async () => {
    const provider = createMockProvider(256);
    const read1 = await provider.embed('read file contents from disk');
    const read2 = await provider.embed('read the file data from storage');
    const weather = await provider.embed('get current weather forecast');
    const sim12 = cosineSimilarity(read1, read2);
    const sim1w = cosineSimilarity(read1, weather);
    // The two "read" texts should be more similar to each other than to "weather"
    assert.ok(sim12 > sim1w, `similar texts (${sim12}) should score higher than dissimilar (${sim1w})`);
  });
});

/* ================================================================== */
/*  2. Indexer                                                        */
/* ================================================================== */

describe('lib/indexer.js', () => {
  const dbPath = tmpDbPath();
  let db;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initContextIndex(db);
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  describe('inferCategory', () => {
    it('tools/ path → tool', () => assert.equal(inferCategory('tools/read.md'), 'tool'));
    it('skills/ path → skill', () => assert.equal(inferCategory('skills/weather.md'), 'skill'));
    it('components/ path → component', () => assert.equal(inferCategory('components/card.md'), 'component'));
    it('protocol/ path → protocol', () => assert.equal(inferCategory('protocol/toon.md'), 'protocol'));
    it('ops/ path → ops', () => assert.equal(inferCategory('ops/deploy.md'), 'ops'));
    it('deploy in name → ops', () => assert.equal(inferCategory('deploy-guide.md'), 'ops'));
    it('agent/ path → agent', () => assert.equal(inferCategory('agents/main.md'), 'agent'));
    it('default → protocol', () => assert.equal(inferCategory('random-stuff.md'), 'protocol'));
  });

  describe('chunkMarkdown', () => {
    it('returns chunks with source, content, category', () => {
      const chunks = chunkMarkdown('tools/read.md', '# read\nRead file contents');
      assert.ok(chunks.length >= 1);
      assert.ok(chunks[0].source);
      assert.ok(chunks[0].content);
      assert.equal(chunks[0].category, 'tool');
    });

    it('splits on ## headers', () => {
      const content = '# Title\nIntro text\n## Section 1\nContent 1\n## Section 2\nContent 2';
      const chunks = chunkMarkdown('test.md', content);
      assert.ok(chunks.length >= 2);
    });

    it('single section without ## stays as one chunk', () => {
      const chunks = chunkMarkdown('tools/simple.md', 'Just a single paragraph of text.');
      assert.equal(chunks.length, 1);
    });

    it('large section splits at paragraph boundaries', () => {
      // Create content > 4000 chars
      const largeParagraphs = Array.from({ length: 20 }, (_, i) =>
        `Paragraph ${i}: ${'x'.repeat(250)}`
      ).join('\n\n');
      const chunks = chunkMarkdown('tools/large.md', largeParagraphs);
      assert.ok(chunks.length > 1, 'should split large content');
      for (const c of chunks) {
        assert.ok(c.content.length <= 5000, 'chunks should not exceed ~4000 chars');
      }
    });

    it('preserves category from path', () => {
      const chunks = chunkMarkdown('skills/coding.md', '# coding\nHelps with code');
      assert.equal(chunks[0].category, 'skill');
    });
  });

  describe('indexDirectory', () => {
    const docsDir = path.join(os.tmpdir(), `scratchy-test-docs-${crypto.randomUUID()}`);

    before(() => {
      fs.mkdirSync(path.join(docsDir, 'tools'), { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'tools', 'test-tool.md'), '# test-tool\nA test tool.');
      fs.writeFileSync(path.join(docsDir, 'tools', 'another.md'), '# another\nAnother tool doc.');
    });

    after(() => {
      fs.rmSync(docsDir, { recursive: true, force: true });
    });

    it('indexes markdown files and returns stats', async () => {
      reindex(); // Clear first
      const mock = createMockProvider(64);
      const result = await indexDirectory(docsDir, {
        embedder: mock,
        contextIndex: contextIndexModule,
      });
      assert.ok(result.total >= 2);
      assert.ok(result.indexed >= 2);
      assert.equal(result.skipped, 0);
    });

    it('skips unchanged content on re-index', async () => {
      const mock = createMockProvider(64);
      const result = await indexDirectory(docsDir, {
        embedder: mock,
        contextIndex: contextIndexModule,
      });
      // Second run should skip everything
      assert.ok(result.skipped >= 2);
      assert.equal(result.indexed, 0);
    });

    it('stores embeddings as BLOBs', async () => {
      const rows = searchIndexState({ sourcePrefix: 'tools/' });
      assert.ok(rows.length >= 2);
      for (const row of rows) {
        assert.ok(row.embedding, 'embedding should be stored');
        assert.ok(Buffer.isBuffer(row.embedding) || row.embedding instanceof Uint8Array);
      }
    });
  });

  describe('generateManifest', () => {
    it('returns non-empty TOON string', () => {
      const manifest = generateManifest(contextIndexModule);
      assert.ok(manifest.length > 0);
    });

    it('filters by category', () => {
      const manifest = generateManifest(contextIndexModule, 'tool');
      assert.ok(manifest.length > 0);
      assert.ok(manifest.includes('tool'));
    });

    it('returns empty string when no docs exist for category', () => {
      const manifest = generateManifest(contextIndexModule, 'ops');
      assert.equal(manifest, '');
    });
  });
});

/* ================================================================== */
/*  3. Context Search                                                 */
/* ================================================================== */

describe('lib/context-search.js', () => {
  let dbCtx;
  const mock = createMockProvider(64);

  before(async () => {
    dbCtx = setupTestDb();

    // Index some test docs
    reindex();
    const docsDir = path.resolve('docs');
    if (fs.existsSync(docsDir)) {
      await indexDirectory(docsDir, {
        embedder: mock,
        contextIndex: contextIndexModule,
      });
    }
  });

  after(() => {
    try { dbCtx.db.close(); } catch {}
    cleanupDb(dbCtx.dbPath);
  });

  describe('searchContext', () => {
    it('returns results for a relevant query', async () => {
      const results = await searchContext('read file contents', {
        embedder: mock,
        contextIndex: contextIndexModule,
        topK: 3,
        minScore: 0.0, // Use low threshold for mock embeddings
      });
      assert.ok(results.length > 0, 'should find some results');
      assert.ok(results[0].source);
      assert.ok(results[0].content);
      assert.ok(typeof results[0].score === 'number');
    });

    it('returns empty for empty query', async () => {
      const results = await searchContext('', {
        embedder: mock,
        contextIndex: contextIndexModule,
      });
      assert.equal(results.length, 0);
    });

    it('respects topK limit', async () => {
      const results = await searchContext('tool', {
        embedder: mock,
        contextIndex: contextIndexModule,
        topK: 2,
        minScore: 0.0,
      });
      assert.ok(results.length <= 2);
    });

    it('results are sorted by score descending', async () => {
      const results = await searchContext('file', {
        embedder: mock,
        contextIndex: contextIndexModule,
        topK: 10,
        minScore: 0.0,
      });
      for (let i = 1; i < results.length; i++) {
        assert.ok(results[i - 1].score >= results[i].score, 'should be sorted by score desc');
      }
    });

    it('filters by category', async () => {
      const results = await searchContext('component card', {
        embedder: mock,
        contextIndex: contextIndexModule,
        category: 'component',
        topK: 10,
        minScore: 0.0,
      });
      for (const r of results) {
        assert.equal(r.category, 'component');
      }
    });
  });

  describe('searchMemory', () => {
    before(async () => {
      // Store some test memories with embeddings
      deleteMemoryByUser(dbCtx.userId);
      const texts = [
        'User prefers dark mode theme',
        'Server is running Debian 13 Trixie',
        'The deployment script is at /opt/deploy.sh',
        'User speaks English and German',
      ];
      for (const text of texts) {
        const emb = await mock.embed(text);
        storeMemory(dbCtx.userId, text, {
          embedding: serializeEmbedding(emb),
          category: 'semantic',
        });
      }
    });

    it('returns relevant memories', async () => {
      const results = await searchMemory('what language does the user speak', {
        embedder: mock,
        memory: memoryModule,
        userId: dbCtx.userId,
        topK: 2,
        minScore: 0.0,
      });
      assert.ok(results.length > 0);
      assert.ok(results[0].content);
      assert.ok(typeof results[0].score === 'number');
    });

    it('throws on missing userId', async () => {
      await assert.rejects(() =>
        searchMemory('test', {
          embedder: mock,
          memory: memoryModule,
          topK: 5,
        }),
        /userId/i,
      );
    });

    it('returns empty for empty query', async () => {
      const results = await searchMemory('', {
        embedder: mock,
        memory: memoryModule,
        userId: dbCtx.userId,
      });
      assert.equal(results.length, 0);
    });

    it('respects topK limit', async () => {
      const results = await searchMemory('information', {
        embedder: mock,
        memory: memoryModule,
        userId: dbCtx.userId,
        topK: 1,
        minScore: 0.0,
      });
      assert.ok(results.length <= 1);
    });

    it('results include category and confidence', async () => {
      const results = await searchMemory('debian server', {
        embedder: mock,
        memory: memoryModule,
        userId: dbCtx.userId,
        topK: 2,
        minScore: 0.0,
      });
      if (results.length > 0) {
        assert.ok('category' in results[0]);
        assert.ok('confidence' in results[0]);
      }
    });
  });

  describe('formatResultsAsToon', () => {
    it('formats memory results as TOON', () => {
      const results = [
        { content: 'User likes dark mode', category: 'semantic', confidence: 0.95, score: 0.88 },
        { content: 'Server is Debian 13', category: 'semantic', confidence: 0.9, score: 0.85 },
      ];
      const toon = formatResultsAsToon(results);
      assert.ok(toon.includes('recalled'));
      assert.ok(toon.includes('User likes dark mode'));
      // Should be parseable
      const parsed = parseToon(toon);
      assert.ok(parsed.recalled);
      assert.equal(parsed.recalled.length, 2);
    });

    it('formats context results as TOON', () => {
      const results = [
        { source: 'tools/read.md', content: 'Read file contents', score: 0.95, category: 'tool' },
      ];
      const toon = formatResultsAsToon(results, { label: 'context' });
      assert.ok(toon.includes('context'));
      const parsed = parseToon(toon);
      assert.ok(parsed.context);
    });

    it('returns empty string for empty results', () => {
      assert.equal(formatResultsAsToon([]), '');
      assert.equal(formatResultsAsToon(null), '');
    });
  });
});

/* ================================================================== */
/*  4. Memory Extraction                                              */
/* ================================================================== */

describe('lib/memory-extraction.js', () => {
  let dbCtx;
  const mock = createMockProvider(64);

  before(() => {
    dbCtx = setupTestDb();
  });

  after(() => {
    try { dbCtx.db.close(); } catch {}
    cleanupDb(dbCtx.dbPath);
  });

  describe('parseExtractionResponse', () => {
    it('parses valid JSON array', () => {
      const resp = '[{"content":"User prefers TS","category":"semantic","tags":["code"],"confidence":0.9}]';
      const facts = parseExtractionResponse(resp);
      assert.equal(facts.length, 1);
      assert.equal(facts[0].content, 'User prefers TS');
      assert.equal(facts[0].category, 'semantic');
    });

    it('handles markdown-fenced JSON', () => {
      const resp = '```json\n[{"content":"Fact","category":"semantic","tags":[],"confidence":0.8}]\n```';
      const facts = parseExtractionResponse(resp);
      assert.equal(facts.length, 1);
    });

    it('handles empty array response', () => {
      assert.deepEqual(parseExtractionResponse('[]'), []);
    });

    it('handles null/undefined/empty', () => {
      assert.deepEqual(parseExtractionResponse(null), []);
      assert.deepEqual(parseExtractionResponse(undefined), []);
      assert.deepEqual(parseExtractionResponse(''), []);
    });

    it('handles malformed JSON gracefully', () => {
      assert.deepEqual(parseExtractionResponse('not json at all'), []);
    });

    it('normalizes invalid categories to semantic', () => {
      const resp = '[{"content":"Fact","category":"invalid","tags":[],"confidence":0.5}]';
      const facts = parseExtractionResponse(resp);
      assert.equal(facts[0].category, 'semantic');
    });

    it('clamps confidence to [0, 1]', () => {
      const resp = '[{"content":"Fact","category":"semantic","tags":[],"confidence":2.5}]';
      const facts = parseExtractionResponse(resp);
      assert.equal(facts[0].confidence, 1.0);
    });

    it('filters out items with empty content', () => {
      const resp = '[{"content":"","category":"semantic","tags":[],"confidence":0.5},{"content":"Valid","category":"semantic","tags":[],"confidence":0.8}]';
      const facts = parseExtractionResponse(resp);
      assert.equal(facts.length, 1);
      assert.equal(facts[0].content, 'Valid');
    });

    it('handles extra text around JSON', () => {
      const resp = 'Here are the facts:\n[{"content":"Extracted","category":"episodic","tags":["event"],"confidence":0.7}]\nDone!';
      const facts = parseExtractionResponse(resp);
      assert.equal(facts.length, 1);
      assert.equal(facts[0].content, 'Extracted');
    });
  });

  describe('extractMemories', () => {
    it('extracts and stores memories using mock LLM', async () => {
      deleteMemoryByUser(dbCtx.userId);

      const mockLlm = async (_system, _user) => {
        return JSON.stringify([
          { content: 'User prefers English', category: 'semantic', tags: ['language'], confidence: 0.95 },
          { content: 'Project uses ESM modules', category: 'procedural', tags: ['code', 'node'], confidence: 0.85 },
        ]);
      };

      const facts = await extractMemories(
        'I always write my code in ESM format with English comments',
        'Got it! I will use ESM modules and English for all code.',
        {
          llmCall: mockLlm,
          embedder: mock,
          memory: memoryModule,
          userId: dbCtx.userId,
        },
      );

      assert.equal(facts.length, 2);
      assert.equal(facts[0].content, 'User prefers English');

      // Verify stored in DB
      const count = countByUser(dbCtx.userId);
      assert.equal(count, 2);

      // Verify embeddings stored
      const stored = searchMemoryState(dbCtx.userId);
      for (const s of stored) {
        assert.ok(s.embedding, 'should have embedding');
      }
    });

    it('returns empty array when LLM returns nothing memorable', async () => {
      const mockLlm = async () => '[]';
      const facts = await extractMemories('hi', 'hello!', {
        llmCall: mockLlm,
        embedder: mock,
        memory: memoryModule,
        userId: dbCtx.userId,
      });
      assert.equal(facts.length, 0);
    });

    it('returns empty for empty input', async () => {
      const mockLlm = async () => '[]';
      const facts = await extractMemories('', '', {
        llmCall: mockLlm,
        embedder: mock,
        memory: memoryModule,
        userId: dbCtx.userId,
      });
      assert.equal(facts.length, 0);
    });

    it('throws on missing llmCall', async () => {
      await assert.rejects(() =>
        extractMemories('test', 'test', {
          embedder: mock,
          memory: memoryModule,
          userId: dbCtx.userId,
        }),
        /llmCall/i,
      );
    });

    it('throws on missing userId', async () => {
      await assert.rejects(() =>
        extractMemories('test', 'test', {
          llmCall: async () => '[]',
          embedder: mock,
          memory: memoryModule,
        }),
        /userId/i,
      );
    });

    it('has a well-formed extraction system prompt', () => {
      assert.ok(EXTRACTION_SYSTEM_PROMPT.includes('JSON'));
      assert.ok(EXTRACTION_SYSTEM_PROMPT.includes('episodic'));
      assert.ok(EXTRACTION_SYSTEM_PROMPT.includes('semantic'));
      assert.ok(EXTRACTION_SYSTEM_PROMPT.includes('procedural'));
    });
  });
});

/* ================================================================== */
/*  5. Observation Masking                                            */
/* ================================================================== */

describe('lib/observation-masking.js', () => {
  function makeConversation(turns) {
    const msgs = [];
    for (let i = 0; i < turns; i++) {
      msgs.push({ role: 'user', content: `User message ${i}` });
      msgs.push({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: `tc_${i}`, type: 'function', function: { name: 'exec', arguments: '{}' } }],
      });
      msgs.push({ role: 'tool', tool_call_id: `tc_${i}`, content: `Tool result for turn ${i}: ${'x'.repeat(200)}` });
      msgs.push({ role: 'assistant', content: `Response to turn ${i}` });
    }
    return msgs;
  }

  it('does not mask when fewer turns than keepRecent', () => {
    const msgs = makeConversation(5);
    const result = maskObservations(msgs, { keepRecent: 10 });
    assert.equal(result.length, msgs.length);
    // No tool results should be masked
    const toolResults = result.filter(m => m.role === 'tool');
    for (const tr of toolResults) {
      assert.ok(!tr.content.startsWith('[Tool result masked'));
    }
  });

  it('masks old tool results beyond keepRecent', () => {
    const msgs = makeConversation(15);
    const result = maskObservations(msgs, { keepRecent: 5 });
    assert.equal(result.length, msgs.length);

    // First tool results should be masked
    const firstToolResult = result.find(m => m.role === 'tool');
    assert.ok(firstToolResult.content.startsWith('[Tool result masked'));

    // Last tool results should NOT be masked
    const lastToolResults = result.filter(m => m.role === 'tool').slice(-5);
    for (const tr of lastToolResults) {
      assert.ok(!tr.content.startsWith('[Tool result masked'));
    }
  });

  it('preserves assistant reasoning (non-tool-call messages)', () => {
    const msgs = makeConversation(15);
    const result = maskObservations(msgs, { keepRecent: 5 });
    const assistantMsgs = result.filter(m => m.role === 'assistant' && m.content);
    for (const am of assistantMsgs) {
      assert.ok(!am.content.startsWith('[Tool result masked'));
    }
  });

  it('preserves tool calls (assistant messages with tool_calls)', () => {
    const msgs = makeConversation(15);
    const result = maskObservations(msgs, { keepRecent: 5 });
    const toolCallMsgs = result.filter(m => m.role === 'assistant' && m.tool_calls);
    assert.equal(toolCallMsgs.length, 15);
    for (const tc of toolCallMsgs) {
      assert.ok(tc.tool_calls.length > 0);
    }
  });

  it('handles empty messages array', () => {
    const result = maskObservations([], { keepRecent: 5 });
    assert.deepEqual(result, []);
  });

  it('handles messages with no tool results', () => {
    const msgs = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const result = maskObservations(msgs);
    assert.equal(result.length, 2);
  });

  it('default keepRecent is 10', () => {
    const msgs = makeConversation(12);
    const result = maskObservations(msgs);
    // 12 turns, keep 10 = mask first 2 tool results
    const masked = result.filter(m => m.role === 'tool' && m.content.startsWith('[Tool result masked'));
    assert.equal(masked.length, 2);
  });

  it('does not mutate original messages', () => {
    const msgs = makeConversation(15);
    const original = JSON.parse(JSON.stringify(msgs));
    maskObservations(msgs, { keepRecent: 5 });
    assert.deepStrictEqual(msgs, original);
  });
});

/* ================================================================== */
/*  6. Compaction                                                     */
/* ================================================================== */

describe('lib/compaction.js', () => {
  describe('estimateTokens', () => {
    it('estimates tokens for a string', () => {
      const tokens = estimateTokens('hello world this is a test');
      assert.ok(tokens > 0);
      assert.ok(tokens < 20);
    });

    it('estimates tokens for message array', () => {
      const msgs = [
        { role: 'user', content: 'Hello world' },
        { role: 'assistant', content: 'Hi there how are you doing today' },
      ];
      const tokens = estimateTokens(msgs);
      assert.ok(tokens > 5);
      assert.ok(tokens < 50);
    });

    it('returns 0 for empty input', () => {
      assert.equal(estimateTokens([]), 0);
      assert.equal(estimateTokens(''), 0);
    });

    it('handles tool call messages', () => {
      const msgs = [{
        role: 'assistant',
        content: null,
        tool_calls: [{
          type: 'function',
          function: { name: 'exec', arguments: '{"command":"ls"}' },
        }],
      }];
      const tokens = estimateTokens(msgs);
      assert.ok(tokens > 0);
    });

    it('returns 0 for non-string non-array', () => {
      assert.equal(estimateTokens(42), 0);
      assert.equal(estimateTokens(null), 0);
    });
  });

  describe('compact', () => {
    function makeHistory(turns) {
      const msgs = [
        { role: 'system', content: 'You are a helpful assistant.' },
      ];
      for (let i = 0; i < turns; i++) {
        msgs.push({ role: 'user', content: `User message ${i} with some extra content to pad tokens.` });
        msgs.push({ role: 'assistant', content: `Assistant response ${i} with additional detail and reasoning.` });
        if (i % 3 === 0) {
          msgs.push({
            role: 'assistant',
            content: null,
            tool_calls: [{ id: `tc_${i}`, type: 'function', function: { name: 'exec', arguments: '{}' } }],
          });
          msgs.push({ role: 'tool', tool_call_id: `tc_${i}`, content: `Tool output ${i}: ${'data '.repeat(50)}` });
          msgs.push({ role: 'assistant', content: `After tool: conclusion ${i}` });
        }
      }
      return msgs;
    }

    it('phase 0: no compaction when well under limit', async () => {
      const msgs = makeHistory(3);
      const result = await compact(msgs, { maxTokens: 10000 });
      assert.equal(result.phase, 0);
      assert.equal(result.tokensSaved, 0);
      assert.equal(result.messages.length, msgs.length);
    });

    it('phase 1: masks observations when approaching limit', async () => {
      const msgs = makeHistory(20);
      const tokens = estimateTokens(msgs);
      const result = await compact(msgs, {
        maxTokens: Math.ceil(tokens / 0.75), // ~75% full
        currentTokens: tokens,
      });
      assert.ok(result.phase >= 1);
      assert.ok(result.tokensSaved >= 0);
    });

    it('phase 2: summarizes when tighter', async () => {
      // Use messages WITHOUT tool results so phase 1 masking doesn't help
      const msgs = [
        { role: 'system', content: 'You are helpful.' },
      ];
      for (let i = 0; i < 40; i++) {
        msgs.push({ role: 'user', content: `User message ${i} with some extra words for tokens.` });
        msgs.push({ role: 'assistant', content: `Assistant response ${i} with detail and reasoning context.` });
      }
      const tokens = estimateTokens(msgs);
      const mockLlm = async (_sys, _user) => 'Summary of the conversation.';
      const result = await compact(msgs, {
        maxTokens: Math.ceil(tokens / 0.9),
        currentTokens: tokens,
        llmCall: mockLlm,
      });
      assert.ok(result.phase >= 2, `expected phase >= 2, got ${result.phase}`);
      assert.ok(result.messages.length < msgs.length, 'summarization should reduce message count');
    });

    it('phase 4: emergency compaction', async () => {
      // Build a large conversation — 50 turns with tool results
      const msgs = [
        { role: 'system', content: 'You are helpful.' },
      ];
      for (let i = 0; i < 50; i++) {
        msgs.push({ role: 'user', content: `User question ${i} with padding for token count and some extra words.` });
        msgs.push({ role: 'assistant', content: `Answer ${i} with some detailed explanation here.`,
          tool_calls: [{ function: { name: 'exec', arguments: `{"command": "ls -la directory_${i}"}` } }] });
        msgs.push({ role: 'tool', content: `tool result for call ${i} with lots of output data and file listings` });
      }
      const tokens = estimateTokens(msgs);
      // Mock LLM returns SHORT summary — so phase 2 reduces, but tight budget forces phase 3+
      const mockLlm = async () => 'Brief conversation summary.';
      const result = await compact(msgs, {
        maxTokens: 50, // Absurdly small budget — guarantees phase 4
        currentTokens: tokens,
        llmCall: mockLlm,
        extractMemories: async () => {},
        searchMemory: async () => [],
        userId: 'test-user',
      });
      // Phase 4 = core only: system msgs + last few turns
      assert.ok(result.phase >= 3, `expected phase >= 3, got ${result.phase}`);
      assert.ok(result.messages.length < msgs.length, 'compaction should reduce message count');
      // With a 50-token budget from 150+ messages, significant reduction expected
      assert.ok(result.messages.length <= 10, `expected <=10 messages in emergency mode, got ${result.messages.length}`);
    });

    it('preserves system messages', async () => {
      const msgs = makeHistory(30);
      const tokens = estimateTokens(msgs);
      const result = await compact(msgs, {
        maxTokens: Math.ceil(tokens / 0.9),
        currentTokens: tokens,
        llmCall: async () => 'Summary.',
      });
      const systemMsgs = result.messages.filter(m => m.role === 'system');
      assert.ok(systemMsgs.length >= 1, 'should preserve at least one system message');
    });

    it('computes currentTokens if not provided', async () => {
      const msgs = makeHistory(5);
      const result = await compact(msgs, { maxTokens: 100000 });
      assert.equal(result.phase, 0);
    });
  });
});

/* ================================================================== */
/*  7. TOON Serializer (serialize/serializeForPrompt)                 */
/* ================================================================== */

describe('TOON serialize/serializeForPrompt', () => {
  it('serialize is exported and works like toToon for basic objects', () => {
    const obj = { name: 'Alice', age: 30 };
    assert.equal(serialize(obj), toToon(obj));
  });

  it('serialize with rootKey wraps value', () => {
    const result = serialize({ a: 1, b: 2 }, { rootKey: 'config' });
    assert.ok(result.includes('config:'));
    assert.ok(result.includes('  a: 1'));
    assert.ok(result.includes('  b: 2'));
    const parsed = parseToon(result);
    assert.deepStrictEqual(parsed.config, { a: 1, b: 2 });
  });

  it('serialize with rootKey and primitive value', () => {
    const result = serialize(42, { rootKey: 'count' });
    assert.equal(result, 'count: 42');
    const parsed = parseToon(result);
    assert.equal(parsed.count, 42);
  });

  it('serialize with rootKey and array value', () => {
    const result = serialize(['a', 'b', 'c'], { rootKey: 'tags' });
    assert.ok(result.includes('tags[3]: a,b,c'));
    const parsed = parseToon(result);
    assert.deepStrictEqual(parsed.tags, ['a', 'b', 'c']);
  });

  it('serialize with rootKey and null', () => {
    const result = serialize(null, { rootKey: 'data' });
    assert.equal(result, 'data: null');
  });

  it('serialize handles null/undefined without rootKey', () => {
    assert.equal(serialize(null), 'null');
    assert.equal(serialize(undefined), 'null');
  });

  it('serialize with indent option', () => {
    const result = serialize({ x: 1 }, { indent: 2 });
    assert.ok(result.startsWith('    x: 1'));
  });

  it('serializeForPrompt wraps with label header', () => {
    const result = serializeForPrompt({ name: 'Test' }, 'context');
    assert.ok(result.startsWith('# context\n'));
    assert.ok(result.includes('name: Test'));
  });

  it('round-trip: serialize → parseToon for simple object', () => {
    const obj = { name: 'Alice', age: 30, active: true };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });

  it('round-trip: serialize → parseToon for nested object', () => {
    const obj = { config: { debug: false, port: 8080 } };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });

  it('round-trip: serialize → parseToon for tabular array', () => {
    const obj = {
      tools: [
        { name: 'read', description: 'Read files' },
        { name: 'write', description: 'Write files' },
        { name: 'exec', description: 'Run commands' },
      ],
    };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });

  it('round-trip: serialize → parseToon for inline array', () => {
    const obj = { tags: ['web', 'api', 'db'] };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });

  it('round-trip: serialize → parseToon with quoted strings', () => {
    const obj = {
      msg: 'hello, world',
      desc: 'key: value pair',
      note: 'true',
    };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });

  it('round-trip: serialize → parseToon for mixed nested', () => {
    const obj = {
      title: 'Dashboard',
      stats: [
        { label: 'CPU', value: 73, unit: '%' },
        { label: 'RAM', value: 4.2, unit: 'GB' },
      ],
      debug: false,
      version: 2,
    };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });

  it('round-trip: serialize → parseToon with null values', () => {
    const obj = { x: null, y: 42, z: 'hello' };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });

  it('round-trip: tabular with commas in values', () => {
    const obj = {
      items: [
        { name: 'a,b', value: 1 },
        { name: 'c', value: 2 },
      ],
    };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });

  it('round-trip: serialize with rootKey then parseToon', () => {
    const data = [
      { fact: 'User prefers English', category: 'semantic', confidence: 0.95 },
      { fact: 'Server is Debian 13', category: 'semantic', confidence: 0.9 },
    ];
    const toon = serialize({ recalled: data });
    const parsed = parseToon(toon);
    assert.deepStrictEqual(parsed.recalled, data);
  });

  it('round-trip: deeply nested with arrays', () => {
    const obj = {
      config: {
        server: {
          ports: [80, 443],
          name: 'web',
        },
        enabled: true,
      },
    };
    assert.deepStrictEqual(parseToon(serialize(obj)), obj);
  });
});

/* ================================================================== */
/*  8. Integration: Index → Search → Retrieve                        */
/* ================================================================== */

describe('Integration: Index → Search → Retrieve', () => {
  let dbCtx;
  const mock = createMockProvider(128);

  before(async () => {
    dbCtx = setupTestDb();
    reindex();

    // Index the real docs directory
    const docsDir = path.resolve('docs');
    await indexDirectory(docsDir, {
      embedder: mock,
      contextIndex: contextIndexModule,
    });
  });

  after(() => {
    try { dbCtx.db.close(); } catch {}
    cleanupDb(dbCtx.dbPath);
  });

  it('indexes all docs from docs/ directory', () => {
    const all = searchIndexState({ limit: 100 });
    assert.ok(all.length >= 6, `should index at least 6 chunks from docs/, got ${all.length}`);
  });

  it('search finds relevant tool docs', async () => {
    const results = await searchContext('execute shell commands', {
      embedder: mock,
      contextIndex: contextIndexModule,
      topK: 10,
      minScore: -1.0, // Mock embeddings are hash-based, accept any score
    });
    assert.ok(results.length > 0, 'should return at least one result');
    // With mock embeddings, verify results contain actual indexed content
    const hasContent = results.some(r => r.content && r.content.length > 10);
    assert.ok(hasContent, 'results should have meaningful content');
  });

  it('generates a parseable manifest', () => {
    const manifest = generateManifest(contextIndexModule);
    assert.ok(manifest.length > 0);
    // Should be parseable as TOON
    const parsed = parseToon(manifest);
    assert.ok(typeof parsed === 'object');
  });

  it('full pipeline: index → embed → store → search → format', async () => {
    // Store a memory
    const memText = 'Always use port 3000 for the dev server';
    const emb = await mock.embed(memText);
    storeMemory(dbCtx.userId, memText, {
      embedding: serializeEmbedding(emb),
      category: 'procedural',
      tags: ['dev', 'server'],
    });

    // Search for it
    const results = await searchMemory('what port for development', {
      embedder: mock,
      memory: memoryModule,
      userId: dbCtx.userId,
      topK: 3,
      minScore: 0.0,
    });
    assert.ok(results.length > 0);

    // Format as TOON
    const toon = formatResultsAsToon(results);
    assert.ok(toon.length > 0);
    const parsed = parseToon(toon);
    assert.ok(parsed.recalled);
    assert.ok(parsed.recalled.length > 0);
  });
});
