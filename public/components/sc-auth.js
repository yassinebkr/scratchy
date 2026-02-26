/**
 * Scratchy v2 — Auth Web Component
 * <sc-auth> — Login / Signup form with mode toggle
 */

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    color: var(--text, #e4e4e7);
  }

  .auth-card {
    background: var(--surface, #111118);
    border: 1px solid var(--border, rgba(255,255,255,0.06));
    border-radius: 12px;
    padding: 40px 36px 32px;
    width: 100%;
    max-width: 380px;
    margin: 16px;
  }

  .logo {
    text-align: center;
    margin-bottom: 32px;
  }

  .logo h1 {
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.5px;
    margin: 0;
  }

  .logo p {
    color: var(--text-muted, #71717a);
    font-size: 13px;
    margin-top: 6px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .field label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted, #71717a);
  }

  .field input {
    background: var(--bg, #0a0a0f);
    border: 1px solid var(--border, rgba(255,255,255,0.06));
    border-radius: var(--radius, 8px);
    color: var(--text, #e4e4e7);
    font-family: inherit;
    font-size: 14px;
    padding: 10px 12px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
  }

  .field input:focus {
    border-color: var(--accent, #6366f1);
  }

  .field input::placeholder {
    color: var(--text-muted, #71717a);
    opacity: 0.6;
  }

  .submit-btn {
    margin-top: 4px;
    background: var(--accent, #6366f1);
    color: #fff;
    border: none;
    border-radius: var(--radius, 8px);
    padding: 11px 16px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 42px;
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--accent-hover, #4f46e5);
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-msg {
    color: #f87171;
    font-size: 13px;
    text-align: center;
    min-height: 18px;
    margin-top: 2px;
  }

  .toggle-row {
    text-align: center;
    margin-top: 16px;
    font-size: 13px;
    color: var(--text-muted, #71717a);
  }

  .toggle-row a {
    color: var(--accent, #6366f1);
    text-decoration: none;
    cursor: pointer;
    font-weight: 500;
  }

  .toggle-row a:hover {
    text-decoration: underline;
  }

  /* Smooth height transition */
  .form-wrapper {
    overflow: hidden;
    transition: max-height 0.25s ease;
  }
</style>

<div class="auth-card">
  <div class="logo">
    <h1>Scratchy</h1>
    <p id="subtitle">Sign in to continue</p>
  </div>

  <div class="form-wrapper">
    <form id="auth-form" autocomplete="on">
      <div class="field">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" placeholder="your username" autocomplete="username" required />
      </div>
      <div class="field" id="displayname-field" style="display:none">
        <label for="displayname">Display Name</label>
        <input id="displayname" name="displayname" type="text" placeholder="how you appear to others" autocomplete="name" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" placeholder="••••••••" autocomplete="current-password" required />
      </div>
      <div class="error-msg" id="error"></div>
      <button type="submit" class="submit-btn" id="submit-btn">
        <span id="btn-text">Sign in</span>
      </button>
    </form>
  </div>

  <div class="toggle-row">
    <span id="toggle-msg">Don't have an account?</span>
    <a id="toggle-link">Sign up</a>
  </div>
</div>
`;

export class ScAuth extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._mode = 'login'; // 'login' | 'signup'
    this._loading = false;

    // Cache DOM refs
    this._form = this.shadowRoot.getElementById('auth-form');
    this._username = this.shadowRoot.getElementById('username');
    this._password = this.shadowRoot.getElementById('password');
    this._displayname = this.shadowRoot.getElementById('displayname');
    this._displaynameField = this.shadowRoot.getElementById('displayname-field');
    this._error = this.shadowRoot.getElementById('error');
    this._submitBtn = this.shadowRoot.getElementById('submit-btn');
    this._btnText = this.shadowRoot.getElementById('btn-text');
    this._subtitle = this.shadowRoot.getElementById('subtitle');
    this._toggleMsg = this.shadowRoot.getElementById('toggle-msg');
    this._toggleLink = this.shadowRoot.getElementById('toggle-link');
  }

  connectedCallback() {
    this._form.addEventListener('submit', (e) => this._handleSubmit(e));
    this._toggleLink.addEventListener('click', () => this._toggleMode());

    // Auto-focus username
    requestAnimationFrame(() => this._username.focus());
  }

  _toggleMode() {
    this._mode = this._mode === 'login' ? 'signup' : 'login';
    this._error.textContent = '';

    if (this._mode === 'signup') {
      this._subtitle.textContent = 'Create your account';
      this._btnText.textContent = 'Create account';
      this._displaynameField.style.display = '';
      this._toggleMsg.textContent = 'Already have an account?';
      this._toggleLink.textContent = 'Sign in';
      this._password.autocomplete = 'new-password';
    } else {
      this._subtitle.textContent = 'Sign in to continue';
      this._btnText.textContent = 'Sign in';
      this._displaynameField.style.display = 'none';
      this._toggleMsg.textContent = "Don't have an account?";
      this._toggleLink.textContent = 'Sign up';
      this._password.autocomplete = 'current-password';
    }

    requestAnimationFrame(() => this._username.focus());
  }

  async _handleSubmit(e) {
    e.preventDefault();
    if (this._loading) return;

    const username = this._username.value.trim();
    const password = this._password.value;
    const displayName = this._displayname.value.trim();

    if (!username || !password) {
      this._showError('Username and password are required');
      return;
    }

    this._setLoading(true);
    this._error.textContent = '';

    const endpoint = this._mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const body = this._mode === 'login'
      ? { username, password }
      : { username, password, displayName: displayName || username };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        this._showError(data.error || 'Something went wrong');
        return;
      }

      // Save token
      if (data.token) {
        localStorage.setItem('scratchy_token', data.token);
      }

      // Dispatch success event
      this.dispatchEvent(new CustomEvent('auth-success', {
        bubbles: true,
        composed: true,
        detail: { token: data.token, user: data.user ?? { username, displayName: displayName || username } },
      }));
    } catch (err) {
      this._showError('Network error — is the server running?');
    } finally {
      this._setLoading(false);
    }
  }

  _showError(msg) {
    this._error.textContent = msg;
  }

  _setLoading(loading) {
    this._loading = loading;
    this._submitBtn.disabled = loading;
    if (loading) {
      this._btnText.innerHTML = '<div class="spinner"></div>';
    } else {
      this._btnText.textContent = this._mode === 'login' ? 'Sign in' : 'Create account';
    }
  }

  /** Reset form to login mode */
  reset() {
    this._mode = 'login';
    this._form.reset();
    this._error.textContent = '';
    this._displaynameField.style.display = 'none';
    this._subtitle.textContent = 'Sign in to continue';
    this._btnText.textContent = 'Sign in';
    this._toggleMsg.textContent = "Don't have an account?";
    this._toggleLink.textContent = 'Sign up';
  }
}

customElements.define('sc-auth', ScAuth);
