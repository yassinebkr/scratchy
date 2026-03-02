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
  terminal: { triggers: ['shell', 'exec', 'Exec', 'bash', 'Bash'], component: 'sc-terminal', priority: 2, label: 'Terminal' },
  explorer: { triggers: ['file_read', 'read', 'Read', 'read_dir', 'list_files', 'list_dir', 'ListDir', 'ReadDir'], component: 'sc-filetree', priority: 1, label: 'Files' },
  editor:   { triggers: ['file_write', 'file_edit', 'file_append', 'write', 'Write', 'edit', 'Edit'], component: 'sc-editor', priority: 2, label: 'Editor' },
  search:   { triggers: ['web_search', 'web_fetch', 'WebSearch', 'WebFetch', 'http_request', 'HttpRequest'], component: 'sc-search', priority: 1, label: 'Search' },
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

const IDLE_TIMEOUT = 300_000; // 5 min after last activity before auto-hide (canvas/surfaces persist)

/**
 * Highlight-only mode: tabs show activity indicators but surfaces
 * don't actually open. Set to false when surface components are ready.
 */
let _highlightOnly = true;
const HIGHLIGHT_RESET_MS = 8000; // auto-clear highlight after 8s of no activity
const _highlightTimers = new Map();

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

  // Note: surface-toggle events from workspace-bar are handled in app.js
  // (which routes mobile vs desktop). Don't add a duplicate listener here.

  // Wire canvas activation with ops forwarding
  window.addEventListener('surface-activate', (e) => {
    const type = e.detail?.type;
    if (!type) return;
    activateSurface(type);
    _resetIdleTimer(type); // keep surface alive
    // Forward ops to the canvas component
    if (type === 'canvas' && e.detail.ops) {
      const s = _surfaces.get('canvas');
      if (s?.el?.applyOps) {
        s.el.applyOps(e.detail.ops);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Surface groups — surfaces in the same group are mutually exclusive
 * when auto-activated by tool events. Manual toggles bypass this.
 */
const SURFACE_GROUPS = {
  terminal: 'primary',
  explorer: 'primary',
  editor: 'secondary',
  search: 'secondary',
  canvas: 'canvas',
};

/** Set of surfaces that were manually toggled (not auto-activated) */
const _manualSurfaces = new Set();

/**
 * Highlight a surface tab without opening the surface panel.
 * Used in highlight-only mode. Auto-clears after HIGHLIGHT_RESET_MS.
 */
function _highlightSurface(type) {
  const $bar = document.querySelector('sc-workspace-bar');
  if ($bar?.setSurfaceActive) $bar.setSurfaceActive(type, true);
  // Auto-clear highlight after timeout
  clearTimeout(_highlightTimers.get(type));
  _highlightTimers.set(type, setTimeout(() => {
    if ($bar?.setSurfaceActive) $bar.setSurfaceActive(type, false);
    _highlightTimers.delete(type);
  }, HIGHLIGHT_RESET_MS));
}

/** Activate a surface by type */
export function activateSurface(type, { manual = false } = {}) {
  // In highlight-only mode, just pulse the tab indicator
  if (_highlightOnly) {
    _highlightSurface(type);
    return;
  }

  const s = _surfaces.get(type);
  if (!s || s.active) return;

  // Track whether this was manually activated
  if (manual) _manualSurfaces.add(type);

  // Soft exclusive: deactivate other auto-activated surfaces in same group
  const group = SURFACE_GROUPS[type];
  if (group && !manual) {
    for (const [otherType, otherState] of _surfaces) {
      if (otherType !== type && otherState.active && SURFACE_GROUPS[otherType] === group && !_manualSurfaces.has(otherType)) {
        deactivateSurface(otherType);
      }
    }
  }

  s.active = true;
  s.el.style.display = '';

  if (_container && !_container.contains(s.el)) {
    _container.appendChild(s.el);
  }

  // Entry animation: spring-based slide-up with blur
  s.el.classList.remove('surface-exit');
  s.el.classList.add('surface-enter');
  s.el.addEventListener('animationend', () => s.el.classList.remove('surface-enter'), { once: true });

  _resetIdleTimer(type);
  _updateLayout();
  _updateToolbar();
  _saveActiveSurfaces();
  emit('surface:activated', { type });
}

/** Deactivate a surface by type */
export function deactivateSurface(type) {
  const s = _surfaces.get(type);
  if (!s || !s.active) return;

  s.active = false;
  _manualSurfaces.delete(type);
  _clearIdleTimer(type);

  // Exit animation: scale-down + fade, then remove from DOM
  s.el.classList.remove('surface-enter');
  s.el.classList.add('surface-exit');

  const onExit = () => {
    s.el.classList.remove('surface-exit');
    s.el.style.display = 'none';
    s.el.style.gridArea = '';
    if (_container && _container.contains(s.el)) {
      _container.removeChild(s.el);
    }
    _updateLayout();
  };

  s.el.addEventListener('animationend', onExit, { once: true });

  // Safety: if animationend never fires (e.g. display:none race), clean up
  setTimeout(() => {
    if (s.el.classList.contains('surface-exit')) onExit();
  }, 300);

  _updateToolbar();
  _saveActiveSurfaces();
  emit('surface:deactivated', { type });
}

/** Toggle a surface (always treated as manual) */
export function toggleSurface(type) {
  // In highlight-only mode, just toggle the tab highlight
  if (_highlightOnly) {
    const $bar = document.querySelector('sc-workspace-bar');
    const timer = _highlightTimers.get(type);
    if (timer) {
      clearTimeout(timer);
      _highlightTimers.delete(type);
      if ($bar?.setSurfaceActive) $bar.setSurfaceActive(type, false);
    } else {
      _highlightSurface(type);
    }
    return;
  }

  const s = _surfaces.get(type);
  if (!s) return;
  if (s.active) deactivateSurface(type);
  else activateSurface(type, { manual: true });
}

/** Enable or disable highlight-only mode */
export function setHighlightOnly(enabled) {
  _highlightOnly = !!enabled;
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

/**
 * Open a web app in a sandboxed iframe surface.
 * Creates a dynamic webapp surface with a unique key.
 *
 * @param {string} url — URL to embed
 * @param {string} [title] — display title
 * @returns {string} — surface key (for later closing)
 */
let _webappCounter = 0;
export function openWebApp(url, title) {
  const key = `webapp-${++_webappCounter}`;
  const el = document.createElement('sc-webapp');
  el.setAttribute('url', url);
  el.setAttribute('title', title || new URL(url).hostname);
  el.classList.add('surface', `${key}-surface`);

  // Listen for close event
  el.addEventListener('webapp-close', () => {
    const s = _surfaces.get(key);
    if (s) {
      s.active = false;
      el.remove();
      _surfaces.delete(key);
      _updateLayout();
      _updateToolbar();
      emit('surface:deactivated', { type: key });
    }
  });

  // Register and activate
  _surfaces.set(key, { el, active: true, idleTimer: null });
  if (_container) _container.appendChild(el);

  _updateLayout();
  _updateToolbar();
  emit('surface:activated', { type: key });

  return key;
}

/* ------------------------------------------------------------------ */
/*  Layout configurations (data-layout → CSS grid)                    */
/* ------------------------------------------------------------------ */

/**
 * Layout presets keyed by data-layout attribute value.
 * Each defines named grid areas and the grid template.
 *
 *   chat-only : single column, chat fills everything
 *   split     : 1fr 420px — primary surface + chat
 *   dev       : 1fr 420px cols, 1fr 280px rows — primary + secondary + chat spanning right
 *   full      : 1fr 1fr 380px cols, 1fr 1fr rows — three surfaces + chat right rail
 *   research  : 1fr 1fr — 50/50 split (two surfaces, no separate chat column)
 */
const LAYOUT_CONFIGS = {
  'chat-only': {
    areas: [],          // no non-chat surfaces
  },
  'canvas-focus': {
    areas: ['canvas'],  // canvas dominates, chat is bottom strip
  },
  'split': {
    areas: ['primary'], // one surface
  },
  'dev': {
    areas: ['primary', 'secondary'],
  },
  'full': {
    areas: ['primary', 'secondary', 'tertiary'],
  },
  'research': {
    areas: ['primary', 'secondary'],
  },
};

/* ------------------------------------------------------------------ */
/*  Layout engine                                                     */
/* ------------------------------------------------------------------ */

/**
 * Determine which layout preset fits the current surface count.
 * @param {number} count — number of active (non-chat) surfaces
 * @returns {string} layout name
 */
function _pickLayout(count) {
  if (count === 0) return 'chat-only';
  // Check if canvas is the primary active surface
  const active = getActiveSurfaces();
  const hasCanvas = active.includes('canvas');
  if (count === 1 && hasCanvas) return 'canvas-focus';
  if (count === 1) return 'split';
  if (count === 2) return 'dev';
  return 'full'; // 3+
}

function _updateLayout() {
  if (!_container || !_chatSurface) return;

  const active = getActiveSurfaces();
  const layoutName = _pickLayout(active.length);

  // Set the data-layout attribute (CSS handles grid templates)
  _container.dataset.layout = layoutName;

  // Clear any leftover inline grid styles — CSS rules drive the grid now
  _container.style.display = '';
  _container.style.gridTemplateColumns = '';
  _container.style.gridTemplateRows = '';

  // Chat always occupies the 'chat' grid area
  _chatSurface.style.gridArea = 'chat';
  _chatSurface.style.display = '';

  if (active.length === 0) {
    _chatSurface.style.gridArea = '';
    return;
  }

  // Move chat surface into grid container if not already there
  if (!_container.contains(_chatSurface)) {
    _container.appendChild(_chatSurface);
  }

  // Sort active surfaces by priority (descending)
  const sorted = [...active].sort((a, b) => {
    const pa = SURFACE_DEFS[a]?.priority ?? 0;
    const pb = SURFACE_DEFS[b]?.priority ?? 0;
    return pb - pa;
  });

  // Named area slots from the chosen layout config
  const config = LAYOUT_CONFIGS[layoutName];
  const areaSlots = config?.areas ?? [];

  sorted.forEach((type, i) => {
    const s = _surfaces.get(type);
    if (!s) return;
    if (i < areaSlots.length) {
      // Assign grid area name from the layout config
      s.el.style.gridArea = areaSlots[i];
    } else {
      // Overflow: deactivate surfaces that exceed available grid slots
      deactivateSurface(type);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Surface state persistence (across tab switches / reconnects)      */
/* ------------------------------------------------------------------ */

const SURFACE_STATE_KEY = 'scratchy-active-surfaces';

function _saveActiveSurfaces() {
  try {
    const active = [];
    for (const [type, s] of _surfaces) {
      if (s.active) active.push(type);
    }
    localStorage.setItem(SURFACE_STATE_KEY, JSON.stringify(active));
  } catch {}
}

function _restoreActiveSurfaces() {
  try {
    const raw = localStorage.getItem(SURFACE_STATE_KEY);
    if (!raw) return;
    const types = JSON.parse(raw);
    if (!Array.isArray(types)) return;
    for (const type of types) {
      const s = _surfaces.get(type);
      if (s && !s.active) {
        activateSurface(type);
      }
    }
  } catch {}
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

/* ------------------------------------------------------------------ */
/*  Smart tool → surface routing                                      */
/* ------------------------------------------------------------------ */

/** Filesystem browsing commands that should open file explorer, not terminal */
const FS_COMMANDS = /^\s*(ls|find|tree|stat|du|df|file|readlink|realpath|dirname|basename|wc\s+-l|head|tail|cat)\b/;

/**
 * Detect if a shell command is a filesystem browsing operation.
 * These should route to the file explorer surface, not the terminal.
 */
function _isFilesystemCommand(cmd) {
  if (!cmd) return false;
  // Handle piped commands: check the first command in the pipe chain
  const firstCmd = cmd.split('|')[0].trim();
  return FS_COMMANDS.test(firstCmd);
}

function _wireEvents() {
  // Tool call started → activate relevant surface
  on('tool_call', (msg) => {
    const tool = msg.tool || msg.name;
    if (!tool) return;
    let surfaceType = TOOL_TO_SURFACE.get(tool);

    // Smart routing: detect filesystem shell commands → route to file explorer
    // instead of terminal (ls, find, tree, stat, du, etc. are browsing, not execution)
    if (surfaceType === 'terminal' && tool === 'shell') {
      const cmd = (msg.args?.command || '').trim();
      if (_isFilesystemCommand(cmd)) {
        surfaceType = 'explorer';
      }
    }

    if (surfaceType) {
      activateSurface(surfaceType);
      _pushToolCallData(surfaceType, msg);
    }
  });

  // Streaming tool output
  on('tool_stream', (msg) => {
    const tool = msg.tool || msg.name;
    if (!tool) return;
    let surfaceType = TOOL_TO_SURFACE.get(tool);
    if (surfaceType === 'terminal' && tool === 'shell' && _isFilesystemCommand(msg.args?.command || msg.command)) {
      surfaceType = 'explorer';
    }
    if (surfaceType) {
      _resetIdleTimer(surfaceType);
      _pushStreamData(surfaceType, msg);
    }
  });

  // Tool call completed → push result data
  on('tool_result', (msg) => {
    const tool = msg.tool || msg.name;
    if (!tool) return;
    let surfaceType = TOOL_TO_SURFACE.get(tool);
    if (surfaceType === 'terminal' && tool === 'shell' && _isFilesystemCommand(msg.args?.command || msg.command)) {
      surfaceType = 'explorer';
    }
    if (surfaceType) {
      _resetIdleTimer(surfaceType);
      _pushToolResultData(surfaceType, msg);
    }
  });

  // On disconnect: save active surfaces but DON'T deactivate — user expects
  // surfaces to persist across tab switches / brief disconnects.
  // Only clean up on explicit logout.
  on('disconnected', () => {
    _saveActiveSurfaces();
    // Clear idle timers so nothing auto-hides during reconnect
    for (const [type, s] of _surfaces) {
      if (s.active) _clearIdleTimer(type);
    }
  });

  // On reconnect: restore any surfaces that were saved
  on('connected', () => {
    _restoreActiveSurfaces();
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
        // NullClaw shell tool uses "command" arg; may also have "timeout_secs"
        const cmd = msg.args?.command || msg.command || '';
        el.addCommand(msg.requestId || msg.id || Date.now().toString(), cmd, msg.args?.cwd || msg.cwd);
      }
      break;
    }
    case 'explorer': {
      const el = /** @type {import('../components/sc-filetree.js').ScFiletree} */ (s.el);
      // NullClaw file_read uses "file_path" or "path" arg
      const path = msg.args?.file_path || msg.args?.path || msg.args?.directory || '';
      if (path) {
        // Show loading state for file read operations
        el.showFile?.(path, '// Loading…');
      }
      break;
    }
    case 'editor': {
      const el = /** @type {import('../components/sc-editor.js').ScEditor} */ (s.el);
      // NullClaw file_write/file_edit use "file_path" or "path" arg
      const path = msg.args?.file_path || msg.args?.path || '';
      if (path) {
        el.openFile?.(path, '// Loading…');
      }
      break;
    }
    case 'search': {
      const el = /** @type {import('../components/sc-search.js').ScSearch} */ (s.el);
      if (msg.args?.query) {
        el.setResults?.(msg.args.query, []);
      } else if (msg.args?.url) {
        // web_fetch — show URL being fetched
        el.setResults?.(msg.args.url, []);
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
      // Push the command output text before marking complete
      const output = msg.result?.content || msg.result?.text || msg.result?.output || '';
      if (output && el.appendOutput) {
        el.appendOutput(msg.requestId || msg.id || '', output, 'stdout');
      }
      if (el.completeCommand) {
        // NullClaw doesn't send exit_code separately — infer from success flag
        const exitCode = msg.exitCode ?? msg.exit_code ?? (msg.result?.success === false ? 1 : msg.result?.success === true ? 0 : undefined);
        el.completeCommand(msg.requestId || msg.id || '', exitCode);
      }
      break;
    }
    case 'explorer': {
      const el = /** @type {import('../components/sc-filetree.js').ScFiletree} */ (s.el);
      const path = msg.args?.file_path || msg.args?.path || msg.args?.directory || '.';
      if (msg.result?.entries) {
        // Structured directory listing (pre-parsed by orchestrator)
        el.addDirectory?.(path, msg.result.entries);
      } else if (msg.result?.content !== undefined) {
        // File content or raw text output
        el.showFile?.(path, msg.result.content);
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
/*  Auto-init removed — app.js calls initSurfaceManager() explicitly  */
/*  to avoid double-init (which registered event listeners twice and   */
/*  created duplicate surface elements).                              */
/* ------------------------------------------------------------------ */
