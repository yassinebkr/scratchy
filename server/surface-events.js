/**
 * @module server/surface-events
 * Scratchy v2 — Surface Event Forwarding Bridge
 *
 * Connects NullClaw tool calls to contextual UI surfaces on the client.
 * When the AI uses tools (exec, write_file, web_search, etc.), this module:
 *   1. Detects which surfaces should activate
 *   2. Computes a CSS grid layout for the active surface set
 *   3. Forwards tool call data and results to the appropriate surface
 *   4. Handles A2UI envelope → community widget loading
 *   5. Processes client-side surface actions (user interactions)
 *
 * Maintains a minimal per-user surface registry for layout computation.
 * All rich surface state lives on the client.
 */

import {
  SURFACE_TYPES,
  detectSurfaces,
  computeLayout,
  surfaceTransition,
} from '../protocol/surfaces.js';

import {
  isA2UIMessage,
  parseA2UIMessage,
  a2uiToGenUI,
} from '../protocol/a2ui.js';

import {
  broadcastToUser,
} from './ws.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/**
 * Built-in A2UI component types that we handle natively.
 * Anything outside this set is a community widget — forwarded to
 * sc-canvas for dynamic rendering via A2UI→GenUI conversion.
 * @type {Set<string>}
 */
const BUILTIN_A2UI_TYPES = new Set([
  'text', 'table', 'form', 'chart', 'image',
  'button_group', 'progress', 'status', 'list', 'code',
]);

/**
 * Maps tool names to their target surface name.
 * Built from SURFACE_TYPES so it stays in sync.
 * @type {Map<string, string>}
 */
const TOOL_TO_SURFACE = new Map();
for (const [name, def] of Object.entries(SURFACE_TYPES)) {
  if (def.trigger !== 'always') {
    TOOL_TO_SURFACE.set(def.trigger, name);
  }
}

/**
 * Surface deactivation timeout (ms).
 * After a tool result, surfaces stay active for this duration before
 * being eligible for deactivation (prevents flicker on rapid tool calls).
 * @type {number}
 */
const SURFACE_LINGER_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Per-user surface state (minimal)                                  */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} UserSurfaceState
 * @property {string[]} activeSurfaces - Currently active surface names.
 * @property {Map<string, number>} surfaceTimestamps - Last activation time per surface.
 * @property {Map<string, NodeJS.Timeout>} lingerTimers - Deactivation timers.
 */

/** @type {Map<string, UserSurfaceState>} userId → surface state */
const userStates = new Map();

/**
 * Get or create surface state for a user.
 * @param {string} userId
 * @returns {UserSurfaceState}
 */
function getState(userId) {
  let state = userStates.get(userId);
  if (!state) {
    state = {
      activeSurfaces: ['chat'],
      surfaceTimestamps: new Map(),
      lingerTimers: new Map(),
    };
    userStates.set(userId, state);
  }
  return state;
}

/**
 * Clean up state for a user (call on disconnect).
 * @param {string} userId
 */
export function cleanupUser(userId) {
  const state = userStates.get(userId);
  if (state) {
    for (const timer of state.lingerTimers.values()) {
      clearTimeout(timer);
    }
    userStates.delete(userId);
  }
}

/* ------------------------------------------------------------------ */
/*  Tool call detection from NullClaw response streams                */
/* ------------------------------------------------------------------ */

/**
 * Patterns for detecting tool calls in NullClaw response text.
 *
 * NullClaw can emit tool calls in several formats depending on the model:
 *   1. Anthropic-style XML blocks: <tool_use><name>exec</name><input>{...}</input></tool_use>
 *   2. JSON blocks: {"tool_call": {"name": "exec", "arguments": {...}}}
 *   3. OpenAI-style function_call: {"function_call": {"name": "exec", "arguments": "..."}}
 *   4. Fenced JSON with tool markers: ```tool\n{...}\n```
 *
 * We parse all four — the first match wins.
 */

/**
 * Extract a brace-balanced JSON object from text starting at a given position.
 * Returns the substring from `start` up to (and including) the matching closing brace,
 * or null if no balanced object is found.
 *
 * @param {string} text
 * @param {number} start - Index of the opening '{'.
 * @returns {string|null}
 */
function extractBalancedJSON(text, start) {
  if (start < 0 || text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

/**
 * @typedef {Object} DetectedToolCall
 * @property {string} name - Tool name (e.g. 'exec', 'write_file').
 * @property {object} args - Tool arguments.
 * @property {string} format - Detection format ('xml'|'json'|'function_call'|'fenced').
 */

/**
 * Extract tool calls from a NullClaw response string.
 * Handles multiple formats: XML tool_use blocks, JSON tool_call objects,
 * OpenAI function_call objects, and fenced code blocks with tool markers.
 *
 * @param {string} text - Response text from NullClaw.
 * @returns {DetectedToolCall[]} Array of detected tool calls (may be empty).
 */
export function extractToolCalls(text) {
  if (!text || typeof text !== 'string') return [];

  const results = [];

  // ── Format 1: Anthropic XML tool_use blocks ──
  const xmlPattern = /<tool_use>\s*<name>([\w.-]+)<\/name>\s*<input>([\s\S]*?)<\/input>\s*<\/tool_use>/g;
  let match;
  while ((match = xmlPattern.exec(text)) !== null) {
    const name = match[1];
    let args = {};
    try {
      args = JSON.parse(match[2].trim());
    } catch {
      // If not valid JSON, wrap raw text as single arg
      args = { _raw: match[2].trim() };
    }
    results.push({ name, args, format: 'xml' });
  }
  if (results.length > 0) return results;

  // ── Format 2: JSON tool_call objects ──
  // Match {"tool_call": {...}} using brace-balanced extraction
  const toolCallStarts = [...text.matchAll(/"tool_call"\s*:/g)];
  for (const m of toolCallStarts) {
    const objStr = extractBalancedJSON(text, text.lastIndexOf('{', m.index));
    if (!objStr) continue;
    try {
      const parsed = JSON.parse(objStr);
      const tc = parsed.tool_call;
      if (tc && tc.name) {
        let args = tc.arguments || tc.args || tc.input || {};
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { args = { _raw: args }; }
        }
        results.push({ name: tc.name, args, format: 'json' });
      }
    } catch { /* skip unparseable */ }
  }
  if (results.length > 0) return results;

  // ── Format 3: OpenAI function_call ──
  const fnCallStarts = [...text.matchAll(/"function_call"\s*:/g)];
  for (const m of fnCallStarts) {
    const objStr = extractBalancedJSON(text, text.lastIndexOf('{', m.index));
    if (!objStr) continue;
    try {
      const parsed = JSON.parse(objStr);
      const fc = parsed.function_call;
      if (fc && fc.name) {
        let args = fc.arguments || fc.args || {};
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { args = { _raw: args }; }
        }
        results.push({ name: fc.name, args, format: 'function_call' });
      }
    } catch { /* skip unparseable */ }
  }
  if (results.length > 0) return results;

  // ── Format 4: Fenced code blocks with tool marker ──
  // ```tool\n{"name":"exec","args":{...}}\n```
  const fencedPattern = /```tool\s*\n([\s\S]*?)```/g;
  while ((match = fencedPattern.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.name) {
        results.push({
          name: parsed.name,
          args: parsed.args || parsed.arguments || parsed.input || {},
          format: 'fenced',
        });
      }
    } catch {
      // Skip unparseable fenced blocks
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Surface activation / deactivation                                 */
/* ------------------------------------------------------------------ */

/**
 * Activate surfaces for a tool call and broadcast layout changes.
 *
 * @param {string} userId
 * @param {string[]} toolNames - Tool names that triggered activation.
 * @returns {{ newSurfaces: string[], layout: object, transition: object }}
 */
function activateSurfaces(userId, toolNames) {
  const state = getState(userId);
  const previousSurfaces = [...state.activeSurfaces];

  // Detect which surfaces should now be active (includes 'chat' always)
  const detected = detectSurfaces(toolNames);

  // Merge with currently active surfaces (don't remove lingering ones)
  const merged = new Set([...state.activeSurfaces, ...detected]);
  const newSurfaces = [...merged].sort((a, b) => {
    const pa = SURFACE_TYPES[a]?.priority ?? 0;
    const pb = SURFACE_TYPES[b]?.priority ?? 0;
    return pb - pa;
  });

  // Update timestamps for newly activated surfaces
  const now = Date.now();
  for (const s of detected) {
    state.surfaceTimestamps.set(s, now);
    // Clear any pending linger timer — surface is active again
    if (state.lingerTimers.has(s)) {
      clearTimeout(state.lingerTimers.get(s));
      state.lingerTimers.delete(s);
    }
  }

  state.activeSurfaces = newSurfaces;

  // Compute layout and transition
  const layout = computeLayout(newSurfaces);
  const transition = surfaceTransition(previousSurfaces, newSurfaces);

  return { newSurfaces, layout, transition };
}

/**
 * Schedule deactivation of a surface after the linger period.
 * If new tool calls come in for this surface before the timer fires,
 * the timer is cancelled (see activateSurfaces).
 *
 * @param {string} userId
 * @param {string} surfaceName
 */
function scheduleDeactivation(userId, surfaceName) {
  // Never deactivate chat
  if (surfaceName === 'chat') return;

  const state = getState(userId);

  // Clear existing timer
  if (state.lingerTimers.has(surfaceName)) {
    clearTimeout(state.lingerTimers.get(surfaceName));
  }

  const timer = setTimeout(() => {
    state.lingerTimers.delete(surfaceName);

    // Remove surface from active list
    const idx = state.activeSurfaces.indexOf(surfaceName);
    if (idx === -1) return;

    const previousSurfaces = [...state.activeSurfaces];
    state.activeSurfaces.splice(idx, 1);
    state.surfaceTimestamps.delete(surfaceName);

    // Recompute layout and broadcast deactivation
    const layout = computeLayout(state.activeSurfaces);
    const transition = surfaceTransition(previousSurfaces, state.activeSurfaces);

    broadcastToUser(userId, {
      type: 'surface-activate',
      surfaces: [...state.activeSurfaces],
      layout,
      transition,
      ts: Date.now(),
    });
  }, SURFACE_LINGER_MS);

  state.lingerTimers.set(surfaceName, timer);
}

/* ------------------------------------------------------------------ */
/*  A2UI community widget detection                                   */
/* ------------------------------------------------------------------ */

/**
 * Detect community (non-builtin) component types in an A2UI message.
 *
 * @param {import('../protocol/a2ui.js').A2UIComponent[]} components
 * @returns {{ builtin: import('../protocol/a2ui.js').A2UIComponent[], community: import('../protocol/a2ui.js').A2UIComponent[] }}
 */
function classifyA2UIComponents(components) {
  const builtin = [];
  const community = [];

  for (const comp of components) {
    if (BUILTIN_A2UI_TYPES.has(comp.type)) {
      builtin.push(comp);
    } else {
      community.push(comp);
    }
  }

  return { builtin, community };
}

/* ------------------------------------------------------------------ */
/*  Handler factory                                                   */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} SurfaceEventHandlerOpts
 * @property {typeof console} [logger=console] - Logger instance.
 * @property {number} [lingerMs=30000] - Surface deactivation linger time.
 */

/**
 * @typedef {Object} SurfaceEventHandler
 * @property {(userId: string, toolName: string, toolArgs: object, ws?: import('ws').WebSocket) => void} handleToolCall
 *   Process a tool call: activate surfaces, broadcast events.
 * @property {(userId: string, toolName: string, result: object, ws?: import('ws').WebSocket) => void} handleToolResult
 *   Process a tool result: forward to surface, schedule deactivation.
 * @property {(userId: string, a2uiMsg: string|object, ws?: import('ws').WebSocket) => void} handleA2UI
 *   Process an A2UI envelope: classify components, forward to surfaces/canvas.
 * @property {(userId: string, msg: object, ws?: import('ws').WebSocket) => void} handleSurfaceAction
 *   Process a client surface action (user interaction with a surface).
 * @property {(text: string) => DetectedToolCall[]} extractToolCalls
 *   Parse tool calls from NullClaw response text.
 * @property {(userId: string) => string[]} getActiveSurfaces
 *   Get currently active surfaces for a user.
 * @property {(userId: string) => void} cleanup
 *   Clean up per-user state.
 */

/**
 * Create a surface event handler with the given options.
 *
 * Usage in chat-handler.js:
 * ```js
 * import { createSurfaceEventHandler } from './surface-events.js';
 * const surfaceEvents = createSurfaceEventHandler();
 *
 * // When NullClaw makes a tool call:
 * surfaceEvents.handleToolCall(userId, 'exec', { command: 'ls -la' });
 *
 * // When the tool returns a result:
 * surfaceEvents.handleToolResult(userId, 'exec', { output: '...', exitCode: 0 });
 *
 * // When an A2UI message is detected:
 * surfaceEvents.handleA2UI(userId, a2uiEnvelope);
 *
 * // When a client sends a surface action:
 * surfaceEvents.handleSurfaceAction(userId, msg);
 * ```
 *
 * @param {SurfaceEventHandlerOpts} [opts={}]
 * @returns {SurfaceEventHandler}
 */
export function createSurfaceEventHandler(opts = {}) {
  const logger = opts.logger || console;

  // ── handleToolCall ──────────────────────────────────────────────────

  /**
   * Handle a detected tool call from the AI backend.
   *
   * 1. Determines which surfaces should activate.
   * 2. Broadcasts `surface-activate` with layout to the user's connections.
   * 3. Broadcasts `surface-event` with the tool call data to the target surface.
   *
   * @param {string} userId
   * @param {string} toolName - e.g. 'exec', 'write_file', 'web_search'
   * @param {object} toolArgs - Tool arguments
   * @param {import('ws').WebSocket} [ws] - Optional: unused, broadcasts to all user connections
   */
  function handleToolCall(userId, toolName, toolArgs, ws) {
    const surfaceName = TOOL_TO_SURFACE.get(toolName);

    // Activate surfaces
    const { newSurfaces, layout, transition } = activateSurfaces(userId, [toolName]);

    // Only broadcast layout change if surfaces actually changed
    if (transition.add.length > 0 || transition.remove.length > 0) {
      broadcastToUser(userId, {
        type: 'surface-activate',
        surfaces: newSurfaces,
        layout,
        transition,
        ts: Date.now(),
      });
    }

    // Forward tool call data to the target surface
    if (surfaceName) {
      broadcastToUser(userId, {
        type: 'surface-event',
        surface: surfaceName,
        event: 'tool-call',
        data: { name: toolName, args: toolArgs },
        ts: Date.now(),
      });

      logger.log(`[surface-events] Tool call → ${surfaceName}: ${toolName} for ${userId}`);
    } else {
      // Tool doesn't map to a known surface — still broadcast as generic event
      broadcastToUser(userId, {
        type: 'surface-event',
        surface: 'chat',
        event: 'tool-call',
        data: { name: toolName, args: toolArgs },
        ts: Date.now(),
      });

      logger.log(`[surface-events] Tool call → chat (unmapped): ${toolName} for ${userId}`);
    }
  }

  // ── handleToolResult ────────────────────────────────────────────────

  /**
   * Handle a tool result (the output after a tool call completes).
   *
   * 1. Forwards the result to the appropriate surface as a `tool-result` event.
   * 2. Schedules surface deactivation after the linger period.
   *
   * @param {string} userId
   * @param {string} toolName - e.g. 'exec', 'write_file'
   * @param {object} result - Tool result data (shape depends on tool)
   * @param {import('ws').WebSocket} [ws] - Optional: unused, broadcasts to all user connections
   */
  function handleToolResult(userId, toolName, result, ws) {
    const surfaceName = TOOL_TO_SURFACE.get(toolName) || 'chat';

    // Forward result to the target surface
    broadcastToUser(userId, {
      type: 'surface-event',
      surface: surfaceName,
      event: 'tool-result',
      data: { name: toolName, result },
      ts: Date.now(),
    });

    // Schedule deactivation of the surface after linger period
    if (surfaceName !== 'chat') {
      scheduleDeactivation(userId, surfaceName);
    }

    logger.log(`[surface-events] Tool result → ${surfaceName}: ${toolName} for ${userId}`);
  }

  // ── handleA2UI ──────────────────────────────────────────────────────

  /**
   * Handle an A2UI message envelope from the AI backend.
   *
   * 1. Parses the A2UI envelope.
   * 2. Classifies components into builtin vs community.
   * 3. Converts builtin components to GenUI and sends as canvas ops.
   * 4. For community components, sends `a2ui-load` events to sc-canvas
   *    for dynamic widget loading.
   * 5. Activates the canvas surface if not already active.
   *
   * @param {string} userId
   * @param {string|object} a2uiMsg - A2UI message (object or JSON string)
   * @param {import('ws').WebSocket} [ws] - Optional: unused, broadcasts to all user connections
   */
  function handleA2UI(userId, a2uiMsg, ws) {
    // Parse the envelope
    const parsed = parseA2UIMessage(a2uiMsg);
    if (!parsed || parsed.allComponents.length === 0) {
      logger.warn(`[surface-events] Empty or invalid A2UI message for ${userId}`);
      return;
    }

    // Activate canvas surface
    const { newSurfaces, layout, transition } = activateSurfaces(userId, ['canvas_op']);

    if (transition.add.length > 0 || transition.remove.length > 0) {
      broadcastToUser(userId, {
        type: 'surface-activate',
        surfaces: newSurfaces,
        layout,
        transition,
        ts: Date.now(),
      });
    }

    // Classify components
    const { builtin, community } = classifyA2UIComponents(parsed.allComponents);

    // Convert and send builtin components as GenUI canvas ops
    if (builtin.length > 0) {
      const genUIOps = a2uiToGenUI(builtin);
      if (genUIOps.length > 0) {
        broadcastToUser(userId, {
          type: 'canvas-ops',
          ops: genUIOps,
          source: 'a2ui',
          ts: Date.now(),
        });
      }
    }

    // Forward community components for dynamic widget loading
    if (community.length > 0) {
      for (const comp of community) {
        broadcastToUser(userId, {
          type: 'surface-event',
          surface: 'canvas',
          event: 'a2ui-load',
          data: {
            component: comp,
            metadata: parsed.metadata || {},
          },
          ts: Date.now(),
        });
      }

      // Log community widget usage for analytics
      const communityTypes = [...new Set(community.map(c => c.type))];
      logger.log(
        `[surface-events] A2UI community widgets loaded for ${userId}: ${communityTypes.join(', ')} (${community.length} components)`
      );
    }

    logger.log(
      `[surface-events] A2UI processed for ${userId}: ${builtin.length} builtin, ${community.length} community`
    );

    // Schedule canvas deactivation
    scheduleDeactivation(userId, 'canvas');
  }

  // ── handleSurfaceAction ─────────────────────────────────────────────

  /**
   * Handle a client-side surface action (user interacting with a surface).
   *
   * Surface actions flow: Client → Server → (potentially) back to AI or other surfaces.
   * This is the server-side relay point.
   *
   * Expected message format:
   * ```js
   * { type: 'surface-action', surface: 'terminal', action: 'input', data: { text: 'ls -la' } }
   * ```
   *
   * @param {string} userId
   * @param {object} msg - The surface action message.
   * @param {string} msg.surface - Target surface name.
   * @param {string} msg.action - Action name (e.g. 'input', 'select', 'scroll').
   * @param {object} [msg.data] - Action payload.
   * @param {import('ws').WebSocket} [ws] - Optional: the originating WebSocket.
   */
  function handleSurfaceAction(userId, msg, ws) {
    const { surface, action, data } = msg;

    if (!surface || !action) {
      logger.warn(`[surface-events] Invalid surface action from ${userId}: missing surface or action`);
      return;
    }

    // Validate surface name
    if (!SURFACE_TYPES[surface]) {
      logger.warn(`[surface-events] Unknown surface in action from ${userId}: ${surface}`);
      return;
    }

    // Broadcast the action to all user connections (multi-device sync)
    // Exclude the originator if ws is provided
    broadcastToUser(userId, {
      type: 'surface-action',
      surface,
      action,
      data: data || {},
      userId,
      ts: Date.now(),
    });

    logger.log(`[surface-events] Surface action: ${surface}.${action} from ${userId}`);
  }

  // ── getActiveSurfaces ───────────────────────────────────────────────

  /**
   * Get the currently active surfaces for a user.
   * @param {string} userId
   * @returns {string[]}
   */
  function getActiveSurfaces(userId) {
    return [...getState(userId).activeSurfaces];
  }

  // ── Return handler object ───────────────────────────────────────────

  return {
    handleToolCall,
    handleToolResult,
    handleA2UI,
    handleSurfaceAction,
    extractToolCalls,
    getActiveSurfaces,
    cleanup: cleanupUser,
  };
}
