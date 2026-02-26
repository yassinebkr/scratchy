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
    background: #0d1117;
    color: #c9d1d9;
    font-family: var(--mono, 'Geist Mono', 'SF Mono', 'Fira Code', monospace);
    font-size: 13px;
    overflow: hidden;
    height: 100%;
  }

  /* Tab bar */
  .tab-bar {
    display: flex;
    align-items: stretch;
    background: #161b22;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .tab-bar::-webkit-scrollbar { display: none; }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 12px;
    color: #8b949e;
    border-right: 1px solid rgba(255,255,255,0.04);
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.1s, background 0.1s;
    user-select: none;
  }

  .tab:hover { background: rgba(255,255,255,0.03); color: #c9d1d9; }
  .tab.active { background: #0d1117; color: #c9d1d9; border-bottom: 2px solid var(--accent, #6366f1); }

  .tab-close {
    font-size: 14px;
    line-height: 1;
    opacity: 0;
    transition: opacity 0.1s;
    padding: 0 2px;
    border-radius: 2px;
  }

  .tab:hover .tab-close { opacity: 0.6; }
  .tab-close:hover { opacity: 1; background: rgba(255,255,255,0.1); }

  .tab-lang {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255,255,255,0.06);
    color: #636e7b;
  }

  /* Status bar */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 3px 12px;
    background: #161b22;
    border-top: 1px solid rgba(255,255,255,0.06);
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 11px;
    color: #636e7b;
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
    width: 50px;
    text-align: right;
    padding: 0 12px 0 8px;
    color: #484f58;
    user-select: none;
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
    color: #484f58;
    font-size: 13px;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    gap: 8px;
  }

  .empty-state .icon { font-size: 20px; }

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

<div class="tab-bar" id="tab-bar"></div>
<div class="editor-area" id="editor-area">
  <div class="empty-state"><span class="icon">✏️</span><span>No files open</span></div>
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

  /** Open a file (or update if already open) */
  openFile(path, content, diff) {
    const lang = detectLang(path);
    this._tabs.set(path, { path, content, lang, diff: diff || [] });
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
      el.className = 'tab' + (path === this._activeTab ? ' active' : '');

      const name = path.split('/').pop() || path;
      const langLabel = LANG_LABELS[tab.lang] || tab.lang;
      const hasDiff = tab.diff && tab.diff.length > 0;

      el.innerHTML = `
        <span>${escapeHtml(name)}</span>
        ${hasDiff ? '<span class="change-marker modified"></span>' : ''}
        <span class="tab-lang">${langLabel}</span>
        <span class="tab-close">×</span>
      `;

      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) {
          this.closeTab(path);
          return;
        }
        this._activeTab = path;
        this._render();
      });

      this._tabBar.appendChild(el);
    }
  }

  _renderContent() {
    if (!this._activeTab || !this._tabs.has(this._activeTab)) {
      this._editorArea.innerHTML = '<div class="empty-state"><span class="icon">✏️</span><span>No files open</span></div>';
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
