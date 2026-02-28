/**
 * Scratchy v2 — WebSocket client
 * Handles connection, reconnect, and message routing to surfaces.
 */

/** Build WS URL at call time so location.protocol is always correct */
function getWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
let _ws = null;
let _token = null;
let _authenticated = false;
let _reconnectTimer = null;
let _reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

/* -- Offline message queue (max 50) -- */
const _queue = [];
const MAX_QUEUE = 50;

/* -- Client keepalive state -- */
let _keepaliveInterval = null;
let _pongTimer = null;

/** Event bus for surface updates */
const _listeners = new Map();

export function on(event, fn) {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(fn);
  return () => _listeners.get(event)?.delete(fn);
}

export function emit(event, data) {
  const fns = _listeners.get(event);
  if (fns) fns.forEach(fn => fn(data));
}

/** Flush queued messages after auth completes */
function flushQueue() {
  while (_queue.length > 0) {
    const raw = _queue.shift();
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(raw);
    }
  }
}

/** Start client-side keepalive (ping every 25s) */
function startKeepalive() {
  stopKeepalive();
  _keepaliveInterval = setInterval(() => {
    if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
    _ws.send(JSON.stringify({ type: 'ping' }));
    // Expect pong within 10 seconds
    if (_pongTimer) clearTimeout(_pongTimer);
    _pongTimer = setTimeout(() => {
      console.warn('[ws] pong timeout — force reconnecting');
      _pongTimer = null;
      if (_ws) _ws.close();
    }, 10_000);
  }, 25_000);
}

/** Stop keepalive timers */
function stopKeepalive() {
  if (_keepaliveInterval) { clearInterval(_keepaliveInterval); _keepaliveInterval = null; }
  if (_pongTimer) { clearTimeout(_pongTimer); _pongTimer = null; }
}

/** Connect to WebSocket */
export function connect(token) {
  _token = token;
  _authenticated = false;
  if (_ws) _ws.close();
  
  // No token in URL — auth happens as first message after connect
  _ws = new WebSocket(getWsUrl());
  
  _ws.onopen = () => {
    console.log('[ws] connected, sending auth');
    _reconnectDelay = 1000;
    // Send auth as first message instead of URL param
    _ws.send(JSON.stringify({ type: 'auth', token: _token }));
  };
  
  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);

      // Clear pong timer on pong
      if (msg.type === 'pong' && _pongTimer) {
        clearTimeout(_pongTimer);
        _pongTimer = null;
      }

      // Handle auth confirmation — flush queue & start keepalive
      if (msg.type === 'connected' && !_authenticated) {
        _authenticated = true;
        flushQueue();
        startKeepalive();
      }

      emit(msg.type || 'message', msg);
      emit('any', msg);
    } catch {
      console.warn('[ws] non-JSON message:', e.data);
    }
  };
  
  _ws.onclose = (e) => {
    console.log('[ws] disconnected', e.code);
    _authenticated = false;
    stopKeepalive();
    emit('disconnected', { code: e.code });
    scheduleReconnect();
  };
  
  _ws.onerror = (e) => {
    console.error('[ws] error', e);
  };
}

function scheduleReconnect() {
  if (_reconnectTimer) return;
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    _reconnectDelay = Math.min(_reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
    if (_reconnectDelay >= MAX_RECONNECT_DELAY) {
      emit('reconnect-stalled', { delay: _reconnectDelay });
    }
    if (_token) connect(_token);
  }, _reconnectDelay);
}

/** Send a message (queues when offline, max 50) */
export function send(type, payload) {
  const raw = JSON.stringify({ type, ...payload });
  if (!_ws || _ws.readyState !== WebSocket.OPEN || !_authenticated) {
    if (_queue.length < MAX_QUEUE) {
      _queue.push(raw);
    } else {
      console.warn('[ws] offline queue full, dropping:', type);
    }
    return false;
  }
  _ws.send(raw);
  return true;
}

/** Send a chat message */
export function sendChat(text) {
  return send('chat', { text });
}

/** Send a widget action */
export function sendWidgetAction(action, context) {
  return send('widget-action', { action, context });
}

/** Disconnect */
export function disconnect() {
  if (_reconnectTimer) clearTimeout(_reconnectTimer);
  _reconnectTimer = null;
  _authenticated = false;
  stopKeepalive();
  _queue.length = 0;
  if (_ws) _ws.close();
  _ws = null;
}
