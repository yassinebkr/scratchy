/**
 * Scratchy v2 — Auth Web Component
 * <sc-auth> — Premium glassmorphism Login / Signup with animated tabs,
 *              password strength, social login, passkey support,
 *              trust signals, welcome transition, error shake,
 *              loading spinner, mobile-first design.
 *
 * Properties:  mode ('login'|'signup'), error (string), loading (boolean)
 * Events:      auth-login   { email, password }
 *              auth-signup  { email, password, name }
 *              auth-social  { provider }
 *              auth-passkey {}
 *              auth-forgot  { email }
 *              auth-back    {}
 *
 * Public API:  reset(), showWelcome(name, avatarUrl?)
 */

/* ─── SVG Icons (inline, no emoji) ─────────────────────── */
const ICON_GOOGLE = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;

const ICON_GITHUB = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.7.114 2.5.34 1.9-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.16.59.67.5A10.01 10.01 0 0 0 22 12c0-5.523-4.477-10-10-10z"/></svg>`;

const ICON_BACK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`;

const ICON_EYE_CLOSED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

const ICON_EYE_OPEN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

const ICON_FINGERPRINT = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-3.5 2.5-6 6-6 3 0 5.5 2 6 5"/><path d="M12 12v7.5"/><path d="M8 15c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M16 16c0 2.5-1 4-2.5 5.5"/><path d="M20 21c-1-1.5-2-3-2-5"/></svg>`;

const ICON_SHIELD = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;

const ICON_LOCK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

const ICON_EYE_OFF_SMALL = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

/* ─── Styles ───────────────────────────────────────────── */
const STYLES = /* css */ `
/* ─── reset & host ─────────────────────────────────────── */
:host {
  --bg:            #0d0b07;
  --surface:       rgba(26,22,16,0.85);
  --surface-hover: rgba(36,32,22,0.9);
  --border:        rgba(249,166,2,0.10);
  --border-glass:  rgba(249,166,2,0.08);
  --border-subtle: rgba(249,166,2,0.05);
  --radius:        8px;
  --radius-lg:     16px;
  --text:          #f0ead6;
  --muted:         #8a7e6a;
  --accent:        #F9A602;
  --accent-hover:  #DAA520;
  --accent-glow:   rgba(249,166,2,0.20);
  --accent-subtle: rgba(249,166,2,0.06);
  --danger:        #f87171;
  --danger-glow:   rgba(248,113,113,0.15);
  --success:       #4ade80;
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
  filter: blur(120px);
  opacity: 0.30;
  animation: meshFloat 25s ease-in-out infinite alternate;
}

.bg-mesh::before {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, var(--accent) 0%, transparent 70%);
  top: -15%;
  left: -10%;
}

.bg-mesh::after {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, var(--accent-hover) 0%, transparent 70%);
  bottom: -20%;
  right: -10%;
  animation-delay: -12s;
  animation-direction: alternate-reverse;
}

@keyframes meshFloat {
  0%   { transform: translate(0, 0) scale(1); }
  33%  { transform: translate(40px, -30px) scale(1.08); }
  66%  { transform: translate(-20px, 20px) scale(0.95); }
  100% { transform: translate(10px, -10px) scale(1.03); }
}

/* ─── back link ────────────────────────────────────────── */
.back-link {
  position: absolute;
  top: 24px;
  left: clamp(16px, 4vw, 48px);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--muted);
  font-family: var(--font);
  font-size: 14px;
  cursor: pointer;
  padding: 12px 14px;
  min-height: 44px;
  min-width: 44px;
  border-radius: var(--radius);
  transition: color 0.2s, background 0.2s;
  z-index: 10;
}

.back-link:hover { color: var(--text); background: rgba(255,255,255,0.06); }
.back-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.back-link svg { flex-shrink: 0; }

/* ─── glass card ───────────────────────────────────────── */
.auth-card {
  position: relative;
  z-index: 1;
  background: var(--surface);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-lg);
  padding: 44px 40px 36px;
  width: 100%;
  max-width: 440px;
  margin: 16px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03),
    0 8px 40px rgba(0,0,0,0.45),
    0 2px 12px rgba(0,0,0,0.25);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  animation: cardEntrance 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
}

@keyframes cardEntrance {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* ─── logo ─────────────────────────────────────────────── */
.logo {
  text-align: center;
  margin-bottom: 32px;
}

.logo h1 {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #f0ead6 30%, var(--accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1.2;
}

.logo p {
  color: var(--muted);
  font-size: 14px;
  margin-top: 8px;
  transition: opacity 0.25s ease;
  line-height: 1.4;
}

/* ─── tab switcher ─────────────────────────────────────── */
.tabs {
  display: flex;
  position: relative;
  margin-bottom: 28px;
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
  padding: 12px 0 14px;
  cursor: pointer;
  transition: color 0.25s ease;
  position: relative;
  z-index: 1;
  min-height: 44px;
}

.tab:hover { color: var(--text); }
.tab[aria-selected="true"] { color: var(--text); font-weight: 600; }
.tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 4px;
}

.tab-indicator {
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 50%;
  height: 2px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 0 10px var(--accent-glow);
}

.tab-indicator[data-tab="signup"] {
  transform: translateX(100%);
}

/* ─── passkey section ──────────────────────────────────── */
.passkey-section {
  display: none;
  margin-bottom: 20px;
}

.passkey-section.available { display: block; }

.passkey-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: var(--accent-subtle);
  border: 1px solid rgba(249,166,2,0.18);
  border-radius: var(--radius);
  color: var(--accent);
  font-family: var(--font);
  font-size: 14px;
  font-weight: 600;
  padding: 14px 16px;
  min-height: 48px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.15s, box-shadow 0.2s;
  letter-spacing: 0.01em;
}

.passkey-btn:hover {
  background: rgba(249,166,2,0.12);
  border-color: rgba(249,166,2,0.30);
  box-shadow: 0 0 16px rgba(249,166,2,0.08);
}

.passkey-btn:active { transform: scale(0.985); }

.passkey-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.passkey-btn svg {
  flex-shrink: 0;
  stroke: var(--accent);
}

.passkey-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.passkey-divider::before,
.passkey-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

/* ─── social buttons ───────────────────────────────────── */
.social-row {
  display: flex;
  gap: 12px;
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
  padding: 12px 14px;
  min-height: 44px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.15s, box-shadow 0.2s;
}

.social-btn:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.14);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.social-btn:active { transform: scale(0.98); }

.social-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
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
  margin-bottom: 24px;
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
  gap: 18px;
}

/* ─── floating-label field ─────────────────────────────── */
.field {
  position: relative;
}

.field .input-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
}

.field input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  padding: 22px 12px 8px;
  height: 52px;
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
  caret-color: var(--accent);
}

.field input::placeholder {
  color: transparent;
}

.field label {
  position: absolute;
  left: 13px;
  top: 16px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 400;
  pointer-events: none;
  transform-origin: left center;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              font-size 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
              top 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Float the label when focused or has value */
.field input:focus + label,
.field input:not(:placeholder-shown) + label {
  top: 7px;
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
  max-height: 80px;
  opacity: 1;
}

/* ─── password strength indicator ──────────────────────── */
.strength-bar {
  display: flex;
  gap: 4px;
  height: 0;
  opacity: 0;
  overflow: hidden;
  transition: opacity 0.25s ease, height 0.25s ease, margin-top 0.25s ease;
}

.strength-bar.visible { opacity: 1; height: 3px; margin-top: 8px; }

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

.strength-bar[data-score="4"] .bar { background: var(--success); }

.strength-label {
  font-size: 11px;
  text-align: right;
  height: 0;
  overflow: hidden;
  transition: color 0.25s ease, opacity 0.25s ease, height 0.25s ease, margin-top 0.25s ease;
  opacity: 0;
}

.strength-label.visible { opacity: 1; height: 15px; margin-top: 4px; }

.strength-label[data-score="1"] { color: #ef4444; }
.strength-label[data-score="2"] { color: #eab308; }
.strength-label[data-score="3"] { color: #22c55e; }
.strength-label[data-score="4"] { color: var(--success); }

/* ─── password reveal toggle ───────────────────────────── */
.pw-toggle {
  position: absolute;
  right: 1px;
  top: 1px;
  bottom: 1px;
  width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 0 calc(var(--radius) - 1px) calc(var(--radius) - 1px) 0;
  cursor: pointer;
  color: var(--muted);
  transition: color 0.2s, background 0.15s;
  z-index: 1;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.pw-toggle:hover { color: var(--text); background: rgba(255,255,255,0.04); }
.pw-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 4px;
}

.pw-toggle .icon-eye-open,
.pw-toggle .icon-eye-closed { display: none; }

.pw-toggle[aria-pressed="false"] .icon-eye-closed { display: block; }
.pw-toggle[aria-pressed="true"] .icon-eye-open { display: block; }

/* ─── forgot password ──────────────────────────────────── */
.forgot-row {
  text-align: right;
  margin-top: -8px;
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
  padding: 4px 2px;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
}

.forgot-link:hover { color: var(--accent); }
.forgot-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

/* ─── error message ────────────────────────────────────── */
.error-msg {
  color: var(--danger);
  font-size: 13px;
  text-align: center;
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.25s ease, opacity 0.25s ease, padding 0.25s ease;
  opacity: 0;
  padding: 0;
  line-height: 1.4;
}

.error-msg[role="alert"] {
  /* ARIA live region — always present, content changes announced */
}

.error-msg.active {
  max-height: 60px;
  opacity: 1;
  padding: 4px 0;
}

/* ─── submit button ────────────────────────────────────── */
.submit-btn {
  position: relative;
  margin-top: 4px;
  background: var(--accent);
  color: #0d0b07;
  border: none;
  border-radius: var(--radius);
  padding: 14px 16px;
  font-family: var(--font);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s, opacity 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  letter-spacing: 0.01em;
}

.submit-btn:hover:not(:disabled) {
  background: var(--accent-hover);
  box-shadow: 0 4px 16px rgba(249,166,2,0.25);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.985);
}

.submit-btn:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 2px;
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
  border: 2.5px solid rgba(13,11,7,0.25);
  border-top-color: #0d0b07;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s;
  animation: spin 0.65s linear infinite;
}

.submit-btn.loading .spinner { opacity: 1; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ─── trust signals ────────────────────────────────────── */
.trust-signals {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
  flex-wrap: wrap;
}

.trust-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
}

.trust-badge svg {
  flex-shrink: 0;
  opacity: 0.7;
}

/* ─── bottom toggle ────────────────────────────────────── */
.toggle-row {
  text-align: center;
  margin-top: 24px;
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

.toggle-row a:hover { color: var(--accent-hover); }
.toggle-row a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
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
  animation: shake 0.35s ease-in-out;
}

/* ─── validation inline ────────────────────────────────── */
.field input.invalid {
  border-color: var(--danger);
}

.field input.invalid:focus {
  box-shadow: 0 0 0 3px var(--danger-glow);
}

/* ─── welcome overlay ──────────────────────────────────── */
.welcome-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--radius-lg);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  gap: 16px;
  padding: 40px;
  text-align: center;
}

.welcome-overlay.active {
  opacity: 1;
  pointer-events: auto;
}

.welcome-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 24px var(--accent-glow);
  animation: welcomePulse 2s ease-in-out infinite;
}

.welcome-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.welcome-avatar svg {
  width: 28px;
  height: 28px;
  stroke: #0d0b07;
}

@keyframes welcomePulse {
  0%, 100% { box-shadow: 0 0 24px var(--accent-glow); }
  50%      { box-shadow: 0 0 36px rgba(249,166,2,0.35); }
}

.welcome-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
}

.welcome-sub {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.4;
}

.welcome-dots {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.welcome-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.3;
  animation: dotBounce 1.4s ease-in-out infinite;
}

.welcome-dots span:nth-child(2) { animation-delay: 0.16s; }
.welcome-dots span:nth-child(3) { animation-delay: 0.32s; }

@keyframes dotBounce {
  0%, 80%, 100% { opacity: 0.3; transform: scale(1); }
  40% { opacity: 1; transform: scale(1.3); }
}

/* ─── mobile ───────────────────────────────────────────── */
@media (max-width: 480px) {
  .auth-card {
    max-width: 100%;
    margin: 0;
    border-radius: 0;
    min-height: 100dvh;
    padding: 60px 24px env(safe-area-inset-bottom, 32px);
    display: flex;
    flex-direction: column;
    justify-content: center;
    border: none;
    animation: none;
  }

  .bg-mesh::before,
  .bg-mesh::after {
    opacity: 0.18;
  }

  .back-link {
    top: 16px;
    left: 8px;
  }

  .social-row {
    gap: 10px;
  }

  .trust-signals {
    gap: 12px;
  }
}

/* ─── reduced motion ───────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.1s !important;
  }

  .auth-card {
    animation: none;
  }

  .bg-mesh::before,
  .bg-mesh::after {
    animation: none;
  }

  .shake {
    animation: none;
  }

  .welcome-avatar {
    animation: none;
    box-shadow: 0 0 24px var(--accent-glow);
  }

  .welcome-dots span {
    animation: none;
    opacity: 0.6;
  }
}

/* ─── high contrast mode ───────────────────────────────── */
@media (forced-colors: active) {
  .submit-btn {
    border: 2px solid ButtonText;
  }

  .social-btn {
    border: 1px solid ButtonText;
  }

  .tab[aria-selected="true"] {
    border-bottom: 2px solid Highlight;
  }
}
`;

/* ─── HTML Template ────────────────────────────────────── */
const HTML = /* html */ `
<div class="bg-mesh"></div>

<button class="back-link" id="back-link" type="button" aria-label="Back to landing page">
  ${ICON_BACK}
  Back
</button>

<div class="auth-card" id="card">
  <!-- Welcome overlay (shown after successful login) -->
  <div class="welcome-overlay" id="welcome-overlay" aria-live="polite">
    <div class="welcome-avatar" id="welcome-avatar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </div>
    <div class="welcome-text" id="welcome-text">Welcome back</div>
    <div class="welcome-sub" id="welcome-sub">Preparing your workspace...</div>
    <div class="welcome-dots"><span></span><span></span><span></span></div>
  </div>

  <div class="logo">
    <h1>Scratchy</h1>
    <p id="subtitle">Welcome back</p>
  </div>

  <!-- Tab switcher -->
  <div class="tabs" role="tablist" aria-label="Authentication method">
    <button class="tab" id="tab-login" role="tab" aria-selected="true" aria-controls="panel-login" data-tab="login" type="button">Log in</button>
    <button class="tab" id="tab-signup" role="tab" aria-selected="false" aria-controls="panel-signup" data-tab="signup" type="button">Sign up</button>
    <span class="tab-indicator" id="tab-indicator" data-tab="login"></span>
  </div>

  <!-- Passkey / biometric login -->
  <div class="passkey-section" id="passkey-section" aria-label="Passkey login">
    <button class="passkey-btn" id="btn-passkey" type="button" aria-label="Sign in with passkey or biometric">
      ${ICON_FINGERPRINT}
      <span>Sign in with passkey</span>
    </button>
    <div class="passkey-divider">or use credentials</div>
  </div>

  <!-- Social login -->
  <div class="social-row">
    <button class="social-btn" id="btn-google" type="button" aria-label="Continue with Google">
      ${ICON_GOOGLE}
      <span>Google</span>
    </button>
    <button class="social-btn" id="btn-github" type="button" aria-label="Continue with GitHub">
      ${ICON_GITHUB}
      <span>GitHub</span>
    </button>
  </div>

  <div class="divider" aria-hidden="true">or</div>

  <!-- Form -->
  <form id="auth-form" autocomplete="on" novalidate>
    <div class="field name-field" id="name-field">
      <div class="input-wrap">
        <input id="name" name="name" type="text" placeholder=" " autocomplete="name" aria-label="Full name" />
        <label for="name">Full name</label>
      </div>
    </div>

    <div class="field">
      <div class="input-wrap">
        <input id="email" name="email" type="text" placeholder=" " autocomplete="username" inputmode="email" required aria-required="true" aria-label="Email or username" />
        <label for="email">Email or username</label>
      </div>
    </div>

    <div class="field">
      <div class="input-wrap">
        <input id="password" name="password" type="password" placeholder=" " autocomplete="current-password" required aria-required="true" aria-label="Password" minlength="8" enterkeyhint="go" style="padding-right:44px" />
        <label for="password">Password</label>
        <button type="button" class="pw-toggle" id="pw-toggle" tabindex="0" aria-label="Show password" aria-pressed="false">
          <span class="icon-eye-closed">${ICON_EYE_CLOSED}</span>
          <span class="icon-eye-open">${ICON_EYE_OPEN}</span>
        </button>
      </div>
      <div class="strength-bar" id="strength-bar" role="progressbar" aria-label="Password strength" aria-valuemin="0" aria-valuemax="4" aria-valuenow="0">
        <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
      </div>
      <div class="strength-label" id="strength-label" aria-live="polite"></div>
    </div>

    <div class="forgot-row" id="forgot-row">
      <button class="forgot-link" id="forgot-link" type="button">Forgot password?</button>
    </div>

    <div class="error-msg" id="error" role="alert" aria-live="assertive"></div>

    <button type="submit" class="submit-btn" id="submit-btn" aria-label="Log in">
      <span class="btn-label" id="btn-label">Log in</span>
      <div class="spinner" aria-hidden="true"></div>
    </button>
  </form>

  <!-- Trust signals -->
  <div class="trust-signals" aria-label="Security information">
    <span class="trust-badge">${ICON_LOCK} Encrypted</span>
    <span class="trust-badge">${ICON_SHIELD} Privacy-first</span>
    <span class="trust-badge">${ICON_EYE_OFF_SMALL} Your data stays yours</span>
  </div>

  <div class="toggle-row">
    <span id="toggle-msg">Don't have an account? </span>
    <a id="toggle-link" role="button" tabindex="0">Sign up</a>
  </div>
</div>
`;

/* ─── Component Class ──────────────────────────────────── */
export class ScAuth extends HTMLElement {

  static get observedAttributes() { return ['mode', 'error', 'loading']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    while (wrapper.firstChild) this.shadowRoot.appendChild(wrapper.firstChild);

    this._mode = 'login';
    this._loading = false;
    this._error = '';
    this._pwRevealTimer = null;
    this._passkeysAvailable = false;

    // Cache element references
    this.$card           = this.shadowRoot.getElementById('card');
    this.$form           = this.shadowRoot.getElementById('auth-form');
    this.$email          = this.shadowRoot.getElementById('email');
    this.$password       = this.shadowRoot.getElementById('password');
    this.$name           = this.shadowRoot.getElementById('name');
    this.$nameField      = this.shadowRoot.getElementById('name-field');
    this.$error          = this.shadowRoot.getElementById('error');
    this.$submitBtn      = this.shadowRoot.getElementById('submit-btn');
    this.$btnLabel       = this.shadowRoot.getElementById('btn-label');
    this.$subtitle       = this.shadowRoot.getElementById('subtitle');
    this.$toggleMsg      = this.shadowRoot.getElementById('toggle-msg');
    this.$toggleLink     = this.shadowRoot.getElementById('toggle-link');
    this.$backLink       = this.shadowRoot.getElementById('back-link');
    this.$tabLogin       = this.shadowRoot.getElementById('tab-login');
    this.$tabSignup      = this.shadowRoot.getElementById('tab-signup');
    this.$tabIndicator   = this.shadowRoot.getElementById('tab-indicator');
    this.$strengthBar    = this.shadowRoot.getElementById('strength-bar');
    this.$strengthLbl    = this.shadowRoot.getElementById('strength-label');
    this.$forgotRow      = this.shadowRoot.getElementById('forgot-row');
    this.$pwToggle       = this.shadowRoot.getElementById('pw-toggle');
    this.$btnGoogle      = this.shadowRoot.getElementById('btn-google');
    this.$btnGithub      = this.shadowRoot.getElementById('btn-github');
    this.$btnPasskey     = this.shadowRoot.getElementById('btn-passkey');
    this.$passkeySection = this.shadowRoot.getElementById('passkey-section');
    this.$welcomeOverlay = this.shadowRoot.getElementById('welcome-overlay');
    this.$welcomeText    = this.shadowRoot.getElementById('welcome-text');
    this.$welcomeSub     = this.shadowRoot.getElementById('welcome-sub');
    this.$welcomeAvatar  = this.shadowRoot.getElementById('welcome-avatar');
  }

  /* ─── lifecycle ─────────────────────────────────── */
  connectedCallback() {
    // Form submit
    this.$form.addEventListener('submit', (e) => this._handleSubmit(e));

    // Toggle mode (link + tabs)
    this.$toggleLink.addEventListener('click', () => this._toggleMode());
    this.$toggleLink.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._toggleMode(); }
    });
    this.$tabLogin.addEventListener('click', () => { this.mode = 'login'; });
    this.$tabSignup.addEventListener('click', () => { this.mode = 'signup'; });

    // Tab keyboard navigation
    this.$tabLogin.addEventListener('keydown', (e) => this._handleTabKeydown(e));
    this.$tabSignup.addEventListener('keydown', (e) => this._handleTabKeydown(e));

    // Back button
    this.$backLink.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('auth-back', { bubbles: true, composed: true }));
    });

    // Password input → strength update
    this.$password.addEventListener('input', () => this._updateStrength());

    // Social login
    this.$btnGoogle.addEventListener('click', () => this._handleSocial('google'));
    this.$btnGithub.addEventListener('click', () => this._handleSocial('github'));

    // Passkey
    this.$btnPasskey.addEventListener('click', () => this._handlePasskey());

    // Blur validation
    this.$email.addEventListener('blur', () => this._validateEmail());
    this.$password.addEventListener('blur', () => this._validatePassword());

    // Password reveal toggle
    this.$pwToggle.addEventListener('click', () => this._togglePasswordVisibility());

    // Forgot password
    this.$forgotRow.querySelector('.forgot-link').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('auth-forgot', {
        bubbles: true, composed: true,
        detail: { email: this.$email.value.trim() }
      }));
    });

    // Detect passkey availability
    this._detectPasskeys();

    // Sync initial state
    this._applyMode();

    // Auto-focus after render
    requestAnimationFrame(() => {
      this.$email.focus();
    });
  }

  disconnectedCallback() {
    clearTimeout(this._pwRevealTimer);
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

  /* ─── passkey detection ─────────────────────────── */
  async _detectPasskeys() {
    try {
      if (window.PublicKeyCredential &&
          typeof PublicKeyCredential.isConditionalMediationAvailable === 'function') {
        const available = await PublicKeyCredential.isConditionalMediationAvailable();
        this._passkeysAvailable = available;
      } else if (window.PublicKeyCredential) {
        this._passkeysAvailable = true;
      }
    } catch {
      this._passkeysAvailable = false;
    }
    this._updatePasskeyVisibility();
  }

  _updatePasskeyVisibility() {
    const showPasskey = this._passkeysAvailable && this._mode === 'login';
    this.$passkeySection.classList.toggle('available', showPasskey);
  }

  /* ─── tab keyboard nav (arrow keys) ─────────────── */
  _handleTabKeydown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const target = e.key === 'ArrowRight' ? this.$tabSignup : this.$tabLogin;
      target.focus();
      target.click();
    }
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
    this.$nameField.classList.toggle('visible', signup);

    // Password autocomplete
    this.$password.autocomplete = signup ? 'new-password' : 'current-password';

    // Subtitle
    this.$subtitle.textContent = signup ? 'Create your account' : 'Welcome back';

    // Submit label + aria
    const label = signup ? 'Create account' : 'Log in';
    this.$btnLabel.textContent = label;
    this.$submitBtn.setAttribute('aria-label', label);

    // Toggle row
    this.$toggleMsg.textContent = signup ? 'Already have an account? ' : "Don't have an account? ";
    this.$toggleLink.textContent = signup ? 'Log in' : 'Sign up';

    // Forgot password — login only
    this.$forgotRow.style.display = signup ? 'none' : '';

    // Password strength bar — signup only
    this._updateStrength();

    // Passkey — login only
    this._updatePasskeyVisibility();

    // Remove validation state
    this.$email.classList.remove('invalid');
    this.$password.classList.remove('invalid');

    // Focus management
    requestAnimationFrame(() => {
      (signup ? this.$name : this.$email).focus();
    });
  }

  /* ─── password strength ─────────────────────────── */
  _calcStrength(pw) {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8)  score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw))    score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
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
    this.$strengthBar.setAttribute('aria-valuenow', String(score));
    this.$strengthLbl.setAttribute('data-score', String(score));

    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    this.$strengthLbl.textContent = labels[score] || '';
  }

  /* ─── password visibility toggle ────────────────── */
  _togglePasswordVisibility() {
    const showing = this.$password.type === 'text';
    this.$password.type = showing ? 'password' : 'text';
    this.$pwToggle.setAttribute('aria-pressed', String(!showing));
    this.$pwToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');

    // Security: auto-hide after 3 seconds
    clearTimeout(this._pwRevealTimer);
    if (!showing) {
      this._pwRevealTimer = setTimeout(() => {
        this.$password.type = 'password';
        this.$pwToggle.setAttribute('aria-pressed', 'false');
        this.$pwToggle.setAttribute('aria-label', 'Show password');
      }, 3000);
    }
  }

  /* ─── validation ────────────────────────────────── */
  _validateEmail() {
    const v = this.$email.value.trim();
    // Accept email format OR plain username (3+ chars)
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !/^[a-zA-Z0-9_-]{3,}$/.test(v)) {
      this.$email.classList.add('invalid');
      this.$email.setAttribute('aria-invalid', 'true');
      return false;
    }
    this.$email.classList.remove('invalid');
    this.$email.removeAttribute('aria-invalid');
    return true;
  }

  _validatePassword() {
    const v = this.$password.value;
    if (v && v.length < 8) {
      this.$password.classList.add('invalid');
      this.$password.setAttribute('aria-invalid', 'true');
      return false;
    }
    this.$password.classList.remove('invalid');
    this.$password.removeAttribute('aria-invalid');
    return true;
  }

  /* ─── error display + shake ─────────────────────── */
  _showError(msg) {
    this.$error.textContent = msg;
    this.$error.classList.add('active');

    // Shake card (respects reduced-motion via CSS)
    this.$card.classList.remove('shake');
    void this.$card.offsetWidth; // force reflow
    this.$card.classList.add('shake');
    this.$card.addEventListener('animationend', () => {
      this.$card.classList.remove('shake');
    }, { once: true });
  }

  _clearError() {
    this.$error.textContent = '';
    this.$error.classList.remove('active');
  }

  /* ─── loading state ─────────────────────────────── */
  _applyLoading() {
    this.$submitBtn.disabled = this._loading;
    this.$submitBtn.classList.toggle('loading', this._loading);

    // Disable social + passkey during loading
    this.$btnGoogle.disabled = this._loading;
    this.$btnGithub.disabled = this._loading;
    this.$btnPasskey.disabled = this._loading;

    if (this._loading) {
      this.$submitBtn.setAttribute('aria-busy', 'true');
    } else {
      this.$submitBtn.removeAttribute('aria-busy');
    }
  }

  /* ─── social login ──────────────────────────────── */
  _handleSocial(provider) {
    if (this._loading) return;
    this.dispatchEvent(new CustomEvent('auth-social', {
      bubbles: true,
      composed: true,
      detail: { provider },
    }));
  }

  /* ─── passkey login ─────────────────────────────── */
  _handlePasskey() {
    if (this._loading) return;
    this.dispatchEvent(new CustomEvent('auth-passkey', {
      bubbles: true,
      composed: true,
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
      this._showError('Please enter a valid email or username');
      this.$email.focus();
      return;
    }

    if (!passOk) {
      this._showError('Password must be at least 8 characters');
      this.$password.focus();
      return;
    }

    if (this._mode === 'signup' && !name) {
      this._showError('Please enter your name');
      this.$name.focus();
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

  /* ─── welcome transition ────────────────────────── */
  /**
   * Show a brief welcome transition after successful auth.
   * Non-blocking — auto-dismisses after duration or can be dismissed early.
   * @param {string} displayName - User's name or fallback greeting
   * @param {string} [avatarUrl] - Optional avatar image URL
   * @param {number} [durationMs=2200] - How long to show the welcome
   * @returns {Promise<void>} Resolves when the welcome transition completes
   */
  showWelcome(displayName = '', avatarUrl = null, durationMs = 2200) {
    return new Promise((resolve) => {
      // Set welcome text
      this.$welcomeText.textContent = displayName
        ? `Welcome back, ${displayName}`
        : 'Welcome back';
      this.$welcomeSub.textContent = 'Preparing your workspace...';

      // Set avatar if provided
      if (avatarUrl) {
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = `${displayName || 'User'} avatar`;
        img.onerror = () => img.remove(); // Fallback to SVG icon on error
        this.$welcomeAvatar.innerHTML = '';
        this.$welcomeAvatar.appendChild(img);
      }

      // Show overlay
      this.$welcomeOverlay.classList.add('active');

      // Check reduced motion preference
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const actualDuration = prefersReduced ? Math.min(durationMs, 800) : durationMs;

      setTimeout(() => {
        this.$welcomeOverlay.classList.remove('active');
        resolve();
      }, actualDuration);
    });
  }

  /* ─── public API ────────────────────────────────── */
  reset() {
    this._mode = 'login';
    this._loading = false;
    this._error = '';
    this.$form.reset();
    this._clearError();
    this.$email.classList.remove('invalid');
    this.$email.removeAttribute('aria-invalid');
    this.$password.classList.remove('invalid');
    this.$password.removeAttribute('aria-invalid');
    this.$pwToggle.setAttribute('aria-pressed', 'false');
    this.$pwToggle.setAttribute('aria-label', 'Show password');
    this.$password.type = 'password';
    this.$welcomeOverlay.classList.remove('active');
    clearTimeout(this._pwRevealTimer);
    this._applyMode();
    this._applyLoading();
  }
}

customElements.define('sc-auth', ScAuth);
