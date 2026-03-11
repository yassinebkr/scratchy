/**
 * @fileoverview Live Widget Registry — runtime Web Component definitions
 *
 * Handles define/undefine ops from the GenUI protocol.
 * Agents create custom widgets via the create_live_widget MCP tool.
 * Each widget is a Shadow DOM Web Component with compiled templates.
 *
 * @module components/sc-live-registry
 */

// ── Template Compiler ──────────────────────────────────────────────────────

const _escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** @param {string} str */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => _escMap[c]);
}

/** Resolve dot-notation path against a data object. */
function resolve(data, path) {
  if (data == null) return undefined;
  const parts = path.split('.');
  let cur = data;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

// Token types: text | var | raw | open | close
const TAG_RE = /\{\{\{([^}]+)\}\}\}|\{\{([#/]?)([^}]+)\}\}/g;

/** Tokenize a mustache template into a flat token list. */
function tokenize(template) {
  const tokens = [];
  let last = 0;
  let m;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(template)) !== null) {
    if (m.index > last) tokens.push({ t: 'text', v: template.slice(last, m.index) });
    if (m[1] !== undefined) {
      // {{{ raw }}}
      tokens.push({ t: 'raw', v: m[1].trim() });
    } else if (m[2] === '#') {
      // {{#keyword expr}}
      const parts = m[3].trim().split(/\s+/);
      tokens.push({ t: 'open', k: parts[0], v: parts.slice(1).join(' ') });
    } else if (m[2] === '/') {
      tokens.push({ t: 'close', k: m[3].trim() });
    } else {
      tokens.push({ t: 'var', v: m[3].trim() });
    }
    last = m.index + m[0].length;
  }
  if (last < template.length) tokens.push({ t: 'text', v: template.slice(last) });
  return tokens;
}

/**
 * Parse a flat token list into an AST (array of nodes).
 * Nodes: { t:'text', v } | { t:'var', v } | { t:'raw', v }
 *      | { t:'each', v, body:[] } | { t:'if', v, body:[] } | { t:'unless', v, body:[] }
 */
function parse(tokens) {
  const stack = [[]]; // stack of body arrays
  const meta = [];    // stack of block keywords
  for (const tok of tokens) {
    if (tok.t === 'open') {
      const node = { t: tok.k, v: tok.v, body: [] };
      stack[stack.length - 1].push(node);
      stack.push(node.body);
      meta.push(tok.k);
    } else if (tok.t === 'close') {
      if (meta.length === 0) continue; // unmatched close — ignore gracefully
      stack.pop();
      meta.pop();
    } else {
      stack[stack.length - 1].push(tok);
    }
  }
  return stack[0];
}

/** Render an AST node list with the given data context + parent scope. */
function renderAst(nodes, ctx, parent) {
  let out = '';
  for (const n of nodes) {
    switch (n.t) {
      case 'text':
        out += n.v;
        break;
      case 'var': {
        const val = resolve(ctx, n.v) ?? resolve(parent, n.v) ?? '';
        out += escapeHtml(val);
        break;
      }
      case 'raw': {
        const val = resolve(ctx, n.v) ?? resolve(parent, n.v) ?? '';
        out += String(val);
        break;
      }
      case 'each': {
        const arr = resolve(ctx, n.v) ?? resolve(parent, n.v);
        if (Array.isArray(arr)) {
          for (let i = 0; i < arr.length; i++) {
            const item = typeof arr[i] === 'object' && arr[i] !== null
              ? { ...arr[i], '@index': i, '@first': i === 0, '@last': i === arr.length - 1 }
              : { '.': arr[i], '@index': i, '@first': i === 0, '@last': i === arr.length - 1 };
            out += renderAst(n.body, item, ctx);
          }
        }
        break;
      }
      case 'if': {
        const val = resolve(ctx, n.v) ?? resolve(parent, n.v);
        if (val && (!Array.isArray(val) || val.length > 0)) {
          out += renderAst(n.body, ctx, parent);
        }
        break;
      }
      case 'unless': {
        const val = resolve(ctx, n.v) ?? resolve(parent, n.v);
        if (!val || (Array.isArray(val) && val.length === 0)) {
          out += renderAst(n.body, ctx, parent);
        }
        break;
      }
    }
  }
  return out;
}

/**
 * Compile a mustache-like template string into a render function.
 * Supports: {{prop}}, {{{rawProp}}}, {{#each arr}}...{{/each}},
 *           {{#if prop}}...{{/if}}, {{#unless prop}}...{{/unless}}
 *
 * @param {string} template - HTML template with mustache bindings
 * @returns {function(object): string} Render function
 */
function compileTemplate(template) {
  const tokens = tokenize(template);
  const ast = parse(tokens);
  return (data) => renderAst(ast, data || {}, null);
}

// ── Component Factory ──────────────────────────────────────────────────────

const BASE_WIDGET_CSS = `
/* Live Widget Base Theme — Scratchy v2 */
:host{display:block;contain:content}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:host{
  font-family:var(--font,'Geist',-apple-system,BlinkMacSystemFont,system-ui,sans-serif);
  font-size:var(--font-size,14px);color:var(--text,#f0ead6);
  line-height:1.5;-webkit-font-smoothing:antialiased;
}
.lw-mono,code,pre{font-family:var(--mono,'Geist Mono','SF Mono',monospace);font-size:.9em}
.lw-muted{color:var(--text-muted,#8a7e6a)}
.lw-accent{color:var(--accent,#F9A602)}
.lw-sm{font-size:.85em}.lw-lg{font-size:1.15em}
h1,h2,h3,h4{font-weight:600;line-height:1.3}
.lw-flex{display:flex}.lw-flex-col{display:flex;flex-direction:column}
.lw-flex-wrap{flex-wrap:wrap}.lw-items-center{align-items:center}
.lw-justify-between{justify-content:space-between}
.lw-gap-sm{gap:4px}.lw-gap-md{gap:8px}.lw-gap-lg{gap:16px}
.lw-grid{display:grid;gap:8px}
.lw-grid-2{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.lw-grid-3{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
.lw-w-full{width:100%}.lw-text-center{text-align:center}.lw-text-right{text-align:right}
.lw-btn{
  display:inline-flex;align-items:center;gap:6px;
  padding:6px 14px;border-radius:var(--radius,8px);
  font:inherit;font-size:.85em;font-weight:500;cursor:pointer;
  border:1px solid var(--border,rgba(255,255,255,.06));
  background:transparent;color:var(--text,#f0ead6);
  transition:background .15s,border-color .15s;
}
.lw-btn:hover{background:var(--surface-hover,#242016);border-color:rgba(255,255,255,.1)}
.lw-btn:active{opacity:.85}
.lw-btn.primary{background:var(--accent,#F9A602);color:#0d0b07;border-color:transparent;font-weight:600}
.lw-btn.primary:hover{background:var(--accent-hover,#DAA520)}
.lw-input{
  width:100%;padding:7px 10px;border-radius:var(--radius,8px);
  font:inherit;font-size:.9em;
  background:var(--bg,#0d0b07);color:var(--text,#f0ead6);
  border:1px solid var(--border,rgba(255,255,255,.06));
  outline:none;transition:border-color .15s;
}
.lw-input::placeholder{color:var(--text-muted,#8a7e6a)}
.lw-input:focus{border-color:var(--accent,#F9A602)}
.lw-badge{
  display:inline-block;padding:2px 8px;border-radius:99px;
  font-size:.75em;font-weight:600;
  background:rgba(249,166,2,.15);color:var(--accent,#F9A602);
}
.lw-divider{border:none;border-top:1px solid var(--border,rgba(255,255,255,.06));margin:8px 0}
.lw-list{list-style:none}
.lw-list-item{padding:8px 10px;border-radius:var(--radius,8px);transition:background .15s}
.lw-list-item:hover{background:var(--surface-hover,#242016)}
[data-action]{cursor:pointer;transition:opacity .15s}
[data-action]:hover{opacity:.85}
@media(max-width:480px){.lw-grid-2,.lw-grid-3{grid-template-columns:1fr}}
.lw-fade-in{animation:lwFI .25s ease-out both}
@keyframes lwFI{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`;

/**
 * Generate an HTMLElement subclass for a live widget definition.
 * @param {object} definition - { html, css, props, actions, defaults }
 * @param {string} widgetId - Widget type ID
 * @returns {typeof HTMLElement}
 */
function createWidgetClass(definition, widgetId) {
  const renderFn = compileTemplate(definition.html);
  const widgetCss = BASE_WIDGET_CSS + '\n' + (definition.css || '');
  const defaults = structuredClone(definition.defaults || {});
  const actions = new Map(
    (definition.actions || []).map(a => [a.name, a.emits || a.name])
  );

  // ── Compile optional client-side action handler ──
  // The js field is a function body: (action, payload, data, render, el) => { ... }
  // Return true to handle locally (no LLM round-trip).
  // Return false/undefined to propagate to agent via widget-action event.
  let compiledHandler = null;
  if (definition.js && typeof definition.js === 'string') {
    try {
      // Parameters: action name, payload object, mutable data, render callback, shadow root
      compiledHandler = new Function('action', 'payload', 'data', 'render', 'root', definition.js);
    } catch (err) {
      console.warn(`[LiveWidget:${widgetId}] Failed to compile onAction handler:`, err);
    }
  }

  return class LiveWidget extends HTMLElement {
    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'closed' });
      this._data = structuredClone(defaults);
      this._widgetId = widgetId;
      this._instanceId = '';
      this._onAction = compiledHandler;

      this._styleEl = document.createElement('style');
      this._styleEl.textContent = widgetCss;
      this._shadow.appendChild(this._styleEl);

      this._content = document.createElement('div');
      this._content.className = 'live-widget';
      this._shadow.appendChild(this._content);
    }

    set data(val) {
      this._data = structuredClone({ ...defaults, ...val });
      this._render();
    }
    get data() { return this._data; }

    set instanceId(val) { this._instanceId = val; }

    connectedCallback() { this._render(); }

    /** Merge partial data and re-render. */
    update(partial) {
      Object.assign(this._data, partial);
      this._render();
    }

    _render() {
      try {
        this._content.innerHTML = renderFn(this._data);
        this._bindActions();
      } catch (err) {
        this._content.innerHTML =
          `<div style="color:#ef4444;font-size:12px">Widget render error: ${escapeHtml(err.message)}</div>`;
      }
    }

    /**
     * Route an action through the local handler first. If the handler
     * returns true, the action is handled locally (no LLM round-trip).
     * Otherwise, propagate to the agent via widget-action custom event.
     */
    _handleAction(actionName, payload) {
      const emitName = actions.get(actionName) || actionName;

      // Try local handler first — widget acts as standalone app
      if (this._onAction) {
        try {
          const handled = this._onAction(
            emitName,
            payload,
            this._data,
            () => this._render(),
            this._shadow,
          );
          if (handled === true) return; // Handled locally, done
        } catch (err) {
          console.warn(`[LiveWidget:${this._widgetId}] onAction error for "${emitName}":`, err);
        }
      }

      // Fall through: propagate to agent via WS
      this.dispatchEvent(new CustomEvent('widget-action', {
        bubbles: true,
        composed: true,
        detail: {
          action: emitName,
          payload,
          widgetId: this._widgetId,
          instanceId: this._instanceId,
        },
      }));
    }

    _bindActions() {
      for (const el of this._content.querySelectorAll('[data-action]')) {
        if (el._lw_bound) continue;
        el._lw_bound = true;

        const actionName = el.dataset.action;

        // ── Native drag-and-drop support ──
        if (actionName === 'dragstart') {
          el.setAttribute('draggable', 'true');
          el.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            el.classList.add('dragging');
            const id = el.dataset.cardId || el.dataset.itemId || el.dataset.id || '';
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
            this._handleAction(actionName, { ...el.dataset, action: undefined, dragId: id });
          });
          el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
          });
          continue;
        }

        if (actionName === 'drop') {
          el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('drag-over');
          });
          el.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            el.classList.remove('drag-over');
          });
          el.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('drag-over');
            const dragId = e.dataTransfer.getData('text/plain');
            this._handleAction(actionName, { ...el.dataset, action: undefined, dragId });
          });
          continue;
        }

        // ── Standard click ──
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const payload = { ...el.dataset };
          delete payload.action;
          this._handleAction(actionName, payload);
        });
      }
    }
  };
}

// ── Validation ─────────────────────────────────────────────────────────────

const ID_RE = /^[a-z][a-z0-9-]{1,48}[a-z0-9]$/;
const SCRIPT_RE = /<script[\s>]/i;
const EVENT_ATTR_RE = /\bon[a-z]+\s*=/i;
const MAX_SIZE = 50 * 1024;

/** @returns {string|null} Error message or null if valid. */
function validate(id, component) {
  if (!ID_RE.test(id)) return `Invalid widget ID: ${id}`;
  const html = component.html || '';
  if (SCRIPT_RE.test(html)) return 'Template must not contain <script> tags';
  if (EVENT_ATTR_RE.test(html)) return 'Template must not contain on* event attributes';
  const size = (html.length + (component.css || '').length) * 2;
  if (size > MAX_SIZE) return `Widget too large (${size} bytes, max ${MAX_SIZE})`;
  return null;
}

// ── Registry ───────────────────────────────────────────────────────────────

const _registry = new Map();
const MAX_WIDGETS = 30;

export const LiveWidgetRegistry = {
  /**
   * Define (register) a new live widget type.
   * @param {string} id - Widget type ID
   * @param {object} component - { html, css, props, actions, defaults }
   * @returns {boolean} true if registered successfully
   */
  define(id, component) {
    const err = validate(id, component);
    if (err) { console.warn(`[LiveWidgetRegistry] ${err}`); return false; }

    // Enforce limit (allow re-define of existing)
    if (!_registry.has(id) && _registry.size >= MAX_WIDGETS) {
      console.warn(`[LiveWidgetRegistry] Max widgets (${MAX_WIDGETS}) reached`);
      return false;
    }

    const tag = `sc-live-${id}`;

    try {
      const Cls = createWidgetClass(component, id);

      // customElements can only define a tag once — skip if already defined
      if (!customElements.get(tag)) {
        customElements.define(tag, Cls);
      }

      _registry.set(id, { tag, cls: Cls, component, removed: false });
      return true;
    } catch (e) {
      console.error(`[LiveWidgetRegistry] Failed to define "${id}":`, e);
      return false;
    }
  },

  /**
   * Undefine (remove) a live widget type.
   * Existing DOM instances remain but stop updating.
   * @param {string} id - Widget type ID
   */
  undefine(id) {
    const entry = _registry.get(id);
    if (entry) entry.removed = true;
    _registry.delete(id);
  },

  /**
   * Check if a widget type is registered and active.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    const entry = _registry.get(id);
    return !!entry && !entry.removed;
  },

  /**
   * Get the custom element tag name for a widget type.
   * @param {string} id
   * @returns {string} e.g. 'sc-live-kanban-board'
   */
  tagName(id) {
    return `sc-live-${id}`;
  },

  /**
   * Create an instance of a live widget with given data.
   * @param {string} id - Widget type ID
   * @param {object} data - Props data
   * @param {string} instanceId - Unique instance ID
   * @returns {HTMLElement|null}
   */
  createInstance(id, data, instanceId) {
    const entry = _registry.get(id);
    if (!entry || entry.removed) return null;
    const el = document.createElement(entry.tag);
    el.instanceId = instanceId || '';
    el.data = data || {};
    return el;
  },

  /**
   * Get a registered widget entry (for metadata like createdBy).
   * @param {string} id
   * @returns {{ tag: string, component: object }|null}
   */
  get(id) {
    const entry = _registry.get(id);
    return entry && !entry.removed ? entry : null;
  },

  /** Get count of registered types. */
  get size() { return _registry.size; },

  /** Clear all registrations. */
  clear() {
    for (const entry of _registry.values()) entry.removed = true;
    _registry.clear();
  },
};

export default LiveWidgetRegistry;
