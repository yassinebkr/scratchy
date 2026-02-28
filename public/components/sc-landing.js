/**
 * Scratchy v2 — Landing Page Web Component
 * <sc-landing> — Marketing landing page with hero, features, AI team,
 * social proof, integrations, shared intelligence, plans, changelog, and CTA.
 *
 * Events: landing-action { action: 'get-started' | 'sign-in' | 'select-plan', planId? }
 */

const GOLD = '#F9A602';
const GOLDENROD = '#DAA520';
const AMBER = '#FFBF00';

/* ── Data ── */

const PLANS = [
  { id: 'free', name: 'Free', price: 0, period: '', subtitle: 'Forever free', features: ['50 messages / day', '100K tokens / day', 'Sonnet model', '1 seat'], excluded: ['Opus model', 'Priority support'], cta: 'Get Started', highlight: false },
  { id: 'pro', name: 'Pro', price: 15, period: '/mo', subtitle: 'Most popular', features: ['500 messages / day', '1M tokens / day', 'Sonnet + Opus', '1 seat', 'Priority support'], excluded: [], cta: 'Subscribe', highlight: true, badge: 'Recommended' },
  { id: 'team', name: 'Team', price: 39, period: '/mo', subtitle: 'For teams', features: ['2,000 messages / day', '5M tokens / day', 'Sonnet + Opus', '5 seats', 'Priority support'], excluded: [], cta: 'Subscribe', highlight: false },
  { id: 'byok', name: 'BYOK', price: 5, period: '/mo', subtitle: 'Bring Your Own Key', features: ['Unlimited messages', 'Unlimited tokens', 'All models', '1 seat', 'Use your API key'], excluded: [], cta: 'Subscribe', highlight: false },
];

const FEATURES = [
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="4"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/></svg>', title: 'Multi-Agent', desc: 'Switch between specialist AI agents with different capabilities and knowledge.' },
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.37 2.63a2.12 2.12 0 0 1 3 3L14 13l-4 1 1-4Z"/><path d="M20 7v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7"/><path d="M2 12h4"/></svg>', title: 'Generative UI', desc: '39+ interactive components — charts, forms, dashboards — rendered inline.' },
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-12 0V8Z"/><path d="M6 11h12"/></svg>', title: 'MCP Tools', desc: 'Connect external tools and data sources via the Model Context Protocol.' },
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>', title: 'Self-hosted', desc: 'Your data stays on your server. Full control, zero third-party dependencies.' },
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>', title: 'Real-time', desc: 'Streaming responses, live tool events, and cross-device sync.' },
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>', title: 'Multi-user', desc: 'Shared workspaces with per-user isolation, quotas, and roles.' },
];

const AGENTS = [
  {
    name: 'Aria',
    role: 'Research Assistant',
    desc: 'Deep web research, summarisation, and fact-checking across hundreds of sources in seconds.',
    status: 'online',
    avatar: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(249,166,2,0.12)"/><circle cx="20" cy="15" r="7" stroke="#F9A602" stroke-width="1.5" fill="none"/><path d="M8 34c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="#F9A602" stroke-width="1.5" fill="none"/></svg>',
  },
  {
    name: 'Atlas',
    role: 'Code Engineer',
    desc: 'Writes, reviews, and refactors production code with full context of your codebase.',
    status: 'online',
    avatar: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(249,166,2,0.12)"/><path d="M14 12l6 4-6 4V12z" stroke="#DAA520" stroke-width="1.5" fill="none"/><path d="M20 12l6 4-6 4V12z" stroke="#DAA520" stroke-width="1.5" fill="none"/><rect x="12" y="24" width="16" height="4" rx="1" stroke="#DAA520" stroke-width="1.5" fill="none"/></svg>',
  },
  {
    name: 'Nova',
    role: 'Creative Writer',
    desc: 'Blog posts, marketing copy, emails — polished first drafts in your brand voice.',
    status: 'online',
    avatar: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(249,166,2,0.12)"/><path d="M15 28V14l5 4 5-4v14" stroke="#FFBF00" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="15" y1="21" x2="25" y2="21" stroke="#FFBF00" stroke-width="1.5"/></svg>',
  },
  {
    name: 'Bolt',
    role: 'Data Analyst',
    desc: 'Turns raw data into charts, dashboards, and insights you can act on immediately.',
    status: 'online',
    avatar: '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="20" fill="rgba(249,166,2,0.12)"/><rect x="12" y="22" width="4" height="6" rx="1" stroke="#F9A602" stroke-width="1.5" fill="none"/><rect x="18" y="16" width="4" height="12" rx="1" stroke="#F9A602" stroke-width="1.5" fill="none"/><rect x="24" y="12" width="4" height="16" rx="1" stroke="#F9A602" stroke-width="1.5" fill="none"/></svg>',
  },
];

const STEPS = [
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>', title: 'Deploy', desc: 'One command to self-host on any VPS' },
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>', title: 'Connect', desc: 'Link your AI provider — Anthropic, OpenAI, or Google' },
  { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>', title: 'Build', desc: 'Start building with your AI workspace' },
];

const INTEGRATION_STEPS = [
  {
    num: '1',
    title: 'Connect',
    desc: 'Link your favourite tools through MCP — databases, APIs, file systems, and more.',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  },
  {
    num: '2',
    title: 'Configure',
    desc: 'Define which agents can access which tools. Fine-grained permissions keep you in control.',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  },
  {
    num: '3',
    title: 'Automate',
    desc: 'Your agents work across tools seamlessly — research, write, deploy, all in one conversation.',
    icon: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  },
];

const METRICS = [
  { value: '10x', label: 'Faster research' },
  { value: '500+', label: 'Tasks automated daily' },
  { value: '87%', label: 'Time saved on first drafts' },
  { value: '4.9/5', label: 'User satisfaction' },
];

const TESTIMONIALS = [
  { quote: 'Scratchy replaced three separate tools for our team. Research, writing, and data analysis — all in one place.', author: 'Sarah K.', role: 'Head of Product, Fintech Startup' },
  { quote: 'The agent switching is seamless. I go from coding with Atlas to writing docs with Nova in the same conversation.', author: 'Marcus R.', role: 'Senior Engineer, Dev Agency' },
  { quote: 'Self-hosted AI chat that actually works. We had it running in production within 20 minutes of deploy.', author: 'Lin W.', role: 'CTO, Data Consultancy' },
];

const CHANGELOG = [
  { version: 'v2.4', date: 'Feb 2026', title: 'Context Engine v2', desc: 'Agents now share long-term memory across conversations.' },
  { version: 'v2.3', date: 'Jan 2026', title: 'MCP Tool Marketplace', desc: '20+ pre-built integrations with one-click install.' },
  { version: 'v2.2', date: 'Dec 2025', title: 'Generative UI Overhaul', desc: '39+ inline components — charts, tables, forms, and more.' },
  { version: 'v2.1', date: 'Nov 2025', title: 'Team Workspaces', desc: 'Multi-user support with per-seat quotas and role-based access.' },
];

/* ── Styles ── */

const STYLES = /* css */ `
:host {
  --bg: #0d0b07;
  --bg-alt: #111009;
  --surface: rgba(26,22,16,0.85);
  --surface-solid: #1a1610;
  --surface-hover: #242016;
  --border: rgba(249,166,2,0.10);
  --border-glass: rgba(249,166,2,0.06);
  --text: #f0ead6;
  --muted: #8a7e6a;
  --accent: ${GOLD};
  --accent-hover: ${GOLDENROD};
  --accent-glow: rgba(249,166,2,0.20);
  --accent-subtle: rgba(249,166,2,0.05);
  --accent-subtle-2: rgba(249,166,2,0.08);
  --success: #34d399;
  --font: 'Geist', system-ui, -apple-system, sans-serif;

  display: block;
  width: 100%;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 14px;
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
  background: rgba(13,11,7,0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
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
.nav-brand svg { flex-shrink: 0; }
.nav-brand img { width: 32px; height: 32px; border-radius: 4px; flex-shrink: 0; object-fit: cover; }
.hero-logo { width: 120px; height: 120px; border-radius: 50%; margin-bottom: 24px; box-shadow: 0 0 24px rgba(249,166,2,0.25), 0 0 60px rgba(249,166,2,0.1); object-fit: cover; background: var(--bg); border: 2px solid rgba(249,166,2,0.15); }
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
  color: #0d0b07;
}
.btn-primary:hover {
  background: var(--accent-hover);
  box-shadow: 0 0 20px var(--accent-glow);
}
.btn-secondary {
  background: var(--accent-subtle-2);
  color: var(--accent);
  border: 1px solid var(--border);
}
.btn-secondary:hover {
  background: rgba(249,166,2,0.14);
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
  opacity: 0.15;
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
  background: var(--accent-subtle-2);
  border: 1px solid var(--border);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 24px;
  letter-spacing: 0.2px;
}
.hero-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  animation: dotPulse 2s ease-in-out infinite;
}
@keyframes dotPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.hero h1 {
  font-size: clamp(44px, 7vw, 72px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.05;
  background: linear-gradient(135deg, var(--text) 20%, var(--accent) 80%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: transparent;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  padding-bottom: 4px;
}
.hero-sub {
  margin-top: 20px;
  font-size: clamp(17px, 2.2vw, 20px);
  color: var(--muted);
  max-width: 560px;
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
.hero-trust {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin-top: 40px;
  font-size: 13px;
  color: var(--muted);
}
.hero-trust-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.hero-trust-item svg { color: var(--accent); opacity: 0.7; flex-shrink: 0; }
.hero-scroll {
  margin-top: 48px;
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  animation: bounce 2s ease infinite;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.hero-scroll:hover { color: var(--accent); }
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(6px); }
}

/* ─── Section ─── */
.section {
  padding: 100px clamp(16px, 4vw, 48px);
  max-width: 1200px;
  margin: 0 auto;
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.section.visible {
  opacity: 1;
  transform: translateY(0);
}
.section--wide {
  max-width: 1200px;
}
.section--alt {
  position: relative;
}
.section--alt::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--bg-alt);
  margin-left: -50vw;
  margin-right: -50vw;
  left: 50%;
  right: auto;
  width: 100vw;
  z-index: -1;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.section-eyebrow {
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
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

/* ─── Features ─── */
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.feature-card {
  background: var(--surface);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  padding: 28px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}
.feature-card:hover {
  border-color: rgba(249,166,2,0.20);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.feature-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--accent-subtle-2);
  color: var(--accent);
  margin-bottom: 16px;
}
.feature-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
}
.feature-desc {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.5;
}

/* ─── AI Team / Agent Personas ─── */
.agents-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
.agent-card {
  background: var(--surface);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
}
.agent-card:hover {
  border-color: rgba(249,166,2,0.18);
  transform: translateY(-3px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.agent-avatar {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  position: relative;
}
.agent-avatar svg { width: 56px; height: 56px; }
.agent-status {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--success);
  border: 2px solid var(--bg);
  animation: dotPulse 2s ease-in-out infinite;
}
.agent-name {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 2px;
}
.agent-role {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--accent);
  margin-bottom: 12px;
}
.agent-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}

/* ─── Social Proof / Metrics ─── */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 64px;
}
.metric-card {
  text-align: center;
  padding: 28px 16px;
  background: var(--surface);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  backdrop-filter: blur(8px);
}
.metric-value {
  font-size: 40px;
  font-weight: 800;
  color: var(--accent);
  letter-spacing: -1.5px;
  line-height: 1.1;
}
.metric-label {
  font-size: 14px;
  color: var(--muted);
  margin-top: 6px;
}
.testimonials-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}
.testimonial-card {
  background: var(--surface);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  padding: 28px;
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  transition: border-color 0.2s;
}
.testimonial-card:hover {
  border-color: rgba(249,166,2,0.15);
}
.testimonial-quote-icon {
  color: var(--accent);
  opacity: 0.4;
  margin-bottom: 12px;
  line-height: 1;
}
.testimonial-text {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text);
  flex: 1;
  margin-bottom: 20px;
}
.testimonial-author {
  display: flex;
  align-items: center;
  gap: 12px;
}
.testimonial-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--accent-subtle-2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  flex-shrink: 0;
}
.testimonial-meta {
  font-size: 13px;
}
.testimonial-name {
  font-weight: 600;
  color: var(--text);
}
.testimonial-role {
  color: var(--muted);
  font-size: 12px;
}

/* ─── Integration Story ─── */
.integration-steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 48px;
}
.integration-step {
  background: var(--surface);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  padding: 32px 28px;
  text-align: center;
  backdrop-filter: blur(8px);
  position: relative;
  transition: border-color 0.2s, transform 0.2s;
}
.integration-step:hover {
  border-color: rgba(249,166,2,0.18);
  transform: translateY(-2px);
}
.integration-step-num {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  color: #0d0b07;
  font-size: 13px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.integration-step-icon {
  color: var(--accent);
  margin-bottom: 16px;
  display: flex;
  justify-content: center;
}
.integration-step-title {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
}
.integration-step-desc {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.55;
}
.integration-logos {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  flex-wrap: wrap;
}
.integration-logo {
  width: 80px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-glass);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.3px;
  transition: border-color 0.2s, color 0.2s;
}
.integration-logo:hover {
  border-color: rgba(249,166,2,0.2);
  color: var(--text);
}

/* ─── Shared Intelligence ─── */
.shared-intel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}
.shared-intel-content { }
.shared-intel-content h3 {
  font-size: clamp(24px, 3vw, 32px);
  font-weight: 700;
  letter-spacing: -0.5px;
  margin-bottom: 16px;
  line-height: 1.2;
}
.shared-intel-content p {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.7;
  margin-bottom: 24px;
}
.shared-intel-features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.shared-intel-features li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px;
  color: var(--text);
  line-height: 1.5;
}
.shared-intel-features li svg {
  color: var(--accent);
  flex-shrink: 0;
  margin-top: 2px;
}
.shared-intel-visual {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brain-diagram {
  width: 100%;
  max-width: 380px;
  aspect-ratio: 1;
  position: relative;
}
.brain-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(249,166,2,0.15) 0%, rgba(249,166,2,0.02) 70%);
  border: 1px solid rgba(249,166,2,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
}
.brain-center svg { color: var(--accent); }
.brain-center-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--accent);
}
.brain-node {
  position: absolute;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  gap: 2px;
}
.brain-node svg { color: var(--accent); width: 18px; height: 18px; }
.brain-node:nth-child(2) { top: 5%; left: 50%; transform: translateX(-50%); }
.brain-node:nth-child(3) { top: 50%; right: 5%; transform: translateY(-50%); }
.brain-node:nth-child(4) { bottom: 5%; left: 50%; transform: translateX(-50%); }
.brain-node:nth-child(5) { top: 50%; left: 5%; transform: translateY(-50%); }
.brain-line {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 1px;
  background: linear-gradient(90deg, rgba(249,166,2,0.2), rgba(249,166,2,0.05));
  transform-origin: left center;
}
.brain-line:nth-child(6) { transform: rotate(0deg); }
.brain-line:nth-child(7) { transform: rotate(90deg); }
.brain-line:nth-child(8) { transform: rotate(180deg); }
.brain-line:nth-child(9) { transform: rotate(270deg); }

/* ─── How It Works ─── */
.steps-row {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  position: relative;
}
.step {
  flex: 1;
  max-width: 280px;
  text-align: center;
  position: relative;
  padding: 0 20px;
}
.step-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 50%;
  margin: 0 auto 16px;
  position: relative;
  z-index: 1;
  color: var(--accent);
}
.step-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
}
.step-desc {
  font-size: 14px;
  color: var(--muted);
}
.steps-line {
  position: absolute;
  top: 32px;
  left: calc(16.67% + 32px);
  right: calc(16.67% + 32px);
  height: 2px;
  background: linear-gradient(90deg, ${GOLD}, ${AMBER}, ${GOLD});
  opacity: 0.3;
  z-index: 0;
}

/* ─── Plans ─── */
.plans-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  align-items: start;
}
.plan-card {
  background: var(--surface);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
  backdrop-filter: blur(8px);
  transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
  position: relative;
  cursor: default;
}
.plan-card:hover {
  transform: translateY(-4px);
  border-color: rgba(249,166,2,0.15);
}
.plan-card.highlight {
  border-color: var(--accent);
  transform: scale(1.02);
  box-shadow: 0 0 30px var(--accent-glow), 0 8px 32px rgba(0,0,0,0.3);
}
.plan-card.highlight:hover {
  transform: scale(1.02) translateY(-4px);
}
.plan-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--accent);
  color: #0d0b07;
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
}
.plan-price span {
  font-size: 15px;
  font-weight: 400;
  color: var(--muted);
}
.plan-subtitle {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 16px;
}
.plan-features {
  list-style: none;
  text-align: left;
  margin-bottom: 20px;
}
.plan-features li {
  font-size: 13px;
  padding: 5px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.plan-features li .check { color: var(--success); }
.plan-features li .cross { color: #555; }
.plan-features li.excluded {
  color: var(--muted);
  opacity: 0.5;
}

/* ─── Code Showcase ─── */
.code-block {
  background: rgba(26,22,16,0.9);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px 28px;
  max-width: 600px;
  margin: 0 auto;
  font-family: 'Geist Mono', 'SF Mono', monospace;
  font-size: 13px;
  line-height: 1.7;
  overflow-x: auto;
  position: relative;
}
.code-label {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font);
}
.code-key { color: ${GOLDENROD}; }
.code-val { color: var(--text); }
.code-type { color: ${AMBER}; }
.code-comment { color: #5a5040; }

/* ─── Changelog ─── */
.changelog-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  max-width: 800px;
  margin: 0 auto;
}
.changelog-item {
  background: var(--surface);
  border: 1px solid var(--border-glass);
  border-radius: 12px;
  padding: 24px;
  backdrop-filter: blur(8px);
  transition: border-color 0.2s;
}
.changelog-item:hover {
  border-color: rgba(249,166,2,0.15);
}
.changelog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.changelog-version {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-subtle-2);
  color: var(--accent);
  letter-spacing: 0.3px;
}
.changelog-date {
  font-size: 12px;
  color: var(--muted);
}
.changelog-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.changelog-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
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
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 500px;
  height: 500px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(249,166,2,0.08) 0%, transparent 70%);
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
  max-width: 1200px;
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

/* ─── Divider ─── */
.section-divider {
  max-width: 1200px;
  margin: 0 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border), transparent);
}

/* ─── Responsive ─── */
@media (max-width: 1024px) {
  .features-grid { grid-template-columns: repeat(2, 1fr); }
  .plans-row { grid-template-columns: repeat(2, 1fr); }
  .agents-grid { grid-template-columns: repeat(2, 1fr); }
  .metrics-row { grid-template-columns: repeat(2, 1fr); }
  .shared-intel { gap: 32px; }
}
@media (max-width: 768px) {
  /* ── Mobile Nav: animated slide-down ── */
  .nav-toggle { display: flex; }
  .nav-links {
    display: flex;
    position: absolute;
    top: 56px;
    left: 0;
    right: 0;
    flex-direction: column;
    background: rgba(13,11,7,0.97);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    padding: 0 clamp(16px, 4vw, 48px);
    gap: 4px;
    border-bottom: 1px solid transparent;
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                padding 0.4s cubic-bezier(0.4, 0, 0.2, 1),
                border-color 0.3s ease;
  }
  .nav-links.open {
    max-height: 320px;
    padding: 12px clamp(16px, 4vw, 48px) 16px;
    border-bottom-color: var(--border);
  }

  /* ── Mobile Nav: stagger fade-in for items ── */
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

  /* ── Mobile Nav: styled links ── */
  .nav-links a {
    display: block;
    padding: 12px 16px;
    background: rgba(249,166,2,0.04);
    border-radius: 8px;
    color: var(--muted);
    font-size: 15px;
    font-weight: 500;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    border: 1px solid transparent;
  }
  .nav-links a:hover,
  .nav-links a:active {
    background: rgba(249,166,2,0.10);
    color: var(--accent);
    border-color: rgba(249,166,2,0.15);
  }

  .nav-actions .btn-ghost { display: none; }

  /* ── Hero: tighter spacing on mobile ── */
  .hero {
    min-height: auto;
    padding: 80px 20px 40px;
  }
  .hero-logo {
    width: 88px;
    height: 88px;
    margin-bottom: 16px;
  }
  .hero-badge { margin-bottom: 16px; }
  .hero h1 {
    font-size: 36px;
    letter-spacing: -1px;
    line-height: 1.1;
  }
  .hero-sub {
    margin-top: 12px;
    font-size: 16px;
  }
  .hero-cta { margin-top: 24px; }
  .hero-trust { flex-direction: column; gap: 8px; margin-top: 24px; }
  .hero-scroll { margin-top: 24px; }

  /* ── Layout: existing mobile grid fixes ── */
  .features-grid { grid-template-columns: 1fr; }
  .plans-row { grid-template-columns: 1fr; max-width: 380px; margin: 0 auto; }
  .agents-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
  .metrics-row { grid-template-columns: 1fr 1fr; gap: 12px; }
  .testimonials-grid { grid-template-columns: 1fr; }
  .integration-steps { grid-template-columns: 1fr; max-width: 380px; margin: 0 auto 48px; }
  .shared-intel { grid-template-columns: 1fr; text-align: center; }
  .shared-intel-features { align-items: center; }
  .shared-intel-visual { order: -1; }
  .brain-diagram { max-width: 280px; }
  .changelog-list { grid-template-columns: 1fr; }
  .steps-row { flex-direction: column; align-items: center; gap: 32px; }
  .steps-line { display: none; }
  .footer { flex-direction: column; gap: 16px; text-align: center; }
  .section { padding: 64px clamp(16px, 4vw, 48px); }
}
@media (max-width: 480px) {
  .agents-grid { grid-template-columns: 1fr; max-width: 300px; margin: 0 auto; }
  .metrics-row { grid-template-columns: 1fr; max-width: 300px; margin: 0 auto 48px; }
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
}
`;

/* ── SVG Icon Helpers ── */

const ICON = {
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>',
  zap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  brain: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v1a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 3 3h1a4 4 0 0 0 6 0h1a3 3 0 0 0 3-3v-1a3 3 0 0 0 0-6v-1a3 3 0 0 0-3-3V6a4 4 0 0 0-4-4z"/></svg>',
  database: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/></svg>',
  share: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  layers: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
  chevronDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  quote: '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z"/></svg>',
};

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
    /* ── Features ── */
    const featuresHtml = FEATURES.map(f => `
      <div class="feature-card">
        <div class="feature-icon">${f.icon}</div>
        <div class="feature-title">${f.title}</div>
        <div class="feature-desc">${f.desc}</div>
      </div>
    `).join('');

    /* ── AI Team ── */
    const agentsHtml = AGENTS.map(a => `
      <div class="agent-card">
        <div class="agent-avatar">
          ${a.avatar}
          <div class="agent-status" aria-label="${a.status}"></div>
        </div>
        <div class="agent-name">${a.name}</div>
        <div class="agent-role">${a.role}</div>
        <div class="agent-desc">${a.desc}</div>
      </div>
    `).join('');

    /* ── Social Proof ── */
    const metricsHtml = METRICS.map(m => `
      <div class="metric-card">
        <div class="metric-value">${m.value}</div>
        <div class="metric-label">${m.label}</div>
      </div>
    `).join('');

    const testimonialsHtml = TESTIMONIALS.map(t => `
      <div class="testimonial-card">
        <div class="testimonial-quote-icon">${ICON.quote}</div>
        <div class="testimonial-text">${t.quote}</div>
        <div class="testimonial-author">
          <div class="testimonial-avatar">${t.author.charAt(0)}</div>
          <div class="testimonial-meta">
            <div class="testimonial-name">${t.author}</div>
            <div class="testimonial-role">${t.role}</div>
          </div>
        </div>
      </div>
    `).join('');

    /* ── Integration Steps ── */
    const integrationStepsHtml = INTEGRATION_STEPS.map(s => `
      <div class="integration-step">
        <div class="integration-step-num">${s.num}</div>
        <div class="integration-step-icon">${s.icon}</div>
        <div class="integration-step-title">${s.title}</div>
        <div class="integration-step-desc">${s.desc}</div>
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
          <button class="btn btn-primary plan-cta" data-plan="${p.id}">${p.cta}</button>
        </div>
      `;
    }).join('');

    /* ── How It Works ── */
    const stepsHtml = STEPS.map(s => `
      <div class="step">
        <div class="step-icon">${s.icon}</div>
        <div class="step-title">${s.title}</div>
        <div class="step-desc">${s.desc}</div>
      </div>
    `).join('');

    /* ── Changelog ── */
    const changelogHtml = CHANGELOG.map(c => `
      <div class="changelog-item">
        <div class="changelog-header">
          <span class="changelog-version">${c.version}</span>
          <span class="changelog-date">${c.date}</span>
        </div>
        <div class="changelog-title">${c.title}</div>
        <div class="changelog-desc">${c.desc}</div>
      </div>
    `).join('');

    /* ── Assemble ── */
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>

      <!-- Nav -->
      <nav class="nav" role="navigation" aria-label="Main navigation">
        <div class="nav-brand">
          <img src="/assets/scratchy-logo.jpg" alt="Scratchy" width="32" height="32" style="border-radius:4px">
          Scratchy
        </div>
        <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <ul class="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#team">AI Team</a></li>
          <li><a href="#integrations">Integrations</a></li>
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
          <img src="/assets/scratchy-logo.jpg" alt="Scratchy" class="hero-logo">
          <div class="hero-badge">
            <span class="hero-badge-dot"></span>
            Now in public beta
          </div>
          <h1>Your AI team,<br>ready to work</h1>
          <p class="hero-sub">Specialist AI agents that research, write, code, and analyse — all in one self-hosted workspace. Set up in minutes, not weeks.</p>
          <div class="hero-cta">
            <button class="btn btn-primary" data-action="get-started">Start Free — No Card Required</button>
            <button class="btn btn-ghost" data-scroll="features">See how it works</button>
          </div>
          <div class="hero-trust">
            <span class="hero-trust-item">${ICON.shield} Self-hosted &amp; private</span>
            <span class="hero-trust-item">${ICON.zap} 5-minute deploy</span>
            <span class="hero-trust-item">${ICON.clock} Free forever tier</span>
          </div>
        </div>
        <div class="hero-scroll" data-scroll="features">
          ${ICON.chevronDown}
        </div>
      </section>

      <!-- Features -->
      <section id="features" class="section">
        <div class="section-eyebrow">Capabilities</div>
        <h2 class="section-title">Everything you need, nothing you don't</h2>
        <p class="section-subtitle">A complete AI workspace built for people who ship. Not another chatbot — a real tool.</p>
        <div class="features-grid">${featuresHtml}</div>
      </section>

      <div class="section-divider"></div>

      <!-- AI Team / Agent Personas -->
      <section id="team" class="section">
        <div class="section-eyebrow">Meet Your AI Team</div>
        <h2 class="section-title">Specialists, not generalists</h2>
        <p class="section-subtitle">Each agent has a role, a personality, and deep expertise. Switch between them mid-conversation.</p>
        <div class="agents-grid">${agentsHtml}</div>
      </section>

      <div class="section-divider"></div>

      <!-- Shared Intelligence -->
      <section id="intelligence" class="section">
        <div class="section-eyebrow">Shared Context</div>
        <div class="shared-intel">
          <div class="shared-intel-content">
            <h3>Your AI team shares a brain</h3>
            <p>Every agent has access to your shared context — conversations, documents, preferences, and project history. No repeating yourself. No lost context between sessions.</p>
            <ul class="shared-intel-features">
              <li>${ICON.database} <span>Persistent memory across conversations</span></li>
              <li>${ICON.share} <span>Context flows between agents automatically</span></li>
              <li>${ICON.layers} <span>Project-scoped knowledge with team isolation</span></li>
            </ul>
          </div>
          <div class="shared-intel-visual">
            <div class="brain-diagram">
              <div class="brain-center">
                ${ICON.brain}
                <span class="brain-center-label">Context</span>
              </div>
              <div class="brain-node">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="4"/><path d="M3 21v-2a7 7 0 0 1 7-7h4a7 7 0 0 1 7 7v2"/></svg>
                Aria
              </div>
              <div class="brain-node">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                Atlas
              </div>
              <div class="brain-node">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                Nova
              </div>
              <div class="brain-node">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                Bolt
              </div>
              <div class="brain-line"></div>
              <div class="brain-line"></div>
              <div class="brain-line"></div>
              <div class="brain-line"></div>
            </div>
          </div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Social Proof -->
      <section id="proof" class="section">
        <div class="section-eyebrow">Results</div>
        <h2 class="section-title">Built to save you hours, not minutes</h2>
        <p class="section-subtitle">Real impact, measured across hundreds of teams and thousands of tasks.</p>
        <div class="metrics-row">${metricsHtml}</div>
        <div class="testimonials-grid">${testimonialsHtml}</div>
      </section>

      <div class="section-divider"></div>

      <!-- Integrations -->
      <section id="integrations" class="section">
        <div class="section-eyebrow">Integrations</div>
        <h2 class="section-title">Connect your tools</h2>
        <p class="section-subtitle">Your agents work with the tools you already use. Powered by the Model Context Protocol.</p>
        <div class="integration-steps">${integrationStepsHtml}</div>
        <div class="integration-logos">
          <div class="integration-logo">GitHub</div>
          <div class="integration-logo">Slack</div>
          <div class="integration-logo">Notion</div>
          <div class="integration-logo">Postgres</div>
          <div class="integration-logo">Jira</div>
          <div class="integration-logo">Stripe</div>
          <div class="integration-logo">S3</div>
          <div class="integration-logo">REST</div>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- How It Works -->
      <section id="how" class="section">
        <div class="section-eyebrow">Getting Started</div>
        <h2 class="section-title">Up and running in minutes</h2>
        <p class="section-subtitle">Three steps to your own AI workspace.</p>
        <div class="steps-row">
          <div class="steps-line"></div>
          ${stepsHtml}
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Code Showcase -->
      <section class="section">
        <div class="section-eyebrow">Generative UI</div>
        <h2 class="section-title">See it in action</h2>
        <p class="section-subtitle">Agents generate interactive UI components in real-time — charts, stats, forms, and more.</p>
        <div class="code-block">
          <span class="code-label">scratchy-toon</span>
<span class="code-key">op</span>: <span class="code-val">upsert</span>
<span class="code-key">id</span>: <span class="code-val">server-stats</span>
<span class="code-key">type</span>: <span class="code-type">stats</span>
<span class="code-key">data</span>:
  <span class="code-key">title</span>: <span class="code-val">Server Status</span>
  <span class="code-key">items</span><span class="code-comment">[3]{label,value}</span>:
    <span class="code-val">CPU,73%</span>
    <span class="code-val">RAM,4.2 GB</span>
    <span class="code-val">Uptime,14d 3h</span>
        </div>
      </section>

      <div class="section-divider"></div>

      <!-- Pricing -->
      <section id="pricing" class="section">
        <div class="section-eyebrow">Pricing</div>
        <h2 class="section-title">Simple, transparent pricing</h2>
        <p class="section-subtitle">Start free. Upgrade when you need more. No surprises.</p>
        <div class="plans-row">${plansHtml}</div>
      </section>

      <div class="section-divider"></div>

      <!-- Changelog -->
      <section id="changelog" class="section">
        <div class="section-eyebrow">What's New</div>
        <h2 class="section-title">Shipping every week</h2>
        <p class="section-subtitle">We're building in the open. Here's what landed recently.</p>
        <div class="changelog-list">${changelogHtml}</div>
      </section>

      <!-- Final CTA -->
      <section class="section final-cta">
        <h2>Ready to meet your AI team?</h2>
        <p>Deploy your workspace in under 5 minutes. Free forever — no credit card required.</p>
        <button class="btn btn-primary" data-action="get-started">Get Started Free</button>
      </section>

      <!-- Footer -->
      <footer class="footer">
        <div>&copy; 2026 Scratchy. All rights reserved.</div>
        <div class="footer-links">
          <a href="https://github.com/yassinebkr/scratchy" target="_blank" rel="noopener">GitHub</a>
          <a href="https://docs.openclaw.ai" target="_blank" rel="noopener">Docs</a>
          <a href="https://discord.com/invite/clawd" target="_blank" rel="noopener">Discord</a>
        </div>
      </footer>
    `;
  }

  _wireEvents() {
    const root = this.shadowRoot;

    // Mobile hamburger toggle
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

    // CTA buttons
    root.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._emit(btn.dataset.action));
    });

    // Plan CTAs
    root.querySelectorAll('.plan-cta').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._emit('select-plan', btn.dataset.plan);
      });
    });

    // Smooth scroll
    root.querySelectorAll('[data-scroll]').forEach(el => {
      el.addEventListener('click', () => {
        const target = root.getElementById(el.dataset.scroll);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Nav anchor links
    root.querySelectorAll('.nav-links a').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('href').slice(1);
        const target = root.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
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
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    sections.forEach(s => this._observer.observe(s));
  }
}

customElements.define('sc-landing', ScLanding);
