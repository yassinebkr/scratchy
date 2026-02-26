/**
 * Scratchy v2 — Surface Manager (v2)
 *
 * Orchestrates contextual surfaces based on agent activity.
 * Creates surface Web Components on demand, applies CSS grid layouts,
 * and handles smooth transitions between surface configurations.
 *
 * Flow:
 *   WS tool_call → detect surface type → activate → layout → render data
 *   WS tool_result → push data to surface component → reset idle timer
 *   Idle timeout → deactivate surface → reflow layout
 */

import { on, emit } from './ws-client.js';

/* ------------------------------------------------------------------ */
/*  Surface registry                                                  */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} SurfaceDef
 * @property {string[]} triggers - Tool names that activate this surface
 * @property {string} component - Web Component tag
 * @property {number} priority - Layout priority (higher = more prominent)
 * @property {string} label - Display name
 */

/** @type {Record<string, SurfaceDef>} */
const SURFACE_DEFS = {
  terminal: { triggers: ['exec'], component: 'sc-terminal', priority: 2, label: 'Terminal' },
  explorer: { triggers: ['read', 'read_dir', 'list_files'], component: 'sc-filetree', priority: 1, label: 'Files' },
  editor:   { triggers: ['write', 'edit'], component: 'sc-editor', priority: 2, label: 'Editor' },
  search:   { triggers: ['web_search', 'web_fetch'], component: 'sc-search', priority: 1, label: 'Search' },
  canvas:   { triggers: ['canvas_op'], component: 'sc-canvas', priority: 3, label: 'Canvas' },
};

/** Reverse map: tool name → surface type */
const TOOL_TO_SURFACE = new Map();
for (const [type, def] of Object.entries(SURFACE_DEFS)) {
  for (const t of def.triggers) {
    TOOL_TO_SURFACE.set(t, type);
  }
}

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

/** @type {Map<string, {el: HTMLElement, active: boolean, idleTimer: number|null}>} */
const _surfaces = new Map();

/** @type {HTMLElement|null} */
let _container = null;
/** @type {HTMLElement|null} */
let _chatSurface = null;
/** @type {import('../components/sc-surface-toolbar.js').ScSurfaceToolbar|null} */
let _toolbar = null;

const IDLE_TIMEOUT = 30_000; // 30s after last activity before auto-hide

/* ------------------------------------------------------------------ */
/*  Initialization                                                    */
/* ------------------------------------------------------------------ */

/**
 * Initialize the surface manager.
 * Call after DOM is ready.
 */
export function initSurfaceManager() {
  _container = document.getElementById('surfaces');
  _chatSurface = document.getElementById('chat-surface');
  _toolbar = document.querySelector('sc-surface-toolbar');

  // Pre-create surface components (but don't add to DOM yet)
  for (const [type, def] of Object.entries(SURFACE_DEFS)) {
    const el = document.createElement(def.component);
    el.classList.add('surface', `${type}-surface`);
    el.style.display = 'none';
    _surfaces.set(type, { el, active: false, idleTimer: null });
  }

  // Wire WS events
  _wireEvents();

  // Wire keyboard shortcuts
  _wireKeyboard();

  // Wire toolbar toggle
  if (_toolbar) {
    _toolbar.addEventListener('surface-toggle', (e) => {
      toggleSurface(e.detail.type);
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/** Activate a surface by type */
export function activateSurface(type) {
  const s = _surfaces.get(type);
  if (!s || s.active) return;

  s.active = true;
  s.el.style.display = '';
  s.el.classList.add('surface-enter');
  // Remove animation class after it plays
  s.el.addEventListener('animationend', () => s.el.classList.remove('surface-enter'), { once: true });

  if (_container && !_container.contains(s.el)) {
    _container.appendChild(s.el);
  }

  _resetIdleTimer(type);
  _updateLayout();
  _updateToolbar();
  emit('surface:activated', { type });
}

/** Deactivate a surface by type */
export function deactivateSurface(type) {
  const s = _surfaces.get(type);
  if (!s || !s.active) return;

  s.active = false;
  s.el.style.display = 'none';

  if (_container && _container.contains(s.el)) {
    _container.removeChild(s.el);
  }

  _clearIdleTimer(type);
  _updateLayout();
  _updateToolbar();
  emit('surface:deactivated', { type });
}

/** Toggle a surface */
export function toggleSurface(type) {
  const s = _surfaces.get(type);
  if (!s) return;
  if (s.active) deactivateSurface(type);
  else activateSurface(type);
}

/** Get active surface types */
export function getActiveSurfaces() {
  return [..._surfaces.entries()].filter(([, s]) => s.active).map(([t]) => t);
}

/** Get the surface element instance */
export function getSurface(type) {
  return _surfaces.get(type)?.el ?? null;
}

/** Deactivate all surfaces */
export function deactivateAll() {
  for (const [type] of _surfaces) {
    deactivateSurface(type);
  }
}

/* ------------------------------------------------------------------ */
/*  Layout engine                                                     */
/* ------------------------------------------------------------------ */

function _updateLayout() {
  if (!_container || !_chatSurface) return;

  const active = getActiveSurfaces();

  // Remove all layout classes
  _container.classList.remove('layout-single', 'layout-split', 'layout-chat-plus', 'layout-grid', 'layout-triple');

  if (active.length === 0) {
    // Chat-only: put chat back in its natural flow
    _container.style.cssText = '';
    _chatSurface.style.cssText = '';
    return;
  }

  // Move chat surface into the grid container if not already
  if (!_container.contains(_chatSurface)) {
    _container.appendChild(_chatSurface);
  }
  _chatSurface.style.display = '';

  // Sort active surfaces by priority (descending)
  const sorted = active.sort((a, b) => {
    const pa = SURFACE_DEFS[a]?.priority ?? 0;
    const pb = SURFACE_DEFS[b]?.priority ?? 0;
    return pb - pa;
  });

  if (sorted.length === 1) {
    // One surface + chat: 60/40 split
    _container.style.display = 'grid';
    _container.style.gridTemplateColumns = '3fr 2fr';
    _container.style.gridTemplateRows = '1fr';

    const s = _surfaces.get(sorted[0]);
    if (s) s.el.style.gridArea = '1 / 1 / 2 / 2';
    _chatSurface.style.gridArea = '1 / 2 / 2 / 3';

  } else if (sorted.length === 2) {
    // Two surfaces + chat: left column stacked, chat right
    _container.style.display = 'grid';
    _container.style.gridTemplateColumns = '7fr 3fr';
    _container.style.gridTemplateRows = '1fr 1fr';

    const s0 = _surfaces.get(sorted[0]);
    const s1 = _surfaces.get(sorted[1]);
    if (s0) s0.el.style.gridArea = '1 / 1 / 2 / 2';
    if (s1) s1.el.style.gridArea = '2 / 1 / 3 / 2';
    _chatSurface.style.gridArea = '1 / 2 / 3 / 3';

  } else {
    // 3+ surfaces: grid with chat spanning right column
    const rows = sorted.length;
    _container.style.display = 'grid';
    _container.style.gridTemplateColumns = '7fr 3fr';
    _container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

    sorted.forEach((type, i) => {
      const s = _surfaces.get(type);
      if (s) s.el.style.gridArea = `${i + 1} / 1 / ${i + 2} / 2`;
    });
    _chatSurface.style.gridArea = `1 / 2 / ${rows + 1} / 3`;
  }
}

/* ------------------------------------------------------------------ */
/*  Idle timers                                                       */
/* ------------------------------------------------------------------ */

function _resetIdleTimer(type) {
  _clearIdleTimer(type);
  const s = _surfaces.get(type);
  if (!s) return;
  s.idleTimer = setTimeout(() => {
    deactivateSurface(type);
  }, IDLE_TIMEOUT);
}

function _clearIdleTimer(type) {
  const s = _surfaces.get(type);
  if (s?.idleTimer) {
    clearTimeout(s.idleTimer);
    s.idleTimer = null;
  }
}

/* ------------------------------------------------------------------ */
/*  Toolbar sync                                                      */
/* ------------------------------------------------------------------ */

function _updateToolbar() {
  if (_toolbar) {
    _toolbar.setActive(getActiveSurfaces());
  }
}

/* ------------------------------------------------------------------ */
/*  WS event wiring                                                   */
/* ------------------------------------------------------------------ */

function _wireEvents() {
  // Tool call started → activate relevant surface
  on('tool_call', (msg) => {
    const tool = msg.tool || msg.name;
    if (!tool) return;
    const surfaceType = TOOL_TO_SURFACE.get(tool);
    if (surfaceType) {
      activateSurface(surfaceType);
      _pushToolCallData(surfaceType, msg);
    }
  });

  // Streaming tool output
  on('tool_stream', (msg) => {
    const tool = msg.tool || msg.name;
    if (!tool) return;
    const surfaceType = TOOL_TO_SURFACE.get(tool);
    if (surfaceType) {
      _resetIdleTimer(surfaceType);
      _pushStreamData(surfaceType, msg);
    }
  });

  // Tool call completed → push result data
  on('tool_result', (msg) => {
    const tool = msg.tool || msg.name;
    if (!tool) return;
    const surfaceType = TOOL_TO_SURFACE.get(tool);
    if (surfaceType) {
      _resetIdleTimer(surfaceType);
      _pushToolResultData(surfaceType, msg);
    }
  });

  // Clean up on disconnect
  on('disconnected', () => {
    deactivateAll();
  });
}

/* ------------------------------------------------------------------ */
/*  Data routing to surface components                                */
/* ------------------------------------------------------------------ */

function _pushToolCallData(surfaceType, msg) {
  const s = _surfaces.get(surfaceType);
  if (!s?.el) return;

  switch (surfaceType) {
    case 'terminal': {
      const el = /** @type {import('../components/sc-terminal.js').ScTerminal} */ (s.el);
      if (el.addCommand) {
        el.addCommand(msg.requestId || msg.id || Date.now().toString(), msg.command || msg.args?.command || '', msg.cwd);
      }
      break;
    }
    case 'editor': {
      const el = /** @type {import('../components/sc-editor.js').ScEditor} */ (s.el);
      if (msg.args?.file_path || msg.args?.path) {
        const path = msg.args.file_path || msg.args.path;
        // Will receive content in tool_result
        el.openFile?.(path, '// Loading…');
      }
      break;
    }
    case 'search': {
      const el = /** @type {import('../components/sc-search.js').ScSearch} */ (s.el);
      if (msg.args?.query) {
        el.setResults?.(msg.args.query, []);
      }
      break;
    }
  }
}

function _pushStreamData(surfaceType, msg) {
  const s = _surfaces.get(surfaceType);
  if (!s?.el) return;

  if (surfaceType === 'terminal') {
    const el = /** @type {import('../components/sc-terminal.js').ScTerminal} */ (s.el);
    if (el.appendOutput) {
      el.appendOutput(msg.requestId || msg.id || '', msg.text || msg.data || '', msg.stream || 'stdout');
    }
  }
}

function _pushToolResultData(surfaceType, msg) {
  const s = _surfaces.get(surfaceType);
  if (!s?.el) return;

  switch (surfaceType) {
    case 'terminal': {
      const el = /** @type {import('../components/sc-terminal.js').ScTerminal} */ (s.el);
      if (el.completeCommand) {
        el.completeCommand(msg.requestId || msg.id || '', msg.exitCode ?? msg.exit_code);
      }
      break;
    }
    case 'explorer': {
      const el = /** @type {import('../components/sc-filetree.js').ScFiletree} */ (s.el);
      if (msg.result?.entries) {
        el.addDirectory?.(msg.args?.path || '.', msg.result.entries);
      } else if (msg.result?.content !== undefined) {
        el.showFile?.(msg.args?.path || msg.args?.file_path || 'unknown', msg.result.content);
      }
      break;
    }
    case 'editor': {
      const el = /** @type {import('../components/sc-editor.js').ScEditor} */ (s.el);
      const path = msg.args?.file_path || msg.args?.path || 'unknown';
      if (msg.result?.content !== undefined) {
        el.openFile?.(path, msg.result.content);
      } else if (msg.result?.diff) {
        el.showEdit?.(path, msg.result.oldContent || '', msg.result.newContent || msg.result.content || '');
      }
      break;
    }
    case 'search': {
      const el = /** @type {import('../components/sc-search.js').ScSearch} */ (s.el);
      if (msg.tool === 'web_search' && msg.result?.results) {
        el.setResults?.(msg.args?.query || '', msg.result.results);
      } else if (msg.tool === 'web_fetch' && msg.result?.content) {
        el.setFetchedPage?.(msg.args?.url || '', msg.result?.title || '', msg.result.content);
      }
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Keyboard shortcuts                                                */
/* ------------------------------------------------------------------ */

function _wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Only handle when meta/ctrl is pressed
    if (!e.metaKey && !e.ctrlKey) return;

    const shortcuts = {
      't': 'terminal',
      'e': 'explorer',
      'd': 'editor',
      // 's' reserved for save in most apps, use shift+s
    };

    if (e.shiftKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      toggleSurface('search');
      return;
    }

    const type = shortcuts[e.key.toLowerCase()];
    if (type) {
      e.preventDefault();
      toggleSurface(type);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Auto-init when DOM is ready                                       */
/* ------------------------------------------------------------------ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSurfaceManager);
} else {
  // Defer to let components register first
  queueMicrotask(initSurfaceManager);
}
