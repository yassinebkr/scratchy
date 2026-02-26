/**
 * Scratchy v2 — <sc-setup-wizard> Web Component
 * 5-step animated onboarding wizard with rich UI interactions.
 *
 * Steps:
 *   1. Language — locale picker (EN / FR) with animated flag cards
 *   2. Account  — name, emoji avatar, theme (light/dark/auto)
 *   3. Connect  — OAuth cards (Google, GitHub) with state animations
 *   4. API Keys — BYOK with provider selector, masked display, validate
 *   5. Agent    — template gallery (Code, Design, Research, Writer)
 */

const AGENT_TEMPLATES = [
  { id: 'code',     name: 'Code',     icon: '💻', desc: 'Software architecture and implementation', model: 'sonnet' },
  { id: 'design',   name: 'Design',   icon: '🎨', desc: 'UI/UX, visual design, and prototyping',   model: 'sonnet' },
  { id: 'research', name: 'Research', icon: '🔍', desc: 'Deep research and analytical reasoning',   model: 'opus'   },
  { id: 'writer',   name: 'Writer',   icon: '✍️', desc: 'Storytelling, copywriting, and content',  model: 'sonnet' },
];

const AVATAR_EMOJIS = [
  '😀','😎','🤓','🧑‍💻','👩‍🔬','🧑‍🎨','🧑‍🚀','🦊','🐱','🐶',
  '🐼','🦄','🐲','🤖','👾','🎃','🌈','⭐','🔥','💎',
  '🌸','🍀','🎵','🚀',
];

const API_PROVIDERS = [
  { id: 'openai',    name: 'OpenAI',    prefix: 'sk-',     placeholder: 'sk-...'     },
  { id: 'anthropic', name: 'Anthropic', prefix: 'sk-ant-', placeholder: 'sk-ant-...' },
  { id: 'google',    name: 'Google AI', prefix: 'AI',      placeholder: 'AIza...'    },
];

const STEP_LABELS = ['Language', 'Account', 'Connect', 'API Keys', 'Agent'];

const tpl = document.createElement('template');
tpl.innerHTML = `
<style>
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    color: var(--text, #e4e4e7);
    background: var(--bg, #0a0a0f);
  }

  /* ── Wizard container ─── */
  .wizard {
    width: 100%;
    max-width: 560px;
    margin: 16px;
    position: relative;
  }

  @keyframes wizardEntrance {
    from { opacity: 0; transform: translateY(30px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .wizard { animation: wizardEntrance 0.5s cubic-bezier(0.4,0,0.2,1); }

  /* ── Progress indicator ─── */
  .progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 16px 0 24px;
    position: relative;
  }

  .progress-step {
    display: flex;
    align-items: center;
  }

  .progress-line {
    width: 40px;
    height: 2px;
    background: var(--border, rgba(255,255,255,0.1));
    transition: background 0.4s ease;
  }

  .progress-line.done {
    background: var(--accent, #6366f1);
  }

  .progress-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--border, rgba(255,255,255,0.1));
    background: var(--bg, #0a0a0f);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #71717a);
    transition: border-color 0.3s, background 0.3s, transform 0.3s, box-shadow 0.3s;
    position: relative;
    flex-shrink: 0;
  }

  .progress-dot.active {
    border-color: var(--accent, #6366f1);
    background: var(--accent, #6366f1);
    color: #fff;
    transform: scale(1.15);
    box-shadow: 0 0 12px rgba(99,102,241,0.4);
    animation: dotPulse 2s ease-in-out infinite;
  }

  .progress-dot.done {
    border-color: var(--accent, #6366f1);
    background: var(--accent, #6366f1);
    color: #fff;
  }

  @keyframes dotPulse {
    0%, 100% { box-shadow: 0 0 12px rgba(99,102,241,0.4); }
    50%      { box-shadow: 0 0 20px rgba(99,102,241,0.6); }
  }

  /* ── Steps track ─── */
  .steps-track-container {
    overflow: hidden;
    border-radius: 12px;
  }

  .steps-track {
    display: flex;
    transition: transform 0.3s ease;
    will-change: transform;
  }

  .step {
    flex: 0 0 100%;
    min-width: 100%;
    box-sizing: border-box;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .step.current {
    opacity: 1;
  }

  .step-card {
    background: var(--surface, #111118);
    border: 1px solid var(--border, rgba(255,255,255,0.06));
    border-radius: 12px;
    padding: 32px 28px;
  }

  .step-title {
    font-size: 22px;
    font-weight: 600;
    margin: 0 0 6px;
    letter-spacing: -0.3px;
  }

  .step-subtitle {
    font-size: 14px;
    color: var(--text-muted, #71717a);
    margin: 0 0 24px;
  }

  /* ── Form elements ─── */
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 14px;
  }

  .field label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted, #71717a);
  }

  .field input, .field select {
    background: var(--bg, #0a0a0f);
    border: 1px solid var(--border, rgba(255,255,255,0.06));
    border-radius: 6px;
    color: var(--text, #e4e4e7);
    font-family: inherit;
    font-size: 13px;
    padding: 9px 10px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }

  .field input:focus, .field select:focus {
    border-color: var(--accent, #6366f1);
  }

  /* ── Language flag cards ─── */
  .lang-cards {
    display: flex;
    gap: 16px;
    justify-content: center;
    margin-top: 8px;
  }

  .lang-card {
    width: 130px;
    padding: 20px 16px;
    border: 2px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 12px;
    cursor: pointer;
    text-align: center;
    transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    background: transparent;
    user-select: none;
  }

  .lang-card:hover {
    transform: scale(1.03);
    border-color: rgba(99,102,241,0.3);
  }

  .lang-card.selected {
    transform: scale(1.06);
    border-color: var(--accent, #6366f1);
    box-shadow: 0 0 20px rgba(99,102,241,0.25);
    background: rgba(99,102,241,0.06);
  }

  .lang-flag {
    font-size: 40px;
    display: block;
    margin-bottom: 8px;
    transition: transform 0.3s ease;
  }

  .lang-card.selected .lang-flag {
    transform: scale(1.1);
  }

  .lang-name {
    font-size: 14px;
    font-weight: 500;
  }

  /* ── Emoji avatar grid ─── */
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
    margin-top: 8px;
    margin-bottom: 14px;
  }

  .emoji-cell {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    border: 2px solid transparent;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    user-select: none;
  }

  .emoji-cell:hover {
    transform: scale(1.15);
    background: rgba(255,255,255,0.04);
  }

  .emoji-cell.selected {
    border-color: var(--accent, #6366f1);
    background: rgba(99,102,241,0.12);
    transform: scale(1.15);
  }

  /* ── Theme toggle ─── */
  .theme-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .theme-option {
    flex: 1;
    min-width: 80px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 8px;
    padding: 10px 12px;
    cursor: pointer;
    text-align: center;
    font-size: 13px;
    transition: border-color 0.15s ease, background 0.15s ease;
    background: transparent;
    color: var(--text, #e4e4e7);
    user-select: none;
  }

  .theme-option:hover {
    border-color: rgba(99,102,241,0.3);
  }

  .theme-option.selected {
    border-color: var(--accent, #6366f1);
    background: rgba(99,102,241,0.08);
  }

  /* ── OAuth cards ─── */
  .oauth-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .oauth-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--border, rgba(255,255,255,0.06));
    border-radius: 8px;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .oauth-card:hover {
    border-color: rgba(255,255,255,0.12);
  }

  .oauth-card.connecting {
    border-color: var(--warning, #fbbf24);
    box-shadow: 0 0 8px rgba(251,191,36,0.15);
  }

  .oauth-card.connected {
    border-color: var(--success, #34d399);
    box-shadow: 0 0 8px rgba(52,211,153,0.15);
  }

  .oauth-icon {
    font-size: 22px;
    flex-shrink: 0;
  }

  .oauth-info {
    flex: 1;
  }

  .oauth-name {
    font-size: 14px;
    font-weight: 500;
  }

  .oauth-status {
    font-size: 11px;
    color: var(--text-muted, #71717a);
    margin-top: 2px;
  }

  .oauth-connect {
    background: transparent;
    border: 1px solid var(--border, rgba(255,255,255,0.12));
    color: var(--text, #e4e4e7);
    border-radius: 6px;
    padding: 6px 14px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    min-width: 80px;
    text-align: center;
  }

  .oauth-connect:hover {
    background: rgba(255,255,255,0.04);
  }

  .oauth-connect.connected {
    border-color: var(--success, #34d399);
    color: var(--success, #34d399);
    cursor: default;
  }

  .oauth-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--border, rgba(255,255,255,0.1));
    border-top-color: var(--warning, #fbbf24);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .skip-now-link {
    display: block;
    text-align: center;
    margin-top: 16px;
    font-size: 13px;
    color: var(--text-muted, #71717a);
    cursor: pointer;
    text-decoration: none;
    background: none;
    border: none;
    font-family: inherit;
    transition: color 0.15s;
  }

  .skip-now-link:hover {
    color: var(--text, #e4e4e7);
  }

  /* ── API Key section ─── */
  .provider-tabs {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
  }

  .provider-tab {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 8px;
    cursor: pointer;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    color: var(--text-muted, #71717a);
    background: transparent;
    transition: border-color 0.15s, background 0.15s, color 0.15s;
    user-select: none;
  }

  .provider-tab:hover {
    border-color: rgba(99,102,241,0.3);
  }

  .provider-tab.active {
    border-color: var(--accent, #6366f1);
    background: rgba(99,102,241,0.08);
    color: var(--text, #e4e4e7);
  }

  .provider-tab .check {
    color: var(--success, #34d399);
    margin-left: 4px;
  }

  .apikey-input-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .apikey-input-row .field {
    flex: 1;
    margin-bottom: 0;
  }

  .masked-display {
    font-size: 12px;
    color: var(--text-muted, #71717a);
    margin-top: 6px;
    font-family: var(--mono, monospace);
  }

  .validate-btn {
    background: transparent;
    border: 1px solid var(--border, rgba(255,255,255,0.12));
    color: var(--text, #e4e4e7);
    border-radius: 6px;
    padding: 9px 14px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .validate-btn:hover {
    background: rgba(255,255,255,0.04);
    border-color: rgba(255,255,255,0.15);
  }

  .validate-btn.validating {
    opacity: 0.6;
    pointer-events: none;
  }

  .key-feedback {
    font-size: 12px;
    margin-top: 8px;
    transition: opacity 0.2s;
  }

  .key-feedback.success {
    color: var(--success, #34d399);
  }

  .key-feedback.error {
    color: var(--danger, #f87171);
  }

  .why-tooltip {
    position: relative;
    display: inline-block;
    color: var(--accent, #6366f1);
    font-size: 12px;
    cursor: help;
    margin-bottom: 14px;
  }

  .why-tooltip .tooltip-text {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 0;
    background: var(--surface, #111118);
    border: 1px solid var(--border, rgba(255,255,255,0.1));
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 12px;
    color: var(--text, #e4e4e7);
    width: 260px;
    z-index: 10;
    margin-bottom: 6px;
    line-height: 1.5;
  }

  .why-tooltip:hover .tooltip-text {
    display: block;
  }

  /* ── Agent gallery ─── */
  .agent-gallery {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .agent-template {
    border: 1px solid var(--border, rgba(255,255,255,0.06));
    border-radius: 10px;
    padding: 20px 14px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }

  .agent-template:hover {
    border-color: rgba(99,102,241,0.3);
    transform: translateY(-2px);
  }

  .agent-template.selected {
    border-color: var(--accent, #6366f1);
    background: rgba(99,102,241,0.08);
  }

  .agent-template-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .agent-template-name {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .agent-template-desc {
    font-size: 11px;
    color: var(--text-muted, #71717a);
    line-height: 1.4;
  }

  .cta-hint {
    text-align: center;
    margin-top: 16px;
    font-size: 12px;
    color: var(--text-muted, #71717a);
  }

  /* ── Navigation ─── */
  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0 8px;
  }

  .nav-left {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .skip-link {
    font-size: 12px;
    color: var(--text-muted, #71717a);
    cursor: pointer;
    text-decoration: none;
    transition: color 0.15s;
    background: none;
    border: none;
    font-family: inherit;
  }

  .skip-link:hover {
    color: var(--text, #e4e4e7);
  }

  .btn {
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 9px 18px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    border: none;
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted, #71717a);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
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

  /* ── Mobile ─── */
  @media (max-width: 500px) {
    .wizard { margin: 0; max-width: 100%; }
    .step-card { padding: 24px 18px; border-radius: 0; }
    .step-title { font-size: 18px; }
    .agent-gallery { grid-template-columns: repeat(2, 1fr); }
    .theme-group { flex-direction: column; }
    .lang-cards { flex-direction: column; align-items: center; }
    .lang-card { width: 100%; max-width: 200px; }
    .emoji-grid { grid-template-columns: repeat(6, 1fr); }
    .progress-line { width: 24px; }
    .provider-tabs { flex-direction: column; }
  }
</style>

<div class="wizard" id="wizard">
  <!-- Progress dots -->
  <div class="progress" id="progress"></div>

  <!-- Steps -->
  <div class="steps-track-container">
    <div class="steps-track" id="steps-track"></div>
  </div>

  <!-- Navigation -->
  <div class="nav">
    <div class="nav-left">
      <button class="btn btn-ghost" id="back-btn" style="display:none">← Back</button>
      <button class="skip-link" id="skip-finish-btn">Skip to Finish</button>
    </div>
    <button class="btn btn-primary" id="next-btn">Next →</button>
  </div>
</div>
`;

export class ScSetupWizard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(tpl.content.cloneNode(true));

    this._currentStep = 0;
    this._totalSteps = 5;
    this._data = {
      locale: 'en',
      displayName: '',
      avatar: '',
      theme: 'system',
      apiKeys: {},
      selectedAgent: 'code',
      oauthStatus: {},        // { google: 'idle'|'connecting'|'connected', ... }
      selectedProvider: 'openai',
    };

    this._progressEl = this.shadowRoot.getElementById('progress');
    this._trackEl = this.shadowRoot.getElementById('steps-track');
    this._backBtn = this.shadowRoot.getElementById('back-btn');
    this._nextBtn = this.shadowRoot.getElementById('next-btn');
    this._skipFinishBtn = this.shadowRoot.getElementById('skip-finish-btn');
  }

  connectedCallback() {
    this._buildSteps();
    this._buildProgress();
    this._updateStep();

    this._backBtn.addEventListener('click', () => this._goBack());
    this._nextBtn.addEventListener('click', () => this._goNext());
    this._skipFinishBtn.addEventListener('click', () => this._complete());

    // Check if setup already complete
    this._checkStatus();
  }

  /* ── First-run detection ─── */
  async _checkStatus() {
    try {
      const res = await fetch('/api/setup/status');
      if (res.ok) {
        const data = await res.json();
        if (data.complete) {
          this._dispatchComplete();
        }
      }
    } catch {
      // continue — show wizard
    }
  }

  /* ── Progress indicator ─── */
  _buildProgress() {
    this._progressEl.innerHTML = '';
    for (let i = 0; i < this._totalSteps; i++) {
      if (i > 0) {
        const line = document.createElement('div');
        line.className = 'progress-line';
        line.dataset.line = i;
        this._progressEl.appendChild(line);
      }
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      dot.dataset.step = i;
      dot.textContent = i + 1;
      this._progressEl.appendChild(dot);
    }
  }

  /* ── Build all 5 steps ─── */
  _buildSteps() {
    this._trackEl.innerHTML = '';

    // Step 1: Language
    this._trackEl.innerHTML += `
      <div class="step" data-step="0">
        <div class="step-card">
          <div style="text-align:center;font-size:48px;margin-bottom:12px">✨</div>
          <h2 class="step-title" style="text-align:center">Welcome to Scratchy</h2>
          <p class="step-subtitle" style="text-align:center">Your AI-powered workspace. Let's get you set up.</p>
          <div class="field">
            <label>Choose your language</label>
            <div class="lang-cards" id="lang-cards">
              <div class="lang-card selected" data-locale="en">
                <span class="lang-flag">🇬🇧</span>
                <span class="lang-name">English</span>
              </div>
              <div class="lang-card" data-locale="fr">
                <span class="lang-flag">🇫🇷</span>
                <span class="lang-name">Français</span>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Step 2: Account
    this._trackEl.innerHTML += `
      <div class="step" data-step="1">
        <div class="step-card">
          <h2 class="step-title">Profile Setup</h2>
          <p class="step-subtitle">How should we address you?</p>
          <div class="field">
            <label for="wiz-name">Display Name</label>
            <input id="wiz-name" type="text" placeholder="Your name" data-field="displayName" />
          </div>
          <div class="field">
            <label>Pick an Avatar</label>
            <div class="emoji-grid" id="emoji-grid"></div>
          </div>
          <div class="field">
            <label>Theme</label>
            <div class="theme-group" id="theme-group">
              <div class="theme-option" data-value="light">☀️ Light</div>
              <div class="theme-option" data-value="dark">🌙 Dark</div>
              <div class="theme-option selected" data-value="auto">💻 Auto</div>
            </div>
          </div>
        </div>
      </div>`;

    // Step 3: Connect Accounts
    this._trackEl.innerHTML += `
      <div class="step" data-step="2">
        <div class="step-card">
          <h2 class="step-title">Connect Accounts</h2>
          <p class="step-subtitle">Link your accounts for a richer experience.</p>
          <div class="oauth-cards" id="oauth-cards">
            <div class="oauth-card" data-provider="google" id="oauth-google">
              <div class="oauth-icon">🔵</div>
              <div class="oauth-info">
                <div class="oauth-name">Google</div>
                <div class="oauth-status" id="oauth-google-status">Not connected</div>
              </div>
              <button class="oauth-connect" data-provider="google" id="oauth-google-btn">Connect</button>
            </div>
            <div class="oauth-card" data-provider="github" id="oauth-github">
              <div class="oauth-icon">⚫</div>
              <div class="oauth-info">
                <div class="oauth-name">GitHub</div>
                <div class="oauth-status" id="oauth-github-status">Not connected</div>
              </div>
              <button class="oauth-connect" data-provider="github" id="oauth-github-btn">Connect</button>
            </div>
          </div>
          <button class="skip-now-link" id="skip-connect">Skip for now →</button>
        </div>
      </div>`;

    // Step 4: API Keys
    this._trackEl.innerHTML += `
      <div class="step" data-step="3">
        <div class="step-card">
          <h2 class="step-title">API Keys</h2>
          <p class="step-subtitle">Bring your own keys for direct model access.</p>
          <div class="why-tooltip">
            ℹ️ Why provide API keys?
            <div class="tooltip-text">
              With your own API keys, requests go directly to the model provider.
              This gives you full control over usage, billing, and model selection.
              Keys are encrypted at rest and never shared.
            </div>
          </div>
          <div class="provider-tabs" id="provider-tabs"></div>
          <div id="apikey-area">
            <div class="apikey-input-row">
              <div class="field">
                <label id="apikey-label">OpenAI API Key</label>
                <input id="wiz-apikey" type="password" placeholder="sk-..." autocomplete="off" />
              </div>
              <button class="validate-btn" id="validate-btn">Validate</button>
            </div>
            <div class="masked-display" id="masked-display"></div>
            <div class="key-feedback" id="key-feedback"></div>
          </div>
          <button class="skip-now-link" id="skip-keys">Skip for now →</button>
        </div>
      </div>`;

    // Step 5: Choose Agent
    this._trackEl.innerHTML += `
      <div class="step" data-step="4">
        <div class="step-card">
          <h2 class="step-title">Choose Your First Agent</h2>
          <p class="step-subtitle">Pick a specialist to get started.</p>
          <div class="agent-gallery" id="agent-gallery"></div>
          <div class="cta-hint">Select a template and click <strong>Get Started</strong> below.</div>
        </div>
      </div>`;

    // ── Wire up interactive elements ──

    // Language cards
    this.shadowRoot.querySelectorAll('.lang-card').forEach(card => {
      card.addEventListener('click', () => {
        this.shadowRoot.querySelectorAll('.lang-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this._data.locale = card.dataset.locale;
      });
    });

    // Emoji avatar grid
    const emojiGrid = this.shadowRoot.getElementById('emoji-grid');
    for (const emoji of AVATAR_EMOJIS) {
      const cell = document.createElement('div');
      cell.className = 'emoji-cell';
      cell.textContent = emoji;
      cell.addEventListener('click', () => {
        emojiGrid.querySelectorAll('.emoji-cell').forEach(c => c.classList.remove('selected'));
        cell.classList.add('selected');
        this._data.avatar = emoji;
      });
      emojiGrid.appendChild(cell);
    }

    // Theme toggle
    this.shadowRoot.querySelectorAll('.theme-option').forEach(opt => {
      opt.addEventListener('click', () => {
        this.shadowRoot.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        this._data.theme = opt.dataset.value;
      });
    });

    // Name input
    const nameInput = this.shadowRoot.getElementById('wiz-name');
    if (nameInput) {
      nameInput.addEventListener('input', () => {
        this._data.displayName = nameInput.value;
      });
    }

    // OAuth connect buttons
    this.shadowRoot.querySelectorAll('.oauth-connect').forEach(btn => {
      btn.addEventListener('click', () => this._handleOAuthConnect(btn.dataset.provider));
    });

    // Skip on step 3
    const skipConnect = this.shadowRoot.getElementById('skip-connect');
    if (skipConnect) {
      skipConnect.addEventListener('click', () => {
        this._currentStep = 3;
        this._updateStep();
      });
    }

    // Skip on step 4
    const skipKeys = this.shadowRoot.getElementById('skip-keys');
    if (skipKeys) {
      skipKeys.addEventListener('click', () => {
        this._currentStep = 4;
        this._updateStep();
      });
    }

    // API provider tabs
    const providerTabs = this.shadowRoot.getElementById('provider-tabs');
    for (const p of API_PROVIDERS) {
      const tab = document.createElement('button');
      tab.className = 'provider-tab' + (p.id === 'openai' ? ' active' : '');
      tab.dataset.provider = p.id;
      tab.textContent = p.name;
      tab.addEventListener('click', () => this._switchProvider(p.id));
      providerTabs.appendChild(tab);
    }

    // Validate button
    const validateBtn = this.shadowRoot.getElementById('validate-btn');
    if (validateBtn) {
      validateBtn.addEventListener('click', () => this._validateKey());
    }

    // Key input — update masked display on input
    const keyInput = this.shadowRoot.getElementById('wiz-apikey');
    if (keyInput) {
      keyInput.addEventListener('input', () => {
        const val = keyInput.value.trim();
        const masked = this.shadowRoot.getElementById('masked-display');
        if (val.length > 4) {
          masked.textContent = '••••••••' + val.slice(-4);
        } else {
          masked.textContent = '';
        }
        // Store the key
        this._data.apiKeys[this._data.selectedProvider] = val;
        // Clear feedback
        const fb = this.shadowRoot.getElementById('key-feedback');
        if (fb) { fb.textContent = ''; fb.className = 'key-feedback'; }
      });
    }

    // Agent gallery
    const gallery = this.shadowRoot.getElementById('agent-gallery');
    for (const tmpl of AGENT_TEMPLATES) {
      const el = document.createElement('div');
      el.className = 'agent-template' + (tmpl.id === 'code' ? ' selected' : '');
      el.dataset.agentId = tmpl.id;
      el.innerHTML = `
        <div class="agent-template-icon">${tmpl.icon}</div>
        <div class="agent-template-name">${tmpl.name}</div>
        <div class="agent-template-desc">${tmpl.desc}</div>
      `;
      el.addEventListener('click', () => {
        gallery.querySelectorAll('.agent-template').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        this._data.selectedAgent = tmpl.id;
      });
      gallery.appendChild(el);
    }
  }

  /* ── OAuth connect with animated states ─── */
  _handleOAuthConnect(provider) {
    const card = this.shadowRoot.getElementById(`oauth-${provider}`);
    const btn = this.shadowRoot.getElementById(`oauth-${provider}-btn`);
    const status = this.shadowRoot.getElementById(`oauth-${provider}-status`);
    if (!card || !btn) return;

    // Set to connecting
    card.classList.remove('connected');
    card.classList.add('connecting');
    btn.innerHTML = '<span class="oauth-spinner"></span>';
    btn.disabled = true;
    if (status) status.textContent = 'Connecting...';
    this._data.oauthStatus[provider] = 'connecting';

    // Open OAuth window
    window.open(`/api/auth/oauth/${provider}`, '_blank');

    // Simulate → after 3s, mark as connected (in real app, listen to postMessage from popup)
    setTimeout(() => {
      card.classList.remove('connecting');
      card.classList.add('connected');
      btn.innerHTML = '✓ Connected';
      btn.classList.add('connected');
      btn.disabled = true;
      if (status) status.textContent = 'Connected';
      this._data.oauthStatus[provider] = 'connected';
    }, 3000);
  }

  /* ── Provider tab switching ─── */
  _switchProvider(providerId) {
    this._data.selectedProvider = providerId;
    const tabs = this.shadowRoot.querySelectorAll('.provider-tab');
    tabs.forEach(t => {
      t.classList.toggle('active', t.dataset.provider === providerId);
    });

    const provider = API_PROVIDERS.find(p => p.id === providerId);
    const label = this.shadowRoot.getElementById('apikey-label');
    const input = this.shadowRoot.getElementById('wiz-apikey');
    const masked = this.shadowRoot.getElementById('masked-display');
    const feedback = this.shadowRoot.getElementById('key-feedback');

    if (label) label.textContent = `${provider.name} API Key`;
    if (input) {
      input.placeholder = provider.placeholder;
      input.value = this._data.apiKeys[providerId] || '';
    }
    if (masked) {
      const val = this._data.apiKeys[providerId] || '';
      masked.textContent = val.length > 4 ? '••••••••' + val.slice(-4) : '';
    }
    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'key-feedback';
    }
  }

  /* ── Key validation ─── */
  async _validateKey() {
    const provider = this._data.selectedProvider;
    const key = this._data.apiKeys[provider];
    const feedback = this.shadowRoot.getElementById('key-feedback');
    const btn = this.shadowRoot.getElementById('validate-btn');
    if (!key || !key.trim()) {
      if (feedback) { feedback.textContent = 'Please enter an API key first.'; feedback.className = 'key-feedback error'; }
      return;
    }

    btn.classList.add('validating');
    btn.textContent = 'Validating...';
    if (feedback) { feedback.textContent = ''; feedback.className = 'key-feedback'; }

    try {
      const token = localStorage.getItem('scratchy_token');
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      };
      const res = await fetch('/api/users/me/apikeys', {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider, key: key.trim() }),
      });
      if (res.ok) {
        if (feedback) { feedback.textContent = '✓ Key saved successfully'; feedback.className = 'key-feedback success'; }
        // Mark tab with check
        const tab = this.shadowRoot.querySelector(`.provider-tab[data-provider="${provider}"]`);
        if (tab && !tab.querySelector('.check')) {
          tab.innerHTML += ' <span class="check">✓</span>';
        }
      } else {
        const data = await res.json().catch(() => ({}));
        if (feedback) { feedback.textContent = data.error || 'Failed to save key'; feedback.className = 'key-feedback error'; }
      }
    } catch {
      if (feedback) { feedback.textContent = 'Network error — try again'; feedback.className = 'key-feedback error'; }
    } finally {
      btn.classList.remove('validating');
      btn.textContent = 'Validate';
    }
  }

  /* ── Update step state ─── */
  _updateStep() {
    // Update progress dots + lines
    this._progressEl.querySelectorAll('.progress-dot').forEach(dot => {
      const idx = parseInt(dot.dataset.step);
      dot.classList.remove('active', 'done');
      if (idx === this._currentStep) {
        dot.classList.add('active');
        dot.textContent = idx + 1;
      } else if (idx < this._currentStep) {
        dot.classList.add('done');
        dot.textContent = '✓';
      } else {
        dot.textContent = idx + 1;
      }
    });
    this._progressEl.querySelectorAll('.progress-line').forEach(line => {
      const idx = parseInt(line.dataset.line);
      line.classList.toggle('done', idx <= this._currentStep);
    });

    // Slide to current step
    this._trackEl.style.transform = `translateX(-${this._currentStep * 100}%)`;

    // Update step visibility
    this._trackEl.querySelectorAll('.step').forEach(step => {
      const idx = parseInt(step.dataset.step);
      step.classList.toggle('current', idx === this._currentStep);
    });

    // Back button
    this._backBtn.style.display = this._currentStep === 0 ? 'none' : '';

    // Next button text
    if (this._currentStep === this._totalSteps - 1) {
      this._nextBtn.textContent = 'Get Started 🚀';
    } else {
      this._nextBtn.textContent = 'Next →';
    }
  }

  _goBack() {
    if (this._currentStep > 0) {
      this._currentStep--;
      this._updateStep();
    }
  }

  async _goNext() {
    // On step 3 (API Keys), save keys
    if (this._currentStep === 3) {
      await this._saveApiKeys();
    }

    if (this._currentStep < this._totalSteps - 1) {
      this._currentStep++;
      this._updateStep();
    } else {
      await this._complete();
    }
  }

  async _saveApiKeys() {
    const token = localStorage.getItem('scratchy_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    for (const [provider, key] of Object.entries(this._data.apiKeys)) {
      if (!key || !key.trim()) continue;
      try {
        await fetch('/api/users/me/apikeys', {
          method: 'POST',
          headers,
          body: JSON.stringify({ provider, key: key.trim() }),
        });
      } catch {
        // Skip silently — wizard is skip-friendly
      }
    }
  }

  async _complete() {
    const token = localStorage.getItem('scratchy_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };

    // Save preferences
    try {
      await fetch('/api/users/me/preferences', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          locale: this._data.locale,
          theme: this._data.theme,
          onboardingComplete: true,
        }),
      });
    } catch { /* skip */ }

    // Mark setup complete
    try {
      await fetch('/api/setup/complete', {
        method: 'POST',
        headers,
      });
    } catch { /* skip */ }

    this._dispatchComplete();
  }

  _dispatchComplete() {
    this.dispatchEvent(new CustomEvent('setup-complete', {
      bubbles: true,
      composed: true,
      detail: { data: this._data },
    }));
  }

  /* ── Public getters for testing ─── */
  get currentStep() { return this._currentStep; }
  get totalSteps() { return this._totalSteps; }
  get data() { return { ...this._data }; }
}

customElements.define('sc-setup-wizard', ScSetupWizard);
