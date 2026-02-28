/**
 * Scratchy v2 — Activity Monitor
 *
 * Tracks what the AI agent is currently doing and broadcasts state changes
 * to all UI consumers. This is the heartbeat of the agent-driven UI —
 * every surface, indicator, and animation reacts to activity state.
 *
 * States: 'idle' | 'thinking' | 'coding' | 'searching' | 'reading' | 'error'
 *
 * Consumers:
 *   - document.documentElement.dataset.activityState  (CSS hooks)
 *   - onActivityChange(cb)  callbacks
 *   - CustomEvent 'activity-change' on document  (Web Components)
 */

import { on } from './ws-client.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Tool name → activity state mapping */
const TOOL_ACTIVITY_MAP = {
  exec:        'coding',
  write:       'coding',
  edit:        'coding',
  web_search:  'searching',
  web_fetch:   'searching',
  read:        'reading',
  read_dir:    'reading',
  list_files:  'reading',
  Read:        'reading',
  Write:       'coding',
  Edit:        'coding',
};

/** How long 'error' state persists before auto-resetting to 'idle' */
const ERROR_RESET_MS = 3000;

/** Detail labels for tool activities */
const TOOL_DETAIL_MAP = {
  exec:        'Running command…',
  write:       'Writing file…',
  edit:        'Editing file…',
  Write:       'Writing file…',
  Edit:        'Editing file…',
  web_search:  'Searching the web…',
  web_fetch:   'Reading a webpage…',
  read:        'Reading file…',
  Read:        'Reading file…',
  read_dir:    'Scanning directory…',
  list_files:  'Listing files…',
};

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

/** @type {{ state: string, detail: string, since: number }} */
let _activity = {
  state: 'idle',
  detail: '',
  since: Date.now(),
};

/** @type {Set<(change: {state: string, detail: string, previousState: string}) => void>} */
const _callbacks = new Set();

/** @type {number|null} */
let _errorResetTimer = null;

/** Track whether we've seen the first delta in a chat-stream sequence */
let _streamStarted = false;

/* ------------------------------------------------------------------ */
/*  Core state machine                                                */
/* ------------------------------------------------------------------ */

/**
 * Transition to a new activity state.
 * Deduplicates if state + detail haven't changed.
 *
 * @param {string} newState
 * @param {string} [detail='']
 */
function _setState(newState, detail = '') {
  const prev = _activity.state;

  // Deduplicate — don't broadcast if nothing changed
  if (prev === newState && _activity.detail === detail) return;

  _activity = {
    state: newState,
    detail,
    since: Date.now(),
  };

  // Clear any pending error reset if we're moving away from error
  if (newState !== 'error' && _errorResetTimer) {
    clearTimeout(_errorResetTimer);
    _errorResetTimer = null;
  }

  // --- Broadcast to all consumers ---

  // 1. Dataset attribute for CSS selectors:
  //    html[data-activity-state="coding"] .some-element { ... }
  document.documentElement.dataset.activityState = newState;

  // 2. Registered callbacks
  const change = { state: newState, detail, previousState: prev };
  for (const cb of _callbacks) {
    try { cb(change); } catch (e) { console.error('[activity-monitor] callback error:', e); }
  }

  // 3. CustomEvent for Web Components
  document.dispatchEvent(new CustomEvent('activity-change', {
    detail: change,
    bubbles: true,
  }));
}

/**
 * Resolve tool name to an activity state.
 * @param {string} toolName
 * @returns {string}
 */
function _resolveToolActivity(toolName) {
  return TOOL_ACTIVITY_MAP[toolName] || 'coding'; // default to coding for unknown tools
}

/**
 * Build a human-readable detail string for a tool call.
 * @param {string} toolName
 * @param {Object} [args]
 * @returns {string}
 */
function _resolveDetail(toolName, args) {
  const base = TOOL_DETAIL_MAP[toolName] || `Using ${toolName}…`;

  // Enrich with context from args
  if (args) {
    if (toolName === 'exec' && args.command) {
      const cmd = args.command.length > 60 ? args.command.slice(0, 57) + '…' : args.command;
      return `Running: ${cmd}`;
    }
    if ((toolName === 'write' || toolName === 'Write') && (args.file_path || args.path)) {
      const p = args.file_path || args.path;
      const short = p.split('/').pop();
      return `Writing ${short}`;
    }
    if ((toolName === 'edit' || toolName === 'Edit') && (args.file_path || args.path)) {
      const p = args.file_path || args.path;
      const short = p.split('/').pop();
      return `Editing ${short}`;
    }
    if (toolName === 'web_search' && args.query) {
      const q = args.query.length > 50 ? args.query.slice(0, 47) + '…' : args.query;
      return `Searching: "${q}"`;
    }
    if (toolName === 'web_fetch' && args.url) {
      try {
        const host = new URL(args.url).hostname;
        return `Reading ${host}`;
      } catch { /* fallthrough */ }
    }
    if ((toolName === 'read' || toolName === 'Read') && (args.file_path || args.path)) {
      const p = args.file_path || args.path;
      const short = p.split('/').pop();
      return `Reading ${short}`;
    }
    if (toolName === 'read_dir' && args.path) {
      const short = args.path.split('/').pop() || args.path;
      return `Scanning ${short}/`;
    }
  }

  return base;
}

/* ------------------------------------------------------------------ */
/*  Thinking indicator DOM control                                    */
/* ------------------------------------------------------------------ */

/**
 * Show or hide the thinking indicator based on state.
 * @param {string} state
 */
function _updateThinkingIndicator(state) {
  const indicator = document.getElementById('thinking-indicator');
  if (!indicator) return;

  if (state === 'thinking') {
    indicator.style.display = '';
    // Scroll it into view in the messages area
    const messages = document.getElementById('messages');
    if (messages) {
      messages.scrollTop = messages.scrollHeight;
    }
  } else {
    indicator.style.display = 'none';
  }
}

/* ------------------------------------------------------------------ */
/*  WS event wiring                                                   */
/* ------------------------------------------------------------------ */

function _wireEvents() {
  // 1. typing { status: 'start' } → thinking
  on('typing', (msg) => {
    if (msg.status === 'start') {
      _streamStarted = false; // reset for new response cycle
      _setState('thinking', 'Processing…');
    }
  });

  // 2. tool_call → activity based on tool name
  on('tool_call', (msg) => {
    const tool = msg.tool || msg.name || '';
    const activity = _resolveToolActivity(tool);
    const detail = _resolveDetail(tool, msg.args);
    _setState(activity, detail);
  });

  // 3. tool_result → back to thinking (between tools)
  on('tool_result', () => {
    _setState('thinking', 'Processing results…');
  });

  // 4. chat-stream (first delta) → idle (response is streaming to user)
  on('chat-stream', () => {
    if (!_streamStarted) {
      _streamStarted = true;
      _setState('idle', '');
    }
  });

  // 5. chat-stream-end → idle
  on('chat-stream-end', () => {
    _streamStarted = false;
    _setState('idle', '');
  });

  // 6. error → error state, auto-reset after 3s
  on('error', (msg) => {
    _setState('error', msg.text || 'Something went wrong');
    _errorResetTimer = setTimeout(() => {
      _errorResetTimer = null;
      _setState('idle', '');
    }, ERROR_RESET_MS);
  });

  // Also listen for activity changes to manage thinking indicator
  onActivityChange(({ state }) => {
    _updateThinkingIndicator(state);
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Initialize the activity monitor.
 * Call once after DOM is ready. Wires WS events.
 */
export function initActivityMonitor() {
  // Set initial state on DOM
  document.documentElement.dataset.activityState = 'idle';
  _wireEvents();
}

/**
 * Get the current activity state.
 * @returns {{ state: string, detail: string, since: number }}
 */
export function getActivity() {
  return { ..._activity };
}

/**
 * Subscribe to activity state changes.
 * @param {(change: {state: string, detail: string, previousState: string}) => void} cb
 * @returns {() => void} Unsubscribe function
 */
export function onActivityChange(cb) {
  _callbacks.add(cb);
  return () => _callbacks.delete(cb);
}

/* ------------------------------------------------------------------ */
/*  Auto-init                                                         */
/* ------------------------------------------------------------------ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initActivityMonitor);
} else {
  queueMicrotask(initActivityMonitor);
}
