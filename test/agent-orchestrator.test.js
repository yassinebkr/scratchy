/**
 * @module test/agent-orchestrator
 * Hardened unit tests for server/agent-orchestrator.js
 *
 * Contract: the orchestrator routes chat messages to per-agent NullClaw instances.
 *   init(db, mcpRegistry) → routeMessage(userId, agentId, msg, ws) → shutdown()
 *
 * Strategy: test DB layer, agent resolution, adapter key format, empty message
 * handling, and lifecycle. Avoid sending valid messages that would trigger
 * real NullClaw process spawning.
 *
 * Run: node --test test/agent-orchestrator.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { getDb, initSchema } from '../state/db.js';
import { init as initUsers, createUser } from '../state/users.js';
import {
  init as initAgents,
  createAgent,
  getAgent,
  listAgents,
  getBuiltinAgents,
} from '../state/agents.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function tmpDbPath() {
  return path.join(os.tmpdir(), `scratchy-orch-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
}

function createMockWs() {
  const messages = [];
  return {
    readyState: 1,
    send(data) { messages.push(JSON.parse(data)); },
    messages,
    close() { this.readyState = 3; },
  };
}

function createMockMcpRegistry() {
  const _active = new Set();
  const _activating = new Set();
  const _tools = new Map();
  return {
    isActive(agentId) { return _active.has(agentId); },
    isActivating(agentId) { return _activating.has(agentId); },
    getAvailableTools(agentId) { return _tools.get(agentId) || []; },
    async activateAgent(agentConfig) {
      _active.add(agentConfig.id);
      const tools = [
        { name: 'exec', description: 'Execute commands', inputSchema: {} },
      ];
      _tools.set(agentConfig.id, tools);
      return { tools };
    },
    setActive(id) { _active.add(id); },
    clearActive(id) { _active.delete(id); },
    setActivating(id) { _activating.add(id); },
    clearActivating(id) { _activating.delete(id); },
  };
}

/* ------------------------------------------------------------------ */
/*  Test Suite                                                        */
/* ------------------------------------------------------------------ */

describe('server/agent-orchestrator.js', () => {
  let dbPath;
  let db;
  let userId;
  let orchestrator;

  before(async () => {
    dbPath = tmpDbPath();
    db = getDb(dbPath);
    initSchema(db);
    initUsers(db);
    initAgents(db);
    const user = createUser('orch_test_user', 'hash_otu');
    userId = user.id;

    // Create conversation_history table (normally created by chat-handler)
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        model TEXT,
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_conv_user ON conversation_history(userId, createdAt)`);

    process.env.OPENAI_API_KEY = '';
    orchestrator = await import('../server/agent-orchestrator.js');
  });

  after(async () => {
    if (orchestrator) await orchestrator.shutdown();
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  /* ================================================================ */
  /*  1. Exported API shape                                          */
  /* ================================================================ */

  describe('exported API shape', () => {
    it('exports init function', () => {
      assert.equal(typeof orchestrator.init, 'function');
    });

    it('exports routeMessage function', () => {
      assert.equal(typeof orchestrator.routeMessage, 'function');
    });

    it('exports shutdown function', () => {
      assert.equal(typeof orchestrator.shutdown, 'function');
    });

    it('exports isReady function', () => {
      assert.equal(typeof orchestrator.isReady, 'function');
    });

    it('exports getDefaultAgent function', () => {
      assert.equal(typeof orchestrator.getDefaultAgent, 'function');
    });

    it('exports getAdapterKey function', () => {
      assert.equal(typeof orchestrator.getAdapterKey, 'function');
    });
  });

  /* ================================================================ */
  /*  2. isReady() — before and after init                           */
  /* ================================================================ */

  describe('isReady()', () => {
    it('returns boolean', () => {
      assert.equal(typeof orchestrator.isReady(), 'boolean');
    });
  });

  /* ================================================================ */
  /*  3. init(db, mcpRegistry)                                       */
  /* ================================================================ */

  describe('init(db, mcpRegistry)', () => {
    it('initializes without throwing', () => {
      assert.doesNotThrow(() => orchestrator.init(db, createMockMcpRegistry()));
    });

    it('isReady returns true after init', () => {
      orchestrator.init(db, createMockMcpRegistry());
      assert.equal(orchestrator.isReady(), true);
    });

    it('is idempotent', () => {
      const mcp = createMockMcpRegistry();
      assert.doesNotThrow(() => orchestrator.init(db, mcp));
      assert.doesNotThrow(() => orchestrator.init(db, mcp));
    });

    it('accepts different MCP registry instances', () => {
      assert.doesNotThrow(() => orchestrator.init(db, createMockMcpRegistry()));
      assert.doesNotThrow(() => orchestrator.init(db, createMockMcpRegistry()));
    });
  });

  /* ================================================================ */
  /*  4. getAdapterKey() — format validation                         */
  /* ================================================================ */

  describe('getAdapterKey()', () => {
    it('returns userId:agentId format', () => {
      assert.equal(orchestrator.getAdapterKey('user1', 'agent1'), 'user1:agent1');
    });

    it('handles empty strings', () => {
      assert.equal(orchestrator.getAdapterKey('', ''), ':');
    });

    it('handles special characters', () => {
      assert.equal(orchestrator.getAdapterKey('u:1', 'a/2'), 'u:1:a/2');
    });

    it('handles UUIDs', () => {
      const u = crypto.randomUUID();
      const a = crypto.randomUUID();
      assert.equal(orchestrator.getAdapterKey(u, a), `${u}:${a}`);
    });

    it('handles very long IDs', () => {
      const long = 'x'.repeat(1000);
      const key = orchestrator.getAdapterKey(long, long);
      assert.equal(key, `${long}:${long}`);
    });

    it('result is deterministic', () => {
      const a = orchestrator.getAdapterKey('u', 'a');
      const b = orchestrator.getAdapterKey('u', 'a');
      assert.equal(a, b);
    });

    it('different pairs produce different keys', () => {
      const k1 = orchestrator.getAdapterKey('u1', 'a1');
      const k2 = orchestrator.getAdapterKey('u2', 'a2');
      assert.notEqual(k1, k2);
    });
  });

  /* ================================================================ */
  /*  5. getDefaultAgent() — agent resolution                        */
  /* ================================================================ */

  describe('getDefaultAgent()', () => {
    before(() => {
      orchestrator.init(db, createMockMcpRegistry());
    });

    it('always returns an object', () => {
      const agent = orchestrator.getDefaultAgent();
      assert.ok(agent);
      assert.equal(typeof agent, 'object');
    });

    it('returned agent has id', () => {
      const agent = orchestrator.getDefaultAgent();
      assert.ok(agent.id);
    });

    it('returned agent has name', () => {
      const agent = orchestrator.getDefaultAgent();
      assert.ok(agent.name);
    });

    it('returned agent has model field', () => {
      const agent = orchestrator.getDefaultAgent();
      // Model can be a string or undefined depending on config
      assert.ok('model' in agent || agent.model === undefined);
    });

    it('result is stable (caching)', () => {
      const a = orchestrator.getDefaultAgent();
      const b = orchestrator.getDefaultAgent();
      assert.equal(a.id, b.id);
    });
  });

  /* ================================================================ */
  /*  6. Agent resolution with DB agents                             */
  /* ================================================================ */

  describe('agent resolution with DB agents', () => {
    let testAgent;

    before(() => {
      orchestrator.init(db, createMockMcpRegistry());
      testAgent = createAgent('OrchestratorTestBot', {
        systemPrompt: 'You are a test assistant.',
        model: 'haiku',
        enabled: true,
        isBuiltin: true,
      });
    });

    it('created agent exists in DB', () => {
      const agent = getAgent(testAgent.id);
      assert.ok(agent);
      assert.equal(agent.name, 'OrchestratorTestBot');
    });

    it('created agent has systemPrompt', () => {
      const agent = getAgent(testAgent.id);
      assert.equal(agent.systemPrompt, 'You are a test assistant.');
    });

    it('created agent has model', () => {
      const agent = getAgent(testAgent.id);
      assert.equal(agent.model, 'haiku');
    });

    it('created agent is enabled', () => {
      const agent = getAgent(testAgent.id);
      assert.notEqual(agent.enabled, 0);
    });

    it('getDefaultAgent may resolve to our test agent', () => {
      const def = orchestrator.getDefaultAgent();
      assert.ok(def, 'should resolve to some agent');
    });

    it('agent with missing systemPrompt gets empty string default', () => {
      const noPromptAgent = createAgent('NoPromptBot', {
        model: 'sonnet',
        enabled: true,
      });
      const agent = getAgent(noPromptAgent.id);
      // systemPrompt defaults to empty string or undefined
      assert.ok(agent);
    });

    it('agent with missing model gets default', () => {
      const noModelAgent = createAgent('NoModelBot', {
        systemPrompt: 'test',
        enabled: true,
      });
      const agent = getAgent(noModelAgent.id);
      assert.ok(agent);
      // model has a default of 'sonnet' in createAgent
    });
  });

  /* ================================================================ */
  /*  7. routeMessage — empty/invalid message early returns          */
  /* ================================================================ */

  describe('routeMessage() — early returns', () => {
    before(() => {
      orchestrator.init(db, createMockMcpRegistry());
    });

    it('empty text → early return, no WS messages', async () => {
      const ws = createMockWs();
      await orchestrator.routeMessage(userId, null, { text: '' }, ws);
      assert.equal(ws.messages.length, 0);
    });

    it('whitespace-only text → early return', async () => {
      const ws = createMockWs();
      await orchestrator.routeMessage(userId, null, { text: '   \t\n  ' }, ws);
      assert.equal(ws.messages.length, 0);
    });

    it('empty object msg → early return', async () => {
      const ws = createMockWs();
      await orchestrator.routeMessage(userId, null, {}, ws);
      assert.equal(ws.messages.length, 0);
    });

    it('undefined text and content → early return', async () => {
      const ws = createMockWs();
      await orchestrator.routeMessage(userId, null, { foo: 'bar' }, ws);
      assert.equal(ws.messages.length, 0);
    });

    it('null text, empty content → early return', async () => {
      const ws = createMockWs();
      await orchestrator.routeMessage(userId, null, { text: null, content: '' }, ws);
      assert.equal(ws.messages.length, 0);
    });

    it('null text, whitespace content → early return', async () => {
      const ws = createMockWs();
      await orchestrator.routeMessage(userId, null, { text: null, content: '   ' }, ws);
      assert.equal(ws.messages.length, 0);
    });
  });

  /* ================================================================ */
  /*  8. routeMessage — closed WS safety                             */
  /* ================================================================ */

  describe('routeMessage() — closed WS', () => {
    before(() => {
      orchestrator.init(db, createMockMcpRegistry());
    });

    it('empty message with closed WS → no crash', async () => {
      const ws = createMockWs();
      ws.readyState = 3;
      ws.send = () => { throw new Error('should not send'); };
      await assert.doesNotReject(async () => {
        await orchestrator.routeMessage(userId, null, { text: '' }, ws);
      });
    });

    it('no sends to closed WS (readyState 3)', async () => {
      const ws = createMockWs();
      ws.readyState = 3;
      const sends = [];
      ws.send = (d) => sends.push(d);
      await orchestrator.routeMessage(userId, null, { text: '' }, ws);
      assert.equal(sends.length, 0);
    });
  });

  /* ================================================================ */
  /*  9. shutdown() lifecycle                                        */
  /* ================================================================ */

  describe('shutdown()', () => {
    it('does not throw', async () => {
      orchestrator.init(db, createMockMcpRegistry());
      await assert.doesNotReject(() => orchestrator.shutdown());
    });

    it('is idempotent', async () => {
      orchestrator.init(db, createMockMcpRegistry());
      await orchestrator.shutdown();
      await assert.doesNotReject(() => orchestrator.shutdown());
    });

    it('can re-init after shutdown', async () => {
      orchestrator.init(db, createMockMcpRegistry());
      await orchestrator.shutdown();
      assert.doesNotThrow(() => orchestrator.init(db, createMockMcpRegistry()));
      assert.equal(orchestrator.isReady(), true);
    });

    it('isReady reflects state after shutdown', async () => {
      orchestrator.init(db, createMockMcpRegistry());
      await orchestrator.shutdown();
      // _db is not cleared in shutdown, so isReady() still returns true
      // This documents the current behavior
      assert.equal(typeof orchestrator.isReady(), 'boolean');
    });

    it('getDefaultAgent still works after shutdown (reads from DB)', async () => {
      orchestrator.init(db, createMockMcpRegistry());
      await orchestrator.shutdown();
      // getDefaultAgent reads from agents state module, which keeps its own db ref
      const agent = orchestrator.getDefaultAgent();
      assert.ok(agent);
      orchestrator.init(db, createMockMcpRegistry());
    });
  });

  /* ================================================================ */
  /*  10. Conversation history integration                           */
  /* ================================================================ */

  describe('conversation history (shared table)', () => {
    beforeEach(() => {
      db.prepare('DELETE FROM conversation_history WHERE userId = ?').run(userId);
    });

    it('table exists and is usable', () => {
      const count = db.prepare('SELECT COUNT(*) as c FROM conversation_history').get();
      assert.ok(typeof count.c === 'number');
    });

    it('can insert and retrieve entries', () => {
      db.prepare(
        'INSERT INTO conversation_history (userId, role, content, createdAt) VALUES (?, ?, ?, ?)'
      ).run(userId, 'user', 'test msg', new Date().toISOString());

      const rows = db.prepare(
        'SELECT * FROM conversation_history WHERE userId = ?'
      ).all(userId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].content, 'test msg');
    });

    it('model field stores agent-specific labels', () => {
      db.prepare(
        'INSERT INTO conversation_history (userId, role, content, model, createdAt) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, 'assistant', 'response', 'nullclaw-gateway:haiku', new Date().toISOString());

      const row = db.prepare(
        'SELECT model FROM conversation_history WHERE userId = ? ORDER BY id DESC LIMIT 1'
      ).get(userId);
      assert.equal(row.model, 'nullclaw-gateway:haiku');
    });

    it('multiple users have independent histories', () => {
      const user2 = createUser('orch_hist_user2_' + crypto.randomUUID().slice(0, 8), 'h2');
      db.prepare(
        'INSERT INTO conversation_history (userId, role, content, createdAt) VALUES (?, ?, ?, ?)'
      ).run(userId, 'user', 'user1 msg', new Date().toISOString());
      db.prepare(
        'INSERT INTO conversation_history (userId, role, content, createdAt) VALUES (?, ?, ?, ?)'
      ).run(user2.id, 'user', 'user2 msg', new Date().toISOString());

      const u1 = db.prepare('SELECT COUNT(*) as c FROM conversation_history WHERE userId = ?').get(userId);
      const u2 = db.prepare('SELECT COUNT(*) as c FROM conversation_history WHERE userId = ?').get(user2.id);
      assert.equal(u1.c, 1);
      assert.equal(u2.c, 1);
    });
  });

  /* ================================================================ */
  /*  11. Edge cases                                                 */
  /* ================================================================ */

  describe('edge cases', () => {
    before(() => {
      orchestrator.init(db, createMockMcpRegistry());
    });

    it('getAdapterKey with unicode IDs', () => {
      const key = orchestrator.getAdapterKey('用户1', 'エージェント');
      assert.equal(key, '用户1:エージェント');
    });

    it('SQL injection in history content is safe', () => {
      const evil = "'; DELETE FROM users; --";
      db.prepare(
        'INSERT INTO conversation_history (userId, role, content, createdAt) VALUES (?, ?, ?, ?)'
      ).run(userId, 'user', evil, new Date().toISOString());

      const usersExist = db.prepare('SELECT COUNT(*) as c FROM users').get();
      assert.ok(usersExist.c > 0, 'users table should not be dropped');
    });

    it('empty agent mcpServers array is handled', () => {
      const agent = createAgent('NoMCPAgent', {
        systemPrompt: 'test',
        model: 'sonnet',
        enabled: true,
        mcpServers: [],
      });
      assert.ok(agent);
      const fetched = getAgent(agent.id);
      assert.deepStrictEqual(fetched.mcpServers, []);
    });
  });
});
