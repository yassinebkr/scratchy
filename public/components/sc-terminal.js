/**
 * Scratchy v2 — Terminal Surface
 * <sc-terminal> Web Component
 *
 * Displays live command output from agent exec tool calls.
 * Features:
 * - Streaming output (stdout/stderr) with ANSI color support
 * - Command history with timestamps
 * - Auto-scroll with manual scroll lock
 * - Copy output button
 * - Clear/collapse controls
 */

const ANSI_COLORS = {
  '30': '#545862', '31': '#f85149', '32': '#3fb950', '33': '#d29922',
  '34': '#58a6ff', '35': '#bc8cff', '36': '#39c5cf', '37': '#c9d1d9',
  '90': '#636e7b', '91': '#ff7b72', '92': '#56d364', '93': '#e3b341',
  '94': '#79c0ff', '95': '#d2a8ff', '96': '#56d4dd', '97': '#f0f6fc',
  '1': null, // bold — handled separately
  '0': null, // reset
};

function ansiToHtml(text) {
  if (!text) return '';
  // Escape HTML first
  let s = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert ANSI escape codes to spans
  let open = 0;
  s = s.replace(/\x1b\[([0-9;]+)m/g, (_, codes) => {
    const parts = codes.split(';');
    let html = '';
    for (const c of parts) {
      if (c === '0') {
        // Reset
        html += '</span>'.repeat(open);
        open = 0;
      } else if (c === '1') {
        html += '<span style="font-weight:700">';
        open++;
      } else if (ANSI_COLORS[c]) {
        html += `<span style="color:${ANSI_COLORS[c]}">`;
        open++;
      }
    }
    return html;
  });
  // Close any remaining open tags
  s += '</span>'.repeat(open);
  return s;
}

const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    background: var(--sc-bg, #0e0c09);
    color: var(--sc-text, #e8e0d2);
    font-family: var(--mono, 'Geist Mono', 'SF Mono', 'Fira Code', monospace);
    font-size: 13px;
    overflow: hidden;
    height: 100%;
  }

  .toolbar-btn {
    background: none;
    border: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    border-radius: 4px;
    color: var(--sc-text-dim, #5a5040);
    font-family: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .toolbar-btn:hover {
    color: var(--sc-text, #e8e0d2);
    border-color: var(--sc-accent, #F9A602);
  }

  .output {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 12px;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
  }

  .cmd-block {
    margin-bottom: 8px;
  }

  .cmd-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }

  .cmd-prompt {
    color: #3fb950;
    user-select: none;
  }

  .cmd-text {
    color: #58a6ff;
    font-weight: 600;
  }

  .cmd-time {
    color: var(--sc-text-dim, #5a5040);
    font-size: 11px;
    margin-left: auto;
  }

  .stdout { color: #c9d1d9; }
  .stderr { color: #f85149; }

  .exit-code {
    font-size: 11px;
    margin-top: 2px;
    padding: 1px 6px;
    border-radius: 3px;
    display: inline-block;
  }

  .exit-code.success {
    color: #3fb950;
    background: rgba(63,185,80,0.1);
  }

  .exit-code.failure {
    color: #f85149;
    background: rgba(248,81,73,0.1);
  }

  .scroll-lock {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: var(--sc-glass-bg, rgba(26,22,16,0.85));
    border: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    border-radius: 6px;
    color: var(--sc-text-dim, #5a5040);
    font-family: inherit;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: opacity 0.2s;
    z-index: 2;
  }

  .scroll-lock:hover { color: var(--sc-text, #e8e0d2); }
  .scroll-lock.hidden { opacity: 0; pointer-events: none; }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--sc-text-dim, #5a5040);
    font-size: 13px;
    gap: 8px;
  }

  .empty-state .icon {
    color: var(--sc-text-dim, #5a5040);
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Scrollbar */
  .output::-webkit-scrollbar { width: 6px; }
  .output::-webkit-scrollbar-track { background: transparent; }
  .output::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

  /* Surface header — 36px uniform glassmorphism */
  .surface-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 36px;
    min-height: 36px;
    padding: 0 12px;
    background: var(--sc-glass-bg, rgba(26,22,16,0.85));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--sc-border, rgba(249,166,2,0.12));
    flex-shrink: 0;
    gap: 8px;
  }
  .surface-header-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--sc-text-muted, #8a7e6a);
    display: flex;
    align-items: center;
    gap: 6px;
    letter-spacing: 0.3px;
  }
  .surface-header-icon {
    color: var(--sc-accent, #F9A602);
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }
  .surface-close {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--sc-text-dim, #5a5040);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .surface-close:hover {
    background: rgba(239,68,68,0.12);
    color: #ef4444;
  }
  .surface-close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(249,166,2,0.35);
  }
  .toolbar-btn {
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .toolbar-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(249,166,2,0.35);
  }

  @media (max-width: 767px) {
    .surface-header {
      padding-left: 48px;
    }
  }
</style>

<div class="surface-header">
  <span class="surface-header-title">
    <svg class="surface-header-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="4 6 7 9 4 12"/><line x1="9" y1="12" x2="13" y2="12"/>
    </svg>
    Terminal
  </span>
  <div style="display:flex;align-items:center;gap:6px;">
    <button class="toolbar-btn" id="copy-btn" title="Copy last output">Copy</button>
    <button class="toolbar-btn" id="clear-btn" title="Clear terminal">Clear</button>
    <button class="surface-close" id="surface-close-btn" title="Close terminal">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>
    </button>
  </div>
</div>
<div class="output" id="output">
  <div class="empty-state">
    <span class="icon"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 7 9 4 12"/><line x1="9" y1="12" x2="13" y2="12"/></svg></span>
    <span>Waiting for commands…</span>
  </div>
</div>
<button class="scroll-lock hidden" id="scroll-lock">↓ New output</button>
`;

export class ScTerminal extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));

    this._output = this.shadowRoot.getElementById('output');
    this._copyBtn = this.shadowRoot.getElementById('copy-btn');
    this._clearBtn = this.shadowRoot.getElementById('clear-btn');
    this._scrollLock = this.shadowRoot.getElementById('scroll-lock');

    /** @type {Map<string, HTMLElement>} requestId → block element */
    this._blocks = new Map();
    this._autoScroll = true;
    this._hasContent = false;
  }

  connectedCallback() {
    this._output.addEventListener('scroll', () => this._onScroll());
    this._scrollLock.addEventListener('click', () => this._scrollToBottom());
    this._copyBtn.addEventListener('click', () => this._copyLast());
    this._clearBtn.addEventListener('click', () => this.clear());
    this.shadowRoot.getElementById('surface-close-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('surface-close', { detail: { type: 'terminal' }, bubbles: true, composed: true }));
    });
  }

  /** Add a new command execution block */
  addCommand(requestId, command, cwd) {
    this._ensureContent();
    const block = document.createElement('div');
    block.className = 'cmd-block';

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    block.innerHTML = `
      <div class="cmd-header">
        <span class="cmd-prompt">❯</span>
        <span class="cmd-text">${this._esc(command)}</span>
        <span class="cmd-time">${now}</span>
      </div>
    `;

    this._output.appendChild(block);
    this._blocks.set(requestId, block);
    this._maybeScroll();
  }

  /** Append streaming output to a command block */
  appendOutput(requestId, text, stream = 'stdout') {
    const block = this._blocks.get(requestId);
    if (!block) return;

    const span = document.createElement('span');
    span.className = stream;
    span.innerHTML = ansiToHtml(text);
    block.appendChild(span);
    this._maybeScroll();
  }

  /** Mark a command block as complete */
  completeCommand(requestId, exitCode) {
    const block = this._blocks.get(requestId);
    if (!block) return;

    if (exitCode !== undefined && exitCode !== null) {
      const badge = document.createElement('span');
      badge.className = `exit-code ${exitCode === 0 ? 'success' : 'failure'}`;
      badge.textContent = exitCode === 0 ? '✓ exit 0' : `✗ exit ${exitCode}`;
      block.appendChild(badge);
    }
    this._maybeScroll();
  }

  /** Clear all output */
  clear() {
    this._output.innerHTML = '';
    this._blocks.clear();
    this._hasContent = false;
    this._output.innerHTML = `<div class="empty-state"><span class="icon"><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 7 9 4 12"/><line x1="9" y1="12" x2="13" y2="12"/></svg></span><span>Waiting for commands…</span></div>`;
  }

  _ensureContent() {
    if (!this._hasContent) {
      this._output.innerHTML = '';
      this._hasContent = true;
    }
  }

  _esc(s) {
    return s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
  }

  _onScroll() {
    const el = this._output;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    this._autoScroll = atBottom;
    this._scrollLock.classList.toggle('hidden', atBottom);
  }

  _maybeScroll() {
    if (this._autoScroll) {
      requestAnimationFrame(() => {
        this._output.scrollTop = this._output.scrollHeight;
      });
    } else {
      this._scrollLock.classList.remove('hidden');
    }
  }

  _scrollToBottom() {
    this._output.scrollTop = this._output.scrollHeight;
    this._autoScroll = true;
    this._scrollLock.classList.add('hidden');
  }

  async _copyLast() {
    // Copy last command's output
    const blocks = [...this._blocks.values()];
    const last = blocks[blocks.length - 1];
    if (!last) return;
    const text = last.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      this._copyBtn.textContent = '✓';
      setTimeout(() => { this._copyBtn.textContent = 'Copy'; }, 1500);
    } catch {
      // Fallback
    }
  }
}

customElements.define('sc-terminal', ScTerminal);
