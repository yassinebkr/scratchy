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

// SVG file type icons (14×14)
const _DOC = 'M4 1.5A1 1 0 015 .5h4.5L13 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1z';
const _FOLD = 'M9.5.5V4H13';
function _fileDoc(fill, stroke) {
  return `<svg width="14" height="14" viewBox="0 0 14 16" fill="none"><path d="${_DOC}" fill="${fill}" stroke="${stroke}" stroke-width="0.8"/><path d="${_FOLD}" fill="none" stroke="${stroke}" stroke-width="0.8" opacity="0.5"/></svg>`;
}

function getFileIcon(name, isDir, isOpen) {
  if (isDir) {
    const opacity = isOpen ? '0.45' : '0.65';
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 5a1 1 0 011-1h3.5L8 5.5h5a1 1 0 011 1V12a1 1 0 01-1 1H3a1 1 0 01-1-1V5z" fill="rgba(249,166,2,${opacity})"/></svg>`;
  }
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': case 'mjs':
      return _fileDoc('rgba(250,204,21,0.1)', 'rgba(250,204,21,0.5)');
    case 'ts': case 'tsx':
      return _fileDoc('rgba(250,204,21,0.1)', 'rgba(250,204,21,0.5)');
    case 'css': case 'scss': case 'less':
      return _fileDoc('rgba(59,130,246,0.1)', 'rgba(59,130,246,0.5)');
    case 'html': case 'htm':
      return _fileDoc('rgba(249,115,22,0.1)', 'rgba(249,115,22,0.5)');
    case 'json':
      return _fileDoc('rgba(34,197,94,0.1)', 'rgba(34,197,94,0.5)');
    case 'py':
      return _fileDoc('rgba(59,130,246,0.1)', 'rgba(59,130,246,0.5)');
    case 'rs':
      return _fileDoc('rgba(249,115,22,0.1)', 'rgba(249,115,22,0.5)');
    case 'md': case 'mdx':
      return _fileDoc('rgba(168,162,158,0.1)', 'rgba(168,162,158,0.5)');
    default:
      return _fileDoc('rgba(255,255,255,0.04)', 'rgba(255,255,255,0.2)');
  }
}

function escapeHtml(s) {
  return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
}

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    background: var(--sc-bg, #0e0c09);
    color: var(--sc-text, #e8e0d2);
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 13px;
    overflow: hidden;
    height: 100%;
    min-width: 0;
    min-height: 0;
    contain: layout style;
  }

  /* Surface header — 36px uniform glassmorphism */
  .surface-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
  .surface-breadcrumb {
    flex: 1;
    font-family: var(--mono, 'Geist Mono', monospace);
    font-size: 11px;
    color: var(--sc-text-dim, #5a5040);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .content-row {
    display: flex;
    flex-direction: row;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  /* Tree panel */
  .tree-panel {
    width: 260px;
    min-width: 200px;
    max-width: 400px;
    border-right: 1px solid var(--sc-border, rgba(249,166,2,0.12));
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
    background: rgba(14,12,9,0.5);
    border-bottom: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    flex-shrink: 0;
  }

  .tree-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-dim, #5a5040);
    letter-spacing: 0.5px;
    text-transform: uppercase;
    flex: 1;
  }

  .filter-input {
    width: 100%;
    padding: 4px 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    border-radius: 4px;
    color: var(--sc-text, #e8e0d2);
    font-family: inherit;
    font-size: 12px;
    outline: none;
  }

  .filter-input:focus { border-color: var(--sc-accent, #F9A602); }
  .filter-input::placeholder { color: var(--sc-text-dim, #5a5040); }

  .tree-items {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .filetree-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    font-size: 13px;
    cursor: pointer;
    user-select: none;
    border-radius: 4px;
    margin: 0 4px;
    transition: background 0.1s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--sc-text, #f0ead6);
  }

  .filetree-item:hover { background: rgba(249,166,2,0.06); }
  .filetree-item:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(249,166,2,0.35); }
  .filetree-item.selected { background: rgba(249,166,2,0.10); color: var(--sc-text, #f0ead6); }
  .filetree-item.directory { font-weight: 500; }

  .filetree-indent {
    width: 16px;
    flex-shrink: 0;
    position: relative;
    align-self: stretch;
  }

  .filetree-indent::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(255,255,255,0.06);
  }

  .filetree-indent.last-in-group::before {
    bottom: 50%;
  }

  .filetree-icon { flex-shrink: 0; width: 14px; height: 14px; display: flex; align-items: center; }
  .tree-chevron { flex-shrink: 0; width: 14px; font-size: 10px; color: var(--sc-text-dim, #5a5040); transition: transform 0.15s; }
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
    background: rgba(14,12,9,0.5);
    border-bottom: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    flex-shrink: 0;
    min-height: 32px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--sc-text-dim, #5a5040);
    flex: 1;
    overflow: hidden;
  }

  .breadcrumb span { white-space: nowrap; }
  .breadcrumb .sep { color: var(--sc-text-dim, #5a5040); }
  .breadcrumb .current { color: var(--sc-text, #e8e0d2); font-weight: 500; }

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
    color: var(--sc-text-dim, #5a5040);
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
  .resize-handle.dragging { background: var(--sc-accent, #F9A602); }

  @media (max-width: 767px) {
    .surface-header {
      padding-left: 48px;
    }
    .content-row { flex-direction: column; }
    .tree-panel {
      width: 100%;
      max-width: none;
      height: 40%;
      min-height: 120px;
      max-height: 50%;
      border-right: none;
      border-bottom: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    }
    .tree-toolbar {
      display: none;
    }
    .resize-handle { display: none; }
  }
</style>

<div class="surface-header">
  <span class="surface-header-title">
    <svg class="surface-header-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 4h4l2 2h6v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
    </svg>
    Explorer
  </span>
  <span class="surface-breadcrumb" id="surface-breadcrumb"></span>
  <button class="surface-close" id="surface-close-btn" title="Close explorer">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
  </button>
</div>
<div class="content-row">
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
    this._surfaceBreadcrumb = this.shadowRoot.getElementById('surface-breadcrumb');
  }

  connectedCallback() {
    this._filter.addEventListener('input', (e) => {
      this._filterText = e.target.value.toLowerCase();
      this._renderTree();
    });

    this.shadowRoot.getElementById('surface-close-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('surface-close', { detail: { type: 'explorer' }, bubbles: true, composed: true }));
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
    if (this._surfaceBreadcrumb) this._surfaceBreadcrumb.textContent = path;
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

    // Filter out hidden items for accurate last-child detection
    const visible = sorted.filter(node =>
      !(this._filterText && !node.name.toLowerCase().includes(this._filterText) && !node.isDir)
    );

    for (let idx = 0; idx < visible.length; idx++) {
      const node = visible[idx];
      const isLast = idx === visible.length - 1;

      const el = document.createElement('div');
      let cls = 'filetree-item';
      if (node.path === this._selected) cls += ' selected';
      if (node.isDir) cls += ' directory';
      el.className = cls;

      // Build indent blocks
      const indents = Array.from({ length: depth }, (_, j) =>
        (j === depth - 1 && isLast)
          ? '<span class="filetree-indent last-in-group"></span>'
          : '<span class="filetree-indent"></span>'
      ).join('');

      const chevron = node.isDir
        ? `<span class="tree-chevron${node.expanded ? ' open' : ''}">▶</span>`
        : '<span class="tree-chevron leaf">▶</span>';
      const icon = getFileIcon(node.name, node.isDir, node.expanded);

      el.innerHTML = `${indents}${chevron}<span class="filetree-icon">${icon}</span><span class="tree-name">${escapeHtml(node.name)}</span>`;

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
