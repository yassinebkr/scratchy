/**
 * @module widget-bridge
 * Host-side Widget Bridge — manages postMessage communication with iframe widgets.
 *
 * Protocol: All messages use { type: 'scratchy:<event>', payload, nonce? }
 *
 * Host → Widget:
 *   scratchy:init      — { config, theme, userId, agentId }
 *   scratchy:data      — { key, value }
 *   scratchy:theme     — { theme, accent }
 *   scratchy:command   — { command, args }
 *   scratchy:response  — { nonce, result, error? }
 *
 * Widget → Host:
 *   scratchy:ready     — { manifest? }
 *   scratchy:action    — { action, data }
 *   scratchy:resize    — { width?, height? }
 *   scratchy:request   — { nonce, method, params }
 *   scratchy:navigate  — { url, target? }
 *   scratchy:toast     — { message, severity? }
 *   scratchy:canvas    — { ops: [] }  (widget can push GenUI ops)
 */

/**
 * @typedef {Object} WidgetManifest
 * @property {string}   name         — Widget display name
 * @property {string}   [description] — Short description
 * @property {string}   [icon]       — Emoji or URL
 * @property {string}   [author]     — Author name
 * @property {string}   [version]    — Semver
 * @property {string[]} [permissions] — Requested permissions
 * @property {{ width?: number, height?: number, minWidth?: number, minHeight?: number }} [size]
 */

/** Permissions that widgets can request */
const VALID_PERMISSIONS = new Set([
  'canvas',       // Push GenUI canvas ops
  'toast',        // Show toast notifications
  'navigate',     // Open URLs in the host
  'agent.send',   // Send messages to the agent
  'storage',      // Read/write persistent key-value storage
  'theme',        // Receive theme updates
]);

/** Default permissions granted to all widgets */
const DEFAULT_PERMISSIONS = new Set(['toast', 'theme']);

export class WidgetBridge {
  /**
   * @param {HTMLIFrameElement} iframe — The iframe element to bridge
   * @param {Object} opts
   * @param {string}   opts.url       — Widget URL (for origin matching)
   * @param {string}   [opts.widgetId] — Unique widget instance ID
   * @param {string}   [opts.userId]
   * @param {string}   [opts.agentId]
   * @param {WidgetManifest} [opts.manifest]
   * @param {(action: string, data: any) => void} [opts.onAction]
   * @param {{ width?: number, height?: number } => void} [opts.onResize]
   * @param {(ops: any[]) => void} [opts.onCanvasOps]
   * @param {(msg: string, severity?: string) => void} [opts.onToast]
   * @param {(url: string, target?: string) => void} [opts.onNavigate]
   * @param {(method: string, params: any) => Promise<any>} [opts.onRequest]
   */
  constructor(iframe, opts = {}) {
    this._iframe = iframe;
    this._origin = '*'; // Will be refined on ready
    this._widgetId = opts.widgetId || `w-${Date.now()}`;
    this._userId = opts.userId || null;
    this._agentId = opts.agentId || null;
    this._manifest = opts.manifest || null;
    this._permissions = new Set(DEFAULT_PERMISSIONS);
    this._ready = false;
    this._destroyed = false;

    // Callbacks
    this._onAction = opts.onAction || null;
    this._onResize = opts.onResize || null;
    this._onCanvasOps = opts.onCanvasOps || null;
    this._onToast = opts.onToast || null;
    this._onNavigate = opts.onNavigate || null;
    this._onRequest = opts.onRequest || null;

    // Parse origin from URL
    try {
      const parsed = new URL(opts.url || '');
      this._origin = parsed.origin;
    } catch {
      // Keep wildcard
    }

    // Apply manifest permissions
    if (this._manifest?.permissions) {
      for (const perm of this._manifest.permissions) {
        if (VALID_PERMISSIONS.has(perm)) {
          this._permissions.add(perm);
        }
      }
    }

    // Listen for messages from widget
    this._handler = (e) => this._handleMessage(e);
    window.addEventListener('message', this._handler);
  }

  /** Whether the widget has sent scratchy:ready */
  get ready() { return this._ready; }

  /** The widget's manifest (if provided) */
  get manifest() { return this._manifest; }

  /** Check if widget has a specific permission */
  hasPermission(perm) { return this._permissions.has(perm); }

  // ── Host → Widget ────────────────────────────────────────────

  /** Send initialization data to widget */
  sendInit(config = {}) {
    this._post('scratchy:init', {
      widgetId: this._widgetId,
      config,
      theme: this._getTheme(),
      userId: this._userId,
      agentId: this._agentId,
    });
  }

  /** Push data to widget */
  sendData(key, value) {
    this._post('scratchy:data', { key, value });
  }

  /** Push theme update to widget */
  sendTheme() {
    if (!this.hasPermission('theme')) return;
    this._post('scratchy:theme', this._getTheme());
  }

  /** Send a command to widget */
  sendCommand(command, args = {}) {
    this._post('scratchy:command', { command, args });
  }

  /** Send a response to a widget request */
  sendResponse(nonce, result, error = null) {
    this._post('scratchy:response', { nonce, result, error });
  }

  // ── Message handling ─────────────────────────────────────────

  _handleMessage(event) {
    if (this._destroyed) return;

    // Verify the message is from our iframe
    if (event.source !== this._iframe?.contentWindow) return;

    const { type, payload, nonce } = event.data || {};
    if (!type || !type.startsWith('scratchy:')) return;

    switch (type) {
      case 'scratchy:ready':
        this._ready = true;
        if (payload?.manifest) {
          this._manifest = payload.manifest;
          // Update permissions from manifest
          if (payload.manifest.permissions) {
            for (const perm of payload.manifest.permissions) {
              if (VALID_PERMISSIONS.has(perm)) {
                this._permissions.add(perm);
              }
            }
          }
        }
        // Auto-send init on ready
        this.sendInit();
        break;

      case 'scratchy:action':
        if (this._onAction && payload) {
          this._onAction(payload.action, payload.data);
        }
        break;

      case 'scratchy:resize':
        if (this._onResize && payload) {
          this._onResize(payload);
        }
        break;

      case 'scratchy:canvas':
        if (this.hasPermission('canvas') && this._onCanvasOps && payload?.ops) {
          this._onCanvasOps(payload.ops);
        }
        break;

      case 'scratchy:toast':
        if (this.hasPermission('toast') && this._onToast && payload) {
          this._onToast(payload.message, payload.severity);
        }
        break;

      case 'scratchy:navigate':
        if (this.hasPermission('navigate') && this._onNavigate && payload?.url) {
          this._onNavigate(payload.url, payload.target);
        }
        break;

      case 'scratchy:request':
        if (this._onRequest && nonce && payload) {
          this._onRequest(payload.method, payload.params)
            .then(result => this.sendResponse(nonce, result))
            .catch(err => this.sendResponse(nonce, null, err.message || String(err)));
        }
        break;
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  _post(type, payload) {
    if (this._destroyed || !this._iframe?.contentWindow) return;
    try {
      this._iframe.contentWindow.postMessage({ type, payload }, this._origin);
    } catch {
      // iframe may have been removed
    }
  }

  _getTheme() {
    const style = getComputedStyle(document.documentElement);
    return {
      bg: style.getPropertyValue('--bg').trim() || '#0a0a0f',
      accent: style.getPropertyValue('--accent').trim() || '#6366f1',
      textPrimary: style.getPropertyValue('--text-primary').trim() || 'rgba(255,255,255,0.9)',
      textSecondary: style.getPropertyValue('--text-secondary').trim() || 'rgba(255,255,255,0.5)',
      borderColor: style.getPropertyValue('--border-color').trim() || 'rgba(255,255,255,0.06)',
      radius: style.getPropertyValue('--radius').trim() || '8px',
      mode: 'dark',
    };
  }

  /** Destroy the bridge — remove event listener */
  destroy() {
    this._destroyed = true;
    window.removeEventListener('message', this._handler);
    this._iframe = null;
  }
}
