/**
 * Scratchy v2 — <sc-chat> Web Component
 * Full chat UI with markdown rendering, streaming, and code blocks.
 */

class ScChat extends HTMLElement {
  constructor() {
    super();
    this._messages = [];
    this._streaming = false;
    this._streamEl = null;      // current streaming bubble element
    this._streamContent = '';    // raw markdown accumulator for current stream
    this._userScrolled = false;
    this._typing = false;
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="sc-chat">
        <div class="sc-chat-messages"></div>
        <div class="sc-chat-input">
          <textarea rows="1" placeholder="Type a message\u2026" aria-label="Chat input"></textarea>
          <button class="sc-chat-send" aria-label="Send">&#9654;</button>
        </div>
      </div>
    `;

    this._listEl = this.querySelector('.sc-chat-messages');
    this._inputEl = this.querySelector('textarea');
    this._sendBtn = this.querySelector('.sc-chat-send');

    // Scroll tracking: detect when user scrolled up
    this._listEl.addEventListener('scroll', () => {
      const el = this._listEl;
      this._userScrolled = el.scrollTop + el.clientHeight < el.scrollHeight - 40;
    });

    // Input: auto-resize textarea
    this._inputEl.addEventListener('input', () => this._autoResize());

    // Send on Enter (Shift+Enter = newline)
    this._inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });

    this._sendBtn.addEventListener('click', () => this._handleSend());
  }

  /* ─── Auto-resize textarea ─── */
  _autoResize() {
    const ta = this._inputEl;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
  }

  /* ─── Send handler ─── */
  _handleSend() {
    const text = this._inputEl.value.trim();
    if (!text) return;

    this._inputEl.value = '';
    this._inputEl.style.height = 'auto';

    this.dispatchEvent(new CustomEvent('chat-send', {
      bubbles: true,
      detail: { text }
    }));
  }

  /* ─── Public API ─── */

  /**
   * Append a message to the chat.
   * @param {'user'|'assistant'|'system'} role
   * @param {string} content - raw text / markdown
   * @param {object} [opts]
   * @param {number} [opts.timestamp] - epoch ms, defaults to now
   */
  appendMessage(role, content, opts = {}) {
    const ts = opts.timestamp || Date.now();
    const msg = { role, content, ts };
    this._messages.push(msg);
    this._renderMessage(msg);
    this._scrollToBottom();
  }

  /** Show typing indicator (three dots) */
  showTyping() {
    if (this._typing) return;
    this._typing = true;
    const el = document.createElement('div');
    el.className = 'sc-typing';
    el.id = 'sc-typing-indicator';
    el.innerHTML = '<span class="sc-typing-dot"></span><span class="sc-typing-dot"></span><span class="sc-typing-dot"></span>';
    this._listEl.appendChild(el);
    this._scrollToBottom();
  }

  /** Hide typing indicator */
  hideTyping() {
    if (!this._typing) return;
    this._typing = false;
    const el = this._listEl.querySelector('#sc-typing-indicator');
    if (el) el.remove();
  }

  /**
   * Begin streaming an assistant message.
   * Creates an empty bubble with a blinking cursor.
   */
  startStreaming() {
    this.hideTyping();
    this._streaming = true;
    this._streamContent = '';

    const wrap = document.createElement('div');
    wrap.className = 'sc-msg sc-msg--assistant';

    const bubble = document.createElement('div');
    bubble.className = 'sc-msg-bubble';
    bubble.innerHTML = '<span class="sc-cursor"></span>';

    const time = document.createElement('span');
    time.className = 'sc-msg-time';
    time.textContent = this._formatTime(Date.now());

    wrap.appendChild(bubble);
    wrap.appendChild(time);
    this._listEl.appendChild(wrap);

    this._streamEl = bubble;
    this._scrollToBottom();
  }

  /**
   * Append a text chunk to the current streaming message.
   * Re-renders markdown each time (simple and correct).
   * @param {string} text
   */
  appendStreamChunk(text) {
    if (!this._streaming || !this._streamEl) return;
    this._streamContent += text;
    this._streamEl.innerHTML = this._renderMarkdown(this._streamContent) + '<span class="sc-cursor"></span>';
    this._attachCodeCopyButtons(this._streamEl);
    this._scrollToBottom();
  }

  /**
   * Finalize the streaming message — remove cursor, store in messages array.
   */
  endStreaming() {
    if (!this._streaming || !this._streamEl) return;

    this._streamEl.innerHTML = this._renderMarkdown(this._streamContent);
    this._attachCodeCopyButtons(this._streamEl);

    this._messages.push({
      role: 'assistant',
      content: this._streamContent,
      ts: Date.now()
    });

    this._streaming = false;
    this._streamEl = null;
    this._streamContent = '';
    this._scrollToBottom();
  }

  /** Get all messages */
  getMessages() {
    return [...this._messages];
  }

  /** Clear chat */
  clear() {
    this._messages = [];
    this._listEl.innerHTML = '';
    this._streaming = false;
    this._streamEl = null;
    this._streamContent = '';
    this._typing = false;
  }

  /* ─── Render a single message DOM node ─── */
  _renderMessage(msg) {
    if (msg.role === 'system') {
      const wrap = document.createElement('div');
      wrap.className = 'sc-msg sc-msg--system';
      const bubble = document.createElement('div');
      bubble.className = 'sc-msg-bubble';
      bubble.textContent = msg.content;
      wrap.appendChild(bubble);
      this._listEl.appendChild(wrap);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = `sc-msg sc-msg--${msg.role}`;

    const bubble = document.createElement('div');
    bubble.className = 'sc-msg-bubble';
    bubble.innerHTML = this._renderMarkdown(msg.content);
    this._attachCodeCopyButtons(bubble);

    const time = document.createElement('span');
    time.className = 'sc-msg-time';
    time.textContent = this._formatTime(msg.ts);

    wrap.appendChild(bubble);
    wrap.appendChild(time);
    this._listEl.appendChild(wrap);
  }

  /* ─── Markdown Renderer ─── */
  _renderMarkdown(src) {
    if (!src) return '';

    // Collect code blocks first so we don't mangle them
    const codeBlocks = [];
    let text = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code });
      return `\x00CB${idx}\x00`;
    });

    // Inline code — protect from further processing
    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (_, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(code);
      return `\x00IC${idx}\x00`;
    });

    // Split into lines for block-level processing
    const lines = text.split('\n');
    const out = [];
    let inList = false;
    let inBlockquote = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code block placeholder
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

      // Headers h1-h4
      const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headerMatch) {
        if (inList) { out.push('</ul>'); inList = false; }
        if (inBlockquote) { out.push('</blockquote>'); inBlockquote = false; }
        const level = headerMatch[1].length;
        out.push(`<h${level}>${this._inlineMarkdown(headerMatch[2])}</h${level}>`);
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        if (inList) { out.push('</ul>'); inList = false; }
        if (!inBlockquote) { out.push('<blockquote>'); inBlockquote = true; }
        out.push(this._inlineMarkdown(line.slice(2)));
        continue;
      } else if (inBlockquote) {
        out.push('</blockquote>');
        inBlockquote = false;
      }

      // Unordered list
      if (/^[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${this._inlineMarkdown(line.replace(/^[-*]\s+/, ''))}</li>`);
        continue;
      } else if (inList) {
        out.push('</ul>');
        inList = false;
      }

      // Empty line → margin break
      if (line.trim() === '') {
        out.push('<br>');
        continue;
      }

      // Regular paragraph line
      out.push(this._inlineMarkdown(line) + '<br>');
    }

    if (inList) out.push('</ul>');
    if (inBlockquote) out.push('</blockquote>');

    let html = out.join('\n');

    // Restore inline code
    html = html.replace(/\x00IC(\d+)\x00/g, (_, idx) => {
      return `<code>${this._escapeHtml(inlineCodes[+idx])}</code>`;
    });

    // Remove trailing <br>
    html = html.replace(/(<br>\s*)+$/, '');

    return html;
  }

  /** Inline markdown: bold, italic, links */
  _inlineMarkdown(text) {
    // Bold **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic *text* (but not inside bold)
    text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    // Links [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return text;
  }

  /** Escape HTML entities */
  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ─── Code copy buttons ─── */
  _attachCodeCopyButtons(container) {
    container.querySelectorAll('.sc-code-copy[data-code]').forEach(btn => {
      // Only attach once
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', () => {
        const pre = btn.closest('.sc-code-wrap')?.querySelector('pre code');
        if (!pre) return;
        const code = pre.textContent;
        navigator.clipboard.writeText(code).then(() => {
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 1500);
        }).catch(() => {
          // Fallback — select text
          const range = document.createRange();
          range.selectNodeContents(pre);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
      });
    });
  }

  /* ─── Auto scroll ─── */
  _scrollToBottom() {
    if (this._userScrolled) return;
    requestAnimationFrame(() => {
      this._listEl.scrollTop = this._listEl.scrollHeight;
    });
  }

  /* ─── Time formatting ─── */
  _formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

customElements.define('sc-chat', ScChat);

export default ScChat;
