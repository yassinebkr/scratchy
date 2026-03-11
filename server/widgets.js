/**
 * @module server/widgets
 * Widget integration layer for Scratchy v2.
 *
 * Creates the WidgetRegistry, registers all built-in widgets,
 * initializes them with the database context, and exports an
 * action handler for the WebSocket server.
 *
 * @example
 * ```js
 * import { initWidgets } from './widgets.js';
 * const handleWidget = await initWidgets(db, broadcastToUser);
 * // In ws.js:
 * onWidgetAction: handleWidget
 * ```
 */

import { WidgetRegistry } from '../lib/widgets/framework.js';
import { notesWidget } from '../lib/widgets/notes.js';
import { calendarWidget } from '../lib/widgets/calendar.js';
import { emailWidget } from '../lib/widgets/email.js';
import { analyticsWidget } from '../lib/widgets/analytics.js';
import * as users from '../state/users.js';

/** @type {WidgetRegistry|null} */
let registry = null;

/** Callback for routing live widget actions to the chat pipeline */
let _onLiveWidgetAction = null;

/**
 * Register a callback for routing live widget actions to the chat pipeline.
 * Called from index.js after both widget system and WS handler are initialized.
 * @param {(userId: string, msg: object, ws: WebSocket) => Promise<void>} fn
 */
export function setLiveWidgetActionHandler(fn) {
  _onLiveWidgetAction = fn;
}

/**
 * Initialize the widget system.
 *
 * Creates a WidgetRegistry, registers all built-in widgets,
 * and returns an async action handler compatible with the WS server's
 * `onWidgetAction(userId, msg, ws)` signature.
 *
 * @param {import('better-sqlite3').Database} db - SQLite database instance
 * @param {(userId: string, msg: Record<string, unknown>) => number} wsBroadcast - broadcastToUser function
 * @param {Record<string, unknown>} [config={}] - Shared configuration (API keys, etc.)
 * @returns {Promise<(userId: string, msg: Record<string, unknown>, ws: import('ws').WebSocket) => Promise<void>>}
 */
export async function initWidgets(db, wsBroadcast, config = {}) {
  registry = new WidgetRegistry();

  // Register all built-in widgets
  registry.register(notesWidget);
  registry.register(calendarWidget);
  registry.register(emailWidget);
  registry.register(analyticsWidget);

  // Build the widget context
  /** @type {import('../lib/widgets/framework.js').WidgetContext} */
  const ctx = {
    db,
    broadcast(userId, ops) {
      wsBroadcast(userId, {
        type: 'canvas-ops',
        ops,
        ts: Date.now(),
      });
    },
    getUser(userId) {
      return users.getUser(userId);
    },
    config,
  };

  // Initialize all widgets
  await registry.initAll(ctx);

  /**
   * WebSocket action handler.
   * Called by ws.js when a `widget-action` message arrives.
   *
   * @param {string} userId - Authenticated user ID
   * @param {Record<string, unknown>} msg - The full WS message (must have .action)
   * @param {import('ws').WebSocket} ws - The client's WebSocket connection
   */
  async function handleWidgetAction(userId, msg, ws) {
    const action = msg.action;
    if (!action || typeof action !== 'string') {
      sendJson(ws, { type: 'error', message: 'widget-action requires an "action" string' });
      return;
    }

    const context = msg.context && typeof msg.context === 'object' ? msg.context : {};

    // Live widget actions — check if widget has client-side handler
    if (context.isLiveWidget) {
      // If the widget has a js handler, actions should be handled client-side.
      // Reaching the server means the client has a stale cache — drop silently
      // instead of burning an LLM call on a UI interaction.
      try {
        const canvasState = await import('../state/canvas.js');
        const ops = canvasState.getCanvasState(userId);
        const widgetDef = ops.find(o => o.op === 'define' && o.id === context.widgetId);
        if (widgetDef?.component?.js) {
          console.log(`[widgets] Dropping widget action "${action}" for "${context.widgetId}" — has js handler (client cache stale?)`);
          return;
        }
      } catch { /* canvas state unavailable — fall through to agent */ }

      const agentHint = context.createdBy ? ` (from ${context.createdBy}'s widget)` : '';
      const actionMsg = `[Widget Action${agentHint}] action="${action}" widgetId="${context.widgetId || '?'}" payload=${JSON.stringify(context)}`;
      // Emit a synthetic chat event for the WS handler to pick up
      if (typeof _onLiveWidgetAction === 'function') {
        try {
          await _onLiveWidgetAction(userId, { type: 'chat', text: actionMsg, agentId: context.createdBy || null }, ws);
        } catch (e) {
          console.warn(`[widgets] Live widget action routing failed:`, e.message);
          sendJson(ws, { type: 'error', message: 'Failed to route widget action to agent' });
        }
      }
      return;
    }

    const ops = await registry.handleAction(userId, action, context);

    // Send the resulting GenUI ops back to the client
    if (ops.length > 0) {
      sendJson(ws, {
        type: 'canvas-ops',
        ops,
        ts: Date.now(),
      });
    }
  }

  console.log(`[widgets] System ready — ${registry.size} widgets registered`);
  return handleWidgetAction;
}

/**
 * Get the active registry (for inspection/testing).
 * @returns {WidgetRegistry|null}
 */
export function getRegistry() {
  return registry;
}

/**
 * Shut down all widgets gracefully.
 */
export async function destroyWidgets() {
  if (registry) {
    await registry.destroyAll();
    registry = null;
    console.log('[widgets] System shut down');
  }
}

// ─── Internal Helper ────────────────────────────────────────────────────────

/**
 * Send JSON to a WebSocket.
 * @param {import('ws').WebSocket} ws
 * @param {Record<string, unknown>} msg
 */
function sendJson(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
