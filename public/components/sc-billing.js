/**
 * Scratchy v2 — Billing & Plans Web Component
 * <sc-billing> — Glassmorphism billing panel with plan management,
 *                usage dashboard, BYOK key management, and Stripe integration.
 *
 * Events:  billing-close    (back/close clicked or ESC)
 *          billing-upgrade  (plan upgrade initiated, detail: { plan })
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
.billing-scroll {
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

.billing-scroll::-webkit-scrollbar { width: 6px; }
.billing-scroll::-webkit-scrollbar-track { background: transparent; }
.billing-scroll::-webkit-scrollbar-thumb {
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
.section:nth-child(5) { animation-delay: 0.25s; }
.section:nth-child(6) { animation-delay: 0.30s; }

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

/* ─── current plan card ────────────────────────────────── */
.section.current-plan {
  border-color: var(--accent-glow);
  box-shadow:
    0 0 0 1px rgba(249,166,2,0.08),
    0 0 20px rgba(249,166,2,0.06),
    0 8px 40px rgba(0,0,0,0.45),
    0 2px 12px rgba(0,0,0,0.25);
}

.plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.plan-name-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.plan-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
  color: #0d0b07;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.02em;
}

.plan-badge svg { width: 16px; height: 16px; }

.plan-price {
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.plan-details {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
}

.plan-detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
}

.plan-detail-item svg { width: 14px; height: 14px; color: var(--accent); flex-shrink: 0; }

.plan-detail-item .detail-label { color: var(--muted); }
.plan-detail-item .detail-value { color: var(--text); font-weight: 500; }

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.active { background: var(--success); box-shadow: 0 0 6px rgba(34,197,94,0.4); }
.status-dot.canceled { background: var(--danger); }
.status-dot.free { background: var(--muted); }

/* ─── usage dashboard ──────────────────────────────────── */
.usage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.usage-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.usage-card-label {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}

.usage-card-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}

.usage-card-value span {
  font-size: 14px;
  font-weight: 400;
  color: var(--muted);
}

.usage-bar-track {
  width: 100%;
  height: 6px;
  background: rgba(255,255,255,0.06);
  border-radius: 3px;
  overflow: hidden;
}

.usage-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
}

.usage-bar-fill.warning { background: #f59e0b; }
.usage-bar-fill.danger { background: var(--danger); }

.usage-reset {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
  text-align: right;
}

.byok-active-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 10px;
  background: rgba(34,197,94,0.12);
  border: 1px solid rgba(34,197,94,0.2);
  color: var(--success);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ─── plan comparison grid ─────────────────────────────── */
.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.plan-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: border-color 0.25s, box-shadow 0.25s;
  position: relative;
}

.plan-card:hover {
  border-color: rgba(249,166,2,0.18);
}

.plan-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 16px rgba(249,166,2,0.08);
}

.plan-card.active::before {
  content: 'Current';
  position: absolute;
  top: -10px;
  right: 14px;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--accent);
  color: #0d0b07;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.plan-card-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}

.plan-card-price {
  font-size: 28px;
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
}

.plan-card-price span {
  font-size: 13px;
  font-weight: 400;
  color: var(--muted);
}

.plan-card-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.4;
}

.plan-features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.plan-features li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  line-height: 1.4;
}

.plan-features li svg {
  width: 14px;
  height: 14px;
  color: var(--success);
  flex-shrink: 0;
  margin-top: 2px;
}

/* ─── BYOK section ─────────────────────────────────────── */
.byok-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.byok-toggle-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.byok-toggle-info span:first-child {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.byok-toggle-info span:last-child {
  font-size: 12px;
  color: var(--muted);
}

.byok-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.byok-input-row input {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
  padding: 10px 12px;
  height: 42px;
  outline: none;
  transition: border-color 0.25s ease, box-shadow 0.25s ease;
  caret-color: var(--accent);
}

.byok-input-row input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.byok-input-row input.invalid {
  border-color: var(--danger);
}

.byok-input-row input.invalid:focus {
  box-shadow: 0 0 0 2px rgba(239,68,68,0.3);
}

.byok-provider-hint {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 12px;
  min-height: 18px;
  transition: color 0.2s;
}

.byok-provider-hint.detected {
  color: var(--accent);
}

.byok-keys-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.byok-key-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-input);
  padding: 10px 14px;
  transition: border-color 0.2s;
}

.byok-key-chip:hover {
  border-color: rgba(249,166,2,0.18);
}

.byok-key-provider {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(249,166,2,0.08);
  color: var(--accent);
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
}

.byok-key-info {
  flex: 1;
  min-width: 0;
}

.byok-key-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.byok-key-masked {
  font-size: 12px;
  color: var(--muted);
  font-family: 'SF Mono', 'Fira Code', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.byok-key-meta {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.7;
}

.byok-key-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-input);
  color: var(--muted);
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
  flex-shrink: 0;
}

.byok-key-delete:hover {
  color: var(--danger);
  background: rgba(239,68,68,0.08);
  border-color: rgba(239,68,68,0.15);
}

.byok-key-delete:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(239,68,68,0.3);
}

.byok-key-delete svg { width: 16px; height: 16px; }

.byok-empty {
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  padding: 16px 0;
}

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

.btn-sm {
  padding: 6px 14px;
  min-height: 34px;
  font-size: 13px;
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

.btn-ghost .spinner {
  border-color: rgba(255,255,255,0.15);
  border-top-color: var(--text);
}

@keyframes spin { to { transform: rotate(360deg); } }

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

.skeleton-text {
  height: 16px;
  margin-bottom: 8px;
  width: 60%;
}

.skeleton-text.short { width: 35%; }

.skeleton-bar {
  height: 6px;
  width: 100%;
  margin-top: 8px;
}

.skeleton-badge {
  height: 32px;
  width: 100px;
  border-radius: 20px;
}

/* ─── pulse animation for loading ──────────────────────── */
.pulse {
  animation: pulse 1.8s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ─── manage subscription row ──────────────────────────── */
.manage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.manage-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.manage-info span:first-child {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.manage-info span:last-child {
  font-size: 12px;
  color: var(--muted);
}

/* ─── desktop side-nav layout ──────────────────────────── */
.billing-layout {
  display: block;
}

.billing-nav {
  display: none;
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

.nav-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
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
  .billing-scroll {
    max-width: 920px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: calc(100dvh - 96px);
  }

  .billing-layout {
    display: grid;
    grid-template-columns: 200px 1fr;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .billing-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px 8px 0;
    border-right: 1px solid var(--border);
  }

  .billing-content {
    overflow-y: auto;
    padding-left: 24px;
    scrollbar-width: thin;
    scrollbar-color: rgba(249,166,2,0.15) transparent;
  }

  .billing-content::-webkit-scrollbar { width: 6px; }
  .billing-content::-webkit-scrollbar-track { background: transparent; }
  .billing-content::-webkit-scrollbar-thumb {
    background: rgba(249,166,2,0.15);
    border-radius: 3px;
  }

  .esc-hint {
    display: block;
  }
}

/* ─── mobile responsive ────────────────────────────────── */
@media (max-width: 768px) {
  .billing-scroll {
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

  .plans-grid {
    grid-template-columns: 1fr;
  }

  .usage-grid {
    grid-template-columns: 1fr 1fr;
  }

  .plan-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .manage-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .manage-row .btn {
    width: 100%;
  }

  .byok-input-row {
    flex-direction: column;
  }

  .byok-input-row .btn {
    width: 100%;
  }

  .bg-mesh::before,
  .bg-mesh::after {
    opacity: 0.2;
  }
}

@media (max-width: 400px) {
  .usage-grid {
    grid-template-columns: 1fr;
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
const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';

const ICON_CREDIT_CARD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>';

const ICON_BAR_CHART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>';

const ICON_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>';

const ICON_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';

const ICON_SETTINGS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

const ICON_EXTERNAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';

const ICON_ZAPP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';

const ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>';

const ICON_SERVER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>';

const ICON_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';

const ICON_STAR = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

const ICON_INFINITY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg>';

/* ─── provider icons (small text badges) ───────────────── */
const PROVIDER_LABELS = {
  anthropic: 'ANT',
  openai: 'OAI',
  google: 'GGL',
  openrouter: 'OR',
  unknown: '???'
};

const PROVIDER_COLORS = {
  anthropic: '#d4a574',
  openai: '#74aa9c',
  google: '#4285f4',
  openrouter: '#c084fc',
  unknown: '#8a7e6a'
};

/* ─── plans data ───────────────────────────────────────── */
const PLANS = [
  {
    id: 'self-hosted',
    name: 'Self-Hosted',
    price: 'Free',
    priceSuffix: '',
    desc: 'Open-core, run it yourself. Full control.',
    target: 'Developers',
    features: [
      'Full source code access',
      'Self-managed infrastructure',
      'Community support',
      'Unlimited local usage',
      'BYOK compatible'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '\u20ac14.99',
    priceSuffix: '/mo',
    desc: 'Cloud hosted with generous limits.',
    target: 'Individuals',
    features: [
      'Cloud hosted & managed',
      '10 agents',
      '500 messages/day',
      'Priority support',
      'BYOK compatible'
    ]
  },
  {
    id: 'max',
    name: 'Max',
    price: '\u20ac39.99',
    priceSuffix: '/mo',
    desc: 'Unlimited agents, higher quotas.',
    target: 'Power users',
    features: [
      'Everything in Pro',
      'Unlimited agents',
      '2,000 messages/day',
      'Priority support',
      'BYOK compatible'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    priceSuffix: '',
    desc: 'Tailored for your team.',
    target: 'Teams',
    features: [
      'Everything in Max',
      'Custom quotas',
      'SSO & SAML',
      'Dedicated support',
      'SLA guarantee'
    ]
  }
];

/* ─── HTML template ────────────────────────────────────── */
const HTML = `
<div class="bg-mesh"></div>

<div class="billing-scroll" id="scroll">
  <div class="header">
    <button class="back-btn" id="back-btn" type="button" aria-label="Close billing">${ICON_BACK}</button>
    <h1>Billing & Plans</h1>
  </div>

  <div class="billing-layout">
    <nav class="billing-nav" id="billing-nav" aria-label="Billing navigation">
      <button class="nav-item active" data-section="section-plan" type="button">${ICON_CREDIT_CARD} Current Plan</button>
      <button class="nav-item" data-section="section-usage" type="button">${ICON_BAR_CHART} Usage</button>
      <button class="nav-item" data-section="section-plans" type="button">${ICON_GRID} Plans</button>
      <div class="nav-separator"></div>
      <button class="nav-item" data-section="section-byok" type="button">${ICON_KEY} API Keys</button>
      <button class="nav-item" data-section="section-manage" type="button">${ICON_SETTINGS} Subscription</button>
    </nav>
    <div class="billing-content" id="billing-content">

  <!-- ── Current Plan ───────────────────────────── -->
  <div class="section current-plan" id="section-plan">
    <div class="section-title">${ICON_CREDIT_CARD} Current Plan</div>
    <div id="plan-content">
      <div class="plan-header">
        <div class="plan-name-wrap">
          <div class="skeleton skeleton-badge" id="plan-skeleton-badge"></div>
        </div>
        <div class="plan-price" id="plan-price-display"></div>
      </div>
      <div class="plan-details" id="plan-details">
        <div class="skeleton skeleton-text" style="width:200px"></div>
        <div class="skeleton skeleton-text short" style="width:140px"></div>
      </div>
    </div>
  </div>

  <!-- ── Usage Dashboard ────────────────────────── -->
  <div class="section" id="section-usage">
    <div class="section-title">${ICON_BAR_CHART} Usage Today</div>
    <div class="usage-grid" id="usage-grid">
      <div class="usage-card">
        <div class="skeleton skeleton-text short"></div>
        <div class="skeleton skeleton-text" style="width:80px;height:24px"></div>
        <div class="skeleton skeleton-bar"></div>
      </div>
      <div class="usage-card">
        <div class="skeleton skeleton-text short"></div>
        <div class="skeleton skeleton-text" style="width:80px;height:24px"></div>
        <div class="skeleton skeleton-bar"></div>
      </div>
      <div class="usage-card">
        <div class="skeleton skeleton-text short"></div>
        <div class="skeleton skeleton-text" style="width:80px;height:24px"></div>
        <div class="skeleton skeleton-bar"></div>
      </div>
    </div>
    <div class="usage-reset" id="usage-reset"></div>
  </div>

  <!-- ── Plan Comparison ────────────────────────── -->
  <div class="section" id="section-plans">
    <div class="section-title">${ICON_GRID} Compare Plans</div>
    <div class="plans-grid" id="plans-grid"></div>
  </div>

  <!-- ── BYOK Section ───────────────────────────── -->
  <div class="section" id="section-byok">
    <div class="section-title">${ICON_KEY} Bring Your Own Key</div>

    <div class="byok-toggle-row">
      <div class="byok-toggle-info">
        <span>Use your own API keys</span>
        <span>Bypass usage quotas &mdash; you pay your provider directly</span>
      </div>
    </div>

    <div class="byok-input-row" id="byok-input-row">
      <input type="password" id="byok-key-input" placeholder="Paste your API key (sk-ant-..., sk-..., AIza...)" autocomplete="off" spellcheck="false" />
      <button type="button" class="btn btn-ghost btn-sm" id="byok-validate-btn">
        <span class="btn-label">Validate</span>
        <div class="spinner"></div>
      </button>
      <button type="button" class="btn btn-primary btn-sm" id="byok-add-btn" disabled>
        <span class="btn-label">Add Key</span>
        <div class="spinner"></div>
      </button>
    </div>
    <div class="byok-provider-hint" id="byok-provider-hint"></div>
    <div class="msg" id="byok-msg" role="status" aria-live="polite"></div>

    <div class="byok-keys-list" id="byok-keys-list">
      <div class="byok-empty" id="byok-empty">No API keys added yet</div>
    </div>
  </div>

  <!-- ── Manage Subscription ────────────────────── -->
  <div class="section" id="section-manage">
    <div class="section-title">${ICON_SETTINGS} Manage Subscription</div>
    <div id="manage-content">
      <div class="manage-row">
        <div class="manage-info">
          <span>Stripe Customer Portal</span>
          <span>Update payment method, view invoices, or cancel your subscription</span>
        </div>
        <button type="button" class="btn btn-ghost" id="btn-portal" disabled>
          <span class="btn-label">${ICON_EXTERNAL} Open Portal</span>
          <div class="spinner"></div>
        </button>
      </div>
    </div>
  </div>

    </div><!-- .billing-content -->
  </div><!-- .billing-layout -->

  <div class="esc-hint">Press <kbd>ESC</kbd> to close</div>
</div>
`;

/* ─── Helper: detect provider from key prefix ──────────── */
function detectProvider(key) {
  if (!key) return null;
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-')) return 'openai';
  if (k.startsWith('AIza')) return 'google';
  if (k.startsWith('sk-or-')) return 'openrouter';
  return null;
}

/* ─── Helper: format number with commas ────────────────── */
function fmtNum(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString('en-US');
}

/* ─── Helper: mask API key ─────────────────────────────── */
function maskKey(key) {
  if (!key || key.length < 12) return '****';
  return key.slice(0, 7) + '...' + key.slice(-4);
}

/* ─── Helper: relative time ────────────────────────────── */
function timeUntil(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = d - now;
  if (diffMs < 0) return 'Expired';
  const days = Math.floor(diffMs / 86400000);
  if (days > 1) return days + ' days';
  const hours = Math.floor(diffMs / 3600000);
  if (hours > 1) return hours + ' hours';
  const mins = Math.floor(diffMs / 60000);
  return mins + ' min';
}

/* ─── Helper: format date ──────────────────────────────── */
function fmtDate(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch (_) {
    return isoDate;
  }
}

/* ─── Component ────────────────────────────────────────── */
export class ScBilling extends HTMLElement {

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.innerHTML = HTML;
    while (wrapper.firstChild) this.shadowRoot.appendChild(wrapper.firstChild);

    // State
    this._billing = null;
    this._usage = null;
    this._byokKeys = [];
    this._validatedKey = null;
    this._validatedProvider = null;

    // Cache refs
    this.$backBtn = this.shadowRoot.getElementById('back-btn');
    this.$planContent = this.shadowRoot.getElementById('plan-content');
    this.$planSkeletonBadge = this.shadowRoot.getElementById('plan-skeleton-badge');
    this.$planPriceDisplay = this.shadowRoot.getElementById('plan-price-display');
    this.$planDetails = this.shadowRoot.getElementById('plan-details');
    this.$usageGrid = this.shadowRoot.getElementById('usage-grid');
    this.$usageReset = this.shadowRoot.getElementById('usage-reset');
    this.$plansGrid = this.shadowRoot.getElementById('plans-grid');
    this.$byokKeyInput = this.shadowRoot.getElementById('byok-key-input');
    this.$byokValidateBtn = this.shadowRoot.getElementById('byok-validate-btn');
    this.$byokAddBtn = this.shadowRoot.getElementById('byok-add-btn');
    this.$byokProviderHint = this.shadowRoot.getElementById('byok-provider-hint');
    this.$byokMsg = this.shadowRoot.getElementById('byok-msg');
    this.$byokKeysList = this.shadowRoot.getElementById('byok-keys-list');
    this.$byokEmpty = this.shadowRoot.getElementById('byok-empty');
    this.$btnPortal = this.shadowRoot.getElementById('btn-portal');
    this.$billingNav = this.shadowRoot.getElementById('billing-nav');
    this.$billingContent = this.shadowRoot.getElementById('billing-content');
  }

  /* ─── lifecycle ─────────────────────────────────── */
  connectedCallback() {
    // Close / back
    this.$backBtn.addEventListener('click', () => this._close());

    // Close on backdrop click
    this.shadowRoot.querySelector('.bg-mesh').addEventListener('click', () => this._close());

    // ESC to close
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this._close();
      }
    };
    this.shadowRoot.addEventListener('keydown', this._escHandler);

    // BYOK input: auto-detect provider on keyup
    this.$byokKeyInput.addEventListener('input', () => this._onByokInput());

    // BYOK validate
    this.$byokValidateBtn.addEventListener('click', () => this._validateByokKey());

    // BYOK add
    this.$byokAddBtn.addEventListener('click', () => this._addByokKey());

    // Portal button
    this.$btnPortal.addEventListener('click', () => this._openPortal());

    // Side-nav: click to scroll
    this.$billingNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-item');
      if (!btn) return;
      const sectionId = btn.getAttribute('data-section');
      const section = this.shadowRoot.getElementById(sectionId);
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Side-nav: IntersectionObserver for active highlight
    const navItems = this.$billingNav.querySelectorAll('.nav-item[data-section]');
    const sectionIds = Array.from(navItems).map(b => b.getAttribute('data-section'));
    this._navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navItems.forEach(b => b.classList.remove('active'));
          const match = this.$billingNav.querySelector('.nav-item[data-section="' + entry.target.id + '"]');
          if (match) match.classList.add('active');
        }
      });
    }, {
      root: this.$billingContent,
      threshold: 0.35,
    });
    sectionIds.forEach(id => {
      const el = this.shadowRoot.getElementById(id);
      if (el) this._navObserver.observe(el);
    });

    // Render static plans grid
    this._renderPlansGrid();

    // Fetch data
    this._loadAll();
  }

  disconnectedCallback() {
    if (this._navObserver) this._navObserver.disconnect();
  }

  /* ─── close helper ──────────────────────────────── */
  _close() {
    this.removeAttribute('open');
    this.dispatchEvent(new CustomEvent('billing-close', { bubbles: true, composed: true }));
  }

  /* ─── auth headers ──────────────────────────────── */
  _headers(json) {
    const h = {};
    const token = localStorage.getItem('scratchy_token');
    if (token) h['Authorization'] = 'Bearer ' + token;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  /* ─── load all data ─────────────────────────────── */
  async _loadAll() {
    await Promise.allSettled([
      this._loadBilling(),
      this._loadUsage(),
      this._loadByokKeys()
    ]);
  }

  /* ─── billing status ────────────────────────────── */
  async _loadBilling() {
    try {
      const res = await fetch('/api/billing/status', { headers: this._headers() });
      if (!res.ok) throw new Error('Failed to load billing');
      this._billing = await res.json();
      this._renderCurrentPlan();
      this._renderPlansGrid();
      this._updatePortalButton();
    } catch (err) {
      this._renderCurrentPlanError(err.message);
    }
  }

  /* ─── usage data ────────────────────────────────── */
  async _loadUsage() {
    try {
      const res = await fetch('/api/usage', { headers: this._headers() });
      if (!res.ok) throw new Error('Failed to load usage');
      this._usage = await res.json();
      this._renderUsage();
    } catch (err) {
      this._renderUsageError(err.message);
    }
  }

  /* ─── BYOK keys ─────────────────────────────────── */
  async _loadByokKeys() {
    try {
      const res = await fetch('/api/byok/keys', { headers: this._headers() });
      if (!res.ok) throw new Error('Failed to load keys');
      const data = await res.json();
      this._byokKeys = data.keys || [];
      this._renderByokKeys();
    } catch (_) {
      this._byokKeys = [];
      this._renderByokKeys();
    }
  }

  /* ─── render: current plan ──────────────────────── */
  _renderCurrentPlan() {
    const b = this._billing;
    if (!b) return;

    const planName = (b.plan || 'free').toLowerCase();
    const planLabel = this._getPlanLabel(planName);
    const planPrice = this._getPlanPrice(planName);
    const sub = b.subscription || {};
    const hasSub = b.hasStripeSubscription;
    const isActive = sub.status === 'active' || sub.status === 'trialing';
    const isCanceling = sub.cancelAtPeriodEnd;

    let statusClass = 'free';
    let statusText = 'Free tier';
    if (hasSub && isActive && !isCanceling) {
      statusClass = 'active';
      statusText = 'Active';
    } else if (hasSub && isCanceling) {
      statusClass = 'canceled';
      statusText = 'Cancels ' + fmtDate(sub.currentPeriodEnd);
    } else if (hasSub && sub.status === 'past_due') {
      statusClass = 'canceled';
      statusText = 'Past due';
    }

    this.$planContent.innerHTML = ''
      + '<div class="plan-header">'
      + '  <div class="plan-name-wrap">'
      + '    <div class="plan-badge">' + ICON_STAR + ' ' + this._escHtml(planLabel) + '</div>'
      + '  </div>'
      + '  <div class="plan-price">' + this._escHtml(planPrice) + '</div>'
      + '</div>'
      + '<div class="plan-details">'
      + '  <div class="plan-detail-item">'
      + '    <div class="status-dot ' + statusClass + '"></div>'
      + '    <span class="detail-value">' + this._escHtml(statusText) + '</span>'
      + '  </div>'
      + (hasSub && isActive && sub.currentPeriodEnd
          ? '  <div class="plan-detail-item">'
            + '    ' + ICON_CLOCK
            + '    <span class="detail-label">Renews&nbsp;</span>'
            + '    <span class="detail-value">' + this._escHtml(fmtDate(sub.currentPeriodEnd)) + '</span>'
            + '  </div>'
          : '')
      + (this._byokKeys.length > 0
          ? '  <div class="plan-detail-item">'
            + '    <span class="byok-active-badge">' + ICON_KEY + ' BYOK Active</span>'
            + '  </div>'
          : '')
      + '</div>';
  }

  _renderCurrentPlanError(msg) {
    this.$planContent.innerHTML = ''
      + '<div class="plan-header">'
      + '  <div class="plan-name-wrap">'
      + '    <div class="plan-badge">' + ICON_STAR + ' Free</div>'
      + '  </div>'
      + '</div>'
      + '<div class="msg active error" style="text-align:left">' + this._escHtml(msg) + '</div>';
  }

  /* ─── render: usage ─────────────────────────────── */
  _renderUsage() {
    const u = this._usage;
    if (!u) return;

    const today = u.today || {};
    const limits = u.limits || {};
    const byokActive = this._byokKeys.length > 0;

    const msgUsed = today.messages || 0;
    const msgLimit = limits.messagesPerDay || 0;
    const msgPct = msgLimit > 0 ? Math.min(100, (msgUsed / msgLimit) * 100) : 0;

    const tokUsed = today.tokens || 0;
    const tokLimit = limits.tokensPerDay || 0;
    const tokPct = tokLimit > 0 ? Math.min(100, (tokUsed / tokLimit) * 100) : 0;

    const toolUsed = today.toolCalls || 0;

    function barClass(pct) {
      if (pct >= 90) return 'danger';
      if (pct >= 70) return 'warning';
      return '';
    }

    const limitLabel = (limit) => {
      if (byokActive) return 'unlimited';
      if (limit === 0 || limit == null) return 'unlimited';
      return fmtNum(limit);
    };

    this.$usageGrid.innerHTML = ''
      + '<div class="usage-card">'
      + '  <div class="usage-card-label">Messages</div>'
      + '  <div class="usage-card-value">' + fmtNum(msgUsed) + ' <span>/ ' + limitLabel(msgLimit) + '</span></div>'
      + '  <div class="usage-bar-track"><div class="usage-bar-fill ' + barClass(msgPct) + '" style="width:' + (byokActive ? 0 : msgPct) + '%"></div></div>'
      + '</div>'
      + '<div class="usage-card">'
      + '  <div class="usage-card-label">Tokens</div>'
      + '  <div class="usage-card-value">' + fmtNum(tokUsed) + ' <span>/ ' + limitLabel(tokLimit) + '</span></div>'
      + '  <div class="usage-bar-track"><div class="usage-bar-fill ' + barClass(tokPct) + '" style="width:' + (byokActive ? 0 : tokPct) + '%"></div></div>'
      + '</div>'
      + '<div class="usage-card">'
      + '  <div class="usage-card-label">Tool Calls</div>'
      + '  <div class="usage-card-value">' + fmtNum(toolUsed) + '</div>'
      + '  <div class="usage-bar-track"><div class="usage-bar-fill" style="width:0%"></div></div>'
      + '</div>';

    if (u.resetAt) {
      this.$usageReset.textContent = 'Resets in ' + timeUntil(u.resetAt);
    }
  }

  _renderUsageError(msg) {
    this.$usageGrid.innerHTML = '<div class="msg active error" style="text-align:left">' + this._escHtml(msg) + '</div>';
  }

  /* ─── render: plans comparison grid ─────────────── */
  _renderPlansGrid() {
    const currentPlan = this._billing ? (this._billing.plan || 'free').toLowerCase() : null;
    const hasSub = this._billing ? this._billing.hasStripeSubscription : false;

    let html = '';
    PLANS.forEach(plan => {
      const isCurrent = this._isPlanMatch(currentPlan, plan.id);
      const activeClass = isCurrent ? ' active' : '';

      let btnHtml = '';
      if (plan.id === 'enterprise') {
        btnHtml = '<a href="mailto:comm@enova-aerospace.com" class="btn btn-ghost btn-sm" style="text-decoration:none;width:100%;text-align:center">'
          + '<span class="btn-label">' + ICON_MAIL + ' Contact Us</span>'
          + '</a>';
      } else if (plan.id === 'self-hosted') {
        if (isCurrent) {
          btnHtml = '<button class="btn btn-ghost btn-sm" disabled style="width:100%"><span class="btn-label">Current Plan</span></button>';
        } else {
          btnHtml = '<button class="btn btn-ghost btn-sm" disabled style="width:100%"><span class="btn-label">Self-host to use</span></button>';
        }
      } else if (isCurrent) {
        btnHtml = '<button class="btn btn-ghost btn-sm" disabled style="width:100%"><span class="btn-label">Current Plan</span></button>';
      } else {
        const label = this._isUpgrade(currentPlan, plan.id) ? 'Upgrade' : 'Switch';
        btnHtml = '<button class="btn btn-primary btn-sm plan-upgrade-btn" data-plan="' + plan.id + '" style="width:100%">'
          + '<span class="btn-label">' + ICON_ZAPP + ' ' + label + '</span>'
          + '<div class="spinner"></div>'
          + '</button>';
      }

      let featuresHtml = '';
      plan.features.forEach(f => {
        featuresHtml += '<li>' + ICON_CHECK + ' ' + this._escHtml(f) + '</li>';
      });

      html += ''
        + '<div class="plan-card' + activeClass + '">'
        + '  <div class="plan-card-name">' + this._escHtml(plan.name) + '</div>'
        + '  <div class="plan-card-price">' + plan.price + (plan.priceSuffix ? '<span>' + plan.priceSuffix + '</span>' : '') + '</div>'
        + '  <div class="plan-card-desc">' + this._escHtml(plan.desc) + '</div>'
        + '  <ul class="plan-features">' + featuresHtml + '</ul>'
        + '  ' + btnHtml
        + '</div>';
    });

    this.$plansGrid.innerHTML = html;

    // Attach upgrade handlers
    this.$plansGrid.querySelectorAll('.plan-upgrade-btn').forEach(btn => {
      btn.addEventListener('click', () => this._handleUpgrade(btn));
    });
  }

  _isPlanMatch(current, planId) {
    if (!current) return planId === 'self-hosted';
    const c = current.toLowerCase();
    if (c === planId) return true;
    if ((c === 'free' || c === 'self-hosted') && planId === 'self-hosted') return true;
    return false;
  }

  _isUpgrade(current, targetId) {
    const order = { 'self-hosted': 0, 'free': 0, 'pro': 1, 'max': 2 };
    const c = (current || 'free').toLowerCase();
    return (order[targetId] || 0) > (order[c] || 0);
  }

  /* ─── render: BYOK keys ─────────────────────────── */
  _renderByokKeys() {
    if (this._byokKeys.length === 0) {
      this.$byokEmpty.style.display = '';
      // Clear any existing key chips except the empty message
      const chips = this.$byokKeysList.querySelectorAll('.byok-key-chip');
      chips.forEach(c => c.remove());
      return;
    }

    this.$byokEmpty.style.display = 'none';

    let html = '';
    this._byokKeys.forEach(k => {
      const provider = (k.provider || 'unknown').toLowerCase();
      const label = k.label || k.provider || 'API Key';
      const color = PROVIDER_COLORS[provider] || PROVIDER_COLORS.unknown;
      const abbr = PROVIDER_LABELS[provider] || PROVIDER_LABELS.unknown;
      const lastUsed = k.lastUsed ? 'Last used ' + fmtDate(k.lastUsed) : 'Never used';

      html += ''
        + '<div class="byok-key-chip">'
        + '  <div class="byok-key-provider" style="color:' + color + ';border:1px solid ' + color + '33">' + this._escHtml(abbr) + '</div>'
        + '  <div class="byok-key-info">'
        + '    <div class="byok-key-label">' + this._escHtml(label) + '</div>'
        + '    <div class="byok-key-meta">' + this._escHtml(lastUsed) + '</div>'
        + '  </div>'
        + '  <button class="byok-key-delete" data-provider="' + this._escHtml(provider) + '" type="button" aria-label="Delete ' + this._escHtml(label) + ' key">'
        + '    ' + ICON_TRASH
        + '  </button>'
        + '</div>';
    });

    // Remove old chips
    const oldChips = this.$byokKeysList.querySelectorAll('.byok-key-chip');
    oldChips.forEach(c => c.remove());

    // Insert new chips before the empty message
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (temp.firstChild) {
      this.$byokKeysList.insertBefore(temp.firstChild, this.$byokEmpty);
    }

    // Attach delete handlers
    this.$byokKeysList.querySelectorAll('.byok-key-delete').forEach(btn => {
      btn.addEventListener('click', () => this._deleteByokKey(btn.getAttribute('data-provider')));
    });
  }

  /* ─── BYOK: input handler ───────────────────────── */
  _onByokInput() {
    const key = this.$byokKeyInput.value.trim();
    const provider = detectProvider(key);
    this._validatedKey = null;
    this._validatedProvider = null;
    this.$byokAddBtn.disabled = true;
    this.$byokKeyInput.classList.remove('invalid');
    this._clearByokMsg();

    if (provider) {
      const names = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', openrouter: 'OpenRouter' };
      this.$byokProviderHint.textContent = 'Detected: ' + (names[provider] || provider);
      this.$byokProviderHint.classList.add('detected');
    } else if (key.length > 0) {
      this.$byokProviderHint.textContent = 'Provider will be auto-detected on validation';
      this.$byokProviderHint.classList.remove('detected');
    } else {
      this.$byokProviderHint.textContent = '';
      this.$byokProviderHint.classList.remove('detected');
    }
  }

  /* ─── BYOK: validate key ────────────────────────── */
  async _validateByokKey() {
    const key = this.$byokKeyInput.value.trim();
    if (!key) {
      this.$byokKeyInput.classList.add('invalid');
      this._showByokMsg('Please enter an API key', 'error');
      this.$byokKeyInput.focus();
      return;
    }

    this._setByokValidateLoading(true);
    this._clearByokMsg();

    try {
      const res = await fetch('/api/byok/validate', {
        method: 'POST',
        headers: this._headers(true),
        body: JSON.stringify({ key })
      });

      const data = await res.json();

      if (data.valid) {
        this._validatedKey = key;
        this._validatedProvider = data.provider;
        this.$byokAddBtn.disabled = false;
        const names = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', openrouter: 'OpenRouter' };
        this._showByokMsg('Valid ' + (names[data.provider] || data.provider) + ' key', 'success');
        this.$byokProviderHint.textContent = 'Detected: ' + (names[data.provider] || data.provider);
        this.$byokProviderHint.classList.add('detected');
      } else {
        this.$byokKeyInput.classList.add('invalid');
        this._showByokMsg(data.error || 'Invalid API key', 'error');
        this.$byokAddBtn.disabled = true;
      }
    } catch (err) {
      this._showByokMsg('Validation failed: ' + err.message, 'error');
    } finally {
      this._setByokValidateLoading(false);
    }
  }

  /* ─── BYOK: add key ─────────────────────────────── */
  async _addByokKey() {
    if (!this._validatedKey) return;

    this._setByokAddLoading(true);
    this._clearByokMsg();

    try {
      const res = await fetch('/api/byok/keys', {
        method: 'POST',
        headers: this._headers(true),
        body: JSON.stringify({ key: this._validatedKey })
      });

      const data = await res.json();

      if (data.success) {
        this._showByokMsg(data.message || 'Key added successfully', 'success');
        this.$byokKeyInput.value = '';
        this.$byokProviderHint.textContent = '';
        this.$byokProviderHint.classList.remove('detected');
        this._validatedKey = null;
        this._validatedProvider = null;
        this.$byokAddBtn.disabled = true;
        await this._loadByokKeys();
        // Refresh current plan display to show BYOK badge
        this._renderCurrentPlan();
      } else {
        this._showByokMsg(data.message || 'Failed to add key', 'error');
      }
    } catch (err) {
      this._showByokMsg('Failed to add key: ' + err.message, 'error');
    } finally {
      this._setByokAddLoading(false);
    }
  }

  /* ─── BYOK: delete key ──────────────────────────── */
  async _deleteByokKey(provider) {
    if (!provider) return;

    try {
      const res = await fetch('/api/byok/keys/' + encodeURIComponent(provider), {
        method: 'DELETE',
        headers: this._headers()
      });

      const data = await res.json();

      if (data.success) {
        this._showByokMsg(data.message || 'Key removed', 'success');
        await this._loadByokKeys();
        this._renderCurrentPlan();
      } else {
        this._showByokMsg(data.message || 'Failed to remove key', 'error');
      }
    } catch (err) {
      this._showByokMsg('Failed to remove key: ' + err.message, 'error');
    }
  }

  /* ─── upgrade handler ───────────────────────────── */
  async _handleUpgrade(btn) {
    const plan = btn.getAttribute('data-plan');
    if (!plan) return;

    btn.disabled = true;
    btn.classList.add('loading');

    this.dispatchEvent(new CustomEvent('billing-upgrade', {
      bubbles: true,
      composed: true,
      detail: { plan }
    }));

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: this._headers(true),
        body: JSON.stringify({ plan })
      });

      const data = await res.json();

      if (data.url) {
        window.location = data.url;
        return; // navigating away
      }

      throw new Error(data.error || 'No checkout URL returned');
    } catch (err) {
      btn.disabled = false;
      btn.classList.remove('loading');
      // Show error inline near the plans grid
      const msgEl = document.createElement('div');
      msgEl.className = 'msg active error';
      msgEl.textContent = err.message;
      this.$plansGrid.parentNode.insertBefore(msgEl, this.$plansGrid.nextSibling);
      setTimeout(() => msgEl.remove(), 5000);
    }
  }

  /* ─── portal handler ────────────────────────────── */
  async _openPortal() {
    this.$btnPortal.disabled = true;
    this.$btnPortal.classList.add('loading');

    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: this._headers(true)
      });

      const data = await res.json();

      if (data.url) {
        window.open(data.url, '_blank', 'noopener');
      } else {
        throw new Error(data.error || 'No portal URL returned');
      }
    } catch (err) {
      const manageContent = this.shadowRoot.getElementById('manage-content');
      const msgEl = document.createElement('div');
      msgEl.className = 'msg active error';
      msgEl.textContent = err.message;
      manageContent.appendChild(msgEl);
      setTimeout(() => msgEl.remove(), 5000);
    } finally {
      this.$btnPortal.disabled = false;
      this.$btnPortal.classList.remove('loading');
    }
  }

  /* ─── portal button state ───────────────────────── */
  _updatePortalButton() {
    const b = this._billing;
    if (b && b.hasStripeSubscription) {
      this.$btnPortal.disabled = false;
    } else {
      this.$btnPortal.disabled = true;
    }
  }

  /* ─── BYOK loading states ───────────────────────── */
  _setByokValidateLoading(loading) {
    this.$byokValidateBtn.disabled = loading;
    this.$byokValidateBtn.classList.toggle('loading', loading);
  }

  _setByokAddLoading(loading) {
    this.$byokAddBtn.disabled = loading;
    this.$byokAddBtn.classList.toggle('loading', loading);
  }

  /* ─── BYOK messages ─────────────────────────────── */
  _showByokMsg(text, type) {
    this.$byokMsg.textContent = text;
    this.$byokMsg.className = 'msg active ' + type;
  }

  _clearByokMsg() {
    this.$byokMsg.textContent = '';
    this.$byokMsg.className = 'msg';
  }

  /* ─── plan helpers ──────────────────────────────── */
  _getPlanLabel(plan) {
    const labels = {
      'free': 'Self-Hosted',
      'self-hosted': 'Self-Hosted',
      'pro': 'Pro',
      'max': 'Max',
      'enterprise': 'Enterprise'
    };
    return labels[plan] || plan || 'Free';
  }

  _getPlanPrice(plan) {
    const prices = {
      'free': 'Free',
      'self-hosted': 'Free',
      'pro': '\u20ac14.99/mo',
      'max': '\u20ac39.99/mo',
      'enterprise': 'Custom'
    };
    return prices[plan] || 'Free';
  }

  /* ─── html escape ───────────────────────────────── */
  _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

customElements.define('sc-billing', ScBilling);
