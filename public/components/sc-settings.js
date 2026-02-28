/**
 * Scratchy v2 — Settings / Profile Web Component
 * <sc-settings> — Glassmorphism settings panel with profile, security,
 *                  preferences, and danger zone sections.
 *
 * Events:  settings-logout   (user logged out)
 *          settings-close    (back/close clicked)
 */

const STYLES = /* css */ `
/* ─── reset & host ─────────────────────────────────────── */
:host {
  --bg:            #0d0b07;
  --surface:       rgba(26,22,16,0.85);
  --surface-solid: #1a1610;
  --surface-hover: #252015;
  --border:        rgba(249,166,2,0.10);
  --border-glass:  rgba(249,166,2,0.08);
  --radius:        8px;
  --radius-input:  6px;
  --text:          #f0ead6;
  --muted:         #8a7e6a;
  --accent:        #F9A602;
  --accent-hover:  #DAA520;
  --accent-glow:   rgba(249,166,2,0.30);
  --danger:        #ef4444;
  --success:       #22c55e;
  --focus-ring:    0 0 0 2px rgba(249,166,2,0.3);
  --font:          'Geist', system-ui, -apple-system, sans-serif;

  position: fixed;
  inset: 0;
  z-index: 5000;
  display: none;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-family: var(--font);
  font-size: 14px;
  color: var(--text);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

:host([open]) {
  display: flex;
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
  background: radial-gradient(circle, #F9A602 0%, transparent 70%);
  top: -15%;
  left: -10%;
}

.bg-mesh::after {
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, #DAA520 0%, transparent 70%);
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

/* ─── scrollable wrapper ───────────────────────────────── */
.settings-scroll {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 760px;
  height: 100dvh;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 32px 16px 48px;
  scrollbar-width: thin;
  scrollbar-color: rgba(249,166,2,0.15) transparent;
  background: rgba(26,22,16,0.85);
  border: 1px solid rgba(249,166,2,0.10);
  border-radius: 12px;
  margin-top: 48px;
  margin-bottom: 48px;
}

.settings-scroll::-webkit-scrollbar { width: 6px; }
.settings-scroll::-webkit-scrollbar-track { background: transparent; }
.settings-scroll::-webkit-scrollbar-thumb {
  background: rgba(249,166,2,0.15);
  border-radius: 3px;
}

/* ─── header ───────────────────────────────────────────── */
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  color: var(--muted);
  cursor: pointer;
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  flex-shrink: 0;
}

.back-btn:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text);
  border-color: rgba(255,255,255,0.14);
}

.back-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  color: var(--text);
}

.back-btn svg { width: 18px; height: 18px; }

.header h1 {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, #f0ead6 30%, #F9A602 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ─── section card (glass) ─────────────────────────────── */
.section {
  background: var(--surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius);
  padding: 28px 24px;
  margin-bottom: 20px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.03),
    0 8px 40px rgba(0,0,0,0.45),
    0 2px 12px rgba(0,0,0,0.25);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  animation: sectionIn 0.4s ease both;
}

.section:nth-child(1) { animation-delay: 0.05s; }
.section:nth-child(2) { animation-delay: 0.10s; }
.section:nth-child(3) { animation-delay: 0.15s; }
.section:nth-child(4) { animation-delay: 0.20s; }

@keyframes sectionIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 3px solid var(--accent);
}

.section-title svg { width: 18px; height: 18px; color: var(--accent); flex-shrink: 0; }

.section-title .danger-icon { color: var(--danger); }

/* ─── profile section ──────────────────────────────────── */
.profile-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: #0d0b07;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(249,166,2,0.12);
  text-transform: uppercase;
  letter-spacing: 1px;
  user-select: none;
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-info .username {
  font-size: 13px;
  color: var(--muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── field styling (shared) ───────────────────────────── */
.field {
  position: relative;
  margin-bottom: 16px;
}

.field:last-child { margin-bottom: 0; }

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: stretch;
}

input[type="text"],
input[type="password"],
input[type="email"] {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  padding: 10px 12px;
  height: 48px;
  outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
  caret-color: var(--accent);
}

input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

input:disabled, input[readonly] {
  opacity: 0.5;
  cursor: not-allowed;
}

input.invalid {
  border-color: var(--danger);
}

input.invalid:focus {
  box-shadow: 0 0 0 2px rgba(239,68,68,0.3);
}

/* ─── password reveal toggle ───────────────────────────── */
.pw-toggle {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  padding: 4px 6px;
  font-size: 16px;
  line-height: 1;
  transition: color 0.2s;
  z-index: 1;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.pw-toggle:hover { color: var(--text); }
.pw-toggle:focus-visible {
  outline: none;
  color: var(--text);
  box-shadow: var(--focus-ring);
  border-radius: 4px;
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

.strength-bar.visible { opacity: 1; height: 3px; margin-top: 6px; }

.strength-bar .bar {
  flex: 1;
  height: 100%;
  border-radius: 2px;
  background: rgba(255,255,255,0.08);
  transition: background 0.3s ease;
}

.strength-bar[data-score="1"] .bar:nth-child(1) { background: var(--danger); }

.strength-bar[data-score="2"] .bar:nth-child(1),
.strength-bar[data-score="2"] .bar:nth-child(2) { background: var(--accent); }

.strength-bar[data-score="3"] .bar:nth-child(1),
.strength-bar[data-score="3"] .bar:nth-child(2),
.strength-bar[data-score="3"] .bar:nth-child(3) { background: var(--success); }

.strength-bar[data-score="4"] .bar { background: var(--success); }

.strength-label {
  font-size: 11px;
  text-align: right;
  height: 0;
  overflow: hidden;
  opacity: 0;
  transition: color 0.25s ease, opacity 0.25s ease, height 0.25s ease, margin-top 0.25s ease;
}

.strength-label.visible { opacity: 1; height: 15px; margin-top: 4px; }

.strength-label[data-score="1"] { color: var(--danger); }
.strength-label[data-score="2"] { color: var(--accent); }
.strength-label[data-score="3"] { color: var(--success); }
.strength-label[data-score="4"] { color: var(--success); }

/* ─── buttons ──────────────────────────────────────────── */
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: none;
  border-radius: var(--radius-input);
  font-family: var(--font);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 10px 20px;
  min-height: 42px;
  transition: background 0.2s, transform 0.1s, opacity 0.2s, box-shadow 0.2s;
  letter-spacing: 0.01em;
  outline: none;
}

.btn:focus-visible { box-shadow: var(--focus-ring); }
.btn:active:not(:disabled) { transform: scale(0.985); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }

.btn-primary {
  background: var(--accent);
  color: #0d0b07;
}

.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }

.btn-ghost {
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border-glass);
  color: var(--text);
}

.btn-ghost:hover:not(:disabled) {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.14);
}

.btn-danger {
  background: rgba(239,68,68,0.12);
  border: 1px solid rgba(239,68,68,0.2);
  color: var(--danger);
}

.btn-danger:hover:not(:disabled) {
  background: rgba(239,68,68,0.2);
  border-color: rgba(239,68,68,0.35);
}

.btn-danger-solid {
  background: var(--danger);
  color: #fff;
}

.btn-danger-solid:hover:not(:disabled) { background: #dc2626; }

.btn .btn-label { transition: opacity 0.2s; }
.btn.loading .btn-label { opacity: 0; }

.btn .spinner {
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2.5px solid rgba(0,0,0,0.25);
  border-top-color: #0d0b07;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.2s;
  animation: spin 0.65s linear infinite;
}

.btn.loading .spinner { opacity: 1; }

.btn-ghost .spinner,
.btn-danger .spinner {
  border-color: rgba(255,255,255,0.15);
  border-top-color: var(--text);
}

.btn-danger-solid .spinner {
  border-color: rgba(255,255,255,0.3);
  border-top-color: #fff;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ─── inline messages ──────────────────────────────────── */
.msg {
  font-size: 13px;
  text-align: center;
  min-height: 0;
  overflow: hidden;
  opacity: 0;
  transition: min-height 0.25s, opacity 0.25s, margin 0.25s;
  margin: 0;
}

.msg.active {
  min-height: 20px;
  opacity: 1;
  margin-top: 12px;
}

.msg.error { color: var(--danger); }
.msg.success { color: var(--success); }

/* ─── preference rows ─────────────────────────────────── */
.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
}

.pref-row:last-child { border-bottom: none; }

.pref-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pref-label span:first-child {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.pref-label span:last-child {
  font-size: 12px;
  color: var(--muted);
}

/* ─── toggle switch ────────────────────────────────────── */
.toggle {
  position: relative;
  width: 44px;
  height: 24px;
  background: rgba(255,255,255,0.08);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.25s, border-color 0.25s;
  flex-shrink: 0;
}

.toggle.active {
  background: var(--accent);
  border-color: var(--accent);
}

.toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.toggle.active::after {
  transform: translateX(20px);
}

.toggle:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.toggle.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ─── select ───────────────────────────────────────────── */
.select-wrap {
  position: relative;
}

.select-wrap select {
  appearance: none;
  -webkit-appearance: none;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  color: var(--text);
  font-family: var(--font);
  font-size: 13px;
  padding: 6px 30px 6px 10px;
  height: 34px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
}

.select-wrap select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.select-wrap::after {
  content: '';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--muted);
  pointer-events: none;
}

/* ─── danger zone ──────────────────────────────────────── */
.danger-section {
  border-color: rgba(239,68,68,0.15);
}

.danger-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* ─── confirmation dialog overlay ──────────────────────── */
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}

.dialog-overlay.open {
  opacity: 1;
  pointer-events: auto;
}

.dialog {
  background: var(--surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: var(--radius);
  padding: 28px 24px;
  max-width: 400px;
  width: calc(100% - 32px);
  box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  transform: scale(0.95) translateY(8px);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.dialog-overlay.open .dialog {
  transform: scale(1) translateY(0);
}

.dialog h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--danger);
  margin-bottom: 10px;
}

.dialog p {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  margin-bottom: 20px;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

/* ─── skeleton loading ─────────────────────────────────── */
.skeleton {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.04) 25%,
    rgba(255,255,255,0.08) 50%,
    rgba(255,255,255,0.04) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius);
}

@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
}

.skeleton-text {
  height: 16px;
  margin-bottom: 8px;
  width: 60%;
}

.skeleton-text.short { width: 35%; }

/* ─── desktop side-nav layout ──────────────────────────── */
.settings-layout {
  display: block;
}

.settings-nav {
  display: none;
}

.settings-content {
  /* mobile: no special styles, sections flow naturally */
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: color 0.15s, background 0.15s;
  border: none;
  background: none;
  font-family: var(--font);
  width: 100%;
  text-align: left;
  border-left: 2px solid transparent;
}

.nav-item:hover {
  color: var(--text);
  background: rgba(249,166,2,0.06);
}

.nav-item.active {
  color: var(--accent);
  background: rgba(249,166,2,0.08);
  border-left-color: var(--accent);
}

.nav-item svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.nav-separator {
  height: 1px;
  background: var(--border);
  margin: 8px 14px;
}

.esc-hint {
  display: none;
  font-size: 11px;
  color: #5a5040;
  text-align: right;
  opacity: 0.6;
  padding: 0 4px;
  position: absolute;
  top: 16px;
  right: 16px;
}

.esc-hint kbd {
  display: inline-block;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: var(--font);
  font-size: 11px;
  background: rgba(255,255,255,0.04);
  color: var(--muted);
}

@media (min-width: 769px) {
  .settings-scroll {
    max-width: 820px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: calc(100dvh - 96px);
  }

  .settings-layout {
    display: grid;
    grid-template-columns: 200px 1fr;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px 8px 0;
    border-right: 1px solid var(--border);
  }

  .settings-content {
    overflow-y: auto;
    padding-left: 24px;
    scrollbar-width: thin;
    scrollbar-color: rgba(249,166,2,0.15) transparent;
  }

  .settings-content::-webkit-scrollbar { width: 6px; }
  .settings-content::-webkit-scrollbar-track { background: transparent; }
  .settings-content::-webkit-scrollbar-thumb {
    background: rgba(249,166,2,0.15);
    border-radius: 3px;
  }

  .esc-hint {
    display: block;
  }
}

/* ─── mobile responsive ────────────────────────────────── */
@media (max-width: 768px) {
  .settings-scroll {
    max-width: 100%;
    padding: 20px 12px 40px;
    margin-top: 0;
    margin-bottom: 0;
    border-radius: 0;
  }

  .section {
    padding: 22px 18px;
    border-radius: var(--radius);
  }

  .profile-row {
    flex-direction: column;
    text-align: center;
    gap: 14px;
  }

  .profile-info .username {
    text-align: center;
  }

  .danger-actions {
    flex-direction: column;
  }

  .danger-actions .btn {
    width: 100%;
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

/* ─── SVG icons ────────────────────────────────────────── */
const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`;

const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

const ICON_SHIELD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

const ICON_SLIDERS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`;

const ICON_ALERT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

const ICON_EYE_CLOSED = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

const ICON_EYE_OPEN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;

const ICON_LOGOUT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

const HTML = /* html */ `
<div class="bg-mesh"></div>

<div class="settings-scroll" id="scroll">
  <!-- ── Header ─────────────────────────────────── -->
  <div class="header">
    <button class="back-btn" id="back-btn" type="button" aria-label="Close settings">${ICON_BACK}</button>
    <h1>Settings</h1>
  </div>

  <div class="settings-layout">
    <nav class="settings-nav" id="settings-nav">
      <button class="nav-item active" data-section="section-profile" type="button">${ICON_USER} Profile</button>
      <button class="nav-item" data-section="section-security" type="button">${ICON_SHIELD} Security</button>
      <button class="nav-item" data-section="section-prefs" type="button">${ICON_SLIDERS} Preferences</button>
      <div class="nav-separator"></div>
      <button class="nav-item" data-section="section-danger" type="button">${ICON_ALERT} Danger Zone</button>
    </nav>
    <div class="settings-content" id="settings-content">

  <!-- ── Profile Section ────────────────────────── -->
  <div class="section" id="section-profile">
    <div class="section-title">${ICON_USER} Profile</div>

    <div class="profile-row">
      <div class="avatar" id="avatar">?</div>
      <div class="profile-info">
        <div class="field" style="margin-bottom:8px">
          <label class="field-label" for="display-name">Display Name</label>
          <input type="text" id="display-name" placeholder="Your name" />
        </div>
        <div class="username" id="username">@loading...</div>
      </div>
    </div>
  </div>

  <!-- ── Security Section ───────────────────────── -->
  <div class="section" id="section-security">
    <div class="section-title">${ICON_SHIELD} Security</div>

    <form id="pw-form" autocomplete="off" novalidate>
      <div class="field">
        <label class="field-label" for="current-pw">Current Password</label>
        <div class="input-wrap">
          <input type="password" id="current-pw" placeholder="Enter current password" autocomplete="current-password" style="padding-right:40px" />
          <button type="button" class="pw-toggle" data-target="current-pw" aria-label="Toggle password visibility">${ICON_EYE_CLOSED}</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="new-pw">New Password</label>
        <div class="input-wrap">
          <input type="password" id="new-pw" placeholder="Enter new password" autocomplete="new-password" style="padding-right:40px" />
          <button type="button" class="pw-toggle" data-target="new-pw" aria-label="Toggle password visibility">${ICON_EYE_CLOSED}</button>
        </div>
        <div class="strength-bar" id="strength-bar">
          <div class="bar"></div><div class="bar"></div><div class="bar"></div><div class="bar"></div>
        </div>
        <div class="strength-label" id="strength-label" aria-live="polite"></div>
      </div>

      <div class="field">
        <label class="field-label" for="confirm-pw">Confirm New Password</label>
        <div class="input-wrap">
          <input type="password" id="confirm-pw" placeholder="Confirm new password" autocomplete="new-password" style="padding-right:40px" />
          <button type="button" class="pw-toggle" data-target="confirm-pw" aria-label="Toggle password visibility">${ICON_EYE_CLOSED}</button>
        </div>
      </div>

      <div class="msg" id="pw-msg" role="status" aria-live="polite"></div>

      <button type="submit" class="btn btn-primary" id="pw-submit" style="margin-top:8px;width:100%">
        <span class="btn-label">Change Password</span>
        <div class="spinner"></div>
      </button>
    </form>
  </div>

  <!-- ── Preferences Section ────────────────────── -->
  <div class="section" id="section-prefs">
    <div class="section-title">${ICON_SLIDERS} Preferences</div>

    <div class="pref-row">
      <div class="pref-label">
        <span>Theme</span>
        <span>Dark mode (default)</span>
      </div>
      <div class="toggle active disabled" id="toggle-theme" role="switch" aria-checked="true" aria-disabled="true" aria-label="Dark theme" tabindex="0" title="Only dark theme is available"></div>
    </div>

    <div class="pref-row">
      <div class="pref-label">
        <span>Language</span>
        <span>Interface language</span>
      </div>
      <div class="select-wrap">
        <select id="select-lang" aria-label="Interface language">
          <option value="en" selected>English</option>
          <option value="fr">Fran\u00e7ais</option>
        </select>
      </div>
    </div>

    <div class="pref-row">
      <div class="pref-label">
        <span>Notifications</span>
        <span>Push & in-app alerts</span>
      </div>
      <div class="toggle active" id="toggle-notifs" role="switch" aria-checked="true" aria-label="Notifications" tabindex="0"></div>
    </div>
  </div>

  <!-- ── Danger Zone ────────────────────────────── -->
  <div class="section danger-section" id="section-danger">
    <div class="section-title">${ICON_ALERT}<span class="danger-icon" style="color:var(--danger)">Danger Zone</span></div>

    <div class="danger-actions">
      <button type="button" class="btn btn-ghost" id="btn-logout">${ICON_LOGOUT}<span class="btn-label">Log Out</span><div class="spinner"></div></button>
      <button type="button" class="btn btn-danger" id="btn-delete"><span class="btn-label">Delete Account</span><div class="spinner"></div></button>
    </div>
  </div>

    </div><!-- .settings-content -->
  </div><!-- .settings-layout -->

  <div class="esc-hint">Press <kbd>ESC</kbd> to close</div>
</div>

<!-- ── Delete Confirmation Dialog ──────────────── -->
<div class="dialog-overlay" id="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
  <div class="dialog">
    <h3 id="dialog-title">Delete Account</h3>
    <p>This action is permanent and cannot be undone. All your data, conversations, and settings will be permanently deleted.</p>
    <div class="dialog-actions">
      <button type="button" class="btn btn-ghost" id="dialog-cancel">Cancel</button>
      <button type="button" class="btn btn-danger-solid" id="dialog-confirm">Delete Forever</button>
    </div>
  </div>
</div>
`;

export class ScSettings extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    while (wrapper.firstChild) this.shadowRoot.appendChild(wrapper.firstChild);

    this._user = null;
    this._pwRevealTimers = {};

    // Cache refs
    this.$backBtn       = this.shadowRoot.getElementById('back-btn');
    this.$avatar        = this.shadowRoot.getElementById('avatar');
    this.$displayName   = this.shadowRoot.getElementById('display-name');
    this.$username      = this.shadowRoot.getElementById('username');
    this.$pwForm        = this.shadowRoot.getElementById('pw-form');
    this.$currentPw     = this.shadowRoot.getElementById('current-pw');
    this.$newPw         = this.shadowRoot.getElementById('new-pw');
    this.$confirmPw     = this.shadowRoot.getElementById('confirm-pw');
    this.$strengthBar   = this.shadowRoot.getElementById('strength-bar');
    this.$strengthLbl   = this.shadowRoot.getElementById('strength-label');
    this.$pwMsg         = this.shadowRoot.getElementById('pw-msg');
    this.$pwSubmit      = this.shadowRoot.getElementById('pw-submit');
    this.$toggleTheme   = this.shadowRoot.getElementById('toggle-theme');
    this.$selectLang    = this.shadowRoot.getElementById('select-lang');
    this.$toggleNotifs  = this.shadowRoot.getElementById('toggle-notifs');
    this.$btnLogout     = this.shadowRoot.getElementById('btn-logout');
    this.$btnDelete     = this.shadowRoot.getElementById('btn-delete');
    this.$dialogOverlay = this.shadowRoot.getElementById('dialog-overlay');
    this.$dialogCancel  = this.shadowRoot.getElementById('dialog-cancel');
    this.$dialogConfirm = this.shadowRoot.getElementById('dialog-confirm');
    this.$settingsNav   = this.shadowRoot.getElementById('settings-nav');
    this.$settingsContent = this.shadowRoot.getElementById('settings-content');
  }

  /* ─── lifecycle ─────────────────────────────────── */
  connectedCallback() {
    // Close / back
    this.$backBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('settings-close', { bubbles: true, composed: true }));
    });

    // Close on backdrop click (clicking the mesh background outside the settings card)
    this.shadowRoot.querySelector('.bg-mesh').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('settings-close', { bubbles: true, composed: true }));
    });

    // Password eye toggles
    this.shadowRoot.querySelectorAll('.pw-toggle').forEach(btn => {
      btn.addEventListener('click', () => this._togglePwVisibility(btn));
    });

    // New password strength
    this.$newPw.addEventListener('input', () => this._updateStrength());

    // Password form submit
    this.$pwForm.addEventListener('submit', (e) => this._handlePasswordChange(e));

    // Preference toggles
    this.$toggleNotifs.addEventListener('click', () => {
      if (this.$toggleNotifs.classList.contains('disabled')) return;
      this.$toggleNotifs.classList.toggle('active');
      const active = this.$toggleNotifs.classList.contains('active');
      this.$toggleNotifs.setAttribute('aria-checked', String(active));
    });

    // Theme toggle disabled
    this.$toggleTheme.addEventListener('click', () => {
      // no-op; dark only for now
    });

    // Keyboard support for toggle switches (Enter/Space)
    [this.$toggleNotifs, this.$toggleTheme].forEach(toggle => {
      toggle.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggle.click();
        }
      });
    });

    // Language select
    this.$selectLang.addEventListener('change', () => {
      // Store preference locally
      try { localStorage.setItem('sc-lang', this.$selectLang.value); } catch (_) {}
    });

    // Logout
    this.$btnLogout.addEventListener('click', () => this._handleLogout());

    // Delete account
    this.$btnDelete.addEventListener('click', () => this._openDeleteDialog());
    this.$dialogCancel.addEventListener('click', () => this._closeDeleteDialog());
    this.$dialogConfirm.addEventListener('click', () => this._handleDeleteAccount());

    // Close dialog on overlay click
    this.$dialogOverlay.addEventListener('click', (e) => {
      if (e.target === this.$dialogOverlay) this._closeDeleteDialog();
    });

    // Close dialog on Escape, or close settings panel on Escape
    this.shadowRoot.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.$dialogOverlay.classList.contains('open')) {
          this._closeDeleteDialog();
        } else {
          // Close the settings panel
          this.removeAttribute('open');
          this.dispatchEvent(new CustomEvent('settings-close', { bubbles: true, composed: true }));
        }
        return;
      }
      this._trapFocus(e);
    });

    // Load saved language pref
    try {
      const savedLang = localStorage.getItem('sc-lang');
      if (savedLang) this.$selectLang.value = savedLang;
    } catch (_) {}

    // Fetch user
    this._loadUser();

    // ── Side-nav: click to scroll ──────────────────
    this.$settingsNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (!btn) return;
      const sectionId = btn.getAttribute('data-section');
      const section = this.shadowRoot.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // ── Side-nav: IntersectionObserver for active highlight ──
    const navItems = this.$settingsNav.querySelectorAll('.nav-item[data-section]');
    const sectionIds = Array.from(navItems).map(b => b.getAttribute('data-section'));
    this._navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navItems.forEach(b => b.classList.remove('active'));
          const match = this.$settingsNav.querySelector(`.nav-item[data-section="${entry.target.id}"]`);
          if (match) match.classList.add('active');
        }
      });
    }, {
      root: this.$settingsContent,
      threshold: 0.35,
    });
    sectionIds.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) this._navObserver.observe(el);
    });
  }

  disconnectedCallback() {
    // Clear any reveal timers
    Object.values(this._pwRevealTimers).forEach(t => clearTimeout(t));
    // Clean up nav observer
    if (this._navObserver) this._navObserver.disconnect();
  }

  /* ─── API: load user ────────────────────────────── */
  async _loadUser() {
    try {
      const token = localStorage.getItem('scratchy_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/auth/me', { headers });
      if (!res.ok) throw new Error('Failed to load user');
      const data = await res.json();
      this._user = data.user || data;
      this._renderUser();
    } catch (err) {
      this.$avatar.textContent = '?';
      this.$username.textContent = '@unknown';
      this.$displayName.value = '';
    }
  }

  _renderUser() {
    if (!this._user) return;

    const name = this._user.displayName || this._user.name || this._user.username || '';
    const username = this._user.username || this._user.email || '';

    // Initials
    const parts = name.trim().split(/\s+/);
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0])
      : (name.slice(0, 2) || '?');
    this.$avatar.textContent = initials.toUpperCase();

    // Fields
    this.$displayName.value = name;
    this.$username.textContent = '@' + username;
  }

  /* ─── password visibility toggle ────────────────── */
  _togglePwVisibility(btn) {
    const targetId = btn.getAttribute('data-target');
    const input = this.shadowRoot.getElementById(targetId);
    if (!input) return;

    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? ICON_EYE_CLOSED : ICON_EYE_OPEN;
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');

    // Auto-hide after 2s
    if (!showing) {
      clearTimeout(this._pwRevealTimers[targetId]);
      this._pwRevealTimers[targetId] = setTimeout(() => {
        input.type = 'password';
        btn.innerHTML = ICON_EYE_CLOSED;
        btn.setAttribute('aria-label', 'Show password');
      }, 2000);
    } else {
      clearTimeout(this._pwRevealTimers[targetId]);
    }
  }

  /* ─── password strength ─────────────────────────── */
  _calcStrength(pw) {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8)  score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw))   score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    if (pw.length >= 12 && score < 4) score = Math.min(score + 1, 4);
    return score;
  }

  _updateStrength() {
    const pw = this.$newPw.value;
    const score = this._calcStrength(pw);
    const show = pw.length > 0;

    this.$strengthBar.classList.toggle('visible', show);
    this.$strengthLbl.classList.toggle('visible', show);
    this.$strengthBar.setAttribute('data-score', String(score));
    this.$strengthLbl.setAttribute('data-score', String(score));

    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    this.$strengthLbl.textContent = labels[score] || '';
  }

  /* ─── password change ───────────────────────────── */
  async _handlePasswordChange(e) {
    e.preventDefault();
    this._clearPwMsg();

    const currentPassword = this.$currentPw.value;
    const newPassword     = this.$newPw.value;
    const confirmPassword = this.$confirmPw.value;

    // Validation
    if (!currentPassword) {
      this._showPwMsg('Current password is required', 'error');
      this.$currentPw.classList.add('invalid');
      this.$currentPw.focus();
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      this._showPwMsg('New password must be at least 8 characters', 'error');
      this.$newPw.classList.add('invalid');
      this.$newPw.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      this._showPwMsg('Passwords do not match', 'error');
      this.$confirmPw.classList.add('invalid');
      this.$confirmPw.focus();
      return;
    }

    // Clear invalid states
    this.$currentPw.classList.remove('invalid');
    this.$newPw.classList.remove('invalid');
    this.$confirmPw.classList.remove('invalid');

    // Submit
    this._setPwLoading(true);
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to change password');
      }

      this._showPwMsg('Password changed successfully', 'success');
      this.$pwForm.reset();
      this._updateStrength();
    } catch (err) {
      this._showPwMsg(err.message, 'error');
    } finally {
      this._setPwLoading(false);
    }
  }

  _setPwLoading(loading) {
    this.$pwSubmit.disabled = loading;
    this.$pwSubmit.classList.toggle('loading', loading);
  }

  _showPwMsg(text, type) {
    this.$pwMsg.textContent = text;
    this.$pwMsg.className = 'msg active ' + type;
  }

  _clearPwMsg() {
    this.$pwMsg.textContent = '';
    this.$pwMsg.className = 'msg';
  }

  /* ─── logout ────────────────────────────────────── */
  async _handleLogout() {
    this.$btnLogout.disabled = true;
    this.$btnLogout.classList.add('loading');

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch (_) {
      // Even if fetch fails, proceed with logout
    }

    this.dispatchEvent(new CustomEvent('settings-logout', { bubbles: true, composed: true }));

    this.$btnLogout.disabled = false;
    this.$btnLogout.classList.remove('loading');
  }

  /* ─── delete account dialog ─────────────────────── */
  _openDeleteDialog() {
    this._lastFocused = this.shadowRoot.activeElement || document.activeElement;
    this.$dialogOverlay.classList.add('open');
    this.$dialogCancel.focus();
  }

  _closeDeleteDialog() {
    this.$dialogOverlay.classList.remove('open');
    if (this._lastFocused && typeof this._lastFocused.focus === 'function') {
      this._lastFocused.focus();
    }
  }

  /* ─── dialog focus trap ─────────────────────────── */
  _trapFocus(e) {
    if (!this.$dialogOverlay.classList.contains('open')) return;
    if (e.key !== 'Tab') return;

    const focusable = this.$dialogOverlay.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (this.shadowRoot.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (this.shadowRoot.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  async _handleDeleteAccount() {
    this.$dialogConfirm.disabled = true;
    this.$dialogConfirm.textContent = 'Deleting...';

    try {
      const res = await fetch('/api/auth/me', {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete account');
      }

      // Dispatch logout after deletion
      this.dispatchEvent(new CustomEvent('settings-logout', { bubbles: true, composed: true }));
    } catch (err) {
      this.$dialogConfirm.disabled = false;
      this.$dialogConfirm.textContent = 'Delete Forever';
      this._closeDeleteDialog();
      // Show error (borrow the pw-msg area since there's no other inline slot)
      this._showPwMsg(err.message, 'error');
    }
  }
}

customElements.define('sc-settings', ScSettings);
