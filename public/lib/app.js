/**
 * Scratchy v2 — App bootstrap
 * Manages auth state, WS connection, and UI routing.
 */

import { connect, disconnect, on, send, sendChat, emit } from './ws-client.js';
import { MobileUXManager } from './mobile-ux.js';

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

const state = {
  user: null,
  token: null,
  connected: false,
  reconnecting: false,
  reconnectAttempts: 0,
};

export function getState() { return { ...state }; }
export function getToken() { return state.token; }

/* ------------------------------------------------------------------ */
/*  DOM refs (resolved after DOMContentLoaded)                        */
/* ------------------------------------------------------------------ */

let $loadingScreen, $landingScreen, $authScreen, $appScreen, $wizardScreen, $plansScreen;
let $messages, $msgInput, $sendBtn;
let $statusDot, $statusText, $statusBadge, $topbarUser, $logoutBtn, $userMenuBtn, $userMenu, $settingsBtn, $adminBtn;
let $agentSwitcher;
let $mobileAgentBtn;
let $workspaceBar;

function resolveDOM() {
  $loadingScreen = document.getElementById('loading-screen');
  $landingScreen = document.getElementById('landing-screen');
  $authScreen   = document.getElementById('auth-screen');
  $appScreen    = document.getElementById('app-screen');
  $wizardScreen = document.getElementById('wizard-screen');
  $plansScreen  = document.getElementById('plans-screen');
  $messages     = document.getElementById('messages');
  $msgInput     = document.getElementById('msg-input');
  $sendBtn      = document.getElementById('send-btn');
  $statusDot    = document.getElementById('status-dot');
  $statusText   = document.getElementById('status-text');
  $statusBadge  = $statusDot?.closest('.status-badge');
  $topbarUser   = document.getElementById('topbar-user');
  $logoutBtn    = document.getElementById('logout-btn');
  $adminBtn     = document.getElementById('admin-btn');
  $userMenuBtn  = document.getElementById('topbar-user-btn');
  $userMenu     = document.getElementById('user-menu');
  $settingsBtn  = document.getElementById('settings-btn');
  $agentSwitcher = document.querySelector('sc-agent-switcher');
  $mobileAgentBtn = document.getElementById('mobile-agent-btn');
  $workspaceBar = document.querySelector('sc-workspace-bar');
}

/* ------------------------------------------------------------------ */
/*  UI helpers                                                        */
/* ------------------------------------------------------------------ */

function hideAllScreens() {
  // Always hide loading screen once we've routed
  if ($loadingScreen) $loadingScreen.classList.add('hidden');
  [$landingScreen, $authScreen, $appScreen, $wizardScreen, $plansScreen]
    .forEach(el => el?.classList.add('hidden'));
  if ($workspaceBar) $workspaceBar.style.display = 'none';
}

function showLanding() {
  hideAllScreens();
  if ($landingScreen) $landingScreen.classList.remove('hidden');
  else showAuth(); // fallback if no landing page
}

function showAuth() {
  hideAllScreens();
  $authScreen.classList.remove('hidden');
}

function showPlans() {
  hideAllScreens();
  if ($plansScreen) $plansScreen.classList.remove('hidden');
  else showApp(); // skip if no plans screen
}

function showWizard() {
  hideAllScreens();
  if ($wizardScreen) $wizardScreen.classList.remove('hidden');
}

function showApp() {
  hideAllScreens();
  $appScreen.classList.remove('hidden');
  if ($workspaceBar) $workspaceBar.style.display = '';
  $msgInput?.focus();
}

function setConnectionStatus(status) {
  // status: 'connected' | 'disconnected' | 'reconnecting' | 'failed'
  state.connected = status === 'connected';
  state.reconnecting = status === 'reconnecting';

  if (status === 'connected') {
    state.reconnectAttempts = 0;
  }

  if ($statusDot) {
    $statusDot.className = 'status-dot ' + (status === 'failed' ? 'disconnected' : status);
  }
  if ($statusText) {
    const labels = {
      connected: 'Connected',
      disconnected: 'Disconnected',
      reconnecting: 'Reconnecting…',
      failed: 'Connection failed — click to retry',
    };
    $statusText.textContent = labels[status] || status;
  }

  // Make badge clickable when failed
  if ($statusBadge) {
    if (status === 'failed') {
      $statusBadge.classList.add('clickable');
      $statusBadge.onclick = () => {
        state.reconnectAttempts = 0;
        setConnectionStatus('reconnecting');
        disconnect();
        if (state.token) connect(state.token);
      };
    } else {
      $statusBadge.classList.remove('clickable');
      $statusBadge.onclick = null;
    }
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

  // Send with active agent ID for per-agent conversation isolation
  const activeAgentId = $agentSwitcher?._activeAgentId || null;
  sendChat(text, activeAgentId);
  $msgInput.value = '';
  autoResize($msgInput);
  $msgInput.focus();
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Basic markdown → HTML (bold, italic, inline code, code blocks, newlines) */
function formatMarkdown(text) {
  let html = escapeHtml(text);
  // Code blocks: ```...```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold: **...**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *...*
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  return html;
}

/* ------------------------------------------------------------------ */
/*  Chat history loading                                              */
/* ------------------------------------------------------------------ */

/** Track which agent's history has been loaded (null = none) */
let _historyLoadedForAgent = null;

async function loadChatHistory(agentId) {
  const effectiveAgentId = agentId || $agentSwitcher?._activeAgentId || null;
  // Skip if already loaded for this agent (unless switching)
  if (_historyLoadedForAgent === effectiveAgentId) return;
  const token = localStorage.getItem('scratchy_token') || '';
  if (!token) return;

  try {
    const params = new URLSearchParams({ limit: '50' });
    if (effectiveAgentId) params.set('agentId', effectiveAgentId);
    const res = await fetch(`/api/chat/history?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return;

    const { messages } = await res.json();
    if (messages && messages.length > 0 && $messages) {
      // Clear any placeholder content
      $messages.innerHTML = '';

      for (const msg of messages) {
        let content = msg.content;

        // Strip tool call XML + GenUI code blocks (same as chat-stream-end)
        content = content.replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/g, '');
        content = content.replace(/<tool_result[^>]*>[\s\S]*?<\/tool_result>/g, '');
        content = content.replace(/<tool_use[^>]*>[\s\S]*?<\/tool_use>/g, '');
        content = content.replace(/<tool_(?:call|result|use)[^>]*>[\s\S]*$/g, '');
        content = content.replace(/```scratchy-(canvas|toon|tpl)\s*\n[\s\S]*?```/g, '');
        content = content.replace(/```scratchy-(canvas|toon|tpl)[\s\S]*$/g, '');
        content = content.replace(/(?:^|\n)\s*scratchy-canvas\s*\n(?:\s*\{[^\n]+\}\s*\n?)+/gi, '');
        content = content.replace(/\n{3,}/g, '\n\n').trim();

        // Skip empty messages (all GenUI ops with no text)
        if (!content) continue;

        const div = document.createElement('div');
        div.className = `msg msg-${msg.role}`;
        div.innerHTML = formatMarkdown(content);
        $messages.appendChild(div);
      }

      // Scroll to bottom
      $messages.scrollTop = $messages.scrollHeight;
    }

    _historyLoadedForAgent = effectiveAgentId;
  } catch (err) {
    console.warn('[app] Failed to load chat history:', err);
  }
}

/* ------------------------------------------------------------------ */
/*  WS event handlers                                                 */
/* ------------------------------------------------------------------ */

function wireWsEvents() {
  on('connected', () => {
    setConnectionStatus('connected');
    // Load chat history from server on (re)connect
    loadChatHistory();
  });

  on('disconnected', () => {
    state.reconnectAttempts++;
    if (state.reconnectAttempts >= 5) {
      setConnectionStatus('failed');
    } else {
      setConnectionStatus('reconnecting');
    }
  });

  on('chat', (msg) => {
    // msg: { type:'chat', text, html?, from? }
    const content = msg.html || escapeHtml(msg.text || '');
    appendMessage(msg.from || 'assistant', content);
  });

  // Streaming: create a message bubble on first chunk, append deltas
  let _streamDiv = null;
  on('chat-stream', (msg) => {
    if (!$messages) return;
    // Remove typing dots once real content arrives
    const typingEl = $messages.querySelector('.typing-indicator');
    if (typingEl) typingEl.remove();
    if (!_streamDiv) {
      _streamDiv = document.createElement('div');
      _streamDiv.className = 'msg msg-assistant streaming';
      _streamDiv.textContent = '';
      $messages.appendChild(_streamDiv);
    }
    _streamDiv.textContent += msg.delta;
    $messages.scrollTop = $messages.scrollHeight;
  });

  on('chat-stream-end', () => {
    if (_streamDiv) {
      _streamDiv.classList.remove('streaming');
      let raw = _streamDiv.textContent;
      // Strip tool call XML blocks (NullClaw tool use)
      raw = raw.replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/g, '');
      raw = raw.replace(/<tool_result[^>]*>[\s\S]*?<\/tool_result>/g, '');
      raw = raw.replace(/<tool_use[^>]*>[\s\S]*?<\/tool_use>/g, '');
      // Strip unclosed tool tags at end of stream
      raw = raw.replace(/<tool_(?:call|result|use)[^>]*>[\s\S]*$/g, '');
      // Fenced GenUI blocks: ```scratchy-canvas ... ```
      raw = raw.replace(/```scratchy-(canvas|toon|tpl)\s*\n[\s\S]*?```/g, '');
      // Unclosed fenced GenUI blocks (no closing ```)
      raw = raw.replace(/```scratchy-(canvas|toon|tpl)[\s\S]*$/g, '');
      // Unfenced blocks: scratchy-canvas\n{"op":...}\n...
      raw = raw.replace(/(?:^|\n)\s*scratchy-canvas\s*\n(?:\s*\{[^\n]+\}\s*\n?)+/gi, '');
      // Collapse leftover whitespace
      raw = raw.replace(/\n{3,}/g, '\n\n').trim();
      // Convert markdown-ish text to basic HTML (bold, code, newlines)
      _streamDiv.innerHTML = formatMarkdown(raw);
      if (!raw) _streamDiv.remove(); // remove empty bubble if all content was GenUI ops
      _streamDiv = null;
    }
  });

  // Show "Rendering UI" placeholder when server signals GenUI is coming
  on('genui-pending', () => {
    if ($messages && !$messages.querySelector('.genui-rendering')) {
      const ph = document.createElement('div');
      ph.className = 'genui-rendering';
      ph.textContent = 'Rendering UI components…';
      $messages.appendChild(ph);
      $messages.scrollTop = $messages.scrollHeight;
      // Safety: auto-remove after 8s if canvas-ops never arrive
      setTimeout(() => ph.remove(), 8000);
    }
  });

  on('typing', (msg) => {
    if ($statusText) {
      if (msg.status === 'start') {
        $statusText.textContent = 'Thinking…';
      } else {
        $statusText.textContent = state.connected ? 'Connected' : 'Disconnected';
      }
    }
    // Show/hide typing indicator dots in chat area
    if ($messages) {
      const existing = $messages.querySelector('.typing-indicator');
      if (msg.status === 'start' && !existing) {
        const el = document.createElement('div');
        el.className = 'typing-indicator';
        el.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
        $messages.appendChild(el);
        $messages.scrollTop = $messages.scrollHeight;
      } else if (msg.status !== 'start' && existing) {
        existing.remove();
      }
    }
  });

  on('canvas-update', (msg) => {
    // Forward to GenUI renderer if available
    emit('canvas-update', msg);
  });

  // --- Canvas ops from agent responses (GenUI + A2UI converted) ---
  // Canvas is a FIRST-CLASS spatial surface — it dominates the workspace when active.
  // Chat becomes a compact input strip at the bottom.
  on('canvas-ops', (msg) => {
    if (!msg.ops || msg.ops.length === 0) return;

    // Remove any "rendering" placeholder
    if ($messages) {
      const placeholder = $messages.querySelector('.genui-rendering');
      if (placeholder) placeholder.remove();
    }

    // Check for webapp ops (open_webapp tool results or agent-generated)
    const webappOps = msg.ops.filter(op => op.type === 'webapp' || op.op === 'webapp');
    const canvasOps = msg.ops.filter(op => op.type !== 'webapp' && op.op !== 'webapp');

    // Open webapp surfaces
    for (const op of webappOps) {
      const data = op.data || op;
      if (data.url) {
        import('./surface-manager.js').then(sm => sm.openWebApp(data.url, data.title));
      }
    }

    // Activate canvas surface for regular ops
    if (canvasOps.length > 0) {
      window.dispatchEvent(new CustomEvent('surface-activate', {
        detail: { type: 'canvas', ops: canvasOps },
      }));
    }
  });

  // --- A2UI community widget loading ---
  on('surface-event', (msg) => {
    if (msg.event === 'a2ui-load' && msg.surface === 'canvas') {
      const canvas = document.querySelector('sc-canvas');
      if (canvas && canvas.loadA2UIWidget) {
        canvas.loadA2UIWidget(msg.data.component, msg.data.metadata);
      }
    }
  });

  on('agent-switched', (msg) => {
    // Update the agent switcher UI when agent changes (e.g. from another device)
    if ($agentSwitcher && msg.agent) {
      $agentSwitcher.activeAgentId = msg.agent.id;
    }
    // Update mobile agent button icon
    const iconEl = document.getElementById('mobile-agent-icon');
    if (iconEl && msg.agent) iconEl.textContent = msg.agent.emoji || '🤖';
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

  // Show admin button + divider for admin users
  if ($adminBtn && state.user?.role === 'admin') {
    $adminBtn.style.display = '';
    const $adminDivider = $adminBtn.nextElementSibling;
    if ($adminDivider && $adminDivider.classList.contains('admin-only')) {
      $adminDivider.style.display = '';
    }
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

  // Initialize surface manager (must run after showApp so DOM is visible)
  import('./surface-manager.js').then(sm => sm.initSurfaceManager());

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
  _historyLoaded = false;
  localStorage.removeItem('scratchy_token');
  disconnect();

  // Reset auth component
  const authEl = document.querySelector('sc-auth');
  if (authEl) authEl.reset();

  showAuth();
}

/* ------------------------------------------------------------------ */
/*  New UI module wiring (v2 redesign)                                */
/* ------------------------------------------------------------------ */

// Shared function: open mobile agent bottom sheet (used by mobile btn + workspace bar agent-click)
function _openMobileAgentSheet() {
  const mobileUx = MobileUXManager.getInstance();
  const switcher = document.querySelector('sc-agent-switcher');
  if (!switcher) return;

  const agents = switcher._agents || [];
  const activeId = switcher._activeAgentId;

  const container = document.createElement('div');
  container.className = 'mobile-agent-grid';

  agents.forEach(agent => {
    const card = document.createElement('button');
    card.className = 'mobile-agent-card' + (agent.id === activeId ? ' active' : '');
    card.innerHTML = `
      <span class="mobile-agent-emoji">${agent.emoji || '🤖'}</span>
      <span class="mobile-agent-name">${agent.name || 'Agent'}</span>
      <span class="mobile-agent-role">${agent.role || ''}</span>
    `;
    card.addEventListener('click', () => {
      switcher._switchAgent(agent);
      sheetHandle.dismiss();
      const iconEl = document.getElementById('mobile-agent-icon');
      if (iconEl) iconEl.textContent = agent.emoji || '🤖';
      const mobileBtn = document.getElementById('mobile-agent-btn');
      if (mobileBtn) {
        mobileBtn.classList.remove('pulse');
        void mobileBtn.offsetWidth;
        mobileBtn.classList.add('pulse');
      }
    });
    container.appendChild(card);
  });

  const createBtn = document.createElement('button');
  createBtn.className = 'mobile-agent-create';
  createBtn.innerHTML = '<span>+</span> Create New Agent';
  createBtn.addEventListener('click', () => {
    sheetHandle.dismiss();
    switcher._openCreator?.();
  });
  container.appendChild(createBtn);

  const sheetHandle = mobileUx.showBottomSheet({
    title: 'AI Team',
    content: container,
  });
}

function wireNewUIModules() {
  const $workspaceBar = document.querySelector('sc-workspace-bar');
  const $commandPalette = document.querySelector('sc-command-palette');

  // --- Activity Monitor → Workspace Bar ---
  // activity-monitor.js auto-inits and dispatches 'activity-change' on document
  document.addEventListener('activity-change', (e) => {
    if ($workspaceBar) $workspaceBar.setActivity(e.detail.state, e.detail.detail);
  });

  // --- Surface Manager → Workspace Bar pills ---
  // surface-manager.js emits these via the ws-client event bus
  on('surface:activated', (data) => {
    if ($workspaceBar) $workspaceBar.setSurfaceActive(data.type, true);
  });
  on('surface:deactivated', (data) => {
    if ($workspaceBar) $workspaceBar.setSurfaceActive(data.type, false);
  });

  // --- Workspace Bar events ---
  // Surface pill toggle — mobile uses exclusive stack, desktop uses grid
  document.addEventListener('surface-toggle', (e) => {
    const type = e.detail?.type;
    if (!type) return;

    const isMobile = window.innerWidth <= 767;
    if (isMobile) {
      // Mobile: exclusive surface display — close current before opening new
      import('./mobile-surface-stack.js').then(({ mobileSurfaceStack }) => {
        import('./surface-manager.js').then(sm => {
          const currentTop = mobileSurfaceStack.current;
          if (currentTop === type) {
            // Same surface — toggle off
            mobileSurfaceStack.pop();
            sm.deactivateSurface(type);
          } else {
            // Different surface — pop current, deactivate it, then push new
            if (currentTop) {
              mobileSurfaceStack.pop();
              sm.deactivateSurface(currentTop);
              if ($workspaceBar) $workspaceBar.setSurfaceActive(currentTop, false);
            }
            sm.activateSurface(type);
            mobileSurfaceStack.push(type);
          }
        });
      });
    } else {
      // Desktop: independent grid toggle
      import('./surface-manager.js').then(sm => sm.toggleSurface(type));
    }
  });

  // Agent click → toggle sidebar on desktop, open bottom sheet on mobile
  document.addEventListener('agent-click', () => {
    const isMobile = window.innerWidth <= 767;
    if (isMobile) {
      // Mobile: open bottom sheet (same as mobile agent btn)
      _openMobileAgentSheet();
    } else {
      // Desktop: toggle sidebar visibility
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('collapsed');
    }
  });

  // Command palette trigger from workspace bar
  document.addEventListener('command-palette', () => {
    if ($commandPalette) $commandPalette.toggle();
  });

  // --- Command Palette execute ---
  document.addEventListener('command-execute', (e) => {
    const { action, id } = e.detail;
    switch (action) {
      case 'switch-agent':
        if ($agentSwitcher) {
          const agents = $agentSwitcher._agents || [];
          const target = agents.find(a => a.id === id);
          if (target) $agentSwitcher._switchAgent(target);
        }
        break;
      case 'toggle-surface':
        import('./surface-manager.js').then(sm => sm.toggleSurface(id));
        break;
      case 'new-chat':
      case 'clear-chat':
        if ($messages) $messages.innerHTML = '';
        break;
      case 'close-all-surfaces':
        import('./surface-manager.js').then(sm => sm.deactivateAll());
        break;
      case 'open-settings': {
        let settings = document.querySelector('sc-settings');
        if (!settings) {
          settings = document.createElement('sc-settings');
          document.body.appendChild(settings);
        }
        settings.setAttribute('open', '');
        break;
      }
      case 'open-webapp': {
        const url = prompt('Enter web app URL:');
        if (url) {
          import('./surface-manager.js').then(sm => sm.openWebApp(url));
        }
        break;
      }
    }
  });

  // --- Surface close events from title bars ---
  document.addEventListener('surface-close', (e) => {
    const type = e.detail?.type;
    if (type) {
      import('./surface-manager.js').then(sm => sm.deactivateSurface(type));
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */

async function init() {
  resolveDOM();
  wireWsEvents();
  wireNewUIModules();

  // Listen for auth events from <sc-auth>
  document.addEventListener('auth-login', async (e) => {
    const { email, password } = e.detail;
    const authEl = document.querySelector('sc-auth');
    if (authEl) authEl.loading = true;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (authEl) { authEl.error = data.error || 'Login failed'; authEl.loading = false; }
        return;
      }
      localStorage.setItem('scratchy_token', data.token);
      state.token = data.token;
      state.user = data.user;
      if (authEl) authEl.loading = false;
      enterApp();
    } catch (err) {
      if (authEl) { authEl.error = 'Connection error — is the server running?'; authEl.loading = false; }
    }
  });

  document.addEventListener('auth-signup', async (e) => {
    const { email, password, name } = e.detail;
    const authEl = document.querySelector('sc-auth');
    if (authEl) authEl.loading = true;

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: email, password, displayName: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (authEl) { authEl.error = data.error || 'Signup failed'; authEl.loading = false; }
        return;
      }
      localStorage.setItem('scratchy_token', data.token);
      state.token = data.token;
      state.user = data.user;
      if (authEl) authEl.loading = false;
      enterApp();
    } catch (err) {
      if (authEl) { authEl.error = 'Connection error — is the server running?'; authEl.loading = false; }
    }
  });

  document.addEventListener('auth-social', async (e) => {
    const { provider } = e.detail;
    // Check if OAuth is configured before redirecting
    try {
      const res = await fetch(`/api/auth/oauth/${provider}`);
      if (!res.ok || res.headers.get('content-type')?.includes('json')) {
        const data = await res.json().catch(() => ({}));
        if (data.error) {
          const authEl = document.querySelector('sc-auth');
          if (authEl) authEl.setAttribute('error', `${provider} login not yet configured`);
          return;
        }
      }
      // If it returned a redirect (302), the browser would have followed it
      // For manual redirect URLs in response body:
      window.location.href = `/api/auth/oauth/${provider}`;
    } catch {
      window.location.href = `/api/auth/oauth/${provider}`;
    }
  });

  // Listen for auth-success (generic, from token-based flows)
  document.addEventListener('auth-success', onAuthSuccess);

  // Back from auth to landing
  document.addEventListener('auth-back', () => showLanding());

  // Listen for landing page actions
  document.addEventListener('landing-action', (e) => {
    const { action, planId } = e.detail || {};
    if (action === 'get-started' || action === 'select-plan') {
      showAuth();
    } else if (action === 'sign-in') {
      showAuth();
    }
  });

  // Listen for plan selection
  document.addEventListener('plan-select', (e) => {
    // Store selected plan, proceed to app
    const { planId } = e.detail || {};
    if (planId) localStorage.setItem('scratchy_plan', planId);
    showApp();
    setConnectionStatus('reconnecting');
    connect(state.token);
  });

  // Listen for setup wizard completion
  document.addEventListener('wizard-complete', () => {
    showApp();
    setConnectionStatus('reconnecting');
    connect(state.token);
  });

  document.addEventListener('wizard-skip', () => {
    showApp();
    setConnectionStatus('reconnecting');
    connect(state.token);
  });

  // Listen for agent switch from the switcher component
  document.addEventListener('agent-switch', (e) => {
    const { agentId } = e.detail;
    if (agentId) {
      send('agent-switch', { agentId });

      // Clear chat and load per-agent conversation history
      if ($messages) $messages.innerHTML = '';
      _historyLoadedForAgent = null; // force reload
      loadChatHistory(agentId);
    }
  });

  // Mobile agent picker button
  if ($mobileAgentBtn) {
    $mobileAgentBtn.addEventListener('click', () => _openMobileAgentSheet());
  }

  // Logout button
  // User menu toggle
  if ($userMenuBtn && $userMenu) {
    $userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      $userMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => $userMenu.classList.add('hidden'));
  }
  // Settings
  if ($settingsBtn) {
    $settingsBtn.addEventListener('click', () => {
      $userMenu.classList.add('hidden');
      let settings = document.querySelector('sc-settings');
      if (!settings) {
        settings = document.createElement('sc-settings');
        document.body.appendChild(settings);
      }
      settings.setAttribute('open', '');
    });
  }
  // Admin button
  if ($adminBtn) {
    $adminBtn.addEventListener('click', () => {
      $userMenu.classList.add('hidden');
      let admin = document.querySelector('sc-admin');
      if (!admin) {
        admin = document.createElement('sc-admin');
        document.body.appendChild(admin);
      }
      admin.setAttribute('open', '');
    });
  }
  // Admin close event
  document.addEventListener('admin-close', () => {
    const a = document.querySelector('sc-admin');
    if (a) a.removeAttribute('open');
  });

  // Settings events
  document.addEventListener('settings-close', () => {
    const s = document.querySelector('sc-settings');
    if (s) s.removeAttribute('open');
  });
  document.addEventListener('settings-logout', logout);
  if ($logoutBtn) {
    $logoutBtn.addEventListener('click', () => { $userMenu.classList.add('hidden'); logout(); });
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
    showLanding();
  }
}

// Boot on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
