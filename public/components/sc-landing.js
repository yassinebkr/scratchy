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
    id: 'free', name: 'Free', price: 0, period: '', subtitle: 'No card, no catch',
    features: ['50 messages / day', '100K tokens / day', 'Sonnet model', '1 seat'],
    excluded: ['Opus model', 'Priority support'],
    cta: 'Get Started', highlight: false,
  },
  {
    id: 'pro', name: 'Pro', price: 15, period: '/mo', subtitle: 'For builders who ship',
    features: ['500 messages / day', '1M tokens / day', 'Sonnet + Opus', '1 seat', 'Priority support'],
    excluded: [],
    cta: 'Subscribe', highlight: true, badge: 'Most Popular',
  },
  {
    id: 'team', name: 'Team', price: 39, period: '/mo', subtitle: 'Your whole crew',
    features: ['2,000 messages / day', '5M tokens / day', 'Sonnet + Opus', '5 seats', 'Priority support'],
    excluded: [],
    cta: 'Subscribe', highlight: false,
  },
  {
    id: 'byok', name: 'BYOK', price: 5, period: '/mo', subtitle: 'Your key, your rules',
    features: ['Unlimited messages', 'Unlimited tokens', 'All models', '1 seat', 'Use your API key'],
    excluded: [],
    cta: 'Subscribe', highlight: false,
  },
];

const AGENTS = [
  {
    name: 'Atlas',
    role: 'Code',
    tagline: 'Thinks in systems, ships in PRs.',
    desc: 'Architecture first, then implementation. Proper error handling, tests, and docs — because "it works on my machine" isn\'t a deployment strategy.',
    color: '#DAA520',
    avatar: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(249,166,2,0.12)"/><path d="M14 12l6 4-6 4V12z" stroke="#DAA520" stroke-width="1.5" fill="none"/><path d="M20 12l6 4-6 4V12z" stroke="#DAA520" stroke-width="1.5" fill="none"/><rect x="12" y="24" width="16" height="4" rx="1" stroke="#DAA520" stroke-width="1.5" fill="none"/></svg>',
  },
  {
    name: 'Iris',
    role: 'Design',
    tagline: 'Pixels with purpose.',
    desc: 'Mobile-first, accessible, opinionated. Builds UI systems, not just screens. Will fight you on padding.',
    color: '#6366f1',
    avatar: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(99,102,241,0.12)"/><rect x="10" y="10" width="20" height="20" rx="4" stroke="#6366f1" stroke-width="1.5" fill="none"/><line x1="10" y1="16" x2="30" y2="16" stroke="#6366f1" stroke-width="1.5"/><line x1="18" y1="16" x2="18" y2="30" stroke="#6366f1" stroke-width="1.5"/></svg>',
  },
  {
    name: 'Nova',
    role: 'Research',
    tagline: 'Reads everything. Trusts nothing.',
    desc: 'Cross-references, synthesizes, cites sources. Flags uncertainty instead of hallucinating. Your bullshit detector with a library card.',
    color: '#10b981',
    avatar: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(16,185,129,0.12)"/><circle cx="20" cy="18" r="6" stroke="#10b981" stroke-width="1.5" fill="none"/><path d="M24 22l4 6" stroke="#10b981" stroke-width="1.5" stroke-linecap="round"/></svg>',
  },
  {
    name: 'Echo',
    role: 'Writer',
    tagline: 'Every sentence earns its place.',
    desc: 'Docs, copy, emails — zero filler, zero AI slop. Matches your voice, not some generic "professional tone."',
    color: '#f47252',
    avatar: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(244,114,82,0.12)"/><path d="M15 28V14l5 4 5-4v14" stroke="#f47252" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="15" y1="21" x2="25" y2="21" stroke="#f47252" stroke-width="1.5"/></svg>',
  },
];

const TECH_STACK = [
  { name: 'NullClaw', desc: 'Zig backend' },
  { name: 'SQLite', desc: 'Database' },
  { name: 'Web Components', desc: 'Frontend' },
  { name: 'Zig', desc: 'Core runtime' },
  { name: 'MCP', desc: 'Tool protocol' },
  { name: 'Docker', desc: 'Deploy' },
];

const METRICS = [
  { value: '34', label: 'Canvas components' },
  { value: '4', label: 'Specialist agents' },
  { value: '678KB', label: 'Backend binary' },
  { value: '<2s', label: 'Cold start' },
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
  --muted: #7a7a85;
  --accent: ${GOLD};
  --accent-hover: ${GOLDENROD};
  --accent-glow: rgba(249,166,2,0.20);
  --accent-subtle: rgba(249,166,2,0.06);
  --success: #34d399;
  --font: 'Geist', system-ui, -apple-system, sans-serif;
  --mono: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;

  display: block;
  width: 100%;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  scroll-behavior: smooth;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

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
}
.nav-brand img {
  width: 32px; height: 32px;
  border-radius: 4px;
  flex-shrink: 0;
  object-fit: cover;
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
  background: linear-gradient(135deg, var(--accent) 0%, ${AMBER} 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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

/* ─── Quick Start ─── */
.quickstart {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}
.quickstart-steps {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.qs-step {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.qs-num {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--accent);
  color: #0a0a0f;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.qs-text h3 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}
.qs-text p {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.5;
}
.quickstart-code {
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted);
}
.code-header-dots {
  display: flex;
  gap: 6px;
}
.code-header-dots span {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
}
.code-copy {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  padding: 4px 10px;
  font-size: 12px;
  font-family: var(--font);
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}
.code-copy:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.code-body {
  padding: 20px;
  font-family: var(--mono);
  font-size: 13px;
  line-height: 1.8;
  overflow-x: auto;
  white-space: pre;
}
.code-body .comment { color: #5a5a65; }
.code-body .cmd { color: var(--accent); }
.code-body .flag { color: ${GOLDENROD}; }
.code-body .url { color: var(--muted); }

/* ─── Difference Blocks ─── */
.diff-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
}
.diff-block {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 32px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 20px;
  align-items: start;
  transition: border-color 0.2s, transform 0.2s;
}
.diff-block:hover {
  border-color: rgba(249,166,2,0.18);
  transform: translateY(-2px);
}
.diff-icon {
  width: 48px; height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--accent-subtle);
  color: var(--accent);
  flex-shrink: 0;
}
.diff-content h3 {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 6px;
}
.diff-content p {
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

/* ─── Agents ─── */
.agents-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.agent-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 28px 20px;
  text-align: center;
  transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
}
.agent-card:hover {
  border-color: rgba(249,166,2,0.18);
  transform: translateY(-3px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.agent-avatar {
  width: 56px; height: 56px;
  margin: 0 auto 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  position: relative;
}
.agent-avatar svg { width: 56px; height: 56px; }
.agent-status {
  position: absolute;
  bottom: 2px; right: 2px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--success);
  border: 2px solid var(--bg);
  animation: dotPulse 2s ease-in-out infinite;
}
.agent-name {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 2px;
}
.agent-role {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.agent-tagline {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 10px;
  font-style: italic;
}
.agent-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.55;
}

/* ─── Metrics Row ─── */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 0;
}
.metric-card {
  text-align: center;
  padding: 24px 16px;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
}
.metric-value {
  font-size: 36px;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: -1.5px;
  line-height: 1.1;
  font-family: var(--mono);
}
.metric-label {
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
}

/* ─── Tech Stack ─── */
.tech-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 48px;
}
.tech-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  transition: border-color 0.2s, color 0.2s;
}
.tech-badge:hover {
  border-color: var(--border);
  color: var(--text);
}
.tech-badge-name {
  color: var(--text);
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
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  align-items: start;
}
.plan-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
  position: relative;
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
.plan-cta {
  width: 100%;
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

/* ─── Responsive ─── */
@media (max-width: 1024px) {
  .agents-grid { grid-template-columns: repeat(2, 1fr); }
  .plans-row { grid-template-columns: repeat(2, 1fr); }
  .metrics-row { grid-template-columns: repeat(2, 1fr); }
  .quickstart { gap: 32px; }
}
@media (max-width: 768px) {
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
  .nav-actions .btn-ghost { display: none; }

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

  .quickstart {
    grid-template-columns: 1fr;
    gap: 32px;
  }
  .diff-block {
    grid-template-columns: 1fr;
    text-align: center;
  }
  .diff-icon { margin: 0 auto; }
  .agents-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
  .metrics-row { grid-template-columns: 1fr 1fr; gap: 12px; }
  .plans-row { grid-template-columns: 1fr; max-width: 380px; margin: 0 auto; }
  .opencore { grid-template-columns: 1fr; }
  .footer { flex-direction: column; gap: 16px; text-align: center; }
  .section { padding: 56px 16px; }
  .section-title { font-size: clamp(22px, 5vw, 32px); }
}
@media (max-width: 480px) {
  .agents-grid { grid-template-columns: 1fr; max-width: 300px; margin: 0 auto; }
  .metrics-row { grid-template-columns: 1fr 1fr; }
  .hero-cta { flex-direction: column; align-items: center; }
  .hero-cta .btn { width: 100%; max-width: 300px; }
  .tech-row { gap: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  .hero-mesh::before, .hero-mesh::after { animation: none; }
  .hero-scroll { animation: none; }
  .section { opacity: 1; transform: none; transition: none; }
  .plan-badge { animation: none; }
  .hero-badge-dot { animation: none; }
  .agent-status { animation: none; }
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

  _emit(action, planId) {
    this.dispatchEvent(new CustomEvent('landing-action', {
      bubbles: true, composed: true,
      detail: { action, ...(planId ? { planId } : {}) },
    }));
  }

  _render() {
    /* ── Agents ── */
    const agentsHtml = AGENTS.map(a => `
      <div class="agent-card">
        <div class="agent-avatar">
          ${a.avatar}
          <div class="agent-status"></div>
        </div>
        <div class="agent-name">${a.name}</div>
        <div class="agent-role" style="color:${a.color}">${a.role}</div>
        <div class="agent-tagline">"${a.tagline}"</div>
        <div class="agent-desc">${a.desc}</div>
      </div>
    `).join('');

    /* ── Metrics ── */
    const metricsHtml = METRICS.map(m => `
      <div class="metric-card">
        <div class="metric-value">${m.value}</div>
        <div class="metric-label">${m.label}</div>
      </div>
    `).join('');

    /* ── Tech Stack ── */
    const techHtml = TECH_STACK.map(t => `
      <div class="tech-badge">
        <span class="tech-badge-name">${t.name}</span>
        <span>${t.desc}</span>
      </div>
    `).join('');

    /* ── Plans ── */
    const plansHtml = PLANS.map(p => {
      const included = p.features.map(f => `<li><span class="check">${ICON.check}</span> ${f}</li>`).join('');
      const excluded = p.excluded.map(f => `<li class="excluded"><span class="cross">&#x2715;</span> ${f}</li>`).join('');
      return `
        <div class="plan-card ${p.highlight ? 'highlight' : ''}" data-plan="${p.id}">
          ${p.badge ? `<div class="plan-badge">${p.badge}</div>` : ''}
          <div class="plan-name">${p.name}</div>
          <div class="plan-price">&euro;${p.price}<span>${p.period}</span></div>
          <div class="plan-subtitle">${p.subtitle}</div>
          <ul class="plan-features">${included}${excluded}</ul>
          <button class="btn ${p.highlight ? 'btn-primary' : 'btn-secondary'} plan-cta" data-plan="${p.id}">${p.cta}</button>
        </div>
      `;
    }).join('');

    /* ── Open Core Lists ── */
    const freeItems = [
      'Full AI workspace',
      'All 4 specialist agents',
      '34 canvas components',
      'Self-host on your server',
      'SQLite — no external DB needed',
      'MCP tool integrations',
      'Agent memory & context',
      'Multi-user with quotas',
    ];
    const paidItems = [
      'Managed cloud hosting',
      'Priority support',
      'Opus model access',
      'Higher rate limits',
      'Team collaboration (5+ seats)',
      'Usage analytics dashboard',
    ];

    const freeListHtml = freeItems.map(i => `<li>${ICON.check} ${i}</li>`).join('');
    const paidListHtml = paidItems.map(i => `<li>${ICON.check} ${i}</li>`).join('');

    /* ── Assemble ── */
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>

      <!-- Nav -->
      <nav class="nav" role="navigation" aria-label="Main navigation">
        <div class="nav-brand">
          <img src="/assets/scratchy-logo.jpg" alt="Scratchy" width="32" height="32">
          Scratchy
        </div>
        <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <ul class="nav-links">
          <li><a href="#quickstart">Quick Start</a></li>
          <li><a href="#team">Agents</a></li>
          <li><a href="#open-core">Open Source</a></li>
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
          <div class="hero-badge">
            <span class="hero-badge-dot"></span>
            v2 — now with agent teams
          </div>
          <h1>AI that <span class="gold">renders dashboards</span>,<br>not paragraphs</h1>
          <p class="hero-sub">Your agents don't just chat — they build UI, collaborate in teams, and run on your server. Not another chatbot wrapper.</p>
          <div class="hero-cta">
            <button class="btn btn-primary" data-action="get-started">Deploy Free</button>
            <button class="btn btn-ghost" data-scroll="quickstart">${ICON.terminal} See the setup</button>
          </div>
        </div>
        <div class="hero-scroll" data-scroll="quickstart">
          ${ICON.chevronDown}
        </div>
      </section>

      <!-- Quick Start -->
      <section id="quickstart" class="section">
        <div class="section-eyebrow">Quick Start</div>
        <h2 class="section-title">Running in 90 seconds</h2>
        <p class="section-subtitle">Seriously. One terminal, three commands, your own AI workspace.</p>
        <div class="quickstart">
          <div class="quickstart-steps">
            <div class="qs-step">
              <div class="qs-num">1</div>
              <div class="qs-text">
                <h3>Deploy</h3>
                <p>One command. Runs on any VPS, home server, or laptop. 678KB binary + SQLite. That's the whole stack.</p>
              </div>
            </div>
            <div class="qs-step">
              <div class="qs-num">2</div>
              <div class="qs-text">
                <h3>Connect</h3>
                <p>Add your API key — Anthropic, OpenAI, or Google. Bring your own key or use our managed plans.</p>
              </div>
            </div>
            <div class="qs-step">
              <div class="qs-num">3</div>
              <div class="qs-text">
                <h3>Build</h3>
                <p>Four specialist agents are ready. Ask them to build dashboards, write code, research anything, draft docs.</p>
              </div>
            </div>
          </div>
          <div class="quickstart-code">
            <div class="code-header">
              <div class="code-header-dots"><span></span><span></span><span></span></div>
              <button class="code-copy" data-copy="docker compose up -d">${ICON.copy} Copy</button>
            </div>
            <div class="code-body"><span class="comment"># Clone and launch</span>
<span class="cmd">git clone</span> <span class="url">https://github.com/nicosql/scratchy.git</span>
<span class="cmd">cd</span> scratchy

<span class="comment"># That's it. Really.</span>
<span class="cmd">docker compose up</span> <span class="flag">-d</span>

<span class="comment"># Open http://localhost:3000</span>
<span class="comment"># Add your API key → start building</span></div>
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- What Makes It Different -->
      <section id="difference" class="section">
        <div class="section-eyebrow">Why Scratchy</div>
        <h2 class="section-title">Not another AI chat wrapper</h2>
        <p class="section-subtitle">Three things that actually matter.</p>
        <div class="diff-grid">

          <div class="diff-block">
            <div class="diff-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.37 2.63a2.12 2.12 0 0 1 3 3L14 13l-4 1 1-4Z"/><path d="M20 7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2V7"/><path d="M2 12h4"/></svg>
            </div>
            <div class="diff-content">
              <h3>Generative UI — agents render things</h3>
              <p>Ask for a dashboard and you get a dashboard. Charts, forms, stats, data tables — 34 interactive components that agents compose in real-time. Not markdown. Actual UI.</p>
              <div class="diff-example">"Show me server stats" → live stats card, not a text table</div>
            </div>
          </div>

          <div class="diff-block">
            <div class="diff-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/></svg>
            </div>
            <div class="diff-content">
              <h3>Agent teams — not one model doing everything</h3>
              <p>An orchestrator splits complex work across specialists. Atlas writes the code, Iris designs the UI, Nova researches, Echo writes the docs. They work in parallel and merge results.</p>
              <div class="diff-example">"Build me a landing page" → 4 agents collaborate, one result</div>
            </div>
          </div>

          <div class="diff-block">
            <div class="diff-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>
            </div>
            <div class="diff-content">
              <h3>Self-hosted — your data stays yours</h3>
              <p>Runs on your infrastructure. SQLite database, no external services needed. Your conversations, your API keys, your server. We never see your data.</p>
              <div class="diff-example">678KB binary + SQLite = the whole backend</div>
            </div>
          </div>

        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Meet The Team -->
      <section id="team" class="section">
        <div class="section-eyebrow">The Crew</div>
        <h2 class="section-title">Four agents. Actual personalities.</h2>
        <p class="section-subtitle">Not generic assistants — specialists with opinions, expertise, and memory.</p>
        <div class="agents-grid">${agentsHtml}</div>
      </section>

      <div class="section-divider"></div>

      <!-- By the Numbers + Tech Stack -->
      <section id="numbers" class="section">
        <div class="section-eyebrow">By the Numbers</div>
        <h2 class="section-title">What's actually inside</h2>
        <p class="section-subtitle">Real numbers, shipping today. No roadmap promises.</p>
        <div class="metrics-row">${metricsHtml}</div>
        <div class="tech-row">${techHtml}</div>
      </section>

      <div class="section-divider"></div>

      <!-- Open Core -->
      <section id="open-core" class="section">
        <div class="section-eyebrow">Open Core</div>
        <h2 class="section-title">Free means free. Paid means more.</h2>
        <p class="section-subtitle">No gotchas. The free tier is the full product — we charge for scale and convenience.</p>
        <div class="opencore">
          <div class="opencore-card">
            <h3>${ICON.unlock} Free &amp; Open</h3>
            <ul class="opencore-list">${freeListHtml}</ul>
          </div>
          <div class="opencore-card">
            <h3>${ICON.lock} Paid Plans</h3>
            <ul class="opencore-list">${paidListHtml}</ul>
          </div>
        </div>
        <div class="opencore-cta">
          <a href="https://github.com/nicosql/scratchy" target="_blank" rel="noopener">${ICON.github} View on GitHub — star if you like it</a>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Pricing -->
      <section id="pricing" class="section">
        <div class="section-eyebrow">Pricing</div>
        <h2 class="section-title">Pick your speed</h2>
        <p class="section-subtitle">Start free. Upgrade when the free tier feels slow. Downgrade whenever.</p>
        <div class="plans-row">${plansHtml}</div>
      </section>

      <!-- Final CTA -->
      <section class="section final-cta">
        <h2>Your AI workspace.<br>Your server. Your rules.</h2>
        <p>Deploy in under 2 minutes. Free forever — no card, no trial, no "upgrade to continue" walls.</p>
        <button class="btn btn-primary" data-action="get-started">Get Started Free</button>
      </section>

      <!-- Footer -->
      <footer class="footer">
        <div>&copy; 2026 Scratchy. Built with stubbornness and Zig.</div>
        <div class="footer-links">
          <a href="https://github.com/nicosql/scratchy" target="_blank" rel="noopener">GitHub</a>
          <a href="https://docs.openclaw.ai" target="_blank" rel="noopener">Docs</a>
          <a href="https://discord.com/invite/clawd" target="_blank" rel="noopener">Discord</a>
        </div>
      </footer>
    `;
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

    /* CTA buttons */
    root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._emit(btn.dataset.action));
    });

    /* Plan CTAs */
    root.querySelectorAll('.plan-cta').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._emit('select-plan', btn.dataset.plan);
      });
    });

    /* Smooth scroll */
    root.querySelectorAll('[data-scroll]').forEach(el => {
      el.addEventListener('click', () => {
        const target = root.getElementById(el.dataset.scroll);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    /* Nav anchor links */
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
