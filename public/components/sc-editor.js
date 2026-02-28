/**
 * Scratchy v2 — Code Editor Surface
 * <sc-editor> Web Component
 *
 * Displays file content with syntax-aware rendering and diff highlighting.
 * Features:
 * - Line numbers with gutter
 * - Diff view: added/removed/modified lines
 * - File tabs for multiple open files
 * - Read-only view (agent writes, user reads)
 * - Collapse/expand for large files
 */

function escapeHtml(s) {
  return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}

const LANG_LABELS = {
  js: 'JavaScript', ts: 'TypeScript', json: 'JSON', md: 'Markdown', html: 'HTML',
  css: 'CSS', py: 'Python', rs: 'Rust', go: 'Go', sh: 'Shell', yml: 'YAML',
  yaml: 'YAML', toml: 'TOML', sql: 'SQL', xml: 'XML', c: 'C', cpp: 'C++',
  java: 'Java', rb: 'Ruby', zig: 'Zig',
};

function detectLang(path) {
  const ext = path?.split('.').pop()?.toLowerCase();
  return ext || 'text';
}

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    background: var(--sc-bg, #0e0c09);
    color: var(--sc-text, #e8e0d2);
    font-family: var(--mono, 'Geist Mono', 'SF Mono', 'Fira Code', monospace);
    font-size: 13px;
    overflow: hidden;
    height: 100%;
  }

  /* Surface header — 36px uniform glassmorphism */
  .surface-header {
    display: flex;
    align-items: center;
    height: 36px;
    min-height: 36px;
    padding: 0 12px;
    background: var(--sc-glass-bg, rgba(26,22,16,0.85));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    flex-shrink: 0;
    gap: 8px;
  }
  .surface-header-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-muted, #8a7e6a);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    letter-spacing: 0.3px;
  }
  .surface-header-icon {
    color: var(--sc-accent, #F9A602);
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .surface-close {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--sc-text-dim, #5a5040);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .surface-close:hover {
    background: rgba(239,68,68,0.12);
    color: #ef4444;
  }
  .surface-close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(249,166,2,0.35);
  }

  @media (max-width: 767px) {
    .surface-header {
      padding-left: 48px;
    }
  }

  /* Tab bar */
  .editor-tab-bar {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    scrollbar-width: none;
    background: rgba(14,12,9,0.6);
    border-bottom: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    flex-shrink: 0;
  }

  .editor-tab-bar::-webkit-scrollbar { display: none; }

  .editor-tab {
    padding: 8px 14px;
    font-size: 12px;
    color: var(--sc-text-dim, #5a5040);
    border-right: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }

  .editor-tab:hover { background: rgba(249,166,2,0.04); color: var(--sc-text, #e8e0d2); }
  .editor-tab:focus-visible { outline: none; box-shadow: inset 0 0 0 2px rgba(249,166,2,0.35); }
  .editor-tab.active { background: rgba(249,166,2,0.06); color: var(--sc-text, #e8e0d2); border-bottom: 2px solid var(--sc-accent, #F9A602); }

  .editor-tab-close {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: none;
    background: transparent;
    color: var(--sc-text-muted, #8a7e6a);
    cursor: pointer;
    opacity: 0;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.1s;
  }

  .editor-tab:hover .editor-tab-close { opacity: 0.5; }
  .editor-tab-close:hover { opacity: 1 !important; background: rgba(239,68,68,0.15); color: var(--sc-danger, #ef4444); }

  .editor-tab-lang {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(249,166,2,0.06);
    color: var(--sc-text-dim, #5a5040);
  }

  /* Status bar */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 3px 12px;
    background: var(--sc-glass-bg, rgba(26,22,16,0.85));
    border-top: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 11px;
    color: var(--sc-text-dim, #5a5040);
    flex-shrink: 0;
    min-height: 24px;
  }

  .status-item { display: flex; align-items: center; gap: 4px; }

  /* Editor area */
  .editor-area {
    flex: 1;
    overflow: auto;
    position: relative;
  }

  .lines {
    display: table;
    width: 100%;
    border-collapse: collapse;
  }

  .line {
    display: table-row;
    line-height: 20px;
    min-height: 20px;
  }

  .line:hover { background: rgba(255,255,255,0.02); }

  .line-gutter {
    display: table-cell;
    width: 48px;
    text-align: right;
    padding: 0 12px 0 8px;
    color: rgba(255, 255, 255, 0.15);
    user-select: none;
    font-family: var(--sc-mono, 'Geist Mono', 'SF Mono', 'Fira Code', monospace);
    font-size: 12px;
    vertical-align: top;
    border-right: 1px solid rgba(255,255,255,0.04);
  }

  .line-content {
    display: table-cell;
    padding: 0 16px;
    white-space: pre-wrap;
    word-break: break-all;
    tab-size: 2;
  }

  /* Diff styling */
  .line.diff-add { background: rgba(63, 185, 80, 0.08); }
  .line.diff-add .line-gutter { color: #3fb950; }
  .line.diff-add .line-content::before { content: '+'; color: #3fb950; margin-right: 4px; }

  .line.diff-remove { background: rgba(248, 81, 73, 0.08); }
  .line.diff-remove .line-gutter { color: #f85149; text-decoration: line-through; }
  .line.diff-remove .line-content { color: #8b949e; text-decoration: line-through; }
  .line.diff-remove .line-content::before { content: '-'; color: #f85149; margin-right: 4px; }

  .line.diff-modify { background: rgba(210, 153, 34, 0.08); }
  .line.diff-modify .line-gutter { color: #d29922; }

  /* Change indicator in gutter */
  .change-marker {
    display: inline-block;
    width: 3px;
    height: 14px;
    border-radius: 1px;
    margin-right: 4px;
    vertical-align: middle;
  }

  .change-marker.added { background: #3fb950; }
  .change-marker.removed { background: #f85149; }
  .change-marker.modified { background: #d29922; }

  /* Empty state */
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--sc-text-dim, #5a5040);
    font-size: 13px;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    gap: 8px;
  }

  .empty-state .icon {
    color: var(--sc-text-dim, #5a5040);
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Diff summary badge */
  .diff-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    background: rgba(255,255,255,0.04);
  }

  .diff-badge .added { color: #3fb950; }
  .diff-badge .removed { color: #f85149; }

  /* Scrollbar */
  .editor-area::-webkit-scrollbar { width: 6px; height: 6px; }
  .editor-area::-webkit-scrollbar-track { background: transparent; }
  .editor-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
</style>

<div class="surface-header">
  <span class="surface-header-title">
    <svg class="surface-header-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 2l3 3-8 8H3v-3z"/><line x1="9" y1="4" x2="12" y2="7"/>
    </svg>
    Editor
  </span>
  <span style="flex:1"></span>
  <button class="surface-close" id="surface-close-btn" title="Close editor">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
  </button>
</div>
<div class="editor-tab-bar" id="tab-bar"></div>
<div class="editor-area" id="editor-area">
  <div class="empty-state"><span class="icon"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8H3v-3z"/><line x1="9" y1="4" x2="12" y2="7"/></svg></span><span>No files open</span></div>
</div>
<div class="status-bar" id="status-bar">
  <span class="status-item" id="status-lang"></span>
  <span class="status-item" id="status-lines"></span>
  <span class="status-item" id="status-diff"></span>
</div>
`;

/**
 * @typedef {Object} EditorTab
 * @property {string} path
 * @property {string} content
 * @property {string} lang
 * @property {Array<{line: number, type: 'add'|'remove'|'modify'}>} [diff]
 */

export class ScEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

    this._tabBar = this.shadowRoot.getElementById('tab-bar');
    this._editorArea = this.shadowRoot.getElementById('editor-area');
    this._statusLang = this.shadowRoot.getElementById('status-lang');
    this._statusLines = this.shadowRoot.getElementById('status-lines');
    this._statusDiff = this.shadowRoot.getElementById('status-diff');

    /** @type {Map<string, EditorTab>} path → tab data */
    this._tabs = new Map();
    /** @type {string|null} */
    this._activeTab = null;
  }

  connectedCallback() {
    this.shadowRoot.getElementById('surface-close-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('surface-close', { detail: { type: 'editor' }, bubbles: true, composed: true }));
    });
  }

  /** Open a file (or update if already open) */
  openFile(path, content, langOrDiff, diff) {
    let lang, diffData;
    if (Array.isArray(langOrDiff)) {
      // Backward compat: openFile(path, content, diff)
      diffData = langOrDiff;
      lang = detectLang(path);
    } else {
      lang = langOrDiff || detectLang(path);
      diffData = diff || [];
    }
    this._saveScrollPosition();
    this._tabs.set(path, { path, content, lang, diff: diffData, scrollTop: 0 });
    this._activeTab = path;
    this._render();
  }

  /** Show a diff/edit operation */
  showEdit(path, oldContent, newContent) {
    const diff = this._computeDiff(oldContent, newContent);
    this.openFile(path, newContent, diff);
  }

  /** Close a tab */
  closeTab(path) {
    this._tabs.delete(path);
    if (this._activeTab === path) {
      const keys = [...this._tabs.keys()];
      this._activeTab = keys.length > 0 ? keys[keys.length - 1] : null;
    }
    this._render();
  }

  /** Clear all tabs */
  clear() {
    this._tabs.clear();
    this._activeTab = null;
    this._render();
  }

  // ─── Internal ─────────────────────────────────────────

  _render() {
    this._renderTabs();
    this._renderContent();
    this._renderStatus();
  }

  _renderTabs() {
    this._tabBar.innerHTML = '';
    for (const [path, tab] of this._tabs) {
      const el = document.createElement('div');
      el.className = 'editor-tab' + (path === this._activeTab ? ' active' : '');

      const name = path.split('/').pop() || path;
      const langLabel = LANG_LABELS[tab.lang] || tab.lang;
      const hasDiff = tab.diff && tab.diff.length > 0;

      el.innerHTML = `
        <span>${escapeHtml(name)}</span>
        ${hasDiff ? '<span class="change-marker modified"></span>' : ''}
        <span class="editor-tab-lang">${langLabel}</span>
        <button class="editor-tab-close" title="Close tab">×</button>
      `;

      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('editor-tab-close')) {
          this.closeTab(path);
          return;
        }
        this._saveScrollPosition();
        this._activeTab = path;
        this._render();
        this._restoreScrollPosition();
      });

      this._tabBar.appendChild(el);
    }
  }

  _renderContent() {
    if (!this._activeTab || !this._tabs.has(this._activeTab)) {
      this._editorArea.innerHTML = '<div class="empty-state"><span class="icon"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2l3 3-8 8H3v-3z"/><line x1="9" y1="4" x2="12" y2="7"/></svg></span><span>No files open</span></div>';
      return;
    }

    const tab = this._tabs.get(this._activeTab);
    const lines = tab.content.split('\n');
    const diffMap = new Map();
    if (tab.diff) {
      for (const d of tab.diff) {
        diffMap.set(d.line, d.type);
      }
    }

    const maxDigits = String(lines.length).length;
    const html = ['<div class="lines">'];

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const diffType = diffMap.get(lineNum) || '';
      const diffClass = diffType ? ` diff-${diffType}` : '';

      html.push(`<div class="line${diffClass}">`);
      html.push(`<span class="line-gutter">${String(lineNum).padStart(maxDigits, ' ')}</span>`);
      html.push(`<span class="line-content">${escapeHtml(lines[i])}</span>`);
      html.push('</div>');
    }

    html.push('</div>');
    this._editorArea.innerHTML = html.join('');
  }

  _renderStatus() {
    if (!this._activeTab || !this._tabs.has(this._activeTab)) {
      this._statusLang.textContent = '';
      this._statusLines.textContent = '';
      this._statusDiff.innerHTML = '';
      return;
    }

    const tab = this._tabs.get(this._activeTab);
    const lines = tab.content.split('\n');
    const lang = LANG_LABELS[tab.lang] || tab.lang;

    this._statusLang.textContent = lang;
    this._statusLines.textContent = `${lines.length} lines`;

    if (tab.diff && tab.diff.length > 0) {
      const added = tab.diff.filter(d => d.type === 'add').length;
      const removed = tab.diff.filter(d => d.type === 'remove').length;
      this._statusDiff.innerHTML = `<span class="diff-badge"><span class="added">+${added}</span><span class="removed">-${removed}</span></span>`;
    } else {
      this._statusDiff.innerHTML = '';
    }
  }

  _saveScrollPosition() {
    if (this._activeTab && this._tabs.has(this._activeTab)) {
      const tab = this._tabs.get(this._activeTab);
      tab.scrollTop = this._editorArea.scrollTop;
    }
  }

  _restoreScrollPosition() {
    if (this._activeTab && this._tabs.has(this._activeTab)) {
      const tab = this._tabs.get(this._activeTab);
      if (tab.scrollTop) {
        requestAnimationFrame(() => { this._editorArea.scrollTop = tab.scrollTop; });
      }
    }
  }

  _computeDiff(oldContent, newContent) {
    if (!oldContent) {
      // All lines are new
      const lines = newContent.split('\n');
      return lines.map((_, i) => ({ line: i + 1, type: 'add' }));
    }

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diff = [];

    // Simple line-by-line comparison (not a full Myers diff, good enough for display)
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      if (i >= oldLines.length) {
        diff.push({ line: i + 1, type: 'add' });
      } else if (i >= newLines.length) {
        diff.push({ line: i + 1, type: 'remove' });
      } else if (oldLines[i] !== newLines[i]) {
        diff.push({ line: i + 1, type: 'modify' });
      }
    }

    return diff;
  }
}

customElements.define('sc-editor', ScEditor);
