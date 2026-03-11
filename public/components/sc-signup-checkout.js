
class SCSignupCheckout extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._plan = {};
    this._error = null;
    this._loading = false;
    this._step = 1;
    this._formValues = {
      name: '',
      email: '',
      password: '',
      apiKey: ''
    };
    this._passwordStrength = 0; // 0: none, 1: weak, 2: medium, 3: strong

    this.shadowRoot.innerHTML = `<style>${SCSignupCheckout.STYLES}</style><div id="root"></div>`;
    this.render();
  }

  static get observedAttributes() {
    return ['error', 'loading'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'error') this.error = newValue;
    if (name === 'loading') this.loading = newValue !== null;
  }
  
  // --- PROPERTIES ---
  set plan(value) {
    if (typeof value === 'string') {
      try {
        this._plan = JSON.parse(value);
      } catch (e) {
        console.error('Invalid JSON for plan attribute:', e);
        this._plan = {};
      }
    } else {
      this._plan = value || {};
    }
    this._step = 1; // Reset step when plan changes
    this.render();
  }

  get plan() {
    return this._plan;
  }

  set error(value) {
    this._error = value;
    this.render();
  }

  get error() {
    return this._error;
  }

  set loading(value) {
    this._loading = !!value;
    this.render();
  }

  get loading() {
    return this._loading;
  }

  // --- LIFECYCLE ---
  connectedCallback() {
    this._addEventListeners();
  }

  disconnectedCallback() {
    this._removeEventListeners();
  }

  // --- EVENT HANDLERS ---
  _addEventListeners() {
    this.shadowRoot.addEventListener('click', this._handleClick.bind(this));
    this.shadowRoot.addEventListener('input', this._handleInput.bind(this));
    this.shadowRoot.addEventListener('submit', this._handleSubmit.bind(this));
  }
  
  _removeEventListeners() {
     this.shadowRoot.removeEventListener('click', this._handleClick.bind(this));
     this.shadowRoot.removeEventListener('input', this._handleInput.bind(this));
     this.shadowRoot.removeEventListener('submit', this._handleSubmit.bind(this));
  }

  _handleClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;

    switch (action) {
      case 'next-step':
        this._handleNextStep();
        break;
      case 'change-plan':
        this._dispatchEvent('signup-back');
        break;
      case 'social-auth':
        this._handleSocialAuth(target.dataset.provider);
        break;
      case 'toggle-password':
        this._togglePasswordVisibility();
        break;
      case 'submit-final':
        this._handleSubmit(new Event('submit', { bubbles: true, cancelable: true }));
        break;
    }
  }

  _handleInput(e) {
    const { name, value } = e.target;
    if (name) {
      this._formValues[name] = value;
      if (name === 'password') {
        this._updatePasswordStrength(value);
      }
      if (name === 'apiKey') {
        this.render(); // Re-render to show validation check
      }
    }
  }

  _handleSubmit(e) {
    e.preventDefault();
    if (this.loading) return;

    const eventDetail = {
      name: this._formValues.name,
      email: this._formValues.email,
      password: this._formValues.password,
      plan: this.plan
    };
    
    if (this.plan.type === 'byok' && this._formValues.apiKey) {
      eventDetail.apiKey = this._formValues.apiKey;
    }
    
    this._dispatchEvent('signup-checkout', eventDetail);
  }
  
  _handleNextStep() {
    // Basic validation
    if (this._step === 1 && (!this._formValues.email || !this._formValues.password)) {
      this.error = 'Please enter your email and password.';
      return;
    }
    this.error = null;
    this._step++;
    this.render();
  }

  _handleSocialAuth(provider) {
    this._dispatchEvent('signup-social', { provider, plan: this.plan });
  }
  
  _togglePasswordVisibility() {
    const passwordInput = this.shadowRoot.querySelector('#password');
    const toggle = this.shadowRoot.querySelector('[data-action="toggle-password"]');
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      toggle.innerHTML = this._renderEyeIcon(true);
    } else {
      passwordInput.type = 'password';
      toggle.innerHTML = this._renderEyeIcon(false);
    }
  }

  _updatePasswordStrength(password) {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/) && password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    this._passwordStrength = strength;
    this.render();
  }
  
  _dispatchEvent(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail
    }));
  }

  // --- RENDER LOGIC ---

  render() {
    this.shadowRoot.getElementById('root').innerHTML = `
      <div class="container ${this.loading ? 'loading' : ''}">
        ${this._renderSidebar()}
        <main class="main-content">
          <div class="mobile-summary">${this._renderMobileSummary()}</div>
          ${this._renderStepIndicator()}
          <form id="checkout-form">
            <div class="step-container">
                ${this._renderCurrentStep()}
            </div>
            ${this._renderError()}
          </form>
          ${this._renderFooter()}
        </main>
      </div>
    `;
    this._addEventListeners();
  }
  
  _renderCurrentStep() {
    const totalSteps = this.plan.type === 'byok' ? 3 : 2;
    if (this._step > totalSteps) this._step = totalSteps;

    switch(this._step) {
      case 1: return this._renderStepAccount();
      case 2: return this._renderStepPayment();
      case 3: return this.plan.type === 'byok' ? this._renderStepApiKey() : this._renderStepPayment();
      default: return this._renderStepAccount();
    }
  }
  
  _renderSidebar() {
    if (!this.plan || !this.plan.name) return '';
    const price = this.plan.price > 0 ? `$${this.plan.price}` : 'Free';
    const period = this.plan.period && this.plan.price > 0 ? `/${this.plan.period}` : '';

    return `
      <aside class="sidebar">
        <div class="plan-card">
          <div class="plan-header">
            ${this.plan.type === 'byok' ? '<span class="byok-badge">BYOK</span>' : ''}
            <h3 class="plan-name">${this.plan.name}</h3>
            <div class="plan-price">
              <span>${price}</span>
              <span class="plan-period">${period}</span>
            </div>
          </div>
          <ul class="plan-features">
            ${(this.plan.features || []).map(feature => `<li>${this._renderCheckIcon()} ${feature}</li>`).join('')}
          </ul>
          <a href="#" class="change-plan-link" data-action="change-plan">
            ${this._renderArrowLeftIcon()} Change plan
          </a>
        </div>
      </aside>
    `;
  }
  
  _renderMobileSummary() {
      if (!this.plan || !this.plan.name) return '';
      const price = this.plan.price > 0 ? `$${this.plan.price}` : 'Free';
      const period = this.plan.period && this.plan.price > 0 ? `/${this.plan.period}` : '';
      return `
        <div class="summary-content">
          <span class="summary-plan">${this.plan.name}</span>
          <span class="summary-price">${price}${period}</span>
        </div>
        <a href="#" class="change-plan-link" data-action="change-plan">Change</a>
      `;
  }

  _renderStepIndicator() {
    const isByok = this.plan.type === 'byok';
    const steps = ['Account', 'Payment', ...(isByok ? ['API Key'] : [])];

    return `
      <div class="step-indicator">
        ${steps.map((label, index) => {
          const stepNum = index + 1;
          const status = stepNum < this._step ? 'completed' : (stepNum === this._step ? 'active' : 'pending');
          return `
            <div class="step ${status}">
              <div class="step-circle"></div>
              <div class="step-label">${label}</div>
            </div>
            ${stepNum < steps.length ? '<div class="step-line"></div>' : ''}
          `;
        }).join('')}
      </div>
    `;
  }

  _renderStepAccount() {
    return `
      <div class="step-content active" id="step-1">
        <h2>Create an account</h2>
        <div class="oauth-buttons">
            <button type="button" class="oauth-btn" data-action="social-auth" data-provider="google">
                ${this._renderGoogleIcon()} Continue with Google
            </button>
            <button type="button" class="oauth-btn" data-action="social-auth" data-provider="github">
                ${this._renderGithubIcon()} Continue with GitHub
            </button>
        </div>
        <div class="divider">
            <span>Or continue with</span>
        </div>
        <div class="form-group">
          <label for="name">Name (Optional)</label>
          <input type="text" id="name" name="name" placeholder="Enter your name" value="${this._formValues.name}">
        </div>
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="you@example.com" required value="${this._formValues.email}">
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <div class="password-wrapper">
            <input type="password" id="password" name="password" placeholder="Enter a strong password" required value="${this._formValues.password}">
            <button type="button" class="password-toggle" data-action="toggle-password" aria-label="Toggle password visibility">
                ${this._renderEyeIcon(false)}
            </button>
          </div>
        </div>
        ${this._renderPasswordStrength()}
        <button type="button" class="btn btn-primary" data-action="next-step">
          Continue ${this._renderSpinner()}
        </button>
      </div>
    `;
  }
  
  _renderPasswordStrength() {
    return `
      <div class="password-strength">
        <div class="strength-bar ${this._passwordStrength >= 1 ? 'filled' : ''}"></div>
        <div class="strength-bar ${this._passwordStrength >= 2 ? 'filled' : ''}"></div>
        <div class="strength-bar ${this._passwordStrength >= 3 ? 'filled' : ''}"></div>
      </div>
    `;
  }

  _renderStepPayment() {
    let note = '', buttonText = 'Create Account';
    switch(this.plan.type) {
      case 'paid':
        note = 'Card details are handled securely by Stripe.';
        buttonText = 'Subscribe';
        break;
      case 'byok':
        note = 'You will be asked for your API key after account creation.';
        buttonText = 'Create Account & Continue';
        break;
    }
    const action = this.plan.type === 'byok' ? 'next-step' : 'submit-final';

    return `
       <div class="step-content active" id="step-2">
        <h2>${this.plan.type === 'paid' ? 'Payment Details' : 'Confirmation'}</h2>
        ${this.plan.type === 'paid' ? '<div id="stripe-element"></div>' : ''}
        ${note ? `<p class="security-note">${note}</p>` : ''}
        <button type="button" class="btn btn-primary" data-action="${action}">
          ${buttonText} ${this._renderSpinner()}
        </button>
      </div>
    `;
  }

  _renderStepApiKey() {
    const isValid = this._formValues.apiKey.length > 10; // Simple validation
    return `
      <div class="step-content active" id="step-3">
        <h2>Add your API Key</h2>
        <div class="form-group">
            <label for="apiKey">API Key</label>
            <div class="api-key-wrapper">
                <textarea 
                    id="apiKey" 
                    name="apiKey" 
                    class="api-key-input"
                    placeholder="Paste your OpenAI / Anthropic API key"
                    rows="5"
                >${this._formValues.apiKey}</textarea>
                ${isValid ? `<div class="validation-indicator">${this._renderCheckIcon()}</div>` : ''}
            </div>
        </div>
        <p class="security-note small">${this._renderLockIcon()} Your key is encrypted with AES-256-GCM and never leaves your instance.</p>
        <button type="button" class="btn btn-primary" data-action="submit-final">
            Save Key & Finish ${this._renderSpinner()}
        </button>
      </div>
    `;
  }

  _renderError() {
    if (!this.error) return '';
    return `<div class="error-message">${this.error}</div>`;
  }

  _renderFooter() {
    return `
      <footer class="trust-footer">
        <span>Encrypted</span>
        <span>${this._renderDot()}</span>
        <span>Protected by ProteClaw</span>
        <span>${this._renderDot()}</span>
        <span>No credit card for free tier</span>
      </footer>
    `;
  }
  
  _renderSpinner() {
    return `<div class="spinner"></div>`;
  }

  // --- SVG ICONS ---
  _renderCheckIcon() { return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`; }
  _renderArrowLeftIcon() { return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`; }
  _renderGoogleIcon() { return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 10.2c.2.6.2 1.3.2 2 0 4.2-2.8 7.8-6.7 7.8-4.2 0-7.8-3.6-7.8-7.8s3.5-8 7.8-8c2.2 0 4 1 5.2 2.2l-2.5 2.5c-.7-.7-1.8-1.2-2.8-1.2-2.2 0-4.2 1.8-4.2 4.2s1.8 4.2 4.2 4.2c2.5 0 3.8-1.8 4-3H9.8V9.8h5.7z"/></svg>`; }
  _renderGithubIcon() { return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6.2 0-1.4-.5-2.5-1.3-3.4.1-.3.5-1.6 0-3.2 0 0-1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.5 3.1 5.5 3.1c-.5 1.6-.1 2.9 0 3.2C4.7 7.3 4.2 8.4 4.2 9.8c0 4.8 2.7 5.9 5.5 6.2-.6.5-.9 1.3-.9 2.5v3.5"/></svg>`; }
  _renderEyeIcon(isOpen) { return isOpen ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>` : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><path d="m2 2 20 20"/></svg>`; }
  _renderLockIcon() { return `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`; }
  _renderDot() { return `<span class="dot-separator">${"\u00B7"}</span>`; }


  // --- STYLES ---
  static get STYLES() {
    return `
      :host {
        display: block;
        font-family: 'Geist', system-ui, sans-serif;
        background-color: #0a0a0f;
        color: #e8e6e3;
        --accent-color: #F9A602;
        --accent-hover: #DAA520;
        --accent-border: rgba(249, 166, 2, 0.10);
        --surface-color: rgba(255, 255, 255, 0.04);
        --subtle-border: rgba(255, 255, 255, 0.06);
        --muted-text: #7a7a85;
        --input-bg: rgba(255, 255, 255, 0.05);
        --input-border: rgba(255, 255, 255, 0.08);
      }
      
      .container {
        display: flex;
        min-height: 100vh;
        width: 100%;
      }

      .sidebar {
        width: 400px;
        background-color: var(--surface-color);
        border-right: 1px solid var(--subtle-border);
        padding: 48px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .plan-card {
        border: 1px solid var(--subtle-border);
        padding: 32px;
      }
      
      .plan-header {
        border-bottom: 1px solid var(--subtle-border);
        padding-bottom: 24px;
        margin-bottom: 24px;
        position: relative;
      }

      .byok-badge {
        position: absolute;
        top: -48px;
        left: -1px;
        background-color: var(--accent-color);
        color: #0a0a0f;
        font-size: 12px;
        font-weight: 500;
        padding: 4px 8px;
        text-transform: uppercase;
      }

      .plan-name {
        font-size: 24px;
        font-weight: 500;
        margin: 0 0 8px 0;
        color: #fff;
      }
      
      .plan-price {
        font-size: 36px;
        font-weight: 600;
        color: #fff;
      }

      .plan-period {
        font-size: 16px;
        font-weight: 400;
        color: var(--muted-text);
      }

      .plan-features {
        list-style: none;
        padding: 0;
        margin: 0 0 32px 0;
        font-size: 15px;
        line-height: 1.8;
      }
      
      .plan-features li {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .plan-features li svg {
        color: var(--accent-color);
        flex-shrink: 0;
      }
      
      .change-plan-link {
        color: var(--muted-text);
        text-decoration: none;
        font-size: 14px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: color 0.2s;
      }
      
      .change-plan-link:hover {
        color: #e8e6e3;
      }

      .main-content {
        flex: 1;
        padding: 0 64px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        max-width: 500px;
        margin: 0 auto;
      }

      .mobile-summary {
        display: none;
      }
      
      h2 {
        font-size: 28px;
        font-weight: 500;
        margin: 0 0 32px 0;
        color: #fff;
      }

      .form-group {
        margin-bottom: 20px;
      }
      
      label {
        display: block;
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 8px;
        color: #e8e6e3;
      }
      
      input[type="text"],
      input[type="email"],
      input[type="password"] {
        width: 100%;
        height: 48px;
        padding: 0 16px;
        background-color: var(--input-bg);
        border: 1px solid var(--input-border);
        color: #e8e6e3;
        font-size: 16px;
        box-sizing: border-box;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      
      input:focus {
        outline: none;
        border-color: var(--accent-color);
        box-shadow: 0 0 0 2px rgba(249, 166, 2, 0.2);
      }
      
      .btn {
        width: 100%;
        height: 48px;
        border: none;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .btn-primary {
        background-color: var(--accent-color);
        color: #0a0a0f;
      }
      
      .btn-primary:hover {
        background-color: var(--accent-hover);
      }

      .oauth-buttons {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
      }

      .oauth-btn {
        flex: 1;
        height: 48px;
        background: var(--surface-color);
        border: 1px solid var(--subtle-border);
        color: #e8e6e3;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s, border-color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      
      .oauth-btn:hover {
        background-color: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .divider {
        font-size: 12px;
        color: var(--muted-text);
        text-align: center;
        margin: 24px 0;
        position: relative;
      }
      
      .divider::before, .divider::after {
        content: '';
        position: absolute;
        top: 50%;
        width: calc(50% - 70px);
        height: 1px;
        background: var(--subtle-border);
      }

      .divider::before { left: 0; }
      .divider::after { right: 0; }

      .password-wrapper {
        position: relative;
      }

      .password-toggle {
        position: absolute;
        top: 0;
        right: 0;
        height: 48px;
        width: 48px;
        background: transparent;
        border: none;
        color: var(--muted-text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .password-toggle:hover {
        color: #e8e6e3;
      }

      .password-strength {
        display: flex;
        gap: 4px;
        margin: -12px 0 20px 0;
      }
      
      .strength-bar {
        flex: 1;
        height: 3px;
        background: var(--surface-color);
      }
      
      .strength-bar.filled { background: var(--accent-color); }

      /* Step Indicator */
      .step-indicator {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        margin-bottom: 40px;
      }
      
      .step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: var(--muted-text);
        font-size: 14px;
      }
      
      .step-circle {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: var(--surface-color);
        border: 2px solid var(--subtle-border);
        transition: all 0.3s;
      }

      .step-line {
        flex: 1;
        height: 2px;
        background-color: var(--subtle-border);
        margin: 0 8px;
        transform: translateY(-10px);
      }

      .step.active .step-circle {
        background-color: var(--accent-color);
        border-color: var(--accent-color);
      }

      .step.active .step-label {
        color: #e8e6e3;
        font-weight: 500;
      }
      
      .step.completed .step-circle {
        background-color: var(--accent-color);
        border-color: var(--accent-color);
      }

      /* Step Transitions */
      .step-container {
        position: relative;
        overflow: hidden;
      }
      
      .step-content {
        transition: opacity 0.3s ease, max-height 0.4s ease;
        max-height: 0;
        opacity: 0;
        overflow: hidden;
      }
      
      .step-content.active {
        max-height: 800px; /* Adjust as needed */
        opacity: 1;
      }

      /* Step 2 & 3 specifics */
      #stripe-element {
        height: 48px;
        border: 1px solid var(--input-border);
        background-color: var(--input-bg);
        padding: 14px 16px;
        margin-bottom: 24px;
      }
      
      .security-note {
        font-size: 14px;
        color: var(--muted-text);
        text-align: center;
        margin-top: 24px;
        margin-bottom: 24px;
      }

      .security-note.small {
        font-size: 12px;
        margin: 16px 0;
        display: flex;
        align-items: center;
        gap: 6px;
        justify-content: center;
      }

      .api-key-wrapper {
        position: relative;
      }

      .api-key-input {
        width: 100%;
        background: var(--input-bg);
        border: 1px solid var(--input-border);
        color: #e8e6e3;
        font-family: 'Geist Mono', monospace;
        font-size: 15px;
        padding: 16px;
        resize: vertical;
        box-sizing: border-box;
      }
      
      .api-key-input:focus {
        outline: none;
        border-color: var(--accent-color);
      }

      .validation-indicator {
        position: absolute;
        top: 16px;
        right: 16px;
        color: #22c55e;
      }

      /* Footer */
      .trust-footer {
        text-align: center;
        margin-top: 40px;
        font-size: 12px;
        color: var(--muted-text);
      }
      
      .dot-separator {
        margin: 0 8px;
      }

      /* Error and Loading */
      .error-message {
        color: #f87171;
        background-color: rgba(248, 113, 113, 0.1);
        border: 1px solid rgba(248, 113, 113, 0.2);
        padding: 12px 16px;
        font-size: 14px;
        margin-top: 24px;
        animation: shake 0.5s;
      }

      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
        20%, 40%, 60%, 80% { transform: translateX(5px); }
      }

      .spinner {
        display: none;
        width: 18px;
        height: 18px;
        border: 2px solid rgba(0, 0, 0, 0.3);
        border-top-color: #0a0a0f;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .container.loading .btn {
        pointer-events: none;
        opacity: 0.8;
      }

      .container.loading .spinner {
        display: block;
      }

      /* Responsive Styles */
      @media (max-width: 900px) {
        .container {
          flex-direction: column;
        }

        .sidebar {
          display: none;
        }

        .mobile-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 24px;
          background: var(--surface-color);
          border-bottom: 1px solid var(--subtle-border);
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 10;
        }

        .summary-plan {
          font-weight: 500;
        }

        .summary-price {
          color: var(--muted-text);
        }

        .main-content {
          padding: 96px 24px 32px 24px;
          justify-content: flex-start;
          width: 100%;
          box-sizing: border-box;
          max-width: none;
        }

        .trust-footer {
            margin-top: auto;
            padding-top: 32px;
        }
      }
    `;
  }
}

customElements.define('sc-signup-checkout', SCSignupCheckout);
