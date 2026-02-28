/**
 * Scratchy Widget SDK — include this in your widget to communicate with Scratchy.
 *
 * Usage:
 *   <script src="https://your-scratchy-instance/sdk/widget.js"></script>
 *   <script>
 *     const widget = new ScratchyWidget({
 *       name: 'My Widget',
 *       permissions: ['canvas', 'toast'],
 *       onInit(config) { console.log('Initialized:', config); },
 *       onData(key, value) { console.log('Data:', key, value); },
 *       onCommand(cmd, args) { console.log('Command:', cmd, args); },
 *     });
 *   </script>
 *
 * API:
 *   widget.action(name, data)     — Trigger a host-side action
 *   widget.toast(message, sev)    — Show a toast notification
 *   widget.resize(width, height)  — Request resize
 *   widget.navigate(url, target)  — Ask host to navigate
 *   widget.canvasOps(ops)         — Push GenUI canvas ops
 *   widget.request(method, params) — Request/response pattern (returns Promise)
 *
 * @version 1.0.0
 */

(function (global) {
  'use strict';

  /**
   * @typedef {Object} WidgetOpts
   * @property {string}   name          — Widget name
   * @property {string}   [description] — Short description
   * @property {string}   [icon]        — Emoji or icon URL
   * @property {string}   [author]      — Author name
   * @property {string}   [version]     — Widget version
   * @property {string[]} [permissions] — Requested permissions
   * @property {(config: Object) => void} [onInit]    — Called when host sends init
   * @property {(key: string, value: any) => void} [onData]    — Called on data push
   * @property {(cmd: string, args: Object) => void} [onCommand] — Called on host command
   * @property {(theme: Object) => void} [onTheme]   — Called on theme change
   */

  class ScratchyWidget {
    /**
     * @param {WidgetOpts} opts
     */
    constructor(opts = {}) {
      this._opts = opts;
      this._widgetId = null;
      this._config = null;
      this._theme = null;
      this._ready = false;

      /** @type {Map<string, {resolve: Function, reject: Function}>} */
      this._pendingRequests = new Map();
      this._nextNonce = 1;

      // Listen for messages from host
      window.addEventListener('message', (e) => this._handleMessage(e));

      // Send ready signal
      this._sendReady();
    }

    /** Widget instance ID (assigned by host on init) */
    get widgetId() { return this._widgetId; }

    /** Configuration received from host */
    get config() { return this._config; }

    /** Current theme */
    get theme() { return this._theme; }

    /** Whether the widget has been initialized by the host */
    get initialized() { return this._ready; }

    // ── Widget → Host ──────────────────────────────────────────

    /**
     * Trigger an action on the host (e.g., send a message to the agent).
     * @param {string} action — Action name
     * @param {*} data — Action payload
     */
    action(action, data = {}) {
      this._post('scratchy:action', { action, data });
    }

    /**
     * Show a toast notification in the host UI.
     * @param {string} message
     * @param {'info'|'success'|'warning'|'error'} [severity='info']
     */
    toast(message, severity = 'info') {
      this._post('scratchy:toast', { message, severity });
    }

    /**
     * Request the host to resize this widget's iframe.
     * @param {number} [width]
     * @param {number} [height]
     */
    resize(width, height) {
      this._post('scratchy:resize', { width, height });
    }

    /**
     * Ask the host to navigate to a URL.
     * @param {string} url
     * @param {'_blank'|'_self'|'surface'} [target='_blank']
     */
    navigate(url, target = '_blank') {
      this._post('scratchy:navigate', { url, target });
    }

    /**
     * Push GenUI canvas operations to the host's canvas.
     * Requires 'canvas' permission.
     * @param {Object[]} ops — Array of GenUI ops
     */
    canvasOps(ops) {
      this._post('scratchy:canvas', { ops });
    }

    /**
     * Make a request to the host and wait for a response.
     * @param {string} method — Method name
     * @param {*} params — Parameters
     * @returns {Promise<*>}
     */
    request(method, params = {}) {
      return new Promise((resolve, reject) => {
        const nonce = `req-${this._nextNonce++}`;
        this._pendingRequests.set(nonce, { resolve, reject });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (this._pendingRequests.has(nonce)) {
            this._pendingRequests.delete(nonce);
            reject(new Error('Request timed out'));
          }
        }, 30000);

        this._post('scratchy:request', { method, params }, nonce);
      });
    }

    // ── Message handling ─────────────────────────────────────────

    _handleMessage(event) {
      const { type, payload } = event.data || {};
      if (!type || !type.startsWith('scratchy:')) return;

      switch (type) {
        case 'scratchy:init':
          this._widgetId = payload?.widgetId;
          this._config = payload?.config;
          this._theme = payload?.theme;
          this._ready = true;
          if (this._opts.onInit) this._opts.onInit(payload?.config || {});
          break;

        case 'scratchy:data':
          if (this._opts.onData && payload) {
            this._opts.onData(payload.key, payload.value);
          }
          break;

        case 'scratchy:command':
          if (this._opts.onCommand && payload) {
            this._opts.onCommand(payload.command, payload.args);
          }
          break;

        case 'scratchy:theme':
          this._theme = payload;
          if (this._opts.onTheme) this._opts.onTheme(payload);
          break;

        case 'scratchy:response':
          if (payload?.nonce && this._pendingRequests.has(payload.nonce)) {
            const { resolve, reject } = this._pendingRequests.get(payload.nonce);
            this._pendingRequests.delete(payload.nonce);
            if (payload.error) {
              reject(new Error(payload.error));
            } else {
              resolve(payload.result);
            }
          }
          break;
      }
    }

    // ── Helpers ──────────────────────────────────────────────────

    _sendReady() {
      const manifest = {
        name: this._opts.name || 'Unknown Widget',
        description: this._opts.description,
        icon: this._opts.icon,
        author: this._opts.author,
        version: this._opts.version,
        permissions: this._opts.permissions || [],
      };
      this._post('scratchy:ready', { manifest });
    }

    _post(type, payload, nonce) {
      try {
        const msg = { type, payload };
        if (nonce) msg.nonce = nonce;
        window.parent.postMessage(msg, '*');
      } catch {
        // Not in an iframe or parent blocked
      }
    }
  }

  // Expose globally
  global.ScratchyWidget = ScratchyWidget;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
