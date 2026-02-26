/**
 * Scratchy v2 — <sc-agent-switcher> Web Component
 * Sidebar/dropdown agent switcher with inline agent creator form,
 * agent templates, keyboard navigation, mobile compact mode,
 * delete confirmation, and form validation.
 */

const MODELS = [
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'opus', label: 'Claude Opus' },
  { value: 'haiku', label: 'Claude Haiku' },
  { value: 'gemini', label: 'Gemini' },
];

const AGENT_TEMPLATES = [
  {
    id: 'tpl-code',
    emoji: '🧑‍💻',
    label: 'Code Assistant',
    name: 'Code Assistant',
    systemPrompt: 'You are an expert software engineer. Help the user write, debug, and review code. Be concise and precise. Prefer working solutions over explanations.',
    model: 'sonnet',
    temperature: 0.3,
    surfaces: ['terminal', 'editor'],
    mcpServers: [],
  },
  {
    id: 'tpl-designer',
    emoji: '🎨',
    label: 'Designer',
    name: 'Designer',
    systemPrompt: 'You are a creative designer. Help with UI/UX design, color palettes, layouts, and visual concepts. Think visually and suggest bold ideas.',
    model: 'sonnet',
    temperature: 0.9,
    surfaces: ['canvas'],
    mcpServers: [],
  },
  {
    id: 'tpl-researcher',
    emoji: '🔍',
    label: 'Researcher',
    name: 'Researcher',
    systemPrompt: 'You are a thorough researcher. Search for information, synthesize findings, verify facts, and present clear summaries with sources.',
    model: 'sonnet',
    temperature: 0.8,
    surfaces: [],
    mcpServers: [],
  },
  {
    id: 'tpl-writer',
    emoji: '📝',
    label: 'Writer',
    name: 'Writer',
    systemPrompt: 'You are a skilled writer and editor. Help craft clear, engaging prose. Adapt your tone and style to the audience. Focus on clarity and impact.',
    model: 'sonnet',
    temperature: 0.7,
    surfaces: [],
    mcpServers: [],
  },
];

const tpl = document.createElement('template');
tpl.innerHTML = `
<style>
  :host {
    display: block;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    color: var(--text, #e4e4e7);
  }

  /* ── Switcher sidebar ─── */
  .switcher {
    padding: 8px 0;
  }

  .switcher-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted, #71717a);
  }

  .create-btn {
    background: none;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    color: var(--accent, #6366f1);
    font-size: 11px;
    font-weight: 500;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    font-family: inherit;
  }

  .create-btn:hover {
    background: rgba(99,102,241,0.1);
    border-color: var(--accent, #6366f1);
  }

  .agent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    outline: none;
  }

  .agent-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 8px;
    margin: 0 4px;
    transition: background 0.12s;
    position: relative;
    outline: none;
  }

  .agent-item:hover {
    background: rgba(255,255,255,0.04);
  }

  .agent-item.active {
    background: rgba(99,102,241,0.12);
  }

  .agent-item.focused {
    box-shadow: inset 0 0 0 2px var(--accent, #6366f1);
  }

  .agent-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--surface, #18181b);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .agent-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .agent-info {
    flex: 1;
    min-width: 0;
  }

  .agent-name {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .agent-model {
    font-size: 11px;
    color: var(--text-muted, #71717a);
  }

  .agent-active-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent, #6366f1);
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .agent-item.active .agent-active-dot {
    opacity: 1;
  }

  /* ── Delete button on agent items ─── */
  .agent-delete-btn {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--text-muted, #71717a);
    font-size: 12px;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, color 0.12s;
    padding: 0;
    line-height: 1;
  }

  .agent-item:hover .agent-delete-btn,
  .agent-item.focused .agent-delete-btn {
    display: flex;
  }

  .agent-delete-btn:hover {
    background: rgba(248,113,113,0.15);
    color: #f87171;
  }

  /* ── Mobile compact mode ─── */
  :host([compact]) .agent-info {
    display: none;
  }

  :host([compact]) .agent-active-dot {
    display: none;
  }

  :host([compact]) .agent-item {
    padding: 6px;
    justify-content: center;
    margin: 0 2px;
  }

  :host([compact]) .agent-avatar {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }

  :host([compact]) .switcher-header span {
    display: none;
  }

  :host([compact]) .agent-delete-btn {
    display: none !important;
  }

  /* ── Creator overlay ─── */
  .creator-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1000;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }

  .creator-overlay.open {
    display: flex;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .creator-card {
    background: var(--surface, #111118);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 480px;
    max-height: 85vh;
    overflow-y: auto;
    margin: 16px;
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .creator-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 16px;
  }

  /* ── Templates section ─── */
  .templates-section {
    margin-bottom: 16px;
  }

  .templates-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted, #71717a);
    margin-bottom: 8px;
    display: block;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .template-btn {
    background: var(--bg, #0a0a0f);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    color: var(--text, #e4e4e7);
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .template-btn:hover {
    border-color: var(--accent, #6366f1);
    background: rgba(99,102,241,0.06);
  }

  .template-emoji {
    font-size: 16px;
  }

  /* ── Form fields ─── */
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }

  .form-group label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted, #71717a);
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    background: var(--bg, #0a0a0f);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 6px;
    color: var(--text, #e4e4e7);
    font-family: inherit;
    font-size: 13px;
    padding: 8px 10px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    border-color: var(--accent, #6366f1);
  }

  .form-group input.invalid,
  .form-group textarea.invalid {
    border-color: #f87171;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 60px;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .slider-row input[type="range"] {
    flex: 1;
    accent-color: var(--accent, #6366f1);
    padding: 0;
    border: none;
    background: transparent;
  }

  .slider-value {
    font-size: 12px;
    color: var(--text-muted, #71717a);
    min-width: 28px;
    text-align: right;
  }

  /* ── Toggle switch ─── */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
  }

  .toggle-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted, #71717a);
  }

  .toggle-switch {
    position: relative;
    width: 36px;
    height: 20px;
    cursor: pointer;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .toggle-track {
    position: absolute;
    inset: 0;
    background: var(--border, rgba(255,255,255,0.12));
    border-radius: 10px;
    transition: background 0.2s;
  }

  .toggle-switch input:checked + .toggle-track {
    background: var(--accent, #6366f1);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
    pointer-events: none;
  }

  .toggle-switch input:checked ~ .toggle-thumb {
    transform: translateX(16px);
  }

  /* ── Tags / chips for surfaces ─── */
  .chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .chip {
    font-size: 11px;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    background: var(--bg, #0a0a0f);
    color: var(--text-muted, #71717a);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    font-family: inherit;
  }

  .chip.selected {
    border-color: var(--accent, #6366f1);
    color: var(--accent, #6366f1);
    background: rgba(99,102,241,0.08);
  }

  /* ── Buttons ─── */
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  .btn {
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    border: none;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted, #71717a);
  }

  .btn-ghost:hover {
    color: var(--text, #e4e4e7);
    background: rgba(255,255,255,0.04);
  }

  .btn-primary {
    background: var(--accent, #6366f1);
    color: #fff;
  }

  .btn-primary:hover {
    background: var(--accent-hover, #4f46e5);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-error {
    color: #f87171;
    font-size: 12px;
    margin-top: 4px;
    min-height: 16px;
  }

  .empty-msg {
    text-align: center;
    color: var(--text-muted, #71717a);
    font-size: 12px;
    padding: 16px;
  }

  /* ── Delete confirmation dialog ─── */
  .confirm-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 1100;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }

  .confirm-overlay.open {
    display: flex;
  }

  .confirm-card {
    background: var(--surface, #111118);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 12px;
    padding: 24px;
    width: 100%;
    max-width: 340px;
    margin: 16px;
    text-align: center;
    animation: slideUp 0.2s ease;
  }

  .confirm-title {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 8px;
  }

  .confirm-msg {
    font-size: 13px;
    color: var(--text-muted, #71717a);
    margin: 0 0 20px;
    line-height: 1.4;
  }

  .confirm-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .btn-danger {
    background: #dc2626;
    color: #fff;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    border: none;
    transition: background 0.15s;
  }

  .btn-danger:hover {
    background: #b91c1c;
  }

  /* ── Mobile bottom sheet ─── */
  @media (max-width: 640px) {
    .creator-card {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      max-width: 100%;
      max-height: 80vh;
      margin: 0;
      border-radius: 16px 16px 0 0;
      animation: slideUpMobile 0.25s ease;
    }

    @keyframes slideUpMobile {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    .creator-overlay {
      align-items: flex-end;
    }

    .confirm-card {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      max-width: 100%;
      margin: 0;
      border-radius: 16px 16px 0 0;
    }

    .confirm-overlay {
      align-items: flex-end;
    }
  }
</style>

<div class="switcher">
  <div class="switcher-header">
    <span>Agents</span>
    <button class="create-btn" id="create-btn">+ New</button>
  </div>
  <ul class="agent-list" id="agent-list" tabindex="0" role="listbox" aria-label="Agent list">
    <li class="empty-msg">Loading agents…</li>
  </ul>
</div>

<!-- Creator overlay -->
<div class="creator-overlay" id="creator-overlay">
  <div class="creator-card">
    <h3 class="creator-title" id="creator-title">Create Agent</h3>

    <!-- Templates -->
    <div class="templates-section" id="templates-section">
      <span class="templates-label">Start from template</span>
      <div class="templates-grid" id="templates-grid"></div>
    </div>

    <form id="creator-form" autocomplete="off">
      <div class="form-group">
        <label for="agent-name">Name *</label>
        <input id="agent-name" type="text" placeholder="My Agent" required maxlength="60" />
      </div>
      <div class="form-group">
        <label for="agent-avatar">Avatar URL</label>
        <input id="agent-avatar" type="url" placeholder="https://…" />
      </div>
      <div class="form-group">
        <label for="agent-prompt">System Prompt</label>
        <textarea id="agent-prompt" rows="3" placeholder="You are a helpful assistant…"></textarea>
      </div>
      <div class="form-group">
        <label for="agent-model">Model</label>
        <select id="agent-model"></select>
      </div>
      <div class="form-group">
        <label>Temperature</label>
        <div class="slider-row">
          <input type="range" id="agent-temp" min="0" max="2" step="0.1" value="0.7" />
          <span class="slider-value" id="temp-value">0.7</span>
        </div>
      </div>
      <div class="form-group">
        <label>Surfaces</label>
        <div class="chips-row" id="surfaces-chips"></div>
      </div>
      <div class="form-group">
        <label for="agent-mcp">MCP Servers (one per line)</label>
        <textarea id="agent-mcp" rows="2" placeholder="node /path/to/server.mjs"></textarea>
      </div>
      <div class="form-group">
        <div class="toggle-row">
          <span class="toggle-label">Enabled</span>
          <label class="toggle-switch">
            <input type="checkbox" id="agent-enabled" checked />
            <span class="toggle-track"></span>
            <span class="toggle-thumb"></span>
          </label>
        </div>
      </div>
      <div class="form-error" id="form-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary" id="save-btn">Create</button>
      </div>
    </form>
  </div>
</div>

<!-- Delete confirmation overlay -->
<div class="confirm-overlay" id="confirm-overlay">
  <div class="confirm-card">
    <h3 class="confirm-title">Delete Agent</h3>
    <p class="confirm-msg" id="confirm-msg">Are you sure you want to delete this agent?</p>
    <div class="confirm-actions">
      <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
      <button class="btn-danger" id="confirm-delete">Delete</button>
    </div>
  </div>
</div>
`;

const SURFACE_OPTIONS = ['terminal', 'editor', 'canvas', 'browser', 'files'];

export class ScAgentSwitcher extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(tpl.content.cloneNode(true));

    this._agents = [];
    this._activeAgentId = null;
    this._focusedIndex = -1;
    this._token = null;
    this._editingAgentId = null;        // non-null when editing
    this._pendingDeleteAgent = null;     // agent pending delete confirmation
    this._selectedSurfaces = new Set();

    // DOM refs
    this._listEl = this.shadowRoot.getElementById('agent-list');
    this._createBtn = this.shadowRoot.getElementById('create-btn');
    this._overlay = this.shadowRoot.getElementById('creator-overlay');
    this._form = this.shadowRoot.getElementById('creator-form');
    this._cancelBtn = this.shadowRoot.getElementById('cancel-btn');
    this._errorEl = this.shadowRoot.getElementById('form-error');
    this._modelSelect = this.shadowRoot.getElementById('agent-model');
    this._tempSlider = this.shadowRoot.getElementById('agent-temp');
    this._tempValue = this.shadowRoot.getElementById('temp-value');
    this._creatorTitle = this.shadowRoot.getElementById('creator-title');
    this._saveBtn = this.shadowRoot.getElementById('save-btn');
    this._templatesGrid = this.shadowRoot.getElementById('templates-grid');
    this._templatesSection = this.shadowRoot.getElementById('templates-section');
    this._surfacesChips = this.shadowRoot.getElementById('surfaces-chips');
    this._mcpInput = this.shadowRoot.getElementById('agent-mcp');
    this._enabledToggle = this.shadowRoot.getElementById('agent-enabled');
    this._confirmOverlay = this.shadowRoot.getElementById('confirm-overlay');
    this._confirmMsg = this.shadowRoot.getElementById('confirm-msg');
    this._confirmCancel = this.shadowRoot.getElementById('confirm-cancel');
    this._confirmDelete = this.shadowRoot.getElementById('confirm-delete');
  }

  connectedCallback() {
    // Populate model select
    for (const m of MODELS) {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      this._modelSelect.appendChild(opt);
    }

    // Populate template buttons
    for (const t of AGENT_TEMPLATES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'template-btn';
      btn.dataset.templateId = t.id;
      btn.innerHTML = `<span class="template-emoji">${t.emoji}</span>${this._escHtml(t.label)}`;
      btn.addEventListener('click', () => this._applyTemplate(t));
      this._templatesGrid.appendChild(btn);
    }

    // Populate surface chips
    for (const surface of SURFACE_OPTIONS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = surface;
      chip.dataset.surface = surface;
      chip.addEventListener('click', () => {
        if (this._selectedSurfaces.has(surface)) {
          this._selectedSurfaces.delete(surface);
          chip.classList.remove('selected');
        } else {
          this._selectedSurfaces.add(surface);
          chip.classList.add('selected');
        }
      });
      this._surfacesChips.appendChild(chip);
    }

    // Temperature slider feedback
    this._tempSlider.addEventListener('input', () => {
      this._tempValue.textContent = this._tempSlider.value;
    });

    // Create button
    this._createBtn.addEventListener('click', () => this._openCreator());

    // Cancel creator
    this._cancelBtn.addEventListener('click', () => this._closeCreator());
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._closeCreator();
    });

    // Submit creator
    this._form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleCreate();
    });

    // Keyboard navigation on the agent list
    this._listEl.addEventListener('keydown', (e) => this._handleListKeydown(e));

    // Delete confirmation dialog
    this._confirmCancel.addEventListener('click', () => this._closeConfirm());
    this._confirmDelete.addEventListener('click', () => this._executeDelete());
    this._confirmOverlay.addEventListener('click', (e) => {
      if (e.target === this._confirmOverlay) this._closeConfirm();
    });

    // Escape key closes overlays
    this.shadowRoot.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this._confirmOverlay.classList.contains('open')) {
          this._closeConfirm();
        } else if (this._overlay.classList.contains('open')) {
          this._closeCreator();
        }
      }
    });

    // Compact mode toggle via media query
    this._mql = window.matchMedia('(max-width: 640px)');
    this._handleMobileChange = (e) => {
      if (this.hasAttribute('auto-compact')) {
        if (e.matches) this.setAttribute('compact', '');
        else this.removeAttribute('compact');
      }
    };
    this._mql.addEventListener('change', this._handleMobileChange);
    this._handleMobileChange(this._mql);

    // Fetch token from localStorage
    this._token = localStorage.getItem('scratchy_token');

    // Load agents
    this.loadAgents();
  }

  disconnectedCallback() {
    if (this._mql) {
      this._mql.removeEventListener('change', this._handleMobileChange);
    }
  }

  /** Set the active agent ID (for external control) */
  set activeAgentId(id) {
    this._activeAgentId = id;
    this._renderList();
  }

  get activeAgentId() {
    return this._activeAgentId;
  }

  /** Expose templates for external access */
  static get templates() {
    return AGENT_TEMPLATES;
  }

  /** Refresh the agent list from the API */
  async loadAgents() {
    try {
      const res = await fetch('/api/agents', {
        headers: this._token ? { 'Authorization': `Bearer ${this._token}` } : {},
      });
      if (res.ok) {
        this._agents = await res.json();
      } else {
        this._agents = [];
      }
    } catch {
      this._agents = [];
    }
    this._renderList();
  }

  _renderList() {
    if (this._agents.length === 0) {
      this._listEl.innerHTML = '<li class="empty-msg">No agents yet</li>';
      this._focusedIndex = -1;
      return;
    }

    this._listEl.innerHTML = '';
    for (let i = 0; i < this._agents.length; i++) {
      const agent = this._agents[i];
      const li = document.createElement('li');
      li.className = 'agent-item'
        + (agent.id === this._activeAgentId ? ' active' : '')
        + (i === this._focusedIndex ? ' focused' : '');
      li.dataset.agentId = agent.id;
      li.dataset.index = i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', agent.id === this._activeAgentId ? 'true' : 'false');

      const avatarContent = agent.avatar
        ? `<img src="${this._escHtml(agent.avatar)}" alt="" />`
        : this._getInitials(agent.name);

      li.innerHTML = `
        <div class="agent-avatar">${avatarContent}</div>
        <div class="agent-info">
          <div class="agent-name">${this._escHtml(agent.name)}</div>
          <div class="agent-model">${this._escHtml(agent.model || 'sonnet')}</div>
        </div>
        <div class="agent-active-dot"></div>
        <button class="agent-delete-btn" aria-label="Delete ${this._escHtml(agent.name)}" title="Delete agent">&times;</button>
      `;

      // Click to switch
      li.addEventListener('click', (e) => {
        if (e.target.closest('.agent-delete-btn')) return;
        this._switchAgent(agent);
      });

      // Delete button
      const delBtn = li.querySelector('.agent-delete-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._requestDelete(agent);
      });

      this._listEl.appendChild(li);
    }
  }

  /* ─── Keyboard navigation ─── */
  _handleListKeydown(e) {
    const count = this._agents.length;
    if (count === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this._focusedIndex = Math.min(this._focusedIndex + 1, count - 1);
      this._renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this._focusedIndex = Math.max(this._focusedIndex - 1, 0);
      this._renderList();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (this._focusedIndex >= 0 && this._focusedIndex < count) {
        this._switchAgent(this._agents[this._focusedIndex]);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this._focusedIndex >= 0 && this._focusedIndex < count) {
        e.preventDefault();
        this._requestDelete(this._agents[this._focusedIndex]);
      }
    }
  }

  _switchAgent(agent) {
    this._activeAgentId = agent.id;
    this._focusedIndex = this._agents.findIndex(a => a.id === agent.id);
    this._renderList();

    this.dispatchEvent(new CustomEvent('agent-switch', {
      bubbles: true,
      composed: true,
      detail: { agentId: agent.id, agent },
    }));
  }

  /* ─── Creator form ─── */
  _openCreator(editAgent = null) {
    this._form.reset();
    this._selectedSurfaces.clear();
    this._errorEl.textContent = '';
    this._editingAgentId = null;

    // Reset surface chip visuals
    for (const chip of this._surfacesChips.querySelectorAll('.chip')) {
      chip.classList.remove('selected');
    }

    if (editAgent) {
      // Edit mode
      this._editingAgentId = editAgent.id;
      this._creatorTitle.textContent = 'Edit Agent';
      this._saveBtn.textContent = 'Save';
      this._templatesSection.style.display = 'none';

      this.shadowRoot.getElementById('agent-name').value = editAgent.name || '';
      this.shadowRoot.getElementById('agent-avatar').value = editAgent.avatar || '';
      this.shadowRoot.getElementById('agent-prompt').value = editAgent.systemPrompt || '';
      this._modelSelect.value = editAgent.model || 'sonnet';
      this._tempSlider.value = editAgent.temperature ?? 0.7;
      this._tempValue.textContent = this._tempSlider.value;
      this._enabledToggle.checked = editAgent.enabled !== false && editAgent.enabled !== 0;

      // Surfaces
      const surfaces = Array.isArray(editAgent.surfaces) ? editAgent.surfaces : [];
      for (const s of surfaces) {
        this._selectedSurfaces.add(s);
        const chip = this._surfacesChips.querySelector(`[data-surface="${s}"]`);
        if (chip) chip.classList.add('selected');
      }

      // MCP
      const mcpServers = Array.isArray(editAgent.mcpServers) ? editAgent.mcpServers : [];
      this._mcpInput.value = mcpServers.map(s => s.command || '').filter(Boolean).join('\n');
    } else {
      // Create mode
      this._creatorTitle.textContent = 'Create Agent';
      this._saveBtn.textContent = 'Create';
      this._templatesSection.style.display = '';
      this._tempValue.textContent = '0.7';
      this._enabledToggle.checked = true;
    }

    this._overlay.classList.add('open');
    // Focus the name input
    setTimeout(() => this.shadowRoot.getElementById('agent-name').focus(), 50);
  }

  _closeCreator() {
    this._overlay.classList.remove('open');
    this._editingAgentId = null;
  }

  _applyTemplate(template) {
    this.shadowRoot.getElementById('agent-name').value = template.name;
    this.shadowRoot.getElementById('agent-prompt').value = template.systemPrompt;
    this._modelSelect.value = template.model;
    this._tempSlider.value = template.temperature;
    this._tempValue.textContent = template.temperature;

    // Set surfaces
    this._selectedSurfaces.clear();
    for (const chip of this._surfacesChips.querySelectorAll('.chip')) {
      chip.classList.remove('selected');
    }
    for (const s of template.surfaces) {
      this._selectedSurfaces.add(s);
      const chip = this._surfacesChips.querySelector(`[data-surface="${s}"]`);
      if (chip) chip.classList.add('selected');
    }

    // MCP servers
    this._mcpInput.value = template.mcpServers.map(s => s.command || '').filter(Boolean).join('\n');
  }

  /** Validate form and return errors array (empty = valid) */
  _validateForm() {
    const errors = [];
    const nameInput = this.shadowRoot.getElementById('agent-name');
    const name = nameInput.value.trim();

    if (!name) {
      errors.push('Name is required');
      nameInput.classList.add('invalid');
    } else {
      nameInput.classList.remove('invalid');
    }

    const temp = parseFloat(this._tempSlider.value);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      errors.push('Temperature must be between 0.0 and 2.0');
    }

    return errors;
  }

  async _handleCreate() {
    const errors = this._validateForm();
    if (errors.length > 0) {
      this._errorEl.textContent = errors[0];
      return;
    }

    const name = this.shadowRoot.getElementById('agent-name').value.trim();
    const systemPrompt = this.shadowRoot.getElementById('agent-prompt').value.trim();
    const model = this._modelSelect.value;
    const temperature = parseFloat(this._tempSlider.value);
    const avatar = this.shadowRoot.getElementById('agent-avatar').value.trim() || null;
    const surfaces = [...this._selectedSurfaces];
    const enabled = this._enabledToggle.checked;

    // Parse MCP servers
    const mcpLines = this._mcpInput.value.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const mcpServers = mcpLines.map(cmd => ({ command: cmd }));

    const saveBtn = this._saveBtn;
    saveBtn.disabled = true;
    this._errorEl.textContent = '';

    try {
      const isEdit = !!this._editingAgentId;
      const url = isEdit ? `/api/agents/${this._editingAgentId}` : '/api/agents';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this._token ? { 'Authorization': `Bearer ${this._token}` } : {}),
        },
        body: JSON.stringify({ name, systemPrompt, model, temperature, avatar, surfaces, mcpServers, enabled }),
      });

      const data = await res.json();

      if (!res.ok) {
        this._errorEl.textContent = data.error || `Failed to ${isEdit ? 'update' : 'create'} agent`;
        return;
      }

      this._closeCreator();
      await this.loadAgents();

      if (!isEdit) {
        // Auto-switch to the new agent
        this._switchAgent(data);
      }
    } catch (err) {
      this._errorEl.textContent = 'Network error';
    } finally {
      saveBtn.disabled = false;
    }
  }

  /* ─── Delete confirmation ─── */
  _requestDelete(agent) {
    this._pendingDeleteAgent = agent;
    this._confirmMsg.textContent = `Are you sure you want to delete "${agent.name}"? This cannot be undone.`;
    this._confirmOverlay.classList.add('open');
    this._confirmDelete.focus();
  }

  _closeConfirm() {
    this._confirmOverlay.classList.remove('open');
    this._pendingDeleteAgent = null;
  }

  async _executeDelete() {
    const agent = this._pendingDeleteAgent;
    if (!agent) return;

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
        headers: this._token ? { 'Authorization': `Bearer ${this._token}` } : {},
      });

      if (res.ok) {
        this._closeConfirm();

        // If we deleted the active agent, clear active
        if (this._activeAgentId === agent.id) {
          this._activeAgentId = null;
          this.dispatchEvent(new CustomEvent('agent-switch', {
            bubbles: true,
            composed: true,
            detail: { agentId: null, agent: null },
          }));
        }

        await this.loadAgents();
      } else {
        const data = await res.json().catch(() => ({}));
        this._confirmMsg.textContent = data.error || 'Failed to delete agent';
      }
    } catch {
      this._confirmMsg.textContent = 'Network error';
    }
  }

  /* ─── Utilities ─── */
  _getInitials(name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }

  _escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

customElements.define('sc-agent-switcher', ScAgentSwitcher);
