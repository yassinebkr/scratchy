/**
 * Scratchy v2 — Agent Presence
 *
 * Manages the active agent's visual presence throughout the UI.
 * When the agent switches, everything updates — accent colors ripple
 * through CSS custom properties, the chat header morphs, and the
 * workspace bar reflects the new agent's identity.
 *
 * This is the personality layer — each agent gets its own color,
 * initials, and visual signature.
 */

import { on } from './ws-client.js';

/* ------------------------------------------------------------------ */
/*  Avatar color palette                                              */
/* ------------------------------------------------------------------ */

const AVATAR_PALETTE = [
  { bg: '#F9A602', fg: '#0d0b07' },  // gold
  { bg: '#6366f1', fg: '#ffffff' },  // indigo
  { bg: '#22c55e', fg: '#0d0b07' },  // green
  { bg: '#ef4444', fg: '#ffffff' },  // red
  { bg: '#3b82f6', fg: '#ffffff' },  // blue
  { bg: '#a855f7', fg: '#ffffff' },  // purple
  { bg: '#ec4899', fg: '#ffffff' },  // pink
  { bg: '#14b8a6', fg: '#0d0b07' },  // teal
];

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

/** @type {{ name: string, role: string, model: string, color: { bg: string, fg: string } }} */
let _activeAgent = {
  name: 'Assistant',
  role: 'assistant',
  model: 'Claude',
  color: AVATAR_PALETTE[0], // default gold
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Simple string hash → palette index.
 * Deterministic: same name always gets the same color.
 * @param {string} str
 * @returns {number}
 */
function _hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Pick a color from the palette based on agent name.
 * @param {string} name
 * @returns {{ bg: string, fg: string }}
 */
function _pickColor(name) {
  if (!name) return AVATAR_PALETTE[0];
  const idx = _hashString(name) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

/**
 * Extract initials from an agent name.
 * "Claude Opus" → "CO", "gpt-4" → "G4", "a" → "A"
 * @param {string} name
 * @returns {string}
 */
function _getInitials(name) {
  if (!name) return '?';

  // If it contains hyphens/underscores, split on those
  const parts = name.split(/[\s\-_]+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  // Single word: first two chars
  if (name.length >= 2) {
    return name.slice(0, 2).toUpperCase();
  }

  return name[0].toUpperCase();
}

/**
 * Convert a hex color to rgba with alpha.
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
function _hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------------ */
/*  CSS custom property updates                                       */
/* ------------------------------------------------------------------ */

/**
 * Push agent accent colors into CSS custom properties on <html>.
 * Every element using var(--agent-accent) will update instantly.
 * @param {{ bg: string, fg: string }} color
 */
function _updateCSSProperties(color) {
  const root = document.documentElement.style;
  root.setProperty('--agent-accent', color.bg);
  root.setProperty('--agent-accent-fg', color.fg);
  root.setProperty('--agent-accent-glow', _hexToRgba(color.bg, 0.20));
  root.setProperty('--agent-accent-subtle', _hexToRgba(color.bg, 0.08));
}

/* ------------------------------------------------------------------ */
/*  DOM updates                                                       */
/* ------------------------------------------------------------------ */

/**
 * Update the chat header with agent info.
 * @param {{ name: string, model: string, color: { bg: string, fg: string } }} agent
 */
function _updateChatHeader(agent) {
  const $avatar = document.getElementById('chat-header-avatar');
  const $name = document.getElementById('chat-header-name');
  const $model = document.getElementById('chat-header-model');

  if ($avatar) {
    /* Try persona photo first, fall back to initials */
    const slug = (agent.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const img = new Image();
    img.src = `/assets/agents/${slug}.png`;
    img.onload = () => {
      $avatar.textContent = '';
      $avatar.style.background = 'transparent';
      img.style.cssText = 'width:100%;height:100%;border-radius:inherit;object-fit:cover';
      $avatar.appendChild(img);
    };
    img.onerror = () => {
      $avatar.textContent = _getInitials(agent.name);
      $avatar.style.background = agent.color.bg;
      $avatar.style.color = agent.color.fg;
    };
  }

  if ($name) {
    $name.textContent = agent.name;
  }

  if ($model) {
    $model.textContent = agent.model || '';
  }
}

/**
 * Update the workspace bar component if present.
 * @param {{ name: string, role: string, model: string, color: { bg: string, fg: string } }} agent
 */
function _updateWorkspaceBar(agent) {
  const $bar = document.querySelector('sc-workspace-bar');
  if ($bar && typeof $bar.setAgent === 'function') {
    $bar.setAgent(agent);
  }
}

/* ------------------------------------------------------------------ */
/*  WS event wiring                                                   */
/* ------------------------------------------------------------------ */

function _wireEvents() {
  on('agent-switched', (msg) => {
    if (!msg.agent) return;

    const agent = msg.agent;
    const name = agent.name || agent.id || 'Agent';
    const role = agent.role || 'assistant';
    const model = agent.model || agent.modelId || '';

    setActiveAgent({ name, role, model });
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Initialize agent presence tracking.
 * Call once after DOM is ready.
 */
export function initAgentPresence() {
  // Set initial accent colors (gold default)
  _updateCSSProperties(_activeAgent.color);
  _updateChatHeader(_activeAgent);
  _wireEvents();
}

/**
 * Get the current active agent.
 * @returns {{ name: string, role: string, model: string, color: { bg: string, fg: string } }}
 */
export function getActiveAgent() {
  return { ..._activeAgent, color: { ..._activeAgent.color } };
}

/**
 * Set the active agent and update all UI surfaces.
 * Can be called programmatically or triggered by WS events.
 *
 * @param {{ name: string, role?: string, model?: string, color?: { bg: string, fg: string } }} agent
 */
export function setActiveAgent(agent) {
  const color = agent.color || _pickColor(agent.name);

  _activeAgent = {
    name: agent.name || 'Agent',
    role: agent.role || 'assistant',
    model: agent.model || '',
    color,
  };

  // Cascade updates to all consumers
  _updateCSSProperties(color);
  _updateChatHeader(_activeAgent);
  _updateWorkspaceBar(_activeAgent);

  // Dispatch event for any other listeners
  document.dispatchEvent(new CustomEvent('agent-presence-change', {
    detail: { ..._activeAgent, color: { ...color } },
    bubbles: true,
  }));
}

/* ------------------------------------------------------------------ */
/*  Auto-init                                                         */
/* ------------------------------------------------------------------ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAgentPresence);
} else {
  queueMicrotask(initAgentPresence);
}
