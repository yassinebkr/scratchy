/**
 * @module server/agent-orchestrator
 * Scratchy v2 — Multi-Agent Orchestrator
 *
 * Routes chat messages to per-agent-per-user NullClaw instances.
 * Each agent can define its own system prompt, model preference,
 * and MCP server configurations. The orchestrator sits ABOVE the
 * chat handler, reusing the same pipeline modules (context search,
 * memory extraction, conversation history) but routing through
 * agent-specific NullClaw instances.
 *
 * Architecture:
 *   Client sends { type: 'chat', agentId: '...', text: '...' }
 *   → orchestrator looks up agent config from SQLite
 *   → spawns/reuses per-user-per-agent NullClaw instance
 *   → prepends agent system prompt to augmented prompt
 *   → activates MCP servers for agent's tool definitions
 *   → streams response back to client via WebSocket
 *   → detects A2UI envelopes → converts to GenUI canvas ops
 *
 * Key design: adapter pool keyed by `${userId}:${agentId}` so each
 * user can have independent NullClaw processes per agent.
 */

import { spawn } from 'node:child_process';
import { NullClawAdapter } from '../lib/nullclaw-adapter.js';
import { searchContext, searchMemory, formatResultsAsToon } from '../lib/context-search.js';
import { createOpenAIProvider, createMockProvider } from '../lib/embeddings.js';
import { extractMemories } from '../lib/memory-extraction.js';
import { isA2UIMessage, parseA2UIMessage, a2uiToGenUI } from '../protocol/a2ui.js';
import * as agents from '../state/agents.js';
import * as memory from '../state/memory.js';
import * as contextIndex from '../state/context-index.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NULLCLAW_BIN = '/home/nonbios/nullclaw/zig-out/bin/nullclaw';
const NULLCLAW_TIMEOUT = 60_000;

/** Number of history turns to retrieve for prompt building */
const HISTORY_TURNS = 20;

/** Top-K results for context search */
const CONTEXT_TOP_K = 5;

/** Top-K results for memory recall */
const MEMORY_TOP_K = 5;

/** Adapter port range — offset from chat-handler's 29000-29999 */
const ADAPTER_PORT_MIN = 28_000;
const ADAPTER_PORT_MAX = 28_999;

/* ------------------------------------------------------------------ */
/*  Module state                                                      */
/* ------------------------------------------------------------------ */

/** @type {import('better-sqlite3').Database} */
let _db = null;

/** @type {NullClawAdapter|null} */
let _adapter = null;

/** @type {import('../lib/mcp-registry.js').McpRegistry|null} */
let _mcpRegistry = null;

/** @type {import('../lib/embeddings.js').EmbeddingProvider|null} */
let _embedder = null;

/**
 * Cache of default agent ID. Refreshed on miss.
 * @type {string|null}
 */
let _defaultAgentId = null;

/* ------------------------------------------------------------------ */
/*  Initialization                                                    */
/* ------------------------------------------------------------------ */

/**
 * Initialize the agent orchestrator.
 *
 * Must be called after the database schema is set up and the agents
 * module has been initialized with the same `db` instance.
 *
 * @param {import('better-sqlite3').Database} db — SQLite database
 * @param {import('../lib/mcp-registry.js').McpRegistry} mcpRegistry — MCP server manager
 */
export function init(db, mcpRegistry) {
  _db = db;
  _mcpRegistry = mcpRegistry;

  // ── Embedding provider (same as chat-handler) ──
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    _embedder = createOpenAIProvider(openaiKey);
    console.log('[orchestrator] Embedding provider: OpenAI');
  } else {
    _embedder = createMockProvider();
    console.warn('[orchestrator] No OPENAI_API_KEY — using mock embeddings');
  }

  // ── NullClaw adapter pool (separate port range from chat-handler) ──
  try {
    _adapter = new NullClawAdapter({
      command: NULLCLAW_BIN,
      portMin: ADAPTER_PORT_MIN,
      portMax: ADAPTER_PORT_MAX,
      baseArgs: ['gateway'],
      env: { NO_COLOR: '1' },
    });

    _adapter.on('spawn', ({ userId, port, pid }) => {
      console.log(`[orchestrator] Spawned NullClaw for ${userId} on port ${port} (pid ${pid})`);
    });
    _adapter.on('destroy', ({ userId, port }) => {
      console.log(`[orchestrator] Destroyed NullClaw for ${userId} (port ${port})`);
    });
    _adapter.on('restart', ({ userId, port, attempt }) => {
      console.warn(`[orchestrator] Restarting NullClaw for ${userId} on port ${port} (attempt ${attempt})`);
    });
    _adapter.on('error', ({ userId, error }) => {
      console.error(`[orchestrator] NullClaw error for ${userId}:`, error.message);
    });
    _adapter.on('log', ({ userId, stream, line }) => {
      if (stream === 'stderr') {
        console.error(`[nullclaw:orch:${userId}] ${line}`);
      }
    });

    console.log('[orchestrator] NullClaw adapter pool initialized (ports 28000-28999)');
  } catch (err) {
    console.error('[orchestrator] Failed to initialize adapter pool:', err.message);
    _adapter = null;
  }

  console.log('[orchestrator] Multi-agent orchestrator initialized');
}

/* ------------------------------------------------------------------ */
/*  Agent resolution                                                  */
/* ------------------------------------------------------------------ */

/**
 * Resolve an agent ID to a full agent config.
 *
 * Resolution order:
 *   1. If `agentId` is provided and valid, use that agent
 *   2. Fall back to the first enabled builtin agent (isDefault equivalent)
 *   3. Fall back to any enabled agent
 *   4. Return a minimal default config if no agents exist
 *
 * @param {string|null|undefined} agentId — requested agent ID
 * @returns {Object} Agent config with at least { id, name, model, systemPrompt, mcpServers }
 */
function resolveAgent(agentId) {
  // ── Explicit agent ID ──
  if (agentId) {
    const agent = agents.getAgent(agentId);
    if (agent && agent.enabled !== 0) return agent;
    console.warn(`[orchestrator] Agent ${agentId} not found or disabled, falling back to default`);
  }

  // ── Cached default ──
  if (_defaultAgentId) {
    const cached = agents.getAgent(_defaultAgentId);
    if (cached && cached.enabled !== 0) return cached;
    _defaultAgentId = null; // cache miss — stale
  }

  // ── Find default: first enabled builtin agent ──
  const builtins = agents.getBuiltinAgents();
  const enabledBuiltin = builtins.find(a => a.enabled !== 0);
  if (enabledBuiltin) {
    _defaultAgentId = enabledBuiltin.id;
    return enabledBuiltin;
  }

  // ── Any enabled agent ──
  const all = agents.listAgents({ enabled: true });
  if (all.length > 0) {
    _defaultAgentId = all[0].id;
    return all[0];
  }

  // ── Fallback: synthetic default (no agents configured) ──
  return {
    id: '__default__',
    name: 'Default',
    model: 'sonnet',
    systemPrompt: '',
    mcpServers: [],
    skills: [],
    temperature: 0.7,
  };
}

/* ------------------------------------------------------------------ */
/*  Conversation history (per-user, shared with chat-handler table)   */
/* ------------------------------------------------------------------ */

/**
 * Retrieve conversation history for a user, oldest-first.
 * Reads from the same `conversation_history` table that chat-handler uses.
 *
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
 *
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

  // Prune old entries (keep last 100)
  const count = _db.prepare(
    'SELECT COUNT(*) as c FROM conversation_history WHERE userId = ?'
  ).get(userId)?.c || 0;
  if (count > 100) {
    _db.prepare(`
      DELETE FROM conversation_history WHERE id IN (
        SELECT id FROM conversation_history WHERE userId = ? ORDER BY createdAt ASC LIMIT ?
      )
    `).run(userId, count - 100);
  }
}

/* ------------------------------------------------------------------ */
/*  Context retrieval (semantic search)                               */
/* ------------------------------------------------------------------ */

/**
 * Retrieve relevant context via semantic search (documents + user memories).
 *
 * @param {string} query
 * @param {string} userId
 * @returns {Promise<string>} TOON-formatted context block
 */
async function retrieveContext(query, userId) {
  if (!_embedder) return '';

  const parts = [];

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
    console.warn('[orchestrator] Context search failed:', err.message);
  }

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
    console.warn('[orchestrator] Memory search failed:', err.message);
  }

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Prompt building                                                   */
/* ------------------------------------------------------------------ */

/**
 * Build an augmented prompt with agent system prompt, retrieved context,
 * conversation history, MCP tool definitions, and the user message.
 *
 * @param {string} userMessage — raw user text
 * @param {Object} agentConfig — resolved agent config
 * @param {Array<{role: string, content: string}>} history — recent turns
 * @param {string} contextBlock — TOON-formatted retrieved context
 * @param {Array<{name: string, description: string, inputSchema: Object}>} tools — available MCP tools
 * @returns {string}
 */
function buildAugmentedPrompt(userMessage, agentConfig, history, contextBlock, tools) {
  const parts = [];

  // ── Agent system prompt (identity / instructions) ──
  if (agentConfig.systemPrompt) {
    parts.push(`[System]\n${agentConfig.systemPrompt}\n`);
  }

  // ── MCP tool definitions (so the LLM knows what's available) ──
  if (tools.length > 0) {
    const toolLines = tools.map(t =>
      `- ${t.name}: ${t.description || '(no description)'}`
    );
    parts.push(`[Available tools]\n${toolLines.join('\n')}\n`);
  }

  // ── Retrieved context ──
  if (contextBlock) {
    parts.push(`[Retrieved context]\n${contextBlock}\n`);
  }

  // ── Conversation history ──
  if (history.length > 0) {
    const historyLines = history.map(h =>
      `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`
    );
    parts.push(`[Conversation history]\n${historyLines.join('\n')}\n`);
  }

  // ── User message ──
  parts.push(userMessage);

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  MCP server activation                                             */
/* ------------------------------------------------------------------ */

/**
 * Ensure MCP servers are activated for an agent.
 * Returns the list of available tool definitions.
 *
 * Activation is idempotent — if servers are already running for this
 * agent, returns the cached tool list.
 *
 * @param {Object} agentConfig — agent with id, mcpServers array
 * @returns {Promise<Array<{name: string, description: string, inputSchema: Object}>>}
 */
async function ensureMcpServers(agentConfig) {
  if (!_mcpRegistry) return [];
  if (!agentConfig.mcpServers || agentConfig.mcpServers.length === 0) return [];

  // Already active — return cached tools
  if (_mcpRegistry.isActive(agentConfig.id)) {
    return _mcpRegistry.getAvailableTools(agentConfig.id);
  }

  // Skip if currently being activated (concurrent request guard)
  if (_mcpRegistry.isActivating(agentConfig.id)) {
    // Wait briefly for activation to complete
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (_mcpRegistry.isActive(agentConfig.id)) {
        return _mcpRegistry.getAvailableTools(agentConfig.id);
      }
    }
    console.warn(`[orchestrator] MCP activation timed out for agent ${agentConfig.id}`);
    return [];
  }

  try {
    const { tools } = await _mcpRegistry.activateAgent(agentConfig);
    console.log(`[orchestrator] Activated ${tools.length} MCP tools for agent ${agentConfig.name}`);
    return tools;
  } catch (err) {
    console.error(`[orchestrator] MCP activation failed for agent ${agentConfig.name}:`, err.message);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  NullClaw execution                                                */
/* ------------------------------------------------------------------ */

/**
 * Composite key for the adapter pool — one NullClaw per user per agent.
 *
 * @param {string} userId
 * @param {string} agentId
 * @returns {string}
 */
function adapterKey(userId, agentId) {
  return `${userId}:${agentId}`;
}

/**
 * Send a message through the NullClaw adapter for a specific user+agent.
 *
 * @param {string} userId
 * @param {string} agentId
 * @param {string} augmentedPrompt
 * @param {Object} agentConfig — for model preference
 * @returns {Promise<{text: string}>}
 */
async function sendViaAdapter(userId, agentId, augmentedPrompt, agentConfig) {
  if (!_adapter) throw new Error('Adapter not initialized');

  const key = adapterKey(userId, agentId);

  const payload = {
    type: 'chat',
    message: augmentedPrompt,
    userId: key,
    model: agentConfig.model || undefined,
    temperature: agentConfig.temperature || undefined,
    ts: Date.now(),
  };

  const { status, body } = await _adapter.routeWebhook(key, payload);

  if (status >= 400) {
    const errMsg = typeof body === 'object' ? (body.error || JSON.stringify(body)) : String(body);
    throw new Error(`NullClaw webhook returned ${status}: ${errMsg}`);
  }

  const text = typeof body === 'object'
    ? (body.response || body.text || body.message || JSON.stringify(body))
    : String(body);

  return { text };
}

/**
 * Fallback: direct NullClaw spawn (stateless, one-shot).
 *
 * @param {string} message
 * @param {(chunk: string) => void} onChunk
 * @returns {Promise<string>}
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
      if (code === 0) resolve(fullOutput.trim());
      else reject(new Error(`NullClaw exited with code ${code}: ${stderr.trim()}`));
    });

    proc.on('error', reject);
  });
}

/* ------------------------------------------------------------------ */
/*  A2UI detection & conversion                                       */
/* ------------------------------------------------------------------ */

/**
 * Check a response for A2UI envelopes and convert to GenUI canvas ops.
 * Sends converted ops over the WebSocket if any are found.
 *
 * @param {string} response — assistant response text
 * @param {import('ws').WebSocket} ws
 * @param {string} userId — for logging
 */
function handleA2UIResponse(response, ws, userId) {
  if (!response || !isA2UIMessage(response)) return;

  try {
    const parsed = parseA2UIMessage(response);
    if (!parsed || parsed.allComponents.length === 0) return;

    const genUIOps = a2uiToGenUI(parsed.allComponents);
    if (genUIOps.length === 0) return;

    sendJson(ws, {
      type: 'canvas-ops',
      ops: genUIOps,
      source: 'a2ui',
      ts: Date.now(),
    });

    console.log(`[orchestrator] A2UI: ${genUIOps.length} components → GenUI for ${userId}`);
  } catch (err) {
    console.warn(`[orchestrator] A2UI conversion failed for ${userId}:`, err.message);
  }
}

/* ------------------------------------------------------------------ */
/*  Post-response pipeline (async, non-blocking)                      */
/* ------------------------------------------------------------------ */

/**
 * Async post-response pipeline: memory extraction.
 * Runs after the response has been sent. Failures are swallowed.
 *
 * @param {string} userId
 * @param {string} userMessage
 * @param {string} assistantResponse
 */
async function runPostResponsePipeline(userId, userMessage, assistantResponse) {
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
    console.warn(`[orchestrator] Memory extraction failed for ${userId}:`, err.message);
  }
}

/**
 * Cheap LLM call for memory extraction (direct NullClaw spawn).
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
async function cheapLlmCall(systemPrompt, userPrompt) {
  const combined = `${systemPrompt}\n\n${userPrompt}`;
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
/*  Main routing entry point                                          */
/* ------------------------------------------------------------------ */

/**
 * Route an incoming chat message through the multi-agent pipeline.
 *
 * Full pipeline:
 *   1. Resolve agent config (from agentId or default)
 *   2. Activate MCP servers for agent (if configured)
 *   3. Retrieve conversation history
 *   4. Semantic context search (documents + user memories)
 *   5. Build augmented prompt (system prompt + tools + context + history + message)
 *   6. Send to per-user-per-agent NullClaw instance (or fallback to direct spawn)
 *   7. Stream response to client via WebSocket
 *   8. Detect A2UI envelopes → convert to GenUI canvas ops
 *   9. Persist history + async memory extraction
 *
 * @param {string} userId — authenticated user ID
 * @param {string|null|undefined} agentId — requested agent ID (null/undefined → default)
 * @param {{ text?: string, content?: string }} message — incoming message payload
 * @param {import('ws').WebSocket} ws — client WebSocket connection
 */
export async function routeMessage(userId, agentId, message, ws) {
  const text = message.text ?? message.content ?? '';
  if (!text.trim()) return;

  console.log(`[orchestrator] ${userId} → agent:${agentId || 'default'}: ${text.slice(0, 100)}`);

  // ── Step 1: Resolve agent config ──
  const agent = resolveAgent(agentId);
  const effectiveAgentId = agent.id;

  // Save user message to history
  appendHistory(userId, 'user', text);

  // Typing indicator
  sendJson(ws, { type: 'typing', status: 'start', agentId: effectiveAgentId, ts: Date.now() });

  try {
    // ── Step 2: Activate MCP servers (if agent has any configured) ──
    const tools = await ensureMcpServers(agent);

    // ── Step 3: Retrieve conversation history ──
    const history = getHistory(userId, HISTORY_TURNS);

    // ── Step 4: Semantic context retrieval ──
    const contextBlock = await retrieveContext(text, userId);

    // ── Step 5: Build augmented prompt ──
    const augmentedPrompt = buildAugmentedPrompt(text, agent, history, contextBlock, tools);

    // ── Step 6+7: Send to NullClaw and stream response ──
    let response = '';
    let usedAdapter = false;

    if (_adapter) {
      try {
        const result = await sendViaAdapter(userId, effectiveAgentId, augmentedPrompt, agent);
        response = result.text;
        usedAdapter = true;

        sendJson(ws, {
          type: 'chat-stream',
          delta: response,
          agentId: effectiveAgentId,
          agentName: agent.name,
          ts: Date.now(),
        });
      } catch (adapterErr) {
        console.warn(
          `[orchestrator] Adapter failed for ${userId}:${effectiveAgentId}, ` +
          `falling back to direct spawn:`, adapterErr.message
        );
      }
    }

    // Fallback: direct spawn with streaming
    if (!usedAdapter) {
      response = await runNullClawDirect(augmentedPrompt, (chunk) => {
        sendJson(ws, {
          type: 'chat-stream',
          delta: chunk,
          agentId: effectiveAgentId,
          agentName: agent.name,
          ts: Date.now(),
        });
      });
    }

    // ── End stream ──
    sendJson(ws, { type: 'chat-stream-end', agentId: effectiveAgentId, ts: Date.now() });
    sendJson(ws, { type: 'typing', status: 'stop', agentId: effectiveAgentId, ts: Date.now() });

    // ── Step 8: A2UI detection → GenUI conversion ──
    if (response) {
      handleA2UIResponse(response, ws, userId);
    }

    // ── Step 9: Persist assistant response ──
    if (response) {
      const modelLabel = usedAdapter
        ? `nullclaw-gateway:${agent.model || 'default'}`
        : 'nullclaw';
      appendHistory(userId, 'assistant', response, modelLabel);
    }

    // ── Async post-response pipeline (memory extraction) ──
    if (response) {
      runPostResponsePipeline(userId, text, response).catch(err => {
        console.warn(`[orchestrator] Post-response pipeline error for ${userId}:`, err.message);
      });
    }

  } catch (err) {
    console.error(`[orchestrator] Error for ${userId}:${effectiveAgentId}:`, err.message);
    sendJson(ws, { type: 'typing', status: 'stop', agentId: effectiveAgentId, ts: Date.now() });
    sendJson(ws, {
      type: 'chat',
      from: 'system',
      agentId: effectiveAgentId,
      text: `❌ Agent error: ${err.message}`,
      ts: Date.now(),
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Shutdown                                                          */
/* ------------------------------------------------------------------ */

/**
 * Gracefully shut down the orchestrator — destroy all adapter instances
 * and deactivate MCP servers.
 *
 * @returns {Promise<void>}
 */
export async function shutdown() {
  console.log('[orchestrator] Shutting down...');

  if (_adapter) {
    await _adapter.shutdownAll();
    _adapter = null;
    console.log('[orchestrator] Adapter pool shut down');
  }

  // MCP registry shutdown is handled by the main server (shared instance)
  // — we don't own it, just use it.

  _embedder = null;
  _defaultAgentId = null;

  console.log('[orchestrator] Shutdown complete');
}

/* ------------------------------------------------------------------ */
/*  Utility exports                                                   */
/* ------------------------------------------------------------------ */

/**
 * Get the currently resolved default agent.
 * Useful for status endpoints or admin views.
 *
 * @returns {Object|null}
 */
export function getDefaultAgent() {
  return resolveAgent(null);
}

/**
 * Get the adapter key for a user+agent pair.
 * Exposed for testing/debugging.
 *
 * @param {string} userId
 * @param {string} agentId
 * @returns {string}
 */
export function getAdapterKey(userId, agentId) {
  return adapterKey(userId, agentId);
}

/**
 * Check if the orchestrator is initialized and ready.
 * @returns {boolean}
 */
export function isReady() {
  return _db !== null;
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
