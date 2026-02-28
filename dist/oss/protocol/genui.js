/**
 * @fileoverview GenUI v1 protocol handler for Scratchy.
 *
 * GenUI is the internal protocol Scratchy uses to manage a canvas of
 * declarative UI components. Agents emit ops inside fenced code blocks
 * (```scratchy-canvas``` for JSON, ```scratchy-toon``` for TOON format)
 * and this module parses, validates, and applies them to a reactive state map.
 *
 * @module protocol/genui
 */

import { parseToon } from './toon.js';

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Enum of valid GenUI operation types.
 * @readonly
 * @enum {string}
 */
export const OP_TYPES = Object.freeze({
  /** Create or fully replace a component. */
  upsert: 'upsert',
  /** Partial (shallow-merge) update to an existing component's data. */
  patch: 'patch',
  /** Remove a single component by id. */
  remove: 'remove',
  /** Remove all components from the canvas. */
  clear: 'clear',
  /** Reposition a component (change its layout zone/order). */
  move: 'move',
  /** Change the global canvas layout mode. */
  layout: 'layout',
  /** Show a temporary toast notification. */
  toast: 'toast',
  /** Show/hide a modal overlay component. */
  overlay: 'overlay',
  /** Trigger a named action (widget activation, etc.). */
  trigger: 'trigger',
  /** Dismiss a toast or overlay by id. */
  dismiss: 'dismiss',
});

/** Set of ops that require an `id` field. */
const ID_REQUIRED_OPS = new Set(['upsert', 'patch', 'remove', 'move', 'dismiss']);

/** Set of ops that don't need an `id`. */
const ID_OPTIONAL_OPS = new Set(['clear', 'layout', 'toast', 'overlay', 'trigger']);

// ─── Block extraction regex ─────────────────────────────────────────────────

/**
 * Matches a fenced ```scratchy-canvas``` code block and captures its content.
 * Uses the 's' flag so `.` matches newlines.
 */
const CANVAS_BLOCK_RE = /```scratchy-canvas\s*\n([\s\S]*?)```/g;

/**
 * Matches a fenced ```scratchy-toon``` code block and captures its content.
 */
const TOON_BLOCK_RE = /```scratchy-toon\s*\n([\s\S]*?)```/g;

// ─── Parsers ────────────────────────────────────────────────────────────────

/**
 * Extract GenUI ops from all ```scratchy-canvas``` code blocks in a text.
 *
 * Each line inside a block is expected to be a JSON object representing one op.
 * Blank lines and lines that fail JSON.parse are silently skipped.
 *
 * @param {string} text - The full agent response text.
 * @returns {object[]} Array of parsed op objects.
 *
 * @example
 * const text = 'Here is a card:\n```scratchy-canvas\n{"op":"upsert","id":"c1","type":"card","data":{"title":"Hi"}}\n```';
 * parseGenUIBlock(text);
 * // [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'Hi' } }]
 */
export function parseGenUIBlock(text) {
  if (typeof text !== 'string') return [];

  const ops = [];
  let match;

  // Reset regex state
  CANVAS_BLOCK_RE.lastIndex = 0;

  while ((match = CANVAS_BLOCK_RE.exec(text)) !== null) {
    const blockContent = match[1];
    const lines = blockContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && parsed.op) {
          ops.push(normalizeOp(parsed));
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  return ops;
}

/**
 * Extract GenUI ops from all ```scratchy-toon``` code blocks in a text.
 *
 * TOON blocks are parsed via the TOON parser. A single block may contain
 * multiple ops separated by `---`.
 *
 * @param {string} text - The full agent response text.
 * @returns {object[]} Array of parsed op objects.
 *
 * @example
 * const text = '```scratchy-toon\nop: upsert\nid: c1\ntype: card\ndata:\n  title: Hello\n```';
 * parseToonBlock(text);
 * // [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'Hello' } }]
 */
export function parseToonBlock(text) {
  if (typeof text !== 'string') return [];

  const ops = [];
  let match;

  // Reset regex state
  TOON_BLOCK_RE.lastIndex = 0;

  while ((match = TOON_BLOCK_RE.exec(text)) !== null) {
    const blockContent = match[1];
    try {
      const parsed = parseToon(blockContent);
      if (Array.isArray(parsed)) {
        // Multiple ops separated by ---
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.op) {
            ops.push(normalizeOp(item));
          }
        }
      } else if (parsed && typeof parsed === 'object' && parsed.op) {
        ops.push(normalizeOp(parsed));
      }
    } catch {
      // Skip unparseable TOON blocks
    }
  }

  return ops;
}

/**
 * Normalize and validate an op object.
 *
 * @param {object} raw - The raw parsed op.
 * @returns {object} Normalized op.
 * @throws {Error} If the op type is unknown.
 */
function normalizeOp(raw) {
  const op = { ...raw };

  // Validate op type
  if (!OP_TYPES[op.op]) {
    throw new Error(`Unknown op type: ${op.op}`);
  }

  // Ensure data is an object for ops that use it
  if (op.op === 'upsert' || op.op === 'patch') {
    if (!op.data || typeof op.data !== 'object') {
      op.data = op.data ?? {};
    }
  }

  // Default layout
  if (op.op === 'upsert' && !op.layout) {
    op.layout = { zone: 'auto' };
  }

  return op;
}

// ─── State management ───────────────────────────────────────────────────────

/**
 * @typedef {Object} ComponentState
 * @property {string} type - Component type (e.g. 'card', 'table', 'gauge').
 * @property {object} data - Component data payload.
 * @property {object} [layout] - Layout hints (zone, order).
 */

/**
 * Apply an array of GenUI ops to a state map, returning the mutated map.
 *
 * The state is a `Map<string, ComponentState>` where keys are component ids.
 * This function mutates the map in place for performance but also returns it
 * for chaining.
 *
 * @param {Map<string, ComponentState>} currentState - The current canvas state.
 *   If null/undefined, a new Map is created.
 * @param {object[]} ops - Array of GenUI ops to apply.
 * @returns {Map<string, ComponentState>} The updated state map.
 *
 * @example
 * const state = new Map();
 * applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'Hi' } }]);
 * state.get('c1'); // { type: 'card', data: { title: 'Hi' }, layout: { zone: 'auto' } }
 */
export function applyOps(currentState, ops) {
  const state = currentState ?? new Map();

  if (!Array.isArray(ops)) return state;

  for (const op of ops) {
    if (!op || typeof op !== 'object') continue;

    switch (op.op) {
      case 'upsert': {
        if (!op.id) break;
        state.set(op.id, {
          type: op.type || 'card',
          data: { ...op.data },
          layout: { ...(op.layout || { zone: 'auto' }) },
        });
        break;
      }

      case 'patch': {
        if (!op.id) break;
        const existing = state.get(op.id);
        if (!existing) break; // Can't patch a non-existent component
        state.set(op.id, {
          ...existing,
          data: { ...existing.data, ...op.data },
          layout: op.layout ? { ...existing.layout, ...op.layout } : existing.layout,
        });
        break;
      }

      case 'remove': {
        if (!op.id) break;
        state.delete(op.id);
        break;
      }

      case 'clear': {
        state.clear();
        break;
      }

      case 'move': {
        if (!op.id) break;
        const component = state.get(op.id);
        if (!component) break;
        state.set(op.id, {
          ...component,
          layout: { ...component.layout, ...(op.layout || {}) },
        });
        break;
      }

      case 'layout': {
        // Layout ops set a global mode — store under the reserved key __layout__
        state.set('__layout__', {
          type: '__layout__',
          data: { mode: op.mode || 'auto' },
          layout: {},
        });
        break;
      }

      case 'toast': {
        // Toasts are ephemeral — store under __toast__{id or timestamp}
        const toastId = op.id || `__toast__${Date.now()}`;
        state.set(toastId, {
          type: '__toast__',
          data: { ...op.data, message: op.message || op.data?.message },
          layout: {},
        });
        break;
      }

      case 'overlay': {
        const overlayId = op.id || '__overlay__';
        state.set(overlayId, {
          type: '__overlay__',
          data: { ...op.data },
          layout: {},
        });
        break;
      }

      case 'trigger': {
        // Triggers are fire-and-forget — store briefly for consumption
        const triggerId = op.id || `__trigger__${Date.now()}`;
        state.set(triggerId, {
          type: '__trigger__',
          data: { action: op.action, context: op.context, ...op.data },
          layout: {},
        });
        break;
      }

      case 'dismiss': {
        if (!op.id) break;
        state.delete(op.id);
        break;
      }

      default:
        // Unknown op — silently ignore
        break;
    }
  }

  return state;
}
