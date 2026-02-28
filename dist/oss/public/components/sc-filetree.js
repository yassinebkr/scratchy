/**
 * Scratchy v2 — File Explorer Surface
 * <sc-filetree> Web Component
 *
 * Displays a file tree from agent read/list operations with a file viewer panel.
 * Features:
 * - Collapsible directory tree
 * - File content preview (syntax-highlighted for known types)
 * - Breadcrumb navigation
 * - File type icons
 * - Search/filter within tree
 */

const FILE_ICONS = {
  js: '📜', ts: '📘', json: '📋', md: '📝', html: '🌐', css: '🎨',
  py: '🐍', rs: '🦀', go: '🔵', sh: '⚙️', yml: '📐', yaml: '📐',
  toml: '📐', txt: '📄', log: '📃', env: '🔒', lock: '🔒',
  png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
  mp3: '🎵', wav: '🎵', mp4: '🎬', zip: '📦', tar: '📦',
  default: '📄', folder: '📁', folderOpen: '📂',
};

function getIcon(name, isDir, isOpen) {
  if (isDir) return isOpen ? FILE_ICONS.folderOpen : FILE_ICONS.folder;
  const ext = name.split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function escapeHtml(s) {
  return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    display: flex;
    flex-direction: row;
    background: var(--surface, #111118);
    color: var(--text, #e4e4e7);
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 13px;
    overflow: hidden;
    height: 100%;
  }

  /* Tree panel */
  .tree-panel {
    width: 260px;
    min-width: 200px;
    max-width: 400px;
    border-right: 1px solid rgba(255,255,255,0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  .tree-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: rgba(255,255,255,0.02);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }

  .tree-title {
    font-size: 11px;
    font-weight: 600;
    color: #71717a;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    flex: 1;
  }

  .filter-input {
    width: 100%;
    padding: 4px 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    color: var(--text, #e4e4e7);
    font-family: inherit;
    font-size: 12px;
    outline: none;
  }

  .filter-input:focus { border-color: var(--accent, #6366f1); }
  .filter-input::placeholder { color: #484f58; }

  .tree-items {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px 3px calc(var(--depth, 0) * 16px + 8px);
    cursor: pointer;
    user-select: none;
    border-radius: 4px;
    margin: 0 4px;
    transition: background 0.1s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tree-item:hover { background: rgba(255,255,255,0.04); }
  .tree-item.selected { background: rgba(99,102,241,0.15); color: #a5b4fc; }

  .tree-icon { flex-shrink: 0; font-size: 14px; width: 18px; text-align: center; }
  .tree-chevron { flex-shrink: 0; width: 14px; font-size: 10px; color: #484f58; transition: transform 0.15s; }
  .tree-chevron.open { transform: rotate(90deg); }
  .tree-chevron.leaf { visibility: hidden; }
  .tree-name { overflow: hidden; text-overflow: ellipsis; }

  /* Viewer panel */
  .viewer-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .viewer-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: rgba(255,255,255,0.02);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    min-height: 32px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #71717a;
    flex: 1;
    overflow: hidden;
  }

  .breadcrumb span { white-space: nowrap; }
  .breadcrumb .sep { color: #484f58; }
  .breadcrumb .current { color: var(--text, #e4e4e7); font-weight: 500; }

  .viewer-content {
    flex: 1;
    overflow: auto;
    padding: 12px 16px;
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 13px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-all;
    tab-size: 2;
  }

  .viewer-content .line-num {
    display: inline-block;
    width: 40px;
    text-align: right;
    padding-right: 12px;
    color: #484f58;
    user-select: none;
    font-size: 12px;
  }

  .viewer-content .line {
    min-height: 20px;
  }

  .viewer-content .line:hover {
    background: rgba(255,255,255,0.02);
  }

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

  /* Scrollbar */
  .tree-items::-webkit-scrollbar,
  .viewer-content::-webkit-scrollbar { width: 6px; }
  .tree-items::-webkit-scrollbar-track,
  .viewer-content::-webkit-scrollbar-track { background: transparent; }
  .tree-items::-webkit-scrollbar-thumb,
  .viewer-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  /* Resize handle */
  .resize-handle {
    width: 3px;
    cursor: col-resize;
    background: transparent;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .resize-handle:hover,
  .resize-handle.dragging { background: var(--accent, #6366f1); }

  @media (max-width: 640px) {
    :host { flex-direction: column; }
    .tree-panel { width: 100%; max-width: none; height: 180px; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .resize-handle { display: none; }
  }
</style>

<div class="tree-panel" id="tree-panel">
  <div class="tree-toolbar">
    <span class="tree-title">Explorer</span>
  </div>
  <input class="filter-input" id="filter" placeholder="Filter files…" type="text">
  <div class="tree-items" id="tree-items"></div>
</div>
<div class="resize-handle" id="resize-handle"></div>
<div class="viewer-panel" id="viewer-panel">
  <div class="viewer-toolbar">
    <div class="breadcrumb" id="breadcrumb"></div>
  </div>
  <div class="viewer-content" id="viewer-content">
    <div class="empty-state"><span class="icon">📂</span><span>Select a file to view</span></div>
  </div>
</div>
`;

/**
 * @typedef {Object} FileNode
 * @property {string} name
 * @property {string} path
 * @property {boolean} isDir
 * @property {FileNode[]} [children]
 * @property {boolean} [expanded]
 */

export class ScFiletree extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

    this._treeItems = this.shadowRoot.getElementById('tree-items');
    this._viewerContent = this.shadowRoot.getElementById('viewer-content');
    this._breadcrumb = this.shadowRoot.getElementById('breadcrumb');
    this._filter = this.shadowRoot.getElementById('filter');
    this._treePanel = this.shadowRoot.getElementById('tree-panel');
    this._resizeHandle = this.shadowRoot.getElementById('resize-handle');

    /** @type {FileNode[]} */
    this._roots = [];
    /** @type {string|null} selected file path */
    this._selected = null;
    /** @type {Map<string, string>} path → content cache */
    this._contentCache = new Map();
    this._filterText = '';
  }

  connectedCallback() {
    this._filter.addEventListener('input', (e) => {
      this._filterText = e.target.value.toLowerCase();
      this._renderTree();
    });

    // Resize handle
    this._initResize();
  }

  /** Set the file tree data */
  setTree(roots) {
    this._roots = roots || [];
    this._renderTree();
  }

  /** Add or update a directory listing */
  addDirectory(path, entries) {
    // entries: [{name, isDir}]
    const node = this._findOrCreate(path);
    if (!node) return;
    node.isDir = true;
    node.children = entries.map(e => ({
      name: e.name,
      path: (path === '/' ? '/' : path + '/') + e.name,
      isDir: e.isDir,
      children: e.isDir ? [] : undefined,
      expanded: false,
    }));
    node.expanded = true;
    this._renderTree();
  }

  /** Show file content */
  showFile(path, content) {
    this._contentCache.set(path, content);
    this._selected = path;
    this._renderViewer(path, content);
    this._renderTree(); // update selection highlight
  }

  /** Clear everything */
  clear() {
    this._roots = [];
    this._selected = null;
    this._contentCache.clear();
    this._treeItems.innerHTML = '';
    this._viewerContent.innerHTML = '<div class="empty-state"><span class="icon">📂</span><span>Select a file to view</span></div>';
    this._breadcrumb.innerHTML = '';
  }

  // ─── Internal ─────────────────────────────────────────

  _findOrCreate(path) {
    if (path === '/' || path === '.') {
      // Root level — just return a virtual root
      return { isDir: true, children: this._roots, expanded: true, name: '/', path: '/' };
    }
    const parts = path.replace(/^\//, '').split('/');
    let nodes = this._roots;
    let current = null;

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let found = nodes.find(n => n.name === p);
      if (!found) {
        found = { name: p, path: parts.slice(0, i + 1).join('/'), isDir: true, children: [], expanded: false };
        nodes.push(found);
      }
      current = found;
      nodes = found.children || [];
    }
    return current;
  }

  _renderTree() {
    this._treeItems.innerHTML = '';
    const frag = document.createDocumentFragment();
    this._renderNodes(this._roots, 0, frag);
    this._treeItems.appendChild(frag);
  }

  _renderNodes(nodes, depth, container) {
    if (!nodes) return;
    const sorted = [...nodes].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const node of sorted) {
      if (this._filterText && !node.name.toLowerCase().includes(this._filterText) && !node.isDir) continue;

      const el = document.createElement('div');
      el.className = 'tree-item' + (node.path === this._selected ? ' selected' : '');
      el.style.setProperty('--depth', depth);

      const chevron = node.isDir
        ? `<span class="tree-chevron${node.expanded ? ' open' : ''}">▶</span>`
        : '<span class="tree-chevron leaf">▶</span>';
      const icon = getIcon(node.name, node.isDir, node.expanded);

      el.innerHTML = `${chevron}<span class="tree-icon">${icon}</span><span class="tree-name">${escapeHtml(node.name)}</span>`;

      el.addEventListener('click', () => {
        if (node.isDir) {
          node.expanded = !node.expanded;
          this._renderTree();
          this.dispatchEvent(new CustomEvent('dir-toggle', { detail: { path: node.path, expanded: node.expanded } }));
        } else {
          this._selected = node.path;
          const cached = this._contentCache.get(node.path);
          if (cached !== undefined) {
            this._renderViewer(node.path, cached);
          } else {
            this._viewerContent.innerHTML = '<div class="empty-state"><span class="icon">⏳</span><span>Loading…</span></div>';
          }
          this._renderTree();
          this.dispatchEvent(new CustomEvent('file-select', { detail: { path: node.path } }));
        }
      });

      container.appendChild(el);

      if (node.isDir && node.expanded && node.children) {
        this._renderNodes(node.children, depth + 1, container);
      }
    }
  }

  _renderViewer(path, content) {
    // Breadcrumb
    const parts = path.split('/').filter(Boolean);
    this._breadcrumb.innerHTML = parts.map((p, i) =>
      (i < parts.length - 1
        ? `<span>${escapeHtml(p)}</span><span class="sep">/</span>`
        : `<span class="current">${escapeHtml(p)}</span>`)
    ).join('');

    // Content with line numbers
    const lines = content.split('\n');
    const maxDigits = String(lines.length).length;
    this._viewerContent.innerHTML = lines.map((line, i) => {
      const num = String(i + 1).padStart(maxDigits, ' ');
      return `<div class="line"><span class="line-num">${num}</span>${escapeHtml(line)}</div>`;
    }).join('');
  }

  _initResize() {
    let startX, startWidth;
    const handle = this._resizeHandle;
    const panel = this._treePanel;

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newWidth = Math.max(150, Math.min(500, startWidth + dx));
      panel.style.width = newWidth + 'px';
    };

    const onMouseUp = () => {
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = panel.offsetWidth;
      handle.classList.add('dragging');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}

customElements.define('sc-filetree', ScFiletree);
