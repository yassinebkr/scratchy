/**
 * Scratchy v2 — Landing Page Web Component
 * <sc-landing> — The one that has personality.
 *
 * Events: landing-action { action: 'get-started' | 'sign-in' | 'select-plan', planId? }
 */

const GOLD = '#F9A602';
const GOLDENROD = '#DAA520';
const AMBER = '#FFBF00';

/* ── Data ── */

const PLANS = [
  {
    id: 'pro', name: 'Pro', price: 29.99, period: '/mo', subtitle: 'For builders who ship',
    features: ['Sonnet model', '200 messages / day', '1 seat', 'Persistent memory', 'All canvas components', 'Email support'],
    excluded: ['Opus model', 'Multi-user'],
    cta: 'Start Free Trial', highlight: false,
  },
  {
    id: 'max', name: 'Max', price: 59.99, period: '/mo', subtitle: 'Full power, zero compromises',
    features: ['Sonnet + Opus models', '500 messages / day', '3 seats', 'All canvas components', 'Persistent memory', 'Priority support'],
    excluded: [],
    cta: 'Start Free Trial', highlight: true, badge: 'Most Popular',
  },
  {
    id: 'business', name: 'Business', price: null, period: '', subtitle: 'Your infrastructure, our expertise',
    features: ['Custom models and limits', 'Unlimited seats', 'Dedicated support', 'SLA', 'On-prem or managed'],
    excluded: [],
    cta: 'Contact Us', highlight: false,
  },
];

const AGENTS = [
  {
    name: 'Atlas',
    role: 'Code',
    tagline: 'Thinks in systems, ships in PRs.',
    desc: 'Skilled in JavaScript, TypeScript, Node.js, and systems architecture. Proper error handling, tests, and docs — because "it works on my machine" isn\'t a deployment strategy.',
    color: '#DAA520',
    avatar: '<img src="/assets/agents/atlas.png" alt="Atlas">',
  },
  {
    name: 'Iris',
    role: 'Design',
    tagline: 'Pixels with purpose.',
    desc: 'Skilled in CSS, design systems, and accessibility. Mobile-first, opinionated. Builds UI systems, not just screens. Will fight you on padding.',
    color: '#6366f1',
    avatar: '<img src="/assets/agents/iris.png" alt="Iris">',
  },
  {
    name: 'Nova',
    role: 'Research',
    tagline: 'Reads everything. Trusts nothing.',
    desc: 'Skilled in web research, data analysis, and source verification. Cross-references, synthesizes, cites sources. Your bullshit detector with a library card.',
    color: '#10b981',
    avatar: '<img src="/assets/agents/nova.png" alt="Nova">',
  },
  {
    name: 'Echo',
    role: 'Writer',
    tagline: 'Every sentence earns its place.',
    desc: 'Skilled in technical writing, copywriting, and tone matching. Docs, copy, emails — zero filler, zero AI slop. Matches your voice, not some generic "professional tone."',
    color: '#f47252',
    avatar: '<img src="/assets/agents/echo.png" alt="Echo">',
  },
];

/* ── SVG Icons ── */

const ICON = {
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  chevronDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  terminal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  github: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>',
  lock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  unlock: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',
};

/* ── Styles ── */

const STYLES = /* css */ `
:host {
  --bg: #0a0a0f;
  --bg-alt: #0e0e14;
  --surface: rgba(255,255,255,0.04);
  --surface-hover: rgba(255,255,255,0.07);
  --border: rgba(249,166,2,0.10);
  --border-subtle: rgba(255,255,255,0.06);
  --text: #e8e6e3;
  --muted: #9494a0;
  --accent: ${GOLD};
  --accent-hover: ${GOLDENROD};
  --accent-glow: rgba(249,166,2,0.20);
  --accent-subtle: rgba(249,166,2,0.06);
  --success: #34d399;
  --font: 'Geist', system-ui, -apple-system, sans-serif;
  --mono: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;

  display: block;
  width: 100%;
  max-width: 100vw;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  scroll-behavior: smooth;
  overflow-x: hidden;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
.landing-wrapper { overflow-x: hidden; width: 100%; max-width: 100%; }

/* ─── Nav ─── */
.nav {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 clamp(16px, 4vw, 48px);
  height: 56px;
  background: transparent;
  transition: background 0.3s, backdrop-filter 0.3s, border-color 0.3s;
  border-bottom: 1px solid transparent;
}
.nav.scrolled {
  background: rgba(10,10,15,0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom-color: var(--border);
}
.nav-brand {
  font-size: 20px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.5px;
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  cursor: pointer;
}
.nav-brand img {
  width: 32px; height: 32px;
  border-radius: 4px;
  flex-shrink: 0;
  object-fit: cover;
}
.hero-logo {
  width: clamp(120px, 20vw, 280px);
  height: auto;
  border-radius: 20px;
  margin-bottom: 28px;
  object-fit: contain;
  background: none;
  filter: none;
}
.nav-links {
  display: flex;
  gap: 32px;
  list-style: none;
}
.nav-links a {
  color: var(--muted);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s;
  cursor: pointer;
}
.nav-links a:hover { color: var(--text); }
.nav-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text);
  cursor: pointer;
  padding: 8px;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
}
.nav-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

/* ─── Buttons ─── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font);
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  min-height: 40px;
  text-decoration: none;
}
.btn-ghost {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-ghost:hover {
  background: var(--surface-hover);
  border-color: var(--accent);
  color: var(--accent);
}
.btn-primary {
  background: var(--accent);
  color: #0a0a0f;
}
.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: 0 0 24px var(--accent-glow);
}
.btn-secondary {
  background: var(--accent-subtle);
  color: var(--accent);
  border: 1px solid var(--border);
}
.btn-secondary:hover {
  background: rgba(249,166,2,0.12);
  border-color: rgba(249,166,2,0.3);
}
.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ─── Hero ─── */
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 80px 24px 60px;
  text-align: center;
  overflow: hidden;
}
.hero-mesh {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}
.hero-mesh::before, .hero-mesh::after {
  content: '';
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  opacity: 0.12;
  filter: blur(120px);
  animation: meshFloat 20s ease-in-out infinite alternate;
}
.hero-mesh::before {
  top: -10%;
  left: -10%;
  background: radial-gradient(circle, ${GOLD} 0%, transparent 70%);
}
.hero-mesh::after {
  bottom: -10%;
  right: -10%;
  background: radial-gradient(circle, ${AMBER} 0%, transparent 70%);
  animation-direction: alternate-reverse;
  animation-delay: -10s;
}
@keyframes meshFloat {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(40px, -30px) scale(1.1); }
  100% { transform: translate(-20px, 20px) scale(0.95); }
}
.hero-content {
  position: relative;
  z-index: 1;
  max-width: 760px;
}
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-radius: 20px;
  background: var(--accent-subtle);
  border: 1px solid var(--border);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 28px;
  letter-spacing: 0.2px;
}
.hero-badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--success);
  animation: dotPulse 2s ease-in-out infinite;
}
@keyframes dotPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.hero h1 {
  font-size: clamp(40px, 6.5vw, 68px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.05;
  color: var(--text);
}
.hero h1 .gold {
  color: var(--accent);
}
.hero-sub {
  margin-top: 20px;
  font-size: clamp(16px, 2vw, 19px);
  color: var(--muted);
  max-width: 520px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.65;
}
.hero-cta {
  display: flex;
  gap: 16px;
  margin-top: 40px;
  justify-content: center;
  flex-wrap: wrap;
}
.hero-cta .btn-primary {
  padding: 12px 32px;
  font-size: 16px;
  box-shadow: 0 0 30px var(--accent-glow);
}
.hero-cta .btn-ghost {
  padding: 12px 24px;
  font-size: 15px;
}
.hero-scroll {
  margin-top: 60px;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  animation: bounce 2s ease infinite;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.hero-scroll:hover { color: var(--accent); }
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(6px); }
}

/* ─── Section ─── */
.section {
  padding: 100px clamp(16px, 4vw, 48px);
  max-width: 1100px;
  margin: 0 auto;
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.section.visible {
  opacity: 1;
  transform: translateY(0);
}
.section-eyebrow {
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--accent);
  margin-bottom: 12px;
}
.section-title {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  text-align: center;
  letter-spacing: -1px;
  margin-bottom: 12px;
}
.section-subtitle {
  text-align: center;
  color: var(--muted);
  font-size: 16px;
  margin-bottom: 56px;
  max-width: 520px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
}
.section-divider {
  max-width: 1100px;
  margin: 0 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
}

/* ─── Difference Blocks ─── */
.diff-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
  max-width: 900px;
  margin: 0 auto;
}
.diff-block {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  overflow: hidden;
  transition: border-color 0.2s, transform 0.2s;
}
.diff-block:hover {
  border-color: rgba(249,166,2,0.18);
  transform: translateY(-2px);
}
.diff-block:nth-child(even) {
  direction: rtl;
}
.diff-block:nth-child(even) > * {
  direction: ltr;
}
.diff-visual {
  width: 100%;
  aspect-ratio: 21/9;
  background: linear-gradient(135deg, rgba(249,166,2,0.04), rgba(99,102,241,0.04));
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.diff-visual img, .diff-visual video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.diff-visual-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  opacity: 0.6;
}
.diff-visual-placeholder .diff-visual-emoji {
  font-size: 36px;
}
.diff-visual-placeholder span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}
.diff-text {
  padding: 28px 32px;
}
.diff-text h3 {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.diff-text h3 svg {
  color: var(--accent);
  flex-shrink: 0;
}
.diff-text p {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 12px;
}
.diff-example {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--accent);
  background: rgba(249,166,2,0.06);
  border: 1px solid rgba(249,166,2,0.1);
  border-radius: 6px;
  padding: 8px 12px;
  display: inline-block;
}

/* ─── Security Banner ─── */
.security-banner {
  display: flex;
  align-items: center;
  gap: 20px;
  max-width: 700px;
  margin: 0 auto;
  padding: 24px 32px;
  background: rgba(99,102,241,0.06);
  border: 1px solid rgba(99,102,241,0.15);
  border-radius: 12px;
}
.security-icon {
  width: 48px; height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(99,102,241,0.12);
  flex-shrink: 0;
}
.security-icon svg { color: #6366f1; }
.security-content h3 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}
.security-content p {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.5;
}
.security-content a {
  color: #6366f1;
  text-decoration: none;
  font-weight: 600;
  font-size: 13px;
}
.security-content a:hover { text-decoration: underline; }

/* ─── Agents ─── */
.agents-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}
.agent-card {
  --agent-color: var(--accent);
  --agent-glow: var(--accent-glow);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.06);
  border-top: 3px solid var(--agent-color);
  border-radius: 12px;
  padding: 32px 24px;
  text-align: center;
  transition: border-color 0.3s, transform 0.3s, box-shadow 0.3s;
}
.agent-card:hover {
  transform: translateY(-5px);
  border-color: var(--agent-color);
  box-shadow: 0 10px 40px -10px var(--agent-glow);
}
.agent-avatar {
  width: 128px; height: 128px;
  margin: 0 auto 20px;
  border-radius: 50%;
  position: relative;
  border: 3px solid var(--agent-color);
  padding: 4px;
  background-color: var(--bg);
}
.agent-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.agent-status {
  position: absolute;
  bottom: 5px; right: 5px;
  width: 18px; height: 18px;
  border-radius: 50%;
  background: var(--success);
  border: 3px solid var(--bg);
}
.agent-name {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 2px;
}
.agent-role {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 12px;
  color: var(--agent-color);
}
.agent-tagline {
  font-style: italic;
  color: var(--muted);
  font-size: 14px;
  margin-bottom: 12px;
}
.agent-desc {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.6;
}

/* ─── Open Core ─── */
.opencore {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
}
.opencore-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 32px;
}
.opencore-card h3 {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.opencore-card h3 svg { color: var(--accent); }
.opencore-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.opencore-list li {
  font-size: 14px;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.4;
}
.opencore-list li svg { color: var(--success); flex-shrink: 0; }
.opencore-cta {
  margin-top: 32px;
  text-align: center;
}
.opencore-cta a {
  color: var(--accent);
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: opacity 0.2s;
}
.opencore-cta a:hover { opacity: 0.8; }

/* ─── Plans ─── */
.plans-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  align-items: stretch;
}
.plan-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
  position: relative;
  display: flex;
  flex-direction: column;
}
.plan-features {
  flex: 1;
}
.plan-cta {
  margin-top: auto;
}
.plan-card:hover {
  transform: translateY(-4px);
  border-color: rgba(249,166,2,0.15);
}
.plan-card.highlight {
  border-color: var(--accent);
  box-shadow: 0 0 30px var(--accent-glow), 0 8px 32px rgba(0,0,0,0.3);
}
.plan-card.highlight:hover {
  transform: translateY(-4px);
}
.plan-badge {
  position: absolute;
  top: -12px; left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: #0a0a0f;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 14px;
  border-radius: 20px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  animation: badgePulse 2s ease-in-out infinite;
  white-space: nowrap;
}
@keyframes badgePulse {
  0%, 100% { box-shadow: 0 0 8px var(--accent-glow); }
  50% { box-shadow: 0 0 20px var(--accent-glow); }
}
.plan-name {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 4px;
  margin-top: 8px;
}
.plan-price {
  font-size: 36px;
  font-weight: 800;
  color: var(--accent);
  margin: 8px 0;
  font-family: var(--mono);
}
.plan-price span {
  font-size: 15px;
  font-weight: 400;
  color: var(--muted);
  font-family: var(--font);
}
.plan-subtitle {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 20px;
}
.plan-features {
  list-style: none;
  text-align: left;
  margin-bottom: 24px;
}
.plan-features li {
  font-size: 13px;
  padding: 5px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.plan-features li .check { color: var(--success); }
.plan-features li .cross { color: #444; }
.plan-features li.excluded {
  color: var(--muted);
  opacity: 0.5;
}

/* ─── Widget Showcase: A2UI Animated Demo ─── */
.widget-showcase {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  align-items: center;
  max-width: 900px;
  margin: 0 auto;
}
.widget-info {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.widget-info-title {
  font-size: clamp(22px, 3vw, 30px);
  font-weight: 700;
  letter-spacing: -0.5px;
  color: var(--text);
  line-height: 1.2;
}
.widget-info-desc {
  font-size: 15px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 8px;
}
.widget-demo-animated {
  aspect-ratio: 4 / 3;
  background: #0D0B08;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  padding: clamp(1rem, 2.5vw, 1.5rem);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 80px -20px rgba(0,0,0,0.7);
  transform: translateZ(0);
}
.demo-item {
  position: absolute;
  inset: 0;
  padding: inherit;
  opacity: 0;
  transition: opacity 0.3s ease;
  visibility: hidden;
  pointer-events: none;
}
.demo-item.active {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition: opacity 0.5s 0.1s ease;
}
.demo-item.slide-left {
  /* This will be removed in JS, but keeping the class does no harm for now */
}
.demo-item.slide-right {
  /* This will be removed in JS, but keeping the class does no harm for now */
}
.demo-nav {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 2;
}
.demo-nav-arrows {
  display: none; /* Hidden on desktop */
  position: absolute;
  top: 50%;
  left: 10px;
  right: 10px;
  transform: translateY(-50%);
  justify-content: space-between;
  z-index: 3;
  pointer-events: none; /* Container doesn't capture clicks */
}
.demo-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--text);
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  pointer-events: auto; /* Buttons are clickable */
  transition: background 0.2s;
}
.demo-arrow:hover {
  background: rgba(255, 255, 255, 0.2);
}
.demo-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--border);
  border: none;
  cursor: pointer;
  padding: 0;
  transition: background 0.3s, transform 0.3s;
}
.demo-dot.active {
  background: var(--accent);
  transform: scale(1.3);
}

/* Phase 1: Gauges */
.demo-gauges-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  height: 100%;
  width: 100%;
  align-content: center;
}
.demo-gauge {
  --gauge-color: var(--accent);
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: clamp(80px, 10vw, 110px);
  aspect-ratio: 1;
  margin: 0 auto;
}
.demo-gauge .value {
  font-size: clamp(0.75rem, 1.5vw, 1rem);
  font-weight: 700;
  font-family: var(--mono);
  color: var(--text);
  line-height: 1;
  position: relative;
  z-index: 1;
}
.demo-gauge .label {
  font-size: 0.55rem;
  color: var(--muted);
  font-family: var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  position: relative;
  z-index: 1;
  margin-top: 2px;
}
.demo-gauge svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.demo-gauge circle {
  fill: none;
  stroke-width: 6;
}
.demo-gauge .track {
  stroke: #141210;
}
.demo-gauge .fill {
  stroke: var(--gauge-color);
  stroke-linecap: round;
  stroke-dasharray: 283;
  stroke-dashoffset: 283;
  transition: stroke-dashoffset 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
.demo-gauges.active .fill-1 { stroke-dashoffset: calc(283 - (283 * 0.75)); transition-delay: 0.3s; }
.demo-gauges.active .fill-2 { stroke-dashoffset: calc(283 - (283 * 0.48)); transition-delay: 0.5s; }
.demo-gauges.active .fill-3 { stroke-dashoffset: calc(283 - (283 * 0.91)); transition-delay: 0.7s; }
.demo-gauges.active .fill-4 { stroke-dashoffset: calc(283 - (283 * 0.62)); transition-delay: 0.9s; }
.demo-gauges:not(.active) .fill { stroke-dashoffset: 283; transition-delay: 0s; transition-duration: 0.4s; }

/* Phase 2: Bar Chart */
.demo-chart-wrapper {
  background: #141210;
  border-radius: 8px;
  padding: 1rem 1.2rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.demo-chart-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.5rem;
  flex-shrink: 0;
}
.demo-chart-grid-container {
  position: absolute;
  left: 24px;
  right: 16px;
  top: 40px;  /* below the title */
  bottom: 30px; /* above x-axis */
  display: flex;
  align-items: flex-end;
  gap: 0.6rem;
  padding: 0 8px;
}
.demo-chart-y-axis {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.demo-chart-y-axis .line {
  height: 1px;
  background: var(--border-subtle);
  opacity: 0.5;
  position: relative;
}
.demo-chart-y-axis .line::before {
  content: attr(data-val);
  position: absolute;
  left: -2px;
  top: -8px;
  font-size: 0.55rem;
  color: var(--muted);
  font-family: var(--mono);
}
.demo-chart-y-label {
  position: absolute;
  left: -10px;
  top: 50%;
  transform: rotate(-90deg) translateX(-50%);
  transform-origin: 0 0;
  font-size: 0.5rem;
  color: var(--muted);
  font-family: var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.demo-chart-bar {
  --bar-color: var(--accent);
  --bar-h: 50%;
  background: var(--bar-color);
  border-radius: 3px 3px 0 0;
  transform-origin: bottom;
  position: relative;
  z-index: 1;
  flex: 1;
  height: var(--bar-h);
  transform: scaleY(0);
}
.demo-chart.active .demo-chart-bar { animation: grow-bar 0.8s cubic-bezier(0.65, 0, 0.35, 1) forwards; }
.demo-chart-bar:nth-child(3) { --bar-h: 30%; animation-delay: 0.1s; --bar-color: #F9A602; }
.demo-chart-bar:nth-child(4) { --bar-h: 58%; animation-delay: 0.2s; --bar-color: #6366f1; }
.demo-chart-bar:nth-child(5) { --bar-h: 42%; animation-delay: 0.3s; --bar-color: #22c55e; }
.demo-chart-bar:nth-child(6) { --bar-h: 70%; animation-delay: 0.4s; --bar-color: #ef4444; }
.demo-chart-bar:nth-child(7) { --bar-h: 36%; animation-delay: 0.5s; --bar-color: #3b82f6; }
.demo-chart-bar:nth-child(8) { --bar-h: 22%; animation-delay: 0.6s; --bar-color: #F9A602; }
.demo-chart:not(.active) .demo-chart-bar { animation: none; transform: scaleY(0); }

.demo-chart-x-axis {
  display: flex;
  gap: 0.8rem;
  margin-top: 0.4rem;
  margin-left: 24px;
  font-size: 0.6rem;
  color: var(--muted);
  text-align: center;
  font-family: var(--sans);
  flex-shrink: 0;
}
.demo-chart-x-axis div { flex: 1; }

@keyframes grow-bar {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}

/* Phase 3: Mini Form */
.demo-form-layout {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  width: 90%;
  margin: auto;
  padding: 1.5rem 0;
  background: #141210;
  border-radius: 8px;
  padding: 1.5rem;
}
.demo-form-header {
  opacity: 0;
  animation: fade-in-up 0.5s 0.1s forwards;
}
.demo-form-header h4 {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text);
}
.demo-form-header p {
  font-size: 0.7rem;
  color: var(--muted);
}
.demo-form-group {
  opacity: 0;
  transform: translateY(10px);
  animation: fade-in-up 0.5s forwards;
}
.demo-form.active .demo-form-group { animation: fade-in-up 0.5s forwards; }
.demo-form:not(.active) .demo-form-group, .demo-form:not(.active) .demo-form-header { animation: none; opacity: 0; }
.demo-form-group:nth-of-type(1) { animation-delay: 0.15s; }
.demo-form-group:nth-of-type(2) { animation-delay: 0.3s; }
.demo-form-group:nth-of-type(3) { animation-delay: 0.45s; }
.demo-form-group:nth-of-type(4) { animation-delay: 0.6s; }
.demo-form-group:nth-of-type(5) { animation-delay: 0.75s; }

.demo-form-label {
  font-size: 0.65rem;
  color: var(--muted);
  margin-bottom: 0.3rem;
  display: block;
}
.demo-form-field {
  background: var(--bg);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  height: 36px;
  width: 100%;
  padding: 0 0.7rem;
  color: var(--text);
  font-size: 0.8rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.demo-form-field:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.demo-form-textarea {
  height: auto;
  min-height: 48px;
  padding: 0.5rem 0.7rem;
  font-size: 0.7rem;
  color: var(--muted);
  line-height: 1.4;
  resize: none;
  font-family: var(--sans);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.demo-form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
  color: var(--text);
}
.demo-form-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
}
.demo-form-select svg { color: var(--muted); }

.demo-form-button {
  background: var(--accent);
  color: #0D0B08;
  font-weight: 600;
  text-align: center;
  line-height: 36px;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s;
}
.demo-form-button:hover {
  background: var(--accent-hover);
}
.demo-form-button:active, .demo-form-button.clicked {
  transform: scale(0.96);
}
.demo-form-button.clicked {
  background: #22c55e;
  color: #0D0B08;
}

/* --- DEPLOY ANIMATION --- */
.demo-form-button {
  position: relative;
  overflow: hidden;
  transition: background-color 0.2s, color 0.2s, transform 0.2s;
}
.demo-form-button::before {
  content: '';
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--accent-hover);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0s;
  z-index: 0;
}
.demo-form-button span {
  position: relative;
  z-index: 1;
}
.demo-form-button.deploying::before {
  transform: scaleX(1);
  transition: transform 2s linear;
}
.demo-form-button.deploying {
  transform: scale(0.96);
  cursor: wait;
}
.demo-form-button.deployed {
  background-color: #22c55e;
  animation: deploy-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes deploy-bounce {
  0% { transform: scale(0.96); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.deploy-rocket, .deploy-confetti {
  position: absolute;
  bottom: 10px;
  left: 50%;
  pointer-events: none;
  font-size: 24px;
  transform: translateX(-50%);
  z-index: 10;
}
@keyframes rocket-launch {
  0% { transform: translate(-50%, 0) scale(0.5); opacity: 1; }
  100% { transform: translate(-50%, -150px) scale(1.2); opacity: 0; }
}
.deploy-confetti {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0;
}
@keyframes confetti-burst {
  0% {
    transform: translate(-50%, 0) scale(0.5);
    opacity: 1;
  }
  100% {
    transform: translate(var(--confetti-x), var(--confetti-y)) scale(1);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .demo-form-button.deploying::before { transition: none; }
  .demo-form-button.deployed { animation: none; }
  .deploy-rocket, .deploy-confetti { display: none; }
}

/* Dropdown expansion */
.demo-form-select { cursor: pointer; user-select: none; }
.demo-form-dropdown {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s;
  opacity: 0;
  background: var(--bg);
  border: 1px solid var(--border-subtle);
  border-top: none;
  border-radius: 0 0 6px 6px;
  margin-top: -1px;
}
.demo-form-dropdown.open {
  max-height: 150px;
  opacity: 1;
}
.demo-form-dropdown-item {
  padding: 0.5rem 0.7rem;
  font-size: 0.75rem;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.demo-form-dropdown-item:hover {
  background: rgba(249,166,2,0.08);
  color: var(--text);
}
.demo-form-dropdown-item.selected {
  color: var(--accent);
  font-weight: 600;
}
.demo-form-select svg {
  transition: transform 0.3s;
}
.demo-form-select.open svg {
  transform: rotate(180deg);
}

@keyframes fade-in-up {
  to { opacity: 1; transform: translateY(0); }
}

/* Phase 4: Timeline */
.demo-timeline-layout {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.25rem;
  height: 100%;
  padding: 1.5rem 2rem;
  position: relative;
}
.demo-timeline-connector {
  position: absolute;
  left: calc(2rem + 7px);
  top: 1.5rem; bottom: 1.5rem;
  width: 2px;
  background: var(--border-subtle);
}
.demo-timeline-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  position: relative;
  z-index: 1;
}
.demo-timeline-dot {
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  background: var(--accent);
  position: relative;
  flex-shrink: 0;
}
.demo-timeline-dot::after {
  content: '';
  position: absolute;
  inset: 2px;
  background: var(--accent);
  border-radius: 50%;
  transform: scale(0);
  box-shadow: 0 0 8px var(--accent-glow);
}
.demo-timeline.active .demo-timeline-item:nth-child(1) .demo-timeline-dot::after { animation: pop-in 0.4s 0.3s forwards cubic-bezier(0.34, 1.56, 0.64, 1); }
.demo-timeline.active .demo-timeline-item:nth-child(2) .demo-timeline-dot::after { animation: pop-in 0.4s 0.6s forwards cubic-bezier(0.34, 1.56, 0.64, 1); }
.demo-timeline.active .demo-timeline-item:nth-child(3) .demo-timeline-dot::after { animation: pop-in 0.4s 0.9s forwards cubic-bezier(0.34, 1.56, 0.64, 1); }
.demo-timeline.active .demo-timeline-item:nth-child(4) .demo-timeline-dot::after { animation: pop-in 0.4s 1.2s forwards cubic-bezier(0.34, 1.56, 0.64, 1); }
.demo-timeline:not(.active) .demo-timeline-dot::after { animation: none; transform: scale(0); }
.demo-timeline-content {
  opacity: 0;
  transform: translateX(10px);
}
.demo-timeline.active .demo-timeline-content {
  animation: fade-in-right 0.5s forwards;
}
.demo-timeline-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text);
  line-height: 1.3;
}
.demo-timeline-time {
  font-size: 0.65rem;
  color: var(--muted);
  font-family: var(--mono);
}
.demo-timeline.active .demo-timeline-item:nth-child(1) .demo-timeline-content { animation-delay: 0.4s; }
.demo-timeline.active .demo-timeline-item:nth-child(2) .demo-timeline-content { animation-delay: 0.7s; }
.demo-timeline.active .demo-timeline-item:nth-child(3) .demo-timeline-content { animation-delay: 1.0s; }
.demo-timeline.active .demo-timeline-item:nth-child(4) .demo-timeline-content { animation-delay: 1.3s; }
.demo-timeline:not(.active) .demo-timeline-content { animation: none; opacity: 0; }

/* Interactive timeline items */
.demo-timeline-item { cursor: pointer; user-select: none; }
.demo-timeline-item:hover .demo-timeline-label { color: var(--accent); }
.demo-timeline-item.checked .demo-timeline-dot {
  border-color: #22c55e;
  background: #22c55e;
}
.demo-timeline-item.checked .demo-timeline-dot::after {
  background: #fff;
  transform: scale(0.4) !important;
  box-shadow: none;
}
.demo-timeline-item.checked .demo-timeline-label {
  text-decoration: line-through;
  color: var(--muted);
}

@keyframes pop-in {
  to { transform: scale(1); }
}
@keyframes fade-in-right {
  to { opacity: 1; transform: translateX(0); }
}

.widget-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: center;
  margin-top: 8px;
}
.widget-chip {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--muted);
  transition: border-color 0.2s, transform 0.15s;
  cursor: default;
}
.widget-chip:hover {
  border-color: rgba(249,166,2,0.2);
  transform: scale(1.05);
}
.widget-chip.accent {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.widget-chip-detail {
  width: 100%;
  flex-basis: 100%;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease, margin-top 0.5s ease;
  border-left: 2px solid transparent;
  padding-left: 16px;
  margin-top: 0;
  order: 99;
}

.widget-chip[aria-expanded="true"] + .widget-chip-detail {
  max-height: 200px;
  opacity: 1;
  border-left-color: var(--accent);
  margin-top: 12px;
  order: unset;
}

.widget-chip-detail h4 {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.widget-chip-detail p {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 12px;
}
.widget-chip-detail .mockup {
  height: 24px;
  width: 40px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  padding: 4px;
}
.mockup-chart .bar {
  width: 6px;
  background: var(--border);
  border-radius: 2px;
}
.mockup-chart .bar:nth-child(1) { height: 60%; }
.mockup-chart .bar:nth-child(2) { height: 90%; background: var(--accent-subtle); }
.mockup-chart .bar:nth-child(3) { height: 40%; }
.mockup-gauge { padding: 0; position: relative; }
.mockup-gauge-needle {
  width: 2px;
  height: 10px;
  background: var(--accent);
  position: absolute;
  left: 50%;
  top: 4px;
  transform-origin: bottom center;
  transform: rotate(45deg);
  border-radius: 2px;
}

.widget-all-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
  width: 100%;
}
.widget-all-category {
  margin-bottom: 12px;
}
.widget-all-category h5 {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}
.widget-all-item {
  font-size: 13px;
  color: var(--muted);
}
.widget-all-item span {
  font-weight: 500;
  color: var(--text);
}
.widget-all-item .emoji {
  margin-right: 8px;
}

/* ─── Free Widget Gallery ─── */
.widget-gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  max-width: 900px;
  margin: 32px auto 0;
}
.widget-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 24px;
  transition: background 0.2s, transform 0.2s, border-color 0.2s;
  position: relative;
  overflow: hidden;
}
.widget-card:hover {
  background: var(--surface-hover);
  border-color: var(--border);
  transform: translateY(-4px);
}
.widget-card-header {
  height: 80px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  position: relative;
  overflow: hidden;
}
.widget-card-header::before {
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.15;
}
.widget-card.notes .widget-card-header::before { background: radial-gradient(circle at top left, #F9A602, var(--bg) 70%); }
.widget-card.calendar .widget-card-header::before { background: radial-gradient(circle at top left, #34d399, var(--bg) 70%); }
.widget-card.email .widget-card-header::before { background: radial-gradient(circle at top left, #3b82f6, var(--bg) 70%); }
.widget-card-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.widget-card-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 99px;
  background: var(--accent-subtle);
  color: var(--accent);
  border: 1px solid var(--border);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.widget-card-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  margin-bottom: 16px;
}
.widget-card-mockup {
  background: var(--bg-alt);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 12px;
  height: 100px;
  opacity: 0.6;
}
.mockup-notes { display: flex; flex-direction: column; gap: 6px; }
.mockup-notes .line { height: 8px; border-radius: 4px; background: var(--border); }
.mockup-notes .line.long { width: 90%; }
.mockup-notes .line.short { width: 60%; }
.mockup-calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.mockup-calendar .day { width: 100%; aspect-ratio: 1; background: var(--border-subtle); border-radius: 3px; }
.mockup-calendar .day.active { background: var(--accent-subtle); border: 1px solid var(--border); }
.mockup-email { display: flex; flex-direction: column; gap: 6px; }
.mockup-email .mail-item { display: flex; align-items: center; gap: 6px; padding: 4px; border-radius: 4px; }
.mockup-email .mail-item.unread { background: var(--surface); }
.mockup-email .mail-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
.mockup-email .mail-line { width: 100%; height: 6px; border-radius: 4px; background: var(--border); }

/* ─── Showcase ─── */
.showcase-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.showcase-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
  transition: transform 0.2s, border-color 0.2s;
}
.showcase-card:hover {
  transform: translateY(-4px);
  border-color: rgba(249,166,2,0.15);
}
.showcase-gif {
  width: 100%;
  aspect-ratio: 16/10;
  background: linear-gradient(135deg, rgba(249,166,2,0.05), rgba(99,102,241,0.05));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.showcase-gif img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.showcase-placeholder {
  text-align: center;
  font-size: 28px;
  line-height: 1.6;
  color: var(--muted);
}
.showcase-placeholder span {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.5;
}
.showcase-card h4 {
  margin: 16px 20px 6px;
  font-size: 15px;
  font-weight: 700;
}
.showcase-card p {
  margin: 0 20px 16px;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}

.byok-strip {
  max-width: 700px;
  margin: 32px auto 0;
  padding: 16px 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.byok-text {
  font-size: 14px;
  color: var(--muted);
}
.byok-text strong {
  color: var(--text);
}
.byok-right {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}
.byok-price {
  font-weight: 700;
  color: var(--accent);
  white-space: nowrap;
  font-size: 15px;
}
.byok-cta {
  white-space: nowrap;
  padding: 8px 18px;
  font-size: 13px;
}

/* ─── Final CTA ─── */
.final-cta {
  text-align: center;
  padding: 80px 24px;
  position: relative;
  overflow: hidden;
}
.final-cta::before {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 500px; height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(249,166,2,0.06) 0%, transparent 70%);
  pointer-events: none;
}
.final-cta h2 {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  letter-spacing: -1px;
  margin-bottom: 12px;
  position: relative;
}
.final-cta p {
  color: var(--muted);
  font-size: 16px;
  margin-bottom: 32px;
  position: relative;
}
.final-cta .btn-primary {
  padding: 14px 40px;
  font-size: 16px;
  box-shadow: 0 0 30px var(--accent-glow);
  position: relative;
}

/* ─── Footer ─── */
.footer {
  border-top: 1px solid var(--border);
  padding: 40px clamp(16px, 4vw, 48px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1100px;
  margin: 0 auto;
  font-size: 13px;
  color: var(--muted);
}
.footer a {
  color: var(--muted);
  text-decoration: none;
  transition: color 0.2s;
}
.footer a:hover { color: var(--accent); }
.footer-links {
  display: flex;
  gap: 24px;
}
.footer-security {
  font-size: 12px;
}
.footer-security a {
  color: var(--accent);
  text-decoration: none;
}
.footer-security a:hover {
  text-decoration: underline;
}

/* ─── Responsive ─── */
@media (max-width: 1024px) {
  .agents-grid { grid-template-columns: repeat(2, 1fr); }
  .plans-row { grid-template-columns: repeat(3, 1fr); }
  .showcase-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .section { overflow-x: hidden; }
  .nav-toggle { display: flex; }
  .nav-links {
    display: flex;
    position: absolute;
    top: 56px;
    left: 0; right: 0;
    flex-direction: column;
    background: rgba(10,10,15,0.98);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    padding: 0 clamp(16px, 4vw, 48px);
    gap: 4px;
    border-bottom: 1px solid transparent;
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4,0,0.2,1),
                padding 0.4s cubic-bezier(0.4,0,0.2,1),
                border-color 0.3s ease;
  }
  .nav-links.open {
    max-height: 320px;
    padding: 12px clamp(16px, 4vw, 48px) 16px;
    border-bottom-color: var(--border);
  }
  .nav-links li {
    opacity: 0;
    transform: translateY(-10px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  }
  .nav-links.open li {
    opacity: 1;
    transform: translateY(0);
  }
  .nav-links.open li:nth-child(1) { transition-delay: 0.05s; }
  .nav-links.open li:nth-child(2) { transition-delay: 0.10s; }
  .nav-links.open li:nth-child(3) { transition-delay: 0.15s; }
  .nav-links.open li:nth-child(4) { transition-delay: 0.20s; }
  .nav-links.open li:nth-child(5) { transition-delay: 0.25s; }
  .nav-links a {
    display: block;
    padding: 14px 20px;
    min-height: 48px;
    background: rgba(249,166,2,0.04);
    border-radius: 8px;
    color: var(--muted);
    font-size: 15px;
    transition: background 0.2s, color 0.2s;
    border: 1px solid transparent;
  }
  .nav-links a:hover {
    background: rgba(249,166,2,0.10);
    color: var(--accent);
    border-color: rgba(249,166,2,0.15);
  }
  .nav-actions .btn-ghost { font-size: 13px; padding: 6px 14px; min-height: 36px; }
  .demo-nav { display: none; } /* Hide dots on mobile */
  .demo-nav-arrows { display: flex; }

  .hero {
    min-height: auto;
    padding: 80px 20px 40px;
  }
  .hero h1 {
    font-size: clamp(28px, 8vw, 42px);
    letter-spacing: -1px;
  }
  .hero-sub {
    margin-top: 12px;
    font-size: 15px;
  }
  .hero-cta { margin-top: 24px; }
  .hero-scroll { margin-top: 32px; }

  .widget-showcase { grid-template-columns: 1fr; }
  .widget-info { text-align: center; padding: 0 16px; }
  .widget-info-title, .widget-info-desc { text-align: center; }
  .widget-demo-animated { aspect-ratio: 4 / 3.5; min-height: 280px; }
  .demo-gauge { width: clamp(70px, 20vw, 100px); }
  .demo-gauges-grid { gap: 1rem; }
  .demo-form-layout { gap: 0.5rem; padding: 0.75rem; }
  .demo-form-field { height: 30px; font-size: 0.7rem; }
  .demo-form-header h4 { font-size: 0.75rem; }
  .demo-form-header p { display: none; }
  .demo-timeline-layout { padding: 1rem 1.5rem; gap: 0.8rem; }
  .demo-chart-wrapper { padding: 0.75rem 1rem; }
  .widget-gallery { grid-template-columns: 1fr; max-width: 380px; margin-left: auto; margin-right: auto; }
  .agents-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
  .plans-row { grid-template-columns: 1fr; max-width: 380px; margin: 0 auto; }
  .showcase-grid { grid-template-columns: 1fr; max-width: 400px; margin: 0 auto; }
  .opencore { grid-template-columns: 1fr; }
  .footer { flex-direction: column; gap: 16px; text-align: center; }
  .section { padding: 56px 20px; }
  .section-title { font-size: clamp(22px, 5vw, 32px); }
  .security-banner { flex-direction: column; text-align: center; padding: 20px; }
  .byok-strip { flex-direction: column; text-align: center; }
}
@media (max-width: 480px) {
  .agents-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  .hero-cta { flex-direction: column; align-items: center; }
  .hero-cta .btn { width: 100%; max-width: 300px; }
}
@media (prefers-reduced-motion: reduce) {
  .hero-mesh::before, .hero-mesh::after { animation: none; }
  .hero-scroll { animation: none; }
  .section { opacity: 1; transform: none; transition: none; }
  .plan-badge { animation: none; }
  .hero-badge-dot { animation: none; }
  .agent-status { animation: none; }
  .demo-item, .demo-gauge .fill, .demo-chart-bar, .demo-form-field, .demo-timeline-dot::after { animation: none !important; }
  .demo-item { opacity: 0; }
  .demo-gauges { opacity: 1; transform: scale(1); }
  .demo-gauges .fill-1 { stroke-dashoffset: calc(283 - (283 * 0.75)); }
  .demo-gauges .fill-2 { stroke-dashoffset: calc(283 - (283 * 0.48)); }
  .demo-gauges .fill-3 { stroke-dashoffset: calc(283 - (283 * 0.91)); }
  .demo-gauges .fill-4 { stroke-dashoffset: calc(283 - (283 * 0.62)); }
}
`;

/* ── Component ── */

class ScLanding extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._render();
    this._observer = null;
  }

  connectedCallback() {
    this._wireEvents();
    this._setupScrollNav();
    this._setupIntersectionObserver();
  }

  disconnectedCallback() {
    if (this._observer) this._observer.disconnect();
  }

  _wireEvents() {
    const root = this.shadowRoot;

    /* Mobile hamburger toggle */
    const navToggle = root.querySelector('.nav-toggle');
    const navLinks = root.querySelector('.nav-links');
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', () => {
        const open = navLinks.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', String(open));
      });
      navLinks.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          navLinks.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    /* Nav brand → scroll to top */
    const navBrand = root.querySelector('[data-scroll-top]');
    if (navBrand) {
      navBrand.addEventListener('click', (e) => {
        e.preventDefault();
        root.querySelector('.hero')?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    /* CTA buttons */
    root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._emit(btn.dataset.action, btn.dataset.plan));
    });

    /* Plan CTAs */
    root.querySelectorAll('.plan-cta').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._emit('select-plan', btn.dataset.plan);
      });
    });

    /* Smooth scroll — nav anchors + data-scroll */
    root.querySelectorAll('[data-scroll]').forEach(el => {
      el.addEventListener('click', () => {
        const target = root.getElementById(el.dataset.scroll);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });
    root.querySelectorAll('.nav-links a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('href').slice(1);
        const target = root.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    /* Copy button */
    root.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copy;
        navigator.clipboard.writeText(text).then(() => {
          const orig = btn.innerHTML;
          btn.textContent = '✓ Copied';
          setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }).catch(() => {});
      });
    });

    /* Demo navigation (auto-cycle + manual dots + pause on interaction) */
    const demoItems = root.querySelectorAll('.demo-item');
    const demoDots = root.querySelectorAll('.demo-dot');
    let demoIndex = 0;
    let demoInterval = null;
    let demoPauseTimeout = null;

    const showDemo = (idx) => {
      // Correctly handle negative indices from previous button
      const newIndex = (idx + demoItems.length) % demoItems.length;
      if (newIndex === demoIndex) return;

      demoItems.forEach((item, i) => {
        item.classList.remove('active');
      });
      demoItems[newIndex].classList.add('active');
      demoIndex = newIndex;
      demoDots.forEach((dot, i) => dot.classList.toggle('active', i === demoIndex));
    };

    const startDemoCycle = () => {
      if (demoInterval) clearInterval(demoInterval);
      demoInterval = setInterval(() => showDemo(demoIndex + 1), 10000);
    };

    const pauseDemo = (ms = 8000) => {
      if (demoInterval) { clearInterval(demoInterval); demoInterval = null; }
      if (demoPauseTimeout) clearTimeout(demoPauseTimeout);
      demoPauseTimeout = setTimeout(startDemoCycle, ms);
    };

    demoDots.forEach(dot => {
      dot.addEventListener('click', () => {
        showDemo(Number(dot.dataset.demo));
        pauseDemo(6000);
      });
    });

    /* Arrow button navigation */
    const prevArrow = root.querySelector('.demo-arrow.prev');
    const nextArrow = root.querySelector('.demo-arrow.next');
    if (prevArrow && nextArrow) {
      prevArrow.addEventListener('click', () => {
        showDemo(demoIndex - 1);
        pauseDemo(8000);
      });
      nextArrow.addEventListener('click', () => {
        showDemo(demoIndex + 1);
        pauseDemo(8000);
      });
    }

    if (demoItems.length > 0) startDemoCycle();

    /* Touch swipe between demo tiles */
    const demoContainer = root.querySelector('.widget-demo-animated');
    if (demoContainer) {
      let touchStartX = 0;
      let touchStartY = 0;
      let swiping = false;
      demoContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        swiping = true;
      }, { passive: true });
      demoContainer.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        // Only swipe if horizontal movement > vertical (avoid blocking scroll)
        if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          e.preventDefault();
        }
      }, { passive: false });
      demoContainer.addEventListener('touchend', (e) => {
        if (!swiping) return;
        swiping = false;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
        if (dx < 0) {
          // Swipe left → next
          showDemo(demoIndex + 1);
        } else {
          // Swipe right → previous
          showDemo(demoIndex - 1);
        }
        pauseDemo(8000);
      }, { passive: true });
    }

    /* Interactive form: dropdown toggle */
    const demoSelect = root.querySelector('[data-demo-select]');
    const demoDropdown = root.querySelector('[data-demo-dropdown]');
    if (demoSelect && demoDropdown) {
      demoSelect.addEventListener('click', () => {
        const isOpen = demoDropdown.classList.toggle('open');
        demoSelect.classList.toggle('open', isOpen);
        pauseDemo(10000);
      });
      demoDropdown.querySelectorAll('.demo-form-dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
          demoDropdown.querySelectorAll('.demo-form-dropdown-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          const label = demoSelect.querySelector('.demo-select-label');
          if (label) label.textContent = item.dataset.team;
          demoDropdown.classList.remove('open');
          demoSelect.classList.remove('open');
          pauseDemo(8000);
        });
      });
    }

    /* Interactive form: deploy button */
    const deployBtn = root.querySelector('[data-demo-deploy]');
    if (deployBtn) {
      // It's a div, let's make it a button and set up the structure
      const button = document.createElement('button');
      button.className = deployBtn.className;
      button.dataset.demoDeploy = '';

      const span = document.createElement('span');
      span.textContent = deployBtn.textContent.trim();
      button.appendChild(span);

      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      
      deployBtn.parentNode.replaceChild(wrapper, deployBtn);
      wrapper.appendChild(button);

      button.addEventListener('click', () => {
        if (button.classList.contains('deploying') || button.classList.contains('deployed')) {
          return;
        }

        pauseDemo(6000);
        button.classList.add('deploying');
        span.textContent = 'Setting up...';

        setTimeout(() => { span.textContent = 'Configuring agents...'; }, 700);
        setTimeout(() => { span.textContent = 'Creating workspace...'; }, 1400);

        setTimeout(() => {
          button.classList.remove('deploying');
          button.classList.add('deployed');
          span.textContent = '✓ Created!';

          // Rocket
          const rocket = document.createElement('div');
          rocket.className = 'deploy-rocket';
          rocket.textContent = '🚀';
          rocket.style.animation = 'rocket-launch 1s ease-out forwards';
          wrapper.appendChild(rocket);
          setTimeout(() => rocket.remove(), 1000);

          // Confetti
          for (let i = 0; i < 20; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'deploy-confetti';
            const x = (Math.random() - 0.5) * 200;
            const y = -(Math.random() * 150);
            confetti.style.setProperty('--confetti-x', `${x}px`);
            confetti.style.setProperty('--confetti-y', `${y}px`);
            confetti.style.background = `hsl(${Math.random() * 360}, 100%, 70%)`;
            confetti.style.animation = `confetti-burst 0.8s ${i * 0.02}s ease-out forwards`;
            wrapper.appendChild(confetti);
            setTimeout(() => confetti.remove(), 1000);
          }

          // Reset button
          setTimeout(() => {
            button.classList.remove('deployed');
            span.textContent = 'Create Project';
          }, 2500);
        }, 2000);
      });
    }

    /* Interactive timeline: toggle checked */
    root.querySelectorAll('.demo-timeline .demo-timeline-item').forEach(item => {
      item.addEventListener('click', () => {
        item.classList.toggle('checked');
        pauseDemo(8000);
      });
    });

    /* Dynamic gauge values — fluctuate while gauge tile is active */
    const gaugeConfigs = [
      { el: null, val: 75, min: 30, max: 95, step: 8, unit: '%', decimals: 0, mode: 'fluctuate' },   // CPU
      { el: null, val: 4.8, min: 4.2, max: 7.5, step: 0.3, unit: 'G', decimals: 1, mode: 'creep' }, // Memory — slowly climbs
      { el: null, val: 91, min: 40, max: 99, step: 6, unit: '%', decimals: 0, mode: 'fluctuate' },   // Disk IO
      { el: null, val: 62, min: 40, max: 95, step: 5, unit: '%', decimals: 0, mode: 'fluctuate' },  // Network
    ];
    const gaugeEls = root.querySelectorAll('.demo-gauge');
    const fillEls = root.querySelectorAll('.demo-gauge .fill');
    const fillTargets = [0.75, 0.48, 0.91, 0.62];
    gaugeEls.forEach((g, i) => { if (gaugeConfigs[i]) gaugeConfigs[i].el = g.querySelector('.value'); });

    let gaugeInterval = null;
    const tickGauges = () => {
      const gaugesPanel = root.querySelector('.demo-gauges');
      if (!gaugesPanel || !gaugesPanel.classList.contains('active')) return;
      gaugeConfigs.forEach((cfg, i) => {
        if (!cfg.el) return;
        let val = cfg.val;
        if (cfg.mode === 'fluctuate') {
          val += (Math.random() - 0.5) * cfg.step * 2;
        } else if (cfg.mode === 'creep') {
          val += Math.random() * cfg.step;
        } else if (cfg.mode === 'increment') {
          val += Math.random() * cfg.step + 1;
        }
        val = Math.max(cfg.min, Math.min(cfg.max, val));
        cfg.val = val;
        cfg.el.textContent = val.toFixed(cfg.decimals) + cfg.unit;
        if (fillEls[i]) {
          const pct = cfg.unit === 'G' ? val / 8 : val / 100;
          fillEls[i].style.strokeDashoffset = String(283 - (283 * Math.min(pct, 1)));
        }
      });
    };
    gaugeInterval = setInterval(tickGauges, 2000);

    /* Widget chip expansion */
    root.querySelectorAll('.widget-chip').forEach(chip => {
      chip.addEventListener('click', (e) => this._toggleWidget(e.currentTarget));
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._toggleWidget(e.currentTarget);
        }
      });
    });
  }

  _toggleWidget(chip) {
    const isExpanded = chip.getAttribute('aria-expanded') === 'true';
    const widgetId = chip.dataset.widgetId;

    // Close all other chips
    this.shadowRoot.querySelectorAll('.widget-chip').forEach(c => {
      if (c !== chip) {
        c.setAttribute('aria-expanded', 'false');
      }
    });

    // Toggle the clicked chip
    chip.setAttribute('aria-expanded', String(!isExpanded));
    
    // Special handling for the "+26 more" chip detail, which is much larger
    const detailElement = this.shadowRoot.querySelector(`[data-widget-detail="${widgetId}"]`);
    if (widgetId === 'all' && detailElement) {
      const currentlyExpanded = chip.getAttribute('aria-expanded') === 'true';
      detailElement.style.maxHeight = currentlyExpanded ? '600px' : '0';
    }
  }

  _emit(action, planId) {
    this.dispatchEvent(new CustomEvent('landing-action', {
      bubbles: true, composed: true,
      detail: { action, ...(planId ? { planId } : {}) },
    }));
  }

  _render() {
    /* ── Agents ── */
    const agentsHtml = AGENTS.map(a => `
      <div class="agent-card" style="--agent-color: ${a.color}; --agent-glow: ${a.color}33;">
        <div class="agent-avatar">
          ${a.avatar}
          <div class="agent-status"></div>
        </div>
        <div class="agent-name">${a.name}</div>
        <div class="agent-role">${a.role}</div>
        <div class="agent-tagline">"${a.tagline}"</div>
        <div class="agent-desc">${a.desc}</div>
      </div>
    `).join('');

    /* ── Plans ── */
    const plansHtml = PLANS.map(p => {
      const included = p.features.map(f => `<li><span class="check">${ICON.check}</span> ${f}</li>`).join('');
      const excluded = p.excluded.map(f => `<li class="excluded"><span class="cross">&#x2715;</span> ${f}</li>`).join('');
      const priceHtml = p.price !== null ? `&euro;${p.price}<span>${p.period}</span>` : `Custom`;
      
      return `
        <div class="plan-card ${p.highlight ? 'highlight' : ''}" data-plan="${p.id}">
          ${p.badge ? `<div class="plan-badge">${p.badge}</div>` : ''}
          <div class="plan-name">${p.name}</div>
          <div class="plan-price">${priceHtml}</div>
          <div class="plan-subtitle">${p.subtitle}</div>
          <ul class="plan-features">${included}${excluded}</ul>
          <button class="btn ${p.highlight ? 'btn-primary' : 'btn-secondary'} plan-cta" data-plan="${p.id}">${p.cta}</button>
        </div>
      `;
    }).join('');

    /* ── Open Core Lists ── */
    const freeItems = [
      'Single-user personal workspace',
      'Your server, your API keys, your data',
      '4 skilled agents with unique expertise',
      '34 canvas components',
      'Persistent agent memory',
      'Protected by ProteClaw',
      'Community support',
    ];
    const paidItems = [
      'We run it — zero server ops',
      'Multi-user with seat management',
      'Pre-configured models (Sonnet, Opus)',
      'Managed memory and backups',
      'Automatic updates',
      'Priority support',
    ];

    const freeListHtml = freeItems.map(i => `<li>${ICON.check} ${i}</li>`).join('');
    const paidListHtml = paidItems.map(i => `<li>${ICON.check} ${i}</li>`).join('');

    /* ── Assemble ── */
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="landing-wrapper">

      <!-- Nav -->
      <nav class="nav" role="navigation" aria-label="Main navigation">
        <a class="nav-brand" href="#" data-scroll-top>
          <img src="/assets/scratchy-logo.png" alt="Scratchy" width="32" height="32" style="border-radius:6px">
          Scratchy
        </a>
        <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <ul class="nav-links">
          <li><a href="#difference">Why Scratchy</a></li>
          <li><a href="#widgets">Widgets</a></li>
          <li><a href="#free-widgets">Free Apps</a></li>
          <li><a href="#team">Agents</a></li>
          <li><a href="#pricing">Pricing</a></li>
        </ul>
        <div class="nav-actions">
          <button class="btn btn-ghost" data-action="sign-in">Sign In</button>
          <button class="btn btn-primary" data-action="get-started">Get Started</button>
        </div>
      </nav>

      <!-- Hero -->
      <section class="hero">
        <div class="hero-mesh"></div>
        <div class="hero-content">
          <img src="/assets/scratchy-logo.png" alt="Scratchy" class="hero-logo">
          <div class="hero-badge">
            <span class="hero-badge-dot"></span>
            Open-core AI workspace
          </div>
          <h1>Your AI agents <span class="gold">remember yesterday</span>.</h1>
          <p class="hero-sub">Every AI chat resets when you close the tab. Scratchy agents have persistent memory, specialized skills, and build real UI — on your server.</p>
          <div class="hero-cta">
            <button class="btn btn-primary" data-action="get-started">Get Started</button>
            <button class="btn btn-ghost" data-scroll="open-core">${ICON.lock} Self-host it</button>
          </div>
        </div>
        <div class="hero-scroll" data-scroll="difference">
          ${ICON.chevronDown}
        </div>
      </section>

      <!-- What Makes It Different -->
      <section id="difference" class="section">
        <div class="section-eyebrow">Why Scratchy</div>
        <h2 class="section-title">Not another AI chat wrapper</h2>
        <p class="section-subtitle">Three things that actually matter.</p>
        <div class="diff-grid">

          <div class="diff-block">
            <div class="diff-visual">
              <div class="diff-visual-placeholder"><div class="diff-visual-emoji">🧠</div><span>Screenshot: memory recall</span></div>
            </div>
            <div class="diff-text">
              <h3><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.37 2.63a2.12 2.12 0 0 1 3 3L14 13l-4 1 1-4Z"/><path d="M20 7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2V7"/><path d="M2 12h4"/></svg> Memory that survives</h3>
              <p>Your agent remembers last week's conversation. Your preferences. Your codebase context. Daily logs, long-term knowledge, project state. No more re-explaining everything.</p>
            </div>
          </div>

          <div class="diff-block">
            <div class="diff-visual">
              <div class="diff-visual-placeholder"><div class="diff-visual-emoji">🎯</div><span>Screenshot: agent soul file</span></div>
            </div>
            <div class="diff-text">
              <h3><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> Agents with skills, not just prompts</h3>
              <p>Each agent has a soul file defining its personality, expertise, and trigger conditions. Not a generic chatbot — a specialist that knows its tools, its domain, and when to activate.</p>
            </div>
          </div>

          <div class="diff-block">
            <div class="diff-visual">
              <div class="diff-visual-placeholder"><div class="diff-visual-emoji">🖼️</div><span>Screenshot: live canvas</span></div>
            </div>
            <div class="diff-text">
              <h3><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg> Agents build interfaces, not paragraphs</h3>
              <p>Ask for a dashboard and get a dashboard. 34 interactive components — charts, forms, tables, timelines, gauges — composed in real-time. Not markdown. Actual UI.</p>
            </div>
          </div>

        </div>
      </section>

      <div class="section-divider"></div>
      <section id="security" class="section">
        <div class="security-banner">
          <div class="security-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M9 12l2 2 4-4"/></svg>
          </div>
          <div class="security-content">
            <h3>Protected by ProteClaw</h3>
            <p>Every conversation is guarded by real-time injection detection, dynamic tool blocking, and content scanning — enforced below the agent layer. Your agents can't override their own guardrails.</p>
            <a href="https://github.com/yassinebkr/proteclaw" target="_blank" rel="noopener">View on GitHub →</a>
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Widget Showcase: A2UI -->
      <section id="widgets" class="section">
        <div class="widget-showcase">
          <div class="widget-demo-animated">
            <div class="demo-item demo-gauges active">
              <div class="demo-nav-arrows">
                <button class="demo-arrow prev" aria-label="Previous demo">&lt;</button>
                <button class="demo-arrow next" aria-label="Next demo">&gt;</button>
              </div>
              <div class="demo-gauges-grid">
                <div class="demo-gauge" style="--gauge-color: #F9A602;">
                  <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="45"></circle><circle class="fill fill-1" cx="50" cy="50" r="45"></circle></svg>
                  <div class="value">75%</div>
                  <div class="label">CPU</div>
                </div>
                <div class="demo-gauge" style="--gauge-color: #6366f1;">
                  <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="45"></circle><circle class="fill fill-2" cx="50" cy="50" r="45"></circle></svg>
                  <div class="value">4.8G</div>
                  <div class="label">Memory</div>
                </div>
                <div class="demo-gauge" style="--gauge-color: #22c55e;">
                  <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="45"></circle><circle class="fill fill-3" cx="50" cy="50" r="45"></circle></svg>
                  <div class="value">91%</div>
                  <div class="label">Disk IO</div>
                </div>
                <div class="demo-gauge" style="--gauge-color: #3b82f6;">
                  <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="45"></circle><circle class="fill fill-4" cx="50" cy="50" r="45"></circle></svg>
                  <div class="value">62%</div>
                  <div class="label">Network</div>
                </div>
              </div>
            </div>
            <div class="demo-item demo-chart">
              <div class="demo-chart-wrapper">
                <div class="demo-chart-title">Weekly Activity</div>
                <div class="demo-chart-grid-container">
                  <div class="demo-chart-y-label">Tasks</div>
                  <div class="demo-chart-y-axis">
                    <div class="line" data-val="40"></div><div class="line" data-val="30"></div><div class="line" data-val="20"></div><div class="line" data-val="10"></div>
                  </div>
                  <div class="demo-chart-bar"></div>
                  <div class="demo-chart-bar"></div>
                  <div class="demo-chart-bar"></div>
                  <div class="demo-chart-bar"></div>
                  <div class="demo-chart-bar"></div>
                  <div class="demo-chart-bar"></div>
                </div>
                <div class="demo-chart-x-axis">
                  <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                </div>
              </div>
            </div>
            <div class="demo-item demo-form">
              <div class="demo-form-layout">
                <div class="demo-form-header">
                  <h4>Create New Project</h4>
                  <p>Configure and launch a new agent workspace.</p>
                </div>
                <div class="demo-form-group">
                  <label class="demo-form-label">Project Name</label>
                  <input type="text" class="demo-form-field" value="Landing Page Redesign">
                </div>
                <div class="demo-form-group">
                  <label class="demo-form-label">Agent Preset</label>
                  <div class="demo-form-field demo-form-select" data-demo-select>
                    <span class="demo-select-label">SEO &amp; Content</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="demo-form-dropdown" data-demo-dropdown>
                    <div class="demo-form-dropdown-item selected" data-team="SEO &amp; Content">SEO &amp; Content</div>
                    <div class="demo-form-dropdown-item" data-team="Data Analysis">Data Analysis</div>
                    <div class="demo-form-dropdown-item" data-team="Backend / Arch">Backend / Arch</div>
                  </div>
                </div>
                <div class="demo-form-group">
                  <button class="demo-form-field demo-form-button" data-demo-deploy><span>Create Project</span></button>
                </div>
              </div>
            </div>
            <div class="demo-item demo-timeline">
              <div class="demo-timeline-layout">
                <div class="demo-timeline-connector"></div>
                <div class="demo-timeline-item">
                  <div class="demo-timeline-dot"></div>
                  <div class="demo-timeline-content">
                    <div class="demo-timeline-label">Deploy v2.1</div>
                    <div class="demo-timeline-time">2m ago</div>
                  </div>
                </div>
                <div class="demo-timeline-item">
                  <div class="demo-timeline-dot"></div>
                  <div class="demo-timeline-content">
                    <div class="demo-timeline-label">Run integration tests</div>
                    <div class="demo-timeline-time">5m ago</div>
                  </div>
                </div>
                <div class="demo-timeline-item">
                  <div class="demo-timeline-dot"></div>
                  <div class="demo-timeline-content">
                    <div class="demo-timeline-label">Code review</div>
                    <div class="demo-timeline-time">1h ago</div>
                  </div>
                </div>
                <div class="demo-timeline-item">
                  <div class="demo-timeline-dot"></div>
                  <div class="demo-timeline-content">
                    <div class="demo-timeline-label">PR merged</div>
                    <div class="demo-timeline-time">3h ago</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="demo-nav">
              <button class="demo-dot active" data-demo="0" aria-label="Show gauges demo"></button>
              <button class="demo-dot" data-demo="1" aria-label="Show chart demo"></button>
              <button class="demo-dot" data-demo="2" aria-label="Show form demo"></button>
              <button class="demo-dot" data-demo="3" aria-label="Show timeline demo"></button>
            </div>
          </div>
          <div class="widget-info">
            <div class="section-eyebrow">Agent-to-User Interface</div>
            <h2 class="widget-info-title">The interface that builds itself.</h2>
            <p class="widget-info-desc">Stop building dashboards. Ask for what you need, and A2UI widgets render the right interface in real-time. From live server stats to project timelines, the UI adapts to your conversation.</p>
            <div class="widget-grid">
              <div class="widget-chip" tabindex="0" role="button" aria-expanded="false" data-widget-id="charts">📊 Charts</div>
              <div class="widget-chip-detail" data-widget-detail="charts">
                <h4>📊 Charts</h4>
                <p>Bar and line charts with labeled datasets and color coding.</p>
                <div class="mockup mockup-chart">
                  <div class="bar"></div>
                  <div class="bar"></div>
                  <div class="bar"></div>
                </div>
              </div>

              <div class="widget-chip" tabindex="0" role="button" aria-expanded="false" data-widget-id="gauges">📏 Gauges</div>
              <div class="widget-chip-detail" data-widget-detail="gauges">
                <h4>📏 Gauges</h4>
                <p>Circular or linear progress with value, max, and color.</p>
                <div class="mockup mockup-gauge"><div class="mockup-gauge-needle"></div></div>
              </div>

              <div class="widget-chip" tabindex="0" role="button" aria-expanded="false" data-widget-id="forms">📋 Forms</div>
              <div class="widget-chip-detail" data-widget-detail="forms">
                <h4>📋 Forms</h4>
                <p>Multi-field input forms with validation and submit actions.</p>
              </div>

              <div class="widget-chip" tabindex="0" role="button" aria-expanded="false" data-widget-id="timelines">⏱️ Timelines</div>
               <div class="widget-chip-detail" data-widget-detail="timelines">
                <h4>⏱️ Timelines</h4>
                <p>Chronological event display with icons and status.</p>
              </div>

              <div class="widget-chip" tabindex="0" role="button" aria-expanded="false" data-widget-id="checklists">✅ Checklists</div>
              <div class="widget-chip-detail" data-widget-detail="checklists">
                <h4>✅ Checklists</h4>
                <p>Interactive task lists with checkboxes.</p>
              </div>

              <div class="widget-chip" tabindex="0" role="button" aria-expanded="false" data-widget-id="tables">🗂️ Tables</div>
              <div class="widget-chip-detail" data-widget-detail="tables">
                <h4>🗂️ Tables</h4>
                <p>Sortable data tables with headers and rows.</p>
              </div>

              <div class="widget-chip" tabindex="0" role="button" aria-expanded="false" data-widget-id="sparklines">📈 Sparklines</div>
              <div class="widget-chip-detail" data-widget-detail="sparklines">
                <h4>📈 Sparklines</h4>
                <p>Inline trend visualization with color gradients.</p>
              </div>

              <div class="widget-chip" tabindex="0" role="button" aria-expanded="false" data-widget-id="sliders">🎛️ Sliders</div>
              <div class="widget-chip-detail" data-widget-detail="sliders">
                <h4>🎛️ Sliders</h4>
                <p>Range input with min/max and current value.</p>
              </div>

              <div class="widget-chip accent" tabindex="0" role="button" aria-expanded="false" data-widget-id="all">+26 more</div>
              <div class="widget-chip-detail" data-widget-detail="all">
                <div class="widget-all-grid">
                  <div class="widget-all-category">
                    <h5>Data</h5>
                    <div class="widget-all-item"><span class="emoji">📊</span> <span>Charts:</span> Bar and line graphs</div>
                    <div class="widget-all-item"><span class="emoji">📏</span> <span>Gauges:</span> Circular and linear progress</div>
                    <div class="widget-all-item"><span class="emoji">📈</span> <span>Sparklines:</span> Inline trend charts</div>
                    <div class="widget-all-item"><span class="emoji">🔢</span> <span>Stats:</span> Key/value metric display</div>
                    <div class="widget-all-item"><span class="emoji">🔑</span> <span>KV:</span> Key-value pairs list</div>
                    <div class="widget-all-item"><span class="emoji">🔄</span> <span>Progress:</span> Linear progress bars</div>
                    <div class="widget-all-item"><span class="emoji">📊</span> <span>Stacked Bar:</span> Proportional data</div>
                  </div>
                  <div class="widget-all-category">
                    <h5>Layout</h5>
                    <div class="widget-all-item"><span class="emoji">📇</span> <span>Cards:</span> Content containers</div>
                    <div class="widget-all-item"><span class="emoji">📂</span> <span>Accordion:</span> Collapsible sections</div>
                    <div class="widget-all-item"><span class="emoji">📑</span> <span>Tabs:</span> Tabbed content views</div>
                    <div class="widget-all-item"><span class="emoji">⏱️</span> <span>Timeline:</span> Chronological events</div>
                    <div class="widget-all-item"><span class="emoji">🦸</span> <span>Hero:</span> Prominent headline sections</div>
                    <div class="widget-all-item"><span class="emoji">🏷️</span> <span>Tags:</span> Keyword labels</div>
                  </div>
                  <div class="widget-all-category">
                    <h5>Input</h5>
                    <div class="widget-all-item"><span class="emoji">📋</span> <span>Forms:</span> Full-featured input forms</div>
                    <div class="widget-all-item"><span class="emoji">🔘</span> <span>Buttons:</span> Clickable actions</div>
                    <div class="widget-all-item"><span class="emoji">🏷️</span> <span>Chips:</span> Selectable toggles</div>
                    <div class="widget-all-item"><span class="emoji">🎚️</span> <span>Toggle:</span> On/off switch</div>
                    <div class="widget-all-item"><span class="emoji">🎛️</span> <span>Slider:</span> Range selection</div>
                    <div class="widget-all-item"><span class="emoji">⭐</span> <span>Rating:</span> Star-based rating input</div>
                    <div class="widget-all-item"><span class="emoji">⌨️</span> <span>Input:</span> Basic text/number input</div>
                  </div>
                  <div class="widget-all-category">
                    <h5>Content</h5>
                    <div class="widget-all-item"><span class="emoji">🗂️</span> <span>Table:</span> Sortable data grids</div>
                    <div class="widget-all-item"><span class="emoji">✅</span> <span>Checklist:</span> Interactive task lists</div>
                    <div class="widget-all-item"><span class="emoji">💻</span> <span>Code:</span> Syntax-highlighted code</div>
                    <div class="widget-all-item"><span class="emoji">🖼️</span> <span>Image:</span> Image display</div>
                    <div class="widget-all-item"><span class="emoji">📹</span> <span>Video:</span> Video player</div>
                    <div class="widget-all-item"><span class="emoji">🔗</span> <span>Link Card:</span> Rich URL previews</div>
                    <div class="widget-all-item"><span class="emoji">🚦</span> <span>Status:</span> Colored status indicator</div>
                    <div class="widget-all-item"><span class="emoji">🌦️</span> <span>Weather:</span> Weather conditions</div>
                    <div class="widget-all-item"><span class="emoji">🔥</span> <span>Streak:</span> Habit tracker</div>
                  </div>
                   <div class="widget-all-category">
                    <h5>Interactive</h5>
                    <div class="widget-all-item"><span class="emoji">📝</span> <span>Form Strip:</span> Quick action forms</div>
                    <div class="widget-all-item"><span class="emoji">🔔</span> <span>Alert:</span> Notification messages</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Free Built-in Widgets -->
      <section id="free-widgets" class="section">
        <div class="section-eyebrow">Included Free</div>
        <h2 class="section-title">Your workspace, out of the box.</h2>
        <p class="section-subtitle">Three built-in widgets — no setup, no plugins, no extra cost. Every self-hosted instance gets these.</p>
        <div class="widget-gallery">
          <div class="widget-card notes">
            <div class="widget-card-header">📝</div>
            <div class="widget-card-title">Notes <span class="widget-card-badge">FREE</span></div>
            <p class="widget-card-desc">Persistent notes with search and organization. Your workspace notepad, always available for quick thoughts and docs.</p>
            <div class="widget-card-mockup mockup-notes">
              <div class="line long"></div>
              <div class="line short"></div>
              <div class="line long"></div>
              <div class="line long"></div>
              <div class="line short"></div>
            </div>
          </div>
          <div class="widget-card calendar">
            <div class="widget-card-header">📅</div>
            <div class="widget-card-title">Calendar <span class="widget-card-badge">FREE</span></div>
            <p class="widget-card-desc">Month view with events and reminders. Connect external calendars and let your agent manage your time.</p>
            <div class="widget-card-mockup mockup-calendar">
              <div class="day"></div><div class="day"></div><div class="day active"></div><div class="day"></div><div class="day"></div><div class="day"></div><div class="day"></div>
              <div class="day"></div><div class="day"></div><div class="day"></div><div class="day active"></div><div class="day"></div><div class="day"></div><div class="day"></div>
              <div class="day"></div><div class="day"></div><div class="day"></div><div class="day"></div><div class="day"></div><div class="day"></div><div class="day"></div>
            </div>
          </div>
          <div class="widget-card email">
            <div class="widget-card-header">📬</div>
            <div class="widget-card-title">Email <span class="widget-card-badge">FREE</span></div>
            <p class="widget-card-desc">Read, compose, and manage email directly from your workspace. A focused inbox to cut through the noise.</p>
            <div class="widget-card-mockup mockup-email">
              <div class="mail-item unread"><div class="mail-dot"></div><div class="mail-line"></div></div>
              <div class="mail-item unread"><div class="mail-dot"></div><div class="mail-line"></div></div>
              <div class="mail-item"><div style="width:6px;flex-shrink:0"></div><div class="mail-line"></div></div>
              <div class="mail-item"><div style="width:6px;flex-shrink:0"></div><div class="mail-line"></div></div>
            </div>
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Meet The Team -->
      <section id="team" class="section">
        <div class="section-eyebrow">The Crew</div>
        <h2 class="section-title">Four skilled agents. Actual expertise.</h2>
        <p class="section-subtitle">Not generic assistants — specialists with defined skills, opinions, and memory.</p>
        <div class="agents-grid">${agentsHtml}</div>
      </section>

      <div class="section-divider"></div>

      <!-- Showcase -->
      <section id="showcase" class="section">
        <div class="section-eyebrow">Built with Scratchy</div>
        <h2 class="section-title">Agents made these. In minutes.</h2>
        <p class="section-subtitle">Real projects built by skilled agents — not cherry-picked demos.</p>
        <div class="showcase-grid">
          <div class="showcase-card">
            <div class="showcase-gif" data-placeholder="chat-to-canvas">
              <div class="showcase-placeholder">💬 → 🖼️<br><span>Chat to Canvas</span></div>
            </div>
            <h4>Instant dashboards</h4>
            <p>Ask for stats, get interactive gauges, charts, and tables — not a wall of text.</p>
          </div>
          <div class="showcase-card">
            <div class="showcase-gif" data-placeholder="agent-skills">
              <div class="showcase-placeholder">🎯 → 📦<br><span>Skilled Agents</span></div>
            </div>
            <h4>Right agent, right skill</h4>
            <p>Each agent knows its domain. Atlas architects systems, Iris crafts interfaces, Nova verifies facts, Echo writes docs.</p>
          </div>
          <div class="showcase-card">
            <div class="showcase-gif" data-placeholder="widgets">
              <div class="showcase-placeholder">🧩 → ✨<br><span>Live Widgets</span></div>
            </div>
            <h4>Notes, calendar, email</h4>
            <p>Built-in widgets that sync with your services. Not just chat — an actual workspace.</p>
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Open Core -->
      <section id="open-core" class="section">
        <div class="section-eyebrow">Open Core</div>
        <h2 class="section-title">Free means self-hosted. Paid means we host it.</h2>
        <p class="section-subtitle">The full product is free and open source. Run it on your server with your own API keys. Paid plans = managed hosting.</p>
        <div class="opencore">
          <div class="opencore-card">
            <h3>${ICON.unlock} Self-Hosted (Free forever)</h3>
            <ul class="opencore-list">${freeListHtml}</ul>
          </div>
          <div class="opencore-card">
            <h3>${ICON.lock} Managed (Paid plans)</h3>
            <ul class="opencore-list">${paidListHtml}</ul>
          </div>
        </div>
        <div class="opencore-cta">
          <a href="https://github.com/yassinebkr/scratchy" target="_blank" rel="noopener">${ICON.github} View on GitHub — star if you like it</a>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Pricing -->
      <section id="pricing" class="section">
        <div class="section-eyebrow">Pricing</div>
        <h2 class="section-title">Pick your plan</h2>
        <p class="section-subtitle">Start with a free trial. Upgrade when you need more. Cancel anytime.</p>
        <div class="plans-row">${plansHtml}</div>
        
        <div class="byok-strip">
          <div class="byok-text">🔑 <strong>Bring Your Own Key</strong> — Use your API key on our managed infrastructure. All features included.</div>
          <div class="byok-right">
            <div class="byok-price">€15/mo</div>
            <button class="btn btn-secondary byok-cta" data-action="select-plan" data-plan="byok">Choose BYOK</button>
          </div>
        </div>
      </section>

      <!-- Final CTA -->
      <section class="section final-cta">
        <h2>Your agents. Your server. Your rules.</h2>
        <p>Deploy in under 2 minutes or try our managed plans. Open-core — no vendor lock-in, ever.</p>
        <button class="btn btn-primary" data-action="get-started">Get Started Free</button>
      </section>

      <!-- Footer -->
      <footer class="footer">
        <div>&copy; 2026 Scratchy. Built by <a href="https://github.com/yassinebkr" target="_blank" rel="noopener">Yassine</a>.</div>
        <div class="footer-links">
          <a href="https://github.com/yassinebkr/scratchy" target="_blank" rel="noopener">GitHub</a>
          <a href="https://scratchy-docs.clawos.fr" target="_blank" rel="noopener">Docs</a>
          <a href="https://discord.com/invite/clawd" target="_blank" rel="noopener">Discord</a>
        </div>
        <div class="footer-security">🛡️ Protected by <a href="https://github.com/yassinebkr/proteclaw" target="_blank" rel="noopener">ProteClaw</a></div>
      </footer>
      </div><!-- .landing-wrapper -->
    `;
  }

  _setupScrollNav() {
    const nav = this.shadowRoot.querySelector('.nav');
    const hero = this.shadowRoot.querySelector('.hero');
    if (!nav || !hero) return;

    const obs = new IntersectionObserver(([entry]) => {
      nav.classList.toggle('scrolled', !entry.isIntersecting);
    }, { threshold: 0.1 });
    obs.observe(hero);
  }

  _setupIntersectionObserver() {
    const sections = this.shadowRoot.querySelectorAll('.section');
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    sections.forEach(s => this._observer.observe(s));
  }
}

customElements.define('sc-landing', ScLanding);
