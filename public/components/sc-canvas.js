/**
 * Scratchy v2 — Canvas Grid Component
 * Manages a collection of <sc-tile> elements in a responsive grid.
 * Receives GenUI ops (upsert/patch/remove/clear) and updates tiles accordingly.
 *
 * @element sc-canvas
 */

class ScCanvas extends HTMLElement {
  constructor() {
    super();
    /** @type {Map<string, {type: string, data: object, layout: object}>} */
    this._state = new Map();
    /** @type {Map<string, HTMLElement>} */
    this._tiles = new Map();

    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          padding: 12px;
          box-sizing: border-box;
        }
        .canvas-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
          align-content: start;
        }
        .canvas-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted, #71717a);
          font-size: 14px;
          font-style: italic;
        }
        .tile-wrapper {
          border: 1px solid var(--border, rgba(255,255,255,0.06));
          border-radius: var(--radius, 8px);
          overflow: hidden;
          transition: border-color 0.15s, box-shadow 0.15s;
          animation: tileIn 0.2s ease-out;
        }
        .tile-wrapper:hover {
          border-color: rgba(255,255,255,0.12);
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        @keyframes tileIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        /* Layout zone overrides */
        .tile-wrapper[data-zone="full"] {
          grid-column: 1 / -1;
        }
        .tile-wrapper[data-zone="half"] {
          grid-column: span 1;
        }
        .tile-wrapper.a2ui-widget {
          border-color: rgba(249, 166, 2, 0.15);
        }
      </style>
      <div class="canvas-grid" id="grid"></div>
    `;
    this._grid = this.shadowRoot.getElementById('grid');
  }

  connectedCallback() {
    // Listen for tile actions and re-dispatch
    this.shadowRoot.addEventListener('tile-action', (e) => {
      this.dispatchEvent(new CustomEvent('canvas-action', {
        detail: e.detail,
        bubbles: true,
        composed: true,
      }));
    });
  }

  /**
   * Apply an array of GenUI ops to the canvas.
   * @param {object[]} ops
   */
  applyOps(ops) {
    if (!Array.isArray(ops)) return;

    for (const op of ops) {
      if (!op || typeof op !== 'object') continue;

      switch (op.op) {
        case 'upsert':
          this._upsert(op);
          break;
        case 'patch':
          this._patch(op);
          break;
        case 'remove':
          this._remove(op.id);
          break;
        case 'clear':
          this.clear();
          break;
        case 'move':
          this._move(op);
          break;
        default:
          // toast, overlay, trigger, dismiss — not rendered in canvas grid
          break;
      }
    }
  }

  /** Create or replace a tile */
  _upsert(op) {
    if (!op.id) return;

    const state = {
      type: op.type || 'card',
      data: { ...(op.data || {}) },
      layout: { ...(op.layout || { zone: 'auto' }) },
    };
    this._state.set(op.id, state);

    // Remove existing tile if present
    const existing = this._tiles.get(op.id);
    if (existing) existing.remove();

    // Create new tile
    const wrapper = document.createElement('div');
    wrapper.className = 'tile-wrapper';
    wrapper.dataset.id = op.id;
    if (state.layout.zone && state.layout.zone !== 'auto') {
      wrapper.dataset.zone = state.layout.zone;
    }

    const tile = document.createElement('sc-tile');
    tile.setAttribute('type', state.type);
    tile.setAttribute('data', JSON.stringify(state.data));
    wrapper.appendChild(tile);

    this._tiles.set(op.id, wrapper);
    this._grid.appendChild(wrapper);
  }

  /** Patch (shallow merge) a tile's data */
  _patch(op) {
    if (!op.id) return;
    const state = this._state.get(op.id);
    if (!state) return;

    // Merge data
    state.data = { ...state.data, ...(op.data || {}) };
    if (op.layout) state.layout = { ...state.layout, ...op.layout };

    // Update the tile element
    const wrapper = this._tiles.get(op.id);
    if (wrapper) {
      const tile = wrapper.querySelector('sc-tile');
      if (tile) {
        tile.setAttribute('data', JSON.stringify(state.data));
        if (typeof tile.update === 'function') {
          tile.update(state.data);
        }
      }
      // Update zone if layout changed
      if (op.layout?.zone) {
        wrapper.dataset.zone = op.layout.zone === 'auto' ? '' : op.layout.zone;
      }
    }
  }

  /** Remove a tile by id */
  _remove(id) {
    if (!id) return;
    this._state.delete(id);
    const wrapper = this._tiles.get(id);
    if (wrapper) {
      wrapper.remove();
      this._tiles.delete(id);
    }
  }

  /** Move a tile (update layout) */
  _move(op) {
    if (!op.id) return;
    const state = this._state.get(op.id);
    if (!state) return;
    if (op.layout) {
      state.layout = { ...state.layout, ...op.layout };
      const wrapper = this._tiles.get(op.id);
      if (wrapper && op.layout.zone) {
        wrapper.dataset.zone = op.layout.zone === 'auto' ? '' : op.layout.zone;
      }
    }
  }

  /** Remove all tiles */
  clear() {
    this._state.clear();
    this._tiles.clear();
    this._grid.innerHTML = '';
  }

  /**
   * Load and render an A2UI community widget in the canvas grid.
   * @param {Object} component — { type, id, data }
   * @param {Object} [metadata] — A2UI envelope metadata
   */
  async loadA2UIWidget(component, metadata = {}) {
    try {
      const { loadWidget, updateWidget } = await import('../lib/a2ui-widget-loader.js');

      const existingWrapper = this._tiles.get(component.id);
      if (existingWrapper) {
        // Update existing widget
        const widgetEl = existingWrapper.querySelector('[data-a2ui-type]');
        if (widgetEl) {
          updateWidget(widgetEl, component.data);
          return;
        }
      }

      // Load new widget
      const widgetEl = await loadWidget(component, metadata);

      // Wrap in tile container (same style as GenUI tiles)
      const wrapper = document.createElement('div');
      wrapper.className = 'tile-wrapper a2ui-widget';
      wrapper.dataset.id = component.id;
      wrapper.dataset.a2uiType = component.type;
      wrapper.appendChild(widgetEl);

      // Store and add to grid
      this._tiles.set(component.id, wrapper);
      this._state.set(component.id, {
        type: `a2ui:${component.type}`,
        data: component.data,
        layout: { zone: 'auto' },
        isA2UI: true,
      });
      this._grid.appendChild(wrapper);

    } catch (err) {
      console.error(`[sc-canvas] A2UI widget load failed for "${component.type}":`, err);
    }
  }

  /** Get current state as a plain object */
  getState() {
    const obj = {};
    for (const [id, state] of this._state) {
      obj[id] = { ...state };
    }
    return obj;
  }

  /** Get tile count */
  get tileCount() {
    return this._state.size;
  }
}

customElements.define('sc-canvas', ScCanvas);
export default ScCanvas;
