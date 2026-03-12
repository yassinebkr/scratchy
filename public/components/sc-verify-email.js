/**
 * Scratchy v2 — <sc-verify-email> Web Component
 * 6-digit code input for email verification after signup.
 *
 * Events:
 *   verify-complete → user verified successfully
 *
 * Properties:
 *   email (string) — the email address to verify (display only)
 */
class ScVerifyEmail extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._code = ['', '', '', '', '', ''];
    this._error = '';
    this._loading = false;
    this._resendCooldown = 0;
    this._cooldownTimer = null;
  }

  static get observedAttributes() { return ['email']; }
  attributeChangedCallback() { this._updateEmail(); }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
<style>
:host {
  display: flex; align-items: center; justify-content: center;
  min-height: 100vh; font-family: 'Geist', -apple-system, sans-serif;
  background: #0d0b08; color: #f0ead6;
}
.card {
  background: #14110e; border: 1px solid rgba(249,166,2,0.12);
  border-radius: 16px; padding: 48px 40px; max-width: 420px; width: 100%;
  text-align: center; animation: fadeIn 0.4s ease;
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.icon { font-size: 48px; margin-bottom: 16px; }
h2 { margin: 0 0 8px; font-size: 1.4em; color: #f0ead6; }
.subtitle { color: #8a7e6a; font-size: 0.9em; margin: 0 0 8px; }
.email-label { color: #F9A602; font-size: 0.9em; margin: 0 0 28px; word-break: break-all; }
.code-inputs {
  display: flex; gap: 8px; justify-content: center; margin-bottom: 24px;
}
.code-inputs input {
  width: 44px; height: 52px; text-align: center; font-size: 24px; font-weight: 700;
  font-family: 'Geist Mono', monospace; background: #0d0b08;
  border: 2px solid rgba(240,234,214,0.12); border-radius: 10px; color: #f0ead6;
  outline: none; transition: border-color 0.2s;
  caret-color: #F9A602;
}
.code-inputs input:focus { border-color: #F9A602; }
.code-inputs input.filled { border-color: rgba(249,166,2,0.4); }
.error { color: #ef4444; font-size: 0.85em; margin: -12px 0 16px; min-height: 20px; }
.btn-verify {
  width: 100%; padding: 14px; border: none; border-radius: 10px;
  background: #F9A602; color: #0d0b08; font-size: 15px; font-weight: 600;
  font-family: 'Geist', sans-serif; cursor: pointer; transition: all 0.2s;
}
.btn-verify:hover { background: #e09500; }
.btn-verify:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-verify.loading { opacity: 0.7; }
.resend {
  margin-top: 20px; color: #8a7e6a; font-size: 0.85em;
}
.resend button {
  background: none; border: none; color: #F9A602; cursor: pointer;
  font-family: 'Geist', sans-serif; font-size: 0.85em; text-decoration: underline;
  padding: 0;
}
.resend button:disabled { color: #555; text-decoration: none; cursor: not-allowed; }
.spinner {
  display: none; width: 18px; height: 18px; border: 2px solid rgba(13,11,8,0.3);
  border-top-color: #0d0b08; border-radius: 50%; animation: spin 0.6s linear infinite;
  margin: 0 auto;
}
.loading .spinner { display: inline-block; }
.loading .btn-label { display: none; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
<div class="card">
  <div class="icon">📬</div>
  <h2>Check your email</h2>
  <p class="subtitle">We sent a 6-digit code to</p>
  <p class="email-label" id="email-display">—</p>
  <div class="code-inputs" id="code-inputs">
    <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="one-time-code" data-i="0">
    <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-i="1">
    <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-i="2">
    <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-i="3">
    <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-i="4">
    <input type="text" maxlength="1" inputmode="numeric" pattern="[0-9]" data-i="5">
  </div>
  <div class="error" id="error"></div>
  <button class="btn-verify" id="verify-btn">
    <span class="btn-label">Verify Email</span>
    <div class="spinner"></div>
  </button>
  <div class="resend">
    Didn't receive it? <button id="resend-btn">Resend code</button>
  </div>
</div>`;
    this._bind();
    this._updateEmail();
  }

  _bind() {
    const inputs = this.shadowRoot.querySelectorAll('.code-inputs input');

    // Auto-advance on input
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val.slice(0, 1);
        this._code[i] = e.target.value;
        e.target.classList.toggle('filled', !!e.target.value);
        if (val && i < 5) inputs[i + 1].focus();
        // Auto-submit when all 6 filled
        if (this._code.every(c => c)) this._verify();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          inputs[i - 1].focus();
          inputs[i - 1].value = '';
          this._code[i - 1] = '';
          inputs[i - 1].classList.remove('filled');
        }
      });
      // Handle paste of full code
      inp.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        pasted.split('').forEach((ch, j) => {
          if (inputs[j]) {
            inputs[j].value = ch;
            this._code[j] = ch;
            inputs[j].classList.toggle('filled', true);
          }
        });
        if (pasted.length === 6) this._verify();
        else if (pasted.length > 0) inputs[Math.min(pasted.length, 5)].focus();
      });
    });

    // Focus first input
    setTimeout(() => inputs[0]?.focus(), 100);

    this.shadowRoot.getElementById('verify-btn').addEventListener('click', () => this._verify());
    this.shadowRoot.getElementById('resend-btn').addEventListener('click', () => this._resend());
  }

  _updateEmail() {
    const el = this.shadowRoot?.getElementById('email-display');
    if (el) el.textContent = this.getAttribute('email') || '—';
  }

  async _verify() {
    const code = this._code.join('');
    if (code.length !== 6) {
      this._showError('Please enter the full 6-digit code.');
      return;
    }
    this._loading = true;
    this._showError('');
    const btn = this.shadowRoot.getElementById('verify-btn');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const token = localStorage.getItem('scratchy_token') || '';
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        this._showError(data.error || 'Verification failed.');
        btn.classList.remove('loading');
        btn.disabled = false;
        return;
      }
      // Success!
      this.dispatchEvent(new CustomEvent('verify-complete', { bubbles: true, composed: true }));
    } catch {
      this._showError('Connection error. Try again.');
      btn.classList.remove('loading');
      btn.disabled = false;
    }
  }

  async _resend() {
    if (this._resendCooldown > 0) return;
    const resendBtn = this.shadowRoot.getElementById('resend-btn');
    resendBtn.disabled = true;

    try {
      const token = localStorage.getItem('scratchy_token') || '';
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        this._showError(data.error || 'Failed to resend.');
        resendBtn.disabled = false;
        return;
      }
      // Start 60s cooldown
      this._resendCooldown = 60;
      this._tickCooldown(resendBtn);
    } catch {
      this._showError('Connection error.');
      resendBtn.disabled = false;
    }
  }

  _tickCooldown(btn) {
    if (this._resendCooldown <= 0) {
      btn.textContent = 'Resend code';
      btn.disabled = false;
      return;
    }
    btn.textContent = `Resend in ${this._resendCooldown}s`;
    btn.disabled = true;
    this._resendCooldown--;
    this._cooldownTimer = setTimeout(() => this._tickCooldown(btn), 1000);
  }

  _showError(msg) {
    const el = this.shadowRoot.getElementById('error');
    if (el) el.textContent = msg;
  }

  disconnectedCallback() {
    if (this._cooldownTimer) clearTimeout(this._cooldownTimer);
  }
}

customElements.define('sc-verify-email', ScVerifyEmail);
export default ScVerifyEmail;
