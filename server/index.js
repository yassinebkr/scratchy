/**
 * @module server/index
 * Scratchy v2 — Server entry point
 *
 * Creates the HTTP server, wires up the router and WebSocket handler,
 * initializes the database, and handles graceful shutdown.
 */

import { createServer } from 'node:http';
import { createRouter } from './router.js';
import { createWsHandler } from './ws.js';
import { McpRegistry } from '../lib/mcp-registry.js';

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

  /* -- HTTP server + router -- */
  const handler = createRouter({ auth, getDb, version: VERSION });
  const server = createServer(handler);

  /* -- WebSocket handler -- */
  const wsHandler = createWsHandler(server, {
    auth,
    getAgents: agentsModule,
    mcpRegistry,
    onChat: async (userId, msg, ws) => {
      // Placeholder — will be wired to agent proxy later
      console.log(`[chat] from ${userId}:`, msg.text ?? msg.content ?? '(empty)');
    },
    onWidgetAction: async (userId, msg, ws) => {
      console.log(`[widget] from ${userId}:`, msg.action ?? '(unknown)');
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
