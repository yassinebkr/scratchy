/**
 * Scratchy v2 — Teams Management Web Component
 * <sc-teams> — Manage teams, members, and agents.
 *
 * Properties: userId (string), isAdmin (boolean)
 * Events: teams-close, team-chat
 */

const STYLES = /* css */ `
:host {
  --bg:            #0d0b07;
  --surface:       rgba(26,22,16,0.85);
  --surface-solid: #1a1610;
  --border:        rgba(249,166,2,0.10);
  --border-glass:  rgba(249,166,2,0.08);
  --radius:        8px;
  --radius-input:  6px;
  --text:          #f0ead6;
  --muted:         #8a7e6a;
  --accent:        #F9A602;
  --accent-hover:  #DAA520;
  --danger:        #ef4444;
  --success:       #22c55e;
  --focus-ring:    0 0 0 2px rgba(249,166,2,0.3);
  --font:          var(--sc-font, 'Geist', system-ui, sans-serif);
  --mono:          var(--sc-mono, monospace);

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
}
:host([open]) {
  display: flex;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.bg-mesh {
  position: fixed;
  inset: 0;
  z-index: 0;
  background: var(--bg);
  overflow: hidden;
}

.bg-mesh::before, .bg-mesh::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.35;
  animation: meshFloat 20s ease-in-out infinite alternate;
}

.bg-mesh::before {
  width: 600px; height: 600px;
  background: radial-gradient(circle, var(--accent) 0%, transparent 70%);
  top: -15%; left: -10%;
}
.bg-mesh::after {
  width: 500px; height: 500px;
  background: radial-gradient(circle, var(--accent-hover) 0%, transparent 70%);
  bottom: -20%; right: -10%;
  animation-delay: -10s;
  animation-direction: alternate-reverse;
}

@keyframes meshFloat {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(40px, -30px) scale(1.08); }
  66%  { transform: translate(-20px, 20px) scale(0.95); }
  100% { transform: translate(10px, -10px) scale(1.03); }
}

.scroll-wrapper {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 920px;
  height: calc(100dvh - 96px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 32px 16px 48px;
  background: var(--surface);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-top: 48px;
  scrollbar-width: thin;
  scrollbar-color: rgba(249,166,2,0.15) transparent;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px; height: 44px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  color: var(--muted);
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text);
}

.header h1 {
  font-size: 22px;
  font-weight: 700;
  background: linear-gradient(135deg, #f0ead6 30%, var(--accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  flex: 1;
  min-height: 0;
  gap: 24px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 16px;
  border-right: 1px solid var(--border);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
  border: none;
  background: none;
  text-align: left;
  border-left: 2px solid transparent;
}

.nav-item:hover {
  color: var(--text);
  background: rgba(249,166,2,0.06);
}

.nav-item.active {
  color: var(--accent);
  background: rgba(249,166,2,0.08);
  border-left-color: var(--accent);
}

.nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }

.content {
  min-height: 400px;
}

.view {
  display: none;
  animation: viewIn 0.3s ease;
}

.view.active {
  display: block;
}

@keyframes viewIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 3px solid var(--accent);
}

.section-title svg { width: 18px; height: 18px; color: var(--accent); }

/* Grid for Teams & Packages */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.card {
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card:hover {
  border-color: rgba(249,166,2,0.3);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-icon {
  width: 40px; height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #0d0b07;
  font-weight: bold;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.card-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.4;
  flex: 1;
}

.card-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.card-meta span { display: flex; align-items: center; gap: 4px; }
.card-meta svg { width: 14px; height: 14px; }

/* Detail View */
.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  background: var(--surface-solid);
  padding: 20px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.detail-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.list-section {
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 20px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.list-row:last-child { border-bottom: none; }

.list-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: #0d0b07;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 12px;
  text-transform: uppercase;
}

.list-name { font-size: 14px; font-weight: 500; }
.list-sub { font-size: 12px; color: var(--muted); }

.badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255,255,255,0.1);
  color: var(--text);
  text-transform: uppercase;
}

.badge.owner { background: rgba(249,166,2,0.2); color: var(--accent); }
.badge.admin { background: rgba(59,130,246,0.2); color: #60a5fa; }

/* Forms & Buttons */
.field { margin-bottom: 16px; }
.field label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 6px;
  text-transform: uppercase;
}

input, textarea, select {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  padding: 10px 12px;
  outline: none;
  transition: border-color 0.2s;
}

input:focus, textarea:focus, select:focus {
  border-color: var(--accent);
}

.btn {
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
  transition: all 0.2s;
}

.btn-primary { background: var(--accent); color: #0d0b07; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-ghost { background: rgba(255,255,255,0.05); color: var(--text); }
.btn-ghost:hover { background: rgba(255,255,255,0.1); }
.btn-danger { background: rgba(239,68,68,0.15); color: var(--danger); }
.btn-danger:hover { background: rgba(239,68,68,0.25); }

.spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,0.2);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: none;
}
.loading .spinner { display: inline-block; }
.loading span { display: none; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Dialog */
.dialog-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
  display: none; align-items: center; justify-content: center;
}
.dialog-overlay.open { display: flex; }
.dialog {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  width: 400px; max-width: 90%;
}
.dialog h3 { margin-bottom: 16px; }
.dialog-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 24px; }

@media (max-width: 768px) {
  .layout { grid-template-columns: 1fr; gap: 16px; }
  .nav { flex-direction: row; border-right: none; border-bottom: 1px solid var(--border); padding-right: 0; padding-bottom: 12px; overflow-x: auto; }
  .nav-item { white-space: nowrap; }
  .scroll-wrapper { max-width: 100%; margin: 0; height: 100dvh; border-radius: 0; padding: 20px 16px; }
}
`;

const ICONS = {
  teams: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>'
};

const HTML = `
<div class="bg-mesh"></div>
<div class="scroll-wrapper">
  <div class="header">
    <button class="back-btn" id="btn-close">${ICONS.back}</button>
    <h1>Teams</h1>
  </div>
  
  <div class="layout">
    <nav class="nav" id="nav-menu">
      <button class="nav-item active" data-target="my-teams">${ICONS.teams} My Teams</button>
      <button class="nav-item" data-target="create">${ICONS.plus} Create Team</button>
      <button class="nav-item" data-target="packages">${ICONS.box} Packages</button>
    </nav>

    <div class="content">
      <!-- Loading State -->
      <div id="view-loading" class="view">
        <div style="text-align:center; padding: 40px; color: var(--muted)">Loading...</div>
      </div>

      <!-- My Teams -->
      <div id="view-my-teams" class="view active">
        <div class="section-title">${ICONS.teams} My Teams</div>
        <div id="teams-grid" class="grid"></div>
      </div>

      <!-- Create Team -->
      <div id="view-create" class="view">
        <div class="section-title">${ICONS.plus} Create a New Team</div>
        <form id="create-form" style="max-width: 500px">
          <div class="field">
            <label>Team Name</label>
            <input type="text" name="name" required placeholder="e.g. Engineering">
          </div>
          <div class="field">
            <label>Description</label>
            <textarea name="description" rows="3" placeholder="What is this team for?"></textarea>
          </div>
          <div class="field">
            <label>Color (Hex)</label>
            <input type="text" name="color" value="#F9A602" required>
          </div>
          <div class="field">
            <label>Icon (Emoji or text)</label>
            <input type="text" name="icon" value="TR" required maxlength="2">
          </div>
          <button type="submit" class="btn btn-primary" id="btn-create-submit">
            <span>Create Team</span>
            <div class="spinner"></div>
          </button>
        </form>
      </div>

      <!-- Packages -->
      <div id="view-packages" class="view">
        <div class="section-title">${ICONS.box} Pre-built Packages</div>
        <div id="packages-grid" class="grid"></div>
      </div>

      <!-- Team Detail -->
      <div id="view-detail" class="view">
        <button class="btn btn-ghost" id="btn-detail-back" style="margin-bottom: 16px">${ICONS.back} Back to Teams</button>
        <div id="detail-content"></div>
      </div>
    </div>
  </div>
</div>

<!-- Add Member/Agent Dialog -->
<div class="dialog-overlay" id="dialog">
  <div class="dialog">
    <h3 id="dialog-title">Add to Team</h3>
    <form id="dialog-form">
      <div class="field">
        <label id="dialog-select-label">Select</label>
        <select name="selection" id="dialog-select" required></select>
      </div>
      <div class="field">
        <label>Role</label>
        <select name="role" required>
          <option value="member">Member (Human) / Worker (Agent)</option>
          <option value="admin">Admin (Human) / Orchestrator (Agent)</option>
        </select>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" id="dialog-cancel">Cancel</button>
        <button type="submit" class="btn btn-primary" id="dialog-submit">
          <span>Add</span>
          <div class="spinner"></div>
        </button>
      </div>
    </form>
  </div>
</div>
`;

export class ScTeams extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);
    
    const wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    while(wrapper.firstChild) this.shadowRoot.appendChild(wrapper.firstChild);

    this.userId = '';
    this.isAdmin = false;
    
    this.teams = [];
    this.packages = [];
    this.agents = [];
    this.activeTeam = null;

    this.$ = {
      nav: this.shadowRoot.getElementById('nav-menu'),
      closeBtn: this.shadowRoot.getElementById('btn-close'),
      teamsGrid: this.shadowRoot.getElementById('teams-grid'),
      packagesGrid: this.shadowRoot.getElementById('packages-grid'),
      detailContent: this.shadowRoot.getElementById('detail-content'),
      createForm: this.shadowRoot.getElementById('create-form'),
      btnDetailBack: this.shadowRoot.getElementById('btn-detail-back'),
      dialog: this.shadowRoot.getElementById('dialog'),
      dialogForm: this.shadowRoot.getElementById('dialog-form'),
      dialogSelect: this.shadowRoot.getElementById('dialog-select'),
      dialogTitle: this.shadowRoot.getElementById('dialog-title'),
      dialogSelectLabel: this.shadowRoot.getElementById('dialog-select-label'),
      dialogCancel: this.shadowRoot.getElementById('dialog-cancel'),
      dialogSubmit: this.shadowRoot.getElementById('dialog-submit')
    };

    this.currentDialogMode = ''; // 'member' or 'agent'
  }

  connectedCallback() {
    this.userId = this.getAttribute('userId') || '';
    this.isAdmin = this.hasAttribute('isAdmin');

    this.$.closeBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('teams-close', { bubbles: true, composed: true }));
    });

    this.$.nav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (btn) this.switchView(btn.dataset.target);
    });

    this.$.createForm.addEventListener('submit', (e) => this.handleCreate(e));
    this.$.btnDetailBack.addEventListener('click', () => this.switchView('my-teams'));
    
    this.$.dialogCancel.addEventListener('click', () => this.closeDialog());
    this.$.dialogForm.addEventListener('submit', (e) => this.handleDialogSubmit(e));

    this.loadData();
  }

  get authHeaders() {
    const token = localStorage.getItem('scratchy_token');
    return {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    };
  }

  async loadData() {
    this.switchView('loading');
    try {
      const [tRes, pRes, aRes] = await Promise.all([
        fetch('/api/teams', { headers: this.authHeaders }).catch(() => ({ ok: false })),
        fetch('/api/teams/packages', { headers: this.authHeaders }).catch(() => ({ ok: false })),
        fetch('/api/agents', { headers: this.authHeaders }).catch(() => ({ ok: false }))
      ]);

      if (tRes.ok) this.teams = await tRes.json();
      if (pRes.ok) this.packages = await pRes.json();
      if (aRes.ok) this.agents = await aRes.json();
      
    } catch (e) {
      console.error('Failed to load teams data', e);
    }
    
    this.renderTeams();
    this.renderPackages();
    this.switchView('my-teams');
  }

  switchView(targetId) {
    this.shadowRoot.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    this.shadowRoot.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    
    const view = this.shadowRoot.getElementById('view-' + targetId);
    if (view) view.classList.add('active');
    
    const navBtn = this.shadowRoot.querySelector('.nav-item[data-target="' + targetId + '"]');
    if (navBtn) navBtn.classList.add('active');
  }

  renderTeams() {
    this.$.teamsGrid.innerHTML = '';
    if (!this.teams.length) {
      this.$.teamsGrid.innerHTML = '<div style="color:var(--muted); padding: 20px;">No teams found.</div>';
      return;
    }

    this.teams.forEach(team => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-icon" style="background: ${team.color || 'var(--accent)'}">${team.icon || 'T'}</div>
          <div class="card-title">${this.esc(team.name)}</div>
        </div>
        <div class="card-desc">${this.esc(team.description || 'No description')}</div>
        <div class="card-meta">
          <span>${ICONS.user} ${team.members?.length || 0}</span>
          <span>${ICONS.bot} ${team.agents?.length || 0}</span>
        </div>
      `;
      card.addEventListener('click', () => this.openDetail(team.id));
      this.$.teamsGrid.appendChild(card);
    });
  }

  renderPackages() {
    this.$.packagesGrid.innerHTML = '';
    if (!this.packages.length) {
      this.$.packagesGrid.innerHTML = '<div style="color:var(--muted); padding: 20px;">No packages available.</div>';
      return;
    }

    this.packages.forEach(pkg => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="card-header">
          <div class="card-icon" style="background: var(--surface)">${pkg.icon || '📦'}</div>
          <div class="card-title">${this.esc(pkg.name)}</div>
        </div>
        <div class="card-desc">${this.esc(pkg.description)}</div>
        <div class="card-meta" style="flex-wrap: wrap">
          ${(pkg.agents || []).map(a => '<span class="badge">' + this.esc(a) + '</span>').join('')}
        </div>
        <button class="btn btn-ghost" style="margin-top:auto; width:100%">Create from Package</button>
      `;
      card.addEventListener('click', () => this.createFromPackage(pkg.key));
      this.$.packagesGrid.appendChild(card);
    });
  }

  async openDetail(teamId) {
    this.switchView('loading');
    try {
      const res = await fetch('/api/teams/' + teamId, { headers: this.authHeaders });
      if (res.ok) {
        this.activeTeam = await res.json();
        this.renderDetail();
        this.switchView('detail');
      } else {
        this.switchView('my-teams');
      }
    } catch (e) {
      this.switchView('my-teams');
    }
  }

  renderDetail() {
    const t = this.activeTeam;
    if (!t) return;

    let membersHtml = (t.members || []).map(m => {
      const name = m.displayName || m.username || m.name || m.userId || '?';
      return `
      <div class="list-row">
        <div class="list-info">
          <div class="avatar">${name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="list-name">${this.esc(name)}</div>
            <div class="badge ${m.role}">${this.esc(m.role)}</div>
          </div>
        </div>
        <button class="btn btn-ghost" data-action="remove-member" data-id="${m.userId}">${ICONS.trash}</button>
      </div>
    `}).join('');

    let agentsHtml = (t.agents || []).map(a => {
      const name = a.agentName || a.name || a.agentId || 'Agent';
      const avatar = a.avatar || name.charAt(0).toUpperCase();
      return `
      <div class="list-row">
        <div class="list-info">
          <div class="avatar" style="background:var(--surface-hover); color:var(--text)">${avatar}</div>
          <div>
            <div class="list-name">${this.esc(name)}</div>
            <div class="badge">${this.esc(a.role)}</div>
          </div>
        </div>
        <button class="btn btn-ghost" data-action="remove-agent" data-id="${a.agentId}">${ICONS.trash}</button>
      </div>
    `}).join('');

    this.$.detailContent.innerHTML = `
      <div class="detail-header">
        <div class="card-icon" style="background: ${t.color || 'var(--accent)'}; width:64px; height:64px; font-size: 32px;">${t.icon || 'T'}</div>
        <div>
          <h2 style="font-size:24px; margin-bottom:4px;">${this.esc(t.name)}</h2>
          <div style="color:var(--muted)">${this.esc(t.description)}</div>
        </div>
        <div class="detail-actions">
          <button class="btn btn-primary" id="btn-team-chat">${ICONS.chat} Chat</button>
          <button class="btn btn-danger" id="btn-team-delete">${ICONS.trash}</button>
        </div>
      </div>

      <div class="layout" style="grid-template-columns: 1fr 1fr">
        <div class="list-section">
          <div class="list-header">
            <h3>Members</h3>
            <button class="btn btn-ghost" id="btn-add-member">${ICONS.plus} Add</button>
          </div>
          <div>${membersHtml || '<div style="color:var(--muted)">No members</div>'}</div>
        </div>

        <div class="list-section">
          <div class="list-header">
            <h3>Agents</h3>
            <button class="btn btn-ghost" id="btn-add-agent">${ICONS.plus} Add</button>
          </div>
          <div>${agentsHtml || '<div style="color:var(--muted)">No agents</div>'}</div>
        </div>
      </div>
    `;

    this.$.detailContent.querySelector('#btn-team-chat').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('team-chat', {
        bubbles: true, composed: true,
        detail: { teamId: t.id, teamName: t.name, agentCount: (t.agents || []).length }
      }));
    });

    this.$.detailContent.querySelector('#btn-team-delete').addEventListener('click', () => this.deleteTeam(t.id));
    this.$.detailContent.querySelector('#btn-add-member').addEventListener('click', () => this.openAddDialog('member'));
    this.$.detailContent.querySelector('#btn-add-agent').addEventListener('click', () => this.openAddDialog('agent'));

    this.$.detailContent.querySelectorAll('[data-action="remove-member"]').forEach(b => {
      b.addEventListener('click', (e) => this.removeMember(e.currentTarget.dataset.id));
    });
    this.$.detailContent.querySelectorAll('[data-action="remove-agent"]').forEach(b => {
      b.addEventListener('click', (e) => this.removeAgent(e.currentTarget.dataset.id));
    });
  }

  async handleCreate(e) {
    e.preventDefault();
    const btn = this.$.createForm.querySelector('button[type="submit"]');
    btn.classList.add('loading');
    
    const formData = new FormData(this.$.createForm);
    const payload = Object.fromEntries(formData.entries());

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        this.$.createForm.reset();
        await this.loadData();
      }
    } catch (err) {
      console.error(err);
    }
    btn.classList.remove('loading');
  }

  async createFromPackage(pkgKey) {
    this.switchView('loading');
    try {
      const res = await fetch('/api/teams/packages/' + pkgKey, {
        method: 'POST',
        headers: this.authHeaders
      });
      if (res.ok) {
        const newTeam = await res.json();
        await this.loadData();
        this.openDetail(newTeam.id);
      } else {
        this.switchView('packages');
      }
    } catch (err) {
      this.switchView('packages');
    }
  }

  async deleteTeam(id) {
    if (!confirm('Are you sure you want to delete this team?')) return;
    try {
      await fetch('/api/teams/' + id, { method: 'DELETE', headers: this.authHeaders });
      this.activeTeam = null;
      await this.loadData();
    } catch (err) {
      console.error(err);
    }
  }

  openAddDialog(mode) {
    this.currentDialogMode = mode;
    this.$.dialogTitle.textContent = mode === 'member' ? 'Add Member' : 'Add Agent';
    this.$.dialogSelectLabel.textContent = mode === 'member' ? 'User ID / Email' : 'Select Agent';
    
    this.$.dialogSelect.innerHTML = '';
    if (mode === 'agent') {
      this.agents.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        this.$.dialogSelect.appendChild(opt);
      });
    } else {
      // Free form input fallback using a prompt or a generic input instead of select
      // But specs say simple dropdown is ok. We'll use an input disguised in the DOM if needed.
      // To keep it simple, if member, morph select to input
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'selection';
      input.id = 'dialog-select';
      input.required = true;
      input.placeholder = 'Enter user ID';
      this.$.dialogSelect.parentNode.replaceChild(input, this.$.dialogSelect);
      this.$.dialogSelect = input;
    }

    this.$.dialog.classList.add('open');
  }

  closeDialog() {
    this.$.dialog.classList.remove('open');
    this.$.dialogForm.reset();
    
    // Restore select if it was changed
    if (this.$.dialogSelect.tagName === 'INPUT') {
      const select = document.createElement('select');
      select.name = 'selection';
      select.id = 'dialog-select';
      select.required = true;
      this.$.dialogSelect.parentNode.replaceChild(select, this.$.dialogSelect);
      this.$.dialogSelect = select;
    }
  }

  async handleDialogSubmit(e) {
    e.preventDefault();
    if (!this.activeTeam) return;

    this.$.dialogSubmit.classList.add('loading');
    const formData = new FormData(this.$.dialogForm);
    const selection = formData.get('selection');
    const role = formData.get('role');

    const endpoint = this.currentDialogMode === 'member' 
      ? '/api/teams/' + this.activeTeam.id + '/members'
      : '/api/teams/' + this.activeTeam.id + '/agents';

    const payload = this.currentDialogMode === 'member'
      ? { userId: selection, role }
      : { agentId: selection, role };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: this.authHeaders,
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        this.closeDialog();
        this.openDetail(this.activeTeam.id);
      }
    } catch (err) {
      console.error(err);
    }
    this.$.dialogSubmit.classList.remove('loading');
  }

  async removeMember(userId) {
    if (!this.activeTeam) return;
    try {
      await fetch('/api/teams/' + this.activeTeam.id + '/members/' + userId, {
        method: 'DELETE',
        headers: this.authHeaders
      });
      this.openDetail(this.activeTeam.id);
    } catch (err) {
      console.error(err);
    }
  }

  async removeAgent(agentId) {
    if (!this.activeTeam) return;
    try {
      await fetch('/api/teams/' + this.activeTeam.id + '/agents/' + agentId, {
        method: 'DELETE',
        headers: this.authHeaders
      });
      this.openDetail(this.activeTeam.id);
    } catch (err) {
      console.error(err);
    }
  }

  esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

customElements.define('sc-teams', ScTeams);
