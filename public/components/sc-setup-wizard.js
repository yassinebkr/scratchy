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
  { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', title: 'Welcome to Scratchy',    subtitle: "Let's set things up — it only takes a minute." },
  { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', title: 'Create Your Profile',    subtitle: 'Tell us a bit about yourself.' },
  { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>', title: 'Connect Your AI',        subtitle: 'Choose how to connect your AI provider.' },
  { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>', title: 'Your Preferences',       subtitle: 'Tailor the experience to your liking.' },
  { icon: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>', title: "You're All Set!",        subtitle: 'Everything is ready. Time to build something amazing.' },
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
  color: #f0ead6;
  background: #0d0b07;
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
  background: rgba(249,166,2,0.10);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 24px;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #F9A602, #818cf8, #F9A602);
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
  background: rgba(249,166,2,0.10);
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
  border: 2px solid rgba(249,166,2,0.10);
  background: #0d0b07;
  color: #8a7e6a;
}

.step-dot.current {
  border-color: #F9A602;
  background: #F9A602;
  color: #fff;
  transform: scale(1.1);
  box-shadow: 0 0 0 4px rgba(249,166,2,0.15), 0 0 16px rgba(249,166,2,0.3);
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
  background: #1a1610;
  border: 1px solid rgba(249,166,2,0.10);
  border-radius: 12px;
  padding: 36px 32px 32px;
}

.step-icon {
  text-align: center;
  margin-bottom: 12px;
  line-height: 1;
  color: #F9A602;
}

.step-title {
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  letter-spacing: -0.3px;
  margin-bottom: 6px;
  color: #f0ead6;
}

.step-subtitle {
  font-size: 14px;
  color: #8a7e6a;
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
  background: #0d0b07;
  border: 1px solid rgba(249,166,2,0.10);
  border-radius: 8px;
  color: #f0ead6;
  font-family: inherit;
  font-size: 14px;
  padding: 18px 14px 8px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  min-height: 52px;
}

.float-field input:focus,
.float-field select:focus {
  border-color: #F9A602;
  box-shadow: 0 0 0 2px rgba(249,166,2,0.12);
}

.float-field label {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 14px;
  color: #8a7e6a;
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
  color: #F9A602;
}

/* ── Avatar Grid ──────────────────────────────────────────────────────── */
.avatar-section-label {
  font-size: 13px;
  color: #8a7e6a;
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
  outline: 2px solid #F9A602;
  outline-offset: 2px;
}

.avatar-cell.selected {
  border-color: #F9A602;
  background: rgba(249,166,2,0.12);
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
  border: 1px solid rgba(249,166,2,0.10);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: #8a7e6a;
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
  border-color: rgba(249,166,2,0.3);
  color: #f0ead6;
}

.provider-card:focus-visible {
  outline: 2px solid #F9A602;
  outline-offset: 2px;
}

.provider-card.active {
  border-color: #F9A602;
  background: rgba(249,166,2,0.08);
  color: #f0ead6;
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
  color: #f0ead6;
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
  outline: 2px solid #F9A602;
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
  color: #8a7e6a;
}

.skip-hint a {
  color: #8a7e6a;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s;
}

.skip-hint a:hover { color: #f0ead6; }

/* ── Auth Method Tabs ─────────────────────────────────────────────────── */
.auth-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(249,166,2,0.15);
  background: #0d0b07;
}

.auth-tab {
  flex: 1;
  padding: 10px 16px;
  background: transparent;
  border: none;
  color: #8a7e6a;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
  position: relative;
  min-height: 40px;
}

.auth-tab:hover {
  color: #f0ead6;
  background: rgba(249,166,2,0.05);
}

.auth-tab.active {
  color: #f0ead6;
  background: rgba(249,166,2,0.12);
}

.auth-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #F9A602;
}

.auth-tab:focus-visible {
  outline: 2px solid #F9A602;
  outline-offset: -2px;
}

/* ── Auth Tab Content ─────────────────────────────────────────────────── */
.auth-tab-content {
  display: none;
}

.auth-tab-content.active {
  display: block;
  animation: fieldIn 0.25s ease forwards;
}

/* ── OAuth Section ────────────────────────────────────────────────────── */
.oauth-desc {
  font-size: 13px;
  color: #8a7e6a;
  line-height: 1.6;
  margin-bottom: 20px;
}

.oauth-providers {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.oauth-provider-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  background: #0d0b07;
  border: 1px solid rgba(249,166,2,0.12);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;
  text-align: left;
}

.oauth-provider-btn:hover {
  border-color: rgba(249,166,2,0.35);
  background: rgba(249,166,2,0.04);
}

.oauth-provider-btn:focus-visible {
  outline: 2px solid #F9A602;
  outline-offset: 2px;
}

.oauth-provider-btn.connected {
  border-color: #22c55e;
  background: rgba(34,197,94,0.06);
}

.oauth-provider-btn.connecting {
  opacity: 0.7;
  pointer-events: none;
}

.oauth-provider-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(249,166,2,0.08);
  flex-shrink: 0;
}

.oauth-provider-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.oauth-provider-name {
  font-size: 14px;
  font-weight: 600;
  color: #f0ead6;
}

.oauth-provider-status {
  font-size: 12px;
  color: #8a7e6a;
}

.oauth-provider-status.connecting {
  color: #F9A602;
}

.oauth-provider-status.connected {
  color: #22c55e;
}

.oauth-provider-arrow {
  font-size: 16px;
  color: #8a7e6a;
  transition: transform 0.2s ease;
}

.oauth-provider-btn:hover .oauth-provider-arrow {
  transform: translateX(3px);
}

.oauth-provider-btn.connected .oauth-provider-arrow {
  color: #22c55e;
}

.oauth-note {
  font-size: 12px;
  color: #8a7e6a;
  line-height: 1.5;
  padding: 10px 12px;
  background: rgba(249,166,2,0.04);
  border-radius: 8px;
  border-left: 2px solid rgba(249,166,2,0.3);
}

/* ── Token Paste Sections ─────────────────────────────────────────────── */
.token-provider {
  border: 1px solid rgba(249,166,2,0.12);
  border-radius: 10px;
  margin-bottom: 10px;
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.token-provider.connected {
  border-color: #34d399;
}

.token-provider-header {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 14px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.2s ease;
  font-family: inherit;
  text-align: left;
}

.token-provider-header:hover {
  background: rgba(249,166,2,0.04);
}

.token-provider-header:focus-visible {
  outline: 2px solid #F9A602;
  outline-offset: -2px;
}

.token-provider-chevron {
  font-size: 18px;
  color: #8a7e6a;
  transition: transform 0.25s cubic-bezier(0.4,0,0.2,1);
  flex-shrink: 0;
  line-height: 1;
}

.token-provider.expanded .token-provider-chevron {
  transform: rotate(90deg);
}

.token-provider.connected .token-provider-chevron {
  color: #34d399;
}

.token-provider-body {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4,0,0.2,1),
              opacity 0.25s ease,
              padding 0.3s ease;
  padding: 0 16px;
}

.token-provider.expanded .token-provider-body {
  max-height: 300px;
  opacity: 1;
  padding: 0 16px 16px;
}

.token-instructions {
  font-size: 13px;
  color: #8a7e6a;
  line-height: 1.6;
  margin-bottom: 12px;
}

.token-instructions code {
  font-family: 'Geist Mono', 'SF Mono', monospace;
  background: rgba(249,166,2,0.08);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #F9A602;
}

.token-input-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.token-input {
  flex: 1;
  background: #0d0b07;
  border: 1px solid rgba(249,166,2,0.10);
  border-radius: 8px;
  color: #f0ead6;
  font-family: 'Geist Mono', 'SF Mono', monospace;
  font-size: 13px;
  padding: 10px 14px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  min-height: 44px;
  min-width: 0;
}

.token-input:focus {
  border-color: #F9A602;
  box-shadow: 0 0 0 2px rgba(249,166,2,0.12);
}

.token-input::placeholder {
  color: #5a5245;
}

.token-save-btn {
  padding: 0 18px;
  background: #F9A602;
  color: #0d0b07;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, opacity 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
  min-height: 44px;
}

.token-save-btn:hover:not(:disabled) {
  background: #DAA520;
}

.token-save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.token-save-btn:focus-visible {
  outline: 2px solid #F9A602;
  outline-offset: 2px;
}

.token-feedback {
  font-size: 12px;
  margin-top: 6px;
  min-height: 0;
  transition: opacity 0.2s;
}

.token-feedback.success { color: #34d399; }
.token-feedback.error   { color: #f87171; }

/* ── Preference Groups ────────────────────────────────────────────────── */
.pref-group {
  margin-bottom: 20px;
}

.pref-label {
  font-size: 13px;
  font-weight: 500;
  color: #8a7e6a;
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
  border: 1px solid rgba(249,166,2,0.10);
  border-radius: 8px;
  cursor: pointer;
  text-align: center;
  font-size: 13px;
  color: #8a7e6a;
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
  border-color: rgba(249,166,2,0.3);
  color: #f0ead6;
}

.option-card:focus-visible {
  outline: 2px solid #F9A602;
  outline-offset: 2px;
}

.option-card.selected {
  border-color: #F9A602;
  background: rgba(249,166,2,0.08);
  color: #f0ead6;
}

.model-select {
  width: 100%;
  background: #0d0b07;
  border: 1px solid rgba(249,166,2,0.10);
  border-radius: 8px;
  color: #f0ead6;
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
  border-color: #F9A602;
  box-shadow: 0 0 0 2px rgba(249,166,2,0.12);
}

.model-select option {
  background: #1a1610;
  color: #f0ead6;
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
  background: #F9A602;
  color: #0d0b07;
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
  background: #DAA520;
  transform: translateY(-1px);
}

.start-btn:focus-visible {
  outline: 2px solid #F9A602;
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
  outline: 2px solid #F9A602;
  outline-offset: 2px;
}

.btn-ghost {
  background: transparent;
  color: #8a7e6a;
  border: 1px solid rgba(249,166,2,0.10);
}

.btn-ghost:hover {
  color: #f0ead6;
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.1);
}

.btn-primary {
  background: #F9A602;
  color: #0d0b07;
}

.btn-primary:hover {
  background: #DAA520;
}

.btn-primary:active {
  transform: scale(0.98);
}

.skip-link {
  font-size: 12px;
  color: #8a7e6a;
  cursor: pointer;
  text-decoration: none;
  background: none;
  border: none;
  font-family: inherit;
  transition: color 0.15s;
  padding: 8px 4px;
}

.skip-link:hover { color: #f0ead6; }
.skip-link:focus-visible { outline: 2px solid #F9A602; outline-offset: 2px; }

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
      oauth: { anthropic: { status: 'disconnected', email: '' }, google: { status: 'disconnected', email: '' } },
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

    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '-1');
    this.addEventListener('keydown', this._onKeyDown);
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this._onKeyDown);
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
      dot.setAttribute('aria-label', `Step ${i + 1} of ${this._totalSteps}: ${STEP_META[i].title}`);
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
        <p style="text-align:center;color:#8a7e6a;font-size:13px;line-height:1.6;margin-top:8px;">
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

    // Step 2 — API Key / OAuth
    this._viewportEl.appendChild(this._makePanel(2, `
      <div class="step-card">
        <div class="step-icon">${STEP_META[2].icon}</div>
        <h2 class="step-title">${STEP_META[2].title}</h2>
        <p class="step-subtitle">${STEP_META[2].subtitle}</p>

        <div class="auth-tabs" role="tablist" aria-label="Connection method" data-stagger="0">
          <button class="auth-tab active" data-tab="apikey" role="tab" aria-selected="true" aria-controls="tab-apikey" id="tab-btn-apikey">API Key</button>
          <button class="auth-tab" data-tab="oauth" role="tab" aria-selected="false" aria-controls="tab-oauth" id="tab-btn-oauth">Subscription (OAuth)</button>
        </div>

        <div class="auth-tab-content active" id="tab-apikey" role="tabpanel" aria-labelledby="tab-btn-apikey" data-stagger="1">
          <div class="provider-cards" id="provider-cards"></div>
          <div class="apikey-row">
            <div class="float-field">
              <input id="inp-apikey" type="password" placeholder=" " autocomplete="off" spellcheck="false" />
              <label for="inp-apikey" id="apikey-label">API Key</label>
            </div>
            <button class="test-btn" id="test-btn">Test</button>
          </div>
          <div class="key-feedback" id="key-feedback"></div>
        </div>

        <div class="auth-tab-content" id="tab-oauth" role="tabpanel" aria-labelledby="tab-btn-oauth" data-stagger="1">
          <p class="oauth-desc">Use your existing Claude or Gemini subscription instead of an API key. Your credentials stay on this server.</p>
          <div class="oauth-providers">
            <div class="token-provider" id="token-provider-anthropic" data-provider="anthropic">
              <button class="token-provider-header" type="button">
                <span class="oauth-provider-icon"><svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#F97316"/></svg></span>
                <span class="oauth-provider-info">
                  <span class="oauth-provider-name">Claude (Anthropic)</span>
                  <span class="oauth-provider-status" id="oauth-status-anthropic">Not connected</span>
                </span>
                <span class="token-provider-chevron">›</span>
              </button>
              <div class="token-provider-body">
                <p class="token-instructions">Run <code>claude setup-token</code> in your terminal, then paste the token below.</p>
                <div class="token-input-row">
                  <input class="token-input" id="token-input-anthropic" type="password" placeholder="Paste your setup token..." autocomplete="off" spellcheck="false" />
                  <button class="token-save-btn" id="token-save-anthropic" type="button">Save</button>
                </div>
                <div class="token-feedback" id="token-feedback-anthropic"></div>
              </div>
            </div>
            <div class="token-provider" id="token-provider-google" data-provider="google">
              <button class="token-provider-header" type="button">
                <span class="oauth-provider-icon"><svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#4285F4"/></svg></span>
                <span class="oauth-provider-info">
                  <span class="oauth-provider-name">Gemini (Google)</span>
                  <span class="oauth-provider-status" id="oauth-status-google">Not connected</span>
                </span>
                <span class="token-provider-chevron">›</span>
              </button>
              <div class="token-provider-body">
                <p class="token-instructions">Paste your Gemini OAuth refresh token below. You can find it in <code>~/.gemini/oauth_creds.json</code> (the <code>refresh_token</code> field).</p>
                <div class="token-input-row">
                  <input class="token-input" id="token-input-google" type="password" placeholder="Paste your refresh token..." autocomplete="off" spellcheck="false" />
                  <button class="token-save-btn" id="token-save-google" type="button">Save</button>
                </div>
                <div class="token-feedback" id="token-feedback-google"></div>
              </div>
            </div>
          </div>
          <p class="oauth-note">Tokens are stored securely on this server. No API charges — uses your subscription quota.</p>
        </div>

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
            <div class="option-card selected" data-value="dark" tabindex="0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark</div>
          </div>
        </div>

        <div class="pref-group" data-stagger="1">
          <div class="pref-label">Language</div>
          <div class="option-cards" id="lang-cards">
            <div class="option-card selected" data-value="en" tabindex="0"><svg width="20" height="20" viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="inherit">EN</text></svg> English</div>
            <div class="option-card" data-value="fr" tabindex="0"><svg width="20" height="20" viewBox="0 0 24 24"><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="600" fill="currentColor" font-family="inherit">FR</text></svg> Français</div>
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
    this._wireAuthTabs();
    this._wireApiKey();
    this._wireOAuth();
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

  /* ── Wire: Auth Tabs ──────────────────────────────────────────────────── */
  _wireAuthTabs() {
    const tabs = this.shadowRoot.querySelectorAll('.auth-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        // Update tab active state
        tabs.forEach(t => {
          const isActive = t.dataset.tab === target;
          t.classList.toggle('active', isActive);
          t.setAttribute('aria-selected', String(isActive));
        });
        // Update tab content
        const apiPanel = this.shadowRoot.getElementById('tab-apikey');
        const oauthPanel = this.shadowRoot.getElementById('tab-oauth');
        if (apiPanel) {
          apiPanel.classList.toggle('active', target === 'apikey');
        }
        if (oauthPanel) {
          oauthPanel.classList.toggle('active', target === 'oauth');
        }
      });
    });
  }

  /* ── Wire: OAuth / Token Paste ────────────────────────────────────── */
  _wireOAuth() {
    // Toggle expand/collapse on provider headers
    const providers = this.shadowRoot.querySelectorAll('.token-provider');
    providers.forEach(provider => {
      const header = provider.querySelector('.token-provider-header');
      header?.addEventListener('click', () => {
        provider.classList.toggle('expanded');
      });
    });

    // Wire save buttons for each provider
    this._wireTokenSave('anthropic', 'token');
    this._wireTokenSave('google', 'oauth');

    // Check existing provider tokens on load
    this._checkProviderTokens();
  }

  /**
   * Wire a token save button for a given provider.
   * @param {string} provider - 'anthropic' or 'google'
   * @param {string} type - 'token' or 'oauth'
   */
  _wireTokenSave(provider, type) {
    const saveBtn = this.shadowRoot.getElementById(`token-save-${provider}`);
    const input = this.shadowRoot.getElementById(`token-input-${provider}`);
    const feedback = this.shadowRoot.getElementById(`token-feedback-${provider}`);

    saveBtn?.addEventListener('click', async () => {
      const token = input?.value?.trim();
      if (!token) {
        if (feedback) {
          feedback.textContent = 'Please paste a token first.';
          feedback.className = 'token-feedback error';
        }
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      if (feedback) { feedback.textContent = ''; feedback.className = 'token-feedback'; }

      try {
        const authToken = localStorage.getItem('scratchy_token');
        const headers = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

        const res = await fetch('/api/auth/provider-token', {
          method: 'POST',
          headers,
          body: JSON.stringify({ provider, type, token }),
        });

        if (res.ok) {
          saveBtn.textContent = '✓ Saved';
          if (feedback) {
            feedback.textContent = 'Connected successfully.';
            feedback.className = 'token-feedback success';
          }
          this._updateOAuthStatus(provider, 'connected');
          // Collapse and mark connected after a short delay
          setTimeout(() => {
            const el = this.shadowRoot.getElementById(`token-provider-${provider}`);
            if (el) {
              el.classList.remove('expanded');
              el.classList.add('connected');
            }
          }, 800);
        } else {
          const data = await res.json().catch(() => ({}));
          saveBtn.textContent = 'Save';
          saveBtn.disabled = false;
          if (feedback) {
            feedback.textContent = data.error || 'Failed to save token.';
            feedback.className = 'token-feedback error';
          }
        }
      } catch {
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
        if (feedback) {
          feedback.textContent = 'Network error — try again.';
          feedback.className = 'token-feedback error';
        }
      }
    });
  }

  /**
   * Check which providers already have tokens configured.
   * Called on component mount — marks connected providers.
   */
  async _checkProviderTokens() {
    try {
      const authToken = localStorage.getItem('scratchy_token');
      const headers = {};
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch('/api/auth/provider-tokens', { headers });
      if (!res.ok) return;

      const data = await res.json();
      const providers = Array.isArray(data) ? data : [];

      for (const p of providers) {
        const name = typeof p === 'string' ? p : p?.provider;
        if (!name) continue;
        this._updateOAuthStatus(name, 'connected');
        const el = this.shadowRoot.getElementById(`token-provider-${name}`);
        if (el) el.classList.add('connected');
      }

      // Also handle object-style response { anthropic: true, google: true }
      if (!Array.isArray(data) && typeof data === 'object') {
        for (const [name, val] of Object.entries(data)) {
          if (val) {
            this._updateOAuthStatus(name, 'connected');
            const el = this.shadowRoot.getElementById(`token-provider-${name}`);
            if (el) el.classList.add('connected');
          }
        }
      }
    } catch {
      // Silent fail — tokens just won't show as connected
    }
  }

  /**
   * Update OAuth status for a provider.
   * @param {string} provider - 'anthropic' or 'google'
   * @param {'disconnected'|'connecting'|'connected'} status
   * @param {string} [email] - email for connected state
   */
  setOAuthStatus(provider, status, email = '') {
    if (this._data.oauth[provider]) {
      this._data.oauth[provider].status = status;
      this._data.oauth[provider].email = email;
    }
    this._updateOAuthStatus(provider, status, email);
  }

  _updateOAuthStatus(provider, status, email = '') {
    // Update data
    if (this._data.oauth[provider]) {
      this._data.oauth[provider].status = status;
      if (email) this._data.oauth[provider].email = email;
    }

    // Update provider container state
    const container = this.shadowRoot.getElementById(`token-provider-${provider}`);
    if (container) {
      container.classList.remove('connected');
      if (status === 'connected') container.classList.add('connected');
    }

    // Update status text
    const statusEl = this.shadowRoot.getElementById(`oauth-status-${provider}`);
    if (statusEl) {
      statusEl.classList.remove('connecting', 'connected');
      if (status === 'disconnected') {
        statusEl.textContent = 'Not connected';
      } else if (status === 'connecting') {
        statusEl.textContent = 'Saving…';
        statusEl.classList.add('connecting');
      } else if (status === 'connected') {
        statusEl.textContent = email ? `Connected as ${email}` : 'Connected';
        statusEl.classList.add('connected');
      }
    }

    // Update chevron for connected state
    const chevron = container?.querySelector('.token-provider-chevron');
    if (chevron) {
      chevron.textContent = status === 'connected' ? '✓' : '›';
    }
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

    // Save API key via BYOK system (upgrades accessTier)
    if (this._data.apiKey.key) {
      try {
        const res = await fetch('/api/byok/keys', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            key: this._data.apiKey.key,
            label: this._data.apiKey.provider || 'default',
          }),
        });
        if (res.ok) {
          console.log('[wizard] API key saved via BYOK');
        } else {
          const err = await res.json().catch(() => ({}));
          console.warn('[wizard] BYOK save failed:', err.error);
        }
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
        oauth: JSON.parse(JSON.stringify(this._data.oauth)),
        preferences: { ...this._data.preferences },
      },
    }));
  }
}

customElements.define('sc-setup-wizard', ScSetupWizard);
