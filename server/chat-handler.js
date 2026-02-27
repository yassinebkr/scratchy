/**
 * @module server/chat-handler
 * Scratchy v2 — AI Chat Handler via NullClaw Pipeline
 *
 * Full chat pipeline:
 *   User message → conversation history → context search (semantic retrieval)
 *   → build augmented prompt → NullClaw adapter (per-user instance)
 *   → stream response → async memory extraction + consolidation scheduling
 *
 * Falls back to direct NullClaw spawn if the adapter pool fails.
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

import { NullClawAdapter } from '../lib/nullclaw-adapter.js';
import { searchContext, searchMemory, formatResultsAsToon } from '../lib/context-search.js';
import { createOpenAIProvider, createMockProvider } from '../lib/embeddings.js';
import { extractMemories } from '../lib/memory-extraction.js';
import { maskObservations } from '../lib/observation-masking.js';
import { MemoryConsolidator } from '../lib/memory-consolidation.js';
import { MemoryScheduler } from '../lib/memory-scheduler.js';
import { compact, estimateTokens } from '../lib/compaction.js';
import * as memory from '../state/memory.js';
import * as contextIndex from '../state/context-index.js';
import { isA2UIMessage, parseA2UIMessage, a2uiToGenUI } from '../protocol/a2ui.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NULLCLAW_BIN = '/home/nonbios/nullclaw/zig-out/bin/nullclaw';
const NULLCLAW_TIMEOUT = 60_000; // 60s max per response (fallback spawn)

/** Max context tokens before compaction kicks in */
const MAX_CONTEXT_TOKENS = 8_000;

/** Number of history turns to retrieve for prompt building */
const HISTORY_TURNS = 20;

/** Top-K results for context search */
const CONTEXT_TOP_K = 5;

/** Top-K results for memory recall */
const MEMORY_TOP_K = 5;

/* ------------------------------------------------------------------ */
/*  Module state                                                      */
/* ------------------------------------------------------------------ */

/** @type {import('better-sqlite3').Database} */
let _db = null;

/** @type {NullClawAdapter|null} */
let _adapter = null;

/** @type {import('../lib/embeddings.js').EmbeddingProvider|null} */
let _embedder = null;

/** @type {MemoryScheduler|null} */
let _scheduler = null;

/** @type {MemoryConsolidator|null} */
let _consolidator = null;

/* ------------------------------------------------------------------ */
/*  Initialization                                                    */
/* ------------------------------------------------------------------ */

/**
 * Initialize the chat handler with database and all pipeline modules.
 * @param {import('better-sqlite3').Database} db
 */
export function init(db) {
  _db = db;

  // ── Conversation history table ──
  _db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      model TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  _db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conv_user ON conversation_history(userId, createdAt)
  `);

  // ── State modules ──
  memory.init(db);
  contextIndex.init(db);

  // ── Embedding provider ──
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    _embedder = createOpenAIProvider(openaiKey);
    console.log('[chat] Embedding provider: OpenAI text-embedding-3-small');
  } else {
    _embedder = createMockProvider();
    console.warn('[chat] No OPENAI_API_KEY — using mock embedding provider (no real semantic search)');
  }

  // ── NullClaw adapter pool ──
  try {
    _adapter = new NullClawAdapter({
      command: NULLCLAW_BIN,
      portMin: 29_000,
      portMax: 29_999,
      baseArgs: ['gateway'],
      env: { NO_COLOR: '1' },
    });

    _adapter.on('spawn', ({ userId, port, pid }) => {
      console.log(`[adapter] Spawned NullClaw for ${userId} on port ${port} (pid ${pid})`);
    });
    _adapter.on('destroy', ({ userId, port }) => {
      console.log(`[adapter] Destroyed NullClaw for ${userId} (port ${port})`);
    });
    _adapter.on('restart', ({ userId, port, attempt }) => {
      console.warn(`[adapter] Restarting NullClaw for ${userId} on port ${port} (attempt ${attempt})`);
    });
    _adapter.on('error', ({ userId, error }) => {
      console.error(`[adapter] NullClaw error for ${userId}:`, error.message);
    });
    _adapter.on('log', ({ userId, stream, line }) => {
      if (stream === 'stderr') {
        console.error(`[nullclaw:${userId}] ${line}`);
      }
    });

    console.log('[chat] NullClaw adapter pool initialized (ports 29000-29999)');
  } catch (err) {
    console.error('[chat] Failed to initialize NullClaw adapter:', err.message);
    _adapter = null;
  }

  // ── Memory consolidation + scheduler ──
  try {
    _consolidator = new MemoryConsolidator({
      memory,
      embedder: _embedder,
      logger: console,
    });

    _scheduler = new MemoryScheduler({
      consolidator: _consolidator,
      memory,
      logger: console,
      pruneThreshold: 1000,
    });

    console.log('[chat] Memory scheduler initialized');
  } catch (err) {
    console.error('[chat] Failed to initialize memory scheduler:', err.message);
    _scheduler = null;
    _consolidator = null;
  }
}

/* ------------------------------------------------------------------ */
/*  Conversation history (per-user)                                   */
/* ------------------------------------------------------------------ */

const MAX_HISTORY = 100;

/**
 * Retrieve conversation history for a user, oldest-first.
 * @param {string} userId
 * @param {number} [limit=20]
 * @returns {Array<{role: string, content: string}>}
 */
function getHistory(userId, limit = HISTORY_TURNS) {
  if (!_db) return [];
  const rows = _db.prepare(
    'SELECT role, content FROM conversation_history WHERE userId = ? ORDER BY createdAt DESC LIMIT ?'
  ).all(userId, limit);
  return rows.reverse();
}

/**
 * Append a message to conversation history and prune old entries.
 * @param {string} userId
 * @param {string} role
 * @param {string} content
 * @param {string} [model]
 */
function appendHistory(userId, role, content, model) {
  if (!_db) return;
  _db.prepare(
    'INSERT INTO conversation_history (userId, role, content, model, createdAt) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, role, content, model || null, new Date().toISOString());

  // Prune old entries
  const count = _db.prepare('SELECT COUNT(*) as c FROM conversation_history WHERE userId = ?').get(userId)?.c || 0;
  if (count > MAX_HISTORY) {
    _db.prepare(`
      DELETE FROM conversation_history WHERE id IN (
        SELECT id FROM conversation_history WHERE userId = ? ORDER BY createdAt ASC LIMIT ?
      )
    `).run(userId, count - MAX_HISTORY);
  }
}

/**
 * Clear all conversation history for a user.
 * @param {string} userId
 */
export function clearHistory(userId) {
  if (!_db) return;
  _db.prepare('DELETE FROM conversation_history WHERE userId = ?').run(userId);
}

/* ------------------------------------------------------------------ */
/*  Context retrieval (semantic search)                               */
/* ------------------------------------------------------------------ */

/**
 * Retrieve relevant context for a query via semantic search over
 * the context index and user memories. Non-blocking on failure.
 *
 * @param {string} query
 * @param {string} userId
 * @returns {Promise<string>} TOON-formatted context block, or empty string
 */
async function retrieveContext(query, userId) {
  if (!_embedder) return '';

  const parts = [];

  // ── Search indexed documents ──
  try {
    const contextResults = await searchContext(query, {
      embedder: _embedder,
      contextIndex,
      topK: CONTEXT_TOP_K,
      minScore: 0.3,
    });
    if (contextResults.length > 0) {
      parts.push(formatResultsAsToon(contextResults, { label: 'context' }));
    }
  } catch (err) {
    console.warn('[chat] Context search failed:', err.message);
  }

  // ── Search user memories ──
  try {
    const memoryResults = await searchMemory(query, {
      embedder: _embedder,
      memory,
      userId,
      topK: MEMORY_TOP_K,
      minScore: 0.3,
    });
    if (memoryResults.length > 0) {
      parts.push(formatResultsAsToon(memoryResults, { label: 'memories' }));
    }
  } catch (err) {
    console.warn('[chat] Memory search failed:', err.message);
  }

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Prompt building                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build the augmented prompt to send to NullClaw.
 * Combines: retrieved context + conversation history + user message.
 *
 * @param {string} userMessage
 * @param {Array<{role: string, content: string}>} history
 * @param {string} contextBlock - TOON-formatted retrieved context
 * @returns {string}
 */
function buildAugmentedPrompt(userMessage, history, contextBlock) {
  const parts = [];

  // Inject retrieved context as a system preamble
  if (contextBlock) {
    parts.push(`[Retrieved context]\n${contextBlock}\n`);
  }

  // Inject recent conversation history as context
  if (history.length > 0) {
    const historyLines = history.map(h =>
      `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`
    );
    parts.push(`[Conversation history]\n${historyLines.join('\n')}\n`);
  }

  // The actual user message
  parts.push(userMessage);

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  NullClaw execution — adapter (primary) + direct spawn (fallback)  */
/* ------------------------------------------------------------------ */

/**
 * Send a message through the NullClaw adapter (per-user gateway instance).
 * Returns the response body from the webhook endpoint.
 *
 * @param {string} userId
 * @param {string} augmentedPrompt
 * @returns {Promise<{text: string}>}
 */
async function sendViaAdapter(userId, augmentedPrompt) {
  if (!_adapter) throw new Error('Adapter not initialized');

  const payload = {
    type: 'chat',
    message: augmentedPrompt,
    userId,
    ts: Date.now(),
  };

  const { status, body } = await _adapter.routeWebhook(userId, payload);

  if (status >= 400) {
    const errMsg = typeof body === 'object' ? (body.error || JSON.stringify(body)) : String(body);
    throw new Error(`NullClaw webhook returned ${status}: ${errMsg}`);
  }

  // Extract response text from body
  const text = typeof body === 'object'
    ? (body.response || body.text || body.message || JSON.stringify(body))
    : String(body);

  return { text };
}

/**
 * Fallback: run NullClaw CLI directly (stateless, one-shot).
 * Used when the adapter pool is unavailable or fails.
 *
 * @param {string} message
 * @param {(chunk: string) => void} onChunk
 * @returns {Promise<string>} full response text
 */
function runNullClawDirect(message, onChunk) {
  return new Promise((resolve, reject) => {
    let fullOutput = '';
    let stderr = '';

    const proc = spawn(NULLCLAW_BIN, ['agent', '-m', message], {
      timeout: NULLCLAW_TIMEOUT,
      env: { ...process.env, NO_COLOR: '1' },
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      fullOutput += text;
      onChunk(text);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(fullOutput.trim());
      } else {
        reject(new Error(`NullClaw exited with code ${code}: ${stderr.trim()}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Post-response pipeline (async, non-blocking)                      */
/* ------------------------------------------------------------------ */

/**
 * Async post-response pipeline: memory extraction + scheduling.
 * Runs after the response has been sent to the user.
 * Failures are logged and swallowed — never blocks chat.
 *
 * @param {string} userId
 * @param {string} userMessage
 * @param {string} assistantResponse
 */
async function runPostResponsePipeline(userId, userMessage, assistantResponse) {
  // ── Memory extraction ──
  try {
    if (_embedder) {
      await extractMemories(userMessage, assistantResponse, {
        llmCall: cheapLlmCall,
        embedder: _embedder,
        memory,
        userId,
      });
    }
  } catch (err) {
    console.warn(`[chat] Memory extraction failed for ${userId}:`, err.message);
  }

  // ── Trigger consolidation if scheduler says it's time ──
  try {
    if (_scheduler) {
      // Only runs if 24h+ since last consolidation for this user
      await _scheduler.runScheduledConsolidation();
    }
  } catch (err) {
    console.warn(`[chat] Consolidation scheduling failed:`, err.message);
  }
}

/**
 * Cheap LLM call for memory extraction.
 * Routes through the user's NullClaw instance or falls back to a direct spawn.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
async function cheapLlmCall(systemPrompt, userPrompt) {
  const combined = `${systemPrompt}\n\n${userPrompt}`;

  // Direct spawn with agent mode for extraction (lightweight, no adapter needed)
  return new Promise((resolve, reject) => {
    let output = '';
    let stderr = '';

    const proc = spawn(NULLCLAW_BIN, ['agent', '-m', combined], {
      timeout: 30_000,
      env: { ...process.env, NO_COLOR: '1' },
    });

    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`LLM call exited ${code}: ${stderr.trim()}`));
    });
    proc.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/*  Main chat handler                                                 */
/* ------------------------------------------------------------------ */

/**
 * Handle an incoming chat message through the full pipeline.
 *
 * Pipeline:
 *   1. Retrieve conversation history
 *   2. Semantic context search (indexed docs + user memories)
 *   3. Build augmented prompt
 *   4. Send to NullClaw adapter (or fallback to direct spawn)
 *   5. Stream response to client via WebSocket
 *   6. Persist history + async memory extraction
 *
 * @param {string} userId
 * @param {{ text?: string, content?: string }} msg
 * @param {import('ws').WebSocket} ws
 */
export async function handleChat(userId, msg, ws) {
  const text = msg.text ?? msg.content ?? '';
  if (!text.trim()) return;

  console.log(`[chat] ${userId}: ${text.slice(0, 100)}`);

  // Save user message to history
  appendHistory(userId, 'user', text);

  // Typing indicator
  sendJson(ws, { type: 'typing', status: 'start', ts: Date.now() });

  try {
    // ── Step 1: Retrieve conversation history ──
    const history = getHistory(userId, HISTORY_TURNS);

    // ── Step 2: Semantic context retrieval (non-blocking on failure) ──
    const contextBlock = await retrieveContext(text, userId);

    // ── Step 3: Build augmented prompt ──
    const augmentedPrompt = buildAugmentedPrompt(text, history, contextBlock);

    // ── Step 4+5: Send to NullClaw and stream response ──
    let response = '';
    let usedAdapter = false;

    if (_adapter) {
      try {
        const result = await sendViaAdapter(userId, augmentedPrompt);
        response = result.text;
        usedAdapter = true;

        // Send full response as a single stream message (adapter returns complete response)
        sendJson(ws, {
          type: 'chat-stream',
          delta: response,
          ts: Date.now(),
        });
      } catch (adapterErr) {
        console.warn(`[chat] Adapter failed for ${userId}, falling back to direct spawn:`, adapterErr.message);
        // Fall through to direct spawn
      }
    }

    // Fallback: direct spawn with streaming
    if (!usedAdapter) {
      response = await runNullClawDirect(augmentedPrompt, (chunk) => {
        sendJson(ws, {
          type: 'chat-stream',
          delta: chunk,
          ts: Date.now(),
        });
      });
    }

    // ── End stream ──
    sendJson(ws, { type: 'chat-stream-end', ts: Date.now() });
    sendJson(ws, { type: 'typing', status: 'stop', ts: Date.now() });

    // ── Step 5b: A2UI detection — convert A2UI envelopes to GenUI canvas ops ──
    if (response && isA2UIMessage(response)) {
      try {
        const parsed = parseA2UIMessage(response);
        if (parsed && parsed.allComponents.length > 0) {
          const genUIOps = a2uiToGenUI(parsed.allComponents);
          if (genUIOps.length > 0) {
            sendJson(ws, {
              type: 'canvas-ops',
              ops: genUIOps,
              source: 'a2ui',
              ts: Date.now(),
            });
            console.log(`[chat] A2UI detected for ${userId}: ${genUIOps.length} components converted to GenUI`);
          }
        }
      } catch (a2uiErr) {
        console.warn(`[chat] A2UI conversion failed for ${userId}:`, a2uiErr.message);
      }
    }

    // ── Step 6: Persist assistant response ──
    if (response) {
      appendHistory(userId, 'assistant', response, usedAdapter ? 'nullclaw-gateway' : 'nullclaw');
    }

    // ── Step 7: Async post-response pipeline (memory extraction + consolidation) ──
    if (response) {
      runPostResponsePipeline(userId, text, response).catch(err => {
        console.warn(`[chat] Post-response pipeline error for ${userId}:`, err.message);
      });
    }

  } catch (err) {
    console.error(`[chat] Error for ${userId}:`, err.message);
    sendJson(ws, { type: 'typing', status: 'stop', ts: Date.now() });
    sendJson(ws, {
      type: 'chat',
      from: 'system',
      text: `❌ AI error: ${err.message}`,
      ts: Date.now(),
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Shutdown                                                          */
/* ------------------------------------------------------------------ */

/**
 * Gracefully shut down the adapter pool and all NullClaw instances.
 * @returns {Promise<void>}
 */
export async function shutdown() {
  console.log('[chat] Shutting down chat handler...');

  if (_adapter) {
    await _adapter.shutdownAll();
    _adapter = null;
    console.log('[chat] NullClaw adapter pool shut down');
  }

  _scheduler = null;
  _consolidator = null;
  _embedder = null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Send a JSON message over a WebSocket (if open).
 * @param {import('ws').WebSocket} ws
 * @param {Object} msg
 */
function sendJson(ws, msg) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg));
  }
}
