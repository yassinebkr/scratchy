/**
 * Scratchy v2 — <sc-agent-config> Web Component
 * Slide-in panel for creating and editing AI agents.
 * Gold/amber dark theme with glassmorphism, Shadow DOM.
 */

const MODELS = [
  { value: 'claude-opus-4', label: 'Claude Opus 4' },
  { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'gemini-3-pro', label: 'Gemini 3 Pro' },
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'custom', label: 'Custom' },
];

const TOOLS = [
  { id: 'web_search', label: 'Web Search', desc: 'Search the internet for information' },
  { id: 'code_exec', label: 'Code Execution', desc: 'Run code in a sandboxed environment' },
  { id: 'file_read', label: 'File Read', desc: 'Read files from the workspace' },
  { id: 'file_write', label: 'File Write', desc: 'Write and create files' },
];

const tpl = document.createElement('template');
tpl.innerHTML = `
<style>
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  :host {
    display: block;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 14px;
    color: #f0ead6;
  }

  /* ── Backdrop ─── */
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 9998;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
  }

  :host([open]) .backdrop {
    opacity: 1;
    visibility: visible;
  }

  /* ── Panel (Glassmorphism) ─── */
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 420px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    background: rgba(26, 22, 16, 0.85);
    border-left: 1px solid rgba(249, 166, 2, 0.08);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45), inset 1px 0 0 rgba(249, 166, 2, 0.06);
    transform: translateX(100%);
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    will-change: transform;
    overflow: hidden;
  }

  :host([open]) .panel {
    transform: translateX(0);
  }

  /* Gradient mesh bg */
  .panel::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse at 20% 0%, rgba(249, 166, 2, 0.06) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 100%, rgba(249, 166, 2, 0.04) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }

  /* Fallback for browsers without backdrop-filter */
  @supports not (backdrop-filter: blur(20px)) {
    .panel {
      background: #1a1610;
    }
    .confirm-card {
      background: #1a1610;
    }
  }

  /* ── Header ─── */
  .header {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(249, 166, 2, 0.08);
    flex-shrink: 0;
  }

  .header-title {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #f0ead6;
    margin: 0;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid rgba(249, 166, 2, 0.08);
    background: transparent;
    color: #8a7e6a;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
    padding: 0;
    font-family: inherit;
    outline: none;
  }

  .close-btn:hover {
    background: #252015;
    color: #f0ead6;
    border-color: rgba(249, 166, 2, 0.20);
  }

  .close-btn:focus-visible {
    box-shadow: 0 0 0 2px rgba(249, 166, 2, 0.3);
    border-color: rgba(249, 166, 2, 0.20);
  }

  /* ── Form body ─── */
  .body {
    position: relative;
    z-index: 1;
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    scrollbar-width: thin;
    scrollbar-color: rgba(249, 166, 2, 0.15) transparent;
  }

  .body::-webkit-scrollbar {
    width: 5px;
  }

  .body::-webkit-scrollbar-track {
    background: transparent;
  }

  .body::-webkit-scrollbar-thumb {
    background: rgba(249, 166, 2, 0.15);
    border-radius: 3px;
  }

  /* ── Form groups ─── */
  .form-group {
    margin-bottom: 20px;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8a7e6a;
    margin-bottom: 6px;
  }

  .form-group label .required {
    color: #F9A602;
    margin-left: 2px;
  }

  /* ── Text input ─── */
  .input {
    width: 100%;
    height: 48px;
    padding: 0 14px;
    font-size: 14px;
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    color: #f0ead6;
    background: #0d0b07;
    border: 1px solid rgba(249, 166, 2, 0.08);
    border-radius: 6px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .input::placeholder {
    color: rgba(138, 126, 106, 0.6);
  }

  .input:hover {
    border-color: rgba(249, 166, 2, 0.15);
  }

  .input:focus {
    border-color: #F9A602;
    box-shadow: 0 0 0 2px rgba(249, 166, 2, 0.3);
  }

  .input.invalid {
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
  }

  .input.invalid:focus {
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
  }

  /* ── Select ─── */
  select.input {
    appearance: none;
    -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238a7e6a' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 14px center;
    padding-right: 36px;
    cursor: pointer;
  }

  select.input option {
    background: #1a1610;
    color: #f0ead6;
  }

  /* ── Textarea ─── */
  textarea.input {
    height: auto;
    padding: 12px 14px;
    resize: vertical;
    min-height: 120px;
    font-family: 'Geist Mono', 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.5;
  }

  /* ── Temperature slider ─── */
  .slider-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .slider-track {
    flex: 1;
    position: relative;
    height: 32px;
    display: flex;
    align-items: center;
  }

  input[type="range"] {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(to right, rgba(249, 166, 2, 0.25), rgba(249, 166, 2, 0.08));
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  input[type="range"]:focus-visible {
    box-shadow: 0 0 0 2px rgba(249, 166, 2, 0.3);
    border-radius: 2px;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #F9A602;
    border: 2px solid #1a1610;
    box-shadow: 0 0 8px rgba(249, 166, 2, 0.35);
    cursor: pointer;
    transition: box-shadow 0.15s;
  }

  input[type="range"]::-webkit-slider-thumb:hover {
    box-shadow: 0 0 14px rgba(249, 166, 2, 0.5);
  }

  input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #F9A602;
    border: 2px solid #1a1610;
    box-shadow: 0 0 8px rgba(249, 166, 2, 0.35);
    cursor: pointer;
  }

  .slider-value {
    min-width: 38px;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    font-family: 'Geist Mono', 'SF Mono', monospace;
    color: #F9A602;
    background: #0d0b07;
    border: 1px solid rgba(249, 166, 2, 0.08);
    border-radius: 6px;
    padding: 4px 8px;
  }

  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #8a7e6a;
    margin-top: 2px;
    padding: 0 2px;
  }

  /* ── Number input ─── */
  input[type="number"].input {
    -moz-appearance: textfield;
  }

  input[type="number"].input::-webkit-outer-spin-button,
  input[type="number"].input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* ── Tools checklist ─── */
  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tool-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: #0d0b07;
    border: 1px solid rgba(249, 166, 2, 0.08);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }

  .tool-item:hover {
    background: #252015;
    border-color: rgba(249, 166, 2, 0.20);
  }

  .tool-item.active {
    border-color: rgba(249, 166, 2, 0.30);
    background: rgba(249, 166, 2, 0.04);
  }

  .tool-toggle {
    position: relative;
    width: 36px;
    height: 20px;
    flex-shrink: 0;
  }

  .tool-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }

  .tool-toggle input:focus-visible + .track {
    box-shadow: 0 0 0 2px rgba(249, 166, 2, 0.3);
  }

  .tool-toggle .track {
    position: absolute;
    inset: 0;
    background: rgba(249, 166, 2, 0.12);
    border-radius: 10px;
    transition: background 0.2s, box-shadow 0.15s;
  }

  .tool-toggle input:checked + .track {
    background: #F9A602;
  }

  .tool-toggle .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: #f0ead6;
    border-radius: 50%;
    transition: transform 0.2s;
    pointer-events: none;
  }

  .tool-toggle input:checked ~ .thumb {
    transform: translateX(16px);
  }

  .tool-info {
    flex: 1;
    min-width: 0;
  }

  .tool-name {
    font-size: 13px;
    font-weight: 500;
    color: #f0ead6;
  }

  .tool-desc {
    font-size: 11px;
    color: #8a7e6a;
    margin-top: 1px;
  }

  /* ── MCP Servers ─── */
  .mcp-placeholder {
    padding: 16px;
    text-align: center;
    font-size: 13px;
    color: #8a7e6a;
    background: #0d0b07;
    border: 1px dashed rgba(249, 166, 2, 0.08);
    border-radius: 8px;
  }

  .mcp-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mcp-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    background: #0d0b07;
    border: 1px solid rgba(249, 166, 2, 0.08);
    border-radius: 8px;
    font-size: 12px;
    font-family: 'Geist Mono', 'SF Mono', monospace;
    color: #8a7e6a;
  }

  .mcp-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #F9A602;
    flex-shrink: 0;
    box-shadow: 0 0 4px rgba(249, 166, 2, 0.4);
  }

  /* ── Section divider ─── */
  .divider {
    height: 1px;
    background: rgba(249, 166, 2, 0.08);
    margin: 24px 0;
  }

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: #f0ead6;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .section-title .icon {
    font-size: 14px;
    opacity: 0.6;
  }

  /* ── Footer ─── */
  .footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-top: 1px solid rgba(249, 166, 2, 0.08);
    flex-shrink: 0;
    gap: 12px;
  }

  .footer-left {
    display: flex;
    align-items: center;
  }

  .footer-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn {
    font-family: var(--font, 'Geist', system-ui, sans-serif);
    font-size: 13px;
    font-weight: 500;
    padding: 10px 18px;
    border-radius: 6px;
    cursor: pointer;
    border: none;
    outline: none;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s, opacity 0.15s, filter 0.15s;
  }

  .btn:focus-visible {
    box-shadow: 0 0 0 2px rgba(249, 166, 2, 0.3);
  }

  .btn-ghost {
    background: transparent;
    color: #8a7e6a;
    border: 1px solid rgba(249, 166, 2, 0.08);
  }

  .btn-ghost:hover {
    color: #f0ead6;
    background: #252015;
    border-color: rgba(249, 166, 2, 0.20);
  }

  .btn-primary {
    background: #F9A602;
    color: #0d0b07;
    font-weight: 600;
  }

  .btn-primary:hover {
    filter: brightness(1.1);
    box-shadow: 0 0 16px rgba(249, 166, 2, 0.30);
  }

  .btn-primary:focus-visible {
    box-shadow: 0 0 0 2px rgba(249, 166, 2, 0.3), 0 0 16px rgba(249, 166, 2, 0.15);
  }

  .btn-primary:hover:focus-visible {
    filter: brightness(1.1);
    box-shadow: 0 0 0 2px rgba(249, 166, 2, 0.3), 0 0 16px rgba(249, 166, 2, 0.30);
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
    filter: none;
  }

  .btn-danger {
    background: #ef4444;
    color: #f0ead6;
    font-weight: 600;
  }

  .btn-danger:hover {
    background: #dc2626;
  }

  .btn-danger:focus-visible {
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.4);
  }

  .btn-danger-ghost {
    background: transparent;
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.20);
  }

  .btn-danger-ghost:hover {
    background: rgba(239, 68, 68, 0.08);
    border-color: rgba(239, 68, 68, 0.35);
  }

  .btn-danger-ghost:focus-visible {
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
  }

  /* ── Form error ─── */
  .form-error {
    color: #ef4444;
    font-size: 12px;
    margin-top: 6px;
    min-height: 16px;
    padding: 0 2px;
  }

  /* ── Delete confirmation overlay ─── */
  .confirm-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 10000;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease;
  }

  .confirm-overlay.open {
    display: flex;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .confirm-card {
    background: rgba(26, 22, 16, 0.85);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(249, 166, 2, 0.08);
    border-radius: 8px;
    padding: 28px;
    width: 100%;
    max-width: 360px;
    margin: 16px;
    text-align: center;
    animation: confirmSlideUp 0.2s ease;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  }

  @keyframes confirmSlideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .confirm-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(239, 68, 68, 0.10);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    font-size: 22px;
  }

  .confirm-title {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 8px;
    color: #f0ead6;
  }

  .confirm-msg {
    font-size: 13px;
    color: #8a7e6a;
    margin: 0 0 24px;
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    justify-content: center;
    gap: 10px;
  }

  /* ── Loading spinner (inherits button text color) ─── */
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-bottom-color: transparent;
    border-left-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-right: 6px;
    vertical-align: middle;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Mobile full-screen ─── */
  @media (max-width: 768px) {
    .panel {
      width: 100%;
      border-left: none;
    }

    .header {
      padding: 16px 20px 14px;
    }

    .body {
      padding: 16px 20px;
    }

    .footer {
      padding: 14px 20px;
      padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    }
  }

  /* ── Reduced motion ─── */
  @media (prefers-reduced-motion: reduce) {
    .panel,
    .backdrop,
    .confirm-overlay,
    .confirm-card,
    .input,
    .close-btn,
    .btn,
    .tool-toggle .track,
    .tool-toggle .thumb {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }

    input[type="range"]::-webkit-slider-thumb {
      transition: none;
    }
  }
</style>

<!-- Backdrop -->
<div class="backdrop" id="backdrop"></div>

<!-- Slide-in panel -->
<div class="panel" id="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">
  <!-- Header -->
  <div class="header">
    <h2 class="header-title" id="panel-title">New Agent</h2>
    <button class="close-btn" id="close-btn" aria-label="Close panel">&times;</button>
  </div>

  <!-- Scrollable body -->
  <div class="body" id="body">
    <!-- Name -->
    <div class="form-group">
      <label for="cfg-name">Name <span class="required">*</span></label>
      <input class="input" id="cfg-name" type="text" placeholder="e.g. Code Assistant, Research Agent" required maxlength="80" autocomplete="off" />
    </div>

    <!-- Model -->
    <div class="form-group">
      <label for="cfg-model">Model</label>
      <select class="input" id="cfg-model"></select>
    </div>

    <!-- System Prompt -->
    <div class="form-group">
      <label for="cfg-prompt">System Prompt</label>
      <textarea class="input" id="cfg-prompt" rows="6" placeholder="You are an expert assistant that helps users with...&#10;&#10;Be concise, accurate, and helpful. Use code examples when appropriate."></textarea>
    </div>

    <!-- Temperature -->
    <div class="form-group">
      <label for="cfg-temp">Temperature</label>
      <div class="slider-row">
        <div class="slider-track">
          <input type="range" id="cfg-temp" min="0" max="2" step="0.1" value="0.7" aria-label="Temperature" aria-valuemin="0" aria-valuemax="2" aria-valuenow="0.7" />
        </div>
        <span class="slider-value" id="temp-display" aria-live="polite">0.7</span>
      </div>
      <div class="slider-labels">
        <span>Precise</span>
        <span>Creative</span>
      </div>
    </div>

    <!-- Max Tokens -->
    <div class="form-group">
      <label for="cfg-tokens">Max Tokens</label>
      <input class="input" id="cfg-tokens" type="number" value="4096" min="256" max="200000" step="256" aria-label="Maximum token count" />
    </div>

    <div class="divider"></div>

    <!-- Tools -->
    <div class="section-title" id="tools-heading">
      <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      Tools
    </div>
    <div class="tools-list" id="tools-list" role="group" aria-labelledby="tools-heading"></div>

    <div class="divider"></div>

    <!-- MCP Servers -->
    <div class="section-title" id="mcp-heading">
      <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
      MCP Servers
    </div>
    <div id="mcp-container" aria-labelledby="mcp-heading">
      <div class="mcp-placeholder">No MCP servers configured</div>
    </div>

    <!-- Form error -->
    <div class="form-error" id="form-error" role="alert" aria-live="polite"></div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      <button class="btn btn-danger-ghost" id="delete-btn" style="display:none;">Delete</button>
    </div>
    <div class="footer-right">
      <button class="btn btn-ghost" id="cancel-btn">Cancel</button>
      <button class="btn btn-primary" id="save-btn">Save</button>
    </div>
  </div>
</div>

<!-- Delete confirmation -->
<div class="confirm-overlay" id="confirm-overlay">
  <div class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title-text" aria-describedby="confirm-msg">
    <div class="confirm-icon">🗑</div>
    <h3 class="confirm-title" id="confirm-title-text">Delete Agent</h3>
    <p class="confirm-msg" id="confirm-msg">Are you sure you want to delete this agent? This action cannot be undone.</p>
    <div class="confirm-actions">
      <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
      <button class="btn btn-danger" id="confirm-delete">Delete</button>
    </div>
  </div>
</div>
`;

export class ScAgentConfig extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'agent-id'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(tpl.content.cloneNode(true));

    this._agentId = null;
    this._agentData = null;
    this._enabledTools = new Set();
    this._mcpServers = [];
    this._saving = false;
    this._token = null;
    this._previousFocus = null;

    // DOM refs
    this._backdrop = this.shadowRoot.getElementById('backdrop');
    this._panel = this.shadowRoot.getElementById('panel');
    this._titleEl = this.shadowRoot.getElementById('panel-title');
    this._closeBtn = this.shadowRoot.getElementById('close-btn');
    this._nameInput = this.shadowRoot.getElementById('cfg-name');
    this._modelSelect = this.shadowRoot.getElementById('cfg-model');
    this._promptInput = this.shadowRoot.getElementById('cfg-prompt');
    this._tempSlider = this.shadowRoot.getElementById('cfg-temp');
    this._tempDisplay = this.shadowRoot.getElementById('temp-display');
    this._tokensInput = this.shadowRoot.getElementById('cfg-tokens');
    this._toolsList = this.shadowRoot.getElementById('tools-list');
    this._mcpContainer = this.shadowRoot.getElementById('mcp-container');
    this._errorEl = this.shadowRoot.getElementById('form-error');
    this._cancelBtn = this.shadowRoot.getElementById('cancel-btn');
    this._saveBtn = this.shadowRoot.getElementById('save-btn');
    this._deleteBtn = this.shadowRoot.getElementById('delete-btn');
    this._confirmOverlay = this.shadowRoot.getElementById('confirm-overlay');
    this._confirmMsg = this.shadowRoot.getElementById('confirm-msg');
    this._confirmCancel = this.shadowRoot.getElementById('confirm-cancel');
    this._confirmDelete = this.shadowRoot.getElementById('confirm-delete');
  }

  connectedCallback() {
    // Populate model select
    for (const m of MODELS) {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      this._modelSelect.appendChild(opt);
    }

    // Populate tools list
    for (const tool of TOOLS) {
      const item = document.createElement('div');
      item.className = 'tool-item';
      item.dataset.toolId = tool.id;
      item.innerHTML = `
        <label class="tool-toggle">
          <input type="checkbox" data-tool="${this._escHtml(tool.id)}" aria-label="${this._escHtml(tool.label)}" />
          <span class="track"></span>
          <span class="thumb"></span>
        </label>
        <div class="tool-info">
          <div class="tool-name">${this._escHtml(tool.label)}</div>
          <div class="tool-desc">${this._escHtml(tool.desc)}</div>
        </div>
      `;

      const checkbox = item.querySelector('input[type="checkbox"]');

      // Click on item toggles the checkbox
      item.addEventListener('click', (e) => {
        if (e.target.closest('.tool-toggle')) return;
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this._enabledTools.add(tool.id);
          item.classList.add('active');
        } else {
          this._enabledTools.delete(tool.id);
          item.classList.remove('active');
        }
      });

      this._toolsList.appendChild(item);
    }

    // Temperature slider
    this._tempSlider.addEventListener('input', () => {
      const val = parseFloat(this._tempSlider.value).toFixed(1);
      this._tempDisplay.textContent = val;
      this._tempSlider.setAttribute('aria-valuenow', val);
    });

    // Close handlers
    this._closeBtn.addEventListener('click', () => this.close());
    this._backdrop.addEventListener('click', () => this.close());
    this._cancelBtn.addEventListener('click', () => this.close());

    // Escape key (document-level for reliability)
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        if (this._confirmOverlay.classList.contains('open')) {
          this._closeConfirm();
        } else if (this.hasAttribute('open')) {
          this.close();
        }
      }
    };
    document.addEventListener('keydown', this._escHandler);

    // Focus trap (shadow root-level for correct activeElement)
    this._tabHandler = (e) => {
      if (e.key === 'Tab' && this.hasAttribute('open')) {
        this._handleFocusTrap(e);
      }
    };
    this.shadowRoot.addEventListener('keydown', this._tabHandler);

    // Save handler
    this._saveBtn.addEventListener('click', () => this._handleSave());

    // Delete handlers
    this._deleteBtn.addEventListener('click', () => this._requestDelete());
    this._confirmCancel.addEventListener('click', () => this._closeConfirm());
    this._confirmDelete.addEventListener('click', () => this._executeDelete());
    this._confirmOverlay.addEventListener('click', (e) => {
      if (e.target === this._confirmOverlay) this._closeConfirm();
    });

    // Auth token
    this._token = localStorage.getItem('scratchy_token')
      || this._getCookie('scratchy_token')
      || null;
  }

  disconnectedCallback() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
    }
    if (this._tabHandler) {
      this.shadowRoot.removeEventListener('keydown', this._tabHandler);
    }
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'open') {
      if (newVal !== null) {
        this._onOpen();
      }
    }
    if (name === 'agent-id') {
      this._agentId = newVal;
    }
  }

  /* ─── Public API ─── */

  /** Open the panel. If agentId is provided, load that agent for editing. */
  open(agentId = null) {
    if (agentId) {
      this.setAttribute('agent-id', agentId);
    } else {
      this.removeAttribute('agent-id');
    }
    this.setAttribute('open', '');
  }

  /** Close the panel. */
  close() {
    this.removeAttribute('open');

    // Restore focus to the element that triggered the panel
    if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
      this._previousFocus.focus();
      this._previousFocus = null;
    }

    this.dispatchEvent(new CustomEvent('agent-config-close', {
      bubbles: true,
      composed: true,
    }));
  }

  /* ─── Internal ─── */

  async _onOpen() {
    // Store the currently focused element so we can restore it on close
    this._previousFocus = document.activeElement;

    this._resetForm();
    this._errorEl.textContent = '';

    const agentId = this.getAttribute('agent-id');
    this._agentId = agentId || null;

    if (this._agentId) {
      // Edit mode
      this._titleEl.textContent = 'Edit Agent';
      this._saveBtn.textContent = 'Save Changes';
      this._deleteBtn.style.display = '';
      await this._loadAgent(this._agentId);
    } else {
      // Create mode
      this._titleEl.textContent = 'New Agent';
      this._saveBtn.textContent = 'Create Agent';
      this._deleteBtn.style.display = 'none';
    }

    // Focus name input after slide-in transition completes
    setTimeout(() => this._nameInput.focus(), 350);
  }

  _resetForm() {
    this._nameInput.value = '';
    this._nameInput.classList.remove('invalid');
    this._modelSelect.value = 'claude-sonnet-4';
    this._promptInput.value = '';
    this._tempSlider.value = '0.7';
    this._tempDisplay.textContent = '0.7';
    this._tempSlider.setAttribute('aria-valuenow', '0.7');
    this._tokensInput.value = '4096';
    this._enabledTools.clear();
    this._mcpServers = [];
    this._agentData = null;

    // Reset tool checkboxes
    for (const item of this._toolsList.querySelectorAll('.tool-item')) {
      item.classList.remove('active');
      const cb = item.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    }

    // Reset MCP container
    this._mcpContainer.innerHTML = '<div class="mcp-placeholder">No MCP servers configured</div>';
  }

  async _loadAgent(agentId) {
    try {
      const res = await fetch(`/api/admin/agents`, {
        headers: this._authHeaders(),
      });

      if (!res.ok) {
        this._errorEl.textContent = 'Failed to load agents';
        return;
      }

      const allAgents = await res.json();
      const agent = Array.isArray(allAgents)
        ? allAgents.find(a => String(a.id) === String(agentId))
        : null;

      if (!agent) {
        this._errorEl.textContent = 'Agent not found';
        return;
      }

      this._agentData = agent;
      this._populateForm(agent);
    } catch {
      this._errorEl.textContent = 'Network error loading agent';
    }
  }

  _populateForm(agent) {
    this._nameInput.value = agent.name || '';
    this._modelSelect.value = agent.model || 'claude-sonnet-4';

    // If model not in list, add a custom option
    if (this._modelSelect.value !== (agent.model || 'claude-sonnet-4')) {
      const opt = document.createElement('option');
      opt.value = agent.model;
      opt.textContent = agent.model;
      this._modelSelect.appendChild(opt);
      this._modelSelect.value = agent.model;
    }

    this._promptInput.value = agent.systemPrompt || '';
    this._tempSlider.value = agent.temperature ?? 0.7;
    this._tempDisplay.textContent = parseFloat(this._tempSlider.value).toFixed(1);
    this._tempSlider.setAttribute('aria-valuenow', parseFloat(this._tempSlider.value).toFixed(1));
    this._tokensInput.value = agent.maxTokens ?? 4096;

    // Tools
    const agentTools = Array.isArray(agent.tools) ? agent.tools : [];
    this._enabledTools.clear();
    for (const item of this._toolsList.querySelectorAll('.tool-item')) {
      const cb = item.querySelector('input[type="checkbox"]');
      const toolId = cb?.dataset.tool;
      if (toolId && agentTools.includes(toolId)) {
        cb.checked = true;
        item.classList.add('active');
        this._enabledTools.add(toolId);
      } else {
        cb.checked = false;
        item.classList.remove('active');
      }
    }

    // MCP Servers
    this._mcpServers = Array.isArray(agent.mcpServers) ? agent.mcpServers : [];
    this._renderMcpServers();
  }

  _renderMcpServers() {
    if (this._mcpServers.length === 0) {
      this._mcpContainer.innerHTML = '<div class="mcp-placeholder">No MCP servers configured</div>';
      return;
    }

    const listEl = document.createElement('div');
    listEl.className = 'mcp-list';

    for (const server of this._mcpServers) {
      const item = document.createElement('div');
      item.className = 'mcp-item';
      const name = typeof server === 'string' ? server : (server.name || server.command || 'Unknown');
      item.innerHTML = `<span class="mcp-dot"></span><span>${this._escHtml(name)}</span>`;
      listEl.appendChild(item);
    }

    this._mcpContainer.innerHTML = '';
    this._mcpContainer.appendChild(listEl);
  }

  /* ─── Focus Trap ─── */

  _handleFocusTrap(e) {
    const container = this._confirmOverlay.classList.contains('open')
      ? this.shadowRoot.querySelector('.confirm-card')
      : this._panel;

    const focusableSelector = [
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    const focusable = [...container.querySelectorAll(focusableSelector)]
      .filter(el => {
        // Filter out hidden elements (style="display:none" or visibility)
        if (el.offsetParent === null && el.style.display === 'none') return false;
        if (el.closest('[style*="display:none"]') || el.closest('[style*="display: none"]')) return false;
        return true;
      });

    if (focusable.length === 0) return;

    const active = this.shadowRoot.activeElement;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ─── Validation ─── */

  _validate() {
    const errors = [];
    const name = this._nameInput.value.trim();

    if (!name) {
      errors.push('Agent name is required');
      this._nameInput.classList.add('invalid');
    } else {
      this._nameInput.classList.remove('invalid');
    }

    const temp = parseFloat(this._tempSlider.value);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      errors.push('Temperature must be between 0.0 and 2.0');
    }

    const tokens = parseInt(this._tokensInput.value, 10);
    if (isNaN(tokens) || tokens < 256) {
      errors.push('Max tokens must be at least 256');
    }

    return errors;
  }

  /* ─── Save ─── */

  async _handleSave() {
    const errors = this._validate();
    if (errors.length > 0) {
      this._errorEl.textContent = errors[0];
      return;
    }

    if (this._saving) return;
    this._saving = true;
    this._saveBtn.disabled = true;
    this._saveBtn.innerHTML = '<span class="spinner"></span>Saving\u2026';
    this._errorEl.textContent = '';

    const payload = {
      name: this._nameInput.value.trim(),
      model: this._modelSelect.value,
      systemPrompt: this._promptInput.value.trim(),
      temperature: parseFloat(this._tempSlider.value),
      maxTokens: parseInt(this._tokensInput.value, 10) || 4096,
      tools: [...this._enabledTools],
    };

    try {
      const isEdit = !!this._agentId;
      const url = isEdit
        ? `/api/admin/agents/${this._agentId}`
        : '/api/admin/agents';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this._authHeaders(),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        this._errorEl.textContent = data.error || `Failed to ${isEdit ? 'update' : 'create'} agent`;
        return;
      }

      this.dispatchEvent(new CustomEvent('agent-saved', {
        bubbles: true,
        composed: true,
        detail: { agent: data },
      }));

      this.close();
    } catch {
      this._errorEl.textContent = 'Network error \u2014 check your connection';
    } finally {
      this._saving = false;
      this._saveBtn.disabled = false;
      this._saveBtn.textContent = this._agentId ? 'Save Changes' : 'Create Agent';
    }
  }

  /* ─── Delete ─── */

  _requestDelete() {
    if (!this._agentId) return;
    const name = this._agentData?.name || 'this agent';
    this._confirmMsg.textContent = `Are you sure you want to delete \u201C${name}\u201D? This action cannot be undone.`;
    this._confirmOverlay.classList.add('open');
    this._confirmDelete.focus();
  }

  _closeConfirm() {
    this._confirmOverlay.classList.remove('open');
    // Return focus to the delete button that opened the confirm dialog
    this._deleteBtn.focus();
  }

  async _executeDelete() {
    if (!this._agentId) return;

    this._confirmDelete.disabled = true;
    this._confirmDelete.innerHTML = '<span class="spinner"></span>Deleting\u2026';

    try {
      const res = await fetch(`/api/admin/agents/${this._agentId}`, {
        method: 'DELETE',
        headers: this._authHeaders(),
      });

      if (res.ok || res.status === 204) {
        this._closeConfirm();

        this.dispatchEvent(new CustomEvent('agent-deleted', {
          bubbles: true,
          composed: true,
          detail: { agentId: this._agentId },
        }));

        this.close();
      } else {
        const data = await res.json().catch(() => ({}));
        this._confirmMsg.textContent = data.error || 'Failed to delete agent';
      }
    } catch {
      this._confirmMsg.textContent = 'Network error \u2014 check your connection';
    } finally {
      this._confirmDelete.disabled = false;
      this._confirmDelete.textContent = 'Delete';
    }
  }

  /* ─── Helpers ─── */

  _authHeaders() {
    const headers = {};
    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }
    return headers;
  }

  _getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  _escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

customElements.define('sc-agent-config', ScAgentConfig);
