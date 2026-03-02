/**
 * @fileoverview Context Manager — observation masking + progressive pruning.
 *
 * Manages conversation history server-side, building optimized prompts
 * for NullClaw instead of letting NullClaw accumulate context internally.
 *
 * Two key techniques:
 *   1. **Observation masking** (JetBrains NeurIPS 2025): Replace old tool
 *      results with "[result hidden — summary: ...]" markers. Keep the
 *      reasoning/decision that followed. Saves ~40-60% of tool-heavy turns.
 *
 *   2. **Canvas context pruning**: Strip old scratchy-canvas/toon/tpl code
 *      blocks from assistant messages. Only keep the last 3 canvas outputs.
 *      Saves 1,000-3,000+ tokens per turn in canvas-heavy sessions.
 *
 * Usage:
 *   const cm = new ContextManager(userId, sessionKey);
 *   cm.addTurn('user', message);
 *   cm.addTurn('assistant', response, { toolCalls: [...] });
 *   const optimizedHistory = cm.buildContext(systemPrompt, maxTokens);
 *
 * @module lib/context-manager
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Approximate tokens per character (conservative for English) */
const CHARS_PER_TOKEN = 3.5;

/** Default max context budget (tokens) — leave room for response */
const DEFAULT_MAX_CONTEXT_TOKENS = 120_000;

/** Number of recent turns to keep tool results unmasked */
const TOOL_RESULT_KEEP_RECENT = 6;

/** Number of recent turns to keep canvas blocks unmasked */
const CANVAS_KEEP_RECENT = 3;

/** Max length for a masked tool result summary */
const MASK_SUMMARY_MAX_CHARS = 150;

/** Regex patterns for canvas code blocks */
const CANVAS_BLOCK_RE = /```(?:scratchy-canvas|scratchy-toon|scratchy-tpl|scratchy-ui)\n[\s\S]*?```/g;

/** Regex for tool_call XML blocks (NullClaw leaks these sometimes) */
const TOOL_CALL_XML_RE = /<tool_call>[\s\S]*?<\/tool_call>/g;
const TOOL_RESULT_XML_RE = /<tool_result>[\s\S]*?<\/tool_result>/g;

// ─── Turn Storage ───────────────────────────────────────────────────────────

/**
 * @typedef {Object} Turn
 * @property {string} role — 'user' | 'assistant' | 'system'
 * @property {string} content — full content
 * @property {number} tokenEstimate — estimated tokens
 * @property {number} timestamp — epoch ms
 * @property {boolean} hasToolCalls — whether this turn contains tool calls
 * @property {boolean} hasCanvasOps — whether this turn contains canvas blocks
 * @property {string[]} [toolNames] — names of tools called in this turn
 * @property {string} [toolResultSummary] — brief summary of tool results (for masking)
 */

// ─── Context Manager ────────────────────────────────────────────────────────

/** @type {Map<string, Turn[]>} — sessionKey → Turn[] */
const _sessions = new Map();

/**
 * Estimate token count for a string.
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Generate a brief summary of tool call results for masking.
 * @param {string} content — full content containing tool results
 * @returns {string}
 */
function summarizeToolResults(content) {
  // Extract tool names from XML or JSON patterns
  const toolNames = [];
  const xmlMatches = content.matchAll(/<tool_call>\s*<name>([\s\S]*?)<\/name>/g);
  for (const m of xmlMatches) toolNames.push(m[1].trim());

  // Extract from JSON tool_call patterns
  const jsonMatches = content.matchAll(/"name"\s*:\s*"([^"]+)"/g);
  for (const m of jsonMatches) {
    if (!toolNames.includes(m[1])) toolNames.push(m[1]);
  }

  if (toolNames.length > 0) {
    return `Used tools: ${toolNames.join(', ')}`;
  }

  // Fallback: first line as summary
  const firstLine = content.split('\n')[0]?.slice(0, MASK_SUMMARY_MAX_CHARS) || 'tool interaction';
  return firstLine;
}

/**
 * Detect if content contains canvas operations.
 * @param {string} content
 * @returns {boolean}
 */
function hasCanvasContent(content) {
  // Reset lastIndex since regex is global (used for replace elsewhere)
  CANVAS_BLOCK_RE.lastIndex = 0;
  return CANVAS_BLOCK_RE.test(content);
}

/**
 * Detect if content contains tool call patterns.
 * @param {string} content
 * @returns {boolean}
 */
function hasToolContent(content) {
  TOOL_CALL_XML_RE.lastIndex = 0;
  TOOL_RESULT_XML_RE.lastIndex = 0;
  return TOOL_CALL_XML_RE.test(content) || TOOL_RESULT_XML_RE.test(content) ||
    content.includes('tool_call_start') || content.includes('tool_result');
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Add a turn to the session history.
 *
 * @param {string} sessionKey — unique session identifier
 * @param {string} role — 'user' | 'assistant' | 'system'
 * @param {string} content — full turn content
 * @param {Object} [meta]
 * @param {string[]} [meta.toolNames] — tools used in this turn
 * @param {string} [meta.toolResultSummary] — brief summary for masking
 */
export function addTurn(sessionKey, role, content, meta = {}) {
  if (!_sessions.has(sessionKey)) {
    _sessions.set(sessionKey, []);
  }

  const turns = _sessions.get(sessionKey);
  const turn = {
    role,
    content,
    tokenEstimate: estimateTokens(content),
    timestamp: Date.now(),
    hasToolCalls: hasToolContent(content),
    hasCanvasOps: hasCanvasContent(content),
    toolNames: meta.toolNames || [],
    toolResultSummary: meta.toolResultSummary || (hasToolContent(content) ? summarizeToolResults(content) : ''),
  };

  turns.push(turn);

  // Hard cap: don't store more than 200 turns (prevent memory leak)
  if (turns.length > 200) {
    turns.splice(0, turns.length - 200);
  }
}

/**
 * Build an optimized context from session history.
 *
 * Applies:
 *   1. Observation masking: old tool results replaced with summaries
 *   2. Canvas pruning: old canvas blocks stripped
 *   3. Token budgeting: oldest turns dropped if over budget
 *
 * @param {string} sessionKey
 * @param {string} systemPrompt — system/agent instructions
 * @param {Object} [opts]
 * @param {number} [opts.maxTokens=DEFAULT_MAX_CONTEXT_TOKENS]
 * @param {number} [opts.toolKeepRecent=TOOL_RESULT_KEEP_RECENT]
 * @param {number} [opts.canvasKeepRecent=CANVAS_KEEP_RECENT]
 * @returns {{ messages: Array<{role: string, content: string}>, tokenEstimate: number, turnCount: number, masked: number, pruned: number }}
 */
export function buildContext(sessionKey, systemPrompt, opts = {}) {
  const maxTokens = opts.maxTokens || DEFAULT_MAX_CONTEXT_TOKENS;
  const toolKeepRecent = opts.toolKeepRecent ?? TOOL_RESULT_KEEP_RECENT;
  const canvasKeepRecent = opts.canvasKeepRecent ?? CANVAS_KEEP_RECENT;

  const turns = _sessions.get(sessionKey) || [];
  const systemTokens = estimateTokens(systemPrompt);
  let budget = maxTokens - systemTokens;

  let masked = 0;
  let pruned = 0;

  // Process turns: apply masking/pruning from oldest to newest
  const processed = turns.map((turn, idx) => {
    const age = turns.length - idx; // how many turns ago (1 = most recent)
    let content = turn.content;

    // 1. Observation masking: replace old tool results with summaries
    if (turn.hasToolCalls && age > toolKeepRecent) {
      // Replace tool_call XML blocks with summary
      content = content.replace(TOOL_CALL_XML_RE, '');
      content = content.replace(TOOL_RESULT_XML_RE, '');

      // If the entire content was tool results, replace with summary
      const stripped = content.trim();
      if (stripped.length < 50 || stripped.length < turn.content.length * 0.3) {
        content = `[tool results masked — ${turn.toolResultSummary || 'tool interaction'}]`;
        masked++;
      } else {
        // Keep the reasoning parts, just remove the verbose tool output
        masked++;
      }
    }

    // 2. Canvas pruning: strip old canvas blocks
    if (turn.hasCanvasOps && age > canvasKeepRecent) {
      const before = content.length;
      content = content.replace(CANVAS_BLOCK_RE, '[canvas output removed]');
      if (content.length < before) pruned++;
    }

    return {
      role: turn.role,
      content,
      tokenEstimate: estimateTokens(content),
    };
  });

  // 3. Token budgeting: drop oldest turns if over budget
  // Always keep at least the last 4 turns
  const MIN_KEEP = 4;
  let messages = processed;

  let totalTokens = messages.reduce((sum, m) => sum + m.tokenEstimate, 0);
  while (totalTokens > budget && messages.length > MIN_KEEP) {
    const dropped = messages.shift();
    totalTokens -= dropped.tokenEstimate;
  }

  return {
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    tokenEstimate: totalTokens + systemTokens,
    turnCount: messages.length,
    masked,
    pruned,
  };
}

/**
 * Get raw turn count for a session.
 * @param {string} sessionKey
 * @returns {number}
 */
export function getTurnCount(sessionKey) {
  return (_sessions.get(sessionKey) || []).length;
}

/**
 * Get estimated total tokens for a session (unmasked).
 * @param {string} sessionKey
 * @returns {number}
 */
export function getTokenEstimate(sessionKey) {
  const turns = _sessions.get(sessionKey) || [];
  return turns.reduce((sum, t) => sum + t.tokenEstimate, 0);
}

/**
 * Clear a session's history.
 * @param {string} sessionKey
 */
export function clearSession(sessionKey) {
  _sessions.delete(sessionKey);
}

/**
 * Clear all sessions for testing/restart.
 */
export function clearAll() {
  _sessions.clear();
}

/**
 * Get stats across all sessions.
 * @returns {{ sessionCount: number, totalTurns: number, totalTokens: number }}
 */
export function stats() {
  let totalTurns = 0;
  let totalTokens = 0;
  for (const turns of _sessions.values()) {
    totalTurns += turns.length;
    totalTokens += turns.reduce((sum, t) => sum + t.tokenEstimate, 0);
  }
  return { sessionCount: _sessions.size, totalTurns, totalTokens };
}

// ─── Testing exports ────────────────────────────────────────────────────────

export const _testing = {
  estimateTokens,
  summarizeToolResults,
  hasCanvasContent,
  hasToolContent,
  CANVAS_BLOCK_RE,
  TOOL_CALL_XML_RE,
  TOOL_RESULT_XML_RE,
  _sessions,
};
