/**
 * Scratchy v2 — Surface Manager
 * Dynamically shows/hides surfaces based on agent activity.
 * 
 * Surfaces are UI panels that appear when the agent performs specific actions:
 * - Terminal surface when agent runs commands
 * - File explorer when agent reads directories
 * - Code editor when agent writes files
 * - Canvas when agent sends UI components
 * - Chat is always present
 */

import { on, emit } from './ws-client.js';

/** @type {Map<string, {el: HTMLElement, priority: number, active: boolean}>} */
const _surfaces = new Map();

const container = document.getElementById('surfaces');

/** Surface type definitions */
const SURFACE_DEFS = {
  terminal:  { trigger: ['exec'],                      priority: 2, label: 'Terminal' },
  explorer:  { trigger: ['read_dir', 'list_files'],    priority: 1, label: 'Files' },
  editor:    { trigger: ['write', 'edit'],             priority: 2, label: 'Editor' },
  search:    { trigger: ['web_search', 'web_fetch'],   priority: 1, label: 'Search' },
  canvas:    { trigger: ['canvas_op'],                 priority: 3, label: 'Canvas' },
};

/** Register a surface component */
export function registerSurface(type, el) {
  const def = SURFACE_DEFS[type] || { priority: 0 };
  _surfaces.set(type, { el, priority: def.priority, active: false });
  el.classList.add('surface', `${type}-surface`, 'surface-enter');
  el.style.display = 'none';
}

/** Activate a surface (show it) */
export function activateSurface(type) {
  const s = _surfaces.get(type);
  if (!s || s.active) return;
  s.active = true;
  s.el.style.display = '';
  s.el.classList.add('surface-enter');
  container.appendChild(s.el);
  updateLayout();
  emit('surface:activated', { type });
}

/** Deactivate a surface (hide it) */
export function deactivateSurface(type) {
  const s = _surfaces.get(type);
  if (!s || !s.active) return;
  s.active = false;
  s.el.style.display = 'none';
  if (s.el.parentNode === container) container.removeChild(s.el);
  updateLayout();
  emit('surface:deactivated', { type });
}

/** Toggle a surface */
export function toggleSurface(type) {
  const s = _surfaces.get(type);
  if (s?.active) deactivateSurface(type);
  else activateSurface(type);
}

/** Get active surface types */
export function getActiveSurfaces() {
  return [..._surfaces.entries()]
    .filter(([, s]) => s.active)
    .map(([type]) => type);
}

/** Update grid layout based on active surfaces */
function updateLayout() {
  const active = getActiveSurfaces();
  // Chat surface is always in the DOM (not managed by surface-manager)
  // So we count: chat + any active surfaces
  const totalPanels = active.length + 1; // +1 for chat
  
  container.classList.remove('layout-split', 'layout-chat-plus', 'layout-grid');
  
  if (totalPanels === 1) {
    // Just chat — full width (default)
  } else if (totalPanels === 2) {
    container.classList.add('layout-chat-plus');
  } else if (totalPanels === 3) {
    container.classList.add('layout-split');
  } else {
    container.classList.add('layout-grid');
  }
}

/** Handle agent tool calls — auto-activate relevant surfaces */
function handleToolCall(toolName) {
  for (const [type, def] of Object.entries(SURFACE_DEFS)) {
    if (def.trigger.includes(toolName)) {
      activateSurface(type);
    }
  }
}

/** Handle agent activity end — auto-deactivate surfaces after idle */
let _idleTimers = new Map();
const IDLE_TIMEOUT = 10000; // 10s after last activity

function resetIdleTimer(type) {
  if (_idleTimers.has(type)) clearTimeout(_idleTimers.get(type));
  _idleTimers.set(type, setTimeout(() => {
    deactivateSurface(type);
    _idleTimers.delete(type);
  }, IDLE_TIMEOUT));
}

// Listen for agent activity
on('tool_call', (msg) => {
  if (msg.tool) handleToolCall(msg.tool);
});

on('tool_result', (msg) => {
  // Keep surface alive, reset idle timer
  for (const [type, def] of Object.entries(SURFACE_DEFS)) {
    if (def.trigger.includes(msg.tool)) {
      resetIdleTimer(type);
    }
  }
});

// Clean up on disconnect
on('disconnected', () => {
  for (const [type] of _surfaces) {
    deactivateSurface(type);
  }
  _idleTimers.forEach(t => clearTimeout(t));
  _idleTimers.clear();
});
