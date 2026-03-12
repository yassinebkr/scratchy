/**
 * Scratchy v2 — App bootstrap
 * Manages auth state, WS connection, and UI routing.
 */

import { connect, disconnect, on, send, sendChat, emit, sendWidgetAction } from './ws-client.js';
import { MobileUXManager } from './mobile-ux.js';
import { LiveWidgetRegistry } from '../components/sc-live-registry.js';
// Lazy-load inline tiles to avoid blocking page load
/** Inline tile renderer — progressive: tiles appear one by one with staggered timing */
function renderInlineTiles(messageEl, ops) {
  // Get or create tile container
  let container = messageEl.querySelector('.chat-tiles');
  if (!container) {
    container = document.createElement('div');
    container.className = 'chat-tiles';
    messageEl.appendChild(container);
  }

  // Handle live widget define/undefine ops first (must register before upsert)
  ops.filter(op => op?.op === 'define' && op.id && op.component).forEach(op => {
    LiveWidgetRegistry.define(op.id, op.component);
    console.log(`[app] Live widget defined: ${op.id}`);
  });
  ops.filter(op => op?.op === 'undefine' && op.id).forEach(op => {
    LiveWidgetRegistry.undefine(op.id);
    console.log(`[app] Live widget undefined: ${op.id}`);
  });

  // Separate immediate ops (clear/remove/patch) from upserts
  const immediateOps = ops.filter(op => op?.op !== 'upsert' && op?.op !== 'define' && op?.op !== 'undefine');
  const upsertOps = ops.filter(op => op?.op === 'upsert' && op.id);

  // Handle immediate ops synchronously
  immediateOps.forEach(op => {
    if (!op) return;
    if (op.op === 'clear') { container.innerHTML = ''; return; }
    if (op.op === 'remove') {
      const el = container.querySelector(`#tile-${CSS.escape(op.id)}`);
      if (el) el.remove();
      return;
    }
    if (op.op === 'patch') {
      const el = container.querySelector(`#tile-${CSS.escape(op.id)}`);
      if (el && op.data) {
        // Live widgets have an update() method; sc-tile uses attributes
        if (typeof el.update === 'function') {
          el.update(op.data);
        } else {
          try {
            const prev = JSON.parse(el.getAttribute('data') || '{}');
            el.setAttribute('data', JSON.stringify({ ...prev, ...op.data }));
          } catch {}
        }
      }
    }
  });

  // Progressive upsert: add tiles one by one with staggered delays
  upsertOps.forEach((op, i) => {
    setTimeout(() => {
      // Remove existing tile with same id
      const existing = container.querySelector(`#tile-${CSS.escape(op.id)}`);
      if (existing) existing.remove();

      let tile;
      // Check if this is a live widget type
      if (op.type && LiveWidgetRegistry.has(op.type)) {
        tile = LiveWidgetRegistry.createInstance(op.type, op.data || {}, op.id);
        if (tile) {
          tile.id = `tile-${op.id}`;
          // Expand parent message to full width for live widgets
          messageEl.classList.add('msg-has-live-widget');
        }
      }
      // Fall back to built-in sc-tile
      if (!tile) {
        tile = document.createElement('sc-tile');
        tile.id = `tile-${op.id}`;
        tile.setAttribute('type', op.type || 'card');
        if (op.data) tile.setAttribute('data', JSON.stringify(op.data));
      }
      tile.style.opacity = '0';
      tile.style.transform = 'translateY(12px)';
      container.appendChild(tile);

      // Trigger entrance animation on next frame
      requestAnimationFrame(() => {
        tile.style.transition = 'opacity 250ms ease-out, transform 250ms ease-out';
        tile.style.opacity = '1';
        tile.style.transform = 'translateY(0)';
      });

      // Scroll down as each tile appears
      scrollToBottom();
    }, i * 120); // 120ms between each tile
  });
}
// inlineTileRegistry declared at line 74

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
const inlineTileRegistry = new Map();
let $statusDot, $statusText, $statusBadge, $topbarUser, $logoutBtn, $userMenuBtn, $userMenu, $settingsBtn, $adminBtn;
let $agentSwitcher;
let $mobileAgentBtn;
let $workspaceBar;
let $teamBanner, $teamBannerName, $teamBannerAgents, $teamExitBtn;
let _skipMenuClose = false;
let _activeTeamId = sessionStorage.getItem('scratchy_teamId') || null;
let _activeTeamName = sessionStorage.getItem('scratchy_teamName') || null;
let _lastUserText = '';  // Track last user message for team-switch auto-resend

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
  const $signupCheckoutScreen = document.getElementById('signup-checkout-screen');
  [$landingScreen, $authScreen, $appScreen, $wizardScreen, $plansScreen, $signupCheckoutScreen]
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

function showSignupCheckout(planId) {
  hideAllScreens();
  const screen = document.getElementById('signup-checkout-screen');
  if (screen) {
    screen.classList.remove('hidden');
    const el = screen.querySelector('sc-signup-checkout');
    if (el) el.planId = planId; // component fetches plan details
  } else {
    showAuth(); // fallback
  }
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

/**
 * Scroll to bottom only if user is already near the bottom.
 * Prevents jarring auto-scroll during team status updates.
 */
function softScrollToBottom() {
  if (!$messages) return;
  const threshold = 150; // px from bottom to consider "near bottom"
  const nearBottom = ($messages.scrollHeight - $messages.scrollTop - $messages.clientHeight) < threshold;
  if (nearBottom) $messages.scrollTop = $messages.scrollHeight;
}

/** Force scroll to bottom (for new content the user expects) */
function scrollToBottom() {
  if (!$messages) return;
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

  // Debounce: block re-sends for 1500ms (prevents double-click/tap on mobile)
  _sendGuard = true;
  setTimeout(() => { _sendGuard = false; }, 1500);

  // Track last user message for team-switch auto-resend
  _lastUserText = text;

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

    // Send a chat message referencing the uploaded file (respect team mode)
    const activeAgentId = $agentSwitcher?._activeAgentId || null;
    const teamId = _activeTeamId || sessionStorage.getItem('scratchy_teamId') || undefined;
    const msg = isImage
      ? `[Uploaded image: ${uploaded.filename}](${uploaded.url})`
      : `[Uploaded file: ${uploaded.filename}](${uploaded.url}) (${uploaded.mimeType}, ${(uploaded.size / 1024).toFixed(1)} KB)`;
    sendChat(msg, activeAgentId, teamId);
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
    const agentPersonas = {
      Atlas: {
        greeting: "Hey! I'm Atlas — your code companion.",
        subtitle: "I write, debug, and review code. Drop me a problem.",
        suggestions: ["Review my code", "Explain this error", "Build a REST API", "Debug this function"],
        emoji: '🏛️',
      },
      Iris: {
        greeting: "Hi! I'm Iris — I think in pixels.",
        subtitle: "UI mockups, design systems, color palettes — let's make it beautiful.",
        suggestions: ["Design a dashboard", "Suggest a color palette", "Review my UI", "Create a component"],
        emoji: '🎨',
      },
      Nova: {
        greeting: "Hey there! I'm Nova — the research nerd.",
        subtitle: "I dig through data, compare options, and find answers.",
        suggestions: ["Compare X vs Y", "Summarize this article", "Research best practices", "Analyze this data"],
        emoji: '🔭',
      },
      Echo: {
        greeting: "Hello! I'm Echo — words are my thing.",
        subtitle: "Emails, docs, blog posts, copy — I'll draft it, you ship it.",
        suggestions: ["Draft an email", "Write documentation", "Improve this text", "Create a blog post"],
        emoji: '✍️',
      },
    };

    const persona = agentPersonas[agentName] || {
      greeting: `Hey! I'm ${agentName}.`,
      subtitle: "Ask me anything — I'm here to help.",
      suggestions: ["Help me with code", "Explain something", "Write a draft", "Research a topic"],
      emoji: '✨',
    };

    const agent = $agentSwitcher?._agents?.find(a => a.name === agentName);
    const agentSlug = agentName.toLowerCase().replace(/\s+/g, '-');

    const container = document.createElement('div');
    container.id = 'empty-state';
    container.style.cssText = `
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        flex-grow: 1; height: 100%; text-align: center; color: #f0ead6;
        font-family: 'Geist', sans-serif; padding: 32px; gap: 0;
    `;

    // Avatar — try persona photo first, fallback to emoji
    const avatarDiv = document.createElement('div');
    avatarDiv.style.cssText = `width: 72px; height: 72px; border-radius: 50%; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: rgba(249,166,2,0.08); border: 2px solid rgba(249,166,2,0.15);`;
    const avatarImg = document.createElement('img');
    avatarImg.src = `/assets/agents/${agentSlug}.png`;
    avatarImg.alt = agentName;
    avatarImg.style.cssText = `width: 100%; height: 100%; object-fit: cover;`;
    avatarImg.onerror = () => {
      avatarImg.style.display = 'none';
      const emojiSpan = document.createElement('span');
      emojiSpan.textContent = persona.emoji;
      emojiSpan.style.cssText = `font-size: 32px;`;
      avatarDiv.appendChild(emojiSpan);
    };
    avatarDiv.appendChild(avatarImg);

    const greetingH = document.createElement('h2');
    greetingH.textContent = persona.greeting;
    greetingH.style.cssText = `color: #f0ead6; font-size: 1.3em; margin: 0 0 6px; font-weight: 600;`;

    const subtitleP = document.createElement('p');
    subtitleP.textContent = persona.subtitle;
    subtitleP.style.cssText = `color: #8a7e6a; font-size: 0.95em; margin: 0 0 28px; max-width: 400px;`;

    const chipsContainer = document.createElement('div');
    chipsContainer.style.cssText = `display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; max-width: 480px;`;

    persona.suggestions.forEach(text => {
        const chip = document.createElement('button');
        chip.textContent = text;
        chip.style.cssText = `
            background: rgba(26,22,16,0.6); border: 1px solid rgba(240, 234, 214, 0.08);
            color: #c4b99a; padding: 10px 18px; border-radius: 12px;
            cursor: pointer; transition: all 0.2s ease; font-family: 'Geist', sans-serif;
            font-size: 13px; backdrop-filter: blur(4px);
        `;
        chip.onmouseenter = () => { chip.style.borderColor = 'rgba(249,166,2,0.4)'; chip.style.color = '#F9A602'; chip.style.background = 'rgba(249,166,2,0.06)'; };
        chip.onmouseleave = () => { chip.style.borderColor = 'rgba(240, 234, 214, 0.08)'; chip.style.color = '#c4b99a'; chip.style.background = 'rgba(26,22,16,0.6)'; };
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

    container.appendChild(avatarDiv);
    container.appendChild(greetingH);
    container.appendChild(subtitleP);
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

/**
 * Strip internal/GenUI blocks from message text.
 * Used by streaming, stream-end, and history rendering for consistency.
 * @param {string} text - Raw message text
 * @param {object} [opts]
 * @param {boolean} [opts.streaming] - Replace canvas blocks with placeholder instead of removing
 * @returns {string} Cleaned text
 */
function stripInternalBlocks(text, opts) {
  const streaming = opts && opts.streaming;
  let s = text;

  // NullClaw debug output
  s = s.replace(/^Sending to [Aa]nthropic\.{3}\s*\n?/gm, '');

  // Tool call XML blocks (closed)
  s = s.replace(/<tool_call[^>]*>[\s\S]*?<\/tool_call>/g, '');
  s = s.replace(/<tool_result[^>]*>[\s\S]*?<\/tool_result>/g, '');
  s = s.replace(/<tool_use[^>]*>[\s\S]*?<\/tool_use>/g, '');
  // Tool call XML (unclosed — still streaming)
  s = s.replace(/<tool_(?:call|result|use)[^>]*>[\s\S]*$/g, '');

  // Orchestrator [DELEGATE] blocks (closed) — with or without attributes
  s = s.replace(/\[DELEGATE[^\]]*\][\s\S]*?\[\/DELEGATE\]/g, '');
  // [DELEGATE] blocks (unclosed — still streaming)
  s = s.replace(/\[DELEGATE[^\]]*\][\s\S]*$/g, '');
  // Inline self-closing: [DELEGATE .../]
  s = s.replace(/\[DELEGATE[^\]]*\/\]/g, '');

  var ph = streaming ? '\u2728 Rendering UI\u2026' : '';

  // Fenced GenUI blocks (closed): ```scratchy-canvas/toon/tpl ... ```
  s = s.replace(/```scratchy-(canvas|toon|tpl)\s*\n[\s\S]*?```/g, ph);
  // Fenced GenUI blocks (unclosed — still streaming)
  s = s.replace(/```scratchy-(canvas|toon|tpl)[\s\S]*$/g, ph);

  // Unfenced legacy: scratchy-canvas\n{...}\n{...}
  s = s.replace(/(?:^|\n)\s*scratchy-canvas\s*\n(?:\s*\{[^\n]+\}\s*\n?)+/gi, '');
  // Unfenced legacy: just "scratchy-canvas" at end of text (no JSON yet)
  s = s.replace(/(?:^|\n)\s*scratchy-canvas\s*$/gi, '');

  // Collapse multiple consecutive placeholders into one
  if (streaming) {
    s = s.replace(/(?:\u2728 Rendering UI\u2026[\t ]*\n?)+/g, '\u2728 Rendering UI\u2026');
  }

  // Collapse leftover whitespace
  s = s.replace(/\n{3,}/g, '\n\n').trim();

  return s;
}

/** Markdown → HTML (headers, lists, bold, italic, code, links, images) */
function formatMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks: ```...``` (must be before line-level processing)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Process line-by-line for block-level elements
  const lines = html.split('\n');
  const out = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Skip lines inside <pre> blocks (already handled)
    if (line.includes('<pre>') || line.includes('</pre>')) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(line);
      continue;
    }

    // Horizontal rule: --- or *** or ___
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<hr>');
      continue;
    }

    // Headers: # ## ### ####
    const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      if (inList) { out.push('</ul>'); inList = false; }
      const level = hMatch[1].length;
      // Render h1-h4 as styled elements (h3/h4 = smaller, within chat bubble context)
      const tag = level <= 2 ? 'strong' : 'strong';
      const cls = level === 1 ? 'md-h1' : level === 2 ? 'md-h2' : level === 3 ? 'md-h3' : 'md-h4';
      out.push(`<div class="${cls}">${hMatch[2]}</div>`);
      continue;
    }

    // Unordered list: - item or * item
    const liMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (liMatch) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${liMatch[1]}</li>`);
      continue;
    }

    // Ordered list: 1. item
    const olMatch = line.match(/^[\s]*\d+\.\s+(.+)$/);
    if (olMatch) {
      // Treat as unordered for simplicity (avoids ol/ul state tracking)
      if (!inList) { out.push('<ul class="md-ol">'); inList = true; }
      out.push(`<li>${olMatch[1]}</li>`);
      continue;
    }

    // Not a list item — close list if open
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(line);
  }
  if (inList) out.push('</ul>');

  html = out.join('\n');

  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold: **...**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic: *...*
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  // Strikethrough: ~~...~~
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  // Images: [IMAGE:path] → inline <img>
  html = html.replace(/\[IMAGE:([^\]]+)\]/g, (_, path) => {
    const safePath = path.trim();
    return '<img src="/api/workspace-file?path=' + encodeURIComponent(safePath) + '" alt="Agent image" style="max-width:100%;max-height:400px;border-radius:8px;margin:8px 0" loading="lazy">';
  });
  // Markdown images: ![alt](url)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;max-height:400px;border-radius:8px;margin:8px 0" loading="lazy">');
  // Markdown links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Line breaks (but not inside block elements we already created)
  html = html.replace(/\n/g, '<br>');
  // Clean up excessive <br> after block elements
  html = html.replace(/(<\/div>)<br>/g, '$1');
  html = html.replace(/(<\/ul>)<br>/g, '$1');
  html = html.replace(/(<\/li>)<br>/g, '$1');
  html = html.replace(/(<hr>)<br>/g, '$1');
  html = html.replace(/(<br>){3,}/g, '<br><br>');
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

    const data = await res.json();
    const { messages, canvasOps } = data;
    if (messages && messages.length > 0 && $messages) {
      // Clear any placeholder content
      $messages.innerHTML = '';

      for (const msg of messages) {
        let content = msg.content;

        // Strip tool call XML + GenUI code blocks + delegation blocks
        content = stripInternalBlocks(content);

        // Skip empty messages (all GenUI ops with no text)
        if (!content) continue;

        const div = document.createElement('div');
        div.className = `msg msg-${msg.role}`;
        div.innerHTML = formatMarkdown(content);
        $messages.appendChild(div);
      }

      // Restore canvas tiles inline after the last assistant message
      if (canvasOps && canvasOps.length > 0) {
        const allMsgs = $messages.querySelectorAll('.msg.msg-assistant');
        const lastMsg = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : null;
        if (lastMsg) {
          renderInlineTiles(lastMsg, canvasOps);
        }
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
      padding: 8px 14px;
      margin: 6px auto;
      max-width: 480px;
      font-family: inherit;
      color: #f0ead6;
      font-size: 13px;
      text-align: center;
    }
    
    .team-plan-card {
      background: rgba(249,166,2,0.06);
      border: 1px solid rgba(249,166,2,0.15);
      border-radius: 12px;
      padding: 14px;
      margin: 6px auto;
      max-width: 520px;
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
      padding: 12px;
      margin: 4px auto;
      max-width: 520px;
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

let _rateLimitToastTimer = null;
function showRateLimitToast(message, durationMs = 5000) {
  // Inject styles if they don't exist
  if (!document.getElementById('rate-limit-styles')) {
    const style = document.createElement('style');
    style.id = 'rate-limit-styles';
    style.textContent = `
      .rate-limit-toast {
        position: absolute;
        top: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(-150%);
        opacity: 0;
        width: max-content;
        max-width: 90%;
        background: rgba(249, 166, 2, 0.15);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(249, 166, 2, 0.3);
        border-radius: 12px;
        color: var(--text, #f0ead6);
        font-family: 'Geist', sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        padding: 12px 16px;
        z-index: 9999;
        transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        pointer-events: auto;
      }
      .rate-limit-toast.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
      .rate-limit-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .rate-limit-message {
        font-size: 14px;
        font-weight: 500;
        color: var(--text, #f0ead6);
      }
      .rate-limit-close {
        background: none;
        border: none;
        color: var(--text, #f0ead6);
        opacity: 0.6;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        margin-left: 8px;
        transition: opacity 0.2s;
        line-height: 1;
      }
      .rate-limit-close:hover {
        opacity: 1;
      }
      .rate-limit-progress-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: var(--accent, #F9A602);
        width: 100%;
        transform-origin: left;
      }
    `;
    document.head.appendChild(style);
  }

  // Use the chat container or fallback to body
  const container = document.querySelector('.chat-area') || ($messages && $messages.parentElement) || document.body;
  if (container !== document.body) {
    const style = window.getComputedStyle(container);
    if (style.position === 'static') container.style.position = 'relative';
  }

  let toast = document.getElementById('rate-limit-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'rate-limit-toast';
    toast.className = 'rate-limit-toast';
    
    const content = document.createElement('div');
    content.className = 'rate-limit-content';
    
    const msgSpan = document.createElement('span');
    msgSpan.className = 'rate-limit-message';
    msgSpan.id = 'rate-limit-message-text';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'rate-limit-close';
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => toast.classList.remove('show');
    
    content.appendChild(msgSpan);
    content.appendChild(closeBtn);
    
    const progress = document.createElement('div');
    progress.className = 'rate-limit-progress-bar';
    progress.id = 'rate-limit-progress';
    
    toast.appendChild(content);
    toast.appendChild(progress);
    
    container.appendChild(toast);
  }

  document.getElementById('rate-limit-message-text').textContent = message || "⏳ The AI team is cooling down — too many requests. Retrying shortly…";
  
  const progress = document.getElementById('rate-limit-progress');
  // Reset animation
  progress.style.transition = 'none';
  progress.style.transform = 'scaleX(1)';
  
  // Force reflow
  void progress.offsetWidth;
  
  // Start animation
  progress.style.transition = `transform ${durationMs}ms linear`;
  progress.style.transform = 'scaleX(0)';
  
  // Show toast
  setTimeout(() => toast.classList.add('show'), 10);
  
  if (_rateLimitToastTimer) clearTimeout(_rateLimitToastTimer);
  _rateLimitToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, durationMs);
}

function wireWsEvents() {
  // Inject CSS styles for team UI components
  injectTeamUIStyles();

  on('connected', () => {
    setConnectionStatus('connected');
    // Load chat history from server on (re)connect
    loadChatHistory();
  });

  on('disconnected', () => {
    // Clear stale streaming state — prevents _streamDiv from surviving reconnects
    if (_streamDiv) {
      _streamDiv.classList.remove('streaming');
      _streamDiv = null;
    }
    _streamRaw = '';
    // Reset history flag so reconnect reloads messages
    _historyLoadedForAgent = null;

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
    clearAllTypingIndicators();
    const content = msg.html || escapeHtml(msg.text || '');
    appendMessage(msg.from || 'assistant', content);
  });

  // Streaming: create a message bubble on first chunk, append deltas
  let _streamDiv = null;
  // Raw stream buffer — holds unfiltered text; _streamDiv shows filtered version
  let _streamRaw = '';

  on('chat-stream', (msg) => {
    if (!$messages) return;
    // Remove empty state and typing dots once real content arrives
    removeEmptyState();
    $messages.querySelectorAll('.typing-indicator').forEach(el => el.remove());
    // Defensive: if _streamDiv is stale from a previous broken stream, finalize it
    if (_streamDiv && !_streamDiv.classList.contains('streaming')) {
      _streamDiv = null;
      _streamRaw = '';
    }
    if (!_streamDiv) {
      _streamDiv = document.createElement('div');
      _streamDiv.className = 'msg msg-assistant streaming';
      _streamDiv.textContent = '';
      _streamRaw = '';
      $messages.appendChild(_streamDiv);
    }
    _streamRaw += msg.delta;
    // Live-filter: strip internal blocks, show placeholder for canvas
    var display = stripInternalBlocks(_streamRaw, { streaming: true });
    _streamDiv.textContent = display;
    $messages.scrollTop = $messages.scrollHeight;
  });

  on('chat-stream-end', () => {
    if (_streamDiv) {
      _streamDiv.classList.remove('streaming');
      let raw = _streamRaw || _streamDiv.textContent;
      _streamRaw = '';
      // Strip all internal blocks (tool_call, DELEGATE, GenUI fences, etc.)
      raw = stripInternalBlocks(raw);
      // Convert markdown-ish text to basic HTML (bold, code, newlines)
      _streamDiv.innerHTML = formatMarkdown(raw);
      if (!raw.trim()) _streamDiv.remove(); // remove empty bubble if all content was GenUI ops
      _streamDiv = null;
    }
    // Flush any canvas ops that arrived during streaming
    if (_pendingCanvasOps.length > 0) {
      const ops = _pendingCanvasOps.splice(0);
      const canvasOps = ops.filter(op => op.type !== 'webapp' && op.op !== 'webapp' && op.op !== 'trigger');
      const triggerOps = ops.filter(op => op.op === 'trigger');
      const webappOps = ops.filter(op => op.type === 'webapp' || op.op === 'webapp');

      // Remove skeleton placeholder (genui-pending shows it before canvas-ops arrive)
      if ($messages) {
        const placeholder = $messages.querySelector('.genui-rendering');
        if (placeholder) placeholder.remove();
      }

      // Handle triggers
      for (const op of triggerOps) {
        const action = op.action || op.data?.action || '';
        if (action === 'open-notes' || action === 'sn-list') _openWidget('sc-notes', 'notes');
        else if (action === 'open-calendar' || action === 'cal-month') _openWidget('sc-calendar', 'calendar');
        else if (action === 'open-email' || action === 'mail-inbox') _openWidget('sc-email', 'email');
      }

      // Open webapp surfaces
      for (const op of webappOps) {
        const data = op.data || op;
        if (data.url) {
          import('./surface-manager.js').then(sm => sm.openWebApp(data.url, data.title));
        }
      }

      // Render tiles after the last assistant message
      if (canvasOps.length > 0 && $messages) {
        const allMsgs = $messages.querySelectorAll('.msg.msg-assistant');
        const lastAgent = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : $messages.lastElementChild;
        if (lastAgent) {
          renderInlineTiles(lastAgent, canvasOps);
          scrollToBottom();
        }
      }
      if (canvasOps.length > 0) {
        window.dispatchEvent(new CustomEvent('surface-activate', {
          detail: { type: 'canvas', ops: canvasOps },
        }));
      }
    }
    // Safety: clear any typing indicators that survived streaming
    clearAllTypingIndicators();
  });

  // Replace streamed text with cleaned version (removes verbose prose when canvas ops present)
  on('chat-replace', (msg) => {
    if (!$messages || !msg.text && msg.text !== '') return;
    const allMsgs = $messages.querySelectorAll('.msg.msg-assistant, .msg-assistant');
    const lastMsg = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : null;
    if (lastMsg) {
      if (!msg.text.trim()) {
        // No text left — remove the message bubble entirely (tiles will be standalone)
        lastMsg.remove();
      } else {
        lastMsg.innerHTML = formatMarkdown(msg.text.trim());
      }
    }
  });

  // Show skeleton loader when server signals GenUI tiles are coming
  on('genui-pending', (msg) => {
    if ($messages && !$messages.querySelector('.genui-rendering')) {
      const count = Math.min(msg?.count || 3, 6);
      const ph = document.createElement('div');
      ph.className = 'genui-rendering';
      ph.innerHTML = `
        <div class="genui-skeleton-header">
          <span class="genui-skeleton-dot"></span>
          Rendering ${count} component${count > 1 ? 's' : ''}…
        </div>
        <div class="genui-skeleton-grid">
          ${Array.from({length: Math.min(count, 4)}, () => '<div class="genui-skeleton-tile"></div>').join('')}
        </div>
      `;
      $messages.appendChild(ph);
      scrollToBottom();
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

  /** Map team routing phase to human-readable status */
  function phaseLabel(phase, workerCount) {
    switch (phase) {
      case 'planning': return 'Planning tasks…';
      case 'coordinating': return 'Coordinating team…';
      case 'delegating': return workerCount ? `Spawning ${workerCount} worker${workerCount > 1 ? 's' : ''}…` : 'Delegating…';
      case 'synthesizing': return 'Synthesizing results…';
      default: return 'Thinking…';
    }
  }

  on('typing', (msg) => {
    const isTeam = !!msg.teamId;
    const label = msg.status === 'start' ? phaseLabel(msg.phase, msg.workerCount) : null;

    if ($statusText) {
      $statusText.textContent = label || (state.connected ? 'Connected' : 'Disconnected');
    }
    // Show/hide typing indicator in chat area
    if ($messages) {
      if (msg.status === 'start') {
        clearAllTypingIndicators();
        const el = document.createElement('div');
        el.className = 'typing-indicator';
        if (isTeam && msg.phase) {
          // Phase-aware indicator: label + animated dots
          el.innerHTML = `<span class="typing-phase">${phaseLabel(msg.phase, msg.workerCount)}</span><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
        } else {
          el.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
        }
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

  // Show tool activity in typing indicator — so the user knows what's happening
  on('tool_call', (msg) => {
    if (!$messages || !msg.tool) return;
    const toolName = msg.tool.replace('mcp_canvas_', 'canvas:').replace('mcp_', '');
    // Skip canvas tools (they render their own feedback)
    if (toolName.startsWith('canvas:')) return;
    // Map common tool names to friendly labels
    const labels = {
      shell: '🖥️ Running command…',
      file_read: '📄 Reading file…',
      file_write: '✏️ Writing file…',
      web_search: '🔍 Searching…',
      web_fetch: '🌐 Fetching page…',
      http_request: '🌐 Making request…',
      memory_recall: '🧠 Recalling…',
      memory_store: '🧠 Remembering…',
    };
    const label = labels[toolName] || `⚙️ Using ${toolName}…`;

    // Update existing indicator or create new one
    let indicator = $messages.querySelector('.typing-indicator');
    if (indicator) {
      indicator.innerHTML = `<span class="typing-phase">${label}</span><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>`;
    }
  });

  // Clean up typing indicators when team routing completes or errors
  on('team-message-end', (msg) => {
    clearAllTypingIndicators();
    clearTimeout(_typingSafetyTimer);
    if ($statusText) $statusText.textContent = state.connected ? 'Connected' : 'Disconnected';
    // Pass preview URLs to bubble so it can show a built-in Preview button
    if (msg.previewUrls && msg.previewUrls.length > 0) {
      const bubble = document.getElementById('worker-bubble');
      if (bubble && bubble.setPreviewUrls) {
        bubble.setPreviewUrls(msg.previewUrls);
      }
    }
  });
  on('team-error', (msg) => {
    clearAllTypingIndicators();
    clearTimeout(_typingSafetyTimer);
    // Reset bubble on error
    const bubble = document.getElementById('worker-bubble');
    if (bubble) bubble.reset();
    if ($statusText) $statusText.textContent = state.connected ? 'Connected' : 'Disconnected';
    
    // Check for rate-limit / network errors
    const errText = msg.error ? msg.error.toLowerCase() : '';
    const isRateLimit = errText.includes('network error') || 
                        errText.includes('rate limit') || 
                        errText.includes('try again') ||
                        errText.includes('too many requests') ||
                        errText.includes('cooling down');

    if (isRateLimit) {
      showRateLimitToast("⏳ The AI team is cooling down — too many requests. Retrying shortly…", 5000);
    } else if (msg.error && $messages) {
      appendMessage('system', `<span class="msg-error">Team error: ${escapeHtml(msg.error)}</span>`);
    }
  });

  // --- Team Event Handlers (routed to worker bubble) ---

  function getBubble() {
    return document.getElementById('worker-bubble');
  }

  // 1. Team routing begins
  on('team-message-start', (msg) => {
    removeEmptyState();
  });

  // 2. Planning phase updates
  on('team-planning', (msg) => {
    const bubble = getBubble();
    const { status } = msg;

    if (status === 'accepted' && msg.tasks && bubble) {
      bubble.showPlan(msg.tasks);
    } else if (status === 'error' && msg.error && $messages) {
      appendMessage('system', `<span class="msg-error">Planning error: ${escapeHtml(msg.error)}</span>`);
    }
  });

  // 3. Batch of workers starting (no-op — bubble handles count)
  on('team-delegations-start', () => {});

  // 4. Individual worker lifecycle → bubble
  on('team-delegation', (msg) => {
    const bubble = getBubble();
    if (!bubble) return;
    const { status, toAgentName } = msg;

    if (status === 'start') {
      bubble.addWorker(toAgentName, msg.task || '', getAgentColor(toAgentName));
    } else if (status === 'complete') {
      bubble.completeWorker(toAgentName, true);
    } else if (status === 'error') {
      bubble.completeWorker(toAgentName, false, msg.error);
    }
  });

  // 5. Worker output streaming → bubble
  on('team-worker-stream', (msg) => {
    const bubble = getBubble();
    if (!bubble) return;
    const { delta, agentName } = msg;
    if (delta && agentName) bubble.appendOutput(agentName, delta);
  });

  // 6. Batch complete (bubble auto-handles via completeWorker)
  on('team-delegations-end', () => {});

  on('canvas-update', (msg) => {
    // Forward to GenUI renderer if available
    emit('canvas-update', msg);
  });

  // --- Canvas ops from agent responses (GenUI + A2UI converted) ---
  // Canvas is a FIRST-CLASS spatial surface — it dominates the workspace when active.
  // Chat becomes a compact input strip at the bottom.
  // Buffer canvas ops during streaming — render after stream ends
  let _pendingCanvasOps = [];

  on('canvas-ops', (msg) => {
    if (!msg.ops || msg.ops.length === 0) return;

    // Restored canvas state via WS (fallback — primary restore is via history API)
    if (msg.restored) return;

    // If we're currently streaming, buffer the ops for after stream-end
    if (_streamDiv) {
      _pendingCanvasOps.push(...msg.ops);
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

    // Render tiles inline in the chat stream
    if (canvasOps.length > 0 && $messages) {
      try {
        // Find the last assistant message bubble
        const allMsgs = $messages.querySelectorAll('.msg.msg-assistant, .msg-assistant');
        const lastAgent = allMsgs.length > 0 ? allMsgs[allMsgs.length - 1] : $messages.lastElementChild;
        if (lastAgent) {
          renderInlineTiles(lastAgent, canvasOps);
          scrollToBottom();
        }
      } catch (e) { console.warn('[chat-tiles] inline render error:', e); }
    }

    // Also activate canvas surface for regular ops (panel + inline coexist)
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
    // Update mobile agent button icon — try persona photo, fall back to emoji
    const iconEl = document.getElementById('mobile-agent-icon');
    if (iconEl && msg.agent) {
      const slug = (msg.agent.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      const img = new Image();
      img.src = `/assets/agents/${slug}.png`;
      img.style.cssText = 'width:22px;height:22px;border-radius:6px;object-fit:cover;vertical-align:middle';
      img.onload = () => { iconEl.textContent = ''; iconEl.appendChild(img); };
      img.onerror = () => { iconEl.textContent = msg.agent.emoji || '🤖'; };
    }
  });

  // ── Access Gate: block chat when user has no tier ──
  on('access-denied', () => {
    const gate = document.querySelector('sc-access-gate');
    if (gate && gate.show) gate.show();
  });
  // Gate "Use API Key" button → open settings
  document.addEventListener('open-settings', () => {
    let settings = document.querySelector('sc-settings');
    if (!settings) {
      settings = document.createElement('sc-settings');
      document.body.appendChild(settings);
    }
    settings.setAttribute('open', '');
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

  // Reload agent switcher now that auth token is available
  // (connectedCallback may have run before login set the token)
  if ($agentSwitcher) $agentSwitcher.loadAgents?.();

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

  // Full reload to landing page — cleanest way to reset all state
  window.location.href = '/';
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
    const slug = (agent.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    card.innerHTML = `
      <span class="mobile-agent-emoji"><img src="/assets/agents/${slug}.png" style="width:28px;height:28px;border-radius:8px;object-fit:cover" onerror="this.replaceWith(document.createTextNode('${agent.emoji || '🤖'}'))" /></span>
      <span class="mobile-agent-name">${agent.name || 'Agent'}</span>
      <span class="mobile-agent-role">${agent.role || ''}</span>
    `;
    card.addEventListener('click', () => {
      switcher._switchAgent(agent);
      sheetHandle.dismiss();
      const iconEl = document.getElementById('mobile-agent-icon');
      if (iconEl) {
        const cSlug = (agent.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
        const cImg = new Image();
        cImg.src = `/assets/agents/${cSlug}.png`;
        cImg.style.cssText = 'width:22px;height:22px;border-radius:6px;object-fit:cover;vertical-align:middle';
        cImg.onload = () => { iconEl.textContent = ''; iconEl.appendChild(cImg); };
        cImg.onerror = () => { iconEl.textContent = agent.emoji || '🤖'; };
      }
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
        // Admin gets full teams UI; everyone else sees "coming soon"
        if (state.user?.role === 'admin') {
          let teams = document.querySelector('sc-teams');
          if (!teams) {
            teams = document.createElement('sc-teams');
            document.body.appendChild(teams);
          }
          teams.setAttribute('open', '');
        } else {
          // Show a "Coming Soon" toast/overlay
          const toast = document.createElement('div');
          toast.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(20,17,12,0.95); border: 1px solid rgba(249,166,2,0.3);
            color: #f0ead6; padding: 40px 48px; border-radius: 16px; z-index: 10000;
            text-align: center; font-family: 'Geist', sans-serif;
            backdrop-filter: blur(12px); animation: fadeIn 0.2s ease;
          `;
          toast.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 16px;">👥</div>
            <h3 style="margin: 0 0 8px; font-size: 1.3em;">Teams — Coming Soon</h3>
            <p style="color: #8a7e6a; margin: 0 0 20px; font-size: 0.9em;">Multi-agent collaboration is being polished.<br>Stay tuned!</p>
            <button style="background: rgba(249,166,2,0.15); border: 1px solid rgba(249,166,2,0.3); color: #F9A602; padding: 8px 24px; border-radius: 8px; cursor: pointer; font-family: 'Geist', sans-serif; font-size: 14px;" onclick="this.parentElement.remove()">Got it</button>
          `;
          // Click backdrop to dismiss
          const backdrop = document.createElement('div');
          backdrop.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999;`;
          backdrop.onclick = () => { toast.remove(); backdrop.remove(); };
          document.body.appendChild(backdrop);
          document.body.appendChild(toast);
        }
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
    // All paths lead to auth — plan selection happens after signup (in settings/billing)
    if (action === 'select-plan' || action === 'get-started' || action === 'sign-in') {
      if (planId) localStorage.setItem('scratchy_pending_plan', planId);
      showAuth();
      if (action === 'sign-in') {
        const authEl = document.querySelector('sc-auth');
        if (authEl) authEl.mode = 'login';
      }
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

  // Listen for signup-checkout events
  document.addEventListener('signup-checkout', async (e) => {
    const { email, password, name, plan } = e.detail;
    // 1. Create account via POST /api/auth/signup
    // 2. If paid plan: POST /api/billing/checkout → redirect to Stripe
    // 3. If free/byok: enter app directly
  });

  document.addEventListener('signup-social', (e) => {
    const { provider, plan } = e.detail;
    localStorage.setItem('scratchy_pending_plan', plan);
    window.location.href = `/api/auth/oauth/${provider}`;
  });

  document.addEventListener('signup-back', () => showLanding());

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

  // ── Team-switch buttons (agent suggests, user decides) ──────────────
  // Handles `switch-team:{teamId}` actions from canvas buttons components.
  // Logic-gated: only fires on explicit user click, agent can never trigger
  // team mode programmatically. Auto-resends last user message to the team.
  document.addEventListener('tile-action', (e) => {
    const action = e.detail?.action || '';
    if (!action.startsWith('switch-team:')) return;
    const teamId = action.replace('switch-team:', '').trim();
    if (!teamId) return;

    // Fetch team info to populate banner
    const token = localStorage.getItem('scratchy_token') || '';
    fetch('/api/teams', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(teams => {
        const team = (teams || []).find(t => t.id === teamId || t.name === teamId);
        if (!team) {
          appendMessage('system', `Team not found: ${teamId}`);
          return;
        }
        // Dispatch the standard team-chat event (reuses existing team-mode activation)
        document.dispatchEvent(new CustomEvent('team-chat', {
          detail: { teamId: team.id, teamName: team.name, agentCount: team.agentCount || team.agents?.length || '?' }
        }));
        // Auto-resend last user message through the team router (one-shot)
        const resendText = _lastUserText;
        _lastUserText = null; // clear to prevent duplicate resends
        if (resendText) {
          setTimeout(() => {
            appendMessage('user', escapeHtml(resendText));
            const activeAgentId = $agentSwitcher?._activeAgentId || null;
            sendChat(resendText, activeAgentId, team.id);
          }, 300); // Small delay to let team mode activate + history load
        }
      })
      .catch(err => {
        console.error('[app] Team switch failed:', err);
        appendMessage('system', 'Failed to switch to team. Please try again.');
      });
  });
  // ── Preview buttons (open generated files in webapp surface) ────────
  // Handles `open-preview:/api/preview/...` actions from team task results.
  // Logic-gated: only fires on explicit user click.
  document.addEventListener('tile-action', (e) => {
    const action = e.detail?.action || '';
    if (!action.startsWith('open-preview:')) return;
    const url = action.replace('open-preview:', '').trim();
    if (!url || !url.startsWith('/api/preview/')) return; // Security: only allow preview routes
    import('./surface-manager.js').then(sm => sm.openWebApp(url, 'Preview'));
  });

  // Also catch canvas-action (from sc-canvas panel, same logic)
  document.addEventListener('canvas-action', (e) => {
    const action = e.detail?.action || '';
    if (action.startsWith('switch-team:') || action.startsWith('open-preview:')) {
      document.dispatchEvent(new CustomEvent('tile-action', { detail: e.detail }));
    }
  });

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
  // Live widget actions — forward to server via WS
  document.addEventListener('widget-action', (e) => {
    const { action, payload, widgetId, instanceId } = e.detail || {};
    if (!action || !widgetId) return;
    // Look up the creator agent from the registry
    const def = LiveWidgetRegistry.get(widgetId);
    sendWidgetAction(action, {
      ...payload,
      widgetId,
      instanceId,
      createdBy: def?.createdBy || null,
      isLiveWidget: true,
    });
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

  // Drag & drop on chat area (file uploads only — skip widget DnD)
  const $chatSurface = document.getElementById('chat-surface');
  if ($chatSurface) {
    let dragCounter = 0;
    const _isFileDrag = (e) => e.dataTransfer && e.dataTransfer.types.includes('Files');
    $chatSurface.addEventListener('dragenter', (e) => {
      if (!_isFileDrag(e)) return; // Widget DnD (text/plain) — don't interfere
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
      if (!_isFileDrag(e)) return;
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        const overlay = $chatSurface.querySelector('.drag-overlay');
        if (overlay) overlay.remove();
      }
    });
    // Always preventDefault on dragover — required for BOTH file drops AND widget DnD.
    // Shadow DOM dragover preventDefault doesn't cross the boundary reliably,
    // so we must also allow drops at the light DOM level.
    $chatSurface.addEventListener('dragover', (e) => e.preventDefault());
    $chatSurface.addEventListener('drop', (e) => {
      if (!_isFileDrag(e)) return; // Widget DnD — let it pass through
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
