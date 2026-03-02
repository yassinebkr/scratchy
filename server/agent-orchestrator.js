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
import { createBestGeminiProvider, createOpenAIProvider, createMockProvider, createFallbackProvider } from '../lib/embeddings.js';
import { extractMemories } from '../lib/memory-extraction.js';
import { BUILTIN_TOOLS, createToolExecutor } from '../lib/builtin-tools.js';
import { getToolsForAgent } from '../lib/skills/index.js';
import { isA2UIMessage, parseA2UIMessage, a2uiToGenUI } from '../protocol/a2ui.js';
import { parseGenUIResponse } from '../lib/genui-response-parser.js';
import { createToolCallDetector } from '../lib/tool-call-detector.js';
import * as agents from '../state/agents.js';
import * as memory from '../state/memory.js';
import * as contextIndex from '../state/context-index.js';
import { getUsageTracker } from '../lib/usage-tracker.js';
import { routeTeamMessage } from '../lib/team-router.js';
import * as teamsState from '../state/teams.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const NULLCLAW_BIN = '/home/nonbios/nullclaw-gateway-streaming/zig-out/bin/nullclaw';
const NULLCLAW_TIMEOUT = 120_000;

/** Number of history turns to retrieve for prompt building */
const HISTORY_TURNS = 20;

/** Top-K results for context search */
const CONTEXT_TOP_K = 5;

/** Top-K results for memory recall */
const MEMORY_TOP_K = 5;

/** Max user message size before truncation (bytes) */
const MAX_MESSAGE_SIZE = 100 * 1024;

/** Abort SSE stream if no data received for this duration */
const STREAM_INACTIVITY_TIMEOUT = 60_000;

/** Max concurrent requests per user */
const MAX_CONCURRENT_PER_USER = 3;

/** @type {Map<string, number>} active request count per userId */
const _activeRequests = new Map();

/** Adapter port range — offset from chat-handler's 29000-29999 */
const ADAPTER_PORT_MIN = 28_000;
const ADAPTER_PORT_MAX = 28_999;

/* ------------------------------------------------------------------ */
/*  Streaming text filter — strips tool XML from client output        */
/* ------------------------------------------------------------------ */

/**
 * Creates a streaming filter that suppresses <tool_call>, <tool_result>,
 * <tool_use> XML blocks from reaching the client while allowing all other
 * text through immediately.
 *
 * @param {(text: string) => void} onText — callback for displayable text
 * @returns {{ feed(chunk: string): void, flush(): void }}
 */
function _createStreamFilter(onText) {
  let buffer = '';
  let insideTag = false;
  let insideCodeFence = false; // tracks ```scratchy-canvas...``` blocks
  const OPEN_PATTERNS = ['<tool_use', '<tool_call', '<tool_result'];
  const CLOSE_PATTERNS = ['</tool_use>', '</tool_call>', '</tool_result>'];
  const GENUI_FENCE_OPEN = /```scratchy-(canvas|toon|tpl)/;
  const GENUI_FENCE_CLOSE = '```';
  const MAX_PARTIAL = 15; // longest opening tag prefix to check

  return {
    feed(chunk) {
      buffer += chunk;

      // Process buffer in a loop until no more progress can be made
      let progress = true;
      while (buffer.length > 0 && progress) {
        progress = false;

        // ── Inside a GenUI code fence (```scratchy-canvas...```)
        if (insideCodeFence) {
          // Look for closing ``` (but not the opening one — find next occurrence)
          // The opening was already consumed; look for a standalone ``` on a new line
          const closeIdx = buffer.indexOf('\n```');
          if (closeIdx !== -1) {
            // Find end of the closing fence line
            let endIdx = closeIdx + 4; // skip \n```
            while (endIdx < buffer.length && buffer[endIdx] !== '\n') endIdx++;
            buffer = buffer.slice(endIdx);
            insideCodeFence = false;
            progress = true;
          }
          // else: still inside fence, wait for more data
          continue;
        }

        // ── Inside a tool XML tag
        if (insideTag) {
          let closeIdx = -1;
          let closeLen = 0;
          for (const pat of CLOSE_PATTERNS) {
            const idx = buffer.indexOf(pat);
            if (idx !== -1 && (closeIdx === -1 || idx < closeIdx)) {
              closeIdx = idx;
              closeLen = pat.length;
            }
          }
          if (closeIdx !== -1) {
            buffer = buffer.slice(closeIdx + closeLen);
            insideTag = false;
            progress = true;
          }
          continue;
        }

        // ── Normal text: look for tool tags OR GenUI fences
        // Check for GenUI fence opening: ```scratchy-canvas or ```scratchy-toon or ```scratchy-tpl
        const fenceMatch = buffer.match(GENUI_FENCE_OPEN);
        // Check for tool XML opening
        let toolOpenIdx = -1;
        for (const pat of OPEN_PATTERNS) {
          const idx = buffer.indexOf(pat);
          if (idx !== -1 && (toolOpenIdx === -1 || idx < toolOpenIdx)) {
            toolOpenIdx = idx;
          }
        }

        const fenceIdx = fenceMatch ? fenceMatch.index : -1;

        // Determine which comes first
        let firstIdx = -1;
        let firstType = null; // 'tool' or 'fence'
        if (toolOpenIdx !== -1 && fenceIdx !== -1) {
          if (toolOpenIdx <= fenceIdx) { firstIdx = toolOpenIdx; firstType = 'tool'; }
          else { firstIdx = fenceIdx; firstType = 'fence'; }
        } else if (toolOpenIdx !== -1) { firstIdx = toolOpenIdx; firstType = 'tool'; }
        else if (fenceIdx !== -1) { firstIdx = fenceIdx; firstType = 'fence'; }

        if (firstIdx !== -1) {
          // Emit text before the match
          if (firstIdx > 0) {
            onText(buffer.slice(0, firstIdx));
          }
          buffer = buffer.slice(firstIdx);
          if (firstType === 'tool') {
            insideTag = true;
          } else {
            insideCodeFence = true;
            // Skip the opening fence line itself
            const nlIdx = buffer.indexOf('\n');
            if (nlIdx !== -1) {
              buffer = buffer.slice(nlIdx + 1);
            } else {
              buffer = ''; // entire buffer is the opening line, wait for more
            }
          }
          progress = true;
        } else {
          // Check for partial matches at end of buffer
          let partialStart = -1;

          // Partial tool tag
          for (let i = Math.max(0, buffer.length - MAX_PARTIAL); i < buffer.length; i++) {
            if (buffer[i] === '<') {
              const remainder = buffer.slice(i);
              for (const pat of OPEN_PATTERNS) {
                if (pat.startsWith(remainder)) { partialStart = i; break; }
              }
              if (partialStart !== -1) break;
            }
          }

          // Partial GenUI fence (``` at end that could become ```scratchy-canvas)
          if (partialStart === -1) {
            for (let i = Math.max(0, buffer.length - 20); i < buffer.length; i++) {
              if (buffer[i] === '`') {
                const remainder = buffer.slice(i);
                if ('```scratchy-'.startsWith(remainder)) { partialStart = i; break; }
              }
            }
          }

          if (partialStart !== -1) {
            if (partialStart > 0) {
              onText(buffer.slice(0, partialStart));
              buffer = buffer.slice(partialStart);
            }
            progress = false;
          } else {
            onText(buffer);
            buffer = '';
            progress = false;
          }
        }
      }
    },

    flush() {
      if (buffer.length > 0 && !insideTag && !insideCodeFence) {
        onText(buffer);
      }
      buffer = '';
      insideTag = false;
      insideCodeFence = false;
    },
  };
}

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
 * Built-in tool executor — provides tools without external MCP servers.
 * @type {ReturnType<import('../lib/builtin-tools.js').createToolExecutor>|null}
 */
let _toolExecutor = null;

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

  // ── Embedding provider (fallback chain: Gemini → OpenAI → Mock) ──
  {
    const chain = [];
    const geminiProvider = createBestGeminiProvider();
    const openaiKey = process.env.OPENAI_API_KEY;
    if (geminiProvider) chain.push({ name: 'Gemini', provider: geminiProvider });
    if (openaiKey) chain.push({ name: 'OpenAI', provider: createOpenAIProvider(openaiKey) });
    chain.push({ name: 'Mock', provider: createMockProvider(chain[0]?.provider.dimensions || 768) });

    if (chain.length > 1) {
      _embedder = createFallbackProvider(chain);
      console.log(`[orchestrator] Embedding provider: fallback chain [${chain.map(c => c.name).join(' → ')}]`);
    } else {
      _embedder = chain[0].provider;
      console.warn('[orchestrator] Embedding provider: Mock only (semantic search degraded)');
    }
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

  // ── Built-in tool executor (memory, context, web, etc.) ──
  _toolExecutor = createToolExecutor({
    embedder: _embedder,
    memory,
    contextIndex,
    searchContext,
    searchMemory,
    formatResultsAsToon,
  });
  console.log(`[orchestrator] Built-in tools registered: ${BUILTIN_TOOLS.length}`);

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
 * Retrieve conversation history for a user+agent pair, oldest-first.
 * Per-agent isolation: each agent has its own conversation thread.
 *
 * @param {string} userId
 * @param {string} agentId — agent ID for conversation isolation
 * @param {number} [limit=20]
 * @returns {Array<{role: string, content: string}>}
 */
function getHistory(userId, agentId, limit = HISTORY_TURNS) {
  if (!_db) return [];
  const rows = _db.prepare(
    'SELECT role, content FROM conversation_history WHERE userId = ? AND agentId = ? ORDER BY createdAt DESC LIMIT ?'
  ).all(userId, agentId, limit);
  return rows.reverse();
}

/**
 * Append a message to per-agent conversation history and prune old entries.
 *
 * @param {string} userId
 * @param {string} agentId — agent ID for conversation isolation
 * @param {string} role
 * @param {string} content
 * @param {string} [model]
 */
function appendHistory(userId, agentId, role, content, model) {
  if (!_db) return;
  _db.prepare(
    'INSERT INTO conversation_history (userId, agentId, role, content, model, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, agentId, role, content, model || null, new Date().toISOString());

  // Prune old entries per agent (keep last 100 per agent)
  const count = _db.prepare(
    'SELECT COUNT(*) as c FROM conversation_history WHERE userId = ? AND agentId = ?'
  ).get(userId, agentId)?.c || 0;
  if (count > 100) {
    _db.prepare(`
      DELETE FROM conversation_history WHERE id IN (
        SELECT id FROM conversation_history WHERE userId = ? AND agentId = ? ORDER BY createdAt ASC LIMIT ?
      )
    `).run(userId, agentId, count - 100);
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

  // ── MCP tool bridge ──
  // NullClaw has its own built-in tools (shell, file_read, file_write, file_edit,
  // git, memory_recall, etc.) — those are NOT listed here.
  // MCP tools (from external servers managed by Scratchy) are bridged via
  // NullClaw's http_request tool → Scratchy's /api/internal/mcp endpoint.
  if (tools.length > 0) {
    // Filter: only include MCP tools (from external servers), not Scratchy's built-in tools
    const mcpTools = tools.filter(t => t._source === 'mcp');
    if (mcpTools.length > 0) {
      const toolLines = mcpTools.map(t => {
        const schemaStr = t.inputSchema
          ? ` Input: ${JSON.stringify(t.inputSchema)}`
          : '';
        return `- ${t.name}: ${t.description || '(no description)'}${schemaStr}`;
      });
      parts.push([
        '[MCP Tools — call via http_request]',
        'These tools run on external MCP servers. To use them, call http_request:',
        `  url: http://127.0.0.1:3002/api/internal/mcp`,
        '  method: POST',
        `  body: {"agentId":"${agentConfig.id}","tool":"<tool_name>","args":{...}}`,
        '',
        'Available MCP tools:',
        ...toolLines,
      ].join('\n') + '\n');
    }
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
  // Get built-in tools, filtered by agent's skill-based tool whitelist
  const allBuiltinTools = _toolExecutor ? _toolExecutor.getTools() : [];
  const allowedTools = getToolsForAgent(agentConfig.name);
  const builtinTools = allowedTools
    ? allBuiltinTools.filter(t => allowedTools.includes(t.name))
    : allBuiltinTools; // null = unrestricted (original 4 agents)

  // If no MCP registry or no MCP servers configured, return just built-in tools
  if (!_mcpRegistry || !agentConfig.mcpServers || agentConfig.mcpServers.length === 0) {
    return builtinTools;
  }

  let mcpTools = [];

  // Already active — return cached tools
  if (_mcpRegistry.isActive(agentConfig.id)) {
    mcpTools = _mcpRegistry.getAvailableTools(agentConfig.id);
  } else if (_mcpRegistry.isActivating(agentConfig.id)) {
    // Skip if currently being activated (concurrent request guard)
    // Wait briefly for activation to complete
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 250));
      if (_mcpRegistry.isActive(agentConfig.id)) {
        mcpTools = _mcpRegistry.getAvailableTools(agentConfig.id);
        break;
      }
    }
    if (mcpTools.length === 0) {
      console.warn(`[orchestrator] MCP activation timed out for agent ${agentConfig.id}`);
    }
  } else {
    try {
      const { tools } = await _mcpRegistry.activateAgent(agentConfig);
      mcpTools = tools;
      console.log(`[orchestrator] Activated ${tools.length} MCP tools for agent ${agentConfig.name}`);
    } catch (err) {
      console.error(`[orchestrator] MCP activation failed for agent ${agentConfig.name}:`, err.message);
    }
  }

  // Tag MCP tools so buildAugmentedPrompt can filter them
  const taggedMcpTools = mcpTools.map(t => ({ ...t, _source: 'mcp' }));

  // Merge: built-in tools first, then external MCP tools
  return [...builtinTools, ...taggedMcpTools];
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
/**
 * Instance key — one NullClaw per user (shared across agents).
 * Agent isolation uses session_key, not separate processes.
 */
function adapterKey(userId, _agentId) {
  return userId;
}

/**
 * Send a message through the NullClaw adapter via /api/message with SSE streaming.
 * Calls onChunk for each incremental delta, returns full accumulated text.
 *
 * @param {string} userId
 * @param {string} agentId
 * @param {string} augmentedPrompt
 * @param {Object} agentConfig — for model preference
 * @param {(chunk: string) => void} onChunk — called for each streaming delta
 * @returns {Promise<string>} — full response text
 */
async function sendViaAdapter(userId, agentId, augmentedPrompt, agentConfig, onChunk, onToolEvent) {
  if (!_adapter) throw new Error('Adapter not initialized');
  const key = adapterKey(userId, agentId);
  const sessionKey = `agent:${agentId}`;
  return _adapter.routeMessageStreaming(key, augmentedPrompt, onChunk, sessionKey, onToolEvent);
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
  let text = message.text ?? message.content ?? '';
  if (!text.trim()) return;

  // Truncate oversized messages (100KB limit)
  if (text.length > MAX_MESSAGE_SIZE) {
    text = text.slice(0, MAX_MESSAGE_SIZE);
    console.warn(`[orchestrator] Truncated oversized message from ${userId}`);
  }

  // Concurrent request guard — max 3 per user
  const activeCount = _activeRequests.get(userId) || 0;
  if (activeCount >= MAX_CONCURRENT_PER_USER) {
    sendJson(ws, {
      type: 'chat', from: 'system',
      text: '⏳ Too many concurrent requests. Please wait for a previous request to complete.',
      ts: Date.now(),
    });
    return;
  }
  _activeRequests.set(userId, activeCount + 1);

  console.log(`[orchestrator] ${userId} → agent:${agentId || 'default'}: ${text.slice(0, 100)}`);

  // ── Step 0: Rate limiting ──
  try {
    const tracker = getUsageTracker();

    // Burst rate limit (per-minute)
    const burst = tracker.checkBurst(userId);
    if (!burst.allowed) {
      sendJson(ws, {
        type: 'chat', from: 'system',
        text: `⏳ Rate limit reached. Try again in ${Math.ceil(burst.retryAfterMs / 1000)}s.`,
        ts: Date.now(),
      });
      return;
    }

    // Daily quota check (user-level)
    const quota = tracker.check(userId, 'message');
    if (!quota.allowed) {
      sendJson(ws, {
        type: 'chat', from: 'system',
        text: `📊 Daily message limit reached (${quota.limit} messages). Resets at midnight UTC. Upgrade your plan for more.`,
        ts: Date.now(),
      });
      return;
    }

    // Per-agent quota check (if agent has custom limits)
    if (agentId) {
      const agentQuota = tracker.checkAgent(userId, agentId, 'message');
      if (!agentQuota.allowed && agentQuota.scope === 'agent') {
        const agentName = resolveAgent(agentId)?.name || agentId;
        sendJson(ws, {
          type: 'chat', from: 'system',
          text: `📊 Agent "${agentName}" has reached its daily message limit (${agentQuota.limit}). Try another agent or wait until reset.`,
          ts: Date.now(),
        });
        return;
      }
    }
  } catch (rateLimitErr) {
    // Usage tracker not initialized yet — allow the message through
    console.warn('[orchestrator] Rate limit check skipped:', rateLimitErr.message);
  }

  // ── Step 1: Resolve agent config ──
  const agent = resolveAgent(agentId);
  const effectiveAgentId = agent.id;

  // Save user message to per-agent history
  appendHistory(userId, effectiveAgentId, 'user', text);

  // Typing indicator
  sendJson(ws, { type: 'typing', status: 'start', agentId: effectiveAgentId, ts: Date.now() });

  try {
    // ── Step 2: Activate MCP servers (if agent has any configured) ──
    const tools = await ensureMcpServers(agent);

    // ── Step 3: Retrieve per-agent conversation history ──
    const history = getHistory(userId, effectiveAgentId, HISTORY_TURNS);

    // ── Step 4: Semantic context retrieval ──
    const contextBlock = await retrieveContext(text, userId);

    // ── Step 5: Build augmented prompt ──
    const augmentedPrompt = buildAugmentedPrompt(text, agent, history, contextBlock, tools);

    // ── Step 6+7: Send to NullClaw and stream response ──
    let response = '';
    let usedAdapter = false;

    // ── Tool call detector: parses tool calls from streaming output
    //    and forwards them as WebSocket events so the client-side
    //    surface-manager can auto-activate surfaces (Terminal, Editor, etc.)
    const toolDetector = createToolCallDetector({
      onToolCall: (tc) => {
        sendJson(ws, {
          type: 'tool_call',
          tool: tc.name,
          args: tc.args,
          requestId: tc.id,
          agentId: effectiveAgentId,
          ts: Date.now(),
        });
      },
      onToolResult: (tr) => {
        sendJson(ws, {
          type: 'tool_result',
          tool: tr.name,
          result: { content: tr.result },
          requestId: tr.id,
          agentId: effectiveAgentId,
          ts: Date.now(),
        });
      },
    });

    // ── Streaming filter: suppress <tool_call>/<tool_result>/<tool_use> XML
    //    from reaching the client. The tool detector still gets the raw chunks.
    const streamFilter = _createStreamFilter((cleanDelta) => {
      if (cleanDelta) {
        sendJson(ws, {
          type: 'chat-stream',
          delta: cleanDelta,
          agentId: effectiveAgentId,
          agentName: agent.name,
          ts: Date.now(),
        });
      }
    });

    if (_adapter) {
      // NullClaw call timeout (120s) + stream inactivity guard (60s no data)
      let _inactTimer, _rejectTimeout;
      const _timeoutPromise = new Promise((_, reject) => {
        _rejectTimeout = reject;
        _inactTimer = setTimeout(() => reject(new Error('__stream_inactive__')), STREAM_INACTIVITY_TIMEOUT);
      });
      const _hardTimer = setTimeout(() => _rejectTimeout(new Error('__nc_timeout__')), NULLCLAW_TIMEOUT);
      const _resetInact = () => {
        clearTimeout(_inactTimer);
        _inactTimer = setTimeout(() => _rejectTimeout(new Error('__stream_inactive__')), STREAM_INACTIVITY_TIMEOUT);
      };
      try {
        response = await Promise.race([sendViaAdapter(
          userId, effectiveAgentId, augmentedPrompt, agent,
          // onChunk — text deltas (still feed to detector as fallback + filter)
          (chunk) => {
            _resetInact();
            toolDetector.feed(chunk);
            streamFilter.feed(chunk);
          },
          // onToolEvent — structured events from NullClaw's ToolEventCallback
          // These are authoritative (directly from the agent loop), so forward
          // them immediately to the client. The XML-based toolDetector is kept
          // as fallback for NullClaw instances without the event callback patch.
          (evt) => {
            _resetInact();
            if (evt.type === 'tool_call_start') {
              sendJson(ws, {
                type: 'tool_call',
                tool: evt.name,
                args: safeParseJson(evt.arguments),
                requestId: evt.id || `tc-${Date.now()}`,
                iteration: evt.iteration,
                agentId: effectiveAgentId,
                ts: Date.now(),
              });
            } else if (evt.type === 'tool_call_result') {
              // Build result object — include output for surface rendering
              const toolResult = { success: evt.success, duration_ms: evt.duration_ms };
              if (evt.output) {
                // Parse tool output into structured form for surfaces
                toolResult.content = evt.output;
                // Try to parse directory listings (NullClaw list_dir returns text lines)
                if (evt.name === 'list_dir' || evt.name === 'read_dir' || evt.name === 'list_files') {
                  try {
                    const entries = evt.output.split('\n').filter(Boolean).map(line => {
                      const isDir = line.endsWith('/');
                      return { name: line.replace(/\/$/, ''), isDir };
                    });
                    toolResult.entries = entries;
                  } catch {}
                }
              }
              sendJson(ws, {
                type: 'tool_result',
                tool: evt.name,
                args: safeParseJson(evt.arguments),
                result: toolResult,
                requestId: evt.id || `tr-${Date.now()}`,
                iteration: evt.iteration,
                agentId: effectiveAgentId,
                ts: Date.now(),
              });
            } else if (evt.type === 'iteration_start') {
              sendJson(ws, {
                type: 'agent_iteration',
                iteration: evt.iteration,
                isStreaming: evt.is_streaming,
                agentId: effectiveAgentId,
                ts: Date.now(),
              });
            }
          }
        ), _timeoutPromise]);
        usedAdapter = true;
      } catch (adapterErr) {
        clearTimeout(_hardTimer); clearTimeout(_inactTimer);
        if (adapterErr.message === '__nc_timeout__' || adapterErr.message === '__stream_inactive__') {
          throw new Error('Request timed out — the AI took too long to respond.');
        }
        console.warn(
          `[orchestrator] Adapter failed for ${userId}:${effectiveAgentId}, ` +
          `falling back to direct spawn:`, adapterErr.message
        );
      } finally {
        clearTimeout(_hardTimer); clearTimeout(_inactTimer);
      }
    }

    // Fallback: direct spawn with streaming
    if (!usedAdapter) {
      response = await runNullClawDirect(augmentedPrompt, (chunk) => {
        toolDetector.feed(chunk);
        streamFilter.feed(chunk);
      });
    }

    // Flush both detector and filter at stream end
    toolDetector.flush();
    streamFilter.flush();

    // ── End stream ──
    sendJson(ws, { type: 'chat-stream-end', agentId: effectiveAgentId, ts: Date.now() });
    sendJson(ws, { type: 'typing', status: 'stop', agentId: effectiveAgentId, ts: Date.now() });

    // ── Step 8a: GenUI code block detection → canvas ops ──
    if (response) {
      const { text: cleanText, ops, hasOps } = parseGenUIResponse(response);
      if (hasOps && ops.length > 0) {
        // Signal client that GenUI tiles are coming (shows "Rendering UI..." placeholder)
        sendJson(ws, { type: 'genui-pending', count: ops.length, ts: Date.now() });
        sendJson(ws, {
          type: 'canvas-ops',
          ops,
          source: 'genui',
          ts: Date.now(),
        });
        console.log(`[orchestrator] GenUI: ${ops.length} canvas ops extracted for ${userId}`);

        // Persist canvas ops for restore on reconnect
        try {
          const canvasMod = await import('../state/canvas.js');
          const existing = canvasMod.getCanvasState(userId);
          // Apply ops: upsert/patch merge, remove deletes, clear wipes
          let merged = [...existing];
          for (const op of ops) {
            if (op.op === 'clear') { merged = []; continue; }
            if (op.op === 'remove') { merged = merged.filter(o => o.id !== op.id); continue; }
            const idx = merged.findIndex(o => o.id === op.id);
            if (idx >= 0) { merged[idx] = { ...merged[idx], ...op }; } else { merged.push(op); }
          }
          canvasMod.setCanvasState(userId, merged);
        } catch (err) {
          console.warn('[orchestrator] Failed to persist canvas state:', err.message);
        }

        // Use cleaned text (without code blocks) for history storage
        response = cleanText;
      }
    }

    // ── Step 8b: A2UI detection → GenUI conversion ──
    if (response) {
      handleA2UIResponse(response, ws, userId);
    }

    // ── Step 9: Persist assistant response + usage tracking ──
    if (response) {
      const modelLabel = usedAdapter
        ? `nullclaw-gateway:${agent.model || 'default'}`
        : 'nullclaw';
      appendHistory(userId, effectiveAgentId, 'assistant', response, modelLabel);

      // Log usage (best-effort, don't block)
      try {
        const tracker = getUsageTracker();
        tracker.log(userId, 'message', 1, { agentId: effectiveAgentId, model: modelLabel }, effectiveAgentId);
        // Estimate tokens: ~4 chars per token for both input and output
        const inputTokens = Math.ceil(augmentedPrompt.length / 4);
        const outputTokens = Math.ceil(response.length / 4);
        tracker.log(userId, 'tokens', inputTokens + outputTokens, { input: inputTokens, output: outputTokens }, effectiveAgentId);
      } catch (usageErr) {
        // Usage tracking is non-critical — don't break chat flow
        console.warn('[orchestrator] Usage tracking error:', usageErr.message);
      }
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
    // Sanitize: only show safe messages to client, never internal errors
    const safeMsg = err.message?.startsWith('Request timed out')
      ? `❌ ${err.message}`
      : '❌ Something went wrong. Please try again.';
    sendJson(ws, {
      type: 'chat',
      from: 'system',
      agentId: effectiveAgentId,
      text: safeMsg,
      ts: Date.now(),
    });
  } finally {
    // Release concurrent request slot
    const newCount = (_activeRequests.get(userId) || 1) - 1;
    if (newCount <= 0) _activeRequests.delete(userId);
    else _activeRequests.set(userId, newCount);
  }
}

/* ------------------------------------------------------------------ */
/*  Team message routing                                              */
/* ------------------------------------------------------------------ */

/**
 * Route a message through a team's multi-agent pipeline.
 * Called when the client sends { type: 'chat', teamId: '...' }.
 *
 * @param {string} userId
 * @param {string} teamId
 * @param {{ text?: string, content?: string }} message
 * @param {import('ws').WebSocket} ws
 */
export async function routeTeamChat(userId, teamId, message, ws) {
  const text = message.text ?? message.content ?? '';
  if (!text.trim()) return;

  console.log(`[orchestrator] ${userId} → team:${teamId}: ${text.slice(0, 100)}`);

  // Rate limiting (same as single-agent)
  try {
    const tracker = getUsageTracker();
    const burst = tracker.checkBurst(userId);
    if (!burst.allowed) {
      sendJson(ws, {
        type: 'chat', from: 'system',
        text: `⏳ Rate limit reached. Try again in ${Math.ceil(burst.retryAfterMs / 1000)}s.`,
        ts: Date.now(),
      });
      return;
    }
    const quota = tracker.check(userId, 'message');
    if (!quota.allowed) {
      sendJson(ws, {
        type: 'chat', from: 'system',
        text: `📊 Daily message limit reached. Upgrade your plan for more.`,
        ts: Date.now(),
      });
      return;
    }
  } catch (e) {
    console.warn('[orchestrator] Rate limit check skipped:', e.message);
  }

  try {
    const response = await routeTeamMessage({
      userId,
      teamId,
      text,
      ws,
      adapter: _adapter,
      sendJson,
      getHistory,
      appendHistory,
      retrieveContext,
      parseGenUIResponse: (await import('../lib/genui-response-parser.js')).parseGenUIResponse,
      canvasState: await import('../state/canvas.js'),
    });

    // Usage tracking
    if (response) {
      try {
        const tracker = getUsageTracker();
        const orchestratorId = team?.agents?.find(a => a.role === 'orchestrator')?.agentId || null;
        tracker.log(userId, 'message', 1, { teamId, model: 'team' }, orchestratorId);
        const tokens = Math.ceil((text.length + response.length) / 4);
        tracker.log(userId, 'tokens', tokens, { teamId }, orchestratorId);
      } catch {}
    }
  } catch (err) {
    console.error(`[orchestrator] Team routing error for ${userId}:${teamId}:`, err.message);
    sendJson(ws, {
      type: 'chat', from: 'system',
      text: '❌ Something went wrong with team routing. Please try again.',
      ts: Date.now(),
    });
  }
}

// handleTeamDelegation removed — delegation is fully server-managed via [DELEGATE] blocks.
// No http_request delegation path exists.

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
  _toolExecutor = null;
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

/**
 * Get the built-in tool executor (for direct tool invocation).
 * Returns null if the orchestrator hasn't been initialized.
 *
 * @returns {ReturnType<import('../lib/builtin-tools.js').createToolExecutor>|null}
 */
export function getToolExecutor() {
  return _toolExecutor;
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

/**
 * Safely parse a JSON string, returning the parsed object or a { raw } wrapper.
 * Used for tool call arguments which may be double-encoded or malformed.
 * @param {string|undefined} str
 * @returns {Object}
 */
function safeParseJson(str) {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return { raw: str }; }
}
