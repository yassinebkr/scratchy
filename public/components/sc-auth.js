/**
 * sc-auth.js — Single-screen auth component (signup + login)
 * Patterns: OAuth-first, single page, no plan selection, zero friction.
 */
class ScAuth extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._mode = 'signup'; // signup | login
    this._error = null;
    this._loading = false;
    this._pwStrength = 0;
    this._showPw = false;
    this._render();
  }

  static get observedAttributes() { return ['error', 'loading']; }
  attributeChangedCallback(n, o, v) {
    if (n === 'error') { this._error = v; this._updateError(); }
    if (n === 'loading') { this._loading = v !== null; this._updateLoading(); }
  }
  set error(v) { this._error = v; this._updateError(); }
  get error() { return this._error; }
  set loading(v) { this._loading = !!v; this._updateLoading(); }
  get loading() { return this._loading; }

  /** Switch to 'signup' or 'login' tab programmatically */
  set mode(v) {
    if (v !== 'signup' && v !== 'login') return;
    this._mode = v;
    const tabs = this.shadowRoot.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === this._mode));
    const nameField = this.shadowRoot.querySelector('#name-field');
    const strength = this.shadowRoot.querySelector('#strength');
    const label = this.shadowRoot.querySelector('#submit-btn .btn-label');
    if (nameField && strength && label) {
      if (this._mode === 'signup') {
        nameField.style.display = 'block';
        strength.style.display = 'flex';
        label.textContent = 'Create Account';
      } else {
        nameField.style.display = 'none';
        strength.style.display = 'none';
        label.textContent = 'Sign In';
      }
    }
  }

  _emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }

  _render() {
    this.shadowRoot.innerHTML = `
<style>
:host { display:block; font-family:'Geist',system-ui,sans-serif; background:#0a0a0f; color:#e8e6e3; }
* { box-sizing:border-box; margin:0; padding:0; }

/* ── Split layout ── */
.split { display:flex; min-height:100vh; }

/* ── Left brand panel (desktop only) ── */
.brand-panel {
  display:none;
  width:47%;
  min-height:100vh;
  position:relative;
  overflow:hidden;
  flex-shrink:0;
  background:#0a0a0f;
}
.brand-bg {
  position:absolute; inset:0;
  background:
    radial-gradient(ellipse 80% 60% at 70% 20%, rgba(249,166,2,0.08) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 20% 80%, rgba(249,166,2,0.05) 0%, transparent 50%),
    radial-gradient(ellipse 50% 50% at 50% 50%, rgba(249,166,2,0.03) 0%, transparent 70%);
}
.brand-border {
  position:absolute; top:0; right:0; bottom:0; width:1px;
  background:linear-gradient(180deg, transparent 10%, rgba(249,166,2,0.12) 50%, transparent 90%);
}
.brand-content {
  position:relative; z-index:1;
  display:flex; flex-direction:column; justify-content:center;
  height:100%; padding:60px 48px;
  animation:brandFadeIn .8s ease-out both;
}
@keyframes brandFadeIn {
  from { opacity:0; transform:translateY(12px); }
  to { opacity:1; transform:translateY(0); }
}
.brand-logo {
  display:flex; align-items:center; gap:14px; margin-bottom:40px;
}
.brand-logo img {
  width:56px; height:56px; border-radius:14px;
  box-shadow:0 0 24px rgba(249,166,2,0.15);
}
.brand-logo span {
  font-size:26px; font-weight:700; color:#fff; letter-spacing:-0.03em;
}
.brand-tagline {
  font-size:32px; font-weight:600; line-height:1.25;
  color:#fff; letter-spacing:-0.02em;
  margin-bottom:48px; max-width:360px;
}
.brand-tagline em {
  font-style:normal; color:#F9A602;
}
.brand-features {
  display:flex; flex-direction:column; gap:20px;
  list-style:none; padding:0;
}
.brand-features li {
  display:flex; align-items:center; gap:14px;
  font-size:14px; font-weight:450; color:#9a9a9f;
  animation:featureSlide .6s ease-out both;
}
.brand-features li:nth-child(1) { animation-delay:.3s; }
.brand-features li:nth-child(2) { animation-delay:.45s; }
.brand-features li:nth-child(3) { animation-delay:.6s; }
@keyframes featureSlide {
  from { opacity:0; transform:translateX(-8px); }
  to { opacity:1; transform:translateX(0); }
}
.feature-icon {
  width:36px; height:36px; border-radius:8px;
  display:flex; align-items:center; justify-content:center;
  background:rgba(249,166,2,0.08); border:1px solid rgba(249,166,2,0.12);
  flex-shrink:0;
}
.feature-icon svg { width:18px; height:18px; }

/* ── Right panel ── */
.right-panel {
  flex:1; display:flex; align-items:center; justify-content:center;
  padding:24px; min-height:100vh;
}

/* ── Card ── */
.card { width:100%; max-width:420px; }
.logo { display:flex; align-items:center; gap:10px; justify-content:center; margin-bottom:32px; }
.logo img { width:72px; height:auto; border-radius:0; background:none; object-fit:contain; }
.logo span { font-size:22px; font-weight:600; color:#fff; letter-spacing:-0.02em; }

/* ── Tabs ── */
.tabs { display:flex; margin-bottom:28px; border-bottom:1px solid rgba(255,255,255,0.06); }
.tab { flex:1; padding:10px 0; text-align:center; font-size:14px; font-weight:500; color:#7a7a85; cursor:pointer; border-bottom:2px solid transparent; transition:color .2s,border-color .2s; background:none; border-top:none; border-left:none; border-right:none; }
.tab.active { color:#F9A602; border-bottom-color:#F9A602; }
.tab:hover:not(.active) { color:#bbb; }

/* ── OAuth ── */
.oauth { display:flex; gap:12px; margin-bottom:20px; }
.oauth-btn { flex:1; height:46px; display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; color:#e8e6e3; font-size:13px; font-weight:500; cursor:pointer; transition:background .15s,border-color .15s; font-family:inherit; }
.oauth-btn:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.14); }
.oauth-btn svg { flex-shrink:0; }

/* ── Divider ── */
.divider { display:flex; align-items:center; gap:14px; margin:20px 0; font-size:12px; color:#555; }
.divider::before,.divider::after { content:''; flex:1; height:1px; background:rgba(255,255,255,0.06); }

/* ── Form fields ── */
.field { margin-bottom:16px; }
.field label { display:block; font-size:13px; font-weight:500; margin-bottom:6px; color:#aaa; }
.field input { width:100%; height:46px; padding:0 14px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:8px; color:#e8e6e3; font-size:15px; font-family:inherit; transition:border-color .2s,box-shadow .2s; }
.field input:focus { outline:none; border-color:#F9A602; box-shadow:0 0 0 2px rgba(249,166,2,0.15); }
.field input::placeholder { color:#555; }
.pw-wrap { position:relative; }
.pw-wrap input { padding-right:44px; }
.pw-toggle { position:absolute; top:0; right:0; width:44px; height:46px; background:none; border:none; color:#666; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.pw-toggle:hover { color:#e8e6e3; }

/* ── Password strength ── */
.strength { display:flex; gap:3px; margin:-8px 0 16px; }
.strength-bar { flex:1; height:3px; border-radius:2px; background:rgba(255,255,255,0.06); transition:background .3s; }
.strength-bar.on { background:#F9A602; }

/* ── Primary button ── */
.btn-primary { width:100%; height:46px; background:#F9A602; color:#0a0a0f; border:none; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; transition:background .15s; font-family:inherit; display:flex; align-items:center; justify-content:center; gap:8px; }
.btn-primary:hover { background:#DAA520; }
.btn-primary:disabled { opacity:.6; cursor:default; }

/* ── Spinner ── */
.spinner { display:none; width:16px; height:16px; border:2px solid rgba(0,0,0,.2); border-top-color:#0a0a0f; border-radius:50%; animation:spin .7s linear infinite; }
.loading .spinner { display:block; }
.loading .btn-label { display:none; }

/* ── Error ── */
.error { background:rgba(248,113,113,0.08); border:1px solid rgba(248,113,113,0.2); border-radius:8px; color:#f87171; font-size:13px; padding:10px 14px; margin-bottom:16px; animation:shake .4s; display:none; }
.error.show { display:block; }

@keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-4px)} 40%,80%{transform:translateX(4px)} }
@keyframes spin { to{transform:rotate(360deg)} }

/* ── Footer / back ── */
.footer { text-align:center; margin-top:28px; font-size:11px; color:#555; }
.footer a { color:#F9A602; text-decoration:none; cursor:pointer; }
.footer a:hover { text-decoration:underline; }
.back { display:block; text-align:center; margin-top:16px; font-size:13px; color:#666; cursor:pointer; background:none; border:none; font-family:inherit; }
.back:hover { color:#e8e6e3; }

/* ── Desktop ── */
@media(min-width:768px) {
  .brand-panel { display:block; }
  .logo { display:none; }
}

/* ── Mobile ── */
@media(max-width:767px) {
  .brand-panel { display:none; }
  .right-panel { padding:16px; }
}
@media(max-width:480px) {
  .oauth { flex-direction:column; }
  .card { max-width:none; }
  .right-panel { padding:16px; }
}
</style>
<div class="split">
  <!-- Left brand panel (desktop only) -->
  <div class="brand-panel">
    <div class="brand-bg"></div>
    <div class="brand-border"></div>
    <div class="brand-content">
      <div class="brand-logo">
        <img src="/assets/scratchy-logo.png" alt="Scratchy" onerror="this.style.display='none'">
        <span>Scratchy</span>
      </div>
      <h1 class="brand-tagline">Your AI agents<br><em>remember yesterday</em></h1>
      <ul class="brand-features">
        <li>
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#F9A602" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 017 7c0 3-1.5 5.5-4 7v2H9v-2c-2.5-1.5-4-4-4-7a7 7 0 017-7z"/><path d="M9 21h6"/><path d="M10 24h4"/></svg>
          </div>
          <span>Persistent memory across sessions</span>
        </li>
        <li>
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#F9A602" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 8h2m4 0h4"/><path d="M7 12h10"/></svg>
          </div>
          <span>Skilled agents that learn and adapt</span>
        </li>
        <li>
          <div class="feature-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#F9A602" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><circle cx="12" cy="16" r="1"/></svg>
          </div>
          <span>ProteClaw end-to-end security</span>
        </li>
      </ul>
    </div>
  </div>

  <!-- Right panel: auth form -->
  <div class="right-panel">
    <div class="card">
      <div class="logo">
        <img src="/assets/scratchy-logo.png" alt="Scratchy" onerror="this.style.display='none'">
        <span>Scratchy</span>
      </div>
      <div class="tabs">
        <button class="tab active" data-tab="signup">Sign Up</button>
        <button class="tab" data-tab="login">Sign In</button>
      </div>
      <div class="error" id="err"></div>
      <div class="oauth">
        <button class="oauth-btn" data-provider="google">
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.93 23.93 0 000 24c0 3.77.9 7.34 2.56 10.51l7.97-5.92z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.92C6.51 42.62 14.62 48 24 48z"/></svg>
          Google
        </button>
        <button class="oauth-btn" data-provider="github">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#e8e6e3"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub
        </button>
      </div>
      <div class="divider">or</div>
      <form id="form">
        <div class="field" id="name-field" style="display:none">
          <label>Name <span style="color:#555">(optional)</span></label>
          <input type="text" name="name" placeholder="Your name" autocomplete="name">
        </div>
        <div class="field" id="email-field" style="display:none">
          <label>Email</label>
          <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
        </div>
        <div class="field">
          <label>Username</label>
          <input type="text" name="username" placeholder="cooluser42" required autocomplete="username" minlength="2" maxlength="64" pattern="[a-zA-Z0-9_.\-]+">
        </div>
        <div class="field">
          <label>Password</label>
          <div class="pw-wrap">
            <input type="password" name="password" placeholder="Min 8 characters" required minlength="8" autocomplete="current-password">
            <button type="button" class="pw-toggle" aria-label="Show password">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
        <div class="strength" id="strength" style="display:none">
          <div class="strength-bar" id="s1"></div>
          <div class="strength-bar" id="s2"></div>
          <div class="strength-bar" id="s3"></div>
        </div>
        <button type="submit" class="btn-primary" id="submit-btn">
          <span class="btn-label">Create Account</span>
          <div class="spinner"></div>
        </button>
      </form>
      <button class="back" id="back-btn">← Back to home</button>
      <div class="footer">
        🔒 Encrypted · Protected by ProteClaw · Free forever tier
      </div>
    </div>
  </div>
</div>`;
    this._bind();
  }

  _bind() {
    const $ = s => this.shadowRoot.querySelector(s);
    const $$ = s => this.shadowRoot.querySelectorAll(s);

    // Tabs
    $$('.tab').forEach(tab => tab.addEventListener('click', () => {
      this._mode = tab.dataset.tab;
      $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === this._mode));
      const nameField = $('#name-field');
      const strength = $('#strength');
      const label = $('#submit-btn .btn-label');
      const emailField = $('#email-field');
      if (this._mode === 'signup') {
        nameField.style.display = 'block';
        emailField.style.display = 'block';
        strength.style.display = 'flex';
        label.textContent = 'Create Account';
        $('[name=password]').autocomplete = 'new-password';
        $('[name=email]').required = true;
      } else {
        nameField.style.display = 'none';
        emailField.style.display = 'none';
        strength.style.display = 'none';
        label.textContent = 'Sign In';
        $('[name=password]').autocomplete = 'current-password';
        $('[name=email]').required = false;
      }
      this._error = null;
      this._updateError();
    }));
    // Default: show name + email fields for signup
    $('#name-field').style.display = 'block';
    $('#email-field').style.display = 'block';
    $('#strength').style.display = 'flex';

    // OAuth
    $$('.oauth-btn').forEach(btn => btn.addEventListener('click', () => {
      this._emit('auth-social', { provider: btn.dataset.provider });
    }));

    // Password toggle
    $('.pw-toggle').addEventListener('click', () => {
      this._showPw = !this._showPw;
      $('[name=password]').type = this._showPw ? 'text' : 'password';
    });

    // Password strength
    $('[name=password]').addEventListener('input', (e) => {
      const pw = e.target.value;
      let s = 0;
      if (pw.length >= 8) s++;
      if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
      if (/[^a-zA-Z0-9]/.test(pw)) s++;
      this._pwStrength = s;
      $('#s1').classList.toggle('on', s >= 1);
      $('#s2').classList.toggle('on', s >= 2);
      $('#s3').classList.toggle('on', s >= 3);
    });

    // Form submit
    $('#form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (this._loading) return;
      const username = $('[name=username]').value.trim();
      const password = $('[name=password]').value;
      const email = $('[name=email]')?.value?.trim() || '';
      const name = $('[name=name]')?.value?.trim() || '';
      if (!username || !password) { this.error = 'Username and password required.'; return; }
      if (password.length < 8) { this.error = 'Password must be at least 8 characters.'; return; }
      if (this._mode === 'signup' && !email) { this.error = 'Email is required for signup.'; return; }
      this._error = null;
      this._updateError();
      if (this._mode === 'signup') {
        this._emit('auth-signup', { email, password, name, username });
      } else {
        this._emit('auth-login', { email: username, password }); // login uses username, keep 'email' key for backward compat
      }
    });

    // Back
    $('#back-btn').addEventListener('click', () => this._emit('auth-back'));
  }

  _updateError() {
    const el = this.shadowRoot.querySelector('#err');
    if (!el) return;
    if (this._error) {
      el.textContent = this._error;
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }

  _updateLoading() {
    const wrap = this.shadowRoot.querySelector('.card');
    const btn = this.shadowRoot.querySelector('#submit-btn');
    if (!wrap || !btn) return;
    if (this._loading) {
      btn.disabled = true;
      btn.classList.add('loading');
    } else {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }
}

customElements.define('sc-auth', ScAuth);
