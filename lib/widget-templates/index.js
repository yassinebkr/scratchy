/**
 * Widget Template Registry
 *
 * Loads all pre-built widget templates from this directory.
 * Templates are instant-render alternatives to create_live_widget.
 *
 * @module lib/widget-templates/index
 */

import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, object>} */
const templates = new Map();
let _loaded = false;

/**
 * Load all template modules from the directory.
 * Skips _base.css, index.js, and non-.js files.
 */
export async function loadAll() {
  if (_loaded) return;
  const files = await readdir(__dir);
  for (const file of files) {
    if (!file.endsWith('.js') || file === 'index.js' || file.startsWith('_')) continue;
    try {
      const mod = await import(join(__dir, file));
      const tpl = mod.default;
      if (tpl && tpl.id) {
        templates.set(tpl.id, tpl);
        console.log(`[widget-templates] ✅ Loaded template: ${tpl.id} (${tpl.name})`);
      }
    } catch (err) {
      console.warn(`[widget-templates] ⚠️ Failed to load ${file}:`, err.message);
    }
  }
  _loaded = true;
  console.log(`[widget-templates] ${templates.size} templates ready`);
}

/**
 * Get a template by ID.
 * @param {string} id
 * @returns {object|undefined}
 */
export function get(id) {
  return templates.get(id);
}

/**
 * List all available templates (id, name, description, schema).
 * @returns {Array<{id: string, name: string, description: string}>}
 */
export function list() {
  return [...templates.values()].map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }));
}

/**
 * Get the template catalog summary for the MCP tool description.
 * @returns {string}
 */
export function catalogSummary() {
  if (templates.size === 0) return 'No templates loaded.';
  return [...templates.values()]
    .map(t => `• ${t.id}: ${t.description}`)
    .join('\n');
}

/**
 * Create canvas ops from a template + config.
 * Returns [defineOp, upsertOp] ready to send to the client.
 *
 * @param {string} templateId
 * @param {string} widgetId - Unique instance ID
 * @param {object} config - User-provided configuration
 * @returns {{ ops: object[], error?: string }}
 */
export function instantiate(templateId, widgetId, config = {}) {
  const tpl = templates.get(templateId);
  if (!tpl) {
    return { ops: [], error: `Unknown template: ${templateId}. Available: ${[...templates.keys()].join(', ')}` };
  }

  // Merge config with defaults
  const data = { ...tpl.defaults, ...config };

  // If template has an init function (e.g. distribute cards into columns), run it
  if (typeof tpl.init === 'function') {
    tpl.init(data);
  }

  // Build action map
  const actionsArr = tpl.actions || [];

  // Define op (registers the Web Component)
  const defineOp = {
    op: 'define',
    id: widgetId,
    component: {
      html: tpl.html,
      css: tpl.css,
      props: Object.keys(data),
      actions: actionsArr,
      defaults: tpl.defaults || {},
      js: tpl.js || '',
    },
  };

  // Upsert op (creates an instance with the merged data)
  const upsertOp = {
    op: 'upsert',
    id: `lw-${widgetId}`,
    type: widgetId,
    data,
  };

  return { ops: [defineOp, upsertOp] };
}

export default { loadAll, get, list, catalogSummary, instantiate };
