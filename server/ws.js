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
/*  Rate limiter — per-client message counter, resets every second    */
/* ------------------------------------------------------------------ */

const RATE_WARN_THRESHOLD = 20;
const RATE_DISCONNECT_THRESHOLD = 50;

/** @type {Map<import('ws').WebSocket, number>} */
const messageCounters = new Map();

setInterval(() => {
  messageCounters.clear();
}, 1_000).unref();  // .unref() so this timer doesn't prevent process exit (tests)

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
export function sendJson(ws, msg) {
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

/**
 * Get the first WebSocket connection for a user (for internal use).
 * Returns null if the user has no active connections.
 * @param {string} userId
 * @returns {import('ws').WebSocket|null}
 */
export function getWsForUser(userId) {
  const sockets = userSockets.get(userId);
  if (!sockets || sockets.size === 0) return null;
  // Return the first open socket
  for (const ws of sockets) {
    if (ws.readyState === 1) return ws;
  }
  return null;
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
 * @property {Function} [getAgents]     — agent state module (getAgent, listAgents)
 * @property {Object}   [mcpRegistry]   — McpRegistry instance for MCP tool calls
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
      if (typeof surface !== 'string' || surface.length === 0 || surface.length > 64 || !/^[a-zA-Z0-9-]+$/.test(surface)) {
        sendJson(ws, { type: 'error', message: 'Invalid surface: must be 1-64 alphanumeric/dash characters' });
        break;
      }
      if (!state.surfaces.includes(surface)) {
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

    /* -- Agent switching -- */
    case 'agent-switch': {
      const agentId = msg.agentId;
      if (!agentId || typeof agentId !== 'string') {
        sendJson(ws, { type: 'error', message: 'agentId is required' });
        break;
      }

      // Get agent module from opts
      const getAgentFn = opts.getAgents?.getAgent;
      if (!getAgentFn) {
        sendJson(ws, { type: 'error', message: 'Agent module not available' });
        break;
      }

      const agent = getAgentFn(agentId);
      if (!agent) {
        sendJson(ws, { type: 'error', message: 'Agent not found' });
        break;
      }

      // Check access: owner, admin, or enabled builtin
      if (agent.userId !== state.userId && !(agent.isBuiltin && agent.enabled)) {
        sendJson(ws, { type: 'error', message: 'Access denied' });
        break;
      }

      // Store active agent on session state
      state.activeAgentId = agentId;

      // Activate MCP servers if registry is available
      if (opts.mcpRegistry && agent.mcpServers && agent.mcpServers.length > 0) {
        try {
          await opts.mcpRegistry.activateAgent(agent);
        } catch (err) {
          console.error('[ws] MCP activation error:', err.message);
        }
      }

      sendJson(ws, { type: 'agent-switched', agent });

      // Broadcast to all connections of this user
      const otherSockets = userSockets.get(state.userId);
      if (otherSockets) {
        for (const otherWs of otherSockets) {
          if (otherWs !== ws && otherWs.readyState === otherWs.OPEN) {
            sendJson(otherWs, { type: 'agent-switched', agent });
          }
        }
      }
      break;
    }

    /* -- Tool event forwarding (for surface activation) -- */
    case 'tool_call':
    case 'tool_stream':
    case 'tool_result': {
      // Forward tool events to all connections of this user (multi-device)
      // These come from the agent backend and drive contextual surfaces
      broadcastToUser(state.userId, msg);
      break;
    }

    /* -- MCP tool call -- */
    case 'mcp-tool-call': {
      const { agentId: mcpAgentId, toolName, args: toolArgs } = msg;
      if (!mcpAgentId || !toolName) {
        sendJson(ws, { type: 'error', message: 'agentId and toolName are required' });
        break;
      }

      if (!opts.mcpRegistry) {
        sendJson(ws, { type: 'error', message: 'MCP registry not available' });
        break;
      }

      try {
        const result = await opts.mcpRegistry.callTool(mcpAgentId, toolName, toolArgs || {});
        sendJson(ws, { type: 'mcp-tool-result', toolName, result, requestId: msg.requestId });
      } catch (err) {
        sendJson(ws, { type: 'mcp-tool-error', toolName, error: err.message, requestId: msg.requestId });
      }
      break;
    }

    default: {
      console.warn(`[ws] Unknown message type ignored: ${type}`);
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

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  /** @type {Set<import('ws').WebSocket>} pending-auth connections */
  const pendingAuth = new Set();

  /* -- Upgrade handler (allow unauthenticated — auth happens in-band) -- */
  server.on('upgrade', async (req, socket, head) => {
    // Only handle /ws path
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Complete the WebSocket upgrade without authentication —
    // auth will happen as the first message (token-in-body).
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  /* -- Connection handler -- */
  wss.on('connection', (ws, _req) => {
    // Track as pending auth — must authenticate within 10 seconds
    pendingAuth.add(ws);
    const authTimeout = setTimeout(() => {
      if (pendingAuth.has(ws)) {
        console.log('[ws] Auth timeout — closing connection');
        pendingAuth.delete(ws);
        ws.close(4001, 'Auth timeout');
      }
    }, 10_000);

    /* -- Incoming messages -- */
    ws.on('message', async (raw) => {
      /* Rate limiting — tiered: warn at 20/sec, disconnect at 50/sec */
      const count = (messageCounters.get(ws) ?? 0) + 1;
      messageCounters.set(ws, count);
      if (count > RATE_DISCONNECT_THRESHOLD) {
        console.warn('[ws] Rate limit exceeded (>50/sec) — disconnecting client');
        ws.close(4008, 'Rate limit exceeded');
        return;
      }
      if (count > RATE_WARN_THRESHOLD) {
        sendJson(ws, { type: 'error', message: 'Slow down — too many messages per second' });
        return;
      }

      /* Message size limit — 64KB */
      if (raw.length > 65536) {
        sendJson(ws, { type: 'error', message: 'Message too large (max 64KB)' });
        return;
      }

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

      /* -- If still pending auth, expect auth message first -- */
      if (pendingAuth.has(ws)) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string') {
          sendJson(ws, { type: 'error', message: 'First message must be auth' });
          ws.close(4002, 'Auth required');
          pendingAuth.delete(ws);
          clearTimeout(authTimeout);
          return;
        }

        // Validate the session token
        let user;
        try {
          user = auth ? await auth.validateSession(msg.token) : null;
        } catch {
          user = null;
        }

        if (!user) {
          sendJson(ws, { type: 'error', message: 'Invalid token' });
          ws.close(4003, 'Invalid token');
          pendingAuth.delete(ws);
          clearTimeout(authTimeout);
          return;
        }

        // Auth succeeded — register client
        pendingAuth.delete(ws);
        clearTimeout(authTimeout);
        registerClient(ws, user, msg.token);

        // Send welcome message
        sendJson(ws, {
          type: 'connected',
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          ts: Date.now(),
        });

        console.log(`[ws] Client connected: ${user.username} (${user.id}), total: ${clients.size}`);

        // Notify server of new authenticated connection (canvas restore, etc.)
        if (typeof opts.onConnect === 'function') {
          try { await opts.onConnect(user.id, ws); } catch (err) {
            console.warn('[ws] onConnect error:', err.message);
          }
        }

        /* -- Keepalive pong tracking -- */
        const state = clients.get(ws);
        ws.on('pong', () => {
          if (state) state.alive = true;
        });

        return;
      }

      /* -- Authenticated message handling -- */
      const currentState = clients.get(ws);
      if (!currentState) return;

      /* 3-minute timeout wrapper (AI responses stream progressively, need longer) */
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('__timeout__')), 180_000),
      );
      try {
        await Promise.race([handleMessage(ws, currentState, msg, opts), timeout]);
      } catch (err) {
        if (err.message === '__timeout__') {
          sendJson(ws, { type: 'error', message: 'Request timed out (3m limit)' });
        } else {
          throw err;
        }
      }
    });

    /* -- Disconnect -- */
    ws.on('close', (code, reason) => {
      clearTimeout(authTimeout);
      pendingAuth.delete(ws);
      const st = clients.get(ws);
      const label = st ? `${st.userId}` : 'unknown';
      const nextTotal = st ? clients.size - 1 : clients.size;
      console.log(`[ws] Client disconnected: ${label} (code=${code}), total: ${nextTotal}`);
      unregisterClient(ws);
      messageCounters.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('[ws] Socket error:', err.message);
      clearTimeout(authTimeout);
      pendingAuth.delete(ws);
      unregisterClient(ws);
      messageCounters.delete(ws);
    });
  });

  /* -- Keepalive interval (ping every 30s, terminate after 2 missed pongs = 60s) -- */
  const keepaliveInterval = setInterval(() => {
    for (const [ws, state] of clients) {
      if (!state.alive) {
        state.missedPings = (state.missedPings || 0) + 1;
        if (state.missedPings >= 2) {
          console.log(`[ws] Terminating inactive connection (${state.missedPings} missed pings): ${state.userId}`);
          ws.terminate();
          unregisterClient(ws);
          continue;
        }
      } else {
        state.missedPings = 0;
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
