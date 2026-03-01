/**
 * Scratchy v2 — Widget Store / Discovery Web Component
 * <sc-widget-store> — Fullscreen overlay panel for browsing, installing,
 *                     and managing workspace widgets.
 *
 * Events:  widget-store-close   (back/close or ESC)
 *          widget-install       ({ widgetId, widget })
 *          widget-uninstall     ({ widgetId })
 *          widget-open          ({ widgetId, widget })
 */

const STORE_STYLES = /* css */ `
/* ---- reset & host ---------------------------------------- */
:host {
  --bg:            #0d0b07;
  --surface:       rgba(26,22,16,0.85);
  --surface-solid: #1a1610;
  --surface-hover: #252015;
  --border:        rgba(249,166,2,0.10);
  --border-glass:  rgba(249,166,2,0.08);
  --radius:        8px;
  --radius-input:  6px;
  --text:          #f0ead6;
  --muted:         #8a7e6a;
  --accent:        #F9A602;
  --accent-hover:  #DAA520;
  --accent-glow:   rgba(249,166,2,0.30);
  --danger:        #ef4444;
  --success:       #22c55e;
  --focus-ring:    0 0 0 2px rgba(249,166,2,0.3);
  --font:          'Geist', system-ui, -apple-system, sans-serif;

  position: fixed;
  inset: 0;
  z-index: 5000;
  display: none;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: var(--font);
  font-size: 14px;
  color: var(--text);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

:host([open]) {
  display: flex;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- animated gradient mesh background ------------------- */
.bg-mesh {
  position: fixed;
  inset: 0;
  z-index: 0;
  background: var(--bg);
  overflow: hidden;
}

.bg-mesh::before,
.bg-mesh::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.35;
  animation: meshFloat 20s ease-in-out infinite alternate;
}

.bg-mesh::before {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, #F9A602 0%, transparent 70%);
  top: -15%;
  left: -10%;
}

.bg-mesh::after {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, #DAA520 0%, transparent 70%);
  bottom: -20%;
  right: -10%;
  animation-delay: -10s;
  animation-direction: alternate-reverse;
}

@keyframes meshFloat {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(40px, -30px) scale(1.08); }
  66%  { transform: translate(-20px, 20px) scale(0.95); }
  100% { transform: translate(10px, -10px) scale(1.03); }
}

/* ---- scrollable wrapper ---------------------------------- */
.store-scroll {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 960px;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 32px 24px 48px;
  scrollbar-width: thin;
  scrollbar-color: rgba(249,166,2,0.15) transparent;
}

.store-scroll::-webkit-scrollbar { width: 6px; }
.store-scroll::-webkit-scrollbar-track { background: transparent; }
.store-scroll::-webkit-scrollbar-thumb {
  background: rgba(249,166,2,0.15);
  border-radius: 3px;
}

/* ---- header ---------------------------------------------- */
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  color: var(--muted);
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  flex-shrink: 0;
}

.back-btn:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text);
  border-color: rgba(255,255,255,0.14);
}

.back-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  color: var(--text);
}

.back-btn svg { width: 18px; height: 18px; }

.header-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #f0ead6 30%, #F9A602 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex: 1;
  min-width: 0;
}

.esc-hint {
  font-size: 11px;
  color: var(--muted);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  border-radius: 4px;
  padding: 3px 8px;
  user-select: none;
  flex-shrink: 0;
}

/* ---- search bar ------------------------------------------ */
.search-wrap {
  position: relative;
  width: 100%;
  margin-bottom: 20px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--muted);
  pointer-events: none;
  transition: color 0.2s;
}

.search-input {
  width: 100%;
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  padding: 12px 16px 12px 42px;
  height: 48px;
  outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
  caret-color: var(--accent);
}

.search-input::placeholder {
  color: var(--muted);
}

.search-input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
  background: rgba(255,255,255,0.06);
}

.search-input:focus ~ .search-icon {
  color: var(--accent);
}

/* ---- category chips -------------------------------------- */
.chips-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  margin-bottom: 24px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.chips-row::-webkit-scrollbar { display: none; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid var(--border-glass);
  background: rgba(255,255,255,0.04);
  color: var(--muted);
  transition: all 0.2s ease;
  user-select: none;
  flex-shrink: 0;
}

.chip:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text);
  border-color: rgba(255,255,255,0.14);
}

.chip:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.chip.active {
  background: rgba(249,166,2,0.15);
  color: var(--accent);
  border-color: rgba(249,166,2,0.25);
}

.chip .chip-icon { font-size: 14px; }

/* ---- widget grid ----------------------------------------- */
.widget-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 640px) {
  .widget-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 1024px) {
  .widget-grid { grid-template-columns: repeat(3, 1fr); }
}

/* ---- widget card ----------------------------------------- */
.widget-card {
  background: var(--surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  padding: 24px 20px 20px;
  cursor: pointer;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03),
    0 8px 40px rgba(0,0,0,0.45),
    0 2px 12px rgba(0,0,0,0.25);
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  animation: cardIn 0.4s ease both;
  position: relative;
  overflow: hidden;
}

.widget-card:hover {
  transform: translateY(-2px);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.06),
    0 16px 50px rgba(0,0,0,0.5),
    0 4px 20px rgba(0,0,0,0.3);
  border-color: rgba(249,166,2,0.18);
}

.widget-card:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.card-icon {
  font-size: 36px;
  line-height: 1;
  margin-bottom: 4px;
}

.card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.2px;
}

.card-desc {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: 36px;
}

.card-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 4px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
}

.badge-free {
  background: rgba(34,197,94,0.15);
  color: #22c55e;
}

.badge-pro {
  background: rgba(249,166,2,0.15);
  color: #F9A602;
}

.badge-enterprise {
  background: rgba(168,85,247,0.15);
  color: #a855f7;
}

.badge-builtin {
  background: rgba(255,255,255,0.06);
  color: var(--muted);
  border: 1px solid var(--border-glass);
}

.badge-mcp {
  background: rgba(59,130,246,0.15);
  color: #3b82f6;
}

.badge-category {
  background: rgba(255,255,255,0.04);
  color: var(--muted);
  font-weight: 500;
  text-transform: capitalize;
}

.card-action {
  margin-top: 8px;
  width: 100%;
}

/* ---- buttons --------------------------------------------- */
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: var(--radius-input);
  font-family: var(--font);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 16px;
  min-height: 36px;
  width: 100%;
  transition: background 0.2s, transform 0.1s, opacity 0.2s, box-shadow 0.2s;
  letter-spacing: 0.01em;
  outline: none;
}

.btn:focus-visible { box-shadow: var(--focus-ring); }
.btn:active:not(:disabled) { transform: scale(0.985); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-primary {
  background: var(--accent);
  color: #0d0b07;
}

.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }

.btn-ghost {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  color: var(--text);
}

.btn-ghost:hover:not(:disabled) {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.14);
}

.btn-installed {
  background: rgba(34,197,94,0.12);
  border: 1px solid rgba(34,197,94,0.2);
  color: var(--success);
  cursor: default;
}

.btn-locked {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  color: var(--muted);
  cursor: not-allowed;
}

.btn svg { width: 14px; height: 14px; flex-shrink: 0; }

/* ---- skeleton loading ------------------------------------ */
.skeleton-card {
  background: var(--surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  animation: skeletonPulse 1.5s ease-in-out infinite;
}

.skel-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
}

.skel-line {
  height: 12px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
}

.skel-line-wide { width: 60%; }
.skel-line-narrow { width: 80%; }
.skel-line-short { width: 40%; }

.skel-btn {
  width: 100%;
  height: 36px;
  border-radius: var(--radius-input);
  background: rgba(255,255,255,0.04);
  margin-top: 8px;
}

@keyframes skeletonPulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}

/* ---- empty state ----------------------------------------- */
.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  animation: cardIn 0.4s ease both;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.empty-desc {
  font-size: 13px;
  color: var(--muted);
  max-width: 280px;
}

/* ---- detail modal overlay -------------------------------- */
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 6000;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.detail-overlay.open {
  display: flex;
}

.detail-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.detail-panel {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  overflow-y: auto;
  background: var(--surface-solid);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  padding: 32px 28px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03),
    0 24px 80px rgba(0,0,0,0.65),
    0 8px 32px rgba(0,0,0,0.4);
  animation: modalIn 0.3s ease;
  scrollbar-width: thin;
  scrollbar-color: rgba(249,166,2,0.15) transparent;
}

.detail-panel::-webkit-scrollbar { width: 4px; }
.detail-panel::-webkit-scrollbar-track { background: transparent; }
.detail-panel::-webkit-scrollbar-thumb {
  background: rgba(249,166,2,0.15);
  border-radius: 2px;
}

@keyframes modalIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.detail-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-input);
  color: var(--muted);
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.detail-close:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text);
}

.detail-close:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.detail-close svg { width: 14px; height: 14px; }

.detail-icon {
  font-size: 56px;
  text-align: center;
  margin-bottom: 16px;
}

.detail-name {
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 8px;
  letter-spacing: -0.3px;
  color: var(--text);
}

.detail-desc {
  font-size: 14px;
  color: var(--muted);
  text-align: center;
  line-height: 1.6;
  margin-bottom: 20px;
}

.detail-badges {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
  padding: 16px;
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.meta-label { color: var(--muted); }
.meta-value { color: var(--text); font-weight: 500; }

.detail-actions {
  display: flex;
  gap: 10px;
}

.detail-actions .btn {
  flex: 1;
}

/* ---- responsive adjustments ------------------------------ */
@media (max-width: 639px) {
  .store-scroll { padding: 20px 16px 40px; }
  .header { gap: 8px; }
  .header-title { font-size: 18px; }
  .detail-panel { padding: 24px 20px; }
}
`;

/* ---- SVG icons ------------------------------------------- */
const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>';

const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

const ICON_EXTERNAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

const ICON_REMOVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>';

const STORAGE_KEY = 'scratchy-widgets-installed';

class ScWidgetStore extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._widgets = [];
    this._categories = [];
    this._activeCategory = 'all';
    this._searchQuery = '';
    this._selectedWidget = null;
    this._loading = true;
    this._boundKeyDown = this._onKeyDown.bind(this);
  }

  /* ---- lifecycle ---------------------------------------- */
  connectedCallback() {
    this._render();
    this._bindEvents();
    document.addEventListener('keydown', this._boundKeyDown);
    if (this.hasAttribute('open')) {
      this._fetchCatalog();
    }
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._boundKeyDown);
  }

  static get observedAttributes() { return ['open']; }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'open' && newVal !== null && oldVal === null) {
      this._fetchCatalog();
      // Focus the search input when opened
      requestAnimationFrame(() => {
        const search = this.shadowRoot.querySelector('.search-input');
        if (search) search.focus();
      });
    }
  }

  /* ---- installed helpers -------------------------------- */
  _getInstalled() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  }

  _setInstalled(ids) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }

  _isInstalled(id) {
    const w = this._widgets.find(w => w.id === id);
    if (w && w.builtin) return true;
    return this._getInstalled().includes(id);
  }

  /* ---- data fetch --------------------------------------- */
  async _fetchCatalog() {
    this._loading = true;
    this._renderGrid();

    try {
      const res = await fetch('/api/widget-catalog');
      if (!res.ok) throw new Error('Failed to load catalog');
      const data = await res.json();
      this._widgets = data.widgets || [];
      this._categories = data.categories || [];
    } catch (err) {
      console.error('[sc-widget-store] Catalog fetch error:', err);
      this._widgets = [];
      this._categories = [];
    }

    this._loading = false;
    this._renderChips();
    this._renderGrid();
  }

  /* ---- filtering ---------------------------------------- */
  _getFilteredWidgets() {
    let list = this._widgets;

    if (this._activeCategory !== 'all') {
      list = list.filter(w => w.category === this._activeCategory);
    }

    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      list = list.filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.description.toLowerCase().includes(q)
      );
    }

    return list;
  }

  /* ---- render: full -------------------------------------- */
  _render() {
    this.shadowRoot.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = STORE_STYLES;
    this.shadowRoot.appendChild(style);

    // Background mesh
    const mesh = document.createElement('div');
    mesh.className = 'bg-mesh';
    this.shadowRoot.appendChild(mesh);

    // Main scroll container
    const scroll = document.createElement('div');
    scroll.className = 'store-scroll';
    this.shadowRoot.appendChild(scroll);

    // Header
    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML =
      '<button class="back-btn" aria-label="Close widget store">' + ICON_BACK + '</button>' +
      '<h1 class="header-title">Widget Store</h1>' +
      '<span class="esc-hint">ESC</span>';
    scroll.appendChild(header);

    // Search
    const searchWrap = document.createElement('div');
    searchWrap.className = 'search-wrap';
    searchWrap.innerHTML =
      '<input type="text" class="search-input" placeholder="Search widgets..." aria-label="Search widgets">' +
      '<span class="search-icon">' + ICON_SEARCH + '</span>';
    scroll.appendChild(searchWrap);

    // Category chips
    const chipsRow = document.createElement('div');
    chipsRow.className = 'chips-row';
    chipsRow.setAttribute('role', 'tablist');
    chipsRow.setAttribute('aria-label', 'Filter by category');
    scroll.appendChild(chipsRow);

    // Widget grid
    const grid = document.createElement('div');
    grid.className = 'widget-grid';
    grid.setAttribute('role', 'list');
    scroll.appendChild(grid);

    // Detail overlay
    const detailOverlay = document.createElement('div');
    detailOverlay.className = 'detail-overlay';
    detailOverlay.innerHTML =
      '<div class="detail-backdrop"></div>' +
      '<div class="detail-panel" role="dialog" aria-modal="true" aria-label="Widget details">' +
        '<button class="detail-close" aria-label="Close">' + ICON_CLOSE + '</button>' +
        '<div class="detail-content"></div>' +
      '</div>';
    this.shadowRoot.appendChild(detailOverlay);

    // Cache refs
    this.$scroll = scroll;
    this.$backBtn = header.querySelector('.back-btn');
    this.$search = searchWrap.querySelector('.search-input');
    this.$chipsRow = chipsRow;
    this.$grid = grid;
    this.$detailOverlay = detailOverlay;
    this.$detailBackdrop = detailOverlay.querySelector('.detail-backdrop');
    this.$detailClose = detailOverlay.querySelector('.detail-close');
    this.$detailContent = detailOverlay.querySelector('.detail-content');

    this._renderChips();
    this._renderGrid();
  }

  /* ---- render: category chips --------------------------- */
  _renderChips() {
    if (!this.$chipsRow) return;
    this.$chipsRow.innerHTML = '';

    // "All" chip
    const allChip = document.createElement('button');
    allChip.className = 'chip' + (this._activeCategory === 'all' ? ' active' : '');
    allChip.setAttribute('role', 'tab');
    allChip.setAttribute('aria-selected', this._activeCategory === 'all' ? 'true' : 'false');
    allChip.setAttribute('data-cat', 'all');
    allChip.innerHTML = '<span class="chip-icon">\u2728</span> All';
    this.$chipsRow.appendChild(allChip);

    for (const cat of this._categories) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (this._activeCategory === cat.id ? ' active' : '');
      chip.setAttribute('role', 'tab');
      chip.setAttribute('aria-selected', this._activeCategory === cat.id ? 'true' : 'false');
      chip.setAttribute('data-cat', cat.id);
      chip.innerHTML = '<span class="chip-icon">' + (cat.icon || '') + '</span> ' + cat.name;
      this.$chipsRow.appendChild(chip);
    }
  }

  /* ---- render: widget grid ------------------------------ */
  _renderGrid() {
    if (!this.$grid) return;
    this.$grid.innerHTML = '';

    if (this._loading) {
      // Skeleton placeholders
      for (let i = 0; i < 6; i++) {
        const skel = document.createElement('div');
        skel.className = 'skeleton-card';
        skel.style.animationDelay = (i * 0.08) + 's';
        skel.innerHTML =
          '<div class="skel-circle"></div>' +
          '<div class="skel-line skel-line-wide"></div>' +
          '<div class="skel-line skel-line-narrow"></div>' +
          '<div class="skel-line skel-line-short"></div>' +
          '<div class="skel-btn"></div>';
        this.$grid.appendChild(skel);
      }
      return;
    }

    const filtered = this._getFilteredWidgets();

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML =
        '<div class="empty-icon">\uD83D\uDD0D</div>' +
        '<div class="empty-title">No widgets found</div>' +
        '<div class="empty-desc">Try a different search term or category filter.</div>';
      this.$grid.appendChild(empty);
      return;
    }

    filtered.forEach((widget, index) => {
      const card = this._createCard(widget, index);
      this.$grid.appendChild(card);
    });
  }

  /* ---- create widget card ------------------------------- */
  _createCard(widget, index) {
    const installed = this._isInstalled(widget.id);
    const card = document.createElement('div');
    card.className = 'widget-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-widget-id', widget.id);
    card.style.animationDelay = (index * 0.06) + 's';

    // Icon
    let iconHtml = '<div class="card-icon">' + (widget.icon || '\uD83D\uDCE6') + '</div>';

    // Name
    let nameHtml = '<div class="card-name">' + this._escHtml(widget.name) + '</div>';

    // Description
    let descHtml = '<div class="card-desc">' + this._escHtml(widget.description) + '</div>';

    // Badges
    let badgesHtml = '<div class="card-badges">';

    // Tier badge
    if (widget.tier === 'free') {
      badgesHtml += '<span class="badge badge-free">Free</span>';
    } else if (widget.tier === 'pro') {
      badgesHtml += '<span class="badge badge-pro">Pro</span>';
    } else if (widget.tier === 'enterprise') {
      badgesHtml += '<span class="badge badge-enterprise">Enterprise</span>';
    }

    // Category badge
    const catObj = this._categories.find(c => c.id === widget.category);
    const catName = catObj ? catObj.name : widget.category;
    badgesHtml += '<span class="badge badge-category">' + this._escHtml(catName) + '</span>';

    // Built-in badge
    if (widget.builtin) {
      badgesHtml += '<span class="badge badge-builtin">Built-in</span>';
    }

    // MCP badge
    if (widget.mcp) {
      badgesHtml += '<span class="badge badge-mcp">MCP</span>';
    }

    badgesHtml += '</div>';

    // Action button
    let actionHtml = '<div class="card-action">';
    if (installed) {
      actionHtml += '<button class="btn btn-installed" disabled>' + ICON_CHECK + ' Installed</button>';
    } else if (widget.tier === 'pro') {
      // Show lock for pro widgets (assume free plan for now)
      actionHtml += '<button class="btn btn-locked" disabled>' + ICON_LOCK + ' Pro Required</button>';
    } else {
      actionHtml += '<button class="btn btn-primary btn-add" data-widget-id="' + widget.id + '">' + ICON_PLUS + ' Add Widget</button>';
    }
    actionHtml += '</div>';

    card.innerHTML = iconHtml + nameHtml + descHtml + badgesHtml + actionHtml;
    return card;
  }

  /* ---- detail modal ------------------------------------- */
  _openDetail(widget) {
    this._selectedWidget = widget;
    const installed = this._isInstalled(widget.id);

    let html = '';

    // Icon
    html += '<div class="detail-icon">' + (widget.icon || '\uD83D\uDCE6') + '</div>';

    // Name
    html += '<div class="detail-name">' + this._escHtml(widget.name) + '</div>';

    // Description
    html += '<div class="detail-desc">' + this._escHtml(widget.description) + '</div>';

    // Badges
    html += '<div class="detail-badges">';
    if (widget.tier === 'free') {
      html += '<span class="badge badge-free">Free</span>';
    } else if (widget.tier === 'pro') {
      html += '<span class="badge badge-pro">Pro</span>';
    } else if (widget.tier === 'enterprise') {
      html += '<span class="badge badge-enterprise">Enterprise</span>';
    }

    const catObj = this._categories.find(c => c.id === widget.category);
    const catName = catObj ? catObj.name : widget.category;
    html += '<span class="badge badge-category">' + this._escHtml(catName) + '</span>';

    if (widget.builtin) {
      html += '<span class="badge badge-builtin">Built-in</span>';
    }
    if (widget.mcp) {
      html += '<span class="badge badge-mcp">MCP</span>';
    }
    html += '</div>';

    // Meta info
    html += '<div class="detail-meta">';
    html += '<div class="meta-row"><span class="meta-label">Type</span><span class="meta-value">' + (widget.builtin ? 'Native Component' : 'External Widget') + '</span></div>';
    html += '<div class="meta-row"><span class="meta-label">Category</span><span class="meta-value">' + this._escHtml(catName) + '</span></div>';
    if (widget.component) {
      html += '<div class="meta-row"><span class="meta-label">Component</span><span class="meta-value">&lt;' + this._escHtml(widget.component) + '&gt;</span></div>';
    }
    if (widget.url) {
      html += '<div class="meta-row"><span class="meta-label">Source</span><span class="meta-value" style="color:var(--accent);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + this._escHtml(widget.url) + '</span></div>';
    }
    if (widget.mcp) {
      html += '<div class="meta-row"><span class="meta-label">Integration</span><span class="meta-value" style="color:#3b82f6">MCP Enabled</span></div>';
    }
    html += '</div>';

    // Actions
    html += '<div class="detail-actions">';
    if (widget.builtin) {
      html += '<button class="btn btn-primary btn-open-widget" data-widget-id="' + widget.id + '">' + ICON_EXTERNAL + ' Open</button>';
    } else if (installed) {
      html += '<button class="btn btn-ghost btn-remove-widget" data-widget-id="' + widget.id + '">' + ICON_REMOVE + ' Remove</button>';
      html += '<button class="btn btn-primary btn-open-widget" data-widget-id="' + widget.id + '">' + ICON_EXTERNAL + ' Open</button>';
    } else if (widget.tier === 'pro') {
      html += '<button class="btn btn-locked" disabled style="flex:1">' + ICON_LOCK + ' Pro Plan Required</button>';
    } else {
      html += '<button class="btn btn-primary btn-install-widget" data-widget-id="' + widget.id + '">' + ICON_PLUS + ' Add to Workspace</button>';
    }
    html += '</div>';

    this.$detailContent.innerHTML = html;
    this.$detailOverlay.classList.add('open');

    // Focus close button
    requestAnimationFrame(() => {
      this.$detailClose.focus();
    });
  }

  _closeDetail() {
    this.$detailOverlay.classList.remove('open');
    this._selectedWidget = null;

    // Return focus to the card that triggered the modal
    const lastFocused = this.shadowRoot.querySelector('.widget-card:focus, .widget-card[data-widget-id]');
    if (lastFocused) lastFocused.focus();
  }

  /* ---- install / uninstall ------------------------------ */
  _installWidget(widgetId) {
    const widget = this._widgets.find(w => w.id === widgetId);
    if (!widget || widget.builtin) return;

    const installed = this._getInstalled();
    if (!installed.includes(widgetId)) {
      installed.push(widgetId);
      this._setInstalled(installed);
    }

    this.dispatchEvent(new CustomEvent('widget-install', {
      bubbles: true,
      composed: true,
      detail: { widgetId, widget }
    }));

    this._renderGrid();

    // Update detail if open
    if (this._selectedWidget && this._selectedWidget.id === widgetId) {
      this._openDetail(widget);
    }
  }

  _uninstallWidget(widgetId) {
    const widget = this._widgets.find(w => w.id === widgetId);
    if (!widget || widget.builtin) return;

    const installed = this._getInstalled().filter(id => id !== widgetId);
    this._setInstalled(installed);

    this.dispatchEvent(new CustomEvent('widget-uninstall', {
      bubbles: true,
      composed: true,
      detail: { widgetId }
    }));

    this._renderGrid();

    // Update detail if open
    if (this._selectedWidget && this._selectedWidget.id === widgetId) {
      this._openDetail(widget);
    }
  }

  _openWidget(widgetId) {
    const widget = this._widgets.find(w => w.id === widgetId);
    if (!widget) return;

    this.dispatchEvent(new CustomEvent('widget-open', {
      bubbles: true,
      composed: true,
      detail: { widgetId, widget }
    }));
  }

  /* ---- events ------------------------------------------- */
  _bindEvents() {
    // Back / close button
    this.$backBtn.addEventListener('click', () => this._close());

    // Search input
    this.$search.addEventListener('input', (e) => {
      this._searchQuery = e.target.value.trim();
      this._renderGrid();
    });

    // Category chips
    this.$chipsRow.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const cat = chip.getAttribute('data-cat');
      if (cat === this._activeCategory) return;
      this._activeCategory = cat;
      this._renderChips();
      this._renderGrid();
    });

    // Widget grid click delegation
    this.$grid.addEventListener('click', (e) => {
      // Add button click
      const addBtn = e.target.closest('.btn-add');
      if (addBtn) {
        e.stopPropagation();
        const id = addBtn.getAttribute('data-widget-id');
        this._installWidget(id);
        return;
      }

      // Card click -> detail
      const card = e.target.closest('.widget-card');
      if (card) {
        const id = card.getAttribute('data-widget-id');
        const widget = this._widgets.find(w => w.id === id);
        if (widget) this._openDetail(widget);
      }
    });

    // Card keyboard activation
    this.$grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('.widget-card');
        if (card) {
          e.preventDefault();
          const id = card.getAttribute('data-widget-id');
          const widget = this._widgets.find(w => w.id === id);
          if (widget) this._openDetail(widget);
        }
      }
    });

    // Detail overlay events
    this.$detailClose.addEventListener('click', () => this._closeDetail());
    this.$detailBackdrop.addEventListener('click', () => this._closeDetail());

    // Detail action buttons (delegated)
    this.$detailOverlay.addEventListener('click', (e) => {
      const installBtn = e.target.closest('.btn-install-widget');
      if (installBtn) {
        const id = installBtn.getAttribute('data-widget-id');
        this._installWidget(id);
        return;
      }

      const removeBtn = e.target.closest('.btn-remove-widget');
      if (removeBtn) {
        const id = removeBtn.getAttribute('data-widget-id');
        this._uninstallWidget(id);
        return;
      }

      const openBtn = e.target.closest('.btn-open-widget');
      if (openBtn) {
        const id = openBtn.getAttribute('data-widget-id');
        this._openWidget(id);
        this._closeDetail();
        this._close();
        return;
      }
    });

    // Background mesh click to close
    this.shadowRoot.querySelector('.bg-mesh').addEventListener('click', () => this._close());
  }

  /* ---- keyboard ----------------------------------------- */
  _onKeyDown(e) {
    if (!this.hasAttribute('open')) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();

      // Close detail first, then panel
      if (this.$detailOverlay.classList.contains('open')) {
        this._closeDetail();
      } else {
        this._close();
      }
    }
  }

  /* ---- close panel -------------------------------------- */
  _close() {
    this.dispatchEvent(new CustomEvent('widget-store-close', {
      bubbles: true,
      composed: true
    }));
  }

  /* ---- util: escape HTML -------------------------------- */
  _escHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

customElements.define('sc-widget-store', ScWidgetStore);
