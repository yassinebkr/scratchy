/**
 * Scratchy v2 — App bootstrap
 * Manages auth state, WS connection, and UI routing.
 */

import { connect, disconnect, on, send, sendChat, emit } from './ws-client.js';

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

const state = {
  user: null,
  token: null,
  connected: false,
  reconnecting: false,
};

export function getState() { return { ...state }; }
export function getToken() { return state.token; }

/* ------------------------------------------------------------------ */
/*  DOM refs (resolved after DOMContentLoaded)                        */
/* ------------------------------------------------------------------ */

let $authScreen, $appScreen, $wizardScreen, $messages, $msgInput, $sendBtn;
let $statusDot, $statusText, $topbarUser, $logoutBtn;
let $agentSwitcher;

function resolveDOM() {
  $authScreen   = document.getElementById('auth-screen');
  $appScreen    = document.getElementById('app-screen');
  $wizardScreen = document.getElementById('wizard-screen');
  $messages     = document.getElementById('messages');
  $msgInput     = document.getElementById('msg-input');
  $sendBtn      = document.getElementById('send-btn');
  $statusDot    = document.getElementById('status-dot');
  $statusText   = document.getElementById('status-text');
  $topbarUser   = document.getElementById('topbar-user');
  $logoutBtn    = document.getElementById('logout-btn');
  $agentSwitcher = document.querySelector('sc-agent-switcher');
}

/* ------------------------------------------------------------------ */
/*  UI helpers                                                        */
/* ------------------------------------------------------------------ */

function showAuth() {
  $authScreen.classList.remove('hidden');
  $appScreen.classList.add('hidden');
  if ($wizardScreen) $wizardScreen.classList.add('hidden');
}

function showWizard() {
  $authScreen.classList.add('hidden');
  $appScreen.classList.add('hidden');
  if ($wizardScreen) $wizardScreen.classList.remove('hidden');
}

function showApp() {
  $authScreen.classList.add('hidden');
  if ($wizardScreen) $wizardScreen.classList.add('hidden');
  $appScreen.classList.remove('hidden');
  $msgInput?.focus();
}

function setConnectionStatus(status) {
  // status: 'connected' | 'disconnected' | 'reconnecting'
  state.connected = status === 'connected';
  state.reconnecting = status === 'reconnecting';

  if ($statusDot) {
    $statusDot.className = 'status-dot ' + status;
  }
  if ($statusText) {
    const labels = { connected: 'Connected', disconnected: 'Disconnected', reconnecting: 'Reconnecting…' };
    $statusText.textContent = labels[status] || status;
  }
}

function appendMessage(role, html) {
  if (!$messages) return;
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  div.innerHTML = html;
  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
}

/* ------------------------------------------------------------------ */
/*  Textarea auto-resize                                              */
/* ------------------------------------------------------------------ */

function autoResize(textarea) {
  textarea.style.height = 'auto';
  const max = 160; // px
  textarea.style.height = Math.min(textarea.scrollHeight, max) + 'px';
}

/* ------------------------------------------------------------------ */
/*  Send logic                                                        */
/* ------------------------------------------------------------------ */

function sendMessage() {
  const text = $msgInput.value.trim();
  if (!text) return;

  // Show user bubble immediately
  appendMessage('user', escapeHtml(text));

  sendChat(text);
  $msgInput.value = '';
  autoResize($msgInput);
  $msgInput.focus();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------ */
/*  WS event handlers                                                 */
/* ------------------------------------------------------------------ */

function wireWsEvents() {
  on('connected', () => {
    setConnectionStatus('connected');
  });

  on('disconnected', () => {
    // We'll get reconnecting when the ws-client schedules a retry
    setConnectionStatus('reconnecting');
  });

  on('chat', (msg) => {
    // msg: { type:'chat', text, html?, from? }
    const content = msg.html || escapeHtml(msg.text || '');
    appendMessage('assistant', content);
  });

  on('canvas-update', (msg) => {
    // Forward to GenUI renderer if available
    emit('canvas-update', msg);
  });

  on('agent-switched', (msg) => {
    // Update the agent switcher UI when agent changes (e.g. from another device)
    if ($agentSwitcher && msg.agent) {
      $agentSwitcher.activeAgentId = msg.agent.id;
    }
  });

  on('error', (msg) => {
    console.error('[app] WS error:', msg);
    if (msg.text) {
      appendMessage('system', `<span class="msg-error">${escapeHtml(msg.text)}</span>`);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Auth flow                                                         */
/* ------------------------------------------------------------------ */

async function tryRestoreSession() {
  const token = localStorage.getItem('scratchy_token');
  if (!token) return false;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      localStorage.removeItem('scratchy_token');
      return false;
    }
    const user = await res.json();
    state.token = token;
    state.user = user;
    return true;
  } catch {
    return false;
  }
}

function onAuthSuccess(e) {
  const { token, user } = e.detail;
  state.token = token;
  state.user = user;
  enterApp();
}

async function enterApp() {
  if ($topbarUser) {
    $topbarUser.textContent = state.user?.displayName || state.user?.username || '';
  }

  // Check if setup wizard needs to be shown
  try {
    const res = await fetch('/api/setup/status');
    if (res.ok) {
      const data = await res.json();
      if (!data.complete) {
        showWizard();
        return;
      }
    }
  } catch {
    // If we can't check, proceed to app
  }

  showApp();
  setConnectionStatus('reconnecting');
  connect(state.token);
}

export function logout() {
  // Fire-and-forget logout API call
  const token = state.token;
  if (token) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }).catch(() => {});
  }

  state.user = null;
  state.token = null;
  state.connected = false;
  localStorage.removeItem('scratchy_token');
  disconnect();

  // Reset auth component
  const authEl = document.querySelector('sc-auth');
  if (authEl) authEl.reset();

  showAuth();
}

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */

async function init() {
  resolveDOM();
  wireWsEvents();

  // Listen for auth success from <sc-auth>
  document.addEventListener('auth-success', onAuthSuccess);

  // Listen for setup wizard completion
  document.addEventListener('setup-complete', () => {
    showApp();
    setConnectionStatus('reconnecting');
    connect(state.token);
  });

  // Listen for agent switch from the switcher component
  document.addEventListener('agent-switch', (e) => {
    const { agentId } = e.detail;
    if (agentId) {
      send('agent-switch', { agentId });
    }
  });

  // Logout button
  if ($logoutBtn) {
    $logoutBtn.addEventListener('click', logout);
  }

  // Send button
  if ($sendBtn) {
    $sendBtn.addEventListener('click', sendMessage);
  }

  // Textarea: Enter to send, Shift+Enter for newline, auto-resize
  if ($msgInput) {
    $msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    $msgInput.addEventListener('input', () => autoResize($msgInput));
  }

  // Try to restore existing session
  const restored = await tryRestoreSession();
  if (restored) {
    enterApp();
  } else {
    showAuth();
  }
}

// Boot on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
