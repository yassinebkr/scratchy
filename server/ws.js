/**
 * @module ws
 * Scratchy v2 — WebSocket handler
 *
 * Manages authenticated WebSocket connections with per-client state,
 * message routing, multi-device broadcast, and keepalive.
 *
 * Uses the `ws` package for WebSocket protocol handling.
 */

import { WebSocketServer } from 'ws';
import { URL } from 'node:url';

/* ------------------------------------------------------------------ */
/*  Client registry — tracks every connected WebSocket by userId      */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} ClientState
 * @property {string}   userId
 * @property {string}   sessionToken
 * @property {number}   connectedAt
 * @property {string[]} surfaces     — subscribed surface types
 * @property {import('ws').WebSocket} ws
 * @property {boolean}  alive        — keepalive flag
 */

/** @type {Map<import('ws').WebSocket, ClientState>} */
const clients = new Map();

/** @type {Map<string, Set<import('ws').WebSocket>>} per-user connection sets (multi-device) */
const userSockets = new Map();

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Send a JSON message to a single WebSocket.
 * @param {import('ws').WebSocket} ws
 * @param {Record<string, unknown>} msg
 */
function sendJson(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Send a message to one connection of a user (first found).
 * @param {string} userId
 * @param {Record<string, unknown>} msg
 * @returns {boolean} true if sent
 */
export function sendToUser(userId, msg) {
  const sockets = userSockets.get(userId);
  if (!sockets) return false;
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      sendJson(ws, msg);
      return true;
    }
  }
  return false;
}

/**
 * Broadcast a message to ALL connections of a user (multi-device).
 * @param {string} userId
 * @param {Record<string, unknown>} msg
 * @returns {number} number of connections reached
 */
export function broadcastToUser(userId, msg) {
  const sockets = userSockets.get(userId);
  if (!sockets) return 0;
  let count = 0;
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      sendJson(ws, msg);
      count++;
    }
  }
  return count;
}

/**
 * Broadcast to all connections subscribed to a given surface type.
 * @param {string} surface
 * @param {Record<string, unknown>} msg
 * @returns {number}
 */
export function broadcastToSurface(surface, msg) {
  let count = 0;
  for (const [ws, state] of clients) {
    if (ws.readyState === ws.OPEN && state.surfaces.includes(surface)) {
      sendJson(ws, msg);
      count++;
    }
  }
  return count;
}

/**
 * Get all connected user IDs (unique).
 * @returns {string[]}
 */
export function getConnectedUsers() {
  return [...userSockets.keys()];
}

/**
 * Get connection count for a user.
 * @param {string} userId
 * @returns {number}
 */
export function getUserConnectionCount(userId) {
  return userSockets.get(userId)?.size ?? 0;
}

/* ------------------------------------------------------------------ */
/*  Connection lifecycle                                              */
/* ------------------------------------------------------------------ */

/**
 * Register a new client connection.
 * @param {import('ws').WebSocket} ws
 * @param {Object} user
 * @param {string} user.id
 * @param {string} sessionToken
 */
function registerClient(ws, user, sessionToken) {
  /** @type {ClientState} */
  const state = {
    userId: user.id,
    sessionToken,
    connectedAt: Date.now(),
    surfaces: [],
    ws,
    alive: true,
  };
  clients.set(ws, state);

  if (!userSockets.has(user.id)) {
    userSockets.set(user.id, new Set());
  }
  userSockets.get(user.id).add(ws);
}

/**
 * Unregister a client connection.
 * @param {import('ws').WebSocket} ws
 */
function unregisterClient(ws) {
  const state = clients.get(ws);
  if (!state) return;

  clients.delete(ws);

  const socks = userSockets.get(state.userId);
  if (socks) {
    socks.delete(ws);
    if (socks.size === 0) {
      userSockets.delete(state.userId);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Message handlers                                                  */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} WsHandlerOpts
 * @property {Object}   auth            — auth module (validateSession)
 * @property {Function} [onChat]        — handler for chat messages: (userId, payload) => void
 * @property {Function} [onWidgetAction] — handler for widget actions: (userId, payload) => void
 */

/**
 * Handle an incoming parsed message from a client.
 * @param {import('ws').WebSocket} ws
 * @param {ClientState} state
 * @param {Record<string, unknown>} msg
 * @param {WsHandlerOpts} opts
 */
async function handleMessage(ws, state, msg, opts) {
  const { type } = msg;

  switch (type) {
    /* -- Keepalive -- */
    case 'ping': {
      sendJson(ws, { type: 'pong', ts: Date.now() });
      break;
    }

    /* -- Chat message -- */
    case 'chat': {
      if (typeof opts.onChat === 'function') {
        try {
          await opts.onChat(state.userId, msg, ws);
        } catch (err) {
          console.error('[ws] chat handler error:', err);
          sendJson(ws, { type: 'error', message: 'Failed to process chat message' });
        }
      } else {
        // Echo back as placeholder when no handler is wired
        sendJson(ws, {
          type: 'chat',
          from: 'system',
          text: 'Chat handler not configured',
          ts: Date.now(),
        });
      }
      break;
    }

    /* -- Widget action -- */
    case 'widget-action': {
      if (typeof opts.onWidgetAction === 'function') {
        try {
          await opts.onWidgetAction(state.userId, msg, ws);
        } catch (err) {
          console.error('[ws] widget-action handler error:', err);
          sendJson(ws, { type: 'error', message: 'Failed to process widget action' });
        }
      }
      break;
    }

    /* -- Surface subscription -- */
    case 'surface-subscribe': {
      const surface = msg.surface;
      if (typeof surface === 'string' && !state.surfaces.includes(surface)) {
        state.surfaces.push(surface);
        sendJson(ws, { type: 'surface-subscribed', surface });
      }
      break;
    }

    /* -- Surface unsubscribe -- */
    case 'surface-unsubscribe': {
      const idx = state.surfaces.indexOf(msg.surface);
      if (idx !== -1) {
        state.surfaces.splice(idx, 1);
        sendJson(ws, { type: 'surface-unsubscribed', surface: msg.surface });
      }
      break;
    }

    default: {
      sendJson(ws, { type: 'error', message: `Unknown message type: ${type}` });
    }
  }
}

/* ------------------------------------------------------------------ */
/*  WebSocket server setup                                            */
/* ------------------------------------------------------------------ */

/**
 * Create and attach a WebSocket handler to an HTTP server.
 *
 * @param {import('node:http').Server} server — existing HTTP server
 * @param {WsHandlerOpts} opts
 * @returns {{ wss: WebSocketServer, sendToUser: typeof sendToUser, broadcastToUser: typeof broadcastToUser, broadcastToSurface: typeof broadcastToSurface, getConnectedUsers: typeof getConnectedUsers }}
 */
export function createWsHandler(server, opts = {}) {
  const { auth } = opts;

  const wss = new WebSocketServer({ noServer: true });

  /* -- Upgrade handler (authentication) -- */
  server.on('upgrade', async (req, socket, head) => {
    // Only handle /ws path
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Extract token from query param or cookie
    let token = url.searchParams.get('token');
    if (!token) {
      const cookie = req.headers.cookie;
      if (cookie) {
        const match = cookie.match(/(?:^|;\s*)token=([^\s;]+)/);
        if (match) token = match[1];
      }
    }

    if (!token || !auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Validate the session
    let user;
    try {
      user = await auth.validateSession(token);
    } catch {
      user = null;
    }

    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Complete the WebSocket upgrade
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, user, token);
    });
  });

  /* -- Connection handler -- */
  wss.on('connection', (ws, _req, user, token) => {
    registerClient(ws, user, token);

    // Send welcome message
    sendJson(ws, {
      type: 'connected',
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      ts: Date.now(),
    });

    console.log(`[ws] Client connected: ${user.username} (${user.id}), total: ${clients.size}`);

    /* -- Keepalive pong tracking -- */
    const state = clients.get(ws);
    ws.on('pong', () => {
      if (state) state.alive = true;
    });

    /* -- Incoming messages -- */
    ws.on('message', async (raw) => {
      const currentState = clients.get(ws);
      if (!currentState) return;

      let msg;
      try {
        msg = JSON.parse(raw.toString('utf-8'));
      } catch {
        sendJson(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      if (!msg || typeof msg.type !== 'string') {
        sendJson(ws, { type: 'error', message: 'Message must have a "type" field' });
        return;
      }

      await handleMessage(ws, currentState, msg, opts);
    });

    /* -- Disconnect -- */
    ws.on('close', (code, reason) => {
      const st = clients.get(ws);
      const label = st ? `${st.userId}` : 'unknown';
      console.log(`[ws] Client disconnected: ${label} (code=${code}), total: ${clients.size - 1}`);
      unregisterClient(ws);
    });

    ws.on('error', (err) => {
      console.error('[ws] Socket error:', err.message);
      unregisterClient(ws);
    });
  });

  /* -- Keepalive interval (ping every 30s, terminate dead connections) -- */
  const keepaliveInterval = setInterval(() => {
    for (const [ws, state] of clients) {
      if (!state.alive) {
        console.log(`[ws] Terminating inactive connection: ${state.userId}`);
        ws.terminate();
        unregisterClient(ws);
        continue;
      }
      state.alive = false;
      ws.ping();
    }
  }, 30_000);

  // Clean up interval when WSS closes
  wss.on('close', () => {
    clearInterval(keepaliveInterval);
  });

  return {
    wss,
    sendToUser,
    broadcastToUser,
    broadcastToSurface,
    getConnectedUsers,
    getUserConnectionCount,
  };
}
