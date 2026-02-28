/**
 * @module lib/a2ui-widget-loader
 * A2UI Community Widget Loader
 * 
 * Dynamically loads, caches, and instantiates community-built A2UI widgets.
 * Widgets are Web Components loaded from a registry or inline definitions.
 * Each widget runs in a Shadow DOM for style isolation.
 *
 * Widget resolution order:
 *   1. Local registry (pre-registered via registerWidget())
 *   2. CDN registry (configurable URL pattern)
 *   3. Fallback: render as a generic card with raw JSON data
 */

/** @type {Map<string, WidgetDefinition>} type → definition */
const _registry = new Map();

/** @type {Map<string, Promise<void>>} type → loading promise (dedup) */
const _loading = new Map();

/** @type {string} CDN base URL for community widgets */
let _cdnBase = 'https://cdn.scratchy.dev/widgets'; // configurable

/**
 * @typedef {Object} WidgetDefinition
 * @property {string} type — A2UI component type (e.g., 'weather-widget')
 * @property {string} tagName — Custom element tag (e.g., 'a2ui-weather-widget')
 * @property {string} [scriptUrl] — URL to load the widget script from
 * @property {typeof HTMLElement} [componentClass] — Pre-registered class
 * @property {boolean} sandboxed — Whether to render in an iframe sandbox
 */

/**
 * Register a widget definition locally.
 * Use for built-in extended widgets or testing.
 * 
 * @param {string} type — A2UI component type
 * @param {Object} opts
 * @param {typeof HTMLElement} [opts.componentClass] — Web Component class
 * @param {string} [opts.scriptUrl] — URL to load script from
 * @param {boolean} [opts.sandboxed=false] — Use iframe sandbox
 */
export function registerWidget(type, opts = {}) {
  const tagName = `a2ui-${type.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`;
  _registry.set(type, {
    type,
    tagName,
    componentClass: opts.componentClass || null,
    scriptUrl: opts.scriptUrl || null,
    sandboxed: opts.sandboxed || false,
  });
  
  // Register the custom element if class provided
  if (opts.componentClass && !customElements.get(tagName)) {
    customElements.define(tagName, opts.componentClass);
  }
}

/**
 * Set the CDN base URL for community widget loading.
 * @param {string} url
 */
export function setCdnBase(url) {
  _cdnBase = url.replace(/\/$/, '');
}

/**
 * Check if a widget type is registered or available.
 * @param {string} type
 * @returns {boolean}
 */
export function isRegistered(type) {
  return _registry.has(type);
}

/**
 * Load and instantiate a widget for an A2UI component.
 * Returns a DOM element ready to be appended to the canvas.
 * 
 * @param {Object} component — A2UI component { type, id, data }
 * @param {Object} [metadata] — A2UI envelope metadata
 * @returns {Promise<HTMLElement>} — instantiated widget element
 */
export async function loadWidget(component, metadata = {}) {
  const { type, id, data } = component;
  
  // 1. Check local registry
  let def = _registry.get(type);
  
  // 2. Try to load from CDN if not registered
  if (!def) {
    try {
      await loadFromCDN(type);
      def = _registry.get(type);
    } catch (err) {
      console.warn(`[a2ui-loader] Failed to load widget "${type}":`, err.message);
    }
  }
  
  // 3. Render widget or fallback
  if (def && def.componentClass) {
    return instantiateWidget(def, id, data, metadata);
  }
  
  if (def && def.sandboxed && def.scriptUrl) {
    return createSandboxedWidget(def, id, data, metadata);
  }
  
  // Fallback: render as generic card showing component data
  return createFallbackWidget(type, id, data);
}

/**
 * Load a widget script from CDN.
 * Convention: {cdnBase}/{type}/index.js
 * The script should call registerWidget() or define a custom element.
 * 
 * @param {string} type
 * @returns {Promise<void>}
 */
async function loadFromCDN(type) {
  // Dedup concurrent loads
  if (_loading.has(type)) return _loading.get(type);
  
  const url = `${_cdnBase}/${type}/index.js`;
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url;
    script.onload = () => {
      _loading.delete(type);
      resolve();
    };
    script.onerror = () => {
      _loading.delete(type);
      reject(new Error(`Failed to load widget script: ${url}`));
    };
    document.head.appendChild(script);
  });
  
  _loading.set(type, promise);
  return promise;
}

/**
 * Instantiate a registered widget as a custom element.
 */
function instantiateWidget(def, id, data, metadata) {
  const el = document.createElement(def.tagName);
  el.setAttribute('widget-id', id);
  el.dataset.a2uiType = def.type;
  
  // Pass data via attribute and property
  if (typeof el.setData === 'function') {
    el.setData(data, metadata);
  } else {
    el.setAttribute('data', JSON.stringify(data));
  }
  
  return el;
}

/**
 * Create a sandboxed iframe widget for untrusted community code.
 */
function createSandboxedWidget(def, id, data, metadata) {
  const container = document.createElement('div');
  container.className = 'a2ui-sandbox-container';
  container.dataset.a2uiType = def.type;
  container.dataset.widgetId = id;
  
  const iframe = document.createElement('iframe');
  iframe.sandbox = 'allow-scripts'; // No same-origin, no forms, no popups
  iframe.style.cssText = 'width:100%;border:none;min-height:120px;border-radius:8px;background:transparent;';
  iframe.srcdoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 12px; font-family: system-ui; color: #e8e0d2; background: transparent; }
      </style>
    </head>
    <body>
      <script type="module">
        import '${def.scriptUrl}';
        window.addEventListener('message', (e) => {
          if (e.data?.type === 'a2ui-update') {
            document.querySelector('[data-widget]')?.setData?.(e.data.data);
          }
        });
        const el = document.createElement('${def.tagName}');
        el.dataset.widget = '${id}';
        el.setData?.(${JSON.stringify(data)}, ${JSON.stringify(metadata)});
        document.body.appendChild(el);
      <\/script>
    </body>
    </html>
  `;
  
  container.appendChild(iframe);
  return container;
}

/**
 * Create a fallback card for unresolvable widget types.
 * Shows the component type and raw data in a styled card.
 */
function createFallbackWidget(type, id, data) {
  const el = document.createElement('div');
  el.className = 'a2ui-fallback-widget';
  el.dataset.a2uiType = type;
  el.dataset.widgetId = id;
  el.innerHTML = `
    <div style="padding:16px;background:rgba(249,166,2,0.06);border:1px solid rgba(249,166,2,0.15);border-radius:8px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#8a7e6a;margin-bottom:8px;">
        A2UI Widget: ${type}
      </div>
      <pre style="margin:0;font-size:12px;color:#e8e0d2;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;">${JSON.stringify(data, null, 2)}</pre>
    </div>
  `;
  return el;
}

/**
 * Update data on an existing widget element.
 * @param {HTMLElement} el — the widget element
 * @param {Object} data — new data
 */
export function updateWidget(el, data) {
  if (typeof el.setData === 'function') {
    el.setData(data);
  } else if (el.querySelector('iframe')) {
    // Sandboxed widget — postMessage
    el.querySelector('iframe').contentWindow?.postMessage({ type: 'a2ui-update', data }, '*');
  } else {
    // Fallback — re-render
    const pre = el.querySelector('pre');
    if (pre) pre.textContent = JSON.stringify(data, null, 2);
  }
}

// Export for global access (community widget scripts need to call registerWidget)
if (typeof window !== 'undefined') {
  window.ScratchyA2UI = { registerWidget, setCdnBase, isRegistered, loadWidget, updateWidget };
}
