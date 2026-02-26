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
