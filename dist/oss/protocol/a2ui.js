/**
 * @fileoverview A2UI (Agent-to-User Interface) protocol implementation.
 *
 * A2UI is a declarative JSON protocol (inspired by Google's A2UI spec) for
 * agents to describe rich UI components to a client renderer. This module
 * handles parsing A2UI envelopes, converting between A2UI and Scratchy's
 * internal GenUI format, and detecting A2UI messages.
 *
 * A2UI envelope structure:
 * ```json
 * {
 *   "a2ui": {
 *     "version": "1.0",
 *     "surfaces": [
 *       {
 *         "surface": "main",
 *         "components": [
 *           { "type": "text", "id": "txt-1", "data": { "title": "Hello", "body": "World" } }
 *         ]
 *       }
 *     ],
 *     "metadata": { ... }
 *   }
 * }
 * ```
 *
 * @module protocol/a2ui
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Valid A2UI surface types. */
const VALID_SURFACES = new Set(['main', 'toast', 'overlay', 'sidebar']);

/** Valid A2UI component types. */
const VALID_COMPONENT_TYPES = new Set([
  'text', 'table', 'form', 'chart', 'image',
  'button_group', 'progress', 'status', 'list', 'code',
]);

/**
 * Mapping from A2UI component type → GenUI component type.
 * For chart, the specific GenUI type is determined by data shape.
 * @type {Record<string, string|function>}
 */
const A2UI_TO_GENUI_TYPE = {
  text: 'card',
  table: 'table',
  form: 'form',
  image: 'image',
  button_group: 'buttons',
  progress: 'progress',
  status: 'alert',
  list: 'checklist',
  code: 'code',
  // 'chart' is handled specially — see detectChartType()
};

/**
 * Reverse mapping from GenUI component type → A2UI component type.
 * @type {Record<string, string>}
 */
const GENUI_TO_A2UI_TYPE = {
  card: 'text',
  table: 'table',
  form: 'form',
  image: 'image',
  buttons: 'button_group',
  progress: 'progress',
  alert: 'status',
  checklist: 'list',
  code: 'code',
  'chart-bar': 'chart',
  'chart-line': 'chart',
  'chart-pie': 'chart',
};

// ─── Detection ──────────────────────────────────────────────────────────────

/**
 * Detect whether a message is in A2UI format.
 *
 * A message is considered A2UI if it's an object (or parseable JSON string)
 * with an `a2ui` top-level key.
 *
 * @param {string|object} msg - The message to check.
 * @returns {boolean} True if the message is A2UI format.
 *
 * @example
 * isA2UIMessage({ a2ui: { version: '1.0', surfaces: [] } }); // true
 * isA2UIMessage('{"a2ui":{"version":"1.0","surfaces":[]}}'); // true
 * isA2UIMessage('Hello world'); // false
 */
export function isA2UIMessage(msg) {
  if (!msg) return false;

  if (typeof msg === 'object') {
    return 'a2ui' in msg && msg.a2ui !== null && typeof msg.a2ui === 'object';
  }

  if (typeof msg === 'string') {
    // Quick check before attempting parse
    if (!msg.includes('"a2ui"') && !msg.includes("'a2ui'")) return false;
    try {
      const parsed = JSON.parse(msg);
      return parsed && typeof parsed === 'object' && 'a2ui' in parsed;
    } catch {
      return false;
    }
  }

  return false;
}

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} A2UISurface
 * @property {string} surface - Surface name ('main', 'toast', 'overlay', 'sidebar').
 * @property {A2UIComponent[]} components - Components to render on this surface.
 */

/**
 * @typedef {Object} A2UIComponent
 * @property {string} type - Component type (e.g. 'text', 'table', 'chart').
 * @property {string} id - Unique component identifier.
 * @property {object} data - Component-specific data payload.
 */

/**
 * @typedef {Object} A2UIParsed
 * @property {string} version - Protocol version (e.g. '1.0').
 * @property {A2UISurface[]} surfaces - Array of surface render directives.
 * @property {object} metadata - Optional metadata from the envelope.
 * @property {A2UIComponent[]} allComponents - Flat list of all components across surfaces.
 */

/**
 * Parse an A2UI message envelope and extract render directives.
 *
 * Accepts either an object or a JSON string. Returns a structured result
 * with all surfaces and a flattened component list for convenience.
 *
 * @param {string|object} msg - A2UI message (object or JSON string).
 * @returns {A2UIParsed|null} Parsed A2UI data, or null if not a valid A2UI message.
 *
 * @example
 * const result = parseA2UIMessage({
 *   a2ui: {
 *     version: '1.0',
 *     surfaces: [{
 *       surface: 'main',
 *       components: [{ type: 'text', id: 't1', data: { title: 'Hi', body: 'World' } }]
 *     }]
 *   }
 * });
 * result.allComponents[0]; // { type: 'text', id: 't1', data: { title: 'Hi', body: 'World' } }
 */
export function parseA2UIMessage(msg) {
  let obj = msg;

  // Parse JSON string if needed
  if (typeof msg === 'string') {
    try {
      obj = JSON.parse(msg);
    } catch {
      return null;
    }
  }

  if (!obj || typeof obj !== 'object' || !obj.a2ui) return null;

  const envelope = obj.a2ui;
  const version = envelope.version || '1.0';
  const metadata = envelope.metadata || {};
  const rawSurfaces = Array.isArray(envelope.surfaces) ? envelope.surfaces : [];

  // Validate and normalise surfaces
  const surfaces = [];
  const allComponents = [];

  for (const raw of rawSurfaces) {
    if (!raw || typeof raw !== 'object') continue;

    const surfaceName = typeof raw.surface === 'string' ? raw.surface : 'main';
    const components = [];

    if (Array.isArray(raw.components)) {
      for (const comp of raw.components) {
        if (!comp || typeof comp !== 'object') continue;

        const normalized = {
          type: comp.type || 'text',
          id: comp.id || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          data: comp.data && typeof comp.data === 'object' ? { ...comp.data } : {},
        };

        // Preserve any extra fields (style, config, etc.)
        for (const key of Object.keys(comp)) {
          if (key !== 'type' && key !== 'id' && key !== 'data') {
            normalized[key] = comp[key];
          }
        }

        components.push(normalized);
        allComponents.push(normalized);
      }
    }

    surfaces.push({ surface: surfaceName, components });
  }

  return { version, surfaces, metadata, allComponents };
}

// ─── A2UI → GenUI conversion ────────────────────────────────────────────────

/**
 * Detect the GenUI chart subtype from an A2UI chart component's data.
 *
 * Heuristics:
 * - Has `slices` array → `chart-pie`
 * - Has `datasets` with `data` arrays and `labels` → check first dataset
 *   - If all values are monotonically related / time-series-like → `chart-line`
 *   - Otherwise → `chart-bar`
 * - Has `values` / `data` as flat array → `chart-bar`
 * - Fallback → `chart-bar`
 *
 * @param {object} data - The chart component's data payload.
 * @returns {string} GenUI chart type ('chart-bar', 'chart-line', or 'chart-pie').
 */
function detectChartType(data) {
  if (!data || typeof data !== 'object') return 'chart-bar';

  // Pie chart detection
  if (Array.isArray(data.slices) && data.slices.length > 0) return 'chart-pie';
  if (data.chartType === 'pie' || data.type === 'pie') return 'chart-pie';

  // Line chart detection
  if (data.chartType === 'line' || data.type === 'line') return 'chart-line';

  // Bar chart detection
  if (data.chartType === 'bar' || data.type === 'bar') return 'chart-bar';

  // Heuristic: if datasets exist with labels that look temporal
  if (Array.isArray(data.labels) && Array.isArray(data.datasets)) {
    const temporalPatterns = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|20\d{2}|\d{1,2}\/\d{1,2})/i;
    const hasTemporalLabels = data.labels.some(l => temporalPatterns.test(String(l)));
    if (hasTemporalLabels) return 'chart-line';
  }

  return 'chart-bar';
}

/**
 * Convert A2UI component data to GenUI data format for a specific type mapping.
 *
 * Each A2UI type has slightly different data conventions than GenUI.
 * This function handles the field-level transformations.
 *
 * @param {string} a2uiType - The A2UI component type.
 * @param {object} a2uiData - The A2UI component data.
 * @returns {object} GenUI-compatible data.
 */
function convertDataA2UIToGenUI(a2uiType, a2uiData) {
  const d = { ...a2uiData };

  switch (a2uiType) {
    case 'text':
      // A2UI text has { title, body } → GenUI card has { title, text }
      if ('body' in d && !('text' in d)) {
        d.text = d.body;
        delete d.body;
      }
      return d;

    case 'table':
      // Both use { title, headers, rows } — compatible
      return d;

    case 'form':
      // Both use { title, fields, actions } — mostly compatible
      return d;

    case 'image':
      // A2UI: { url, alt, caption } → GenUI: { src, alt, caption }
      if ('url' in d && !('src' in d)) {
        d.src = d.url;
        delete d.url;
      }
      return d;

    case 'button_group':
      // A2UI: { buttons: [...] } → GenUI buttons: { buttons: [...] }
      // Map A2UI button schema to GenUI schema
      if (Array.isArray(d.buttons)) {
        d.buttons = d.buttons.map(btn => ({
          label: btn.label || btn.text || '',
          action: btn.action || btn.id || '',
          style: btn.style || btn.variant || 'ghost',
          ...btn,
        }));
      }
      return d;

    case 'progress':
      // A2UI: { value, max, label } → GenUI: { value, max, label }
      return d;

    case 'status':
      // A2UI status: { text, level } → GenUI alert: { message, severity }
      if ('text' in d && !('message' in d)) {
        d.message = d.text;
        // Keep 'text' too since GenUI alert might use it
      }
      if ('level' in d && !('severity' in d)) {
        // Map A2UI levels to GenUI severities
        const levelMap = {
          info: 'info', warning: 'warning', warn: 'warning',
          error: 'error', critical: 'error',
          success: 'success', ok: 'success',
        };
        d.severity = levelMap[d.level] || 'info';
        delete d.level;
      }
      return d;

    case 'list':
      // A2UI list: { items: [{ text, completed }] } → GenUI checklist: { items: [{ text, checked }] }
      if (Array.isArray(d.items)) {
        d.items = d.items.map(item => {
          const mapped = { ...item };
          if ('completed' in mapped && !('checked' in mapped)) {
            mapped.checked = mapped.completed;
            delete mapped.completed;
          }
          if ('label' in mapped && !('text' in mapped)) {
            mapped.text = mapped.label;
            delete mapped.label;
          }
          return mapped;
        });
      }
      return d;

    case 'code':
      // A2UI: { code, language } → GenUI: { code, language }
      return d;

    case 'chart':
      // Pass through — chart data is largely compatible
      // Remove any A2UI-specific type hint since GenUI uses the component type itself
      delete d.chartType;
      delete d.type;
      return d;

    default:
      return d;
  }
}

/**
 * Convert an array of A2UI components to GenUI ops.
 *
 * Each A2UI component becomes a GenUI `upsert` op with the appropriate
 * type mapping and data transformation.
 *
 * @param {A2UIComponent[]} a2uiComponents - Array of A2UI components
 *   (as returned by parseA2UIMessage's allComponents or surface components).
 * @returns {object[]} Array of GenUI upsert ops.
 *
 * @example
 * const ops = a2uiToGenUI([
 *   { type: 'text', id: 'intro', data: { title: 'Welcome', body: 'Hello world' } },
 *   { type: 'status', id: 's1', data: { text: 'All good', level: 'success' } }
 * ]);
 * // [
 * //   { op: 'upsert', id: 'intro', type: 'card', data: { title: 'Welcome', text: 'Hello world' }, layout: { zone: 'auto' } },
 * //   { op: 'upsert', id: 's1', type: 'alert', data: { text: 'All good', message: 'All good', severity: 'success' }, layout: { zone: 'auto' } }
 * // ]
 */
export function a2uiToGenUI(a2uiComponents) {
  if (!Array.isArray(a2uiComponents)) return [];

  return a2uiComponents.map(comp => {
    const a2uiType = comp.type || 'text';

    // Determine GenUI type
    let genUIType;
    if (a2uiType === 'chart') {
      genUIType = detectChartType(comp.data);
    } else {
      genUIType = A2UI_TO_GENUI_TYPE[a2uiType] || 'card';
    }

    // Convert data
    const data = convertDataA2UIToGenUI(a2uiType, comp.data || {});

    return {
      op: 'upsert',
      id: comp.id,
      type: genUIType,
      data,
      layout: { zone: 'auto' },
    };
  });
}

// ─── GenUI → A2UI conversion ────────────────────────────────────────────────

/**
 * Convert GenUI component data back to A2UI data format.
 *
 * @param {string} genUIType - The GenUI component type.
 * @param {object} genUIData - The GenUI component data.
 * @returns {object} A2UI-compatible data.
 */
function convertDataGenUIToA2UI(genUIType, genUIData) {
  const d = { ...genUIData };

  switch (genUIType) {
    case 'card':
      // GenUI card: { title, text } → A2UI text: { title, body }
      if ('text' in d && !('body' in d)) {
        d.body = d.text;
        delete d.text;
      }
      return d;

    case 'image':
      // GenUI: { src } → A2UI: { url }
      if ('src' in d && !('url' in d)) {
        d.url = d.src;
        delete d.src;
      }
      return d;

    case 'alert':
      // GenUI alert: { message, severity } → A2UI status: { text, level }
      if ('message' in d && !('text' in d)) {
        d.text = d.message;
        delete d.message;
      }
      if ('severity' in d && !('level' in d)) {
        d.level = d.severity;
        delete d.severity;
      }
      return d;

    case 'checklist':
      // GenUI checklist: { items: [{ text, checked }] } → A2UI list: { items: [{ text, completed }] }
      if (Array.isArray(d.items)) {
        d.items = d.items.map(item => {
          const mapped = { ...item };
          if ('checked' in mapped && !('completed' in mapped)) {
            mapped.completed = mapped.checked;
            delete mapped.checked;
          }
          return mapped;
        });
      }
      return d;

    case 'chart-bar':
    case 'chart-line':
    case 'chart-pie':
      // Add chartType hint for A2UI
      d.chartType = genUIType.replace('chart-', '');
      return d;

    default:
      return d;
  }
}

/**
 * Convert an array of GenUI ops to A2UI components.
 *
 * Only `upsert` ops are meaningful for conversion (patches, removes, etc.
 * are GenUI state-management concerns). Non-upsert ops are silently skipped.
 *
 * @param {object[]} genUIOps - Array of GenUI ops.
 * @returns {A2UIComponent[]} Array of A2UI components.
 *
 * @example
 * const components = genUIToA2UI([
 *   { op: 'upsert', id: 'c1', type: 'card', data: { title: 'Hi', text: 'World' } }
 * ]);
 * // [{ type: 'text', id: 'c1', data: { title: 'Hi', body: 'World' } }]
 */
export function genUIToA2UI(genUIOps) {
  if (!Array.isArray(genUIOps)) return [];

  const components = [];

  for (const op of genUIOps) {
    // Only convert upsert ops — others are state ops with no A2UI equivalent
    if (!op || op.op !== 'upsert') continue;

    const genUIType = op.type || 'card';
    const a2uiType = GENUI_TO_A2UI_TYPE[genUIType] || 'text';
    const data = convertDataGenUIToA2UI(genUIType, op.data || {});

    components.push({
      type: a2uiType,
      id: op.id,
      data,
    });
  }

  return components;
}

/**
 * Wrap an array of A2UI components into a full A2UI message envelope.
 *
 * @param {A2UIComponent[]} components - Components to include.
 * @param {object} [options={}] - Options.
 * @param {string} [options.surface='main'] - Target surface.
 * @param {string} [options.version='1.0'] - Protocol version.
 * @param {object} [options.metadata={}] - Envelope metadata.
 * @returns {object} A2UI message envelope.
 */
export function wrapA2UIEnvelope(components, options = {}) {
  const {
    surface = 'main',
    version = '1.0',
    metadata = {},
  } = options;

  return {
    a2ui: {
      version,
      surfaces: [
        {
          surface,
          components: components || [],
        },
      ],
      metadata,
    },
  };
}
