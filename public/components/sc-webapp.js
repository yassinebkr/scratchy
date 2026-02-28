/**
 * sc-webapp — Web App Embedding Surface (Tier 1 + Tier 2)
 *
 * Loads any URL in a sandboxed iframe inside the canvas workspace.
 * Tier 1 = "dumb embed" — just an iframe, no communication.
 * Tier 2 = "smart widget" — postMessage bridge via Widget SDK.
 *          Auto-upgrades to Tier 2 when widget sends scratchy:ready.
 *
 * Usage:
 *   <sc-webapp url="https://excalidraw.com" title="Whiteboard"></sc-webapp>
 *
 * Events dispatched:
 *   'webapp-close'      — user clicked close button
 *   'webapp-reload'     — user clicked reload
 *   'webapp-popout'     — user clicked popout (open in new tab)
 *   'webapp-action'     — widget triggered an action (Tier 2)
 *   'webapp-canvas-ops' — widget pushed canvas ops (Tier 2)
 *   'webapp-toast'      — widget wants to show a toast (Tier 2)
 *   'webapp-navigate'   — widget wants to navigate (Tier 2)
 *   'webapp-ready'      — widget upgraded to Tier 2
 */

import { WidgetBridge } from '../lib/widget-bridge.js';

const SANDBOX_FLAGS = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-modals',
].join(' ');

const TEMPLATE = `
<style>
  :host {
    display: flex;
    flex-direction: column;
    background: var(--bg, #0a0a0f);
    border-radius: var(--radius, 8px);
    overflow: hidden;
    min-height: 200px;
  }
  .header {
    display: flex;
    align-items: center;
    height: 36px;
    min-height: 36px;
    padding: 0 10px;
    background: rgba(255,255,255,0.03);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    gap: 8px;
    user-select: none;
  }
  .header-icon {
    width: 16px;
    height: 16px;
    opacity: 0.5;
  }
  .header-title {
    flex: 1;
    font-size: 11px;
    font-weight: 500;
    color: rgba(255,255,255,0.6);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-url {
    font-size: 10px;
    color: rgba(255,255,255,0.25);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-actions {
    display: flex;
    gap: 4px;
  }
  .header-btn {
    background: none;
    border: none;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, background 0.15s;
  }
  .header-btn:hover {
    color: rgba(255,255,255,0.8);
    background: rgba(255,255,255,0.06);
  }
  .header-btn svg {
    width: 14px;
    height: 14px;
  }
  .iframe-container {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
  iframe {
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg, #0a0a0f);
    color: rgba(255,255,255,0.4);
    font-size: 12px;
    transition: opacity 0.3s;
  }
  .loading.hidden { opacity: 0; pointer-events: none; }
  .error {
    padding: 20px;
    text-align: center;
    color: rgba(255,255,255,0.5);
    font-size: 13px;
  }
  .error a {
    color: var(--accent, #f9a602);
    text-decoration: underline;
  }
</style>

<div class="header">
  <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>
  </svg>
  <span class="header-title"></span>
  <span class="header-url"></span>
  <div class="header-actions">
    <button class="header-btn" data-action="reload" title="Reload">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
      </svg>
    </button>
    <button class="header-btn" data-action="popout" title="Open in new tab">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </button>
    <button class="header-btn" data-action="close" title="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>
</div>
<div class="iframe-container">
  <div class="loading">Loading...</div>
</div>
`;

export class ScWebapp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = TEMPLATE;

    this._iframe = null;
    this._url = '';
    this._title = '';
    /** @type {WidgetBridge|null} */
    this._bridge = null;
    this._tier = 1; // 1 = dumb embed, 2 = smart widget

    // Wire header button actions
    this.shadowRoot.querySelectorAll('.header-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'reload') this._reload();
        else if (action === 'popout') this._popout();
        else if (action === 'close') this._close();
      });
    });
  }

  static get observedAttributes() { return ['url', 'title']; }

  attributeChangedCallback(name, old, val) {
    if (name === 'url' && val !== old) this._loadUrl(val);
    if (name === 'title') this._updateTitle(val);
  }

  connectedCallback() {
    const url = this.getAttribute('url');
    const title = this.getAttribute('title');
    if (url) this._loadUrl(url);
    if (title) this._updateTitle(title);
  }

  /** Load a URL into the iframe */
  _loadUrl(url) {
    this._url = url || '';
    const container = this.shadowRoot.querySelector('.iframe-container');
    const loading = this.shadowRoot.querySelector('.loading');

    // Remove existing iframe
    if (this._iframe) {
      this._iframe.remove();
      this._iframe = null;
    }

    if (!url) return;

    // Validate URL
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      container.innerHTML = '<div class="error">Invalid URL. <a href="#" class="retry">Try again</a></div>';
      return;
    }

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      container.innerHTML = `<div class="error">Only HTTP/HTTPS URLs are supported.</div>`;
      return;
    }

    // Show loading
    if (loading) loading.classList.remove('hidden');

    // Create sandboxed iframe
    const iframe = document.createElement('iframe');
    iframe.sandbox = SANDBOX_FLAGS;
    iframe.allow = 'clipboard-write; clipboard-read';
    iframe.src = url;
    iframe.title = this._title || parsed.hostname;

    iframe.addEventListener('load', () => {
      if (loading) loading.classList.add('hidden');
    });

    iframe.addEventListener('error', () => {
      if (loading) loading.classList.add('hidden');
      container.innerHTML = `<div class="error">Failed to load <strong>${parsed.hostname}</strong>.<br><a href="${url}" target="_blank" rel="noopener">Open in new tab</a> instead.</div>`;
    });

    container.appendChild(iframe);
    this._iframe = iframe;

    // Destroy old bridge if any
    if (this._bridge) {
      this._bridge.destroy();
      this._bridge = null;
      this._tier = 1;
    }

    // Set up Tier 2 bridge — auto-upgrades if widget sends scratchy:ready
    this._bridge = new WidgetBridge(iframe, {
      url,
      widgetId: this.getAttribute('widget-id') || `webapp-${Date.now()}`,
      userId: this.getAttribute('user-id') || undefined,
      agentId: this.getAttribute('agent-id') || undefined,
      onAction: (action, data) => {
        this._tier = 2;
        this.dispatchEvent(new CustomEvent('webapp-action', {
          bubbles: true, composed: true,
          detail: { action, data, url: this._url },
        }));
      },
      onResize: ({ width, height }) => {
        if (width) this.style.width = `${width}px`;
        if (height) this.style.height = `${height}px`;
      },
      onCanvasOps: (ops) => {
        this.dispatchEvent(new CustomEvent('webapp-canvas-ops', {
          bubbles: true, composed: true,
          detail: { ops, url: this._url },
        }));
      },
      onToast: (message, severity) => {
        this.dispatchEvent(new CustomEvent('webapp-toast', {
          bubbles: true, composed: true,
          detail: { message, severity },
        }));
      },
      onNavigate: (navUrl, target) => {
        this.dispatchEvent(new CustomEvent('webapp-navigate', {
          bubbles: true, composed: true,
          detail: { url: navUrl, target },
        }));
      },
      onRequest: async (method, params) => {
        // Extensible request handler — widgets can request data from host
        if (method === 'getAgents') {
          // Return list of agents (requires fetch to server)
          const res = await fetch('/api/agents', { credentials: 'same-origin' });
          if (!res.ok) throw new Error('Failed to fetch agents');
          return await res.json();
        }
        if (method === 'getTheme') {
          return this._bridge?._getTheme();
        }
        throw new Error(`Unknown method: ${method}`);
      },
    });

    // Update URL display in header
    const urlEl = this.shadowRoot.querySelector('.header-url');
    if (urlEl) urlEl.textContent = parsed.hostname;
  }

  _updateTitle(title) {
    this._title = title || '';
    const el = this.shadowRoot.querySelector('.header-title');
    if (el) el.textContent = title || 'Web App';
  }

  _reload() {
    if (this._iframe && this._url) {
      this._iframe.src = this._url;
    }
  }

  _popout() {
    if (this._url) window.open(this._url, '_blank', 'noopener');
  }

  _close() {
    if (this._bridge) {
      this._bridge.destroy();
      this._bridge = null;
    }
    this.dispatchEvent(new CustomEvent('webapp-close', { bubbles: true, composed: true, detail: { url: this._url } }));
    this.remove();
  }

  disconnectedCallback() {
    if (this._bridge) {
      this._bridge.destroy();
      this._bridge = null;
    }
  }

  // ── Public API ─────────────────────────────────────────────

  /** Set URL programmatically */
  set url(val) { this.setAttribute('url', val); }
  get url() { return this._url; }

  set title(val) { this.setAttribute('title', val); }

  /** Current tier (1 = dumb embed, 2 = smart widget with bridge) */
  get tier() { return this._tier; }

  /** The widget bridge (Tier 2 only) */
  get bridge() { return this._bridge; }

  /** Send data to the widget (Tier 2) */
  sendData(key, value) {
    if (this._bridge) this._bridge.sendData(key, value);
  }

  /** Send a command to the widget (Tier 2) */
  sendCommand(command, args = {}) {
    if (this._bridge) this._bridge.sendCommand(command, args);
  }
}

customElements.define('sc-webapp', ScWebapp);
