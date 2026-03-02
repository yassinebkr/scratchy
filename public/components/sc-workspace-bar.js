// sc-workspace-bar.js — Scratchy v2 bottom dock bar
// Replaces sc-surface-toolbar.js with a macOS-dock-style workspace bar.

const template = document.createElement('template');
template.innerHTML = /* html */ `
<style>
  /* ───────── Host & Reset ───────── */
  :host {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 0;
    z-index: var(--sc-z-bar, 40);
    pointer-events: none;
    font-family: var(--sc-font, system-ui, -apple-system, sans-serif);
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ───────── Bar Shell ───────── */
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 48px;
    max-width: none;
    margin: 0;
    padding: 0 10px;
    background: var(--sc-glass-bg-heavy, rgba(26, 22, 16, 0.95));
    backdrop-filter: var(--sc-glass-blur, blur(20px));
    -webkit-backdrop-filter: var(--sc-glass-blur, blur(20px));
    border: 1px solid rgba(249, 166, 2, 0.08);
    border-radius: 0;
    pointer-events: auto;
    box-shadow: 0 4px 32px rgba(0, 0, 0, 0.4),
                0 0 0 0.5px rgba(249, 166, 2, 0.04) inset;
    transition: box-shadow 0.2s ease;
  }

  /* ───────── Agent Section ───────── */
  .agent {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 6px;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    transition: background 0.15s ease;
    flex-shrink: 0;
  }
  .agent:hover { background: rgba(249, 166, 2, 0.08); }
  .agent:active { background: rgba(249, 166, 2, 0.14); }

  .avatar {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.02em;
    flex-shrink: 0;
    text-transform: uppercase;
  }
  .avatar .status-dot {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--sc-success, #22c55e);
    border: 2px solid var(--sc-glass-bg, rgba(26, 22, 16, 0.85));
  }

  .agent-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .agent-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--sc-text, #e8e0d2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }
  .agent-role {
    font-size: 10.5px;
    color: var(--sc-text-muted, #8a7e6e);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .chevron {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    color: var(--sc-text-muted, #8a7e6e);
    transition: transform 0.15s ease;
  }
  .agent:hover .chevron { color: var(--sc-text, #e8e0d2); }

  /* ───────── Divider ───────── */
  .divider {
    width: 1px;
    height: 24px;
    background: var(--sc-border, rgba(249, 166, 2, 0.12));
    flex-shrink: 0;
    margin: 0 4px;
  }

  /* ───────── Surface Pills ───────── */
  .surfaces {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .pill {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--sc-text-dim, #5a5040);
    cursor: pointer;
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 500;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease;
    position: relative;
  }
  .pill:hover {
    background: rgba(249, 166, 2, 0.06);
    color: var(--sc-text, #e8e0d2);
  }
  .pill:active {
    background: rgba(249, 166, 2, 0.12);
  }
  .pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(249,166,2,0.35);
  }
  .pill[aria-pressed="true"] {
    background: rgba(249, 166, 2, 0.10);
    color: var(--sc-accent, #F9A602);
  }
  .pill[aria-pressed="true"] svg {
    color: var(--sc-accent, #F9A602);
  }
  /* Active dot indicator under pill */
  .pill[aria-pressed="true"]::after {
    content: '';
    position: absolute;
    bottom: 3px;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--sc-accent, #F9A602);
  }

  .pill svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }

  .pill .shortcut {
    font-size: 10px;
    color: var(--sc-text-muted, #8a7e6e);
    opacity: 0;
    transition: opacity 0.15s ease;
    margin-left: 2px;
    pointer-events: none;
  }
  .pill:hover .shortcut { opacity: 0.7; }

  .pill .pill-label {
    pointer-events: none;
  }

  /* ───────── Activity Indicator ───────── */
  .activity {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    height: 34px;
    flex-shrink: 0;
  }
  .activity[data-state="idle"] { display: none; }

  .activity-visual {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .activity-text {
    font-size: 11.5px;
    color: var(--sc-text-muted, #8a7e6e);
    white-space: nowrap;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Thinking — 3 pulsing dots */
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--sc-accent, #F9A602);
    animation: dotPulse 1.4s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.16s; }
  .dot:nth-child(3) { animation-delay: 0.32s; }

  @keyframes dotPulse {
    0%, 80%, 100% {
      transform: scale(0.8);
      opacity: 0.25;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  /* Coding — blinking cursor */
  .cursor-block {
    width: 8px;
    height: 14px;
    background: var(--sc-accent, #F9A602);
    border-radius: 1px;
    animation: cursorBlink 1s step-end infinite;
  }

  @keyframes cursorBlink {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0; }
  }

  /* Searching — spinning icon */
  .spinner {
    width: 14px;
    height: 14px;
    animation: spin 0.8s linear infinite;
    color: var(--sc-accent, #F9A602);
  }
  .spinner svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    fill: none;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Error — red pulsing dot */
  .error-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sc-danger, #ef4444);
    animation: errorPulse 0.6s ease-in-out 3;
  }

  @keyframes errorPulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(239, 68, 68, 0);
    }
  }

  /* ───────── Spacer ───────── */
  .spacer { flex: 1; min-width: 0; }

  /* ───────── Command Palette ───────── */
  .cmd-palette {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--sc-border, rgba(249, 166, 2, 0.12));
    border-radius: 8px;
    background: transparent;
    color: var(--sc-text-muted, #8a7e6e);
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    flex-shrink: 0;
  }
  .cmd-palette:hover {
    background: rgba(249, 166, 2, 0.08);
    color: var(--sc-text, #e8e0d2);
    border-color: rgba(249, 166, 2, 0.2);
  }
  .cmd-palette:active {
    background: rgba(249, 166, 2, 0.14);
  }
  .cmd-palette svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
    flex-shrink: 0;
  }
  .cmd-badge {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    opacity: 0.7;
  }

  /* ───────── Connection Status ───────── */
  .conn-status {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    padding: 0 4px;
  }
  .conn-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sc-danger, #ef4444);
    transition: background 0.3s ease;
  }
  .conn-status[data-status="connected"] .conn-dot {
    background: var(--sc-success, #22c55e);
  }
  .conn-status[data-status="connecting"] .conn-dot {
    background: var(--sc-warning, #fbbf24);
    animation: dotPulse 1.4s ease-in-out infinite;
  }

  /* ───────── User Button ───────── */
  .user-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--sc-border, rgba(249, 166, 2, 0.12));
    border-radius: 8px;
    background: transparent;
    color: var(--sc-text-muted, #8a7e6e);
    cursor: pointer;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    flex-shrink: 0;
  }
  .user-btn:hover {
    background: rgba(249, 166, 2, 0.08);
    color: var(--sc-text, #e8e0d2);
    border-color: rgba(249, 166, 2, 0.2);
  }
  .user-btn:active {
    background: rgba(249, 166, 2, 0.14);
  }
  .user-btn svg {
    opacity: 0.5;
    flex-shrink: 0;
  }
  .user-btn:hover svg { opacity: 1; }
  .user-name {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ───────── Mobile ───────── */
  @media (max-width: 767px) {
    :host {
      top: auto;
      bottom: 0;
      padding: 0;
    }
    .bar {
      border-radius: 0;
      max-width: none;
      gap: 4px;
      padding: 0 8px;
    }
    .agent-role,
    .divider,
    .pill .shortcut,
    .pill .pill-label,
    .activity-text,
    .cmd-badge {
      display: none;
    }
    .pill {
      padding: 0 8px;
    }
    .agent {
      padding: 6px;
      gap: 6px;
    }
    .agent-info { gap: 0; }
    .agent-name { font-size: 11.5px; }
    .cmd-palette {
      padding: 0 8px;
      border: none;
    }
    .conn-status,
    .user-btn {
      display: none;
    }
  }
</style>

<div class="bar" role="toolbar" aria-label="Workspace bar">
  <!-- Agent section -->
  <div class="agent" role="button" tabindex="0" aria-label="Switch agent" part="agent">
    <div class="avatar" aria-hidden="true">
      <span class="avatar-initials">AI</span>
      <span class="status-dot"></span>
    </div>
    <div class="agent-info">
      <span class="agent-name">Agent</span>
      <span class="agent-role">Assistant</span>
    </div>
    <svg class="chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="5 6 8 9 11 6"/>
    </svg>
  </div>

  <!-- Divider -->
  <div class="divider" aria-hidden="true"></div>

  <!-- Surface pills -->
  <div class="surfaces" role="group" aria-label="Surfaces">
    <button class="pill" data-type="dashboard" aria-pressed="false" title="Dashboard">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="5" height="5" rx="1"/>
        <rect x="9" y="2" width="5" height="5" rx="1"/>
        <rect x="2" y="9" width="5" height="5" rx="1"/>
        <rect x="9" y="9" width="5" height="5" rx="1"/>
      </svg>
      <span class="pill-label">Dashboard</span>
    </button>
    <button class="pill" data-type="terminal" aria-pressed="false" title="Terminal">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <polyline points="4 6 7 9 4 12"/>
        <line x1="9" y1="12" x2="13" y2="12"/>
      </svg>
      <span class="pill-label">Terminal</span>
      <span class="shortcut" aria-hidden="true">⌘1</span>
    </button>
    <button class="pill" data-type="explorer" aria-pressed="false" title="Files">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 4h4l2 2h6v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
      </svg>
      <span class="pill-label">Files</span>
      <span class="shortcut" aria-hidden="true">⌘2</span>
    </button>
    <button class="pill" data-type="editor" aria-pressed="false" title="Editor">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M11 2l3 3-8 8H3v-3z"/>
        <line x1="9" y1="4" x2="12" y2="7"/>
      </svg>
      <span class="pill-label">Editor</span>
      <span class="shortcut" aria-hidden="true">⌘3</span>
    </button>
    <button class="pill" data-type="search" aria-pressed="false" title="Search">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4"/>
        <line x1="10" y1="10" x2="14" y2="14"/>
      </svg>
      <span class="pill-label">Search</span>
      <span class="shortcut" aria-hidden="true">⌘4</span>
    </button>
  </div>

  <!-- Widgets accessible via command palette (⌘K) only -->

  <!-- Activity indicator -->
  <div class="activity" data-state="idle" aria-live="polite" aria-label="Agent activity">
    <div class="activity-visual"></div>
    <span class="activity-text"></span>
  </div>

  <!-- Spacer -->
  <div class="spacer"></div>

  <!-- Connection status -->
  <span class="conn-status" data-status="disconnected" title="Disconnected">
    <span class="conn-dot"></span>
  </span>

  <!-- Command palette trigger -->
  <button class="cmd-palette" aria-label="Open command palette (⌘K)" title="Command palette">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="4"/>
      <line x1="10" y1="10" x2="14" y2="14"/>
    </svg>
    <span class="cmd-badge">⌘K</span>
  </button>

  <!-- User menu -->
  <div class="divider" aria-hidden="true"></div>
  <button class="user-btn" aria-label="User menu" title="User menu">
    <span class="user-name">User</span>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
  </button>
</div>
`;

/**
 * <sc-workspace-bar> — Bottom dock bar for Scratchy v2.
 *
 * @element sc-workspace-bar
 * @fires surface-toggle - When a surface pill is toggled. `detail: { type }`
 * @fires agent-click    - When the agent section is clicked.
 * @fires command-palette - When ⌘K is triggered.
 */
class ScWorkspaceBar extends HTMLElement {
  /** @type {ShadowRoot} */
  #shadow;

  /** @type {{ name: string, role: string, color: string }} */
  #agent = { name: 'Agent', role: 'Assistant', color: '#F9A602' };

  /** @type {string} */
  #activityState = 'idle';

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: 'open' });
    this.#shadow.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.#bindEvents();
    this.#render();
  }

  disconnectedCallback() {
    // Listeners are on shadow children so they are GC'd with the element.
  }

  /* ─────────── Public API ─────────── */

  /**
   * Update the displayed agent.
   * @param {{ name: string, role?: string, color?: string }} agent
   */
  setAgent(agent) {
    if (!agent || typeof agent !== 'object') return;
    this.#agent = {
      name: agent.name ?? this.#agent.name,
      role: agent.role ?? this.#agent.role,
      color: agent.color ?? this.#agent.color,
    };
    this.#render();
  }

  /**
   * Update the activity indicator.
   * @param {'idle'|'thinking'|'coding'|'searching'|'error'} state
   * @param {string} [detail='']
   */
  setActivity(state, detail = '') {
    const valid = ['idle', 'thinking', 'coding', 'searching', 'error'];
    if (!valid.includes(state)) return;

    this.#activityState = state;
    const container = this.#shadow.querySelector('.activity');
    const visual = this.#shadow.querySelector('.activity-visual');
    const text = this.#shadow.querySelector('.activity-text');

    container.setAttribute('data-state', state);
    text.textContent = detail;

    // Clear previous visual
    visual.innerHTML = '';

    switch (state) {
      case 'thinking':
        visual.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        break;
      case 'coding':
        visual.innerHTML = '<span class="cursor-block"></span>';
        break;
      case 'searching':
        visual.innerHTML = `<span class="spinner"><svg viewBox="0 0 16 16"><path d="M14 8a6 6 0 11-2-4.5"/></svg></span>`;
        break;
      case 'error':
        visual.innerHTML = '<span class="error-dot"></span>';
        break;
      // idle — remains empty, container is hidden via CSS
    }
  }

  /**
   * Set a surface pill as active/inactive.
   * @param {'terminal'|'explorer'|'editor'|'search'} type
   * @param {boolean} active
   */
  setSurfaceActive(type, active) {
    const pill = this.#shadow.querySelector(`.pill[data-type="${type}"]`);
    if (!pill) return;
    pill.setAttribute('aria-pressed', String(!!active));
  }

  setConnectionStatus(status) {
    const el = this.#shadow.querySelector('.conn-status');
    if (!el) return;
    const valid = ['connected', 'disconnected', 'connecting'];
    if (!valid.includes(status)) return;
    el.setAttribute('data-status', status);
    el.setAttribute('title', status.charAt(0).toUpperCase() + status.slice(1));
  }

  setUser(name) {
    const el = this.#shadow.querySelector('.user-name');
    if (el) el.textContent = name || 'User';
  }

  /* ─────────── Internal ─────────── */

  #bindEvents() {
    // Agent click
    const agentEl = this.#shadow.querySelector('.agent');
    const handleAgentActivate = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();
      this.dispatchEvent(new CustomEvent('agent-click', { bubbles: true, composed: true }));
    };
    agentEl.addEventListener('click', handleAgentActivate);
    agentEl.addEventListener('keydown', handleAgentActivate);

    // Surface pills
    const pills = this.#shadow.querySelectorAll('.pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const type = pill.dataset.type;
        const current = pill.getAttribute('aria-pressed') === 'true';
        pill.setAttribute('aria-pressed', String(!current));
        this.dispatchEvent(
          new CustomEvent('surface-toggle', {
            bubbles: true,
            composed: true,
            detail: { type },
          })
        );
      });
    });

    // Widget pills removed — accessible via command palette (⌘K) only
    // Kept query for forward compat if pills are re-added later
    const widgetPills = this.#shadow.querySelectorAll('.widget-pill');
    widgetPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        const widget = pill.dataset.widget;
        const tagMap = { notes: 'sc-notes', calendar: 'sc-calendar', email: 'sc-email' };
        const tag = tagMap[widget];
        if (tag) {
          this.dispatchEvent(new CustomEvent('widget-open', {
            bubbles: true,
            composed: true,
            detail: { widget, tag },
          }));
        }
      });
    });

    // Command palette
    const cmdBtn = this.#shadow.querySelector('.cmd-palette');
    cmdBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('command-palette', { bubbles: true, composed: true }));
    });

    // User menu
    const userBtn = this.#shadow.querySelector('.user-btn');
    if (userBtn) {
      userBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('user-menu-click', { bubbles: true, composed: true }));
      });
    }

    // Keyboard shortcut: ⌘K / Ctrl+K
    this.#shadow.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('command-palette', { bubbles: true, composed: true }));
      }
    });
  }

  /** Re-render agent section from current state. */
  #render() {
    const { name, role, color } = this.#agent;

    // Avatar
    const avatar = this.#shadow.querySelector('.avatar');
    avatar.style.backgroundColor = color;

    // Initials: take first letter of each word, max 2
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    this.#shadow.querySelector('.avatar-initials').textContent = initials;

    // Name + role
    this.#shadow.querySelector('.agent-name').textContent = name;
    this.#shadow.querySelector('.agent-role').textContent = role;

    // Update agent button aria-label
    this.#shadow.querySelector('.agent').setAttribute('aria-label', `Agent: ${name} — ${role}. Click to switch.`);
  }
}

customElements.define('sc-workspace-bar', ScWorkspaceBar);

export default ScWorkspaceBar;
