/**
 * Scratchy v2 — <sc-setup-wizard> Web Component
 * 5-step animated onboarding wizard with rich UI interactions.
 *
 * Steps:
 *   1. Welcome  — app name, tagline, "Let's set things up"
 *   2. Profile  — display name, avatar upload (optional)
 *   3. API Key  — provider selection (Anthropic/OpenAI/Google), key input, test button
 *   4. Preferences — theme, language, model preference
 *   5. Complete — success animation, "Start Chatting" CTA
 *
 * Events:
 *   wizard-complete  → detail: { profile, apiKey, preferences }
 *   wizard-skip      → user skipped the wizard
 *
 * Properties:
 *   step   (Number)  — current step index (0-4)
 *   config (Object)  — pre-populate wizard data
 */

const STEP_META = [
  { icon: '✨', title: 'Welcome to Scratchy',    subtitle: "Let's set things up — it only takes a minute." },
  { icon: '👤', title: 'Create Your Profile',    subtitle: 'Tell us a bit about yourself.' },
  { icon: '🔑', title: 'Connect Your AI',        subtitle: 'Add an API key for direct model access.' },
  { icon: '⚙️', title: 'Your Preferences',       subtitle: 'Tailor the experience to your liking.' },
  { icon: '🚀', title: "You're All Set!",        subtitle: 'Everything is ready. Time to build something amazing.' },
];

const API_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-api03-...', prefix: 'sk-ant-' },
  { id: 'openai',    name: 'OpenAI',    placeholder: 'sk-...',           prefix: 'sk-'     },
  { id: 'google',    name: 'Google',    placeholder: 'AIza...',          prefix: 'AI'      },
];

const MODEL_OPTIONS = [
  { id: 'auto',   label: 'Auto (recommended)' },
  { id: 'claude', label: 'Claude (Anthropic)'  },
  { id: 'gpt',    label: 'GPT (OpenAI)'        },
  { id: 'gemini', label: 'Gemini (Google)'      },
];

const AVATAR_EMOJIS = [
  '😀','😎','🤓','🧑‍💻','👩‍🔬','🧑‍🎨','🧑‍🚀','🦊',
  '🐱','🐶','🐼','🦄','🐲','🤖','👾','🎃',
  '🌈','⭐','🔥','💎','🌸','🍀','🎵','🚀',
];

/* ═══════════════════════════════════════════════════════════════════════════
   Template
   ═══════════════════════════════════════════════════════════════════════════ */
const tpl = document.createElement('template');
tpl.innerHTML = /* html */ `
<style>
/* ── Reset & Host ─────────────────────────────────────────────────────── */
:host {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: 'Geist', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  color: #e4e4e7;
  background: #0a0a0f;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Wizard Shell ─────────────────────────────────────────────────────── */
.wizard {
  width: 100%;
  max-width: 520px;
  margin: 24px 16px;
  position: relative;
  animation: wizardIn 0.6s cubic-bezier(0.4,0,0.2,1) both;
}

@keyframes wizardIn {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Progress Bar ─────────────────────────────────────────────────────── */
.progress-bar-track {
  width: 100%;
  height: 3px;
  background: rgba(255,255,255,0.06);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 24px;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #6366f1, #818cf8, #6366f1);
  background-size: 200% 100%;
  animation: progressShimmer 2s linear infinite;
  transition: width 0.4s cubic-bezier(0.4,0,0.2,1);
  will-change: width;
}

@keyframes progressShimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Step Indicators ──────────────────────────────────────────────────── */
.step-indicators {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  margin-bottom: 28px;
}

.step-indicator-segment {
  display: flex;
  align-items: center;
}

.step-line {
  width: 40px;
  height: 2px;
  background: rgba(255,255,255,0.06);
  transition: background 0.4s cubic-bezier(0.4,0,0.2,1);
}

.step-line.completed {
  background: #22c55e;
}

.step-dot {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  position: relative;
  cursor: default;
  border: 2px solid rgba(255,255,255,0.06);
  background: #0a0a0f;
  color: #71717a;
}

.step-dot.current {
  border-color: #6366f1;
  background: #6366f1;
  color: #fff;
  transform: scale(1.1);
  box-shadow: 0 0 0 4px rgba(99,102,241,0.15), 0 0 16px rgba(99,102,241,0.3);
}

.step-dot.completed {
  border-color: #22c55e;
  background: #22c55e;
  color: #fff;
}

.step-dot.completed::after {
  content: '✓';
  font-size: 14px;
}

.step-dot.completed > span { display: none; }

/* ── Steps Viewport ───────────────────────────────────────────────────── */
.steps-viewport {
  overflow: hidden;
  border-radius: 12px;
  position: relative;
}

.step-panel {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s cubic-bezier(0.4,0,0.2,1),
              transform 0.3s cubic-bezier(0.4,0,0.2,1);
  transform: translateX(30px);
}

.step-panel.active {
  position: relative;
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
}

.step-panel.exit-left {
  transform: translateX(-30px);
  opacity: 0;
}

.step-panel.exit-right {
  transform: translateX(30px);
  opacity: 0;
}

/* ── Step Card ────────────────────────────────────────────────────────── */
.step-card {
  background: #111118;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 36px 32px 32px;
}

.step-icon {
  font-size: 40px;
  text-align: center;
  margin-bottom: 12px;
  line-height: 1;
}

.step-title {
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  letter-spacing: -0.3px;
  margin-bottom: 6px;
  color: #e4e4e7;
}

.step-subtitle {
  font-size: 14px;
  color: #71717a;
  text-align: center;
  margin-bottom: 28px;
  line-height: 1.5;
}

/* ── Staggered Field Entrance ─────────────────────────────────────────── */
.field-enter {
  opacity: 0;
  transform: translateY(12px);
  animation: fieldIn 0.35s cubic-bezier(0.4,0,0.2,1) forwards;
}

@keyframes fieldIn {
  to { opacity: 1; transform: translateY(0); }
}

/* ── Shake Animation ──────────────────────────────────────────────────── */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%      { transform: translateX(-6px); }
  40%      { transform: translateX(6px); }
  60%      { transform: translateX(-4px); }
  80%      { transform: translateX(4px); }
}

.shake {
  animation: shake 0.3s ease;
}

.field-error input,
.field-error select {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 2px rgba(239,68,68,0.15);
}

.field-error-msg {
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
  opacity: 0;
  animation: fieldIn 0.2s ease forwards;
}

/* ── Floating Label Input ─────────────────────────────────────────────── */
.float-field {
  position: relative;
  margin-bottom: 18px;
}

.float-field input,
.float-field select {
  width: 100%;
  background: #0a0a0f;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  color: #e4e4e7;
  font-family: inherit;
  font-size: 14px;
  padding: 18px 14px 8px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  min-height: 52px;
}

.float-field input:focus,
.float-field select:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
}

.float-field label {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  color: #71717a;
  pointer-events: none;
  transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
  background: transparent;
  padding: 0 2px;
}

.float-field input:focus ~ label,
.float-field input:not(:placeholder-shown) ~ label,
.float-field select:focus ~ label,
.float-field.has-value label {
  top: 10px;
  transform: translateY(0);
  font-size: 11px;
  color: #6366f1;
}

/* ── Avatar Grid ──────────────────────────────────────────────────────── */
.avatar-section-label {
  font-size: 13px;
  color: #71717a;
  margin-bottom: 10px;
  font-weight: 500;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  margin-bottom: 18px;
}

.avatar-cell {
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
  -webkit-user-select: none;
}

.avatar-cell:hover {
  transform: scale(1.15);
  background: rgba(255,255,255,0.04);
}

.avatar-cell:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}

.avatar-cell.selected {
  border-color: #6366f1;
  background: rgba(99,102,241,0.12);
  transform: scale(1.15);
}

/* ── Provider Cards ───────────────────────────────────────────────────── */
.provider-cards {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.provider-card {
  flex: 1;
  padding: 12px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: #71717a;
  background: transparent;
  transition: all 0.2s ease;
  font-family: inherit;
  user-select: none;
  -webkit-user-select: none;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.provider-card:hover {
  border-color: rgba(99,102,241,0.3);
  color: #e4e4e7;
}

.provider-card:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}

.provider-card.active {
  border-color: #6366f1;
  background: rgba(99,102,241,0.08);
  color: #e4e4e7;
}

.provider-card .check {
  color: #22c55e;
  font-size: 14px;
}

/* ── API Key Row ──────────────────────────────────────────────────────── */
.apikey-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.apikey-row .float-field {
  flex: 1;
}

.test-btn {
  min-height: 52px;
  padding: 0 18px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  color: #e4e4e7;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.test-btn:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.12);
}

.test-btn:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}

.test-btn.testing {
  opacity: 0.6;
  pointer-events: none;
}

.test-btn.success {
  border-color: #22c55e;
  color: #22c55e;
}

.test-btn.error {
  border-color: #ef4444;
  color: #ef4444;
}

.key-feedback {
  font-size: 12px;
  margin-top: 4px;
  min-height: 18px;
  transition: opacity 0.2s;
}

.key-feedback.success { color: #22c55e; }
.key-feedback.error   { color: #ef4444; }

.skip-hint {
  text-align: center;
  margin-top: 16px;
  font-size: 12px;
  color: #71717a;
}

.skip-hint a {
  color: #71717a;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}

.skip-hint a:hover { color: #e4e4e7; }

/* ── Preference Groups ────────────────────────────────────────────────── */
.pref-group {
  margin-bottom: 20px;
}

.pref-label {
  font-size: 13px;
  font-weight: 500;
  color: #71717a;
  margin-bottom: 8px;
}

.option-cards {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.option-card {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  font-size: 13px;
  color: #71717a;
  background: transparent;
  transition: all 0.15s ease;
  font-family: inherit;
  user-select: none;
  -webkit-user-select: none;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.option-card:hover {
  border-color: rgba(99,102,241,0.3);
  color: #e4e4e7;
}

.option-card:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}

.option-card.selected {
  border-color: #6366f1;
  background: rgba(99,102,241,0.08);
  color: #e4e4e7;
}

.model-select {
  width: 100%;
  background: #0a0a0f;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  color: #e4e4e7;
  font-family: inherit;
  font-size: 14px;
  padding: 12px 14px;
  outline: none;
  transition: border-color 0.2s;
  min-height: 44px;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%2371717a' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
}

.model-select:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 2px rgba(99,102,241,0.12);
}

.model-select option {
  background: #111118;
  color: #e4e4e7;
}

/* ── Success / Complete Step ──────────────────────────────────────────── */
.success-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 0;
}

.success-burst {
  position: relative;
  width: 100px;
  height: 100px;
  margin-bottom: 24px;
}

.success-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid #22c55e;
  opacity: 0;
  animation: ringBurst 0.8s cubic-bezier(0.4,0,0.2,1) forwards;
}

.success-ring:nth-child(1) { animation-delay: 0.1s; }
.success-ring:nth-child(2) { animation-delay: 0.3s; }
.success-ring:nth-child(3) { animation-delay: 0.5s; }

@keyframes ringBurst {
  0%   { transform: scale(0.3); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}

.success-check {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  opacity: 0;
  transform: scale(0);
  animation: checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards;
}

@keyframes checkPop {
  to { opacity: 1; transform: scale(1); }
}

.success-circle-bg {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(34,197,94,0.1);
  border: 2px solid rgba(34,197,94,0.3);
  transform: scale(0);
  animation: circleBg 0.4s cubic-bezier(0.4,0,0.2,1) 0.15s forwards;
}

@keyframes circleBg {
  to { transform: scale(1); }
}

.start-btn {
  margin-top: 8px;
  padding: 14px 36px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
  min-height: 48px;
  opacity: 0;
  animation: fieldIn 0.4s ease 0.6s forwards;
}

.start-btn:hover {
  background: #4f46e5;
  transform: translateY(-1px);
}

.start-btn:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 3px;
}

/* ── Navigation ───────────────────────────────────────────────────────── */
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0 8px;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn {
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}

.btn-ghost {
  background: transparent;
  color: #71717a;
  border: 1px solid rgba(255,255,255,0.06);
}

.btn-ghost:hover {
  color: #e4e4e7;
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.1);
}

.btn-primary {
  background: #6366f1;
  color: #fff;
}

.btn-primary:hover {
  background: #4f46e5;
}

.btn-primary:active {
  transform: scale(0.98);
}

.skip-link {
  font-size: 12px;
  color: #71717a;
  cursor: pointer;
  text-decoration: none;
  background: none;
  border: none;
  font-family: inherit;
  transition: color 0.15s;
  padding: 8px 4px;
}

.skip-link:hover { color: #e4e4e7; }
.skip-link:focus-visible { outline: 2px solid #6366f1; outline-offset: 2px; }

/* ── Reduced Motion ───────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  .progress-bar-fill { animation: none; }
}

/* ── Mobile ───────────────────────────────────────────────────────────── */
@media (max-width: 540px) {
  :host {
    align-items: flex-start;
  }
  .wizard {
    margin: 0;
    max-width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .step-card {
    border-radius: 0;
    border-left: none;
    border-right: none;
    padding: 28px 20px 24px;
    flex: 1;
  }
  .steps-viewport { flex: 1; border-radius: 0; }
  .step-title { font-size: 20px; }
  .avatar-grid { grid-template-columns: repeat(6, 1fr); }
  .provider-cards { flex-direction: column; }
  .option-cards { flex-direction: column; }
  .step-line { width: 20px; }
  .nav { padding: 16px 16px 24px; }
  .progress-bar-track { margin: 0 16px 16px; }
  .step-indicators { margin-bottom: 16px; }
}

/* ── Hidden utility ───────────────────────────────────────────────────── */
.hidden { display: none !important; }
</style>

<div class="wizard" id="wizard">
  <!-- Progress Bar -->
  <div class="progress-bar-track">
    <div class="progress-bar-fill" id="progress-fill" style="width: 0%"></div>
  </div>

  <!-- Step Indicators -->
  <div class="step-indicators" id="step-indicators"></div>

  <!-- Steps Viewport -->
  <div class="steps-viewport" id="steps-viewport"></div>

  <!-- Navigation -->
  <div class="nav" id="nav-bar">
    <div class="nav-left">
      <button class="btn btn-ghost hidden" id="back-btn">← Back</button>
      <button class="skip-link" id="skip-btn">Skip setup</button>
    </div>
    <button class="btn btn-primary" id="next-btn">Get Started →</button>
  </div>
</div>
`;

/* ═══════════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════════ */
export class ScSetupWizard extends HTMLElement {

  /* ── Observed attributes ────────────────────────────────────────────── */
  static get observedAttributes() { return ['step']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(tpl.content.cloneNode(true));

    this._step = 0;
    this._totalSteps = STEP_META.length;
    this._transitioning = false;

    this._data = {
      profile: { displayName: '', avatar: '' },
      apiKey: { provider: 'anthropic', key: '', validated: false },
      preferences: { theme: 'dark', language: 'en', model: 'auto' },
    };

    // Cache DOM refs
    this._progressFill  = this.shadowRoot.getElementById('progress-fill');
    this._indicatorsEl  = this.shadowRoot.getElementById('step-indicators');
    this._viewportEl    = this.shadowRoot.getElementById('steps-viewport');
    this._backBtn       = this.shadowRoot.getElementById('back-btn');
    this._nextBtn       = this.shadowRoot.getElementById('next-btn');
    this._skipBtn       = this.shadowRoot.getElementById('skip-btn');
    this._navBar        = this.shadowRoot.getElementById('nav-bar');

    // Bind handlers
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /* ── Lifecycle ──────────────────────────────────────────────────────── */
  connectedCallback() {
    this._buildIndicators();
    this._buildAllSteps();
    this._render();

    this._backBtn.addEventListener('click', () => this._goBack());
    this._nextBtn.addEventListener('click', () => this._goNext());
    this._skipBtn.addEventListener('click', () => this._skip());

    document.addEventListener('keydown', this._onKeyDown);
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._onKeyDown);
  }

  attributeChangedCallback(name, _old, val) {
    if (name === 'step') {
      const n = parseInt(val, 10);
      if (!isNaN(n) && n >= 0 && n < this._totalSteps && n !== this._step) {
        this._step = n;
        this._render();
      }
    }
  }

  /* ── Public properties ──────────────────────────────────────────────── */
  get step() { return this._step; }
  set step(v) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 0 && n < this._totalSteps) {
      this._step = n;
      this._render();
    }
  }

  get config() { return JSON.parse(JSON.stringify(this._data)); }
  set config(v) {
    if (v && typeof v === 'object') {
      if (v.profile)      Object.assign(this._data.profile, v.profile);
      if (v.apiKey)       Object.assign(this._data.apiKey, v.apiKey);
      if (v.preferences)  Object.assign(this._data.preferences, v.preferences);
      this._syncInputs();
    }
  }

  /* ── Keyboard ───────────────────────────────────────────────────────── */
  _onKeyDown(e) {
    if (e.key === 'Enter' && !e.isComposing) {
      // Don't steal Enter from textareas or buttons already focused
      const active = this.shadowRoot.activeElement || document.activeElement;
      if (active?.tagName === 'TEXTAREA') return;
      if (active?.tagName === 'BUTTON' && active !== this._nextBtn) return;
      e.preventDefault();
      this._goNext();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this._goBack();
    }
  }

  /* ── Build Indicators ───────────────────────────────────────────────── */
  _buildIndicators() {
    this._indicatorsEl.innerHTML = '';
    for (let i = 0; i < this._totalSteps; i++) {
      if (i > 0) {
        const line = document.createElement('div');
        line.className = 'step-line';
        line.dataset.index = i;
        this._indicatorsEl.appendChild(line);
      }
      const dot = document.createElement('div');
      dot.className = 'step-dot';
      dot.dataset.index = i;
      dot.innerHTML = `<span>${i + 1}</span>`;
      this._indicatorsEl.appendChild(dot);
    }
  }

  /* ── Build All Step Panels ──────────────────────────────────────────── */
  _buildAllSteps() {
    this._viewportEl.innerHTML = '';

    // Step 0 — Welcome
    this._viewportEl.appendChild(this._makePanel(0, `
      <div class="step-card">
        <div class="step-icon">${STEP_META[0].icon}</div>
        <h2 class="step-title">${STEP_META[0].title}</h2>
        <p class="step-subtitle">${STEP_META[0].subtitle}</p>
        <p style="text-align:center;color:#71717a;font-size:13px;line-height:1.6;margin-top:8px;">
          We'll walk you through a few quick steps to personalize<br>
          your experience and connect your AI provider.
        </p>
      </div>
    `));

    // Step 1 — Profile
    this._viewportEl.appendChild(this._makePanel(1, `
      <div class="step-card">
        <div class="step-icon">${STEP_META[1].icon}</div>
        <h2 class="step-title">${STEP_META[1].title}</h2>
        <p class="step-subtitle">${STEP_META[1].subtitle}</p>

        <div class="float-field" data-stagger="0">
          <input id="inp-name" type="text" placeholder=" " autocomplete="name" />
          <label for="inp-name">Display Name</label>
        </div>

        <div class="avatar-section-label" data-stagger="1">Choose an avatar (optional)</div>
        <div class="avatar-grid" id="avatar-grid" data-stagger="2"></div>
      </div>
    `));

    // Step 2 — API Key
    this._viewportEl.appendChild(this._makePanel(2, `
      <div class="step-card">
        <div class="step-icon">${STEP_META[2].icon}</div>
        <h2 class="step-title">${STEP_META[2].title}</h2>
        <p class="step-subtitle">${STEP_META[2].subtitle}</p>

        <div class="provider-cards" id="provider-cards" data-stagger="0"></div>

        <div class="apikey-row" data-stagger="1">
          <div class="float-field">
            <input id="inp-apikey" type="password" placeholder=" " autocomplete="off" spellcheck="false" />
            <label for="inp-apikey" id="apikey-label">API Key</label>
          </div>
          <button class="test-btn" id="test-btn">Test</button>
        </div>
        <div class="key-feedback" id="key-feedback"></div>

        <div class="skip-hint" data-stagger="2">
          <a id="skip-apikey">Skip — you can add this later in Settings</a>
        </div>
      </div>
    `));

    // Step 3 — Preferences
    this._viewportEl.appendChild(this._makePanel(3, `
      <div class="step-card">
        <div class="step-icon">${STEP_META[3].icon}</div>
        <h2 class="step-title">${STEP_META[3].title}</h2>
        <p class="step-subtitle">${STEP_META[3].subtitle}</p>

        <div class="pref-group" data-stagger="0">
          <div class="pref-label">Theme</div>
          <div class="option-cards" id="theme-cards">
            <div class="option-card selected" data-value="dark" tabindex="0">🌙 Dark</div>
          </div>
        </div>

        <div class="pref-group" data-stagger="1">
          <div class="pref-label">Language</div>
          <div class="option-cards" id="lang-cards">
            <div class="option-card selected" data-value="en" tabindex="0">🇬🇧 English</div>
            <div class="option-card" data-value="fr" tabindex="0">🇫🇷 Français</div>
          </div>
        </div>

        <div class="pref-group" data-stagger="2">
          <div class="pref-label">Preferred Model</div>
          <select class="model-select" id="model-select"></select>
        </div>
      </div>
    `));

    // Step 4 — Complete
    this._viewportEl.appendChild(this._makePanel(4, `
      <div class="step-card">
        <div class="step-icon" style="font-size:0;margin:0"></div>
        <div class="success-container" id="success-container">
          <div class="success-burst" id="success-burst">
            <div class="success-circle-bg"></div>
            <div class="success-ring"></div>
            <div class="success-ring"></div>
            <div class="success-ring"></div>
            <div class="success-check">✓</div>
          </div>
          <h2 class="step-title">${STEP_META[4].title}</h2>
          <p class="step-subtitle">${STEP_META[4].subtitle}</p>
          <button class="start-btn" id="start-btn">Start Chatting 🚀</button>
        </div>
      </div>
    `));

    // ── Wire up interactions ──
    this._wireProfile();
    this._wireApiKey();
    this._wirePreferences();
    this._wireComplete();
  }

  _makePanel(index, html) {
    const el = document.createElement('div');
    el.className = 'step-panel';
    el.dataset.step = index;
    el.innerHTML = html;
    return el;
  }

  /* ── Wire: Profile ──────────────────────────────────────────────────── */
  _wireProfile() {
    // Name input
    const nameInp = this.shadowRoot.getElementById('inp-name');
    nameInp?.addEventListener('input', () => {
      this._data.profile.displayName = nameInp.value;
    });

    // Avatar grid
    const grid = this.shadowRoot.getElementById('avatar-grid');
    if (grid) {
      for (const emoji of AVATAR_EMOJIS) {
        const cell = document.createElement('div');
        cell.className = 'avatar-cell';
        cell.textContent = emoji;
        cell.tabIndex = 0;
        cell.setAttribute('role', 'option');
        cell.addEventListener('click', () => this._selectAvatar(cell, emoji));
        cell.addEventListener('keydown', (e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault(); e.stopPropagation();
            this._selectAvatar(cell, emoji);
          }
        });
        grid.appendChild(cell);
      }
    }
  }

  _selectAvatar(cell, emoji) {
    const grid = this.shadowRoot.getElementById('avatar-grid');
    grid.querySelectorAll('.avatar-cell').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    this._data.profile.avatar = emoji;
  }

  /* ── Wire: API Key ──────────────────────────────────────────────────── */
  _wireApiKey() {
    // Build provider cards
    const container = this.shadowRoot.getElementById('provider-cards');
    if (container) {
      for (const p of API_PROVIDERS) {
        const card = document.createElement('button');
        card.className = 'provider-card' + (p.id === this._data.apiKey.provider ? ' active' : '');
        card.dataset.provider = p.id;
        card.textContent = p.name;
        card.addEventListener('click', () => this._switchProvider(p.id));
        container.appendChild(card);
      }
    }

    // Key input
    const keyInp = this.shadowRoot.getElementById('inp-apikey');
    keyInp?.addEventListener('input', () => {
      this._data.apiKey.key = keyInp.value.trim();
      this._data.apiKey.validated = false;
      // Reset test button
      const btn = this.shadowRoot.getElementById('test-btn');
      if (btn) { btn.textContent = 'Test'; btn.className = 'test-btn'; }
      const fb = this.shadowRoot.getElementById('key-feedback');
      if (fb) { fb.textContent = ''; fb.className = 'key-feedback'; }
    });

    // Test button
    const testBtn = this.shadowRoot.getElementById('test-btn');
    testBtn?.addEventListener('click', () => this._testApiKey());

    // Skip api key
    const skipLink = this.shadowRoot.getElementById('skip-apikey');
    skipLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this._data.apiKey.key = '';
      this._data.apiKey.validated = false;
      this._step = 3;
      this._render();
    });

    this._updateProviderUI();
  }

  _switchProvider(id) {
    this._data.apiKey.provider = id;
    this._data.apiKey.validated = false;

    const cards = this.shadowRoot.querySelectorAll('.provider-card');
    cards.forEach(c => c.classList.toggle('active', c.dataset.provider === id));

    this._updateProviderUI();
  }

  _updateProviderUI() {
    const provider = API_PROVIDERS.find(p => p.id === this._data.apiKey.provider);
    if (!provider) return;

    const label = this.shadowRoot.getElementById('apikey-label');
    const input = this.shadowRoot.getElementById('inp-apikey');
    if (label) label.textContent = `${provider.name} API Key`;
    if (input) {
      input.placeholder = ' ';
      input.value = this._data.apiKey.key || '';
    }

    const fb = this.shadowRoot.getElementById('key-feedback');
    if (fb) { fb.textContent = ''; fb.className = 'key-feedback'; }
    const btn = this.shadowRoot.getElementById('test-btn');
    if (btn) { btn.textContent = 'Test'; btn.className = 'test-btn'; }
  }

  async _testApiKey() {
    const key = this._data.apiKey.key;
    const provider = this._data.apiKey.provider;
    const btn = this.shadowRoot.getElementById('test-btn');
    const fb = this.shadowRoot.getElementById('key-feedback');
    if (!key) {
      if (fb) { fb.textContent = 'Enter an API key first.'; fb.className = 'key-feedback error'; }
      return;
    }

    btn.textContent = '...';
    btn.className = 'test-btn testing';
    if (fb) { fb.textContent = ''; fb.className = 'key-feedback'; }

    try {
      const token = localStorage.getItem('scratchy_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/users/me/apikeys', {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider, key }),
      });

      if (res.ok) {
        btn.textContent = '✓ Valid';
        btn.className = 'test-btn success';
        if (fb) { fb.textContent = 'Key saved and validated.'; fb.className = 'key-feedback success'; }
        this._data.apiKey.validated = true;

        // Show check on provider card
        const card = this.shadowRoot.querySelector(`.provider-card[data-provider="${provider}"]`);
        if (card && !card.querySelector('.check')) {
          card.innerHTML += ' <span class="check">✓</span>';
        }
      } else {
        const data = await res.json().catch(() => ({}));
        btn.textContent = '✗ Failed';
        btn.className = 'test-btn error';
        if (fb) { fb.textContent = data.error || 'Invalid key or server error.'; fb.className = 'key-feedback error'; }
      }
    } catch {
      btn.textContent = '✗ Error';
      btn.className = 'test-btn error';
      if (fb) { fb.textContent = 'Network error — try again.'; fb.className = 'key-feedback error'; }
    }
  }

  /* ── Wire: Preferences ──────────────────────────────────────────────── */
  _wirePreferences() {
    // Theme (only dark for now, but wired for extensibility)
    this.shadowRoot.querySelectorAll('#theme-cards .option-card').forEach(card => {
      card.addEventListener('click', () => {
        this.shadowRoot.querySelectorAll('#theme-cards .option-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this._data.preferences.theme = card.dataset.value;
      });
    });

    // Language
    this.shadowRoot.querySelectorAll('#lang-cards .option-card').forEach(card => {
      card.addEventListener('click', () => {
        this.shadowRoot.querySelectorAll('#lang-cards .option-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this._data.preferences.language = card.dataset.value;
      });
    });

    // Model
    const sel = this.shadowRoot.getElementById('model-select');
    if (sel) {
      for (const m of MODEL_OPTIONS) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.label;
        if (m.id === 'auto') opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        this._data.preferences.model = sel.value;
      });
    }
  }

  /* ── Wire: Complete ─────────────────────────────────────────────────── */
  _wireComplete() {
    const startBtn = this.shadowRoot.getElementById('start-btn');
    startBtn?.addEventListener('click', () => this._complete());
  }

  /* ── Sync inputs to data (for config setter) ────────────────────────── */
  _syncInputs() {
    const nameInp = this.shadowRoot.getElementById('inp-name');
    if (nameInp) nameInp.value = this._data.profile.displayName;

    const keyInp = this.shadowRoot.getElementById('inp-apikey');
    if (keyInp) keyInp.value = this._data.apiKey.key;

    // Provider
    const cards = this.shadowRoot.querySelectorAll('.provider-card');
    cards.forEach(c => c.classList.toggle('active', c.dataset.provider === this._data.apiKey.provider));

    // Language
    this.shadowRoot.querySelectorAll('#lang-cards .option-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.value === this._data.preferences.language);
    });

    // Model
    const sel = this.shadowRoot.getElementById('model-select');
    if (sel) sel.value = this._data.preferences.model;
  }

  /* ── Validate current step ──────────────────────────────────────────── */
  _validateStep() {
    if (this._step === 1) {
      // Profile: display name required
      const name = this._data.profile.displayName.trim();
      if (!name) {
        const field = this.shadowRoot.querySelector('[data-step="1"] .float-field');
        if (field) {
          field.classList.add('field-error', 'shake');
          // Remove existing error msg
          const existing = field.parentElement.querySelector('.field-error-msg');
          if (existing) existing.remove();
          const msg = document.createElement('div');
          msg.className = 'field-error-msg';
          msg.textContent = 'Please enter a display name.';
          field.after(msg);
          setTimeout(() => {
            field.classList.remove('shake');
          }, 300);
          // Focus the input
          const inp = this.shadowRoot.getElementById('inp-name');
          inp?.focus();
        }
        return false;
      } else {
        // Clear errors
        const field = this.shadowRoot.querySelector('[data-step="1"] .float-field');
        field?.classList.remove('field-error', 'shake');
        const msg = this.shadowRoot.querySelector('[data-step="1"] .field-error-msg');
        msg?.remove();
      }
    }

    // All other steps are optional / skippable
    return true;
  }

  /* ── Navigation ─────────────────────────────────────────────────────── */
  _goBack() {
    if (this._step > 0 && !this._transitioning) {
      this._transitionTo(this._step - 1, 'back');
    }
  }

  _goNext() {
    if (this._transitioning) return;

    if (!this._validateStep()) return;

    if (this._step < this._totalSteps - 1) {
      this._transitionTo(this._step + 1, 'forward');
    } else {
      this._complete();
    }
  }

  _transitionTo(newStep, direction) {
    if (this._transitioning) return;
    this._transitioning = true;

    const oldPanel = this.shadowRoot.querySelector(`.step-panel[data-step="${this._step}"]`);
    const newPanel = this.shadowRoot.querySelector(`.step-panel[data-step="${newStep}"]`);

    // Exit old panel
    if (oldPanel) {
      oldPanel.classList.remove('active');
      oldPanel.classList.add(direction === 'forward' ? 'exit-left' : 'exit-right');
    }

    // Prepare new panel entrance direction
    if (newPanel) {
      newPanel.style.transform = direction === 'forward' ? 'translateX(30px)' : 'translateX(-30px)';
      newPanel.style.opacity = '0';
      newPanel.classList.remove('exit-left', 'exit-right');
    }

    this._step = newStep;
    this._updateIndicators();
    this._updateProgressBar();
    this._updateNav();

    // After a frame, trigger entrance
    requestAnimationFrame(() => {
      if (newPanel) {
        newPanel.classList.add('active');
        newPanel.style.transform = '';
        newPanel.style.opacity = '';
      }

      // Staggered field animations
      this._animateFields(newStep);

      setTimeout(() => {
        if (oldPanel) {
          oldPanel.classList.remove('exit-left', 'exit-right');
        }
        this._transitioning = false;
      }, 320);
    });
  }

  _animateFields(stepIndex) {
    const panel = this.shadowRoot.querySelector(`.step-panel[data-step="${stepIndex}"]`);
    if (!panel) return;

    const staggerEls = panel.querySelectorAll('[data-stagger]');
    staggerEls.forEach(el => {
      const idx = parseInt(el.dataset.stagger, 10);
      el.classList.remove('field-enter');
      // Force reflow
      void el.offsetWidth;
      el.classList.add('field-enter');
      el.style.animationDelay = `${idx * 50 + 80}ms`;
    });
  }

  /* ── Render (full sync) ─────────────────────────────────────────────── */
  _render() {
    this._updateIndicators();
    this._updateProgressBar();
    this._updateNav();

    // Show only active panel
    this.shadowRoot.querySelectorAll('.step-panel').forEach(p => {
      const idx = parseInt(p.dataset.step, 10);
      p.classList.toggle('active', idx === this._step);
      p.classList.remove('exit-left', 'exit-right');
    });

    this._animateFields(this._step);
  }

  _updateIndicators() {
    this._indicatorsEl.querySelectorAll('.step-dot').forEach(dot => {
      const idx = parseInt(dot.dataset.index, 10);
      dot.classList.remove('current', 'completed');
      if (idx === this._step) {
        dot.classList.add('current');
      } else if (idx < this._step) {
        dot.classList.add('completed');
      }
    });

    this._indicatorsEl.querySelectorAll('.step-line').forEach(line => {
      const idx = parseInt(line.dataset.index, 10);
      line.classList.toggle('completed', idx <= this._step);
    });
  }

  _updateProgressBar() {
    const pct = this._step === 0 ? 0 : Math.round((this._step / (this._totalSteps - 1)) * 100);
    this._progressFill.style.width = `${pct}%`;
  }

  _updateNav() {
    // Back button
    this._backBtn.classList.toggle('hidden', this._step === 0);

    // On final step, hide nav entirely (CTA is in the card)
    if (this._step === this._totalSteps - 1) {
      this._navBar.classList.add('hidden');
    } else {
      this._navBar.classList.remove('hidden');
    }

    // Next button label
    if (this._step === 0) {
      this._nextBtn.textContent = 'Get Started →';
    } else if (this._step === this._totalSteps - 2) {
      this._nextBtn.textContent = 'Finish →';
    } else {
      this._nextBtn.textContent = 'Next →';
    }
  }

  /* ── Skip ────────────────────────────────────────────────────────────── */
  _skip() {
    this.dispatchEvent(new CustomEvent('wizard-skip', {
      bubbles: true,
      composed: true,
    }));
  }

  /* ── Complete ────────────────────────────────────────────────────────── */
  async _complete() {
    const token = localStorage.getItem('scratchy_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // Save API key if present
    if (this._data.apiKey.key) {
      try {
        await fetch('/api/users/me/apikeys', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            provider: this._data.apiKey.provider,
            key: this._data.apiKey.key,
          }),
        });
      } catch { /* skip */ }
    }

    // Save preferences
    try {
      await fetch('/api/users/me/preferences', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          displayName: this._data.profile.displayName,
          avatar: this._data.profile.avatar,
          theme: this._data.preferences.theme,
          locale: this._data.preferences.language,
          model: this._data.preferences.model,
          onboardingComplete: true,
        }),
      });
    } catch { /* skip */ }

    // Mark setup complete
    try {
      await fetch('/api/setup/complete', { method: 'POST', headers });
    } catch { /* skip */ }

    this.dispatchEvent(new CustomEvent('wizard-complete', {
      bubbles: true,
      composed: true,
      detail: {
        profile: { ...this._data.profile },
        apiKey: {
          provider: this._data.apiKey.provider,
          key: this._data.apiKey.key ? '••••' + this._data.apiKey.key.slice(-4) : '',
          validated: this._data.apiKey.validated,
        },
        preferences: { ...this._data.preferences },
      },
    }));
  }
}

customElements.define('sc-setup-wizard', ScSetupWizard);
