class SCWorkspaces extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.currentView = 'workspaces';
    this.token = '';
  }

  static get observedAttributes() {
    return ['open', 'token'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'open') {
      if (this.hasAttribute('open')) {
        this.fetchData();
      }
    } else if (name === 'token') {
      this.token = newValue;
    }
  }

  connectedCallback() {
    this.renderShell();
    this.setupListeners();
  }

  renderShell() {
    const template = `
      <style>
        :host {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 5000;
          font-family: var(--sc-font);
          color: var(--sc-text);
        }
        :host([open]) {
          display: flex;
        }
        .overlay {
          position: absolute;
          inset: 0;
          background: var(--sc-glass-bg-heavy);
          backdrop-filter: var(--sc-glass-blur);
          background-image: radial-gradient(at 0% 0%, var(--sc-accent-subtle) 0px, transparent 50%),
                            radial-gradient(at 100% 100%, var(--sc-accent-subtle) 0px, transparent 50%);
          animation: mesh 10s ease-in-out infinite alternate;
        }
        @keyframes mesh {
          0% { background-position: 0% 0%; }
          100% { background-position: 100% 100%; }
        }
        .panel {
          position: relative;
          display: flex;
          width: 90%;
          max-width: 1000px;
          height: 80vh;
          margin: auto;
          background: var(--sc-surface);
          border: 1px solid var(--sc-border-strong);
          border-radius: var(--sc-radius-lg);
          box-shadow: var(--sc-shadow-lg);
          overflow: hidden;
        }
        .sidebar {
          width: 250px;
          background: var(--sc-bg);
          border-right: 1px solid var(--sc-border);
          display: flex;
          flex-direction: column;
          padding: 20px;
        }
        .active-indicator {
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--sc-border-subtle);
        }
        .active-workspace {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .active-workspace-icon {
          font-size: 24px;
        }
        .active-workspace-info {
          display: flex;
          flex-direction: column;
        }
        .active-workspace-name {
          font-weight: bold;
          color: var(--sc-accent);
        }
        .active-workspace-label {
          font-size: var(--sc-font-size-xs);
          color: var(--sc-text-dim);
        }
        .deactivate-link {
          font-size: var(--sc-font-size-xs);
          color: var(--sc-text-muted);
          cursor: pointer;
          text-decoration: underline;
          margin-top: 5px;
        }
        .deactivate-link:hover {
          color: var(--sc-text);
        }
        .nav-menu {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .nav-item {
          background: transparent;
          border: none;
          color: var(--sc-text-muted);
          text-align: left;
          padding: 10px 15px;
          border-radius: var(--sc-radius-sm);
          cursor: pointer;
          font-family: inherit;
          font-size: var(--sc-font-size);
          transition: all var(--sc-transition-fast);
        }
        .nav-item:hover {
          background: var(--sc-surface-hover);
          color: var(--sc-text);
        }
        .nav-item.active {
          background: var(--sc-accent-subtle);
          color: var(--sc-accent);
          font-weight: 500;
        }
        .main-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: var(--sc-surface);
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 30px;
          border-bottom: 1px solid var(--sc-border);
        }
        .header h2 {
          margin: 0;
          font-size: 1.2rem;
          font-weight: 500;
        }
        .header-actions {
          display: flex;
          gap: 10px;
        }
        .btn {
          background: var(--sc-surface-hover);
          color: var(--sc-text);
          border: 1px solid var(--sc-border);
          padding: 8px 16px;
          border-radius: var(--sc-radius);
          cursor: pointer;
          font-family: inherit;
          font-size: var(--sc-font-size-sm);
          transition: all var(--sc-transition-fast);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .btn:hover {
          border-color: var(--sc-border-strong);
        }
        .btn-primary {
          background: var(--sc-accent);
          color: var(--sc-bg);
          border-color: var(--sc-accent);
          font-weight: 500;
        }
        .btn-primary:hover {
          background: var(--sc-accent-hover);
          border-color: var(--sc-accent-hover);
          box-shadow: 0 0 10px var(--sc-accent-glow);
        }
        .btn-ghost {
          background: transparent;
          border-color: transparent;
        }
        .btn-ghost:hover {
          background: var(--sc-surface-hover);
        }
        .btn-danger {
          color: var(--sc-danger);
        }
        .btn-danger:hover {
          background: var(--sc-danger-subtle);
          color: var(--sc-danger);
          border-color: transparent;
        }
        .scroll-area {
          flex: 1;
          overflow-y: auto;
          padding: 30px;
        }
        .scroll-area::-webkit-scrollbar {
          width: 8px;
        }
        .scroll-area::-webkit-scrollbar-track {
          background: var(--sc-bg);
        }
        .scroll-area::-webkit-scrollbar-thumb {
          background: var(--sc-surface-hover);
          border-radius: 4px;
        }
        .scroll-area::-webkit-scrollbar-thumb:hover {
          background: var(--sc-text-dim);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }
        .card {
          background: var(--sc-bg);
          border: 1px solid var(--sc-border);
          border-radius: var(--sc-radius-lg);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 15px;
          transition: all var(--sc-transition);
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .card:hover {
          border-color: var(--sc-border-strong);
          box-shadow: var(--sc-shadow-md);
          transform: translateY(-2px);
        }
        .card-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .card-icon {
          font-size: 24px;
          background: var(--sc-surface-hover);
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--sc-radius);
        }
        .card-title-area {
          flex: 1;
        }
        .card-title {
          font-weight: 500;
          margin: 0 0 4px 0;
          font-size: var(--sc-font-size);
        }
        .card-desc {
          color: var(--sc-text-muted);
          font-size: var(--sc-font-size-sm);
          margin: 0;
          line-height: 1.4;
        }
        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }
        .badge {
          background: var(--sc-surface);
          border: 1px solid var(--sc-border-subtle);
          padding: 2px 6px;
          border-radius: var(--sc-radius-sm);
          font-size: var(--sc-font-size-xs);
          color: var(--sc-text-dim);
        }
        .badge-template {
          background: var(--sc-accent-subtle);
          color: var(--sc-accent);
          border-color: var(--sc-border);
        }
        .card-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: auto;
          padding-top: 15px;
          border-top: 1px solid var(--sc-border-subtle);
        }
        .card-actions-left, .card-actions-right {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .toggle-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: var(--sc-font-size-xs);
          color: var(--sc-text-muted);
          cursor: pointer;
        }
        .toggle-input {
          appearance: none;
          width: 24px;
          height: 14px;
          background: var(--sc-surface-hover);
          border-radius: 10px;
          position: relative;
          cursor: pointer;
          outline: none;
          border: 1px solid var(--sc-border);
        }
        .toggle-input:checked {
          background: var(--sc-accent);
          border-color: var(--sc-accent);
        }
        .toggle-input::after {
          content: '';
          position: absolute;
          top: 1px;
          left: 1px;
          width: 10px;
          height: 10px;
          background: var(--sc-text);
          border-radius: 50%;
          transition: 0.2s;
        }
        .toggle-input:checked::after {
          left: 11px;
          background: var(--sc-bg);
        }
        .state-msg {
          text-align: center;
          padding: 40px;
          color: var(--sc-text-muted);
        }
        .state-msg.error {
          color: var(--sc-danger);
          background: var(--sc-danger-subtle);
          border-radius: var(--sc-radius);
        }
        @media (max-width: 768px) {
          .panel {
            flex-direction: column;
            height: 90vh;
          }
          .sidebar {
            width: auto;
            border-right: none;
            border-bottom: 1px solid var(--sc-border);
            padding: 15px;
          }
          .nav-menu {
            flex-direction: row;
            overflow-x: auto;
          }
          .grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
      <div class="overlay" id="overlay"></div>
      <div class="panel">
        <div class="sidebar">
          <div class="active-indicator" id="activeWorkspaceContainer"></div>
          <div class="nav-menu">
            <button class="nav-item active" data-view="workspaces">My Workspaces</button>
            <button class="nav-item" data-view="templates">Templates</button>
          </div>
        </div>
        <div class="main-content">
          <div class="header">
            <h2 id="viewTitle">My Workspaces</h2>
            <div class="header-actions" id="headerActions">
              <button id="saveCurrentBtn" class="btn btn-primary" style="display:none;">Save Current</button>
              <button id="closeBtn" class="btn btn-ghost">Close</button>
            </div>
          </div>
          <div class="scroll-area">
            <div id="loadingState" class="state-msg" style="display: none;">Loading...</div>
            <div id="errorState" class="state-msg error" style="display: none;"></div>
            <div id="emptyState" class="state-msg" style="display: none;"></div>
            <div id="grid" class="grid"></div>
          </div>
        </div>
      </div>
    `;
    this.shadowRoot.innerHTML = template;
    
    this.grid = this.shadowRoot.getElementById('grid');
    this.loadingState = this.shadowRoot.getElementById('loadingState');
    this.errorState = this.shadowRoot.getElementById('errorState');
    this.emptyState = this.shadowRoot.getElementById('emptyState');
    this.viewTitle = this.shadowRoot.getElementById('viewTitle');
    this.activeWorkspaceContainer = this.shadowRoot.getElementById('activeWorkspaceContainer');
    this.saveCurrentBtn = this.shadowRoot.getElementById('saveCurrentBtn');
  }

  setupListeners() {
    this.shadowRoot.getElementById('closeBtn').addEventListener('click', () => this.close());
    this.shadowRoot.getElementById('overlay').addEventListener('click', () => this.close());
    
    this._handleKeyDown = (e) => {
      if (e.key === 'Escape' && this.hasAttribute('open')) {
        this.close();
      }
    };
    window.addEventListener('keydown', this._handleKeyDown);

    const navItems = this.shadowRoot.querySelectorAll('.nav-item');
    navItems.forEach(btn => {
      btn.addEventListener('click', (e) => {
        navItems.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.currentView = e.target.getAttribute('data-view');
        this.fetchData();
      });
    });

    this.saveCurrentBtn.addEventListener('click', () => {
      const name = prompt('Enter a name for the new workspace:');
      if (name && name.trim()) {
        this.dispatchEvent(new CustomEvent('workspace-save', { detail: { name: name.trim() } }));
      }
    });
  }

  disconnectedCallback() {
    window.removeEventListener('keydown', this._handleKeyDown);
  }

  close() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('workspaces-close'));
  }

  async fetchData() {
    this.showLoading();
    try {
      if (this.currentView === 'workspaces') {
        this.viewTitle.textContent = 'My Workspaces';
        this.saveCurrentBtn.style.display = 'inline-flex';
        await this.loadWorkspaces();
      } else {
        this.viewTitle.textContent = 'Templates';
        this.saveCurrentBtn.style.display = 'none';
        await this.loadTemplates();
      }
    } catch (err) {
      this.showError(err.message);
    }
  }

  async fetchApi(path, options = {}) {
    const headers = {
      'Authorization': 'Bearer ' + this.token,
      'Content-Type': 'application/json'
    };
    const response = await fetch(path, { ...options, headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'API Error');
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async loadWorkspaces() {
    const data = await this.fetchApi('/api/workspaces');
    this.renderWorkspaces(data);
  }

  async loadTemplates() {
    const data = await this.fetchApi('/api/workspaces/templates');
    this.renderTemplates(data);
  }

  showLoading() {
    this.grid.innerHTML = '';
    this.loadingState.style.display = 'block';
    this.errorState.style.display = 'none';
    this.emptyState.style.display = 'none';
  }

  showError(msg) {
    this.loadingState.style.display = 'none';
    this.errorState.style.display = 'block';
    this.errorState.textContent = msg;
  }

  renderActiveWorkspace(workspaces) {
    const activeWs = workspaces.find(w => w.isDefault);
    if (!activeWs) {
      this.activeWorkspaceContainer.innerHTML = ' ' +
        '<div class="active-workspace-label">Active Workspace</div>' +
        '<div style="color: var(--sc-text-dim); margin-top: 5px;">None</div>';
      return;
    }
    
    this.activeWorkspaceContainer.innerHTML = '';
    
    const label = document.createElement('div');
    label.className = 'active-workspace-label';
    label.textContent = 'Active Workspace';
    
    const wsDiv = document.createElement('div');
    wsDiv.className = 'active-workspace';
    wsDiv.style.marginTop = '10px';
    
    const icon = document.createElement('div');
    icon.className = 'active-workspace-icon';
    icon.textContent = activeWs.icon || '📁';
    
    const info = document.createElement('div');
    info.className = 'active-workspace-info';
    
    const name = document.createElement('div');
    name.className = 'active-workspace-name';
    name.textContent = activeWs.name;
    
    const deactivate = document.createElement('div');
    deactivate.className = 'deactivate-link';
    deactivate.textContent = 'Deactivate';
    deactivate.addEventListener('click', async () => {
      try {
         await this.fetchApi('/api/workspaces/' + activeWs.id, {
           method: 'PATCH',
           body: JSON.stringify({ isDefault: false })
         });
         this.fetchData();
      } catch(e) {
         console.error('Failed to deactivate', e);
      }
    });
    
    info.appendChild(name);
    info.appendChild(deactivate);
    wsDiv.appendChild(icon);
    wsDiv.appendChild(info);
    
    this.activeWorkspaceContainer.appendChild(label);
    this.activeWorkspaceContainer.appendChild(wsDiv);
  }

  renderWorkspaces(data) {
    this.loadingState.style.display = 'none';
    this.renderActiveWorkspace(data);
    
    if (!data || data.length === 0) {
      this.emptyState.style.display = 'block';
      this.emptyState.innerHTML = '<div style="font-size: 40px; margin-bottom: 10px;">🌌</div><div>No workspaces exist yet. Save your current canvas to create one.</div>';
      return;
    }

    data.forEach(ws => {
      const card = document.createElement('div');
      card.className = 'card';
      
      const header = document.createElement('div');
      header.className = 'card-header';
      
      const icon = document.createElement('div');
      icon.className = 'card-icon';
      icon.textContent = ws.icon || '📁';
      
      const titleArea = document.createElement('div');
      titleArea.className = 'card-title-area';
      
      const title = document.createElement('h3');
      title.className = 'card-title';
      title.textContent = ws.name;
      
      const desc = document.createElement('p');
      desc.className = 'card-desc';
      desc.textContent = ws.description || '';
      
      const badges = document.createElement('div');
      badges.className = 'badges';
      if (ws.templateKey) {
        const tplBadge = document.createElement('span');
        tplBadge.className = 'badge badge-template';
        tplBadge.textContent = 'Template';
        badges.appendChild(tplBadge);
      }
      if (ws.updatedAt || ws.createdAt) {
        const dateBadge = document.createElement('span');
        dateBadge.className = 'badge';
        dateBadge.textContent = new Date(ws.updatedAt || ws.createdAt).toLocaleDateString();
        badges.appendChild(dateBadge);
      }
      
      titleArea.appendChild(title);
      titleArea.appendChild(desc);
      titleArea.appendChild(badges);
      header.appendChild(icon);
      header.appendChild(titleArea);
      
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      
      const leftActions = document.createElement('div');
      leftActions.className = 'card-actions-left';
      
      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'toggle-label';
      
      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.className = 'toggle-input';
      toggleInput.checked = !!ws.isDefault;
      toggleInput.addEventListener('change', async (e) => {
        try {
          await this.fetchApi('/api/workspaces/' + ws.id + '/activate', { method: 'POST' });
          this.fetchData();
        } catch(err) {
          e.target.checked = !e.target.checked;
          alert('Failed to set default: ' + err.message);
        }
      });
      
      const toggleText = document.createTextNode(' Default');
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleText);
      leftActions.appendChild(toggleLabel);
      
      const rightActions = document.createElement('div');
      rightActions.className = 'card-actions-right';
      
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-ghost btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        if (confirm('Delete workspace "' + ws.name + '"?')) {
          try {
            await this.fetchApi('/api/workspaces/' + ws.id, { method: 'DELETE' });
            this.fetchData();
          } catch(err) {
            alert('Delete failed: ' + err.message);
          }
        }
      });
      
      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-primary';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('workspace-load', { detail: { workspace: ws } }));
        this.close();
      });
      
      rightActions.appendChild(delBtn);
      rightActions.appendChild(loadBtn);
      
      actions.appendChild(leftActions);
      actions.appendChild(rightActions);
      
      card.appendChild(header);
      card.appendChild(actions);
      
      this.grid.appendChild(card);
    });
  }

  renderTemplates(data) {
    this.loadingState.style.display = 'none';
    if (!data || data.length === 0) {
      this.emptyState.style.display = 'block';
      this.emptyState.textContent = 'No templates available.';
      return;
    }

    data.forEach(tpl => {
      const card = document.createElement('div');
      card.className = 'card';
      
      const header = document.createElement('div');
      header.className = 'card-header';
      
      const icon = document.createElement('div');
      icon.className = 'card-icon';
      icon.textContent = tpl.icon || '📄';
      
      const titleArea = document.createElement('div');
      titleArea.className = 'card-title-area';
      
      const title = document.createElement('h3');
      title.className = 'card-title';
      title.textContent = tpl.name;
      
      const desc = document.createElement('p');
      desc.className = 'card-desc';
      desc.textContent = tpl.description || '';
      
      const badges = document.createElement('div');
      badges.className = 'badges';
      if (tpl.category) {
        const catBadge = document.createElement('span');
        catBadge.className = 'badge';
        catBadge.textContent = tpl.category;
        badges.appendChild(catBadge);
      }
      if (tpl.tier) {
        const tierBadge = document.createElement('span');
        tierBadge.className = 'badge';
        tierBadge.textContent = tpl.tier.toUpperCase();
        if (tpl.tier !== 'free') {
           tierBadge.style.color = 'var(--sc-accent)';
           tierBadge.style.borderColor = 'var(--sc-border-strong)';
        }
        badges.appendChild(tierBadge);
      }
      
      titleArea.appendChild(title);
      titleArea.appendChild(desc);
      titleArea.appendChild(badges);
      header.appendChild(icon);
      header.appendChild(titleArea);
      
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.style.justifyContent = 'flex-end';
      
      const rightActions = document.createElement('div');
      rightActions.className = 'card-actions-right';
      
      const isLocked = !!tpl.locked;
      
      const useBtn = document.createElement('button');
      if (isLocked) {
        useBtn.className = 'btn btn-ghost';
        useBtn.innerHTML = '🔒 Upgrade';
        useBtn.addEventListener('click', () => {
          alert('This template requires an upgrade.');
        });
      } else {
        useBtn.className = 'btn btn-primary';
        useBtn.textContent = 'Use Template';
        useBtn.addEventListener('click', async () => {
          const name = prompt('Name for new workspace from template:');
          if (name !== null) {
            try {
              await this.fetchApi('/api/workspaces/templates/' + tpl.key, {
                method: 'POST',
                body: JSON.stringify({ name: name || undefined })
              });
              this.currentView = 'workspaces';
              this.shadowRoot.querySelector('[data-view="workspaces"]').click();
            } catch(err) {
              alert('Failed to use template: ' + err.message);
            }
          }
        });
      }
      
      rightActions.appendChild(useBtn);
      actions.appendChild(rightActions);
      
      card.appendChild(header);
      card.appendChild(actions);
      
      this.grid.appendChild(card);
    });
  }
}

customElements.define('sc-workspaces', SCWorkspaces);