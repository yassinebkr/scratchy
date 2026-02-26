/**
 * @module lib/widgets/framework
 * Widget framework for Scratchy v2.
 *
 * Provides a registry-based architecture for widgets that handle user actions
 * from the GenUI canvas. Each widget registers itself with a unique prefix;
 * incoming actions are routed by matching the prefix to the action string.
 *
 * @example
 * ```js
 * const registry = new WidgetRegistry();
 * registry.register(notesWidget);
 * await registry.initAll(ctx);
 * const ops = await registry.handleAction(userId, 'sn-list', {});
 * ```
 */

import crypto from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Context object passed to every widget during initialization.
 * @typedef {Object} WidgetContext
 * @property {import('better-sqlite3').Database} db - SQLite database instance
 * @property {(userId: string, ops: GenUIOp[]) => void} broadcast - Send GenUI ops to a user's connections
 * @property {(userId: string) => Object|undefined} getUser - Look up a user by ID
 * @property {Record<string, unknown>} config - Shared configuration (API keys, etc.)
 */

/**
 * A single GenUI operation returned by widget actions.
 * @typedef {Object} GenUIOp
 * @property {'upsert'|'patch'|'remove'|'clear'|'toast'|'trigger'} op - Operation type
 * @property {string} [id] - Component ID (required for upsert/patch/remove)
 * @property {string} [type] - Component type (required for upsert)
 * @property {Record<string, unknown>} [data] - Component data
 * @property {Record<string, unknown>} [layout] - Layout hints
 */

/**
 * Widget definition. Each widget implements this interface.
 * @typedef {Object} WidgetDef
 * @property {string} prefix - Unique action prefix (e.g., 'sn', 'cal', 'mail')
 * @property {string} name - Human-readable widget name
 * @property {(ctx: WidgetContext) => void|Promise<void>} init - Called once during setup
 * @property {(userId: string, action: string, context: Record<string, unknown>) => GenUIOp[]|Promise<GenUIOp[]>} handleAction - Handle a user action
 * @property {() => void|Promise<void>} [destroy] - Optional cleanup on shutdown
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a short unique ID for GenUI components.
 * @param {string} [prefix='w'] - Optional prefix
 * @returns {string}
 */
export function genId(prefix = 'w') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Create an upsert GenUI operation.
 * @param {string} id - Component ID
 * @param {string} type - Component type (e.g., 'card', 'stats', 'table')
 * @param {Record<string, unknown>} data - Component data
 * @param {Record<string, unknown>} [layout] - Optional layout hints
 * @returns {GenUIOp}
 */
export function upsert(id, type, data, layout) {
  const op = { op: 'upsert', id, type, data };
  if (layout) op.layout = layout;
  return op;
}

/**
 * Create a patch GenUI operation.
 * @param {string} id - Component ID
 * @param {Record<string, unknown>} data - Partial data to merge
 * @returns {GenUIOp}
 */
export function patch(id, data) {
  return { op: 'patch', id, data };
}

/**
 * Create a remove GenUI operation.
 * @param {string} id - Component ID
 * @returns {GenUIOp}
 */
export function remove(id) {
  return { op: 'remove', id };
}

/**
 * Create a toast GenUI operation.
 * @param {string} message - Toast message
 * @param {'info'|'success'|'warning'|'error'} [severity='info'] - Severity level
 * @returns {GenUIOp}
 */
export function toast(message, severity = 'info') {
  return { op: 'toast', data: { message, severity } };
}

/**
 * Create a clear GenUI operation.
 * @returns {GenUIOp}
 */
export function clear() {
  return { op: 'clear' };
}

// ─── WidgetRegistry ─────────────────────────────────────────────────────────

/**
 * Central registry that manages widget lifecycle and action routing.
 *
 * Widgets register with a unique prefix. When an action arrives, the registry
 * finds the widget whose prefix matches the start of the action string and
 * delegates to that widget's `handleAction` method.
 */
export class WidgetRegistry {
  /** @type {Map<string, WidgetDef>} prefix → widget */
  #widgets = new Map();

  /** @type {WidgetDef[]} sorted by prefix length (longest first for greedy match) */
  #sorted = [];

  /** @type {boolean} */
  #initialized = false;

  /** @type {WidgetContext|null} */
  #ctx = null;

  /**
   * Register a widget definition.
   * Throws if a widget with the same prefix is already registered.
   * @param {WidgetDef} widget
   */
  register(widget) {
    if (!widget.prefix || typeof widget.prefix !== 'string') {
      throw new Error(`Widget must have a non-empty string prefix`);
    }
    if (!widget.name || typeof widget.name !== 'string') {
      throw new Error(`Widget must have a non-empty string name`);
    }
    if (typeof widget.init !== 'function') {
      throw new Error(`Widget "${widget.name}" must have an init() method`);
    }
    if (typeof widget.handleAction !== 'function') {
      throw new Error(`Widget "${widget.name}" must have a handleAction() method`);
    }
    if (this.#widgets.has(widget.prefix)) {
      throw new Error(`Widget prefix "${widget.prefix}" is already registered`);
    }

    this.#widgets.set(widget.prefix, widget);
    this.#rebuildSorted();
    console.log(`[widgets] Registered: ${widget.name} (prefix: ${widget.prefix})`);
  }

  /**
   * Unregister a widget by prefix.
   * @param {string} prefix
   * @returns {boolean} true if removed
   */
  unregister(prefix) {
    const widget = this.#widgets.get(prefix);
    if (!widget) return false;

    this.#widgets.delete(prefix);
    this.#rebuildSorted();
    console.log(`[widgets] Unregistered: ${widget.name} (prefix: ${prefix})`);
    return true;
  }

  /**
   * Rebuild the sorted widget list for prefix matching.
   * Longer prefixes are checked first (greedy match).
   */
  #rebuildSorted() {
    this.#sorted = [...this.#widgets.values()]
      .sort((a, b) => b.prefix.length - a.prefix.length);
  }

  /**
   * Initialize all registered widgets.
   * @param {WidgetContext} ctx - Context to pass to each widget
   */
  async initAll(ctx) {
    this.#ctx = ctx;
    for (const widget of this.#widgets.values()) {
      try {
        await widget.init(ctx);
        console.log(`[widgets] Initialized: ${widget.name}`);
      } catch (err) {
        console.error(`[widgets] Failed to initialize ${widget.name}:`, err);
        throw err;
      }
    }
    this.#initialized = true;
    console.log(`[widgets] All ${this.#widgets.size} widgets initialized`);
  }

  /**
   * Destroy all registered widgets (graceful shutdown).
   */
  async destroyAll() {
    for (const widget of this.#widgets.values()) {
      if (typeof widget.destroy === 'function') {
        try {
          await widget.destroy();
          console.log(`[widgets] Destroyed: ${widget.name}`);
        } catch (err) {
          console.error(`[widgets] Error destroying ${widget.name}:`, err);
        }
      }
    }
    this.#initialized = false;
    this.#ctx = null;
  }

  /**
   * Find the widget that handles a given action string.
   * Matches by checking if the action starts with the widget's prefix.
   * @param {string} action - The action string (e.g., "sn-list", "cal-month")
   * @returns {WidgetDef|null}
   */
  findWidget(action) {
    for (const widget of this.#sorted) {
      if (action.startsWith(widget.prefix)) {
        return widget;
      }
    }
    return null;
  }

  /**
   * Route an action to the appropriate widget and return GenUI ops.
   *
   * @param {string} userId - The user performing the action
   * @param {string} action - Action string (e.g., "sn-list")
   * @param {Record<string, unknown>} [context={}] - Additional context from the client
   * @returns {Promise<GenUIOp[]>} Array of GenUI ops to send to the client
   */
  async handleAction(userId, action, context = {}) {
    if (!this.#initialized) {
      console.warn('[widgets] Registry not initialized — ignoring action:', action);
      return [toast('Widget system not ready', 'warning')];
    }

    const widget = this.findWidget(action);
    if (!widget) {
      console.warn(`[widgets] No widget found for action: ${action}`);
      return [toast(`Unknown action: ${action}`, 'error')];
    }

    try {
      const ops = await widget.handleAction(userId, action, context);

      // Validate return value
      if (!Array.isArray(ops)) {
        console.error(`[widgets] ${widget.name}.handleAction() must return an array, got:`, typeof ops);
        return [toast('Widget returned invalid response', 'error')];
      }

      return ops;
    } catch (err) {
      console.error(`[widgets] Error in ${widget.name} handling "${action}":`, err);
      return [toast(`Widget error: ${err.message}`, 'error')];
    }
  }

  /**
   * Get a list of all registered widget names and prefixes.
   * @returns {{ prefix: string, name: string }[]}
   */
  list() {
    return [...this.#widgets.values()].map(w => ({
      prefix: w.prefix,
      name: w.name,
    }));
  }

  /**
   * Check if the registry is initialized and ready.
   * @returns {boolean}
   */
  get ready() {
    return this.#initialized;
  }

  /**
   * Get the number of registered widgets.
   * @returns {number}
   */
  get size() {
    return this.#widgets.size;
  }

  /**
   * Get the shared context (available after initAll).
   * @returns {WidgetContext|null}
   */
  get ctx() {
    return this.#ctx;
  }
}
