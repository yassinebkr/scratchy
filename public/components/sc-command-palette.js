// sc-command-palette.js — Scratchy v2 Command Palette
// Raycast-style ⌘K command palette with fuzzy search, keyboard nav, and focus trapping.

const SURFACE_ICONS = {
  terminal: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 7 9 4 12"/><line x1="9" y1="12" x2="13" y2="12"/></svg>`,
  explorer: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h4l2 2h6v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg>`,
  editor: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8H3v-3z"/><line x1="9" y1="4" x2="12" y2="7"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/></svg>`,
  canvas: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="2" y1="6" x2="14" y2="6"/><line x1="6" y1="6" x2="6" y2="14"/></svg>`,
};

const ACTION_ICONS = {
  'new-chat': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`,
  'clear-chat': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 3 13 13 13 13 6"/><line x1="1" y1="3" x2="15" y2="3"/><line x1="6" y1="3" x2="6" y2="1"/><line x1="10" y1="3" x2="10" y2="1"/><line x1="6" y1="8" x2="6" y2="11"/><line x1="10" y1="8" x2="10" y2="11"/></svg>`,
  'close-all-surfaces': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="12" height="12" rx="2"/><line x1="5" y1="5" x2="11" y2="11"/><line x1="11" y1="5" x2="5" y2="11"/></svg>`,
  'open-settings': `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2"/><path d="M13.5 8a5.5 5.5 0 00-.4-1.3l1.2-1.2-1.4-1.4-1.2 1.2A5.5 5.5 0 008 4.5V3H6.5v1.5a5.5 5.5 0 00-1.3.4L4 3.7 2.6 5.1l1.2 1.2A5.5 5.5 0 003.5 8H2v1.5h1.5c.1.5.2.9.4 1.3l-1.2 1.2 1.4 1.4 1.2-1.2c.4.2.8.3 1.3.4V14H8v-1.5c.5-.1.9-.2 1.3-.4l1.2 1.2 1.4-1.4-1.2-1.2c.2-.4.3-.8.4-1.3H13V8z"/></svg>`,
};

const SEARCH_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7.5" cy="7.5" r="4.5"/><line x1="11" y1="11" x2="16" y2="16"/></svg>`;

/**
 * Returns placeholder search items. The consumer can override this by setting
 * `palette.getSearchItems = () => [...]` on the element instance.
 */
function defaultGetSearchItems() {
  const items = [];

  // Agents (placeholder data)
  items.push(
    { type: 'agent', id: 'atlas', title: 'Atlas', subtitle: 'Code Assistant', action: 'switch-agent', color: '#F9A602', shortcut: '⌘1' },
    { type: 'agent', id: 'nova', title: 'Nova', subtitle: 'Research & Analysis', action: 'switch-agent', color: '#3b82f6', shortcut: '⌘2' },
    { type: 'agent', id: 'pixel', title: 'Pixel', subtitle: 'Design & UI', action: 'switch-agent', color: '#a855f7', shortcut: '⌘3' },
  );

  // Surfaces
  const surfaces = [
    { id: 'terminal', label: 'Terminal', shortcut: '⌘T' },
    { id: 'editor', label: 'Editor', shortcut: '⌘E' },
    { id: 'explorer', label: 'Explorer', shortcut: '⌘B' },
    { id: 'search', label: 'Search', shortcut: '⌘F' },
    { id: 'canvas', label: 'Canvas', shortcut: '⌘G' },
  ];
  for (const s of surfaces) {
    items.push({
      type: 'surface',
      id: s.id,
      title: s.label,
      subtitle: `Toggle ${s.label.toLowerCase()} panel`,
      action: 'toggle-surface',
      icon: SURFACE_ICONS[s.id],
      shortcut: s.shortcut,
    });
  }

  // Actions
  items.push(
    { type: 'action', id: 'new-chat', title: 'New Conversation', subtitle: 'Start a fresh chat', action: 'new-chat', icon: ACTION_ICONS['new-chat'] },
    { type: 'action', id: 'clear-chat', title: 'Clear Chat History', subtitle: 'Remove all messages', action: 'clear-chat', icon: ACTION_ICONS['clear-chat'] },
    { type: 'action', id: 'close-all', title: 'Close All Surfaces', subtitle: 'Return to chat-only view', action: 'close-all-surfaces', icon: ACTION_ICONS['close-all-surfaces'] },
    { type: 'action', id: 'settings', title: 'Open Settings', subtitle: 'Configure preferences', action: 'open-settings', icon: ACTION_ICONS['open-settings'] },
    { type: 'action', id: 'open-webapp', title: 'Open Web App', subtitle: 'Embed a website in the workspace', action: 'open-webapp', icon: '🌐' },
    { type: 'action', id: 'open-notes', title: 'Open Notes', subtitle: 'View and edit your notes', action: 'open-notes', icon: '📝' },
    { type: 'action', id: 'open-calendar', title: 'Open Calendar', subtitle: 'View upcoming events', action: 'open-calendar', icon: '📅' },
    { type: 'action', id: 'open-email', title: 'Open Email', subtitle: 'Check your inbox', action: 'open-email', icon: '📧' },
  );

  return items;
}

/**
 * Simple fuzzy match with character-position scoring.
 * Returns { match: boolean, score: number }.
 */
function fuzzyMatch(query, text) {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring match — highest score
  if (t.includes(q)) return { match: true, score: 100 - t.indexOf(q) };

  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Bonus for word-start matches
      score += (ti === 0 || t[ti - 1] === ' ') ? 10 : 1;
      qi++;
    }
  }
  return { match: qi === q.length, score };
}

const template = document.createElement('template');
template.innerHTML = /* html */ `
<style>
  /* ───────── Host ───────── */
  :host {
    display: contents;
    font-family: var(--sc-font, system-ui, -apple-system, sans-serif);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ───────── Overlay ───────── */
  .cp-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--sc-z-command, 1000);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 20vh;
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
    transition: opacity 0.15s ease, visibility 0s 0.15s;
  }

  .cp-overlay[data-open] {
    opacity: 1;
    pointer-events: auto;
    visibility: visible;
    transition: opacity 0.15s ease, visibility 0s 0s;
  }

  /* ───────── Backdrop ───────── */
  .cp-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  /* ───────── Modal ───────── */
  .cp-modal {
    position: relative;
    width: 100%;
    max-width: 580px;
    margin: 0 16px;
    background: var(--sc-surface, #1a1610);
    border: 1px solid var(--sc-border, rgba(249, 166, 2, 0.10));
    border-radius: var(--sc-radius-xl, 16px);
    box-shadow:
      0 24px 80px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(249, 166, 2, 0.06) inset;
    overflow: hidden;
    transform: translateY(12px) scale(0.98);
    opacity: 0;
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
                opacity 0.15s ease;
  }

  .cp-overlay[data-open] .cp-modal {
    transform: translateY(0) scale(1);
    opacity: 1;
  }

  /* ───────── Input Row ───────── */
  .cp-input-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--sc-border, rgba(249, 166, 2, 0.10));
  }

  .cp-search-icon {
    width: 18px;
    height: 18px;
    color: var(--sc-text-muted, #8a7e6a);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cp-search-icon svg {
    width: 18px;
    height: 18px;
  }

  .cp-input {
    flex: 1;
    background: transparent;
    border: none;
    color: var(--sc-text, #f0ead6);
    font-family: var(--sc-font, system-ui, -apple-system, sans-serif);
    font-size: 16px;
    outline: none;
    min-width: 0;
  }

  .cp-input::placeholder {
    color: var(--sc-text-muted, #8a7e6a);
  }

  .cp-esc {
    font-family: var(--sc-mono, 'Geist Mono', monospace);
    font-size: var(--sc-font-size-xs, 11px);
    color: var(--sc-text-muted, #8a7e6a);
    padding: 2px 6px;
    border-radius: var(--sc-radius-xs, 4px);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--sc-border, rgba(249, 166, 2, 0.10));
    flex-shrink: 0;
    line-height: 1.4;
    user-select: none;
  }

  /* ───────── Results ───────── */
  .cp-results {
    max-height: 400px;
    overflow-y: auto;
    padding: var(--sc-space-2, 8px);
    scrollbar-width: thin;
    scrollbar-color: rgba(249, 166, 2, 0.15) transparent;
  }

  .cp-results::-webkit-scrollbar {
    width: 6px;
  }

  .cp-results::-webkit-scrollbar-track {
    background: transparent;
  }

  .cp-results::-webkit-scrollbar-thumb {
    background: rgba(249, 166, 2, 0.15);
    border-radius: 3px;
  }

  .cp-no-results {
    padding: 32px 16px;
    text-align: center;
    color: var(--sc-text-muted, #8a7e6a);
    font-size: var(--sc-font-size, 14px);
  }

  /* ───────── Groups ───────── */
  .cp-group {
    margin-bottom: var(--sc-space-1, 4px);
  }

  .cp-group-label {
    font-size: var(--sc-font-size-xs, 11px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--sc-text-muted, #8a7e6a);
    padding: 8px 12px 4px;
    user-select: none;
  }

  /* ───────── Items ───────── */
  .cp-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--sc-radius-md, 10px);
    cursor: pointer;
    transition: background var(--sc-transition-fast, 150ms ease);
    outline: none;
    border: 1px solid transparent;
  }

  .cp-item:hover {
    background: rgba(249, 166, 2, 0.06);
  }

  .cp-item[data-focused] {
    background: rgba(249, 166, 2, 0.06);
    border-color: rgba(249, 166, 2, 0.2);
  }

  .cp-item-avatar {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: #0d0b07;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cp-item-icon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--sc-text-muted, #8a7e6a);
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--sc-border-subtle, rgba(249, 166, 2, 0.05));
  }

  .cp-item[data-focused] .cp-item-icon {
    color: var(--sc-accent, #F9A602);
    border-color: rgba(249, 166, 2, 0.15);
  }

  .cp-item-icon svg {
    width: 16px;
    height: 16px;
  }

  .cp-item-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 1px;
  }

  .cp-item-title {
    font-size: var(--sc-font-size, 14px);
    font-weight: 500;
    color: var(--sc-text, #f0ead6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cp-item-subtitle {
    font-size: var(--sc-font-size-sm, 12px);
    color: var(--sc-text-muted, #8a7e6a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cp-item-shortcut {
    font-family: var(--sc-mono, 'Geist Mono', monospace);
    font-size: var(--sc-font-size-xs, 11px);
    color: var(--sc-text-dim, #5a5040);
    padding: 2px 6px;
    border-radius: var(--sc-radius-xs, 4px);
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--sc-border-subtle, rgba(249, 166, 2, 0.05));
    flex-shrink: 0;
    user-select: none;
  }

  /* ───────── Footer ───────── */
  .cp-footer {
    padding: 10px 16px;
    border-top: 1px solid var(--sc-border, rgba(249, 166, 2, 0.10));
  }

  .cp-footer-hint {
    font-size: var(--sc-font-size-xs, 11px);
    color: var(--sc-text-dim, #5a5040);
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .cp-footer-hint span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .cp-footer-hint kbd {
    font-family: var(--sc-mono, 'Geist Mono', monospace);
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--sc-border, rgba(249, 166, 2, 0.10));
    line-height: 1.5;
  }

  /* ───────── Responsive ───────── */
  @media (max-width: 640px) {
    .cp-overlay {
      padding-top: 10vh;
    }

    .cp-modal {
      margin: 0 8px;
      border-radius: var(--sc-radius-lg, 14px);
    }

    .cp-input-row {
      padding: 14px 16px;
    }

    .cp-results {
      max-height: 50vh;
    }
  }
</style>

<div class="cp-overlay" role="dialog" aria-modal="true" aria-label="Command palette">
  <div class="cp-backdrop"></div>
  <div class="cp-modal">
    <div class="cp-input-row">
      <span class="cp-search-icon" aria-hidden="true">${SEARCH_ICON}</span>
      <input
        class="cp-input"
        type="text"
        placeholder="Search agents, surfaces, actions…"
        aria-label="Command search"
        autocomplete="off"
        spellcheck="false"
      />
      <kbd class="cp-esc" aria-hidden="true">ESC</kbd>
    </div>
    <div class="cp-results" role="listbox" aria-label="Search results"></div>
    <div class="cp-footer">
      <div class="cp-footer-hint">
        <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
        <span><kbd>↵</kbd> Select</span>
        <span><kbd>esc</kbd> Close</span>
      </div>
    </div>
  </div>
</div>
`;

class ScCommandPalette extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    // DOM refs
    this._overlay = this.shadowRoot.querySelector('.cp-overlay');
    this._backdrop = this.shadowRoot.querySelector('.cp-backdrop');
    this._modal = this.shadowRoot.querySelector('.cp-modal');
    this._input = this.shadowRoot.querySelector('.cp-input');
    this._results = this.shadowRoot.querySelector('.cp-results');

    // State
    this._isOpen = false;
    this._focusedIndex = -1;
    this._flatItems = []; // Flattened list of visible items for keyboard nav
    this._previousActiveElement = null;

    // Overridable data source
    this.getSearchItems = defaultGetSearchItems;

    // Bound handlers
    this._onGlobalKeydown = this._onGlobalKeydown.bind(this);
    this._onInputKeydown = this._onInputKeydown.bind(this);
    this._onInput = this._onInput.bind(this);
    this._onBackdropClick = this._onBackdropClick.bind(this);
  }

  connectedCallback() {
    document.addEventListener('keydown', this._onGlobalKeydown);
    this._input.addEventListener('keydown', this._onInputKeydown);
    this._input.addEventListener('input', this._onInput);
    this._backdrop.addEventListener('click', this._onBackdropClick);

    // Click delegation on results
    this._results.addEventListener('click', (e) => {
      const item = e.target.closest('.cp-item');
      if (item) this._executeItem(item);
    });

    // Mouse hover updates focus
    this._results.addEventListener('mousemove', (e) => {
      const item = e.target.closest('.cp-item');
      if (item) {
        const idx = this._flatItems.indexOf(item);
        if (idx !== -1 && idx !== this._focusedIndex) {
          this._setFocusIndex(idx);
        }
      }
    });
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onGlobalKeydown);
    this._input.removeEventListener('keydown', this._onInputKeydown);
    this._input.removeEventListener('input', this._onInput);
    this._backdrop.removeEventListener('click', this._onBackdropClick);
  }

  // ───────── Public API ─────────

  /** Toggle the command palette open/closed */
  toggle() {
    this._isOpen ? this.close() : this.open();
  }

  /** Open the command palette */
  open() {
    if (this._isOpen) return;
    this._isOpen = true;

    // Remember what was focused before
    this._previousActiveElement = document.activeElement;

    this._overlay.setAttribute('data-open', '');
    this._input.value = '';
    this._renderResults('');
    this._setFocusIndex(0);

    // Focus input after the animation frame
    requestAnimationFrame(() => {
      this._input.focus();
    });
  }

  /** Close the command palette */
  close() {
    if (!this._isOpen) return;
    this._isOpen = false;

    this._overlay.removeAttribute('data-open');
    this._focusedIndex = -1;

    // Restore focus
    if (this._previousActiveElement && typeof this._previousActiveElement.focus === 'function') {
      this._previousActiveElement.focus();
      this._previousActiveElement = null;
    }
  }

  // ───────── Private Methods ─────────

  _onGlobalKeydown(e) {
    // ⌘K / Ctrl+K to toggle
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
      return;
    }

    // If open, trap focus and handle Escape
    if (this._isOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return;
      }

      // Focus trapping: Tab/Shift+Tab stay within modal
      if (e.key === 'Tab') {
        e.preventDefault();
        // Always return focus to the input
        this._input.focus();
      }
    }
  }

  _onInputKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._moveFocus(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._moveFocus(-1);
        break;
      case 'Enter':
        e.preventDefault();
        if (this._focusedIndex >= 0 && this._focusedIndex < this._flatItems.length) {
          this._executeItem(this._flatItems[this._focusedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.close();
        break;
    }
  }

  _onInput() {
    const query = this._input.value.trim();
    this._renderResults(query);
    this._setFocusIndex(0);
  }

  _onBackdropClick(e) {
    // Only close if clicking the backdrop itself
    if (e.target === this._backdrop) {
      this.close();
    }
  }

  _moveFocus(delta) {
    const len = this._flatItems.length;
    if (len === 0) return;

    let next = this._focusedIndex + delta;
    if (next < 0) next = len - 1;
    if (next >= len) next = 0;
    this._setFocusIndex(next);
  }

  _setFocusIndex(index) {
    // Remove previous focus
    if (this._focusedIndex >= 0 && this._focusedIndex < this._flatItems.length) {
      this._flatItems[this._focusedIndex].removeAttribute('data-focused');
      this._flatItems[this._focusedIndex].removeAttribute('aria-selected');
    }

    this._focusedIndex = index;

    if (index >= 0 && index < this._flatItems.length) {
      const el = this._flatItems[index];
      el.setAttribute('data-focused', '');
      el.setAttribute('aria-selected', 'true');

      // Scroll into view if needed
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  _executeItem(itemEl) {
    const action = itemEl.dataset.action;
    const id = itemEl.dataset.id;

    if (!action) return;

    this.close();

    this.dispatchEvent(new CustomEvent('command-execute', {
      bubbles: true,
      composed: true,
      detail: { action, id },
    }));
  }

  _renderResults(query) {
    const allItems = this.getSearchItems();

    // Filter + score
    let scored;
    if (!query) {
      scored = allItems.map((item) => ({ item, score: 0 }));
    } else {
      scored = [];
      for (const item of allItems) {
        const titleMatch = fuzzyMatch(query, item.title);
        const subMatch = item.subtitle ? fuzzyMatch(query, item.subtitle) : { match: false, score: 0 };
        if (titleMatch.match || subMatch.match) {
          scored.push({
            item,
            score: Math.max(titleMatch.score, subMatch.score * 0.8),
          });
        }
      }
      scored.sort((a, b) => b.score - a.score);
    }

    // Group by type
    const groups = new Map();
    const groupOrder = ['agent', 'surface', 'action'];
    const groupLabels = { agent: 'Agents', surface: 'Surfaces', action: 'Actions' };

    for (const { item } of scored) {
      if (!groups.has(item.type)) groups.set(item.type, []);
      groups.get(item.type).push(item);
    }

    // Render
    this._results.innerHTML = '';
    this._flatItems = [];

    if (scored.length === 0) {
      this._results.innerHTML = `<div class="cp-no-results">No results for "${this._escapeHtml(query)}"</div>`;
      return;
    }

    for (const type of groupOrder) {
      const items = groups.get(type);
      if (!items || items.length === 0) continue;

      const groupEl = document.createElement('div');
      groupEl.className = 'cp-group';
      groupEl.setAttribute('role', 'group');
      groupEl.setAttribute('aria-label', groupLabels[type]);

      const labelEl = document.createElement('div');
      labelEl.className = 'cp-group-label';
      labelEl.textContent = groupLabels[type];
      groupEl.appendChild(labelEl);

      for (const item of items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'cp-item';
        itemEl.setAttribute('role', 'option');
        itemEl.setAttribute('aria-selected', 'false');
        itemEl.dataset.action = item.action;
        itemEl.dataset.id = item.id;
        itemEl.tabIndex = -1;

        let leadEl = '';
        if (item.type === 'agent') {
          const initials = item.title.substring(0, 2);
          leadEl = `<div class="cp-item-avatar" style="background:${item.color || '#F9A602'}">${this._escapeHtml(initials)}</div>`;
        } else {
          const iconHtml = item.icon || ACTION_ICONS[item.action] || SEARCH_ICON;
          leadEl = `<div class="cp-item-icon">${iconHtml}</div>`;
        }

        const subtitleHtml = item.subtitle
          ? `<span class="cp-item-subtitle">${this._escapeHtml(item.subtitle)}</span>`
          : '';

        const shortcutHtml = item.shortcut
          ? `<kbd class="cp-item-shortcut">${this._escapeHtml(item.shortcut)}</kbd>`
          : '';

        itemEl.innerHTML = `
          ${leadEl}
          <div class="cp-item-content">
            <span class="cp-item-title">${this._escapeHtml(item.title)}</span>
            ${subtitleHtml}
          </div>
          ${shortcutHtml}
        `;

        groupEl.appendChild(itemEl);
        this._flatItems.push(itemEl);
      }

      this._results.appendChild(groupEl);
    }
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

customElements.define('sc-command-palette', ScCommandPalette);

export default ScCommandPalette;
