/**
 * @module server/index
 * Scratchy v2 — Server entry point
 *
 * Creates the HTTP server, wires up the router and WebSocket handler,
 * initializes the database, and handles graceful shutdown.
 */

import 'dotenv/config';
import { createServer } from 'node:http';
import { createRouter } from './router.js';
import { createWsHandler, broadcastToUser } from './ws.js';
import { initWidgets, destroyWidgets } from './widgets.js';
import { McpRegistry } from '../lib/mcp-registry.js';
import { init as initChat, handleChat, shutdown as shutdownChat } from './chat-handler.js';
import { init as initOrchestrator, routeMessage, routeTeamChat, shutdown as shutdownOrchestrator } from './agent-orchestrator.js';
import { createSurfaceEventHandler } from './surface-events.js';
import { seedAgents } from './seed-agents.js';
import { seedTeams } from './seed-teams.js';
import * as canvasState from '../state/canvas.js';
import * as teamsState from '../state/teams.js';
import * as workspacesState from '../state/workspaces.js';

/** Default port — v2 runs on 3002 (v1 is on 3001) */
const PORT = parseInt(process.env.PORT ?? '3002', 10);
const VERSION = '2.0.0-alpha.1';

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                         */
/* ------------------------------------------------------------------ */

async function main() {
  /* -- Database -- */
  let db = null;
  let getDb = () => db;
  try {
    const dbMod = await import('../state/db.js');
    if (typeof dbMod.getDb === 'function') {
      const dataDir = new URL('../data', import.meta.url).pathname;
      const { mkdirSync } = await import('node:fs');
      mkdirSync(dataDir, { recursive: true });
      db = dbMod.getDb(dataDir + '/scratchy.db');
      getDb = () => db;
    }
    if (typeof dbMod.initSchema === 'function' && db) {
      dbMod.initSchema(db);
    }
    console.log('[server] Database initialized');

    /* -- Usage tracker -- */
    try {
      const { initUsageTracker } = await import('../lib/usage-tracker.js');
      initUsageTracker(db);
      console.log('[server] Usage tracker initialized');
    } catch (err) {
      console.warn('[server] Usage tracker init failed:', err.message);
    }

    /* -- BYOK manager -- */
    try {
      const { initBYOK } = await import('../lib/byok.js');
      initBYOK(db);
      console.log('[server] BYOK manager initialized');
    } catch (err) {
      console.warn('[server] BYOK manager init failed:', err.message);
    }

    /* -- Stripe schema -- */
    try {
      const { ensureStripeSchema } = await import('../lib/stripe.js');
      ensureStripeSchema(db);
      console.log('[server] Stripe schema ready');
    } catch (err) {
      console.warn('[server] Stripe schema init failed:', err.message);
    }

    /* -- Teams state -- */
    teamsState.init(db);
    console.log('[server] Teams state initialized');

    /* -- Seed default agents -- */
    seedAgents(db);

    /* -- Seed default teams (Backend Dev + Frontend) -- */
    seedTeams(db);
  } catch (err) {
    console.warn('[server] Database module not available, running without DB:', err.message);
  }

  /* -- Auth module -- */
  let auth = null;
  try {
    auth = await import('./auth.js');
    console.log('[server] Auth module loaded');
  } catch (err) {
    console.warn('[server] Auth module not available, running without auth:', err.message);
  }

  /* -- MCP Registry -- */
  const mcpRegistry = new McpRegistry();

  /* -- Agent module for WS handler -- */
  let agentsModule = null;
  try {
    agentsModule = await import('../state/agents.js');
  } catch (err) {
    console.warn('[server] Agents module not available:', err.message);
  }

  /* -- Chat handler (NullClaw backend) -- */
  if (db) {
    initChat(db);
    console.log('[server] Chat handler initialized (NullClaw backend)');
  } else {
    console.warn('[server] Chat handler not initialized (missing DB)');
  }

  /* -- Agent orchestrator -- */
  if (db) {
    initOrchestrator(db, mcpRegistry);
    console.log('[server] Agent orchestrator initialized');
  } else {
    console.warn('[server] Agent orchestrator not initialized (missing DB)');
  }

  /* -- Surface events -- */
  const surfaceHandler = createSurfaceEventHandler();
  console.log('[server] Surface event handler initialized');

  /* -- Widget system -- */
  let handleWidgetAction = async (userId, msg, ws) => {
    console.log(`[widget] from ${userId}:`, msg.action ?? '(unknown)');
  };
  if (db) {
    handleWidgetAction = await initWidgets(db, broadcastToUser, {});
    console.log('[server] Widget system initialized');
  } else {
    console.warn('[server] Widget system not initialized (missing DB)');
  }

  /* -- HTTP server + router -- */
  const handler = createRouter({ auth, getDb, version: VERSION });
  const server = createServer(handler);

  /* -- Canvas state -- */
  if (db) {
    canvasState.init(db);
    workspacesState.init(db);
    console.log('[server] Canvas + workspace state persistence initialized');
  }

  /* -- WebSocket handler -- */
  const wsHandler = createWsHandler(server, {
    auth,
    getAgents: agentsModule,
    mcpRegistry,
    onChat: async (userId, msg, ws) => {
      // Team routing: if msg has teamId, route through team pipeline
      console.log(`[chat] userId=${userId} teamId=${msg.teamId || 'none'} agentId=${msg.agentId || 'default'} text=${(msg.text || '').slice(0, 60)}`);
      if (msg.teamId) {
        await routeTeamChat(userId, msg.teamId, msg, ws);
      } else {
        // Single-agent: route through orchestrator (resolves default agent when agentId is null)
        await routeMessage(userId, msg.agentId || null, msg, ws);
      }
    },
    surfaceHandler,
    onWidgetAction: handleWidgetAction,
    // Restore canvas state when a client connects
    onConnect: async (userId, ws) => {
      if (!db) return;
      const { sendJson } = await import('./ws.js');

      // Restore canvas state
      const ops = canvasState.getCanvasState(userId);
      if (ops && ops.length > 0) {
        sendJson(ws, { type: 'canvas-ops', ops, restored: true, ts: Date.now() });
      }

      // Send active workspace info (if any)
      const activeWs = workspacesState.getActiveWorkspace(userId);
      if (activeWs) {
        sendJson(ws, { type: 'workspace-active', workspace: activeWs, ts: Date.now() });
      }
    },
  });

  /* -- Start listening -- */
  server.listen(PORT, () => {
    console.log(`Scratchy v2 listening on port ${PORT}`);
    console.log(`  Health: http://localhost:${PORT}/api/health`);
    console.log(`  WS:     ws://localhost:${PORT}/ws`);
  });

  /* -- Graceful shutdown -- */
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} received — shutting down gracefully...`);

    // Shut down chat handler + orchestrator (NullClaw adapter pools)
    shutdownChat().catch(() => {}).then(() => {
      console.log('[server] Chat handler shut down');
    });
    shutdownOrchestrator().catch(() => {}).then(() => {
      console.log('[server] Agent orchestrator shut down');
    });

    // Shut down widgets
    destroyWidgets().catch(() => {}).then(() => {
      console.log('[server] Widgets shut down');
    });

    // Shut down MCP servers
    mcpRegistry.shutdownAll().catch(() => {}).then(() => {
      console.log('[server] MCP servers shut down');
    });

    // Close WebSocket server (terminates all connections)
    wsHandler.wss.close(() => {
      console.log('[server] WebSocket server closed');
    });

    // Close HTTP server (stop accepting new connections)
    server.close(() => {
      console.log('[server] HTTP server closed');

      // Close database
      try {
        const currentDb = getDb();
        if (currentDb && typeof currentDb.close === 'function') {
          currentDb.close();
          console.log('[server] Database closed');
        }
      } catch {
        // ignore
      }

      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      console.error('[server] Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/* -- Run -- */
main().catch((err) => {
  console.error('[server] Fatal error during startup:', err);
  process.exit(1);
});
