/**
 * Scratchy v2 — Auth Web Component
 * <sc-auth> — Glassmorphism Login / Signup with animated tabs,
 *              password strength, social login placeholders,
 *              error shake, loading spinner, mobile-first design.
 *
 * Properties:  mode ('login'|'signup'), error (string), loading (boolean)
 * Events:      auth-login  { email, password }
 *              auth-signup { email, password, name }
 *              auth-social { provider }
 */

const STYLES = /* css */ `
/* ─── reset & host ─────────────────────────────────────── */
:host {
  --bg:            #0a0a0f;
  --surface:       rgba(17,17,24,0.8);
  --surface-hover: #1a1a24;
  --border:        rgba(255,255,255,0.06);
  --border-glass:  rgba(255,255,255,0.08);
  --radius:        8px;
  --text:          #e4e4e7;
  --muted:         #71717a;
  --accent:        #6366f1;
  --accent-hover:  #4f46e5;
  --accent-glow:   rgba(99,102,241,0.20);
  --danger:        #f87171;
  --font:          'Geist', system-ui, -apple-system, sans-serif;

  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 100dvh;
  font-family: var(--font);
  font-size: 14px;
  color: var(--text);
  overflow: hidden;
  position: relative;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ─── animated gradient mesh background ────────────────── */
.bg-mesh {
  position: fixed;
  inset: 0;
  z-index: 0;
  background: var(--bg);
  overflow: hidden;
}

.bg-mesh::before,
.bg-mesh::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.35;
  animation: meshFloat 20s ease-in-out infinite alternate;
}

.bg-mesh::before {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, #6366f1 0%, transparent 70%);
  top: -15%;
  left: -10%;
}

.bg-mesh::after {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, #8b5cf6 0%, transparent 70%);
  bottom: -20%;
  right: -10%;
  animation-delay: -10s;
  animation-direction: alternate-reverse;
}

@keyframes meshFloat {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(40px, -30px) scale(1.08); }
  66%  { transform: translate(-20px, 20px) scale(0.95); }
  100% { transform: translate(10px, -10px) scale(1.03); }
}

/* ─── glass card ───────────────────────────────────────── */
.auth-card {
  position: relative;
  z-index: 1;
  background: var(--surface);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border: 1px solid var(--border-glass);
  border-radius: 16px;
  padding: 40px 36px 32px;
  width: 100%;
  max-width: 420px;
  margin: 16px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03),
    0 8px 40px rgba(0,0,0,0.45),
    0 2px 12px rgba(0,0,0,0.25);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

/* ─── logo ─────────────────────────────────────────────── */
.logo {
  text-align: center;
  margin-bottom: 28px;
}

.logo h1 {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #e4e4e7 30%, #6366f1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.logo p {
  color: var(--muted);
  font-size: 13px;
  margin-top: 6px;
  transition: opacity 0.2s;
}

/* ─── tab switcher ─────────────────────────────────────── */
.tabs {
  display: flex;
  position: relative;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border);
}

.tab {
  flex: 1;
  background: none;
  border: none;
  color: var(--muted);
  font-family: var(--font);
  font-size: 14px;
  font-weight: 500;
  padding: 10px 0 12px;
  cursor: pointer;
  transition: color 0.25s ease;
  position: relative;
  z-index: 1;
}

.tab:hover { color: var(--text); }
.tab[aria-selected="true"] { color: var(--text); }

.tab-indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 50%;
  height: 2px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 8px var(--accent-glow);
}

.tab-indicator[data-tab="signup"] {
  transform: translateX(100%);
}

/* ─── social buttons ───────────────────────────────────── */
.social-row {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.social-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font);
  font-size: 13px;
  font-weight: 500;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.15s;
}

.social-btn:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.14);
}

.social-btn:active {
  transform: scale(0.98);
}

.social-btn svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* ─── form ─────────────────────────────────────────────── */
form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── floating-label field ─────────────────────────────── */
.field {
  position: relative;
}

.field input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  padding: 14px 12px 8px;
  outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
  caret-color: var(--accent);
}

.field input::placeholder {
  color: transparent;
}

.field label {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 14px;
  font-weight: 400;
  pointer-events: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: left center;
}

/* Float the label when focused or has value */
.field input:focus ~ label,
.field input:not(:placeholder-shown) ~ label {
  top: 6px;
  transform: translateY(0);
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
}

.field input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}

/* Name field (signup-only) — slides in/out */
.field.name-field {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  margin: 0;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.25s ease,
              margin 0.35s ease;
}

.field.name-field.visible {
  max-height: 70px;
  opacity: 1;
  margin-top: 0; /* gap handles it */
}

/* ─── password strength indicator ──────────────────────── */
.strength-bar {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  height: 3px;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.strength-bar.visible { opacity: 1; }

.strength-bar .bar {
  flex: 1;
  height: 100%;
  border-radius: 2px;
  background: rgba(255,255,255,0.08);
  transition: background 0.3s ease;
}

.strength-bar[data-score="1"] .bar:nth-child(1) { background: #ef4444; }

.strength-bar[data-score="2"] .bar:nth-child(1),
.strength-bar[data-score="2"] .bar:nth-child(2) { background: #eab308; }

.strength-bar[data-score="3"] .bar:nth-child(1),
.strength-bar[data-score="3"] .bar:nth-child(2),
.strength-bar[data-score="3"] .bar:nth-child(3) { background: #22c55e; }

.strength-bar[data-score="4"] .bar { background: #4ade80; }

.strength-label {
  font-size: 11px;
  margin-top: 4px;
  text-align: right;
  min-height: 15px;
  transition: color 0.25s ease, opacity 0.25s ease;
  opacity: 0;
}

.strength-label.visible { opacity: 1; }

.strength-label[data-score="1"] { color: #ef4444; }
.strength-label[data-score="2"] { color: #eab308; }
.strength-label[data-score="3"] { color: #22c55e; }
.strength-label[data-score="4"] { color: #4ade80; }

/* ─── forgot password ──────────────────────────────────── */
.forgot-row {
  text-align: right;
  margin-top: -6px;
}

.forgot-link {
  color: var(--muted);
  font-size: 12px;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
  background: none;
  border: none;
  font-family: var(--font);
  padding: 0;
}

.forgot-link:hover { color: var(--accent); }

/* ─── error message ────────────────────────────────────── */
.error-msg {
  color: var(--danger);
  font-size: 13px;
  text-align: center;
  min-height: 0;
  overflow: hidden;
  transition: min-height 0.2s, opacity 0.2s;
  opacity: 0;
}

.error-msg.active {
  min-height: 20px;
  opacity: 1;
}

/* ─── submit button ────────────────────────────────────── */
.submit-btn {
  position: relative;
  margin-top: 4px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 12px 16px;
  font-family: var(--font);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s, opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  letter-spacing: 0.01em;
}

.submit-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.985);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.submit-btn .btn-label {
  transition: opacity 0.2s;
}

.submit-btn.loading .btn-label { opacity: 0; }

.submit-btn .spinner {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2.5px solid rgba(255,255,255,0.25);
  border-top-color: #fff;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s;
  animation: spin 0.65s linear infinite;
}

.submit-btn.loading .spinner { opacity: 1; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── bottom toggle ────────────────────────────────────── */
.toggle-row {
  text-align: center;
  margin-top: 22px;
  font-size: 13px;
  color: var(--muted);
}

.toggle-row a {
  color: var(--accent);
  text-decoration: none;
  cursor: pointer;
  font-weight: 500;
  transition: color 0.2s;
}

.toggle-row a:hover {
  color: #818cf8;
}

/* ─── shake animation ──────────────────────────────────── */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%      { transform: translateX(-6px); }
  30%      { transform: translateX(5px); }
  50%      { transform: translateX(-4px); }
  70%      { transform: translateX(3px); }
  90%      { transform: translateX(-2px); }
}

.shake {
  animation: shake 0.3s ease-in-out;
}

/* ─── validation inline ────────────────────────────────── */
.field input.invalid {
  border-color: var(--danger);
}

.field input.invalid:focus {
  box-shadow: 0 0 0 3px rgba(248,113,113,0.15);
}

/* ─── mobile ───────────────────────────────────────────── */
@media (max-width: 480px) {
  .auth-card {
    max-width: 100%;
    margin: 0;
    border-radius: 0;
    min-height: 100dvh;
    padding: 40px 24px env(safe-area-inset-bottom, 24px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    border: none;
  }

  .bg-mesh::before,
  .bg-mesh::after {
    opacity: 0.2;
  }
}

/* ─── reduced motion ───────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;

const GOOGLE_ICON = `<svg viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;

const GITHUB_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.7.114 2.5.34 1.9-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.16.59.67.5A10.01 10.01 0 0 0 22 12c0-5.523-4.477-10-10-10z"/></svg>`;

const HTML = /* html */ `
<div class="bg-mesh"></div>

<div class="auth-card" id="card">
  <div class="logo">
    <h1>Scratchy</h1>
    <p id="subtitle">Welcome back</p>
  </div>

  <!-- ── Tab switcher ──────────────────────────────── -->
  <div class="tabs" role="tablist">
    <button class="tab" id="tab-login" role="tab" aria-selected="true" data-tab="login">Log in</button>
    <button class="tab" id="tab-signup" role="tab" aria-selected="false" data-tab="signup">Sign up</button>
    <span class="tab-indicator" id="tab-indicator" data-tab="login"></span>
  </div>

  <!-- ── Social login ──────────────────────────────── -->
  <div class="social-row">
    <button class="social-btn" id="btn-google" type="button">${GOOGLE_ICON} Google</button>
    <button class="social-btn" id="btn-github" type="button">${GITHUB_ICON} GitHub</button>
  </div>

  <div class="divider">or</div>

  <!-- ── Form ──────────────────────────────────────── -->
  <form id="auth-form" autocomplete="on" novalidate>
    <div class="field name-field" id="name-field">
      <input id="name" name="name" type="text" placeholder="Name" autocomplete="name" />
      <label for="name">Full Name</label>
    </div>

    <div class="field">
      <input id="email" name="email" type="email" placeholder="Email" autocomplete="email" required />
      <label for="email">Email</label>
    </div>

    <div class="field">
      <input id="password" name="password" type="password" placeholder="Password" autocomplete="current-password" required minlength="8" />
      <label for="password">Password</label>
      <div class="strength-bar" id="strength-bar">
        <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
      </div>
      <div class="strength-label" id="strength-label"></div>
    </div>

    <div class="forgot-row" id="forgot-row">
      <button class="forgot-link" id="forgot-link" type="button">Forgot password?</button>
    </div>

    <div class="error-msg" id="error"></div>

    <button type="submit" class="submit-btn" id="submit-btn">
      <span class="btn-label" id="btn-label">Log in</span>
      <div class="spinner"></div>
    </button>
  </form>

  <div class="toggle-row">
    <span id="toggle-msg">Don't have an account? </span>
    <a id="toggle-link">Sign up</a>
  </div>
</div>
`;

export class ScAuth extends HTMLElement {

  /* ─── observed attributes ───────────────────────── */
  static get observedAttributes() { return ['mode', 'error', 'loading']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    // Move children from wrapper into shadow root
    while (wrapper.firstChild) this.shadowRoot.appendChild(wrapper.firstChild);

    this._mode = 'login';
    this._loading = false;
    this._error = '';

    // Cache refs
    this.$card        = this.shadowRoot.getElementById('card');
    this.$form        = this.shadowRoot.getElementById('auth-form');
    this.$email       = this.shadowRoot.getElementById('email');
    this.$password    = this.shadowRoot.getElementById('password');
    this.$name        = this.shadowRoot.getElementById('name');
    this.$nameField   = this.shadowRoot.getElementById('name-field');
    this.$error       = this.shadowRoot.getElementById('error');
    this.$submitBtn   = this.shadowRoot.getElementById('submit-btn');
    this.$btnLabel    = this.shadowRoot.getElementById('btn-label');
    this.$subtitle    = this.shadowRoot.getElementById('subtitle');
    this.$toggleMsg   = this.shadowRoot.getElementById('toggle-msg');
    this.$toggleLink  = this.shadowRoot.getElementById('toggle-link');
    this.$tabLogin    = this.shadowRoot.getElementById('tab-login');
    this.$tabSignup   = this.shadowRoot.getElementById('tab-signup');
    this.$tabIndicator= this.shadowRoot.getElementById('tab-indicator');
    this.$strengthBar = this.shadowRoot.getElementById('strength-bar');
    this.$strengthLbl = this.shadowRoot.getElementById('strength-label');
    this.$forgotRow   = this.shadowRoot.getElementById('forgot-row');
    this.$btnGoogle   = this.shadowRoot.getElementById('btn-google');
    this.$btnGithub   = this.shadowRoot.getElementById('btn-github');
  }

  /* ─── lifecycle ─────────────────────────────────── */
  connectedCallback() {
    this.$form.addEventListener('submit', (e) => this._handleSubmit(e));
    this.$toggleLink.addEventListener('click', () => this._toggleMode());
    this.$tabLogin.addEventListener('click', () => this.mode = 'login');
    this.$tabSignup.addEventListener('click', () => this.mode = 'signup');
    this.$password.addEventListener('input', () => this._updateStrength());
    this.$btnGoogle.addEventListener('click', () => this._handleSocial('google'));
    this.$btnGithub.addEventListener('click', () => this._handleSocial('github'));

    // Add blur validation
    this.$email.addEventListener('blur', () => this._validateEmail());
    this.$password.addEventListener('blur', () => this._validatePassword());

    // Sync initial attribute state
    this._applyMode();
    requestAnimationFrame(() => this.$email.focus());
  }

  attributeChangedCallback(name, _old, val) {
    switch (name) {
      case 'mode':    this.mode = val; break;
      case 'error':   this.error = val; break;
      case 'loading': this.loading = val !== null && val !== 'false'; break;
    }
  }

  /* ─── properties ────────────────────────────────── */
  get mode() { return this._mode; }
  set mode(v) {
    const m = v === 'signup' ? 'signup' : 'login';
    if (m === this._mode) return;
    this._mode = m;
    this._clearError();
    this._applyMode();
  }

  get error() { return this._error; }
  set error(v) {
    this._error = v || '';
    if (this._error) this._showError(this._error);
    else this._clearError();
  }

  get loading() { return this._loading; }
  set loading(v) {
    this._loading = !!v;
    this._applyLoading();
  }

  /* ─── mode switching ────────────────────────────── */
  _toggleMode() {
    this.mode = this._mode === 'login' ? 'signup' : 'login';
  }

  _applyMode() {
    const signup = this._mode === 'signup';

    // Tabs
    this.$tabLogin.setAttribute('aria-selected', String(!signup));
    this.$tabSignup.setAttribute('aria-selected', String(signup));
    this.$tabIndicator.setAttribute('data-tab', this._mode);

    // Name field slide
    if (signup) {
      this.$nameField.classList.add('visible');
    } else {
      this.$nameField.classList.remove('visible');
    }

    // Password autocomplete
    this.$password.autocomplete = signup ? 'new-password' : 'current-password';

    // Subtitle
    this.$subtitle.textContent = signup ? 'Create your account' : 'Welcome back';

    // Submit label
    this.$btnLabel.textContent = signup ? 'Create account' : 'Log in';

    // Toggle row
    this.$toggleMsg.textContent = signup ? 'Already have an account? ' : "Don't have an account? ";
    this.$toggleLink.textContent = signup ? 'Log in' : 'Sign up';

    // Forgot password — login only
    this.$forgotRow.style.display = signup ? 'none' : '';

    // Strength bar — signup only
    this._updateStrength();

    // Remove validation state
    this.$email.classList.remove('invalid');
    this.$password.classList.remove('invalid');

    requestAnimationFrame(() => (signup ? this.$name : this.$email).focus());
  }

  /* ─── password strength ─────────────────────────── */
  _calcStrength(pw) {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    // Bonus for length
    if (pw.length >= 12 && score < 4) score = Math.min(score + 1, 4);
    return score;
  }

  _updateStrength() {
    const isSignup = this._mode === 'signup';
    const pw = this.$password.value;
    const score = this._calcStrength(pw);

    const show = isSignup && pw.length > 0;
    this.$strengthBar.classList.toggle('visible', show);
    this.$strengthLbl.classList.toggle('visible', show);

    this.$strengthBar.setAttribute('data-score', String(score));
    this.$strengthLbl.setAttribute('data-score', String(score));

    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    this.$strengthLbl.textContent = labels[score] || '';
  }

  /* ─── validation ────────────────────────────────── */
  _validateEmail() {
    const v = this.$email.value.trim();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      this.$email.classList.add('invalid');
      return false;
    }
    this.$email.classList.remove('invalid');
    return true;
  }

  _validatePassword() {
    const v = this.$password.value;
    if (v && v.length < 8) {
      this.$password.classList.add('invalid');
      return false;
    }
    this.$password.classList.remove('invalid');
    return true;
  }

  /* ─── error display + shake ─────────────────────── */
  _showError(msg) {
    this.$error.textContent = msg;
    this.$error.classList.add('active');

    // Shake card
    this.$card.classList.remove('shake');
    void this.$card.offsetWidth; // force reflow
    this.$card.classList.add('shake');
    this.$card.addEventListener('animationend', () => this.$card.classList.remove('shake'), { once: true });
  }

  _clearError() {
    this.$error.textContent = '';
    this.$error.classList.remove('active');
  }

  /* ─── loading state ─────────────────────────────── */
  _applyLoading() {
    this.$submitBtn.disabled = this._loading;
    this.$submitBtn.classList.toggle('loading', this._loading);
  }

  /* ─── social login ──────────────────────────────── */
  _handleSocial(provider) {
    this.dispatchEvent(new CustomEvent('auth-social', {
      bubbles: true,
      composed: true,
      detail: { provider },
    }));
  }

  /* ─── form submission ───────────────────────────── */
  _handleSubmit(e) {
    e.preventDefault();
    if (this._loading) return;

    const email = this.$email.value.trim();
    const password = this.$password.value;
    const name = this.$name.value.trim();

    // Validate
    const emailOk = this._validateEmail();
    const passOk = this._validatePassword();

    if (!email || !password) {
      this._showError('Email and password are required');
      return;
    }

    if (!emailOk) {
      this._showError('Please enter a valid email address');
      return;
    }

    if (!passOk) {
      this._showError('Password must be at least 8 characters');
      return;
    }

    if (this._mode === 'signup' && !name) {
      this._showError('Please enter your name');
      return;
    }

    this._clearError();

    if (this._mode === 'login') {
      this.dispatchEvent(new CustomEvent('auth-login', {
        bubbles: true,
        composed: true,
        detail: { email, password },
      }));
    } else {
      this.dispatchEvent(new CustomEvent('auth-signup', {
        bubbles: true,
        composed: true,
        detail: { email, password, name },
      }));
    }
  }

  /* ─── public API ────────────────────────────────── */
  reset() {
    this._mode = 'login';
    this._loading = false;
    this._error = '';
    this.$form.reset();
    this._clearError();
    this.$email.classList.remove('invalid');
    this.$password.classList.remove('invalid');
    this._applyMode();
    this._applyLoading();
  }
}

customElements.define('sc-auth', ScAuth);
