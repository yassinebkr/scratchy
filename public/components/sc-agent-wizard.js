// sc-agent-wizard.js — Scratchy v2 Agent Creation Wizard
// Complete rewrite — standalone Shadow DOM web component

/* ───────────────────────── SVG Icons (18×18) ───────────────────────── */

const SVG_CODE = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 4.5L2.5 9L6.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 4.5L15.5 9L11.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SVG_PALETTE = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 2C5.13 2 2 5.13 2 9C2 12.87 5.13 16 9 16C9.55 16 10 15.55 10 15C10 14.76 9.89 14.55 9.73 14.39C9.57 14.24 9.46 14.03 9.46 13.78C9.46 13.23 9.91 12.78 10.46 12.78H11.67C13.99 12.78 15.89 10.88 15.89 8.56C15.89 4.94 12.8 2 9 2Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="5.5" cy="8" r="1" fill="currentColor"/><circle cx="7.5" cy="5.5" r="1" fill="currentColor"/><circle cx="10.5" cy="5.5" r="1" fill="currentColor"/><circle cx="12.5" cy="8" r="1" fill="currentColor"/></svg>`;

const SVG_SEARCH = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/><path d="M12 12L15.5 15.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const SVG_PEN = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.3 2.7a1.5 1.5 0 0 1 2.1 0l0 0a1.5 1.5 0 0 1 0 2.1L6.5 13.7L2.5 15.5L4.3 11.5L13.3 2.7Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M11.5 4.5L13.5 6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const SVG_PLUS = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3.5V14.5M3.5 9H14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const SVG_CHECK = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 9.5L7.5 13L14 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SVG_CLOSE = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

const SVG_CHEVRON_DOWN = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.5 6.75L9 11.25L13.5 6.75" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SVG_GEAR = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="2.5" stroke="currentColor" stroke-width="1.4"/><path d="M9 1.5L9.9 3.3a1 1 0 0 0 1 .5L12.8 3.4 12.1 5.3a1 1 0 0 0 .2 1l1.3 1.3-1.8.7a1 1 0 0 0-.6.9L11.5 11l-1.8-.9a1 1 0 0 0-1 0L6.5 11l-.3-1.8a1 1 0 0 0-.6-.9L3.8 7.6l1.3-1.3a1 1 0 0 0 .2-1L4.9 3.4 6.8 3.8a1 1 0 0 0 1-.5L9 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;

const SVG_GLOBE = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.4"/><ellipse cx="9" cy="9" rx="3" ry="6.5" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 9H15.5" stroke="currentColor" stroke-width="1.2"/><path d="M3.5 5.5H14.5" stroke="currentColor" stroke-width="1"/><path d="M3.5 12.5H14.5" stroke="currentColor" stroke-width="1"/></svg>`;

const SVG_FILE = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 2.5H10.5L14 6V15.5H5V2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M10.5 2.5V6H14" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

const SVG_TERMINAL = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7.5L8 9.5L5.5 11.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.5 11.5H12.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const SVG_IMAGE = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="3" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><circle cx="6.5" cy="7" r="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M2.5 13L6 9.5L8.5 12L11 9L15.5 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const SVG_BRAIN = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 15V9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M6 4.5C4.3 4.5 3 5.8 3 7.3C3 8.1 3.3 8.8 3.8 9.3C3.3 9.8 3 10.5 3 11.3C3 12.8 4.3 14.3 6 14.3C7 14.3 8 13.8 9 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M12 4.5C13.7 4.5 15 5.8 15 7.3C15 8.1 14.7 8.8 14.2 9.3C14.7 9.8 15 10.5 15 11.3C15 12.8 13.7 14.3 12 14.3C11 14.3 10 13.8 9 13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M6 4.5C6 3.1 7.3 2 9 2C10.7 2 12 3.1 12 4.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const SVG_SPARKLE = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 2L10.3 6.7L15 8L10.3 9.3L9 14L7.7 9.3L3 8L7.7 6.7L9 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M14 12L14.5 13.5L16 14L14.5 14.5L14 16L13.5 14.5L12 14L13.5 13.5L14 12Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/></svg>`;

const SVG_ARROW_LEFT = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.5 4.5L6 9L10.5 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* ───────────────────────── Data ───────────────────────── */

const PALETTE = [
  { bg: '#F9A602', fg: '#0d0b07' },
  { bg: '#22c55e', fg: '#0d0b07' },
  { bg: '#3b82f6', fg: '#ffffff' },
  { bg: '#a855f7', fg: '#ffffff' },
  { bg: '#ef4444', fg: '#ffffff' },
  { bg: '#06b6d4', fg: '#0d0b07' },
  { bg: '#f97316', fg: '#0d0b07' },
  { bg: '#ec4899', fg: '#ffffff' },
  { bg: '#84cc16', fg: '#0d0b07' },
  { bg: '#6366f1', fg: '#ffffff' },
];

function hashName(name) {
  let h = 0;
  const s = (name || '').toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % PALETTE.length;
}

function getAvatarColor(name) {
  return PALETTE[hashName(name)];
}

function avatarLetters(name) {
  const n = (name || '').trim();
  if (!n) return '??';
  const parts = n.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

const TEMPLATES = [
  { id: 'atlas', name: 'Atlas', role: 'Code Assistant', color: '#3b82f6', icon: SVG_CODE, model: 'sonnet', surfaces: ['terminal', 'editor'], temperature: 0.3, systemPrompt: 'You are Atlas, a skilled code assistant. Help users write, debug, and refactor code with precision and clarity.', capabilities: { webSearch: false, fileAccess: true, codeExecution: true, imageGen: false, canvas: false, memory: true } },
  { id: 'iris', name: 'Iris', role: 'Designer', color: '#a855f7', icon: SVG_PALETTE, model: 'sonnet', surfaces: ['canvas'], temperature: 0.7, systemPrompt: 'You are Iris, a creative designer. Help users with UI/UX design, visual concepts, and design system thinking.', capabilities: { webSearch: true, fileAccess: true, codeExecution: false, imageGen: true, canvas: true, memory: false } },
  { id: 'nova', name: 'Nova', role: 'Researcher', color: '#22c55e', icon: SVG_SEARCH, model: 'opus', surfaces: ['search'], temperature: 0.4, systemPrompt: 'You are Nova, a thorough researcher. Investigate topics deeply, synthesize findings, and present clear analyses.', capabilities: { webSearch: true, fileAccess: true, codeExecution: false, imageGen: false, canvas: false, memory: true } },
  { id: 'echo', name: 'Echo', role: 'Writer', color: '#f97316', icon: SVG_PEN, model: 'sonnet', surfaces: [], temperature: 0.8, systemPrompt: 'You are Echo, a versatile writer. Help users craft compelling prose, edit text, and develop their writing.', capabilities: { webSearch: false, fileAccess: true, codeExecution: false, imageGen: false, canvas: false, memory: true } },
  { id: 'custom', name: 'Custom', role: 'Build from scratch', color: '#8a7e6a', icon: SVG_PLUS, model: 'sonnet', surfaces: [], temperature: 0.5, systemPrompt: '', capabilities: { webSearch: false, fileAccess: false, codeExecution: false, imageGen: false, canvas: false, memory: false } },
];

const CAPABILITIES = [
  { key: 'webSearch', label: 'Web Search', icon: SVG_GLOBE },
  { key: 'fileAccess', label: 'File Access', icon: SVG_FILE },
  { key: 'codeExecution', label: 'Code Execution', icon: SVG_TERMINAL },
  { key: 'imageGen', label: 'Image Gen', icon: SVG_IMAGE },
  { key: 'canvas', label: 'Canvas / GenUI', icon: SVG_SPARKLE },
  { key: 'memory', label: 'Memory', icon: SVG_BRAIN },
];

const MODELS = [
  { id: 'sonnet', name: 'Sonnet', desc: 'Fast & capable' },
  { id: 'opus', name: 'Opus', desc: 'Deep reasoning' },
  { id: 'haiku', name: 'Haiku', desc: 'Lightweight' },
  { id: 'custom', name: 'Custom', desc: 'Your endpoint' },
];

/* ───────────────────────── Styles ───────────────────────── */

const STYLES = /* css */ `
  :host { display: contents; }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .backdrop {
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; visibility: hidden;
    transition: opacity 200ms ease, visibility 200ms ease;
    font-family: 'Geist', system-ui, -apple-system, sans-serif;
  }
  .backdrop.open { opacity: 1; visibility: visible; }

  .dialog {
    position: relative;
    width: 640px; max-width: calc(100vw - 32px);
    max-height: calc(100vh - 64px);
    background: rgba(26,22,16,0.92);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(249,166,2,0.08);
    border-radius: 12px;
    display: flex; flex-direction: column;
    overflow: hidden;
    transform: scale(0.97); opacity: 0;
    transition: transform 200ms ease, opacity 200ms ease;
    box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(249,166,2,0.04);
  }
  .backdrop.open .dialog { transform: scale(1); opacity: 1; }

  @media (prefers-reduced-motion: reduce) {
    .backdrop, .dialog, .template-card, .cap-chip, .model-card,
    .btn, .step-dot, .preview-card, .close-btn, .disclosure-btn {
      transition: none !important;
      animation: none !important;
    }
  }

  /* Header */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(249,166,2,0.06);
  }
  .header-title {
    font-size: 16px; font-weight: 600;
    color: #f0ead6;
    letter-spacing: -0.01em;
  }
  .header-step {
    font-size: 12px; color: #8a7e6a;
    font-weight: 500;
  }
  .close-btn {
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    border: none; background: transparent;
    color: #5a5040; border-radius: 6px;
    cursor: pointer;
    transition: color 150ms ease, background 150ms ease;
  }
  .close-btn:hover { color: #f0ead6; background: rgba(249,166,2,0.08); }
  .close-btn:focus-visible {
    outline: 2px solid #F9A602; outline-offset: 2px;
  }

  /* Body */
  .body {
    flex: 1; overflow-y: auto; overflow-x: hidden;
    padding: 20px 24px;
    scrollbar-width: thin;
    scrollbar-color: rgba(249,166,2,0.15) transparent;
  }
  .body::-webkit-scrollbar { width: 6px; }
  .body::-webkit-scrollbar-track { background: transparent; }
  .body::-webkit-scrollbar-thumb { background: rgba(249,166,2,0.15); border-radius: 3px; }

  .step-section { display: none; }
  .step-section.active { display: block; }

  /* Step 1: Template Cards */
  .section-label {
    font-size: 12px; font-weight: 600;
    color: #8a7e6a; text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 12px;
  }

  .template-grid {
    display: flex; flex-direction: column; gap: 6px;
  }

  .template-card {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px;
    background: rgba(26,22,16,0.5);
    border: 1px solid rgba(249,166,2,0.06);
    border-left: 3px solid var(--card-color, #8a7e6a);
    border-radius: 8px;
    cursor: pointer;
    transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    position: relative;
    outline: none;
  }
  .template-card:hover {
    background: rgba(37,32,21,0.7);
    border-color: rgba(249,166,2,0.12);
    border-left-color: var(--card-color, #8a7e6a);
  }
  .template-card:focus-visible {
    outline: 2px solid #F9A602; outline-offset: 2px;
  }
  .template-card.selected {
    background: rgba(249,166,2,0.06);
    border-color: rgba(249,166,2,0.18);
    border-left-color: var(--card-color, #F9A602);
    box-shadow: 0 0 16px rgba(249,166,2,0.08);
  }

  .template-icon {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px;
    background: rgba(255,255,255,0.04);
    color: var(--card-color, #8a7e6a);
    flex-shrink: 0;
  }

  .template-info { flex: 1; min-width: 0; }
  .template-name {
    font-size: 14px; font-weight: 600; color: #f0ead6;
    line-height: 1.3;
  }
  .template-role {
    font-size: 12px; color: #8a7e6a;
    line-height: 1.4; margin-top: 1px;
  }

  .template-check {
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    background: #F9A602; color: #0d0b07;
    opacity: 0; transform: scale(0.5);
    transition: opacity 150ms ease, transform 150ms ease;
    flex-shrink: 0;
  }
  .template-card.selected .template-check {
    opacity: 1; transform: scale(1);
  }

  /* Step 2: Capabilities */
  .cap-section { margin-bottom: 24px; }

  .cap-grid {
    display: flex; flex-wrap: wrap; gap: 8px;
  }

  .cap-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px;
    font-size: 13px; font-weight: 500;
    color: #8a7e6a;
    background: rgba(26,22,16,0.5);
    border: 1px solid rgba(249,166,2,0.06);
    border-radius: 20px;
    cursor: pointer;
    transition: all 150ms ease;
    user-select: none;
    outline: none;
    font-family: inherit;
  }
  .cap-chip:hover {
    background: rgba(37,32,21,0.7);
    color: #f0ead6;
    border-color: rgba(249,166,2,0.12);
  }
  .cap-chip:focus-visible {
    outline: 2px solid #F9A602; outline-offset: 2px;
  }
  .cap-chip.active {
    background: rgba(249,166,2,0.1);
    color: #F9A602;
    border-color: rgba(249,166,2,0.25);
  }
  .cap-chip svg { width: 14px; height: 14px; }

  /* Step 2: Model Selector */
  .model-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
  }

  .model-card {
    padding: 12px 14px;
    background: rgba(26,22,16,0.5);
    border: 1px solid rgba(249,166,2,0.06);
    border-radius: 8px;
    cursor: pointer;
    transition: all 150ms ease;
    outline: none;
    text-align: left;
    font-family: inherit;
  }
  .model-card:hover {
    background: rgba(37,32,21,0.7);
    border-color: rgba(249,166,2,0.12);
  }
  .model-card:focus-visible {
    outline: 2px solid #F9A602; outline-offset: 2px;
  }
  .model-card.selected {
    background: rgba(249,166,2,0.06);
    border-color: rgba(249,166,2,0.2);
  }
  .model-name {
    font-size: 14px; font-weight: 600; color: #f0ead6;
    display: flex; align-items: center; gap: 6px;
  }
  .model-name .radio {
    width: 14px; height: 14px;
    border-radius: 50%;
    border: 2px solid #5a5040;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 150ms ease;
    flex-shrink: 0;
  }
  .model-name .radio-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #F9A602;
    opacity: 0; transform: scale(0);
    transition: opacity 150ms ease, transform 150ms ease;
  }
  .model-card.selected .radio { border-color: #F9A602; }
  .model-card.selected .radio-dot { opacity: 1; transform: scale(1); }
  .model-desc {
    font-size: 12px; color: #8a7e6a;
    margin-top: 2px; margin-left: 20px;
  }

  /* Advanced / MCP */
  .disclosure-btn {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 0; margin-top: 8px;
    background: none; border: none;
    color: #5a5040; font-size: 12px;
    font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 150ms ease;
    font-family: inherit;
    outline: none;
  }
  .disclosure-btn:hover { color: #8a7e6a; }
  .disclosure-btn:focus-visible { outline: 2px solid #F9A602; outline-offset: 2px; }
  .disclosure-btn svg {
    width: 14px; height: 14px;
    transition: transform 200ms ease;
  }
  .disclosure-btn.expanded svg { transform: rotate(180deg); }

  .mcp-panel {
    display: none; margin-top: 8px;
  }
  .mcp-panel.open { display: block; }

  /* Step 3: Customize */
  .customize-layout {
    display: flex; gap: 24px;
  }
  .customize-fields { flex: 3; min-width: 0; }
  .customize-preview { flex: 2; min-width: 0; }

  .field-group { margin-bottom: 16px; }
  .field-label {
    display: block; font-size: 12px; font-weight: 600;
    color: #8a7e6a; margin-bottom: 6px;
    text-transform: uppercase; letter-spacing: 0.04em;
  }

  .field-input {
    width: 100%; padding: 10px 12px;
    font-size: 14px; color: #f0ead6;
    background: rgba(13,11,7,0.6);
    border: 1px solid rgba(249,166,2,0.08);
    border-radius: 6px;
    font-family: 'Geist', system-ui, sans-serif;
    transition: border-color 150ms ease;
    outline: none;
  }
  .field-input:hover { border-color: rgba(249,166,2,0.15); }
  .field-input:focus { border-color: rgba(249,166,2,0.35); }
  .field-input::placeholder { color: #5a5040; }

  .field-textarea {
    width: 100%; padding: 10px 12px;
    font-size: 13px; color: #f0ead6;
    background: rgba(13,11,7,0.6);
    border: 1px solid rgba(249,166,2,0.08);
    border-radius: 6px;
    font-family: 'Geist Mono', monospace;
    resize: vertical; min-height: 100px; max-height: 240px;
    line-height: 1.5;
    transition: border-color 150ms ease;
    outline: none;
  }
  .field-textarea:hover { border-color: rgba(249,166,2,0.15); }
  .field-textarea:focus { border-color: rgba(249,166,2,0.35); }
  .field-textarea::placeholder { color: #5a5040; }

  /* Slider */
  .slider-row {
    display: flex; align-items: center; gap: 12px;
  }
  .slider-track {
    flex: 1; position: relative; height: 32px;
    display: flex; align-items: center;
  }
  .slider-input {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px;
    background: rgba(249,166,2,0.12);
    border-radius: 2px; outline: none;
    cursor: pointer;
  }
  .slider-input::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 16px; height: 16px;
    background: #F9A602; border-radius: 50%;
    border: none; cursor: pointer;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    transition: transform 100ms ease;
  }
  .slider-input::-webkit-slider-thumb:hover { transform: scale(1.15); }
  .slider-input::-moz-range-thumb {
    width: 16px; height: 16px;
    background: #F9A602; border-radius: 50%;
    border: none; cursor: pointer;
  }
  .slider-value {
    font-size: 13px; font-weight: 600; color: #f0ead6;
    font-family: 'Geist Mono', monospace;
    min-width: 28px; text-align: right;
  }

  /* Live Preview */
  .preview-card {
    background: rgba(13,11,7,0.5);
    border: 1px solid rgba(249,166,2,0.08);
    border-radius: 10px;
    padding: 24px 20px;
    display: flex; flex-direction: column;
    align-items: center; gap: 12px;
    position: sticky; top: 0;
  }
  .preview-avatar {
    width: 56px; height: 56px;
    border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 700;
    letter-spacing: 0.02em;
    font-family: 'Geist', system-ui, sans-serif;
  }
  .preview-name {
    font-size: 16px; font-weight: 700; color: #f0ead6;
    text-align: center; line-height: 1.3;
  }
  .preview-role {
    font-size: 13px; color: #8a7e6a;
    text-align: center; margin-top: -4px;
  }
  .preview-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 10px; border-radius: 12px;
    font-size: 11px; font-weight: 600;
    background: rgba(249,166,2,0.1);
    color: #F9A602;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .preview-caps {
    display: flex; flex-wrap: wrap; gap: 4px;
    justify-content: center; margin-top: 4px;
  }
  .preview-cap-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(249,166,2,0.3);
  }
  .preview-cap-dot.active { background: #F9A602; }

  /* Footer */
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 24px;
    border-top: 1px solid rgba(249,166,2,0.06);
  }

  .step-dots {
    display: flex; gap: 8px;
  }
  .step-dot {
    width: 8px; height: 8px; border-radius: 50%;
    border: 1.5px solid #5a5040;
    background: transparent;
    transition: all 150ms ease;
  }
  .step-dot.active {
    background: #F9A602; border-color: #F9A602;
  }
  .step-dot.completed {
    background: rgba(249,166,2,0.4); border-color: rgba(249,166,2,0.4);
  }

  .footer-actions {
    display: flex; gap: 8px;
  }

  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 16px;
    font-size: 13px; font-weight: 600;
    font-family: inherit;
    border: 1px solid rgba(249,166,2,0.1);
    border-radius: 6px;
    background: transparent;
    color: #8a7e6a;
    cursor: pointer;
    transition: all 150ms ease;
    outline: none;
    white-space: nowrap;
  }
  .btn:hover {
    color: #f0ead6;
    border-color: rgba(249,166,2,0.2);
    background: rgba(249,166,2,0.05);
  }
  .btn:focus-visible {
    outline: 2px solid #F9A602; outline-offset: 2px;
  }
  .btn:active { transform: scale(0.97); }

  .btn-primary {
    background: #F9A602;
    color: #0d0b07;
    border-color: #F9A602;
  }
  .btn-primary:hover {
    background: #DAA520;
    border-color: #DAA520;
    color: #0d0b07;
  }
  .btn-primary:active { transform: scale(0.97); }

  .btn svg { width: 14px; height: 14px; }

  /* Mobile */
  @media (max-width: 640px) {
    .dialog {
      width: 100vw; max-width: 100vw;
      height: 100vh; max-height: 100vh;
      border-radius: 0;
    }
    .body { padding: 16px; }
    .header { padding: 16px 16px 12px; }
    .footer { padding: 12px 16px; }
    .customize-layout { flex-direction: column; }
    .customize-preview { order: -1; }
    .model-grid { grid-template-columns: 1fr; }
  }
`;

/* ───────────────────────── Component ───────────────────────── */

class ScAgentWizard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._step = 1;
    this._selectedTemplate = null;
    this._capabilities = {
      webSearch: false, fileAccess: false, codeExecution: false,
      imageGen: false, canvas: false, memory: false,
    };
    this._model = 'sonnet';
    this._name = '';
    this._role = '';
    this._systemPrompt = '';
    this._temperature = 0.5;
    this._mcpServers = '';
    this._surfaces = [];
    this._color = '#8a7e6a';
    this._mcpOpen = false;
    this._isOpen = false;
    this._focusTrapBound = this._focusTrap.bind(this);
    this._keydownBound = this._onKeydown.bind(this);
  }

  static get observedAttributes() { return ['open']; }

  attributeChangedCallback(name, old, val) {
    if (name === 'open') {
      if (val !== null) this._show();
      else this._hide();
    }
  }

  get open() { return this._isOpen; }
  set open(v) {
    if (v) this.setAttribute('open', '');
    else this.removeAttribute('open');
  }

  connectedCallback() {
    this._render();
    this._bindEvents();
  }

  disconnectedCallback() {
    document.removeEventListener('keydown', this._keydownBound);
  }

  /* ── Lifecycle ── */

  _show() {
    if (this._isOpen) return;
    this._isOpen = true;
    this._step = 1;
    this._selectedTemplate = null;
    this._capabilities = { webSearch: false, fileAccess: false, codeExecution: false, imageGen: false, canvas: false, memory: false };
    this._model = 'sonnet';
    this._name = '';
    this._role = '';
    this._systemPrompt = '';
    this._temperature = 0.5;
    this._mcpServers = '';
    this._surfaces = [];
    this._color = '#8a7e6a';
    this._mcpOpen = false;
    this._renderContent();
    requestAnimationFrame(() => {
      const bd = this.shadowRoot.querySelector('.backdrop');
      if (bd) bd.classList.add('open');
    });
    document.addEventListener('keydown', this._keydownBound);
    this._previousFocus = document.activeElement;
    setTimeout(() => {
      const first = this.shadowRoot.querySelector('.template-card, .close-btn');
      if (first) first.focus();
    }, 100);
  }

  _hide() {
    if (!this._isOpen) return;
    this._isOpen = false;
    const bd = this.shadowRoot.querySelector('.backdrop');
    if (bd) bd.classList.remove('open');
    document.removeEventListener('keydown', this._keydownBound);
    if (this._previousFocus) {
      try { this._previousFocus.focus(); } catch (e) { /* noop */ }
    }
  }

  _cancel() {
    this.dispatchEvent(new CustomEvent('wizard-cancel', { bubbles: true, composed: true }));
    this.open = false;
  }

  _complete() {
    const agent = {
      name: this._name || 'Untitled',
      role: this._role,
      systemPrompt: this._systemPrompt,
      model: this._model,
      temperature: this._temperature,
      capabilities: { ...this._capabilities },
      mcpServers: this._mcpServers.split('\n').map(s => s.trim()).filter(Boolean),
      surfaces: [...this._surfaces],
      color: this._color,
    };
    this.dispatchEvent(new CustomEvent('wizard-complete', {
      bubbles: true, composed: true,
      detail: { agent },
    }));
    this.open = false;
  }

  /* ── Keyboard ── */

  _onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this._cancel();
      return;
    }
    if (e.key === 'Tab') {
      this._focusTrap(e);
    }
    // Arrow keys for template cards
    if (this._step === 1 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const cards = Array.from(this.shadowRoot.querySelectorAll('.template-card'));
      const focused = this.shadowRoot.activeElement;
      const idx = cards.indexOf(focused);
      if (idx === -1) return;
      e.preventDefault();
      let next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (next < 0) next = cards.length - 1;
      if (next >= cards.length) next = 0;
      cards[next].focus();
    }
  }

  _focusTrap(e) {
    const dialog = this.shadowRoot.querySelector('.dialog');
    if (!dialog) return;
    const focusable = dialog.querySelectorAll(
      'button, [tabindex]:not([tabindex="-1"]), input, textarea, select, [href]'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && this.shadowRoot.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && this.shadowRoot.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ── Render ── */

  _render() {
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><div class="backdrop" part="backdrop"><div class="dialog" role="dialog" aria-modal="true" aria-label="Create Agent"></div></div>`;
    this._bindEvents();
  }

  _renderContent() {
    const dialog = this.shadowRoot.querySelector('.dialog');
    if (!dialog) return;

    const stepTitles = ['Choose Template', 'Capabilities & Model', 'Customize'];

    dialog.innerHTML = `
      <div class="header">
        <div>
          <div class="header-title">New Agent</div>
          <div class="header-step">Step ${this._step} of 3 — ${stepTitles[this._step - 1]}</div>
        </div>
        <button class="close-btn" aria-label="Close" tabindex="0">${SVG_CLOSE}</button>
      </div>
      <div class="body">
        ${this._renderStep1()}
        ${this._renderStep2()}
        ${this._renderStep3()}
      </div>
      <div class="footer">
        <div class="step-dots">
          ${[1,2,3].map(s => `<div class="step-dot ${s === this._step ? 'active' : s < this._step ? 'completed' : ''}"></div>`).join('')}
        </div>
        <div class="footer-actions">
          ${this._step > 1 ? `<button class="btn btn-back">${SVG_ARROW_LEFT} Back</button>` : ''}
          ${this._step < 3 ? `<button class="btn btn-next">Next</button>` : ''}
          ${this._step === 3 ? `<button class="btn btn-primary btn-create">${SVG_CHECK} Create Agent</button>` : ''}
        </div>
      </div>
    `;

    this._bindContentEvents();
  }

  _renderStep1() {
    const cards = TEMPLATES.map(t => {
      const sel = this._selectedTemplate === t.id ? 'selected' : '';
      return `<div class="template-card ${sel}" data-id="${t.id}" style="--card-color:${t.color}" tabindex="0" role="option" aria-selected="${sel ? 'true' : 'false'}">
        <div class="template-icon">${t.icon}</div>
        <div class="template-info">
          <div class="template-name">${t.name}</div>
          <div class="template-role">${t.role}</div>
        </div>
        <div class="template-check">${SVG_CHECK}</div>
      </div>`;
    }).join('');

    return `<div class="step-section ${this._step === 1 ? 'active' : ''}" data-step="1">
      <div class="section-label">Select a starting point</div>
      <div class="template-grid" role="listbox" aria-label="Agent templates">${cards}</div>
    </div>`;
  }

  _renderStep2() {
    const capChips = CAPABILITIES.map(c => {
      const active = this._capabilities[c.key] ? 'active' : '';
      return `<button class="cap-chip ${active}" data-cap="${c.key}" tabindex="0">${c.icon} ${c.label}</button>`;
    }).join('');

    const modelCards = MODELS.map(m => {
      const sel = this._model === m.id ? 'selected' : '';
      return `<button class="model-card ${sel}" data-model="${m.id}" tabindex="0">
        <div class="model-name"><span class="radio"><span class="radio-dot"></span></span> ${m.name}</div>
        <div class="model-desc">${m.desc}</div>
      </button>`;
    }).join('');

    return `<div class="step-section ${this._step === 2 ? 'active' : ''}" data-step="2">
      <div class="cap-section">
        <div class="section-label">Capabilities</div>
        <div class="cap-grid">${capChips}</div>
      </div>
      <div class="cap-section">
        <div class="section-label">Model</div>
        <div class="model-grid">${modelCards}</div>
      </div>
      <div class="cap-section">
        <button class="disclosure-btn ${this._mcpOpen ? 'expanded' : ''}" tabindex="0">
          ${SVG_CHEVRON_DOWN} Advanced — MCP Servers
        </button>
        <div class="mcp-panel ${this._mcpOpen ? 'open' : ''}">
          <textarea class="field-textarea" placeholder="Enter MCP server URLs, one per line..." rows="3" data-field="mcp">${this._escHtml(this._mcpServers)}</textarea>
        </div>
      </div>
    </div>`;
  }

  _renderStep3() {
    const ac = getAvatarColor(this._name || 'Custom');
    const letters = avatarLetters(this._name || 'Custom');

    const activeCaps = CAPABILITIES.filter(c => this._capabilities[c.key]);
    const capDots = CAPABILITIES.map(c =>
      `<div class="preview-cap-dot ${this._capabilities[c.key] ? 'active' : ''}" title="${c.label}"></div>`
    ).join('');

    return `<div class="step-section ${this._step === 3 ? 'active' : ''}" data-step="3">
      <div class="customize-layout">
        <div class="customize-fields">
          <div class="field-group">
            <label class="field-label">Agent Name</label>
            <input class="field-input" type="text" data-field="name" value="${this._escAttr(this._name)}" placeholder="e.g. Atlas, Nova..." autocomplete="off" />
          </div>
          <div class="field-group">
            <label class="field-label">System Prompt</label>
            <textarea class="field-textarea" data-field="prompt" placeholder="Describe the agent's personality and behavior..." rows="5">${this._escHtml(this._systemPrompt)}</textarea>
          </div>
          <div class="field-group">
            <label class="field-label">Temperature</label>
            <div class="slider-row">
              <div class="slider-track">
                <input class="slider-input" type="range" min="0" max="1" step="0.05" value="${this._temperature}" data-field="temp" />
              </div>
              <span class="slider-value">${this._temperature.toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div class="customize-preview">
          <div class="preview-card">
            <div class="preview-avatar" style="background:${ac.bg};color:${ac.fg}">${letters}</div>
            <div class="preview-name">${this._escHtml(this._name || 'Untitled')}</div>
            <div class="preview-role">${this._escHtml(this._role || 'Agent')}</div>
            <div class="preview-badge">${this._model}</div>
            <div class="preview-caps">${capDots}</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ── Helpers ── */

  _escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── Events ── */

  _bindEvents() {
    const bd = this.shadowRoot.querySelector('.backdrop');
    if (!bd) return;
    bd.addEventListener('click', (e) => {
      if (e.target === bd) this._cancel();
    });
  }

  _bindContentEvents() {
    const root = this.shadowRoot;

    // Close button
    const closeBtn = root.querySelector('.close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this._cancel());

    // Template cards
    root.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => this._selectTemplate(card.dataset.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._selectTemplate(card.dataset.id);
        }
      });
    });

    // Capability chips
    root.querySelectorAll('.cap-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.cap;
        this._capabilities[key] = !this._capabilities[key];
        chip.classList.toggle('active', this._capabilities[key]);
        this._updatePreviewIfStep3();
      });
    });

    // Model cards
    root.querySelectorAll('.model-card').forEach(card => {
      card.addEventListener('click', () => {
        this._model = card.dataset.model;
        root.querySelectorAll('.model-card').forEach(c => c.classList.toggle('selected', c.dataset.model === this._model));
        this._updatePreviewIfStep3();
      });
    });

    // Disclosure
    const discBtn = root.querySelector('.disclosure-btn');
    if (discBtn) {
      discBtn.addEventListener('click', () => {
        this._mcpOpen = !this._mcpOpen;
        discBtn.classList.toggle('expanded', this._mcpOpen);
        const panel = root.querySelector('.mcp-panel');
        if (panel) panel.classList.toggle('open', this._mcpOpen);
      });
    }

    // MCP textarea
    const mcpTA = root.querySelector('[data-field="mcp"]');
    if (mcpTA) mcpTA.addEventListener('input', (e) => { this._mcpServers = e.target.value; });

    // Step 3 fields
    const nameInput = root.querySelector('[data-field="name"]');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this._name = e.target.value;
        this._color = getAvatarColor(this._name).bg;
        this._updatePreview();
      });
    }

    const promptTA = root.querySelector('[data-field="prompt"]');
    if (promptTA) promptTA.addEventListener('input', (e) => { this._systemPrompt = e.target.value; });

    const tempSlider = root.querySelector('[data-field="temp"]');
    if (tempSlider) {
      tempSlider.addEventListener('input', (e) => {
        this._temperature = parseFloat(e.target.value);
        const sv = root.querySelector('.slider-value');
        if (sv) sv.textContent = this._temperature.toFixed(2);
      });
    }

    // Footer buttons
    const backBtn = root.querySelector('.btn-back');
    if (backBtn) backBtn.addEventListener('click', () => this._goStep(this._step - 1));

    const nextBtn = root.querySelector('.btn-next');
    if (nextBtn) nextBtn.addEventListener('click', () => this._goStep(this._step + 1));

    const createBtn = root.querySelector('.btn-create');
    if (createBtn) createBtn.addEventListener('click', () => this._complete());
  }

  _selectTemplate(id) {
    this._selectedTemplate = id;
    const tpl = TEMPLATES.find(t => t.id === id);
    if (tpl) {
      if (tpl.id !== 'custom') {
        this._name = tpl.name;
        this._role = tpl.role;
        this._model = tpl.model || 'sonnet';
        this._surfaces = tpl.surfaces ? [...tpl.surfaces] : [];
        this._temperature = tpl.temperature != null ? tpl.temperature : 0.5;
        this._systemPrompt = tpl.systemPrompt || '';
        this._color = tpl.color || '#8a7e6a';
        if (tpl.capabilities) this._capabilities = { ...tpl.capabilities };
      } else {
        this._name = '';
        this._role = '';
        this._model = 'sonnet';
        this._surfaces = [];
        this._temperature = 0.5;
        this._systemPrompt = '';
        this._color = '#8a7e6a';
        this._capabilities = { webSearch: false, fileAccess: false, codeExecution: false, imageGen: false, canvas: false, memory: false };
      }
    }

    // Update selection UI
    this.shadowRoot.querySelectorAll('.template-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.id === id);
      card.setAttribute('aria-selected', card.dataset.id === id ? 'true' : 'false');
    });

    // Auto-advance after 300ms
    setTimeout(() => this._goStep(2), 300);
  }

  _goStep(n) {
    if (n < 1 || n > 3) return;
    this._step = n;
    this._renderContent();
    // Re-open animation state
    const bd = this.shadowRoot.querySelector('.backdrop');
    if (bd) bd.classList.add('open');
    // Focus first interactive
    setTimeout(() => {
      const body = this.shadowRoot.querySelector(`.step-section.active`);
      if (body) {
        const first = body.querySelector('button, input, textarea, [tabindex="0"]');
        if (first) first.focus();
      }
    }, 50);
  }

  _updatePreview() {
    const root = this.shadowRoot;
    const ac = getAvatarColor(this._name || 'Custom');
    const letters = avatarLetters(this._name || 'Custom');

    const avatar = root.querySelector('.preview-avatar');
    if (avatar) {
      avatar.style.background = ac.bg;
      avatar.style.color = ac.fg;
      avatar.textContent = letters;
    }

    const nameEl = root.querySelector('.preview-name');
    if (nameEl) nameEl.textContent = this._name || 'Untitled';

    const roleEl = root.querySelector('.preview-role');
    if (roleEl) roleEl.textContent = this._role || 'Agent';

    const badge = root.querySelector('.preview-badge');
    if (badge) badge.textContent = this._model;
  }

  _updatePreviewIfStep3() {
    if (this._step === 3) this._updatePreview();
  }
}

customElements.define('sc-agent-wizard', ScAgentWizard);
