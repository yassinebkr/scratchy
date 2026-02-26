/**
 * Scratchy v2 — Surface Toolbar
 * <sc-surface-toolbar> Web Component
 *
 * Floating toolbar that shows active surfaces and allows manual toggling.
 * Appears in the top-right of the app area.
 */

const SURFACE_META = {
  terminal: { icon: '⚡', label: 'Terminal', shortcut: '⌘T' },
  explorer: { icon: '📂', label: 'Files', shortcut: '⌘E' },
  editor:   { icon: '✏️', label: 'Editor', shortcut: '⌘D' },
  search:   { icon: '🔍', label: 'Search', shortcut: '⌘S' },
  canvas:   { icon: '🎨', label: 'Canvas', shortcut: '⌘G' },
};

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    display: block;
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 20;
    pointer-events: none;
  }

  .toolbar {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: rgba(17,17,24,0.9);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    pointer-events: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .surface-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: #71717a;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
  }

  .surface-btn:hover {
    background: rgba(255,255,255,0.06);
    color: #c9d1d9;
  }

  .surface-btn.active {
    background: rgba(99,102,241,0.15);
    color: #a5b4fc;
  }

  .surface-btn .icon { font-size: 13px; }

  .surface-btn .shortcut {
    font-size: 9px;
    color: #484f58;
    padding: 1px 3px;
    border-radius: 2px;
    background: rgba(255,255,255,0.04);
  }

  .surface-btn.active .shortcut { color: #6366f1; }

  /* Collapse to icons only on small screens */
  @media (max-width: 768px) {
    .surface-btn .label,
    .surface-btn .shortcut { display: none; }
    .surface-btn { padding: 5px 7px; }
  }
</style>

<div class="toolbar" id="toolbar"></div>
`;

export class ScSurfaceToolbar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
    this._toolbar = this.shadowRoot.getElementById('toolbar');
    this._activeSurfaces = new Set();
  }

  connectedCallback() {
    this._render();
  }

  /** Update which surfaces are active */
  setActive(surfaces) {
    this._activeSurfaces = new Set(surfaces);
    this._render();
  }

  _render() {
    this._toolbar.innerHTML = '';

    for (const [type, meta] of Object.entries(SURFACE_META)) {
      const btn = document.createElement('button');
      btn.className = 'surface-btn' + (this._activeSurfaces.has(type) ? ' active' : '');
      btn.innerHTML = `<span class="icon">${meta.icon}</span><span class="label">${meta.label}</span>`;
      btn.title = `${meta.label} (${meta.shortcut})`;

      btn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('surface-toggle', {
          detail: { type },
          bubbles: true,
          composed: true,
        }));
      });

      this._toolbar.appendChild(btn);
    }
  }
}

customElements.define('sc-surface-toolbar', ScSurfaceToolbar);
