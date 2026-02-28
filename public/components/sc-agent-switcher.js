/**
 * Scratchy v2 — <sc-agent-switcher> Web Component
 *
 * Card-based agent switcher with named personas, colored CSS avatars,
 * status indicators, capability tags, keyboard navigation (Arrow keys +
 * Cmd/Ctrl+1-9), search/filter, "Add Agent" card, mobile horizontal
 * scroll, glassmorphism dark-gold theme, and full ARIA compliance.
 *
 * Properties:  activeAgentId (string|null)
 * Attributes:  compact, auto-compact
 * Events:      agent-switch  { agentId, agent }
 *              agent-edit    { agentId, agent }
 *              agent-create  { agent }
 *              agent-delete  { agentId }
 * Public API:  loadAgents(), static templates
 */

/* ─── Avatar Color Palette ───────────────────────────────
   10 vibrant colors, all accessible on dark backgrounds.
   Color is selected deterministically via name-hash.       */
const AVATAR_PALETTE = [
  { bg: '#F9A602', fg: '#0d0b07' },  // Gold
  { bg: '#22c55e', fg: '#0d0b07' },  // Emerald
  { bg: '#3b82f6', fg: '#ffffff' },  // Blue
  { bg: '#a855f7', fg: '#ffffff' },  // Violet
  { bg: '#ef4444', fg: '#ffffff' },  // Rose
  { bg: '#06b6d4', fg: '#0d0b07' },  // Cyan
  { bg: '#f97316', fg: '#0d0b07' },  // Orange
  { bg: '#ec4899', fg: '#ffffff' },  // Pink
  { bg: '#84cc16', fg: '#0d0b07' },  // Lime
  { bg: '#6366f1', fg: '#ffffff' },  // Indigo
];

/* ─── SVG Icons (inline, no emoji) ──────────────────────── */
const SVG = {
  plus:     '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/></svg>',
  search:   '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4"/><line x1="10" y1="10" x2="14" y2="14"/></svg>',
  check:    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="2,6 5,9 10,3"/></svg>',
  close:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><line x1="3" y1="3" x2="11" y2="11"/><line x1="11" y1="3" x2="3" y2="11"/></svg>',
  trash:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="2.5" y1="4" x2="11.5" y2="4"/><path d="M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4"/><path d="M3.5 4l.7 8a1 1 0 0 0 1 .9h3.6a1 1 0 0 0 1-.9l.7-8"/></svg>',
  edit:     '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3l3 3-7 7H1v-3z"/><line x1="6.5" y1="4.5" x2="9.5" y2="7.5"/></svg>',
  code:     '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6,4 2,9 6,14"/><polyline points="12,4 16,9 12,14"/></svg>',
  palette:  '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="9" r="7"/><circle cx="6.5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="11.5" cy="7" r="1" fill="currentColor" stroke="none"/><path d="M14 10.5c0 1.5-1.5 3.5-3 3.5h-1c-1 0-1.5.5-1.5 1.2"/></svg>',
  lens:     '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5"/><line x1="11.5" y1="11.5" x2="16" y2="16"/><line x1="5.5" y1="7.5" x2="9.5" y2="7.5"/><line x1="7.5" y1="5.5" x2="7.5" y2="9.5"/></svg>',
  pen:      '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 2.5l3 3L5 16H2v-3z"/></svg>',
};

/* ─── Models ─────────────────────────────────────────────── */
const MODELS = [
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'opus',   label: 'Claude Opus' },
  { value: 'haiku',  label: 'Claude Haiku' },
  { value: 'gemini', label: 'Gemini' },
];

/* ─── Agent Templates (named personas) ───────────────────
   Each template has a persona name, role, and description
   to make AI feel like a team member, not a model name.    */
const AGENT_TEMPLATES = [
  {
    id: 'tpl-code',
    icon: 'code',
    name: 'Atlas',
    role: 'Code Assistant',
    description: 'Writes, debugs, and reviews code with precision',
    systemPrompt: 'You are an expert software engineer. Help the user write, debug, and review code. Be concise and precise. Prefer working solutions over explanations.',
    model: 'sonnet',
    temperature: 0.3,
    surfaces: ['terminal', 'editor'],
    capabilities: ['code', 'debug', 'review'],
    mcpServers: [],
  },
  {
    id: 'tpl-designer',
    icon: 'palette',
    name: 'Iris',
    role: 'Designer',
    description: 'Creates bold visual concepts and UI layouts',
    systemPrompt: 'You are a creative designer. Help with UI/UX design, color palettes, layouts, and visual concepts. Think visually and suggest bold ideas.',
    model: 'sonnet',
    temperature: 0.9,
    surfaces: ['canvas'],
    capabilities: ['design', 'creative', 'ui'],
    mcpServers: [],
  },
  {
    id: 'tpl-researcher',
    icon: 'lens',
    name: 'Nova',
    role: 'Researcher',
    description: 'Finds, verifies, and synthesizes information',
    systemPrompt: 'You are a thorough researcher. Search for information, synthesize findings, verify facts, and present clear summaries with sources.',
    model: 'sonnet',
    temperature: 0.8,
    surfaces: [],
    capabilities: ['research', 'analysis', 'search'],
    mcpServers: [],
  },
  {
    id: 'tpl-writer',
    icon: 'pen',
    name: 'Echo',
    role: 'Writer',
    description: 'Crafts clear, engaging prose for any audience',
    systemPrompt: 'You are a skilled writer and editor. Help craft clear, engaging prose. Adapt your tone and style to the audience. Focus on clarity and impact.',
    model: 'sonnet',
    temperature: 0.7,
    surfaces: [],
    capabilities: ['writing', 'editing', 'creative'],
    mcpServers: [],
  },
];

const SURFACE_OPTIONS = ['terminal', 'editor', 'canvas', 'browser', 'files'];

/* ─── Platform detection ────────────────────────────────── */
const IS_MAC = typeof navigator !== 'undefined'
  && (navigator.platform?.includes('Mac') || navigator.userAgent?.includes('Mac'));
const MOD_SYMBOL = IS_MAC ? '\u2318' : 'Ctrl\u2009+\u2009';

/* ─── Styles ─────────────────────────────────────────────── */
const STYLES = /* css */ `
/* ── reset & host ────────────────────────────────────────── */
:host {
  --bg:            #0d0b07;
  --surface:       rgba(26,22,16,0.82);
  --surface-solid: #1a1610;
  --surface-hover: rgba(36,32,22,0.85);
  --border:        rgba(249,166,2,0.10);
  --border-glass:  rgba(249,166,2,0.05);
  --border-hover:  rgba(249,166,2,0.22);
  --border-active: rgba(249,166,2,0.50);
  --radius:        8px;
  --radius-sm:     6px;
  --text:          #f0ead6;
  --muted:         #8a7e6a;
  --dim:           #5a5040;
  --accent:        #F9A602;
  --accent-hover:  #DAA520;
  --accent-glow:   rgba(249,166,2,0.30);
  --danger:        #ef4444;
  --success:       #22c55e;
  --busy:          #F9A602;
  --offline:       #6b7280;
  --focus-ring:    0 0 0 2px rgba(249,166,2,0.35);
  --font:          'Geist', system-ui, -apple-system, sans-serif;

  display: block;
  font-family: var(--font);
  font-size: 13px;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Switcher container ──────────────────────────────────── */
.switcher {
  padding: 8px 0 4px;
}

/* ── Header ──────────────────────────────────────────────── */
.switcher-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 8px;
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #5a5040;
  user-select: none;
}

.header-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  transition: color 0.15s ease-out, border-color 0.15s ease-out, background 0.15s ease-out;
  flex-shrink: 0;
}

.header-add-btn svg {
  width: 14px;
  height: 14px;
}

.header-add-btn:hover {
  color: var(--accent);
  border-color: var(--border-hover);
  background: rgba(249,166,2,0.06);
}

.header-add-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* ── Search bar ──────────────────────────────────────────── */
.search-bar {
  display: none;
  position: relative;
  padding: 0 8px;
  margin-bottom: 6px;
}

.search-bar.visible {
  display: block;
}

.search-icon {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--dim);
  pointer-events: none;
  display: flex;
}

.search-input {
  width: 100%;
  background: rgba(13,11,7,0.5);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: var(--font);
  font-size: 12px;
  padding: 5px 8px 5px 28px;
  outline: none;
  transition: border-color 0.15s ease-out;
}

.search-input::placeholder {
  color: var(--dim);
}

.search-input:focus {
  border-color: rgba(249,166,2,0.3);
}

/* ── Agent grid ──────────────────────────────────────────── */
.agent-grid {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 6px;
  outline: none;
}

/* ── Agent card — COMPACT (36px height) ──────────────────── */
.agent-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  border-left: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease-out, border-color 0.15s ease-out;
  animation: cardIn 0.2s ease-out both;
  outline: none;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}

.agent-card:hover {
  background: rgba(249,166,2,0.04);
}

/* ── Active card — left border accent ────────────────────── */
.agent-card.active {
  border-left: 3px solid var(--accent);
  background: rgba(249,166,2,0.05);
  box-shadow: 0 0 16px -4px rgba(249,166,2,0.08);
}

.agent-card.active:hover {
  background: rgba(249,166,2,0.08);
}

/* ── Focused card — keyboard ring ────────────────────────── */
.agent-card.focused {
  box-shadow: var(--focus-ring);
}

.agent-card.active.focused {
  box-shadow: var(--focus-ring);
}

/* ── Card header row ─────────────────────────────────────── */
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}

/* ── Avatar — smaller, 24px ──────────────────────────────── */
.card-avatar {
  position: relative;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  flex-shrink: 0;
  overflow: visible;
  user-select: none;
  transition: transform 0.15s ease-out;
}

.card-avatar img {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  object-fit: cover;
}

.agent-card:hover .card-avatar {
  transform: scale(1.06);
}

/* ── Status dot — smaller ────────────────────────────────── */
.status-dot {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--surface-solid);
  transition: background 0.2s ease-out;
}

.status-dot.online  { background: var(--success); }
.status-dot.busy    { background: var(--busy); }
.status-dot.offline { background: var(--offline); }

/* ── Identity (name + role inline) ───────────────────────── */
.card-identity {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 6px;
}

.card-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.card-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.card-role {
  font-size: 11px;
  color: var(--dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

/* ── Keyboard shortcut badge ─────────────────────────────── */
.card-shortcut {
  font-size: 9px;
  font-weight: 500;
  color: var(--dim);
  background: transparent;
  border: none;
  padding: 0;
  white-space: nowrap;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
  user-select: none;
  font-family: var(--font);
}

.agent-card:hover .card-shortcut {
  opacity: 0.7;
}

/* ── Active checkmark — hidden in compact mode, use border ── */
.card-check {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  color: #0d0b07;
  display: none;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-card.active .card-check {
  display: none;
}

/* ── Card actions (edit/delete, on hover) ────────────────── */
.card-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 1px;
  opacity: 0;
  transition: opacity 0.12s ease-out;
}

.agent-card:hover .card-actions,
.agent-card.focused .card-actions {
  opacity: 1;
}

.agent-card.active .card-actions {
  right: 6px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  padding: 0;
}

.action-btn svg {
  width: 12px;
  height: 12px;
}

.action-btn:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text);
}

.action-btn.delete-btn:hover {
  background: rgba(239,68,68,0.12);
  color: var(--danger);
}

.action-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* ── Card description — hidden by default ────────────────── */
.card-description {
  display: none;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
  padding-left: 32px;
  margin-top: 2px;
}

.agent-card.active .card-description {
  display: block;
}

/* ── Card footer — capability tags as subtle text ────────── */
.card-footer {
  display: none;
  align-items: center;
  gap: 4px;
  padding-left: 32px;
  margin-top: 2px;
}

.agent-card.active .card-footer {
  display: flex;
}

/* ── Capability tags — subtle text, not pills ────────────── */
.card-caps {
  display: flex;
  flex-wrap: nowrap;
  gap: 0;
  min-width: 0;
  overflow: hidden;
}

.cap-tag {
  font-size: 10px;
  font-weight: 400;
  color: var(--dim);
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  white-space: nowrap;
  line-height: 1.3;
  user-select: none;
}

.cap-tag::after {
  content: ' · ';
  color: var(--dim);
  opacity: 0.5;
}

.cap-tag:last-child::after {
  content: '';
}

/* ── Usage stats ─────────────────────────────────────────── */
.card-stats {
  font-size: 10px;
  color: var(--dim);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Add Agent card ──────────────────────────────────────── */
.add-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  border-style: dashed;
  border-color: var(--border);
  border-left-width: 2px;
  background: transparent;
  cursor: pointer;
}

.add-card:hover {
  border-color: rgba(249,166,2,0.2);
  background: rgba(249,166,2,0.03);
}

.add-card:hover .add-icon {
  color: var(--accent);
}

.add-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dim);
  transition: color 0.15s ease-out;
}

.add-icon svg {
  width: 14px;
  height: 14px;
}

.add-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--dim);
  transition: color 0.15s;
}

.add-card:hover .add-label {
  color: var(--muted);
}

/* ── Empty state ─────────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  text-align: center;
}

.empty-icon {
  color: var(--dim);
  opacity: 0.5;
}

.empty-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
}

.empty-subtitle {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

/* ── No search results ───────────────────────────────────── */
.no-results {
  text-align: center;
  color: var(--dim);
  font-size: 12px;
  padding: 20px 16px;
}

/* ── Creator overlay ─────────────────────────────────────── */
.creator-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease-out;
}

.creator-overlay.open {
  display: flex;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.creator-card {
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  width: 100%;
  max-width: 480px;
  max-height: 85vh;
  overflow-y: auto;
  margin: 16px;
  animation: slideUp 0.2s ease-out;
}

/* Scrollbar styling */
.creator-card::-webkit-scrollbar { width: 6px; }
.creator-card::-webkit-scrollbar-track { background: transparent; }
.creator-card::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

@keyframes slideUp {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.creator-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 20px;
  color: var(--text);
}

/* ── Templates section ───────────────────────────────────── */
.templates-section {
  margin-bottom: 20px;
}

.templates-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
  margin-bottom: 8px;
  display: block;
}

.templates-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.template-btn {
  background: rgba(13,11,7,0.5);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px;
  cursor: pointer;
  color: var(--text);
  font-family: var(--font);
  font-size: 12px;
  text-align: left;
  transition: border-color 0.15s ease-out, background 0.15s ease-out;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-btn:hover {
  border-color: var(--border-hover);
  background: rgba(249,166,2,0.04);
}

.template-btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.template-icon {
  color: var(--accent);
  display: flex;
  margin-bottom: 2px;
}

.template-name {
  font-weight: 600;
  font-size: 13px;
}

.template-role {
  font-size: 11px;
  color: var(--muted);
}

/* ── Form fields ─────────────────────────────────────────── */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}

.form-group label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--muted);
}

.form-group input,
.form-group textarea,
.form-group select {
  background: rgba(13,11,7,0.5);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: var(--font);
  font-size: 13px;
  padding: 8px 10px;
  outline: none;
  transition: border-color 0.15s ease-out;
  width: 100%;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--muted);
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  border-color: var(--accent);
}

.form-group input.invalid,
.form-group textarea.invalid {
  border-color: var(--danger);
}

.form-group textarea {
  resize: vertical;
  min-height: 64px;
}

.form-group select {
  appearance: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%238a7e6a' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 28px;
}

/* ── Slider ──────────────────────────────────────────────── */
.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slider-row input[type="range"] {
  flex: 1;
  accent-color: var(--accent);
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.slider-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  min-width: 28px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ── Toggle switch ───────────────────────────────────────── */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.toggle-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-track {
  position: absolute;
  inset: 0;
  background: rgba(249,166,2,0.15);
  border-radius: 10px;
  transition: background 0.2s ease-out;
}

.toggle-switch input:checked + .toggle-track {
  background: var(--accent);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease-out, background 0.2s ease-out;
  pointer-events: none;
}

.toggle-switch input:checked ~ .toggle-thumb {
  transform: translateX(16px);
  background: #0d0b07;
}

.toggle-switch:focus-within {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: 10px;
}

/* ── Surface chips ───────────────────────────────────────── */
.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: rgba(13,11,7,0.4);
  color: var(--muted);
  cursor: pointer;
  transition: border-color 0.15s ease-out, color 0.15s ease-out, background 0.15s ease-out;
  font-family: var(--font);
}

.chip:hover {
  border-color: var(--border-hover);
}

.chip.selected {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(249,166,2,0.08);
}

.chip:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* ── Buttons ─────────────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn {
  font-family: var(--font);
  font-size: 13px;
  font-weight: 600;
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.15s ease-out, opacity 0.15s ease-out, color 0.15s ease-out;
  border: none;
}

.btn-ghost {
  background: transparent;
  color: var(--muted);
}

.btn-ghost:hover {
  color: var(--text);
  background: rgba(249,166,2,0.06);
}

.btn-primary {
  background: var(--accent);
  color: #0d0b07;
}

.btn-primary:hover {
  background: var(--accent-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary:focus-visible,
.btn-ghost:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* ── Advanced section toggle ─────────────────────────────── */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-family: var(--font);
  font-size: 12px;
  font-weight: 500;
  padding: 8px 12px;
  cursor: pointer;
  margin-bottom: 14px;
  transition: color 0.15s ease-out, border-color 0.15s ease-out, background 0.15s ease-out;
}

.advanced-toggle:hover {
  color: var(--text);
  border-color: var(--border-hover);
  background: rgba(249,166,2,0.04);
}

.advanced-toggle:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.advanced-toggle .toggle-chevron {
  transition: transform 0.2s ease-out;
  display: inline-flex;
}

.advanced-toggle.expanded .toggle-chevron {
  transform: rotate(90deg);
}

.advanced-section {
  display: none;
}

.advanced-section.expanded {
  display: block;
}

/* ── Template summary (shown after template selected) ────── */
.template-summary {
  display: none;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: rgba(249,166,2,0.04);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
}

.template-summary.visible {
  display: block;
}

.template-summary .summary-name {
  color: var(--text);
  font-weight: 600;
}

.template-summary .summary-detail {
  margin-top: 4px;
}

.form-error {
  color: var(--danger);
  font-size: 12px;
  margin-top: 4px;
  min-height: 16px;
}

/* ── Delete confirmation dialog ──────────────────────────── */
.confirm-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 1100;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.15s ease-out;
}

.confirm-overlay.open {
  display: flex;
}

.confirm-card {
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 24px;
  width: 100%;
  max-width: 360px;
  margin: 16px;
  text-align: center;
  animation: slideUp 0.2s ease-out;
}

.confirm-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text);
}

.confirm-msg {
  font-size: 13px;
  color: var(--muted);
  margin: 0 0 20px;
  line-height: 1.5;
}

.confirm-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.btn-danger {
  background: var(--danger);
  color: #fff;
  font-family: var(--font);
  font-size: 13px;
  font-weight: 600;
  padding: 9px 18px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
  transition: background 0.15s ease-out;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-danger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(239,68,68,0.4);
}

/* ── Mobile / compact mode ───────────────────────────────── */
:host([compact]) .switcher {
  padding: 4px 0;
}

:host([compact]) .search-bar {
  display: none !important;
}

:host([compact]) .agent-grid {
  flex-direction: row;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  gap: 6px;
  padding: 0 8px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

:host([compact]) .agent-grid::-webkit-scrollbar {
  display: none;
}

:host([compact]) .agent-card {
  flex: 0 0 auto;
  width: 56px;
  min-height: 56px;
  padding: 8px 4px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  scroll-snap-align: start;
  border-left: 1px solid transparent;
  border-radius: var(--radius-sm);
}

:host([compact]) .card-header {
  flex-direction: column;
  gap: 3px;
  min-height: 0;
}

:host([compact]) .card-avatar {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  font-size: 10px;
}

:host([compact]) .card-identity {
  align-items: center;
  flex-direction: column;
}

:host([compact]) .card-name-row {
  justify-content: center;
}

:host([compact]) .card-name {
  font-size: 9px;
  font-weight: 600;
  max-width: 52px;
  text-align: center;
}

:host([compact]) .card-role,
:host([compact]) .card-shortcut,
:host([compact]) .card-description,
:host([compact]) .card-footer,
:host([compact]) .card-actions,
:host([compact]) .card-check {
  display: none !important;
}

:host([compact]) .agent-card.active {
  border-color: var(--accent);
  border-left-color: var(--accent);
  background: rgba(249,166,2,0.08);
}

:host([compact]) .add-card {
  width: 56px;
  min-height: 56px;
  flex-direction: column;
  gap: 3px;
}

:host([compact]) .add-label {
  font-size: 9px;
}

:host([compact]) .header-title {
  display: none;
}

/* ── Mobile bottom sheets for overlays ───────────────────── */
@media (max-width: 640px) {
  .creator-overlay {
    align-items: flex-end;
  }

  .creator-card {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-width: 100%;
    max-height: 82vh;
    margin: 0;
    border-radius: 16px 16px 0 0;
    animation: slideUpMobile 0.25s ease-out;
  }

  @keyframes slideUpMobile {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .confirm-overlay {
    align-items: flex-end;
  }

  .confirm-card {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-width: 100%;
    margin: 0;
    border-radius: 16px 16px 0 0;
  }
}

/* ══ ICON RAIL MODE ═══════════════════════════════════════════
   Transforms the agent list into a 52px icon-only vertical rail.
   VS Code activity bar pattern: avatar circles, tooltip on hover.
   ═════════════════════════════════════════════════════════════ */

.switcher {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px 0;
  align-items: center;
  overflow: visible;
}

.switcher-header {
  display: none;
}

.search-bar,
.search-bar.visible {
  display: none !important;
}

.agent-grid {
  align-items: center;
  gap: 4px;
  padding: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: visible;
  scrollbar-width: none;
}

.agent-grid::-webkit-scrollbar {
  display: none;
}

.agent-card {
  width: 44px;
  height: 44px;
  min-height: 44px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  border: none;
  border-left: 3px solid transparent;
  flex-direction: row;
  gap: 0;
  position: relative;
  animation: none;
  flex-shrink: 0;
}

.agent-card.active {
  border-left-color: var(--accent);
  background: rgba(249,166,2,0.08);
  box-shadow: none;
}

.agent-card.active:hover {
  background: rgba(249,166,2,0.12);
}

.agent-card:hover {
  background: rgba(249,166,2,0.06);
}

.agent-card.focused {
  box-shadow: var(--focus-ring);
}

.card-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  font-size: 12px;
  font-weight: 700;
}

.status-dot {
  bottom: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-width: 2px;
}

.card-identity,
.card-description,
.card-footer,
.card-actions,
.card-check,
.card-shortcut {
  display: none !important;
}

/* CSS Tooltip — positioned right of rail */
.agent-card[data-tooltip]::after {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  background: #1a1610;
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-hover);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s ease-out;
  z-index: 200;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.agent-card[data-tooltip]:hover::after {
  opacity: 1;
}

/* Add Agent button — ghost circle at bottom */
.add-card {
  width: 36px;
  height: 36px;
  min-height: 36px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  margin-top: 8px;
  flex-shrink: 0;
}

.add-card:hover {
  border-color: rgba(249,166,2,0.25);
  background: rgba(249,166,2,0.04);
}

.add-card:hover .add-icon {
  color: var(--accent);
}

.add-icon {
  color: var(--dim);
}

.add-icon svg {
  width: 16px;
  height: 16px;
}

.add-label {
  display: none;
}

/* ── Reduced motion ──────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .agent-card,
  .creator-overlay,
  .confirm-overlay {
    animation: none !important;
  }

  .agent-card,
  .card-avatar,
  .action-btn,
  .cap-tag,
  .card-shortcut,
  .status-dot,
  .toggle-track,
  .toggle-thumb,
  .search-input,
  .template-btn,
  .chip,
  .btn,
  .btn-danger,
  .add-icon,
  .add-label,
  .header-add-btn {
    transition: none !important;
  }

  .creator-card,
  .confirm-card {
    animation: none !important;
  }
}
`;

/* ─── HTML Template ──────────────────────────────────────── */
const tpl = document.createElement('template');
tpl.innerHTML = `
<style>${STYLES}</style>

<div class="switcher">
  <div class="switcher-header">
    <span class="header-title">Your Team</span>
    <button class="header-add-btn" id="header-add-btn" aria-label="Add new agent" title="Add new agent">
      ${SVG.plus}
    </button>
  </div>

  <div class="search-bar" id="search-bar">
    <span class="search-icon">${SVG.search}</span>
    <input
      type="text"
      class="search-input"
      id="search-input"
      placeholder="Search agents\u2026"
      aria-label="Filter agents"
      autocomplete="off"
    />
  </div>

  <div class="agent-grid" id="agent-grid" role="listbox" aria-label="Your agents" tabindex="0">
    <div class="empty-state">
      <span class="empty-icon">${SVG.plus}</span>
      <span class="empty-subtitle">Loading agents\u2026</span>
    </div>
  </div>
</div>

<!-- Creator overlay -->
<div class="creator-overlay" id="creator-overlay" role="dialog" aria-modal="true" aria-labelledby="creator-title">
  <div class="creator-card">
    <h3 class="creator-title" id="creator-title">Create Agent</h3>

    <div class="templates-section" id="templates-section">
      <span class="templates-label">Start from a persona</span>
      <div class="templates-grid" id="templates-grid"></div>
    </div>

    <div class="template-summary" id="template-summary">
      <span class="summary-name" id="summary-name"></span>
      <div class="summary-detail" id="summary-detail"></div>
    </div>

    <form id="creator-form" autocomplete="off">
      <!-- Essential fields (always visible) -->
      <div class="form-group">
        <label for="agent-name">Name</label>
        <input id="agent-name" type="text" placeholder="e.g. Atlas" required maxlength="60" />
      </div>
      <div class="form-group">
        <label for="agent-role">Role</label>
        <input id="agent-role" type="text" placeholder="e.g. Code Assistant" maxlength="80" />
      </div>
      <div class="form-group">
        <label for="agent-model">Model</label>
        <select id="agent-model"></select>
      </div>

      <!-- Advanced toggle -->
      <button type="button" class="advanced-toggle" id="advanced-toggle">
        <span class="toggle-chevron">&#9654;</span>
        Show advanced options
      </button>

      <!-- Advanced fields (hidden by default) -->
      <div class="advanced-section" id="advanced-section">
        <div class="form-group">
          <label for="agent-description">Description</label>
          <input id="agent-description" type="text" placeholder="One line of what this agent does best" maxlength="120" />
        </div>
        <div class="form-group">
          <label for="agent-avatar">Avatar URL</label>
          <input id="agent-avatar" type="url" placeholder="https://\u2026 (optional, uses initials if empty)" />
        </div>
        <div class="form-group">
          <label for="agent-prompt">System Prompt</label>
          <textarea id="agent-prompt" rows="3" placeholder="You are a helpful assistant\u2026"></textarea>
        </div>
        <div class="form-group">
          <label>Temperature</label>
          <div class="slider-row">
            <input type="range" id="agent-temp" min="0" max="2" step="0.1" value="0.7" />
            <span class="slider-value" id="temp-value">0.7</span>
          </div>
        </div>
        <div class="form-group">
          <label>Surfaces</label>
          <div class="chips-row" id="surfaces-chips"></div>
        </div>
        <div class="form-group">
          <label for="agent-mcp">MCP Servers (one per line)</label>
          <textarea id="agent-mcp" rows="2" placeholder="node /path/to/server.mjs"></textarea>
        </div>
        <div class="form-group">
          <div class="toggle-row">
            <span class="toggle-label">Enabled</span>
            <label class="toggle-switch">
              <input type="checkbox" id="agent-enabled" checked role="switch" aria-label="Agent enabled" />
              <span class="toggle-track"></span>
              <span class="toggle-thumb"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="form-error" id="form-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" id="cancel-btn">Cancel</button>
        <button type="submit" class="btn btn-primary" id="save-btn">Create</button>
      </div>
    </form>
  </div>
</div>

<!-- Delete confirmation overlay -->
<div class="confirm-overlay" id="confirm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
  <div class="confirm-card">
    <h3 class="confirm-title" id="confirm-title">Delete Agent</h3>
    <p class="confirm-msg" id="confirm-msg">Are you sure you want to delete this agent?</p>
    <div class="confirm-actions">
      <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
      <button class="btn-danger" id="confirm-delete">Delete</button>
    </div>
  </div>
</div>
`;

/* ─── Component Class ────────────────────────────────────── */
export class ScAgentSwitcher extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(tpl.content.cloneNode(true));

    /* State */
    this._agents = [];
    this._filtered = [];          // after search filter
    this._activeAgentId = null;
    this._focusedIndex = -1;
    this._token = null;
    this._editingAgentId = null;
    this._pendingDeleteAgent = null;
    this._selectedSurfaces = new Set();
    this._searchQuery = '';

    /* DOM refs */
    this._gridEl       = this.shadowRoot.getElementById('agent-grid');
    this._headerAddBtn = this.shadowRoot.getElementById('header-add-btn');
    this._searchBar    = this.shadowRoot.getElementById('search-bar');
    this._searchInput  = this.shadowRoot.getElementById('search-input');
    this._overlay      = this.shadowRoot.getElementById('creator-overlay');
    this._form         = this.shadowRoot.getElementById('creator-form');
    this._cancelBtn    = this.shadowRoot.getElementById('cancel-btn');
    this._errorEl      = this.shadowRoot.getElementById('form-error');
    this._modelSelect  = this.shadowRoot.getElementById('agent-model');
    this._tempSlider   = this.shadowRoot.getElementById('agent-temp');
    this._tempValue    = this.shadowRoot.getElementById('temp-value');
    this._creatorTitle = this.shadowRoot.getElementById('creator-title');
    this._saveBtn      = this.shadowRoot.getElementById('save-btn');
    this._templatesGrid    = this.shadowRoot.getElementById('templates-grid');
    this._templatesSection = this.shadowRoot.getElementById('templates-section');
    this._surfacesChips    = this.shadowRoot.getElementById('surfaces-chips');
    this._mcpInput     = this.shadowRoot.getElementById('agent-mcp');
    this._enabledToggle = this.shadowRoot.getElementById('agent-enabled');
    this._confirmOverlay = this.shadowRoot.getElementById('confirm-overlay');
    this._confirmMsg     = this.shadowRoot.getElementById('confirm-msg');
    this._confirmCancel  = this.shadowRoot.getElementById('confirm-cancel');
    this._confirmDelete  = this.shadowRoot.getElementById('confirm-delete');
    this._advancedToggle = this.shadowRoot.getElementById('advanced-toggle');
    this._advancedSection = this.shadowRoot.getElementById('advanced-section');
    this._templateSummary = this.shadowRoot.getElementById('template-summary');
    this._summaryName    = this.shadowRoot.getElementById('summary-name');
    this._summaryDetail  = this.shadowRoot.getElementById('summary-detail');

    /* Bound handlers (for removal in disconnectedCallback) */
    this._onGlobalKeydown = this._handleGlobalKeydown.bind(this);
  }

  /* ═══ Lifecycle ═══════════════════════════════════════════ */

  connectedCallback() {
    /* Populate model select */
    for (const m of MODELS) {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      this._modelSelect.appendChild(opt);
    }

    /* Populate template buttons */
    for (const t of AGENT_TEMPLATES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'template-btn';
      btn.dataset.templateId = t.id;
      const iconSvg = SVG[t.icon] || '';
      btn.innerHTML = `
        <span class="template-icon">${iconSvg}</span>
        <span class="template-name">${this._esc(t.name)}</span>
        <span class="template-role">${this._esc(t.role)}</span>
      `;
      btn.addEventListener('click', () => this._applyTemplate(t));
      this._templatesGrid.appendChild(btn);
    }

    /* Populate surface chips */
    for (const surface of SURFACE_OPTIONS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = surface;
      chip.dataset.surface = surface;
      chip.addEventListener('click', () => {
        if (this._selectedSurfaces.has(surface)) {
          this._selectedSurfaces.delete(surface);
          chip.classList.remove('selected');
        } else {
          this._selectedSurfaces.add(surface);
          chip.classList.add('selected');
        }
      });
      this._surfacesChips.appendChild(chip);
    }

    /* Temperature slider feedback */
    this._tempSlider.addEventListener('input', () => {
      this._tempValue.textContent = this._tempSlider.value;
    });

    /* Advanced section toggle */
    this._advancedToggle.addEventListener('click', () => {
      const expanded = this._advancedSection.classList.toggle('expanded');
      this._advancedToggle.classList.toggle('expanded', expanded);
      this._advancedToggle.querySelector('.toggle-chevron').innerHTML = '&#9654;';
      this._advancedToggle.textContent = '';
      const chevron = document.createElement('span');
      chevron.className = 'toggle-chevron';
      chevron.innerHTML = '&#9654;';
      this._advancedToggle.prepend(chevron);
      this._advancedToggle.append(expanded ? 'Hide advanced options' : 'Show advanced options');
      if (expanded) this._advancedToggle.classList.add('expanded');
    });

    /* Header add button */
    this._headerAddBtn.addEventListener('click', () => this._openCreator());

    /* Search input */
    this._searchInput.addEventListener('input', () => {
      this._searchQuery = this._searchInput.value.trim().toLowerCase();
      this._applyFilter();
      this._renderList();
    });

    /* Cancel creator */
    this._cancelBtn.addEventListener('click', () => this._closeCreator());
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this._closeCreator();
    });

    /* Submit creator */
    this._form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._handleCreate();
    });

    /* Keyboard navigation on the agent grid */
    this._gridEl.addEventListener('keydown', (e) => this._handleGridKeydown(e));

    /* Event delegation for card clicks */
    this._gridEl.addEventListener('click', (e) => this._handleGridClick(e));

    /* Delete confirmation dialog */
    this._confirmCancel.addEventListener('click', () => this._closeConfirm());
    this._confirmDelete.addEventListener('click', () => this._executeDelete());
    this._confirmOverlay.addEventListener('click', (e) => {
      if (e.target === this._confirmOverlay) this._closeConfirm();
    });

    /* Escape key closes overlays */
    this.shadowRoot.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this._confirmOverlay.classList.contains('open')) {
          this._closeConfirm();
        } else if (this._overlay.classList.contains('open')) {
          this._closeCreator();
        }
      }
    });

    /* Global keyboard shortcuts: Cmd/Ctrl + 1-9 for quick switch */
    document.addEventListener('keydown', this._onGlobalKeydown);

    /* Compact mode toggle via media query */
    this._mql = window.matchMedia('(max-width: 640px)');
    this._handleMobileChange = (e) => {
      if (this.hasAttribute('auto-compact')) {
        if (e.matches) this.setAttribute('compact', '');
        else this.removeAttribute('compact');
      }
    };
    this._mql.addEventListener('change', this._handleMobileChange);
    this._handleMobileChange(this._mql);

    /* Fetch token from localStorage */
    this._token = localStorage.getItem('scratchy_token');

    /* Load agents */
    this.loadAgents();
  }

  disconnectedCallback() {
    if (this._mql) {
      this._mql.removeEventListener('change', this._handleMobileChange);
    }
    document.removeEventListener('keydown', this._onGlobalKeydown);
  }

  /* ═══ Public Properties ═══════════════════════════════════ */

  set activeAgentId(id) {
    this._activeAgentId = id;
    this._renderList();
  }

  get activeAgentId() {
    return this._activeAgentId;
  }

  static get templates() {
    return AGENT_TEMPLATES;
  }

  /* ═══ API Methods ═════════════════════════════════════════ */

  async loadAgents() {
    try {
      const res = await fetch('/api/agents', {
        headers: this._token ? { 'Authorization': `Bearer ${this._token}` } : {},
      });
      if (res.ok) {
        this._agents = await res.json();
      } else {
        this._agents = [];
      }
    } catch {
      this._agents = [];
    }
    this._applyFilter();
    this._renderList();
  }

  /* ═══ Filtering ═══════════════════════════════════════════ */

  _applyFilter() {
    if (!this._searchQuery) {
      this._filtered = [...this._agents];
    } else {
      const q = this._searchQuery;
      this._filtered = this._agents.filter(a => {
        const haystack = [
          a.name, a.role, a.description, a.model,
          ...(a.capabilities || []),
          ...(a.surfaces || []),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    /* Show/hide search bar based on total agent count */
    if (this._agents.length > 6) {
      this._searchBar.classList.add('visible');
    } else {
      this._searchBar.classList.remove('visible');
      this._searchQuery = '';
      this._searchInput.value = '';
      this._filtered = [...this._agents];
    }
  }

  /* ═══ Rendering ═══════════════════════════════════════════ */

  _renderList() {
    this._gridEl.innerHTML = '';

    if (this._agents.length === 0) {
      // Show template agents as defaults when no agents configured
      this._agents = AGENT_TEMPLATES.map((t, i) => ({
        id: `template-${t.id}`,
        name: t.name,
        role: t.role,
        description: t.description || '',
        model: t.model || 'auto',
        enabled: true,
        status: i === 0 ? 'online' : 'offline',
        surfaces: t.surfaces || [],
        capabilities: t.capabilities || [],
      }));
      this._filtered = [...this._agents];
      if (!this._activeAgentId) {
        this._activeAgentId = this._agents[0].id;
      }
      // Fall through to render the cards normally
    }

    if (this._filtered.length === 0 && this._searchQuery) {
      this._gridEl.innerHTML = `<div class="no-results">No agents match \u201C${this._esc(this._searchQuery)}\u201D</div>`;
      this._focusedIndex = -1;
      return;
    }

    /* Render agent cards */
    for (let i = 0; i < this._filtered.length; i++) {
      const agent = this._filtered[i];
      const card = this._createCardEl(agent, i);
      this._gridEl.appendChild(card);
    }

    /* Add Agent button at bottom of rail */
    const addBtn = document.createElement('div');
    addBtn.className = 'agent-card add-card'
      + (this._focusedIndex === this._filtered.length ? ' focused' : '');
    addBtn.dataset.action = 'add';
    addBtn.setAttribute('role', 'option');
    addBtn.setAttribute('aria-label', 'Add new agent');
    addBtn.innerHTML = `<span class="add-icon">${SVG.plus}</span>`;
    this._gridEl.appendChild(addBtn);
  }

  _createCardEl(agent, index) {
    const isActive = agent.id === this._activeAgentId;
    const isFocused = index === this._focusedIndex;
    const color = this._getAvatarColor(agent.name || '');
    const initials = this._getInitials(agent.name || '?');
    const status = this._getStatus(agent);
    const role = agent.role || agent.model || '';
    const description = agent.description || '';
    const caps = this._getCapabilities(agent);
    const stats = agent.taskCount != null ? `${agent.taskCount} tasks this week` : '';
    /* Global index among all agents for shortcut numbering */
    const globalIndex = this._agents.indexOf(agent);
    const shortcutLabel = globalIndex >= 0 && globalIndex < 9
      ? `${MOD_SYMBOL}${globalIndex + 1}`
      : '';

    const card = document.createElement('div');
    card.className = 'agent-card'
      + (isActive ? ' active' : '')
      + (isFocused ? ' focused' : '');
    card.dataset.agentId = agent.id;
    card.dataset.index = String(index);
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', isActive ? 'true' : 'false');
    card.setAttribute('aria-label', `${agent.name || 'Agent'}${role ? ' \u2014 ' + role : ''}${isActive ? ', active' : ''}`);
    card.style.setProperty('animation-delay', `${index * 0.04}s`);

    const avatarContent = agent.avatar
      ? `<img src="${this._esc(agent.avatar)}" alt="" loading="lazy" />`
      : `<span>${this._esc(initials)}</span>`;

    /* Tooltip: "Name — Role" for CSS tooltip */
    const tooltipText = role
      ? `${agent.name || 'Agent'} \u2014 ${role}`
      : (agent.name || 'Agent');
    card.dataset.tooltip = tooltipText;

    card.innerHTML = `
      <div class="card-avatar" style="background:${color.bg};color:${color.fg}">
        ${avatarContent}
        <span class="status-dot ${status}" aria-label="${status}"></span>
      </div>
    `;

    return card;
  }

  /* ═══ Event Handlers ══════════════════════════════════════ */

  /** Delegated click handler on the grid */
  _handleGridClick(e) {
    const card = e.target.closest('.agent-card');
    if (!card) return;

    /* Delete button */
    if (e.target.closest('.delete-btn')) {
      const agent = this._filtered.find(a => a.id === card.dataset.agentId);
      if (agent) this._requestDelete(agent);
      return;
    }

    /* Edit button */
    if (e.target.closest('.edit-btn')) {
      const agent = this._filtered.find(a => a.id === card.dataset.agentId);
      if (agent) this._openCreator(agent);
      return;
    }

    /* Add card */
    if (card.dataset.action === 'add') {
      this._openCreator();
      return;
    }

    /* Regular card — switch agent */
    const agent = this._filtered.find(a => a.id === card.dataset.agentId);
    if (agent) this._switchAgent(agent);
  }

  /** Keyboard navigation within the grid */
  _handleGridKeydown(e) {
    /* Total items = filtered agents + 1 (Add card) */
    const count = this._filtered.length + 1;
    if (count <= 1 && this._filtered.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        this._focusedIndex = Math.min(this._focusedIndex + 1, count - 1);
        this._renderList();
        this._scrollToFocused();
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        this._focusedIndex = Math.max(this._focusedIndex - 1, 0);
        this._renderList();
        this._scrollToFocused();
        break;

      case 'Home':
        e.preventDefault();
        this._focusedIndex = 0;
        this._renderList();
        this._scrollToFocused();
        break;

      case 'End':
        e.preventDefault();
        this._focusedIndex = count - 1;
        this._renderList();
        this._scrollToFocused();
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this._focusedIndex >= 0) {
          if (this._focusedIndex < this._filtered.length) {
            this._switchAgent(this._filtered[this._focusedIndex]);
          } else {
            /* Add card focused */
            this._openCreator();
          }
        }
        break;

      case 'Delete':
      case 'Backspace':
        if (this._focusedIndex >= 0 && this._focusedIndex < this._filtered.length) {
          e.preventDefault();
          this._requestDelete(this._filtered[this._focusedIndex]);
        }
        break;
    }
  }

  /** Global Cmd/Ctrl + 1-9 for quick agent switching */
  _handleGlobalKeydown(e) {
    if (!this.isConnected) return;
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    if (!mod) return;
    const num = parseInt(e.key, 10);
    if (isNaN(num) || num < 1 || num > 9) return;
    const idx = num - 1;
    if (idx < this._agents.length) {
      e.preventDefault();
      this._switchAgent(this._agents[idx]);
    }
  }

  _scrollToFocused() {
    const cards = this._gridEl.querySelectorAll('.agent-card');
    if (this._focusedIndex >= 0 && this._focusedIndex < cards.length) {
      cards[this._focusedIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /* ═══ Agent Switching ═════════════════════════════════════ */

  _switchAgent(agent) {
    this._activeAgentId = agent.id;
    this._focusedIndex = this._filtered.findIndex(a => a.id === agent.id);
    this._renderList();

    this.dispatchEvent(new CustomEvent('agent-switch', {
      bubbles: true,
      composed: true,
      detail: { agentId: agent.id, agent },
    }));
  }

  /* ═══ Creator Form ════════════════════════════════════════ */

  _openCreator(editAgent = null) {
    this._form.reset();
    this._selectedSurfaces.clear();
    this._errorEl.textContent = '';
    this._editingAgentId = null;

    /* Reset advanced section to collapsed */
    this._advancedSection.classList.remove('expanded');
    this._advancedToggle.classList.remove('expanded');
    this._advancedToggle.innerHTML = '<span class="toggle-chevron">&#9654;</span>Show advanced options';

    /* Reset template summary */
    this._templateSummary.classList.remove('visible');

    /* Reset surface chip visuals */
    for (const chip of this._surfacesChips.querySelectorAll('.chip')) {
      chip.classList.remove('selected');
    }

    if (editAgent) {
      /* Edit mode — show all fields */
      this._editingAgentId = editAgent.id;
      this._creatorTitle.textContent = 'Edit Agent';
      this._saveBtn.textContent = 'Save';
      this._templatesSection.style.display = 'none';
      /* Expand advanced section in edit mode */
      this._advancedSection.classList.add('expanded');
      this._advancedToggle.classList.add('expanded');
      this._advancedToggle.innerHTML = '<span class="toggle-chevron">&#9654;</span>Hide advanced options';

      this.shadowRoot.getElementById('agent-name').value = editAgent.name || '';
      this.shadowRoot.getElementById('agent-role').value = editAgent.role || '';
      this.shadowRoot.getElementById('agent-description').value = editAgent.description || '';
      this.shadowRoot.getElementById('agent-avatar').value = editAgent.avatar || '';
      this.shadowRoot.getElementById('agent-prompt').value = editAgent.systemPrompt || '';
      this._modelSelect.value = editAgent.model || 'sonnet';
      this._tempSlider.value = editAgent.temperature ?? 0.7;
      this._tempValue.textContent = this._tempSlider.value;
      this._enabledToggle.checked = editAgent.enabled !== false && editAgent.enabled !== 0;

      /* Surfaces */
      const surfaces = Array.isArray(editAgent.surfaces) ? editAgent.surfaces : [];
      for (const s of surfaces) {
        this._selectedSurfaces.add(s);
        const chip = this._surfacesChips.querySelector(`[data-surface="${s}"]`);
        if (chip) chip.classList.add('selected');
      }

      /* MCP servers */
      const mcpServers = Array.isArray(editAgent.mcpServers) ? editAgent.mcpServers : [];
      this._mcpInput.value = mcpServers.map(s => s.command || '').filter(Boolean).join('\n');
    } else {
      /* Create mode */
      this._creatorTitle.textContent = 'Create Agent';
      this._saveBtn.textContent = 'Create';
      this._templatesSection.style.display = '';
      this._tempValue.textContent = '0.7';
      this._enabledToggle.checked = true;
    }

    // Temporarily disable sidebar backdrop-filter so position:fixed overlay
    // escapes the containing block (backdrop-filter creates one)
    const sidebar = this.closest('.app-sidebar');
    if (sidebar) {
      sidebar.style.backdropFilter = 'none';
      sidebar.style.webkitBackdropFilter = 'none';
      sidebar.style.overflow = 'visible';
    }
    this._overlay.classList.add('open');
    setTimeout(() => this.shadowRoot.getElementById('agent-name')?.focus(), 60);
  }

  _closeCreator() {
    this._overlay.classList.remove('open');
    this._editingAgentId = null;
    // Restore sidebar backdrop-filter
    const sidebar = this.closest('.app-sidebar');
    if (sidebar) {
      sidebar.style.backdropFilter = '';
      sidebar.style.webkitBackdropFilter = '';
      sidebar.style.overflow = '';
    }
  }

  _applyTemplate(template) {
    this.shadowRoot.getElementById('agent-name').value = template.name;
    this.shadowRoot.getElementById('agent-role').value = template.role || '';
    this.shadowRoot.getElementById('agent-description').value = template.description || '';
    this.shadowRoot.getElementById('agent-prompt').value = template.systemPrompt;
    this._modelSelect.value = template.model;
    this._tempSlider.value = template.temperature;
    this._tempValue.textContent = template.temperature;

    /* Surfaces */
    this._selectedSurfaces.clear();
    for (const chip of this._surfacesChips.querySelectorAll('.chip')) {
      chip.classList.remove('selected');
    }
    for (const s of template.surfaces) {
      this._selectedSurfaces.add(s);
      const chip = this._surfacesChips.querySelector(`[data-surface="${s}"]`);
      if (chip) chip.classList.add('selected');
    }

    /* MCP servers */
    this._mcpInput.value = (template.mcpServers || []).map(s => s.command || '').filter(Boolean).join('\n');

    /* Show template summary (don't expand advanced) */
    const surfaceNames = template.surfaces.length > 0 ? template.surfaces.join(', ') : 'none';
    this._summaryName.textContent = `${template.name} — ${template.role}`;
    this._summaryDetail.textContent = `${template.description} · Temp ${template.temperature} · Surfaces: ${surfaceNames}`;
    this._templateSummary.classList.add('visible');

    /* Keep advanced collapsed */
    this._advancedSection.classList.remove('expanded');
    this._advancedToggle.classList.remove('expanded');
    this._advancedToggle.innerHTML = '<span class="toggle-chevron">&#9654;</span>Show advanced options';
  }

  _validateForm() {
    const errors = [];
    const nameInput = this.shadowRoot.getElementById('agent-name');
    const name = nameInput.value.trim();

    if (!name) {
      errors.push('Name is required');
      nameInput.classList.add('invalid');
    } else {
      nameInput.classList.remove('invalid');
    }

    const temp = parseFloat(this._tempSlider.value);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      errors.push('Temperature must be between 0.0 and 2.0');
    }

    return errors;
  }

  async _handleCreate() {
    const errors = this._validateForm();
    if (errors.length > 0) {
      this._errorEl.textContent = errors[0];
      return;
    }

    const name = this.shadowRoot.getElementById('agent-name').value.trim();
    const role = this.shadowRoot.getElementById('agent-role').value.trim() || null;
    const description = this.shadowRoot.getElementById('agent-description').value.trim() || null;
    const systemPrompt = this.shadowRoot.getElementById('agent-prompt').value.trim();
    const model = this._modelSelect.value;
    const temperature = parseFloat(this._tempSlider.value);
    const avatar = this.shadowRoot.getElementById('agent-avatar').value.trim() || null;
    const surfaces = [...this._selectedSurfaces];
    const enabled = this._enabledToggle.checked;

    /* Parse MCP servers */
    const mcpLines = this._mcpInput.value.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const mcpServers = mcpLines.map(cmd => ({ command: cmd }));

    const saveBtn = this._saveBtn;
    saveBtn.disabled = true;
    this._errorEl.textContent = '';

    try {
      const isEdit = !!this._editingAgentId;
      const url = isEdit ? `/api/agents/${this._editingAgentId}` : '/api/agents';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this._token ? { 'Authorization': `Bearer ${this._token}` } : {}),
        },
        body: JSON.stringify({
          name, role, description, systemPrompt, model,
          temperature, avatar, surfaces, mcpServers, enabled,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        this._errorEl.textContent = data.error || `Failed to ${isEdit ? 'update' : 'create'} agent`;
        return;
      }

      this._closeCreator();
      await this.loadAgents();

      if (!isEdit) {
        this._switchAgent(data);
        this.dispatchEvent(new CustomEvent('agent-create', {
          bubbles: true, composed: true,
          detail: { agent: data },
        }));
      } else {
        this.dispatchEvent(new CustomEvent('agent-edit', {
          bubbles: true, composed: true,
          detail: { agentId: this._editingAgentId, agent: data },
        }));
      }
    } catch {
      this._errorEl.textContent = 'Network error';
    } finally {
      saveBtn.disabled = false;
    }
  }

  /* ═══ Delete Confirmation ═════════════════════════════════ */

  _requestDelete(agent) {
    this._pendingDeleteAgent = agent;
    this._confirmMsg.textContent = `Are you sure you want to delete \u201C${agent.name}\u201D? This cannot be undone.`;
    this._confirmOverlay.classList.add('open');
    this._confirmDelete.focus();
  }

  _closeConfirm() {
    this._confirmOverlay.classList.remove('open');
    this._pendingDeleteAgent = null;
  }

  async _executeDelete() {
    const agent = this._pendingDeleteAgent;
    if (!agent) return;

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
        headers: this._token ? { 'Authorization': `Bearer ${this._token}` } : {},
      });

      if (res.ok) {
        this._closeConfirm();

        if (this._activeAgentId === agent.id) {
          this._activeAgentId = null;
          this.dispatchEvent(new CustomEvent('agent-switch', {
            bubbles: true, composed: true,
            detail: { agentId: null, agent: null },
          }));
        }

        this.dispatchEvent(new CustomEvent('agent-delete', {
          bubbles: true, composed: true,
          detail: { agentId: agent.id },
        }));

        await this.loadAgents();
      } else {
        const data = await res.json().catch(() => ({}));
        this._confirmMsg.textContent = data.error || 'Failed to delete agent';
      }
    } catch {
      this._confirmMsg.textContent = 'Network error';
    }
  }

  /* ═══ Utilities ═══════════════════════════════════════════ */

  /** Deterministic avatar color from agent name */
  _getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  }

  /** First 1-2 initials from a name */
  _getInitials(name) {
    return (name || '?')
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0] || '')
      .join('')
      .toUpperCase();
  }

  /** Derive agent status: online | busy | offline */
  _getStatus(agent) {
    if (agent.status) return agent.status;
    if (agent.enabled === false || agent.enabled === 0) return 'offline';
    return 'online';
  }

  /** Derive capability labels from surfaces + capabilities array */
  _getCapabilities(agent) {
    const caps = new Set();
    if (Array.isArray(agent.capabilities)) {
      for (const c of agent.capabilities) caps.add(c);
    }
    if (Array.isArray(agent.surfaces)) {
      for (const s of agent.surfaces) caps.add(s);
    }
    /* Capitalize first letter */
    return [...caps].slice(0, 5).map(c =>
      c.charAt(0).toUpperCase() + c.slice(1)
    );
  }

  /** HTML-escape a string */
  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

customElements.define('sc-agent-switcher', ScAgentSwitcher);
