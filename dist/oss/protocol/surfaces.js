/**
 * @fileoverview Surface registry for contextual UI in Scratchy v2.
 *
 * Surfaces are named UI regions (terminal, editor, explorer, etc.) that
 * activate in response to agent tool calls. This module provides:
 * - A registry of known surface types and their triggers
 * - Detection logic to determine which surfaces should be active
 * - Layout computation for arranging active surfaces in a CSS grid
 * - Transition helpers for animating between surface states
 *
 * @module protocol/surfaces
 */

// ─── Surface definitions ────────────────────────────────────────────────────

/**
 * @typedef {Object} SurfaceDefinition
 * @property {string} trigger - Tool call name that activates this surface
 *   (or "always" for surfaces that are always present).
 * @property {string} component - Web component tag name for this surface.
 * @property {number} priority - Display priority (0 = lowest / always shown,
 *   higher = more important when competing for space).
 */

/**
 * Registry of all known surface types and their configuration.
 *
 * @type {Record<string, SurfaceDefinition>}
 */
export const SURFACE_TYPES = Object.freeze({
  terminal: Object.freeze({ trigger: 'exec', component: 'sc-terminal', priority: 2 }),
  explorer: Object.freeze({ trigger: 'read_dir', component: 'sc-filetree', priority: 1 }),
  editor: Object.freeze({ trigger: 'write_file', component: 'sc-editor', priority: 2 }),
  search: Object.freeze({ trigger: 'web_search', component: 'sc-search', priority: 1 }),
  canvas: Object.freeze({ trigger: 'canvas_op', component: 'sc-canvas', priority: 3 }),
  chat: Object.freeze({ trigger: 'always', component: 'sc-chat', priority: 0 }),
});

/**
 * Reverse lookup: trigger name → surface name.
 * @type {Map<string, string>}
 */
const TRIGGER_TO_SURFACE = new Map();
for (const [name, def] of Object.entries(SURFACE_TYPES)) {
  if (def.trigger !== 'always') {
    TRIGGER_TO_SURFACE.set(def.trigger, name);
  }
}

// ─── Surface detection ──────────────────────────────────────────────────────

/**
 * Given an array of tool call names from the agent, determine which surfaces
 * should be active (visible in the UI).
 *
 * The `chat` surface is always included. Other surfaces activate when their
 * trigger matches one of the tool calls.
 *
 * @param {string[]} toolCalls - Array of tool call names (e.g. ['exec', 'web_search']).
 * @returns {string[]} Array of active surface names, sorted by priority (descending).
 *
 * @example
 * detectSurfaces(['exec', 'web_search']);
 * // ['terminal', 'search', 'chat']
 *
 * @example
 * detectSurfaces([]);
 * // ['chat']
 */
export function detectSurfaces(toolCalls) {
  const active = new Set(['chat']); // Chat is always present

  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      const surfaceName = TRIGGER_TO_SURFACE.get(call);
      if (surfaceName) {
        active.add(surfaceName);
      }
    }
  }

  // Sort by priority descending (highest priority first), with chat last
  return [...active].sort((a, b) => {
    const pa = SURFACE_TYPES[a]?.priority ?? 0;
    const pb = SURFACE_TYPES[b]?.priority ?? 0;
    return pb - pa;
  });
}

// ─── Layout computation ─────────────────────────────────────────────────────

/**
 * @typedef {Object} LayoutSpec
 * @property {string} gridTemplateColumns - CSS grid-template-columns value.
 * @property {string} gridTemplateRows - CSS grid-template-rows value.
 * @property {Record<string, GridArea>} areas - Map of surface name → grid area placement.
 */

/**
 * @typedef {Object} GridArea
 * @property {number} column - Grid column start (1-based).
 * @property {number} columnSpan - Number of columns to span.
 * @property {number} row - Grid row start (1-based).
 * @property {number} rowSpan - Number of rows to span.
 * @property {string} gridArea - CSS grid-area shorthand (row / col / row-end / col-end).
 */

/**
 * Compute a CSS grid layout specification for the given active surfaces.
 *
 * Layout rules:
 * - 1 surface (chat only) → full width, single column
 * - 2 surfaces → side-by-side split
 *   - chat + one other → 60%/40% (chat gets more space)
 *   - two non-chat → 50%/50%
 * - 3+ surfaces → 2-column grid, rows as needed
 *   - Chat always present, minimum 30% width
 *   - Higher priority surfaces get more prominent positions
 *
 * @param {string[]} activeSurfaces - Array of active surface names (from detectSurfaces).
 * @returns {LayoutSpec} CSS grid layout specification.
 *
 * @example
 * computeLayout(['chat']);
 * // { gridTemplateColumns: '1fr', gridTemplateRows: '1fr', areas: { chat: { ... } } }
 *
 * @example
 * computeLayout(['terminal', 'chat']);
 * // { gridTemplateColumns: '3fr 2fr', ... }  (60/40 split, chat on right)
 */
export function computeLayout(activeSurfaces) {
  if (!Array.isArray(activeSurfaces) || activeSurfaces.length === 0) {
    return {
      gridTemplateColumns: '1fr',
      gridTemplateRows: '1fr',
      areas: {
        chat: makeArea(1, 1, 1, 1),
      },
    };
  }

  const surfaces = [...activeSurfaces];
  const hasChat = surfaces.includes('chat');

  // ── Single surface ────────────────────────────────────────────────────
  if (surfaces.length === 1) {
    return {
      gridTemplateColumns: '1fr',
      gridTemplateRows: '1fr',
      areas: {
        [surfaces[0]]: makeArea(1, 1, 1, 1),
      },
    };
  }

  // ── Two surfaces ──────────────────────────────────────────────────────
  if (surfaces.length === 2) {
    // Sort so chat is always on the right (second column)
    const sorted = hasChat
      ? [surfaces.find(s => s !== 'chat'), 'chat']
      : [...surfaces];

    const columns = hasChat ? '3fr 2fr' : '1fr 1fr';

    return {
      gridTemplateColumns: columns,
      gridTemplateRows: '1fr',
      areas: {
        [sorted[0]]: makeArea(1, 1, 1, 1),
        [sorted[1]]: makeArea(1, 2, 1, 1),
      },
    };
  }

  // ── Three or more surfaces → 2-column grid ───────────────────────────
  // Separate chat from the rest, sort others by priority descending
  const others = surfaces
    .filter(s => s !== 'chat')
    .sort((a, b) => {
      const pa = SURFACE_TYPES[a]?.priority ?? 0;
      const pb = SURFACE_TYPES[b]?.priority ?? 0;
      return pb - pa;
    });

  // Calculate rows needed for the non-chat surfaces (left column)
  const leftCount = others.length;
  const rows = Math.max(leftCount, 1);

  // Build columns: left (main content) gets 70%, chat gets 30% (minimum)
  const columns = hasChat ? '7fr 3fr' : '1fr 1fr';

  const areas = {};

  // Place non-chat surfaces in the left column, stacked vertically
  for (let i = 0; i < others.length; i++) {
    areas[others[i]] = makeArea(i + 1, 1, 1, 1);
  }

  // Chat spans the entire right column
  if (hasChat) {
    areas.chat = makeArea(1, 2, rows, 1);
  }

  // Build row template
  const rowTemplate = Array(rows).fill('1fr').join(' ');

  return {
    gridTemplateColumns: columns,
    gridTemplateRows: rowTemplate,
    areas,
  };
}

/**
 * Create a grid area placement object.
 *
 * @param {number} row - Row start (1-based).
 * @param {number} col - Column start (1-based).
 * @param {number} rowSpan - Number of rows to span.
 * @param {number} colSpan - Number of columns to span.
 * @returns {GridArea}
 */
function makeArea(row, col, rowSpan, colSpan) {
  return {
    row,
    column: col,
    rowSpan,
    columnSpan: colSpan,
    gridArea: `${row} / ${col} / ${row + rowSpan} / ${col + colSpan}`,
  };
}

// ─── Surface transitions ────────────────────────────────────────────────────

/**
 * @typedef {Object} SurfaceTransition
 * @property {string[]} add - Surfaces to add (newly activated).
 * @property {string[]} remove - Surfaces to remove (deactivated).
 * @property {string[]} keep - Surfaces that remain active.
 */

/**
 * Compute the transition between two sets of active surfaces.
 *
 * This is useful for animating surface changes: new surfaces slide in,
 * removed surfaces slide out, and kept surfaces may reflow.
 *
 * @param {string[]} from - Previously active surface names.
 * @param {string[]} to - Newly active surface names.
 * @returns {SurfaceTransition} The transition descriptor.
 *
 * @example
 * surfaceTransition(['chat'], ['terminal', 'chat']);
 * // { add: ['terminal'], remove: [], keep: ['chat'] }
 *
 * @example
 * surfaceTransition(['terminal', 'chat'], ['editor', 'chat']);
 * // { add: ['editor'], remove: ['terminal'], keep: ['chat'] }
 */
export function surfaceTransition(from, to) {
  const fromSet = new Set(Array.isArray(from) ? from : []);
  const toSet = new Set(Array.isArray(to) ? to : []);

  const add = [];
  const remove = [];
  const keep = [];

  // Surfaces in `to` but not in `from` → add
  for (const s of toSet) {
    if (fromSet.has(s)) {
      keep.push(s);
    } else {
      add.push(s);
    }
  }

  // Surfaces in `from` but not in `to` → remove
  for (const s of fromSet) {
    if (!toSet.has(s)) {
      remove.push(s);
    }
  }

  return { add, remove, keep };
}
