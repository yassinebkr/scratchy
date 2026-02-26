/**
 * Scratchy v2 — <sc-chat> Web Component
 * Full chat UI with markdown rendering, streaming, code blocks,
 * smart auto-scroll, message animations, file drop, and mobile support.
 *
 * Properties: messages (array), isTyping (boolean), placeholder (string)
 * Methods:    addMessage(msg), setTyping(bool), scrollToBottom()
 * Events:     message-send, message-retry, scroll-state
 */

const STYLES = `
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    font-family: 'Geist', system-ui, -apple-system, sans-serif;
    font-size: 14px;
    color: #e4e4e7;
    background: #0a0a0f;
    position: relative;
    overflow: hidden;
    --bg: #0a0a0f;
    --surface: #111118;
    --surface-hover: #1a1a24;
    --border: rgba(255,255,255,0.06);
    --radius: 8px;
    --text: #e4e4e7;
    --muted: #71717a;
    --accent: #6366f1;
    --accent-hover: #4f46e5;
    --user-bubble: #1e1b4b;
    --assistant-bubble: #111118;
    --transition: 200ms ease;
  }

  *, *::before, *::after { box-sizing: border-box; }

  /* ─── Message List ─── */
  .chat-messages {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 16px 8px;
    scroll-behavior: smooth;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .chat-messages::-webkit-scrollbar { width: 6px; }
  .chat-messages::-webkit-scrollbar-track { background: transparent; }
  .chat-messages::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
  }
  .chat-messages::-webkit-scrollbar-thumb:hover {
    background: rgba(255,255,255,0.14);
  }

  /* ─── Empty State ─── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 24px;
    padding: 32px;
    opacity: 1;
    transition: opacity 300ms ease;
  }
  .empty-state.hidden { opacity: 0; pointer-events: none; position: absolute; }

  .empty-state-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(99,102,241,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
  }

  .empty-state h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  .empty-state p {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
    text-align: center;
    max-width: 280px;
    line-height: 1.5;
  }

  .suggested-prompts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    max-width: 420px;
  }

  .suggested-prompt {
    padding: 8px 14px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--muted);
    font-size: 13px;
    cursor: pointer;
    transition: all var(--transition);
    white-space: nowrap;
    font-family: inherit;
  }
  .suggested-prompt:hover {
    background: var(--surface-hover);
    color: var(--text);
    border-color: rgba(99,102,241,0.3);
  }

  /* ─── Messages ─── */
  .msg {
    display: flex;
    flex-direction: column;
    margin-bottom: 12px;
    max-width: 85%;
    position: relative;
    animation: msg-enter-left 200ms ease-out both;
  }
  .msg--user {
    align-self: flex-end;
    margin-left: auto;
    animation-name: msg-enter-right;
  }
  .msg--assistant { align-self: flex-start; }
  .msg--system {
    align-self: center;
    max-width: 90%;
    animation-name: msg-fade-in;
  }

  @keyframes msg-enter-left {
    from { opacity: 0; transform: translateX(-16px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes msg-enter-right {
    from { opacity: 0; transform: translateX(16px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes msg-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .msg, .msg--user, .msg--system {
      animation: none !important;
    }
    .chat-messages { scroll-behavior: auto; }
  }

  /* ─── Message Bubbles ─── */
  .msg-bubble {
    padding: 10px 14px;
    border-radius: var(--radius);
    line-height: 1.6;
    word-break: break-word;
    overflow-wrap: break-word;
    position: relative;
  }
  .msg--user .msg-bubble {
    background: var(--user-bubble);
    border-bottom-right-radius: 2px;
  }
  .msg--assistant .msg-bubble {
    background: var(--assistant-bubble);
    border: 1px solid var(--border);
    border-bottom-left-radius: 2px;
  }
  .msg--system .msg-bubble {
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    text-align: center;
    padding: 6px 12px;
  }

  .msg-time {
    font-size: 11px;
    color: var(--muted);
    margin-top: 4px;
    opacity: 0.6;
  }
  .msg--user .msg-time { text-align: right; }

  /* ─── Message Actions (hover) ─── */
  .msg-actions {
    position: absolute;
    top: -4px;
    display: flex;
    gap: 2px;
    opacity: 0;
    transform: translateY(4px);
    transition: all 150ms ease;
    pointer-events: none;
    z-index: 2;
  }
  .msg--user .msg-actions { right: 0; }
  .msg--assistant .msg-actions { left: 0; }

  .msg:hover .msg-actions,
  .msg-actions:focus-within {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .msg-action-btn {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    transition: all var(--transition);
    padding: 0;
    font-family: inherit;
  }
  .msg-action-btn:hover {
    background: var(--surface-hover);
    color: var(--text);
    border-color: rgba(99,102,241,0.3);
  }
  .msg-action-btn.copied {
    color: #22c55e;
    border-color: rgba(34,197,94,0.3);
  }

  /* ─── Typing Indicator ─── */
  .typing-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 12px 16px;
    margin-bottom: 12px;
    background: var(--assistant-bubble);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    border-bottom-left-radius: 2px;
    width: fit-content;
    animation: msg-enter-left 200ms ease-out both;
  }
  .typing-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--muted);
    animation: typing-bounce 1.2s ease-in-out infinite;
  }
  .typing-dot:nth-child(2) { animation-delay: 0.15s; }
  .typing-dot:nth-child(3) { animation-delay: 0.3s; }

  @keyframes typing-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-6px); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-indicator { animation: none !important; }
    .typing-dot { animation: none !important; opacity: 0.6; }
  }

  /* ─── Streaming Cursor ─── */
  .sc-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: var(--accent);
    margin-left: 2px;
    vertical-align: text-bottom;
    animation: blink 0.8s step-end infinite;
  }
  @keyframes blink {
    50% { opacity: 0; }
  }

  /* ─── Scroll-to-Bottom Button ─── */
  .scroll-bottom-btn {
    position: absolute;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%) translateY(8px);
    opacity: 0;
    pointer-events: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text);
    padding: 6px 16px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: all var(--transition);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .scroll-bottom-btn.visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }
  .scroll-bottom-btn:hover {
    background: var(--surface-hover);
    border-color: rgba(99,102,241,0.3);
  }
  .scroll-bottom-btn .arrow { font-size: 14px; }

  /* ─── New Messages Pill ─── */
  .new-messages-pill {
    position: absolute;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%) translateY(8px);
    opacity: 0;
    pointer-events: none;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 20px;
    padding: 6px 16px;
    font-size: 12px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition);
    z-index: 11;
    box-shadow: 0 4px 16px rgba(99,102,241,0.3);
  }
  .new-messages-pill.visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }
  .new-messages-pill:hover { background: var(--accent-hover); }

  /* ─── Input Area ─── */
  .chat-input-area {
    padding: 12px 16px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--bg);
    border-top: 1px solid var(--border);
    position: relative;
  }

  .chat-input-wrap {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 8px 12px;
    transition: border-color var(--transition), box-shadow var(--transition);
  }
  .chat-input-wrap:focus-within {
    border-color: rgba(99,102,241,0.4);
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }

  .chat-input-wrap.dragover {
    border-color: var(--accent);
    border-style: dashed;
    background: rgba(99,102,241,0.05);
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }

  .chat-textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    resize: none;
    max-height: calc(1.5em * 6 + 4px); /* ~6 rows */
    overflow-y: auto;
    padding: 2px 0;
    scrollbar-width: none;
  }
  .chat-textarea::-webkit-scrollbar { display: none; }
  .chat-textarea::placeholder { color: var(--muted); }

  .send-btn {
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 8px;
    border: none;
    background: var(--surface-hover);
    color: var(--muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition);
    padding: 0;
    flex-shrink: 0;
  }
  .send-btn:hover { background: var(--accent); color: white; }
  .send-btn.active {
    background: var(--accent);
    color: white;
    animation: send-pulse 2s ease-in-out infinite;
  }
  .send-btn:active { transform: scale(0.92); }
  .send-btn svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
  }

  @keyframes send-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(99,102,241,0.4); }
    50%  { box-shadow: 0 0 0 6px rgba(99,102,241,0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .send-btn.active { animation: none !important; }
  }

  /* ─── File drop indicator overlay ─── */
  .drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(99,102,241,0.08);
    border: 2px dashed var(--accent);
    border-radius: var(--radius);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    font-size: 14px;
    font-weight: 500;
    z-index: 20;
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
  }
  .drop-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  /* ─── Markdown Content Styles ─── */
  .msg-bubble h1, .msg-bubble h2, .msg-bubble h3, .msg-bubble h4 {
    margin: 8px 0 4px;
    font-weight: 600;
    line-height: 1.3;
  }
  .msg-bubble h1 { font-size: 1.3em; }
  .msg-bubble h2 { font-size: 1.15em; }
  .msg-bubble h3 { font-size: 1.05em; }
  .msg-bubble h4 { font-size: 1em; color: var(--muted); }

  .msg-bubble p { margin: 4px 0; }
  .msg-bubble ul, .msg-bubble ol {
    margin: 4px 0;
    padding-left: 20px;
  }
  .msg-bubble li { margin: 2px 0; }

  .msg-bubble blockquote {
    border-left: 3px solid var(--accent);
    margin: 8px 0;
    padding: 4px 12px;
    color: var(--muted);
    background: rgba(255,255,255,0.02);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .msg-bubble a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color var(--transition);
  }
  .msg-bubble a:hover { border-bottom-color: var(--accent); }

  .msg-bubble code {
    background: rgba(255,255,255,0.06);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;
    font-size: 0.9em;
  }

  .msg-bubble strong { font-weight: 600; color: #f4f4f5; }
  .msg-bubble em { font-style: italic; }

  /* ─── Code Blocks ─── */
  .sc-code-wrap {
    margin: 8px 0;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
    background: #0c0c12;
  }
  .sc-code-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 12px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid var(--border);
    font-size: 12px;
  }
  .sc-code-lang { color: var(--muted); text-transform: lowercase; }
  .sc-code-copy {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--muted);
    padding: 2px 8px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
    transition: all var(--transition);
  }
  .sc-code-copy:hover { color: var(--text); border-color: rgba(255,255,255,0.15); }
  .sc-code-copy.copied { color: #22c55e; border-color: rgba(34,197,94,0.3); }

  .sc-code-wrap pre {
    margin: 0;
    padding: 12px;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .sc-code-wrap pre::-webkit-scrollbar { height: 4px; }
  .sc-code-wrap pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  .sc-code-wrap code {
    font-family: 'Geist Mono', 'SF Mono', 'Fira Code', monospace;
    font-size: 13px;
    line-height: 1.5;
    background: none;
    padding: 0;
    border-radius: 0;
  }

  /* ─── File Chips (attached files) ─── */
  .file-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 0 0;
  }
  .file-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: rgba(99,102,241,0.1);
    border: 1px solid rgba(99,102,241,0.2);
    border-radius: 14px;
    font-size: 12px;
    color: var(--text);
  }
  .file-chip-remove {
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    padding: 0;
    border-radius: 50%;
    transition: all var(--transition);
    font-family: inherit;
  }
  .file-chip-remove:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

  /* ─── Mobile ─── */
  @media (max-width: 640px) {
    .chat-messages { padding: 12px 12px 8px; }
    .msg { max-width: 92%; }
    .chat-input-area { padding: 8px 12px; padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px)); }
  }
`;

const TEMPLATE = `
  <div class="drop-overlay">Drop files here</div>
  <div class="chat-messages"></div>
  <div class="empty-state">
    <div class="empty-state-icon">💬</div>
    <h3>Start a conversation</h3>
    <p>Ask anything — I'm here to help you think, build, and explore ideas.</p>
    <div class="suggested-prompts">
      <button class="suggested-prompt">Explain this code</button>
      <button class="suggested-prompt">Help me debug</button>
      <button class="suggested-prompt">Write a function</button>
      <button class="suggested-prompt">Summarize this</button>
    </div>
  </div>
  <button class="scroll-bottom-btn" aria-label="Scroll to bottom">
    <span class="arrow">↓</span> Scroll to bottom
  </button>
  <button class="new-messages-pill">↓ New messages</button>
  <div class="chat-input-area">
    <div class="chat-input-wrap">
      <textarea class="chat-textarea" rows="1" aria-label="Chat input"></textarea>
      <button class="send-btn" aria-label="Send message">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
    <div class="file-chips"></div>
  </div>
`;

class ScChat extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._messages = [];
    this._isTyping = false;
    this._placeholder = 'Type a message…';
    this._userScrolled = false;
    this._pendingFiles = [];
    this._newMsgCount = 0;
    this._dragCounter = 0;
    this._messageIdCounter = 0;

    // Streaming state
    this._streaming = false;
    this._streamEl = null;
    this._streamContent = '';
  }

  /* ─── Observed Attributes ─── */
  static get observedAttributes() {
    return ['placeholder'];
  }

  attributeChangedCallback(name, _old, val) {
    if (name === 'placeholder' && val != null) {
      this._placeholder = val;
      if (this._textareaEl) this._textareaEl.placeholder = val;
    }
  }

  /* ─── Properties ─── */
  get messages() { return [...this._messages]; }
  set messages(arr) {
    this._messages = [];
    this._listEl.innerHTML = '';
    this._updateEmptyState();
    if (Array.isArray(arr) && arr.length > 0) {
      this._loadHistory(arr);
    }
  }

  get isTyping() { return this._isTyping; }
  set isTyping(val) { this.setTyping(!!val); }

  get placeholder() { return this._placeholder; }
  set placeholder(val) {
    this._placeholder = val || 'Type a message…';
    if (this._textareaEl) this._textareaEl.placeholder = this._placeholder;
  }

  /* ─── Lifecycle ─── */
  connectedCallback() {
    const style = document.createElement('style');
    style.textContent = STYLES;
    this.shadowRoot.appendChild(style);

    const container = document.createElement('div');
    container.style.cssText = 'display:flex;flex-direction:column;height:100%;width:100%;position:relative;';
    container.innerHTML = TEMPLATE;
    this.shadowRoot.appendChild(container);

    this._container = container;
    this._listEl = container.querySelector('.chat-messages');
    this._emptyEl = container.querySelector('.empty-state');
    this._textareaEl = container.querySelector('.chat-textarea');
    this._sendBtn = container.querySelector('.send-btn');
    this._scrollBtn = container.querySelector('.scroll-bottom-btn');
    this._newMsgPill = container.querySelector('.new-messages-pill');
    this._inputWrap = container.querySelector('.chat-input-wrap');
    this._dropOverlay = container.querySelector('.drop-overlay');
    this._fileChipsEl = container.querySelector('.file-chips');

    this._textareaEl.placeholder = this._placeholder;

    this._bindEvents();
    this._updateEmptyState();
  }

  disconnectedCallback() {
    // Cleanup handled by GC since we only listen on shadow DOM elements
  }

  /* ─── Event Binding ─── */
  _bindEvents() {
    // Scroll tracking
    this._listEl.addEventListener('scroll', () => {
      const el = this._listEl;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
      const wasScrolled = this._userScrolled;
      this._userScrolled = !atBottom;

      if (atBottom && wasScrolled) {
        this._newMsgCount = 0;
        this._newMsgPill.classList.remove('visible');
      }

      this._scrollBtn.classList.toggle('visible', this._userScrolled && this._messages.length > 0);
      if (!this._newMsgPill.classList.contains('visible')) {
        this._scrollBtn.classList.toggle('visible', this._userScrolled);
      }

      this.dispatchEvent(new CustomEvent('scroll-state', {
        bubbles: true, composed: true,
        detail: { atBottom }
      }));
    });

    // Textarea auto-resize & send button state
    this._textareaEl.addEventListener('input', () => {
      this._autoResize();
      this._sendBtn.classList.toggle('active', this._textareaEl.value.trim().length > 0);
    });

    // Enter to send
    this._textareaEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });

    // Send button
    this._sendBtn.addEventListener('click', () => this._handleSend());

    // Scroll-to-bottom button
    this._scrollBtn.addEventListener('click', () => {
      this._userScrolled = false;
      this._newMsgCount = 0;
      this._newMsgPill.classList.remove('visible');
      this._scrollBtn.classList.remove('visible');
      this.scrollToBottom();
    });

    // New messages pill
    this._newMsgPill.addEventListener('click', () => {
      this._userScrolled = false;
      this._newMsgCount = 0;
      this._newMsgPill.classList.remove('visible');
      this._scrollBtn.classList.remove('visible');
      this.scrollToBottom();
    });

    // Suggested prompts
    this._emptyEl.querySelectorAll('.suggested-prompt').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.textContent;
        this._textareaEl.value = text;
        this._autoResize();
        this._sendBtn.classList.add('active');
        this._textareaEl.focus();
      });
    });

    // Drag & drop
    this._container.addEventListener('dragenter', (e) => {
      e.preventDefault();
      this._dragCounter++;
      if (this._dragCounter === 1) {
        this._dropOverlay.classList.add('visible');
        this._inputWrap.classList.add('dragover');
      }
    });

    this._container.addEventListener('dragleave', (e) => {
      e.preventDefault();
      this._dragCounter--;
      if (this._dragCounter <= 0) {
        this._dragCounter = 0;
        this._dropOverlay.classList.remove('visible');
        this._inputWrap.classList.remove('dragover');
      }
    });

    this._container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    this._container.addEventListener('drop', (e) => {
      e.preventDefault();
      this._dragCounter = 0;
      this._dropOverlay.classList.remove('visible');
      this._inputWrap.classList.remove('dragover');

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        this._addFiles(files);
      }
    });
  }

  /* ─── File Handling ─── */
  _addFiles(files) {
    for (const file of files) {
      this._pendingFiles.push(file);
    }
    this._renderFileChips();
    this._sendBtn.classList.add('active');
  }

  _renderFileChips() {
    this._fileChipsEl.innerHTML = '';
    this._pendingFiles.forEach((file, idx) => {
      const chip = document.createElement('span');
      chip.className = 'file-chip';
      chip.innerHTML = `
        📎 ${this._escapeHtml(this._truncateFilename(file.name, 24))}
        <button class="file-chip-remove" data-idx="${idx}" aria-label="Remove file">×</button>
      `;
      chip.querySelector('.file-chip-remove').addEventListener('click', () => {
        this._pendingFiles.splice(idx, 1);
        this._renderFileChips();
        if (this._pendingFiles.length === 0 && !this._textareaEl.value.trim()) {
          this._sendBtn.classList.remove('active');
        }
      });
      this._fileChipsEl.appendChild(chip);
    });
  }

  _truncateFilename(name, max) {
    if (name.length <= max) return name;
    const ext = name.lastIndexOf('.');
    if (ext > 0 && name.length - ext < 8) {
      const extStr = name.slice(ext);
      return name.slice(0, max - extStr.length - 1) + '…' + extStr;
    }
    return name.slice(0, max - 1) + '…';
  }

  /* ─── Auto-resize Textarea ─── */
  _autoResize() {
    const ta = this._textareaEl;
    ta.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 21;
    const maxHeight = lineHeight * 6 + 4;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
  }

  /* ─── Send ─── */
  _handleSend() {
    const text = this._textareaEl.value.trim();
    const files = [...this._pendingFiles];

    if (!text && files.length === 0) return;

    this._textareaEl.value = '';
    this._textareaEl.style.height = 'auto';
    this._sendBtn.classList.remove('active');
    this._pendingFiles = [];
    this._renderFileChips();

    this.dispatchEvent(new CustomEvent('message-send', {
      bubbles: true, composed: true,
      detail: { text, files }
    }));
  }

  /* ─── Empty State ─── */
  _updateEmptyState() {
    if (!this._emptyEl) return;
    const hasMessages = this._messages.length > 0 || this._listEl.children.length > 0;
    this._emptyEl.classList.toggle('hidden', hasMessages);
    this._listEl.style.display = hasMessages ? '' : 'none';
  }

  /* ─── Public API ─── */

  /**
   * Add a message to the chat.
   * @param {object} msg - { role: 'user'|'assistant'|'system', content: string, id?: string, timestamp?: number }
   */
  addMessage(msg) {
    if (!msg || !msg.role) return;
    const message = {
      id: msg.id || `msg-${++this._messageIdCounter}`,
      role: msg.role,
      content: msg.content || '',
      timestamp: msg.timestamp || Date.now()
    };
    this._messages.push(message);
    this._renderMessage(message);
    this._updateEmptyState();

    if (this._userScrolled) {
      this._newMsgCount++;
      this._newMsgPill.textContent = `↓ ${this._newMsgCount} new message${this._newMsgCount > 1 ? 's' : ''}`;
      this._newMsgPill.classList.add('visible');
      this._scrollBtn.classList.remove('visible');
    } else {
      this._doScrollToBottom();
    }
  }

  /**
   * Set typing indicator state.
   * @param {boolean} isTyping
   */
  setTyping(isTyping) {
    isTyping = !!isTyping;
    if (this._isTyping === isTyping) return;
    this._isTyping = isTyping;

    const existing = this._listEl.querySelector('.typing-indicator');
    if (isTyping && !existing) {
      const el = document.createElement('div');
      el.className = 'typing-indicator';
      el.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
      this._listEl.appendChild(el);
      if (!this._userScrolled) this._doScrollToBottom();
    } else if (!isTyping && existing) {
      existing.remove();
    }
  }

  /**
   * Scroll to the bottom of the message list.
   */
  scrollToBottom() {
    this._userScrolled = false;
    this._doScrollToBottom();
  }

  _doScrollToBottom() {
    requestAnimationFrame(() => {
      if (this._listEl) {
        this._listEl.scrollTop = this._listEl.scrollHeight;
      }
    });
  }

  /* ─── Streaming API (kept for backward compat) ─── */

  /** @deprecated Use appendMessage-based APIs. Kept for streaming support. */
  appendMessage(role, content, opts = {}) {
    this.addMessage({
      role,
      content,
      timestamp: opts.timestamp || Date.now()
    });
  }

  showTyping() { this.setTyping(true); }
  hideTyping() { this.setTyping(false); }

  startStreaming() {
    this.setTyping(false);
    this._streaming = true;
    this._streamContent = '';

    const wrap = document.createElement('div');
    wrap.className = 'msg msg--assistant';

    const actionsEl = this._createActions('assistant', null);
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = '<span class="sc-cursor"></span>';

    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = this._formatTime(Date.now());

    wrap.appendChild(actionsEl);
    wrap.appendChild(bubble);
    wrap.appendChild(time);
    this._listEl.appendChild(wrap);

    this._streamEl = bubble;
    this._streamWrap = wrap;
    this._updateEmptyState();
    if (!this._userScrolled) this._doScrollToBottom();
  }

  appendStreamChunk(text) {
    if (!this._streaming || !this._streamEl) return;
    this._streamContent += text;
    this._streamEl.innerHTML = this._renderMarkdown(this._streamContent) + '<span class="sc-cursor"></span>';
    this._attachCodeCopyButtons(this._streamEl);
    if (!this._userScrolled) this._doScrollToBottom();
  }

  endStreaming() {
    if (!this._streaming || !this._streamEl) return;

    const id = `msg-${++this._messageIdCounter}`;
    this._streamEl.innerHTML = this._renderMarkdown(this._streamContent);
    this._attachCodeCopyButtons(this._streamEl);

    const msg = {
      id,
      role: 'assistant',
      content: this._streamContent,
      timestamp: Date.now()
    };
    this._messages.push(msg);

    // Update actions with proper message id
    if (this._streamWrap) {
      const oldActions = this._streamWrap.querySelector('.msg-actions');
      if (oldActions) {
        const newActions = this._createActions('assistant', id);
        this._streamWrap.replaceChild(newActions, oldActions);
      }
    }

    this._streaming = false;
    this._streamEl = null;
    this._streamWrap = null;
    this._streamContent = '';
    if (!this._userScrolled) this._doScrollToBottom();
  }

  getMessages() { return [...this._messages]; }

  clear() {
    this._messages = [];
    this._listEl.innerHTML = '';
    this._streaming = false;
    this._streamEl = null;
    this._streamWrap = null;
    this._streamContent = '';
    this._isTyping = false;
    this._newMsgCount = 0;
    this._newMsgPill.classList.remove('visible');
    this._scrollBtn.classList.remove('visible');
    this._updateEmptyState();
  }

  /* ─── Staggered History Load ─── */
  _loadHistory(messages) {
    messages.forEach((msg, i) => {
      const message = {
        id: msg.id || `msg-${++this._messageIdCounter}`,
        role: msg.role,
        content: msg.content || '',
        timestamp: msg.timestamp || Date.now()
      };
      this._messages.push(message);
      setTimeout(() => {
        this._renderMessage(message);
        this._updateEmptyState();
        if (i === messages.length - 1) {
          this._doScrollToBottom();
        }
      }, i * 50);
    });
  }

  /* ─── Render Single Message ─── */
  _renderMessage(msg) {
    const wrap = document.createElement('div');
    wrap.className = `msg msg--${msg.role}`;
    wrap.dataset.msgId = msg.id;

    if (msg.role === 'system') {
      const bubble = document.createElement('div');
      bubble.className = 'msg-bubble';
      bubble.textContent = msg.content;
      wrap.appendChild(bubble);
      this._listEl.appendChild(wrap);
      return;
    }

    // Actions
    const actions = this._createActions(msg.role, msg.id);
    wrap.appendChild(actions);

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = this._renderMarkdown(msg.content);
    this._attachCodeCopyButtons(bubble);

    // Time
    const time = document.createElement('span');
    time.className = 'msg-time';
    time.textContent = this._formatTime(msg.timestamp);

    wrap.appendChild(bubble);
    wrap.appendChild(time);

    // Insert before typing indicator if present
    const typingEl = this._listEl.querySelector('.typing-indicator');
    if (typingEl) {
      this._listEl.insertBefore(wrap, typingEl);
    } else {
      this._listEl.appendChild(wrap);
    }
  }

  /* ─── Message Actions ─── */
  _createActions(role, msgId) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    // Copy button (always)
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.title = 'Copy message';
    copyBtn.innerHTML = '📋';
    copyBtn.addEventListener('click', () => {
      const msg = this._messages.find(m => m.id === msgId);
      const text = msg ? msg.content : '';
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerHTML = '✓';
        copyBtn.classList.add('copied');
        setTimeout(() => {
          copyBtn.innerHTML = '📋';
          copyBtn.classList.remove('copied');
        }, 1500);
      }).catch(() => {});
    });
    actions.appendChild(copyBtn);

    // Retry button (assistant only)
    if (role === 'assistant') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'msg-action-btn';
      retryBtn.title = 'Retry';
      retryBtn.innerHTML = '↻';
      retryBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('message-retry', {
          bubbles: true, composed: true,
          detail: { messageId: msgId }
        }));
      });
      actions.appendChild(retryBtn);
    }

    return actions;
  }

  /* ─── Markdown Renderer ─── */
  _renderMarkdown(src) {
    if (!src) return '';

    const codeBlocks = [];
    let text = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code });
      return `\x00CB${idx}\x00`;
    });

    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (_, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(code);
      return `\x00IC${idx}\x00`;
    });

    const lines = text.split('\n');
    const out = [];
    let inList = false;
    let inBlockquote = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      const cbMatch = line.match(/^\x00CB(\d+)\x00$/);
      if (cbMatch) {
        if (inList) { out.push('</ul>'); inList = false; }
        if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
        const blk = codeBlocks[+cbMatch[1]];
        const escaped = this._escapeHtml(blk.code);
        const langAttr = blk.lang ? ` class="language-${this._escapeHtml(blk.lang)}"` : '';
        const langLabel = blk.lang ? blk.lang : '';
        out.push(
          `<div class="sc-code-wrap">` +
          `<div class="sc-code-header"><span class="sc-code-lang">${this._escapeHtml(langLabel)}</span>` +
          `<button class="sc-code-copy" data-code>Copy</button></div>` +
          `<pre><code${langAttr}>${escaped}</code></pre></div>`
        );
        continue;
      }

      const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headerMatch) {
        if (inList) { out.push('</ul>'); inList = false; }
        if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
        const level = headerMatch[1].length;
        out.push(`<h${level}>${this._inlineMarkdown(headerMatch[2])}</h${level}>`);
        continue;
      }

      if (line.startsWith('> ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true; }
        out.push(this._inlineMarkdown(line.slice(2)));
        continue;
      } else if (inBlockquote) {
        out.push('</blockquote>');
        inBlockquote = false;
      }

      if (/^[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${this._inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`);
        continue;
      } else if (inList) {
        out.push('</ul>');
        inList = false;
      }

      if (line.trim() === '') {
        out.push('<br>');
        continue;
      }

      out.push(this._inlineMarkdown(line) + '<br>');
    }

    if (inList) out.push('</ul>');
    if (inBlockquote) out.push('</blockquote>');

    let html = out.join('\n');

    html = html.replace(/\x00IC(\d+)\x00/g, (_, idx) => {
      return `<code>${this._escapeHtml(inlineCodes[+idx])}</code>`;
    });

    html = html.replace(/(<br>\s*)+$/, '');
    return html;
  }

  _inlineMarkdown(text) {
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return text;
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── Code Copy Buttons ─── */
  _attachCodeCopyButtons(container) {
    container.querySelectorAll('.sc-code-copy[data-code]').forEach(btn => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        const pre = btn.closest('.sc-code-wrap')?.querySelector('pre code');
        if (!pre) return;
        navigator.clipboard.writeText(pre.textContent).then(() => {
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 1500);
        }).catch(() => {
          const range = document.createRange();
          range.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
      });
    });
  }

  /* ─── Time Formatting ─── */
  _formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

customElements.define('sc-chat', ScChat);
export default ScChat;
