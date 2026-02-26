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
    background: #0d1117;
    color: #c9d1d9;
    font-family: var(--mono, 'Geist Mono', 'SF Mono', 'Fira Code', monospace);
    font-size: 13px;
    overflow: hidden;
    height: 100%;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #161b22;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    min-height: 32px;
  }

  .toolbar-title {
    font-size: 12px;
    font-weight: 600;
    color: #8b949e;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    flex: 1;
  }

  .toolbar-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: #8b949e;
    font-family: inherit;
    font-size: 11px;
    padding: 2px 8px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover {
    color: #c9d1d9;
    border-color: rgba(255,255,255,0.2);
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
    color: #484f58;
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
    background: rgba(22,27,34,0.9);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: #8b949e;
    font-family: inherit;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: opacity 0.2s;
    z-index: 2;
  }

  .scroll-lock:hover { color: #c9d1d9; }
  .scroll-lock.hidden { opacity: 0; pointer-events: none; }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #484f58;
    font-size: 13px;
    gap: 8px;
  }

  .empty-state .icon { font-size: 20px; }

  /* Scrollbar */
  .output::-webkit-scrollbar { width: 6px; }
  .output::-webkit-scrollbar-track { background: transparent; }
  .output::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
</style>

<div class="toolbar">
  <span class="toolbar-title">Terminal</span>
  <button class="toolbar-btn" id="copy-btn" title="Copy last output">Copy</button>
  <button class="toolbar-btn" id="clear-btn" title="Clear terminal">Clear</button>
</div>
<div class="output" id="output">
  <div class="empty-state">
    <span class="icon">⚡</span>
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
    this._output.innerHTML = `<div class="empty-state"><span class="icon">⚡</span><span>Waiting for commands…</span></div>`;
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
