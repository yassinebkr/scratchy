/**
 * Scratchy v2 — WebSocket client
 * Handles connection, reconnect, and message routing to surfaces.
 */

const WS_URL = `ws://${location.host}/ws`;
let _ws = null;
let _token = null;
let _reconnectTimer = null;
let _reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;

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

/** Connect to WebSocket */
export function connect(token) {
  _token = token;
  if (_ws) _ws.close();
  
  const url = token ? `${WS_URL}?token=${encodeURIComponent(token)}` : WS_URL;
  _ws = new WebSocket(url);
  
  _ws.onopen = () => {
    console.log('[ws] connected');
    _reconnectDelay = 1000;
    emit('connected', {});
  };
  
  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      emit(msg.type || 'message', msg);
      emit('any', msg);
    } catch {
      console.warn('[ws] non-JSON message:', e.data);
    }
  };
  
  _ws.onclose = (e) => {
    console.log('[ws] disconnected', e.code);
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
    if (_token) connect(_token);
  }, _reconnectDelay);
}

/** Send a message */
export function send(type, payload) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) {
    console.warn('[ws] not connected, queuing:', type);
    return false;
  }
  _ws.send(JSON.stringify({ type, ...payload }));
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
  if (_ws) _ws.close();
  _ws = null;
}
