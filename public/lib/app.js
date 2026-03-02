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
let $teamBanner, $teamBannerName, $teamBannerAgents, $teamExitBtn;
let _skipMenuClose = false;
let _activeTeamId = sessionStorage.getItem('scratchy_teamId') || null;
let _activeTeamName = sessionStorage.getItem('scratchy_teamName') || null;

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
  $teamBanner = document.getElementById('team-banner');
  $teamBannerName = document.getElementById('team-banner-name');
  $teamBannerAgents = document.getElementById('team-banner-agents');
  $teamExitBtn = document.getElementById('team-exit-btn');
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
  // Initialize dashboard with user info
  const dashboard = document.getElementById('dashboard');
  if (dashboard) {
    if (state.user?.displayName) dashboard.userName = state.user.displayName;
    dashboard.refresh?.();
  }
  if ($workspaceBar && state.user?.displayName) $workspaceBar.setUser(state.user.displayName);

  // Restore team mode from sessionStorage
  if (_activeTeamId) {
    const agentCount = sessionStorage.getItem('scratchy_teamAgents') || '?';
    if ($teamBanner) $teamBanner.classList.remove('hidden');
    if ($teamBannerName) $teamBannerName.textContent = _activeTeamName || 'Team';
    if ($teamBannerAgents) $teamBannerAgents.textContent = agentCount + ' agents';
    if ($msgInput) $msgInput.placeholder = 'Message ' + (_activeTeamName || 'Team') + '...';
    // Force team history load (not single-agent)
    _historyLoadedForAgent = null;
  }

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

  if ($workspaceBar) $workspaceBar.setConnectionStatus(status);
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

/** Open a widget panel (notes, calendar, email) — creates on first use */
function _openWidget(tagName, name) {
  let el = document.querySelector(tagName);
  if (!el) {
    el = document.createElement(tagName);
    document.body.appendChild(el);
  }
  el.setAttribute('open', '');
  // Listen for close event
  el.addEventListener(`${name}-close`, () => el.removeAttribute('open'), { once: true });
}

/* ------------------------------------------------------------------ */
/*  Send logic                                                        */
/* ------------------------------------------------------------------ */

let _sendGuard = false;
function sendMessage() {
  const text = $msgInput.value.trim();
  if (!text || _sendGuard) return;

  // Debounce: block re-sends for 500ms (prevents double-click/tap)
  _sendGuard = true;
  setTimeout(() => { _sendGuard = false; }, 500);

  // Remove empty state if present
  removeEmptyState();

  // Show user bubble immediately
  appendMessage('user', escapeHtml(text));

  // Send with active agent ID for per-agent conversation isolation
  const activeAgentId = $agentSwitcher?._activeAgentId || null;
  const teamId = _activeTeamId || sessionStorage.getItem('scratchy_teamId') || undefined;
  if (teamId) console.log('[app] Sending team message:', teamId);
  sendChat(text, activeAgentId, teamId);
  $msgInput.value = '';
  autoResize($msgInput);
  $msgInput.focus();
}

/**
 * Upload a file to the server and send it as a chat message with the image/file.
 * @param {File} file
 */
async function uploadFile(file) {
  const token = localStorage.getItem('scratchy_token') || '';
  if (!token) return;

  // Show a preview bubble for images
  const isImage = file.type.startsWith('image/');
  if (isImage) {
    const reader = new FileReader();
    reader.onload = () => {
      appendMessage('user', `<img src="${reader.result}" alt="${escapeHtml(file.name)}" style="max-width:300px;max-height:200px;border-radius:8px">`);
    };
    reader.readAsDataURL(file);
  } else {
    appendMessage('user', `📎 ${escapeHtml(file.name)} (${(file.size / 1024).toFixed(1)} KB)`);
  }

  try {
    const form = new FormData();
    form.append('file', file);

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      appendMessage('system', `❌ Upload failed: ${err.error}`);
      return;
    }

    const { file: uploaded } = await res.json();

    // Send a chat message referencing the uploaded file
    const activeAgentId = $agentSwitcher?._activeAgentId || null;
    const msg = isImage
      ? `[Uploaded image: ${uploaded.filename}](${uploaded.url})`
      : `[Uploaded file: ${uploaded.filename}](${uploaded.url}) (${uploaded.mimeType}, ${(uploaded.size / 1024).toFixed(1)} KB)`;
    sendChat(msg, activeAgentId);
  } catch (err) {
    appendMessage('system', `❌ Upload error: ${err.message}`);
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Create an empty state element for the chat messages area.
 * @param {string} agentName - Name of the active agent
 * @param {string} agentType - Type/role of the agent (e.g. 'code', 'designer')
 * @returns {HTMLElement} The empty state container element
 */
function renderEmptyState(agentName, agentType = 'default') {
    const suggestionsMap = {
        code: ["Review my code", "Explain this error", "Write a function"],
        designer: ["Design a landing page", "Suggest colors", "Review my UI"],
        researcher: ["Summarize this article", "Compare X vs Y", "Find papers on..."],
        writer: ["Draft an email", "Improve this text", "Write docs"],
        default: ["Review my code", "Explain this error", "Write a function"],
    };

    const agent = $agentSwitcher?._agents?.find(a => a.name === agentName);
    const agentEmoji = agent?.emoji || '✨';
    const effectiveType = agent?.role?.toLowerCase() || agentType;
    const suggestions = suggestionsMap[effectiveType] || suggestionsMap.default;

    const container = document.createElement('div');
    container.id = 'empty-state';
    container.style.cssText = `
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        flex-grow: 1; height: 100%; text-align: center; color: #f0ead6;
        font-family: 'Geist', sans-serif;
    `;

    const emojiDiv = document.createElement('div');
    emojiDiv.textContent = agentEmoji;
    emojiDiv.style.cssText = `font-size: 48px; opacity: 0.3; margin-bottom: 16px;`;

    const textP = document.createElement('p');
    textP.textContent = `Ask ${agentName} anything`;
    textP.style.cssText = `color: #8a7e6a; font-size: 1.1em; margin: 0 0 24px;`;

    const chipsContainer = document.createElement('div');
    chipsContainer.style.cssText = `display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;`;

    suggestions.forEach(text => {
        const chip = document.createElement('button');
        chip.textContent = text;
        chip.style.cssText = `
            background: #1a1610; border: 1px solid rgba(240, 234, 214, 0.1);
            color: #f0ead6; padding: 8px 16px; border-radius: 8px;
            cursor: pointer; transition: all 0.2s ease; font-family: 'Geist', sans-serif;
            font-size: 14px;
        `;
        chip.onmouseenter = () => { chip.style.borderColor = '#F9A602'; chip.style.color = '#F9A602'; };
        chip.onmouseleave = () => { chip.style.borderColor = 'rgba(240, 234, 214, 0.1)'; chip.style.color = '#f0ead6'; };
        chip.onclick = () => {
            if ($msgInput) {
                $msgInput.value = text;
                $msgInput.focus();
                autoResize($msgInput);
            }
            sendMessage();
        };
        chipsContainer.appendChild(chip);
    });

    container.appendChild(emojiDiv);
    container.appendChild(textP);
    container.appendChild(chipsContainer);
    return container;
}


/**
 * Remove empty state from messages container
 */
function removeEmptyState() {
  const emptyState = $messages?.querySelector('#empty-state');
  if (emptyState) {
    emptyState.remove();
  }
}

/**
 * Show empty state in messages container if no messages present
 */
function showEmptyStateIfNeeded() {
  if (!$messages) return;
  
  // Defer to ensure DOM is updated after potential innerHTML clear
  setTimeout(() => {
    const hasMessages = $messages.querySelector('.msg-user, .msg-assistant');
    if (!hasMessages) {
      removeEmptyState(); // Clear any existing one first
      const activeAgent = $agentSwitcher?._agents?.find(a => a.id === $agentSwitcher?._activeAgentId);
      const agentName = activeAgent?.name || 'Atlas';
      const agentType = activeAgent?.role?.toLowerCase() || 'default';
      const emptyStateEl = renderEmptyState(agentName, agentType);
      $messages.appendChild(emptyStateEl);
    }
  }, 0);
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
  // Images: [IMAGE:path] → inline <img>
  html = html.replace(/\[IMAGE:([^\]]+)\]/g, (_, path) => {
    const safePath = path.trim();
    return '<img src="/api/workspace-file?path=' + encodeURIComponent(safePath) + '" alt="Agent image" style="max-width:100%;max-height:400px;border-radius:8px;margin:8px 0" loading="lazy">';
  });
  // Markdown images: ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;max-height:400px;border-radius:8px;margin:8px 0" loading="lazy">');
  // Markdown links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
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
  // In team mode, load team conversation history
  const effectiveAgentId = _activeTeamId
    ? 'team:' + _activeTeamId
    : (agentId || $agentSwitcher?._activeAgentId || null);
  // Skip if already loaded for this agent/team (unless switching)
  if (_historyLoadedForAgent === effectiveAgentId) return;
  const token = localStorage.getItem('scratchy_token') || '';
  if (!token) return;

  try {
    const params = new URLSearchParams({ limit: '50' });
    if (effectiveAgentId) params.set('agentId', effectiveAgentId);
    const res = await fetch(`/api/chat/history?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
        showEmptyStateIfNeeded();
        return;
    }

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
    
    // Show empty state if no messages were loaded
    showEmptyStateIfNeeded();
  } catch (err) {
    console.warn('[app] Failed to load chat history:', err);
    // Show empty state on error too
    showEmptyStateIfNeeded();
  }
}

/* ------------------------------------------------------------------ */
/*  Team UI utilities                                                 */
/* ------------------------------------------------------------------ */

function getAgentColor(name) {
  const colors = ['#f59e0b','#3b82f6','#8b5cf6','#ec4899','#10b981','#f43f5e','#06b6d4','#84cc16'];
  let h = 0;
  for (let i = 0; i < (name||'').length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

function injectTeamUIStyles() {
  const existingStyle = document.head.querySelector('#team-ui-styles');
  if (existingStyle) return; // Already injected

  const style = document.createElement('style');
  style.id = 'team-ui-styles';
  style.textContent = `
    /* Team UI Components */
    .team-status-msg {
      background: rgba(249,166,2,0.06);
      border: 1px solid rgba(249,166,2,0.15);
      border-radius: 12px;
      padding: 12px 16px;
      margin: 8px 0;
      font-family: inherit;
      color: #f0ead6;
      font-size: 14px;
    }
    
    .team-plan-card {
      background: rgba(249,166,2,0.06);
      border: 1px solid rgba(249,166,2,0.15);
      border-radius: 12px;
      padding: 16px;
      margin: 8px 0;
      font-family: inherit;
    }
    
    .team-plan-header {
      color: #f0ead6;
      font-weight: 600;
      margin-bottom: 12px;
      font-size: 15px;
    }
    
    .team-plan-task {
      display: flex;
      align-items: center;
      margin: 8px 0;
      color: #f0ead6;
      font-size: 14px;
    }
    
    .team-plan-agent-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      flex-shrink: 0;
    }
    
    .team-plan-summary {
      margin-top: 12px;
      color: #8a7e6a;
      font-size: 13px;
    }
    
    .team-worker-card {
      background: rgba(249,166,2,0.06);
      border: 1px solid rgba(249,166,2,0.15);
      border-radius: 12px;
      padding: 14px;
      margin: 6px 0;
      font-family: inherit;
    }
    
    .team-worker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .team-worker-info {
      display: flex;
      align-items: center;
      color: #f0ead6;
      font-size: 14px;
    }
    
    .team-worker-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 8px;
      flex-shrink: 0;
    }
    
    .team-worker-status {
      font-size: 12px;
      font-weight: 600;
    }
    
    .team-worker-status.working {
      color: #f59e0b;
    }
    
    .team-worker-status.complete {
      color: #22c55e;
    }
    
    .team-worker-status.error {
      color: #ef4444;
    }
    
    .team-worker-task {
      color: #8a7e6a;
      font-size: 13px;
      margin-top: 4px;
    }
    
    .team-worker-spinner {
      width: 12px;
      height: 12px;
      border: 2px solid rgba(249,166,2,0.2);
      border-top: 2px solid #f59e0b;
      border-radius: 50%;
      animation: team-spin 1s linear infinite;
    }
    
    .team-worker-details {
      margin-top: 8px;
      border-top: 1px solid rgba(249,166,2,0.1);
      padding-top: 8px;
    }
    
    .team-worker-toggle {
      background: none;
      border: none;
      color: #8a7e6a;
      font-size: 12px;
      cursor: pointer;
      padding: 4px 0;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .team-worker-toggle:hover {
      color: #f0ead6;
    }
    
    .team-worker-output {
      background: rgba(0,0,0,0.2);
      border-radius: 6px;
      padding: 8px;
      margin-top: 6px;
      color: #f0ead6;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
      max-height: 200px;
      overflow-y: auto;
    }
    
    @keyframes team-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
/*  WS event handlers                                                 */
/* ------------------------------------------------------------------ */

function wireWsEvents() {
  // Inject CSS styles for team UI components
  injectTeamUIStyles();

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
    removeEmptyState();
    const content = msg.html || escapeHtml(msg.text || '');
    appendMessage(msg.from || 'assistant', content);
  });

  // Streaming: create a message bubble on first chunk, append deltas
  let _streamDiv = null;
  on('chat-stream', (msg) => {
    if (!$messages) return;
    // Remove empty state and typing dots once real content arrives
    removeEmptyState();
    $messages.querySelectorAll('.typing-indicator').forEach(el => el.remove());
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

  // Helper: remove ALL typing indicators from chat area
  function clearAllTypingIndicators() {
    if (!$messages) return;
    $messages.querySelectorAll('.typing-indicator').forEach(el => el.remove());
  }

  let _typingSafetyTimer = null;
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
      if (msg.status === 'start') {
        // Always deduplicate — remove any existing before adding
        clearAllTypingIndicators();
        const el = document.createElement('div');
        el.className = 'typing-indicator';
        el.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
        $messages.appendChild(el);
        $messages.scrollTop = $messages.scrollHeight;
        // Safety: auto-remove after 120s (prevents infinite stuck dots)
        clearTimeout(_typingSafetyTimer);
        _typingSafetyTimer = setTimeout(clearAllTypingIndicators, 120000);
      } else {
        clearAllTypingIndicators();
        clearTimeout(_typingSafetyTimer);
      }
    }
  });

  // Clean up typing indicators when team routing completes or errors
  on('team-message-end', () => {
    clearAllTypingIndicators();
    clearTimeout(_typingSafetyTimer);
    if ($statusText) $statusText.textContent = state.connected ? 'Connected' : 'Disconnected';
    // Reset worker card states on completion
    if ($messages) {
      const workerCards = $messages.querySelectorAll('.team-worker-card');
      workerCards.forEach(card => {
        const spinner = card.querySelector('.team-worker-spinner');
        if (spinner) spinner.remove();
      });
    }
  });
  on('team-error', (msg) => {
    clearAllTypingIndicators();
    clearTimeout(_typingSafetyTimer);
    if ($statusText) $statusText.textContent = state.connected ? 'Connected' : 'Disconnected';
    // Show error message in chat
    if (msg.error && $messages) {
      appendMessage('system', `<span class="msg-error">Team error: ${escapeHtml(msg.error)}</span>`);
    }
  });

  // --- New Team Event Handlers ---

  // 1. Team routing begins
  on('team-message-start', (msg) => {
    if (!$messages) return;
    removeEmptyState();
    const { teamName, agents } = msg;
    const agentCount = agents ? agents.length : '?';
    appendMessage('system', `<div class="team-status-msg">🤝 Orchestrating with ${escapeHtml(teamName)} (${agentCount} agents)...</div>`);
  });

  // 2. Planning phase updates
  on('team-planning', (msg) => {
    if (!$messages) return;
    const { status } = msg;

    if (status === 'start') {
      appendMessage('system', '<div class="team-status-msg">🧠 Planning tasks...</div>');
    } else if (status === 'accepted' && msg.tasks) {
      // Show plan card with tasks
      const { tasks, parallelCount, taskCount } = msg;
      let planHTML = '<div class="team-plan-card">';
      planHTML += '<div class="team-plan-header">📋 Plan</div>';
      
      tasks.forEach(task => {
        const agentColor = getAgentColor(task.agent);
        planHTML += `<div class="team-plan-task">
          <div class="team-plan-agent-dot" style="background-color: ${agentColor}"></div>
          <strong>${escapeHtml(task.agent)}</strong>: ${escapeHtml(task.task)}
        </div>`;
      });
      
      planHTML += `<div class="team-plan-summary">${taskCount} task${taskCount === 1 ? '' : 's'} (${parallelCount} parallel${parallelCount !== taskCount ? ', ' + (taskCount - parallelCount) + ' sequential' : ''})</div>`;
      planHTML += '</div>';
      
      appendMessage('system', planHTML);
    } else if (status === 'simple') {
      appendMessage('system', '<div class="team-status-msg">⚡ Handling directly...</div>');
    } else if (status === 'fallback') {
      // Hide plan, continue silently
      return;
    } else if (status === 'error' && msg.error) {
      appendMessage('system', `<span class="msg-error">Planning error: ${escapeHtml(msg.error)}</span>`);
    }
  });

  // 3. Batch of workers starting
  on('team-delegations-start', (msg) => {
    if (!$messages) return;
    const { count } = msg;
    appendMessage('system', `<div class="team-status-msg">🚀 Dispatching ${count} worker${count === 1 ? '' : 's'}...</div>`);
  });

  // 4. Individual worker lifecycle
  on('team-delegation', (msg) => {
    if (!$messages) return;
    const { status, toAgentName } = msg;

    if (status === 'start') {
      const { task } = msg;
      const agentColor = getAgentColor(toAgentName);
      
      const workerHTML = `<div class="team-worker-card" data-agent="${escapeHtml(toAgentName)}">
        <div class="team-worker-header">
          <div class="team-worker-info">
            <div class="team-worker-dot" style="background-color: ${agentColor}"></div>
            <div>
              <div class="team-worker-status working">${escapeHtml(toAgentName)} — <span class="worker-task-text">${escapeHtml(task)}</span></div>
            </div>
          </div>
          <div class="team-worker-spinner"></div>
        </div>
        <div class="team-worker-details" style="display: none;">
          <button class="team-worker-toggle">
            <span>▸</span> Show output
          </button>
          <div class="team-worker-output" style="display: none;"></div>
        </div>
      </div>`;
      
      appendMessage('system', workerHTML);
      
      // Add toggle functionality
      const workerCard = $messages.querySelector(`[data-agent="${toAgentName}"]`);
      if (workerCard) {
        const toggle = workerCard.querySelector('.team-worker-toggle');
        const output = workerCard.querySelector('.team-worker-output');
        if (toggle && output) {
          toggle.addEventListener('click', () => {
            const isOpen = output.style.display !== 'none';
            output.style.display = isOpen ? 'none' : 'block';
            toggle.querySelector('span').textContent = isOpen ? '▸' : '▾';
            toggle.innerHTML = toggle.innerHTML.replace(/Show output|Hide output/, isOpen ? 'Show output' : 'Hide output');
          });
        }
      }
    } else if (status === 'complete') {
      // Mark worker as done
      const workerCard = $messages.querySelector(`[data-agent="${toAgentName}"]`);
      if (workerCard) {
        const statusEl = workerCard.querySelector('.team-worker-status');
        const spinner = workerCard.querySelector('.team-worker-spinner');
        if (statusEl) {
          statusEl.className = 'team-worker-status complete';
          statusEl.innerHTML = statusEl.innerHTML.replace(/ — /, ' ✓ — ');
        }
        if (spinner) spinner.remove();
        
        // Show details section if there's output
        const details = workerCard.querySelector('.team-worker-details');
        const output = workerCard.querySelector('.team-worker-output');
        if (details && output && output.textContent.trim()) {
          details.style.display = 'block';
        }
      }
    } else if (status === 'error') {
      // Mark worker as failed
      const workerCard = $messages.querySelector(`[data-agent="${toAgentName}"]`);
      if (workerCard) {
        const statusEl = workerCard.querySelector('.team-worker-status');
        const spinner = workerCard.querySelector('.team-worker-spinner');
        if (statusEl) {
          statusEl.className = 'team-worker-status error';
          statusEl.innerHTML = statusEl.innerHTML.replace(/ — /, ' ✗ — ');
        }
        if (spinner) spinner.remove();
        
        // Show error in output
        const output = workerCard.querySelector('.team-worker-output');
        const details = workerCard.querySelector('.team-worker-details');
        if (output && msg.error) {
          output.textContent = `Error: ${msg.error}`;
          if (details) details.style.display = 'block';
        }
      }
    }
  });

  // 5. Worker output streaming
  on('team-worker-stream', (msg) => {
    if (!$messages) return;
    const { delta, agentName } = msg;
    if (!delta || !agentName) return;
    
    const workerCard = $messages.querySelector(`[data-agent="${agentName}"]`);
    if (workerCard) {
      const output = workerCard.querySelector('.team-worker-output');
      if (output) {
        output.textContent += delta;
        // Auto-scroll output area if at bottom
        if (output.scrollTop >= output.scrollHeight - output.clientHeight - 10) {
          output.scrollTop = output.scrollHeight;
        }
      }
    }
    
    // Auto-scroll main chat
    $messages.scrollTop = $messages.scrollHeight;
  });

  // 6. Batch complete
  on('team-delegations-end', (msg) => {
    if (!$messages) return;
    const { count, errors } = msg;
    const errorCount = errors && Array.isArray(errors) ? errors.length : 0;
    
    let statusText = `✅ ${count} worker${count === 1 ? '' : 's'} done`;
    if (errorCount > 0) {
      statusText += ` (${errorCount} error${errorCount === 1 ? '' : 's'})`;
    }
    
    appendMessage('system', `<div class="team-status-msg">${statusText}</div>`);
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

    // Restored canvas state: load ops into canvas. Surface activation is handled
    // separately by surface-manager's _restoreActiveSurfaces() on reconnect.
    if (msg.restored) {
      const canvas = document.querySelector('sc-canvas');
      if (canvas && canvas.applyOps) {
        canvas.applyOps(msg.ops);
      }
      console.log('[canvas] Restored', msg.ops.length, 'ops from server');
      return;
    }

    // Remove any "rendering" placeholder
    if ($messages) {
      const placeholder = $messages.querySelector('.genui-rendering');
      if (placeholder) placeholder.remove();
    }

    // Handle trigger ops (open widgets, navigate, etc.)
    const triggerOps = msg.ops.filter(op => op.op === 'trigger');
    for (const op of triggerOps) {
      const action = op.action || op.data?.action || '';
      if (action === 'open-notes' || action === 'sn-list') _openWidget('sc-notes', 'notes');
      else if (action === 'open-calendar' || action === 'cal-month') _openWidget('sc-calendar', 'calendar');
      else if (action === 'open-email' || action === 'mail-inbox') _openWidget('sc-email', 'email');
    }

    // Check for webapp ops (open_webapp tool results or agent-generated)
    const webappOps = msg.ops.filter(op => op.type === 'webapp' || op.op === 'webapp');
    const canvasOps = msg.ops.filter(op => op.type !== 'webapp' && op.op !== 'webapp' && op.op !== 'trigger');

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
  if ($workspaceBar) $workspaceBar.setUser(state.user?.displayName || state.user?.email || 'User');

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
  _historyLoadedForAgent = null;
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
  // Plan selection → Stripe checkout
  document.addEventListener('plan-selected', async (e) => {
    const { planId } = e.detail || {};
    if (!planId || planId === 'free') return; // free doesn't need checkout
    if (planId === 'byok') {
      // Open settings to BYOK section
      let settings = document.querySelector('sc-settings');
      if (!settings) { settings = document.createElement('sc-settings'); document.body.appendChild(settings); }
      settings.setAttribute('open', '');
      return;
    }
    // Paid plans → Stripe checkout
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ plan: planId }),
      });
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url; // redirect to Stripe
      } else {
        console.error('[billing] No checkout URL:', data);
        alert(data.error || 'Failed to create checkout session');
      }
    } catch (err) {
      console.error('[billing] Checkout error:', err);
      alert('Failed to connect to billing service');
    }
  });

  // Dashboard events
  document.addEventListener('dashboard-open-widget', (e) => {
    const widget = e.detail?.widget;
    const tagMap = { notes: 'sc-notes', calendar: 'sc-calendar', email: 'sc-email' };
    const tag = tagMap[widget];
    if (tag && widget) _openWidget(tag, widget);
  });
  document.addEventListener('dashboard-suggestion', (e) => {
    const text = e.detail?.text;
    if (text && $msgInput) {
      $msgInput.value = text;
      $msgInput.focus();
      autoResize($msgInput);
    }
  });

  // Widget open events from workspace bar
  document.addEventListener('widget-open', (e) => {
    const { widget, tag } = e.detail || {};
    if (tag && widget) _openWidget(tag, widget);
  });

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

  // User menu click from workspace bar → toggle the existing user menu
  // _skipMenuClose prevents the document-level click handler
  // from immediately re-hiding the menu (click bubbles from shadow DOM).
  document.addEventListener('user-menu-click', () => {
    if ($userMenu) {
      _skipMenuClose = true;
      const isOpen = !$userMenu.classList.contains('hidden');
      $userMenu.classList.toggle('hidden');
      if ($userMenuBtn) $userMenuBtn.setAttribute('aria-expanded', String(!isOpen));
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
        showEmptyStateIfNeeded();
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
      case 'open-notes': {
        _openWidget('sc-notes', 'notes');
        break;
      }
      case 'open-calendar': {
        _openWidget('sc-calendar', 'calendar');
        break;
      }
      case 'open-email': {
        _openWidget('sc-email', 'email');
        break;
      }
      case 'open-billing': {
        let billing = document.querySelector('sc-billing');
        if (!billing) {
          billing = document.createElement('sc-billing');
          document.body.appendChild(billing);
        }
        billing.setAttribute('open', '');
        break;
      }
      case 'open-widget-store': {
        let widgetStore = document.querySelector('sc-widget-store');
        if (!widgetStore) {
          widgetStore = document.createElement('sc-widget-store');
          document.body.appendChild(widgetStore);
        }
        widgetStore.setAttribute('open', '');
        break;
      }
      case 'open-teams': {
        let teams = document.querySelector('sc-teams');
        if (!teams) {
          teams = document.createElement('sc-teams');
          document.body.appendChild(teams);
        }
        teams.setAttribute('open', '');
        break;
      }
      case 'open-workspaces': {
        let workspaces = document.querySelector('sc-workspaces');
        if (!workspaces) {
          workspaces = document.createElement('sc-workspaces');
          document.body.appendChild(workspaces);
        }
        const token = localStorage.getItem('scratchyToken') || '';
        workspaces.setAttribute('token', token);
        workspaces.setAttribute('open', '');
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

  // Handle Stripe return URL params
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('upgraded')) {
    const plan = urlParams.get('upgraded');
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    // Show success toast after app loads
    setTimeout(() => {
      const msg = document.createElement('div');
      msg.textContent = `🎉 Welcome to Scratchy ${plan === 'pro' ? 'Pro' : 'Max'}! Your plan is now active.`;
      msg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#1a1610;border:1px solid rgba(249,166,2,0.3);color:#f0ead6;padding:12px 24px;border-radius:8px;z-index:9999;font-family:Geist,sans-serif;font-size:14px;animation:fadeIn 0.3s ease';
      document.body.appendChild(msg);
      setTimeout(() => msg.remove(), 5000);
    }, 1000);
  }
  if (urlParams.has('cancelled')) {
    window.history.replaceState({}, '', window.location.pathname);
  }

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

  // Agent creation wizard
  document.addEventListener('agent-create', () => {
    let wizard = document.querySelector('sc-agent-wizard');
    if (!wizard) {
      wizard = document.createElement('sc-agent-wizard');
      document.body.appendChild(wizard);
    }
    wizard.setAttribute('open', '');
  });

  document.addEventListener('wizard-complete', (e) => {
    if (e.detail?.agent) {
      // POST to create agent API
      const token = localStorage.getItem('scratchy_token') || '';
      fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(e.detail.agent),
      }).then(res => res.json()).then(data => {
        if (data.id && $agentSwitcher) {
          $agentSwitcher.loadAgents?.();
        }
      }).catch(err => console.warn('[app] Failed to create agent:', err));
    }
  });

  // Listen for agent switch from the switcher component
  document.addEventListener('agent-switch', (e) => {
    const { agentId } = e.detail;
    if (agentId) {
      send('agent-switch', { agentId });

      // Clear chat and load per-agent conversation history
      if ($messages) $messages.innerHTML = '';
      _historyLoadedForAgent = null; // force reload
      
      // Show empty state for new agent immediately, then load history over it
      showEmptyStateIfNeeded();
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
    document.addEventListener('click', (e) => {
      if (_skipMenuClose) { _skipMenuClose = false; return; }
      // Don't close if click is inside the menu itself
      if ($userMenu.contains(e.target)) return;
      $userMenu.classList.add('hidden');
    });
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

  // Billing panel events
  document.addEventListener('billing-close', () => {
    const b = document.querySelector('sc-billing');
    if (b) b.removeAttribute('open');
  });

  // Widget Store panel events
  document.addEventListener('widget-store-close', () => {
    const ws = document.querySelector('sc-widget-store');
    if (ws) ws.removeAttribute('open');
  });

  // Teams panel events
  document.addEventListener('teams-close', () => {
    const t = document.querySelector('sc-teams');
    if (t) t.removeAttribute('open');
  });
  document.addEventListener('team-chat', (e) => {
    const { teamId, teamName, agentCount } = e.detail || {};
    if (!teamId) return;
    // Close teams panel
    const t = document.querySelector('sc-teams');
    if (t) t.removeAttribute('open');
    // Activate team mode
    _activeTeamId = teamId;
    _activeTeamName = teamName || 'Team';
    sessionStorage.setItem('scratchy_teamId', _activeTeamId);
    sessionStorage.setItem('scratchy_teamName', _activeTeamName);
    if (agentCount) sessionStorage.setItem('scratchy_teamAgents', String(agentCount));
    if ($teamBanner) $teamBanner.classList.remove('hidden');
    if ($teamBannerName) $teamBannerName.textContent = _activeTeamName;
    if ($teamBannerAgents) $teamBannerAgents.textContent = (agentCount || '?') + ' agents';
    if ($msgInput) $msgInput.placeholder = 'Message ' + _activeTeamName + '...';
    // Reload chat history for this team
    _historyLoadedForAgent = null;
    if ($messages) $messages.innerHTML = '';
    loadChatHistory();
    // Focus chat
    $msgInput?.focus();
  });

  // Exit team mode
  if ($teamExitBtn) {
    $teamExitBtn.addEventListener('click', () => {
      _activeTeamId = null;
      _activeTeamName = null;
      sessionStorage.removeItem('scratchy_teamId');
      sessionStorage.removeItem('scratchy_teamName');
      sessionStorage.removeItem('scratchy_teamAgents');
      if ($teamBanner) $teamBanner.classList.add('hidden');
      if ($msgInput) $msgInput.placeholder = 'Message Scratchy\u2026 (Shift+Enter for new line)';
      // Reload single-agent history
      _historyLoadedForAgent = null;
      if ($messages) $messages.innerHTML = '';
      loadChatHistory();
    });
  }

  // Workspaces panel events
  document.addEventListener('workspaces-close', () => {
    const w = document.querySelector('sc-workspaces');
    if (w) w.removeAttribute('open');
  });
  document.addEventListener('workspace-load', (e) => {
    const { workspace } = e.detail || {};
    if (!workspace) return;
    // Apply workspace ops to canvas
    const canvas = document.querySelector('sc-canvas');
    if (canvas) {
      canvas.clear();
      if (workspace.ops && workspace.ops.length > 0) {
        canvas.applyOps(workspace.ops);
      }
    }
    // Activate canvas surface
    window.dispatchEvent(new CustomEvent('surface-activate', { detail: { type: 'canvas' } }));
  });
  document.addEventListener('workspace-save', async (e) => {
    const { name } = e.detail || {};
    if (!name) return;
    // Collect current canvas state from sc-canvas
    const canvas = document.querySelector('sc-canvas');
    let ops = [];
    if (canvas && canvas.getState) {
      const stateMap = canvas.getState();
      for (const [id, s] of Object.entries(stateMap)) {
        ops.push({ op: 'upsert', id, type: s.type, data: s.data, layout: s.layout });
      }
    }
    try {
      const token = localStorage.getItem('scratchyToken') || '';
      const resp = await fetch('/api/workspaces/save-current', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ops })
      });
      if (resp.ok) {
        const w = document.querySelector('sc-workspaces');
        if (w && w.hasAttribute('open')) w.fetchData();
      }
    } catch (err) {
      console.error('[workspaces] Save failed:', err);
    }
  });

  document.addEventListener('widget-open', (e) => {
    const { widget } = e.detail || {};
    if (!widget) return;
    // Close widget store
    const ws = document.querySelector('sc-widget-store');
    if (ws) ws.removeAttribute('open');
    // If it's a builtin component, dispatch to workspace bar
    if (widget.component) {
      window.dispatchEvent(new CustomEvent('open-widget', { detail: { widgetId: widget.id, component: widget.component } }));
    } else if (widget.url) {
      // Embed as web app surface
      window.dispatchEvent(new CustomEvent('surface-activate', { detail: { surface: 'webapp', url: widget.url, title: widget.name } }));
    }
  });
  if ($logoutBtn) {
    $logoutBtn.addEventListener('click', () => { $userMenu.classList.add('hidden'); logout(); });
  }

  // Send button
  if ($sendBtn) {
    $sendBtn.addEventListener('click', sendMessage);
  }

  // Attach file button
  const $attachBtn = document.getElementById('attach-btn');
  const $fileInput = document.getElementById('file-input');
  if ($attachBtn && $fileInput) {
    $attachBtn.addEventListener('click', () => $fileInput.click());
    $fileInput.addEventListener('change', () => {
      for (const file of $fileInput.files) {
        uploadFile(file);
      }
      $fileInput.value = ''; // reset for re-upload
    });
  }

  // Drag & drop on chat area
  const $chatSurface = document.getElementById('chat-surface');
  if ($chatSurface) {
    let dragCounter = 0;
    $chatSurface.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) {
        let overlay = $chatSurface.querySelector('.drag-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'drag-overlay';
          overlay.textContent = 'Drop files here';
          $chatSurface.style.position = 'relative';
          $chatSurface.appendChild(overlay);
        }
      }
    });
    $chatSurface.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        const overlay = $chatSurface.querySelector('.drag-overlay');
        if (overlay) overlay.remove();
      }
    });
    $chatSurface.addEventListener('dragover', (e) => e.preventDefault());
    $chatSurface.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      const overlay = $chatSurface.querySelector('.drag-overlay');
      if (overlay) overlay.remove();
      for (const file of e.dataTransfer.files) {
        uploadFile(file);
      }
    });
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
