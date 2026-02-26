/**
 * Scratchy v2 — Admin Panel Web Component
 * <sc-admin> — Full admin dashboard with tabbed layout
 *
 * Tabs: Dashboard | Users | Agents | Config | Deploy
 * Fetches data from /api/admin/* routes.
 * Self-contained shadow DOM, dark theme, Geist font, indigo accent.
 */

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const STYLES = `
  :host {
    display: block;
    width: 100%;
    height: 100%;
    font-family: var(--sc-font, 'Geist', system-ui, -apple-system, sans-serif);
    color: var(--sc-text, #e4e4e7);
    background: var(--sc-bg, #0a0a0f);
    overflow-y: auto;
    line-height: 1.5;
    font-size: 14px;
  }

  *, *::before, *::after { box-sizing: border-box; }

  /* Tab bar */
  .tab-bar {
    display: flex;
    gap: 2px;
    padding: 16px 24px 0;
    border-bottom: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    background: var(--sc-surface, #111118);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .tab-btn {
    padding: 10px 18px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--sc-text-muted, #71717a);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .tab-btn:hover { color: var(--sc-text, #e4e4e7); }

  .tab-btn.active {
    color: var(--sc-accent, #6366f1);
    border-bottom-color: var(--sc-accent, #6366f1);
  }

  /* Content area */
  .tab-content {
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* Cards */
  .card {
    background: var(--sc-surface, #111118);
    border: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 16px;
  }

  .card h3 {
    margin: 0 0 14px;
    font-size: 15px;
    font-weight: 600;
    color: var(--sc-text, #e4e4e7);
  }

  /* Stats grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .stat-card {
    background: var(--sc-surface, #111118);
    border: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    border-radius: 10px;
    padding: 18px 20px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--sc-text-muted, #71717a);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--sc-text, #e4e4e7);
    line-height: 1.1;
  }

  .stat-sub {
    font-size: 12px;
    color: var(--sc-text-muted, #71717a);
    margin-top: 4px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  thead th {
    text-align: left;
    padding: 10px 12px;
    font-weight: 500;
    color: var(--sc-text-muted, #71717a);
    border-bottom: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--sc-border, rgba(255,255,255,0.03));
    vertical-align: middle;
  }

  tbody tr:hover { background: rgba(99,102,241,0.04); }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .badge-admin { background: rgba(239,68,68,0.15); color: #f87171; }
  .badge-user  { background: rgba(99,102,241,0.15); color: #818cf8; }
  .badge-free  { background: rgba(113,113,122,0.15); color: #a1a1aa; }
  .badge-pro   { background: rgba(99,102,241,0.15); color: #818cf8; }
  .badge-team  { background: rgba(34,197,94,0.15); color: #4ade80; }
  .badge-byok  { background: rgba(251,191,36,0.15); color: #fbbf24; }
  .badge-enterprise { background: rgba(168,85,247,0.15); color: #c084fc; }
  .badge-enabled  { background: rgba(34,197,94,0.15); color: #4ade80; }
  .badge-disabled { background: rgba(239,68,68,0.15); color: #f87171; }

  /* Search */
  .search-bar {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
    align-items: center;
  }

  .search-input {
    flex: 1;
    max-width: 360px;
    background: var(--sc-bg, #0a0a0f);
    border: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    border-radius: 8px;
    color: var(--sc-text, #e4e4e7);
    font-family: inherit;
    font-size: 13px;
    padding: 8px 12px;
    outline: none;
    transition: border-color 0.15s;
  }

  .search-input:focus { border-color: var(--sc-accent, #6366f1); }
  .search-input::placeholder { color: var(--sc-text-muted, #71717a); opacity: 0.6; }

  /* Buttons */
  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .btn-primary {
    background: var(--sc-accent, #6366f1);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) { background: #4f46e5; }

  .btn-ghost {
    background: rgba(255,255,255,0.04);
    color: var(--sc-text, #e4e4e7);
    border: 1px solid var(--sc-border, rgba(255,255,255,0.06));
  }
  .btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.08); }

  .btn-danger {
    background: rgba(239,68,68,0.15);
    color: #f87171;
  }
  .btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.25); }

  .btn-sm { padding: 5px 10px; font-size: 12px; }

  /* Inline select */
  .inline-select {
    background: var(--sc-bg, #0a0a0f);
    border: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    border-radius: 6px;
    color: var(--sc-text, #e4e4e7);
    font-family: inherit;
    font-size: 12px;
    padding: 3px 6px;
    outline: none;
    cursor: pointer;
  }

  .inline-select:focus { border-color: var(--sc-accent, #6366f1); }

  /* Usage bar */
  .usage-bar {
    width: 80px;
    height: 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
    overflow: hidden;
    display: inline-block;
    vertical-align: middle;
    margin-right: 6px;
  }

  .usage-bar-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--sc-accent, #6366f1);
    transition: width 0.3s;
  }

  /* Gauge */
  .gauge-container {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 0;
  }

  .gauge-ring {
    width: 80px;
    height: 80px;
    position: relative;
  }

  .gauge-ring svg { transform: rotate(-90deg); }

  .gauge-ring .gauge-label {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
  }

  /* Sparkline (mini chart via canvas) */
  .sparkline-canvas {
    display: block;
    width: 100%;
    height: 60px;
  }

  /* KV editor */
  .kv-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    align-items: center;
  }

  .kv-key, .kv-value {
    background: var(--sc-bg, #0a0a0f);
    border: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    border-radius: 6px;
    color: var(--sc-text, #e4e4e7);
    font-family: inherit;
    font-size: 13px;
    padding: 7px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  .kv-key { width: 200px; }
  .kv-value { flex: 1; }

  .kv-key:focus, .kv-value:focus { border-color: var(--sc-accent, #6366f1); }

  /* Modal overlay */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--sc-surface, #111118);
    border: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    border-radius: 12px;
    padding: 28px;
    width: 90%;
    max-width: 560px;
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal h3 {
    margin: 0 0 18px;
    font-size: 17px;
    font-weight: 600;
  }

  .modal .field {
    margin-bottom: 14px;
  }

  .modal .field label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: var(--sc-text-muted, #71717a);
    margin-bottom: 5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .modal .field input,
  .modal .field textarea,
  .modal .field select {
    width: 100%;
    background: var(--sc-bg, #0a0a0f);
    border: 1px solid var(--sc-border, rgba(255,255,255,0.06));
    border-radius: 8px;
    color: var(--sc-text, #e4e4e7);
    font-family: inherit;
    font-size: 13px;
    padding: 9px 12px;
    outline: none;
    transition: border-color 0.15s;
  }

  .modal .field input:focus,
  .modal .field textarea:focus,
  .modal .field select:focus {
    border-color: var(--sc-accent, #6366f1);
  }

  .modal .field textarea { min-height: 120px; resize: vertical; }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 20px;
  }

  /* Deploy section */
  .deploy-status {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .version-tag {
    font-family: 'Geist Mono', 'SF Mono', monospace;
    background: rgba(99,102,241,0.1);
    color: #818cf8;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
  }

  .version-staged {
    background: rgba(251,191,36,0.1);
    color: #fbbf24;
  }

  /* Loading / empty state */
  .loading, .empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--sc-text-muted, #71717a);
    font-size: 13px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: var(--sc-accent, #6366f1);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin: 0 auto 12px;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* Responsive */
  @media (max-width: 640px) {
    .tab-bar { padding: 12px 12px 0; overflow-x: auto; }
    .tab-btn { padding: 8px 12px; font-size: 12px; }
    .tab-content { padding: 16px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
`;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export class ScAdmin extends HTMLElement {
  /** @type {ShadowRoot} */
  #shadow;

  /** @type {string} Current active tab */
  #activeTab = 'dashboard';

  /** @type {Record<string, any>} Cached data per tab */
  #data = {};

  /** @type {AbortController|null} */
  #fetchController = null;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.#render();
    this.#loadTab('dashboard');
  }

  disconnectedCallback() {
    this.#fetchController?.abort();
  }

  /* ---------------------------------------------------------------- */
  /*  Auth helper                                                     */
  /* ---------------------------------------------------------------- */

  /** Get the stored auth token. */
  #getToken() {
    return localStorage.getItem('scratchy_token') || '';
  }

  /**
   * Authenticated fetch wrapper.
   * @param {string} url
   * @param {RequestInit} [opts]
   * @returns {Promise<any>}
   */
  async #apiFetch(url, opts = {}) {
    this.#fetchController?.abort();
    this.#fetchController = new AbortController();

    const res = await fetch(url, {
      ...opts,
      signal: this.#fetchController.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.#getToken()}`,
        ...opts.headers,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  /* ---------------------------------------------------------------- */
  /*  Rendering                                                       */
  /* ---------------------------------------------------------------- */

  #render() {
    const tabs = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'users',     label: 'Users' },
      { id: 'agents',    label: 'Agents' },
      { id: 'config',    label: 'Config' },
      { id: 'deploy',    label: 'Deploy' },
    ];

    this.#shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="tab-bar">
        ${tabs.map(t => `
          <button class="tab-btn ${t.id === this.#activeTab ? 'active' : ''}" data-tab="${t.id}">
            ${t.label}
          </button>
        `).join('')}
      </div>
      <div class="tab-content">
        ${tabs.map(t => `
          <div class="tab-panel ${t.id === this.#activeTab ? 'active' : ''}" id="panel-${t.id}">
            <div class="loading"><div class="spinner"></div>Loading…</div>
          </div>
        `).join('')}
      </div>
    `;

    // Tab click handlers
    this.#shadow.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === this.#activeTab) return;
        this.#switchTab(tab);
      });
    });
  }

  /**
   * Switch to a tab and load its data.
   * @param {string} tabId
   */
  #switchTab(tabId) {
    // Update tab buttons
    this.#shadow.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update panels
    this.#shadow.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${tabId}`);
    });

    this.#activeTab = tabId;
    this.#loadTab(tabId);
  }

  /**
   * Load data for a tab and render its content.
   * @param {string} tabId
   */
  async #loadTab(tabId) {
    const panel = this.#shadow.getElementById(`panel-${tabId}`);
    if (!panel) return;

    panel.innerHTML = '<div class="loading"><div class="spinner"></div>Loading…</div>';

    try {
      switch (tabId) {
        case 'dashboard': await this.#loadDashboard(panel); break;
        case 'users':     await this.#loadUsers(panel);     break;
        case 'agents':    await this.#loadAgents(panel);    break;
        case 'config':    await this.#loadConfig(panel);    break;
        case 'deploy':    await this.#loadDeploy(panel);    break;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      panel.innerHTML = `<div class="empty">Error: ${this.#esc(err.message)}</div>`;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Dashboard tab                                                   */
  /* ---------------------------------------------------------------- */

  async #loadDashboard(panel) {
    const stats = await this.#apiFetch('/api/admin/stats');
    this.#data.stats = stats;

    const mem = stats.memoryUsage || {};
    const heapMB = ((mem.heapUsed || 0) / 1024 / 1024).toFixed(1);
    const rssMB = ((mem.rss || 0) / 1024 / 1024).toFixed(1);

    panel.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total Users</div>
          <div class="stat-value">${stats.totalUsers}</div>
          <div class="stat-sub">${stats.activeToday} active today</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Messages Today</div>
          <div class="stat-value">${this.#formatNum(stats.messagesToday)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Tokens Today</div>
          <div class="stat-value">${this.#formatNum(stats.tokensToday)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Est. MRR</div>
          <div class="stat-value">${this.#formatCurrency(stats.estimatedMRR)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Agents</div>
          <div class="stat-value">${stats.enabledAgents}<span style="font-size:14px;color:#71717a">/${stats.totalAgents}</span></div>
          <div class="stat-sub">enabled / total</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Memory</div>
          <div class="stat-value" style="font-size:22px">${heapMB} MB</div>
          <div class="stat-sub">heap (${rssMB} MB RSS)</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="card">
          <h3>Active Sessions</h3>
          <div class="gauge-container">
            <div class="gauge-ring" id="sessions-gauge"></div>
            <div>
              <div style="font-size:24px;font-weight:700">${stats.activeSessions}</div>
              <div style="font-size:12px;color:#71717a">${stats.wsConnections} WebSocket</div>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>Plan Distribution</h3>
          <div id="plan-breakdown"></div>
        </div>
      </div>

      <div class="card">
        <h3>Usage (Last 7 Days)</h3>
        <canvas class="sparkline-canvas" id="usage-chart"></canvas>
      </div>
    `;

    // Render gauge
    this.#renderGauge(
      panel.querySelector('#sessions-gauge'),
      stats.activeSessions,
      Math.max(stats.activeSessions * 2, 20)
    );

    // Render plan breakdown
    this.#renderPlanBreakdown(
      panel.querySelector('#plan-breakdown'),
      stats.planBreakdown || []
    );

    // Render sparkline
    this.#renderSparkline(
      panel.querySelector('#usage-chart'),
      stats.weeklyUsage || []
    );
  }

  /**
   * Render an SVG gauge ring.
   * @param {HTMLElement} container
   * @param {number} value
   * @param {number} max
   */
  #renderGauge(container, value, max) {
    if (!container) return;
    const pct = Math.min(value / max, 1);
    const r = 34;
    const circ = 2 * Math.PI * r;
    const dash = circ * pct;

    container.innerHTML = `
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6"/>
        <circle cx="40" cy="40" r="${r}" fill="none" stroke="#6366f1" stroke-width="6"
          stroke-dasharray="${dash} ${circ}" stroke-linecap="round"/>
      </svg>
      <div class="gauge-label">${value}</div>
    `;
  }

  /**
   * Render plan breakdown as stacked bar segments.
   * @param {HTMLElement} container
   * @param {Array<{plan: string, count: number}>} breakdown
   */
  #renderPlanBreakdown(container, breakdown) {
    if (!container) return;
    const colors = { free: '#71717a', pro: '#6366f1', team: '#22c55e', byok: '#fbbf24', enterprise: '#a855f7' };
    const total = breakdown.reduce((s, b) => s + b.count, 0) || 1;

    let html = '<div style="display:flex;height:28px;border-radius:6px;overflow:hidden;margin-bottom:12px">';
    for (const b of breakdown) {
      const pct = (b.count / total * 100).toFixed(1);
      const color = colors[b.plan] || '#52525b';
      html += `<div style="width:${pct}%;background:${color};min-width:${b.count > 0 ? '4px' : '0'}" title="${b.plan}: ${b.count}"></div>`;
    }
    html += '</div>';

    html += '<div style="display:flex;flex-wrap:wrap;gap:12px">';
    for (const b of breakdown) {
      const color = colors[b.plan] || '#52525b';
      html += `<div style="display:flex;align-items:center;gap:5px;font-size:12px">
        <div style="width:8px;height:8px;border-radius:2px;background:${color}"></div>
        ${b.plan}: ${b.count}
      </div>`;
    }
    html += '</div>';

    container.innerHTML = html;
  }

  /**
   * Render a usage sparkline on a canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {Array<{date: string, messages: number, tokens: number}>} data
   */
  #renderSparkline(canvas, data) {
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = 4;

    // Draw messages line
    const maxVal = Math.max(...data.map(d => d.messages), 1);
    const step = (w - pad * 2) / Math.max(data.length - 1, 1);

    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = pad + i * step;
      const y = h - pad - (d.messages / maxVal) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill area under curve
    const lastX = pad + (data.length - 1) * step;
    ctx.lineTo(lastX, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(99,102,241,0.2)');
    grad.addColorStop(1, 'rgba(99,102,241,0.01)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Day labels
    ctx.fillStyle = '#71717a';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      if (i === 0 || i === data.length - 1 || data.length <= 7) {
        const x = pad + i * step;
        ctx.fillText(d.date.slice(5), x, h - 1);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Users tab                                                       */
  /* ---------------------------------------------------------------- */

  async #loadUsers(panel, search = '') {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    params.set('limit', '100');

    const data = await this.#apiFetch(`/api/admin/users?${params}`);
    this.#data.users = data;

    const userRows = (data.users || []).map((u) => {
      const plan = u.plan || 'free';
      const planQuotas = u.planDetails?.quotas || { messagesPerDay: 50, tokensPerDay: 100000 };
      const msgPct = Math.min((u.usage?.messages || 0) / planQuotas.messagesPerDay * 100, 100);

      return `
        <tr data-user-id="${this.#esc(u.id)}">
          <td>
            <strong>${this.#esc(u.displayName || u.username)}</strong>
            <div style="font-size:11px;color:#71717a">@${this.#esc(u.username)}</div>
          </td>
          <td><span class="badge badge-${this.#esc(u.role)}">${this.#esc(u.role)}</span></td>
          <td>
            <select class="inline-select" data-field="plan" data-user-id="${this.#esc(u.id)}">
              ${['free','pro','team','byok','enterprise'].map(p =>
                `<option value="${p}" ${p === plan ? 'selected' : ''}>${p}</option>`
              ).join('')}
            </select>
          </td>
          <td>
            <div class="usage-bar"><div class="usage-bar-fill" style="width:${msgPct}%"></div></div>
            <span style="font-size:12px">${u.usage?.messages || 0} msgs</span>
          </td>
          <td style="font-size:12px;color:#71717a">${this.#timeAgo(u.lastActive)}</td>
          <td>
            <button class="btn btn-sm btn-danger" data-action="delete-user" data-user-id="${this.#esc(u.id)}">
              Delete
            </button>
          </td>
        </tr>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="search-bar">
        <input class="search-input" type="text" placeholder="Search users…" id="user-search" value="${this.#esc(search)}">
        <span style="font-size:12px;color:#71717a">${data.total || 0} total</span>
      </div>
      <div class="card" style="padding:0;overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Plan</th>
              <th>Usage Today</th>
              <th>Last Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${userRows || '<tr><td colspan="6" class="empty">No users found</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    // Search handler
    const searchInput = panel.querySelector('#user-search');
    let debounce;
    searchInput?.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.#loadUsers(panel, searchInput.value.trim());
      }, 300);
    });

    // Plan change handler
    panel.querySelectorAll('select[data-field="plan"]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const userId = sel.dataset.userId;
        try {
          await this.#apiFetch(`/api/admin/users/${userId}`, {
            method: 'PATCH',
            body: JSON.stringify({ plan: sel.value }),
          });
        } catch (err) {
          alert('Failed to update plan: ' + err.message);
          this.#loadUsers(panel, searchInput?.value?.trim());
        }
      });
    });

    // Delete handler
    panel.querySelectorAll('[data-action="delete-user"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.userId;
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
          await this.#apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
          this.#loadUsers(panel, searchInput?.value?.trim());
        } catch (err) {
          alert('Failed to delete user: ' + err.message);
        }
      });
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Agents tab                                                      */
  /* ---------------------------------------------------------------- */

  async #loadAgents(panel) {
    const agentList = await this.#apiFetch('/api/admin/agents');
    this.#data.agents = agentList;

    const rows = agentList.map((a) => `
      <tr>
        <td>
          <strong>${this.#esc(a.name)}</strong>
          <div style="font-size:11px;color:#71717a;font-family:monospace">${this.#esc(a.id?.slice(0, 8))}…</div>
        </td>
        <td style="font-family:monospace;font-size:12px">${this.#esc(a.model || 'sonnet')}</td>
        <td><span class="badge badge-${a.enabled ? 'enabled' : 'disabled'}">${a.enabled ? 'enabled' : 'disabled'}</span></td>
        <td>${a.isBuiltin ? '<span style="color:#71717a;font-size:12px">builtin</span>' : '<span style="font-size:12px">custom</span>'}</td>
        <td style="font-size:12px;color:#71717a">T=${a.temperature ?? 0.7}</td>
        <td>
          <button class="btn btn-sm btn-ghost" data-action="edit-agent" data-agent-id="${this.#esc(a.id)}">
            Edit
          </button>
        </td>
      </tr>
    `).join('');

    panel.innerHTML = `
      <div class="card" style="padding:0;overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Model</th>
              <th>Status</th>
              <th>Type</th>
              <th>Temp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" class="empty">No agents configured</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    // Edit handler
    panel.querySelectorAll('[data-action="edit-agent"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const agentId = btn.dataset.agentId;
        const agent = agentList.find(a => a.id === agentId);
        if (agent) this.#showAgentModal(agent);
      });
    });
  }

  /**
   * Show agent edit modal.
   * @param {Record<string, any>} agent
   */
  #showAgentModal(agent) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Edit Agent: ${this.#esc(agent.name)}</h3>
        <div class="field">
          <label>Name</label>
          <input type="text" id="agent-name" value="${this.#esc(agent.name)}">
        </div>
        <div class="field">
          <label>Model</label>
          <input type="text" id="agent-model" value="${this.#esc(agent.model || 'sonnet')}" placeholder="sonnet, opus, etc.">
        </div>
        <div class="field">
          <label>Temperature</label>
          <input type="number" id="agent-temp" value="${agent.temperature ?? 0.7}" min="0" max="2" step="0.1">
        </div>
        <div class="field">
          <label>System Prompt</label>
          <textarea id="agent-prompt">${this.#esc(agent.systemPrompt || '')}</textarea>
        </div>
        <div class="field">
          <label>Enabled</label>
          <select id="agent-enabled">
            <option value="true" ${agent.enabled ? 'selected' : ''}>Yes</option>
            <option value="false" ${!agent.enabled ? 'selected' : ''}>No</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="modal-save">Save Changes</button>
        </div>
      </div>
    `;

    this.#shadow.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());

    overlay.querySelector('#modal-save').addEventListener('click', async () => {
      const patch = {
        name: overlay.querySelector('#agent-name').value.trim(),
        model: overlay.querySelector('#agent-model').value.trim(),
        temperature: parseFloat(overlay.querySelector('#agent-temp').value),
        systemPrompt: overlay.querySelector('#agent-prompt').value,
        enabled: overlay.querySelector('#agent-enabled').value === 'true',
      };

      try {
        await this.#apiFetch(`/api/admin/agents/${agent.id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        overlay.remove();
        this.#loadTab('agents');
      } catch (err) {
        alert('Failed to update agent: ' + err.message);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Config tab                                                      */
  /* ---------------------------------------------------------------- */

  async #loadConfig(panel) {
    const config = await this.#apiFetch('/api/admin/config');
    this.#data.config = config;

    const entries = Object.entries(config);

    const kvRows = entries.map(([key, value]) => `
      <div class="kv-row" data-key="${this.#esc(key)}">
        <input class="kv-key" value="${this.#esc(key)}" readonly>
        <input class="kv-value" value="${this.#esc(String(value))}" data-original="${this.#esc(String(value))}">
        <button class="btn btn-sm btn-ghost kv-save" style="display:none">Save</button>
      </div>
    `).join('');

    panel.innerHTML = `
      <div class="card">
        <h3>Server Configuration</h3>
        <p style="font-size:12px;color:#71717a;margin-top:-8px;margin-bottom:16px">
          Edit values below. Sensitive fields are redacted. ${entries.length} key(s).
        </p>
        <div id="kv-list">
          ${kvRows || '<div class="empty">No configuration keys found</div>'}
        </div>
        <div style="margin-top:16px;display:flex;gap:8px">
          <input class="search-input" id="new-key" placeholder="New key" style="max-width:200px">
          <input class="search-input" id="new-value" placeholder="Value" style="max-width:none;flex:1">
          <button class="btn btn-primary btn-sm" id="add-config">Add</button>
        </div>
      </div>
    `;

    // Show save button on value change
    panel.querySelectorAll('.kv-value').forEach((input) => {
      input.addEventListener('input', () => {
        const saveBtn = input.parentElement.querySelector('.kv-save');
        const changed = input.value !== input.dataset.original;
        saveBtn.style.display = changed ? '' : 'none';
      });
    });

    // Save individual config value
    panel.querySelectorAll('.kv-save').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.kv-row');
        const key = row.dataset.key;
        const value = row.querySelector('.kv-value').value;

        try {
          let parsed;
          try { parsed = JSON.parse(value); } catch { parsed = value; }
          await this.#apiFetch('/api/admin/config', {
            method: 'PATCH',
            body: JSON.stringify({ [key]: parsed }),
          });
          btn.style.display = 'none';
          row.querySelector('.kv-value').dataset.original = value;
        } catch (err) {
          alert('Failed to save config: ' + err.message);
        }
      });
    });

    // Add new config key
    panel.querySelector('#add-config')?.addEventListener('click', async () => {
      const keyInput = panel.querySelector('#new-key');
      const valInput = panel.querySelector('#new-value');
      const key = keyInput.value.trim();
      const rawVal = valInput.value;

      if (!key) return alert('Key is required');

      try {
        let parsed;
        try { parsed = JSON.parse(rawVal); } catch { parsed = rawVal; }
        await this.#apiFetch('/api/admin/config', {
          method: 'PATCH',
          body: JSON.stringify({ [key]: parsed }),
        });
        keyInput.value = '';
        valInput.value = '';
        this.#loadTab('config');
      } catch (err) {
        alert('Failed to add config: ' + err.message);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Deploy tab                                                      */
  /* ---------------------------------------------------------------- */

  async #loadDeploy(panel) {
    const status = await this.#apiFetch('/api/admin/deploy/status');
    this.#data.deploy = status;

    const uptimeStr = this.#formatUptime(status.uptime || 0);

    panel.innerHTML = `
      <div class="card">
        <h3>Deployment Status</h3>
        <div class="deploy-status">
          <span style="font-size:13px;color:#71717a">Current Version</span>
          <span class="version-tag">${this.#esc(status.current || 'unknown')}</span>
        </div>
        <div class="deploy-status">
          <span style="font-size:13px;color:#71717a">Staged Version</span>
          ${status.staged
            ? `<span class="version-tag version-staged">${this.#esc(status.staged)}</span>`
            : '<span style="font-size:13px;color:#52525b">none</span>'
          }
        </div>
        ${status.needsDeploy
          ? '<div style="margin:12px 0;padding:10px 14px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:8px;font-size:13px;color:#fbbf24">⚠ A new version is staged and ready to deploy.</div>'
          : ''
        }
        <div style="margin-top:8px;font-size:12px;color:#71717a">Server uptime: ${uptimeStr}</div>
      </div>

      <div class="card">
        <h3>Stage New Version</h3>
        <p style="font-size:12px;color:#71717a;margin-top:-8px;margin-bottom:14px">
          Write a version tag to .version-staged. Deployment tooling will pick it up.
        </p>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="search-input" id="stage-version" placeholder="e.g. 2.0.0-beta.1" style="max-width:280px">
          <button class="btn btn-primary" id="stage-btn">Stage Version</button>
        </div>
        <div id="stage-result" style="margin-top:10px;font-size:13px"></div>
      </div>
    `;

    panel.querySelector('#stage-btn')?.addEventListener('click', async () => {
      const input = panel.querySelector('#stage-version');
      const result = panel.querySelector('#stage-result');
      const version = input.value.trim();

      if (!version) {
        result.innerHTML = '<span style="color:#f87171">Version tag is required</span>';
        return;
      }

      try {
        const res = await this.#apiFetch('/api/admin/deploy/stage', {
          method: 'POST',
          body: JSON.stringify({ version }),
        });
        result.innerHTML = `<span style="color:#4ade80">✓ Staged version: ${this.#esc(res.staged)}</span>`;
        input.value = '';
        // Refresh status after a moment
        setTimeout(() => this.#loadDeploy(panel), 500);
      } catch (err) {
        result.innerHTML = `<span style="color:#f87171">${this.#esc(err.message)}</span>`;
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Utility methods                                                 */
  /* ---------------------------------------------------------------- */

  /**
   * Escape HTML special characters.
   * @param {string} str
   * @returns {string}
   */
  #esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Format a large number with K/M suffixes.
   * @param {number} n
   * @returns {string}
   */
  #formatNum(n) {
    if (n == null) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  /**
   * Format cents to EUR currency string.
   * @param {number} cents
   * @returns {string}
   */
  #formatCurrency(cents) {
    if (!cents) return '€0';
    return '€' + (cents / 100).toFixed(0);
  }

  /**
   * Format a date string as relative time ago.
   * @param {string} dateStr
   * @returns {string}
   */
  #timeAgo(dateStr) {
    if (!dateStr) return 'never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  /**
   * Format uptime seconds as human-readable.
   * @param {number} secs
   * @returns {string}
   */
  #formatUptime(secs) {
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
  }

  /**
   * Refresh the current tab data.
   * Can be called externally: document.querySelector('sc-admin').refresh()
   */
  refresh() {
    this.#loadTab(this.#activeTab);
  }
}

customElements.define('sc-admin', ScAdmin);
