/**
 * @module test/phase2d
 * Tests for Phase 2d: MCP Client, MCP Registry, Agent Switching WS, Setup Wizard API.
 * Uses Node.js built-in test runner (node:test + node:assert).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

import { McpClient } from '../lib/mcp-client.js';
import { McpRegistry } from '../lib/mcp-registry.js';
import { getDb, initSchema } from '../state/db.js';
import { init as initUsers, createUser } from '../state/users.js';
import { init as initSessions, createSession } from '../state/sessions.js';
import { init as initAgents, createAgent, getAgent } from '../state/agents.js';
import { init as initAdminConfig, set as setConfig, get as getConfig } from '../state/admin-config.js';
import { init as initPreferences } from '../state/preferences.js';
import { createRouter } from '../server/router.js';
import { createWsHandler } from '../server/ws.js';
import * as auth from '../server/auth.js';
import * as agentsModule from '../state/agents.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function tmpDbPath() {
  return path.join(os.tmpdir(), `scratchy-phase2d-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
}

const MOCK_MCP_SERVER = path.resolve(__dirname, 'fixtures', 'mock-mcp-server.mjs');

/** Helper to make HTTP requests. */
async function request(baseUrl, method, urlPath, opts = {}) {
  const url = `${baseUrl}${urlPath}`;
  const headers = { ...opts.headers };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  let bodyStr;
  if (opts.body !== undefined) {
    bodyStr = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(bodyStr);
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        let json;
        try { json = JSON.parse(body); } catch { json = body; }
        resolve({ status: res.statusCode, headers: res.headers, body: json, raw: body });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** Create a test server with WS handler. */
async function createTestServer(db, opts = {}) {
  initUsers(db);
  initSessions(db);
  initAgents(db);
  initAdminConfig(db);
  initPreferences(db);

  const mcpRegistry = opts.mcpRegistry || new McpRegistry();

  const handler = createRouter({ auth, getDb: () => db, mcpRegistry });
  const server = http.createServer(handler);

  const wsHandler = createWsHandler(server, {
    auth,
    getAgents: agentsModule,
    mcpRegistry,
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      const wsUrl = `ws://127.0.0.1:${port}/ws`;
      resolve({
        server,
        baseUrl,
        wsUrl,
        wsHandler,
        mcpRegistry,
        close: () => new Promise((res) => {
          wsHandler.wss.close(() => {
            server.close(res);
          });
        }),
      });
    });
  });
}

/** Connect an authenticated WS client. Returns { ws, messages[] } */
async function connectAuthWs(wsUrl, token, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), timeoutMs);
    const ws = new WebSocket(wsUrl);
    const messages = [];

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      if (msg.type === 'connected') {
        clearTimeout(timer);
        resolve({ ws, messages });
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Wait for a message of a given type on a WS messages array. */
function waitForMessage(ws, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

/* ================================================================== */
/*  MCP Client Tests                                                  */
/* ================================================================== */

describe('MCP Client', () => {
  it('should connect, list tools, and call a tool', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await client.connect();
    assert.ok(client.connected);

    const tools = await client.listTools();
    assert.ok(Array.isArray(tools));
    assert.equal(tools.length, 4);
    assert.equal(tools[0].name, 'echo');
    assert.equal(tools[1].name, 'add');

    // Call echo tool
    const echoResult = await client.callTool('echo', { text: 'hello' });
    assert.ok(echoResult.content);
    assert.equal(echoResult.content[0].text, 'hello');

    // Call add tool
    const addResult = await client.callTool('add', { a: 3, b: 7 });
    assert.equal(addResult.content[0].text, '10');

    await client.disconnect();
    assert.ok(!client.connected);
  });

  it('should handle disconnect gracefully', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await client.connect();
    assert.ok(client.connected);

    await client.disconnect();
    assert.ok(!client.connected);

    // Calling after disconnect should throw
    await assert.rejects(() => client.listTools(), /Not connected/);
  });

  it('should reject when connecting to invalid command', async () => {
    const client = new McpClient({
      command: 'nonexistent-command-that-does-not-exist-xyz',
      timeout: 2000,
    });

    await assert.rejects(() => client.connect(), /MCP/);
  });

  it('should handle process crash (SIGKILL the child)', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await client.connect();
    assert.ok(client.connected);

    // Kill the child process externally
    client._process.kill('SIGKILL');

    // Wait a moment for the exit event
    await new Promise(r => setTimeout(r, 200));

    // Client should no longer be connected
    assert.ok(!client.connected);
  });
});

/* ================================================================== */
/*  MCP Client — Enhanced Tests                                       */
/* ================================================================== */

describe('MCP Client — Enhanced', () => {
  it('should track PID of child process', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    assert.equal(client.pid, null);

    await client.connect();
    assert.ok(client.pid > 0, `Expected positive PID, got ${client.pid}`);

    const pid = client.pid;
    await client.disconnect();
    assert.equal(client.pid, null);
  });

  it('should use monotonic message IDs', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await client.connect();
    // After connect, _nextId should be at least 2 (1 used for initialize)
    assert.ok(client._nextId >= 2, `Expected _nextId >= 2, got ${client._nextId}`);

    const idBefore = client._nextId;
    await client.listTools();
    assert.ok(client._nextId > idBefore, 'Message ID should be monotonically increasing');

    const idAfter = client._nextId;
    await client.callTool('echo', { text: 'test' });
    assert.ok(client._nextId > idAfter, 'Message ID continues to increase');

    await client.disconnect();
  });

  it('should timeout on slow tool call', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 500, // Short timeout for testing
    });

    await client.connect();

    // The 'slow' tool never responds — should timeout
    await assert.rejects(
      () => client.callTool('slow', {}),
      /timeout/i
    );

    await client.disconnect();
  });

  it('should handle JSON-RPC error from tool', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await client.connect();

    // error-tool always returns a JSON-RPC error
    await assert.rejects(
      () => client.callTool('error-tool', { message: 'test failure' }),
      /test failure/
    );

    await client.disconnect();
  });

  it('should reject double connect', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await client.connect();
    await assert.rejects(() => client.connect(), /Already connected/);
    await client.disconnect();
  });

  it('should reject listTools and callTool when not connected', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await assert.rejects(() => client.listTools(), /Not connected/);
    await assert.rejects(() => client.callTool('echo', {}), /Not connected/);
  });

  it('should fire onExit callback when process exits', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    let exitCalled = false;
    let exitCode = null;
    client.onExit = (code, signal) => {
      exitCalled = true;
      exitCode = code;
    };

    await client.connect();
    client._process.kill('SIGTERM');

    await new Promise(r => setTimeout(r, 300));
    assert.ok(exitCalled, 'onExit should have been called');
  });

  it('should fire onError callback on process error', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await client.connect();

    let errorCalled = false;
    client.onError = (err) => {
      errorCalled = true;
    };

    // Simulate a process error by emitting 'error' on the child process
    client._process.emit('error', new Error('test error'));

    assert.ok(errorCalled, 'onError should have been called');
    await client.disconnect();
  });

  it('should auto-reconnect on unexpected exit when reconnect is enabled', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
      reconnect: true,
      maxRetries: 2,
      reconnectBaseDelay: 100,
    });

    let reconnected = false;
    client.onReconnect = () => { reconnected = true; };

    await client.connect();
    assert.ok(client.connected);

    // Kill the child process to trigger auto-reconnect
    client._process.kill('SIGKILL');

    // Wait for reconnect (100ms * 2^0 = 100ms delay + connect time)
    await new Promise(r => setTimeout(r, 1500));

    assert.ok(reconnected, 'onReconnect should have been called');
    assert.ok(client.connected, 'Client should be reconnected');

    await client.disconnect();
  });

  it('should not auto-reconnect on intentional disconnect', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
      reconnect: true,
      maxRetries: 2,
      reconnectBaseDelay: 50,
    });

    let reconnected = false;
    client.onReconnect = () => { reconnected = true; };

    await client.connect();
    await client.disconnect();

    await new Promise(r => setTimeout(r, 500));
    assert.ok(!reconnected, 'Should not reconnect after intentional disconnect');
    assert.ok(!client.connected);
  });

  it('should fire onReconnectFailed after max retries', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
      reconnect: true,
      maxRetries: 1,
      reconnectBaseDelay: 50,
    });

    await client.connect();

    let reconnectFailed = false;
    client.onReconnectFailed = () => { reconnectFailed = true; };

    // Replace the command with something that will fail to reconnect
    client._command = 'nonexistent-command-xyz';
    client._process.kill('SIGKILL');

    // Wait for reconnect attempt to fail
    await new Promise(r => setTimeout(r, 2000));

    assert.ok(reconnectFailed, 'onReconnectFailed should have been called');
    assert.ok(!client.connected);
  });

  it('should handle multiple tool calls in sequence', async () => {
    const client = new McpClient({
      command: `node ${MOCK_MCP_SERVER}`,
      timeout: 5000,
    });

    await client.connect();

    for (let i = 0; i < 10; i++) {
      const result = await client.callTool('add', { a: i, b: i });
      assert.equal(result.content[0].text, String(i + i));
    }

    await client.disconnect();
  });
});

/* ================================================================== */
/*  MCP Registry Tests                                                */
/* ================================================================== */

describe('MCP Registry', () => {
  it('should activate/deactivate agent with MCP servers', async () => {
    const registry = new McpRegistry();

    const agentConfig = {
      id: 'test-agent-1',
      mcpServers: [
        { command: `node ${MOCK_MCP_SERVER}` },
      ],
    };

    const result = await registry.activateAgent(agentConfig);
    assert.equal(result.agentId, 'test-agent-1');
    assert.ok(result.tools.length >= 2);
    assert.ok(registry.isActive('test-agent-1'));

    // Check available tools
    const tools = registry.getAvailableTools('test-agent-1');
    assert.ok(tools.some(t => t.name === 'echo'));
    assert.ok(tools.some(t => t.name === 'add'));

    // Call tool through registry
    const echoResult = await registry.callTool('test-agent-1', 'echo', { text: 'registry test' });
    assert.equal(echoResult.content[0].text, 'registry test');

    // Deactivate
    await registry.deactivateAgent('test-agent-1');
    assert.ok(!registry.isActive('test-agent-1'));
    assert.equal(registry.getAvailableTools('test-agent-1').length, 0);
  });

  it('should handle agent with no MCP servers', async () => {
    const registry = new McpRegistry();

    const result = await registry.activateAgent({ id: 'no-mcp', mcpServers: [] });
    assert.equal(result.tools.length, 0);
    assert.ok(registry.isActive('no-mcp'));
    assert.equal(registry.getAvailableTools('no-mcp').length, 0);

    await registry.deactivateAgent('no-mcp');
  });

  it('should throw when calling tool on inactive agent', async () => {
    const registry = new McpRegistry();
    await assert.rejects(
      () => registry.callTool('nonexistent', 'echo', {}),
      /No active MCP servers/
    );
  });

  it('should throw when calling unknown tool', async () => {
    const registry = new McpRegistry();
    await registry.activateAgent({
      id: 'test-agent-2',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    await assert.rejects(
      () => registry.callTool('test-agent-2', 'nonexistent-tool', {}),
      /not found/
    );

    await registry.deactivateAgent('test-agent-2');
  });

  it('should shut down all agents', async () => {
    const registry = new McpRegistry();

    await registry.activateAgent({
      id: 'agent-a',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });
    await registry.activateAgent({
      id: 'agent-b',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    assert.ok(registry.isActive('agent-a'));
    assert.ok(registry.isActive('agent-b'));

    await registry.shutdownAll();

    assert.ok(!registry.isActive('agent-a'));
    assert.ok(!registry.isActive('agent-b'));
  });
});

/* ================================================================== */
/*  MCP Registry — Enhanced Tests                                     */
/* ================================================================== */

describe('MCP Registry — Enhanced', () => {
  it('should track PIDs of MCP server processes', async () => {
    const registry = new McpRegistry();

    await registry.activateAgent({
      id: 'pid-agent',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    const pids = registry.getPids('pid-agent');
    assert.equal(pids.length, 1);
    assert.ok(pids[0] > 0, `Expected positive PID, got ${pids[0]}`);

    await registry.deactivateAgent('pid-agent');
  });

  it('should support startForAgent/stopForAgent aliases', async () => {
    const registry = new McpRegistry();

    const result = await registry.startForAgent({
      id: 'alias-agent',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    assert.equal(result.agentId, 'alias-agent');
    assert.ok(registry.isActive('alias-agent'));

    await registry.stopForAgent('alias-agent');
    assert.ok(!registry.isActive('alias-agent'));
  });

  it('should support getTools alias', async () => {
    const registry = new McpRegistry();

    await registry.activateAgent({
      id: 'tools-alias-agent',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    const tools = registry.getTools('tools-alias-agent');
    assert.ok(tools.length >= 2);
    assert.ok(tools.some(t => t.name === 'echo'));

    await registry.deactivateAgent('tools-alias-agent');
  });

  it('should support stopAll alias', async () => {
    const registry = new McpRegistry();

    await registry.activateAgent({
      id: 'stop-all-a',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    assert.ok(registry.isActive('stop-all-a'));
    await registry.stopAll();
    assert.ok(!registry.isActive('stop-all-a'));
  });

  it('should enforce concurrency guard on double activation', async () => {
    const registry = new McpRegistry();

    // Start a slow activation
    const p1 = registry.activateAgent({
      id: 'concurrent-agent',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    // Immediately try a second activation — should reject
    await assert.rejects(
      () => registry.activateAgent({
        id: 'concurrent-agent',
        mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
      }),
      /already being activated/
    );

    // Wait for first to complete
    await p1;
    assert.ok(registry.isActive('concurrent-agent'));

    await registry.deactivateAgent('concurrent-agent');
  });

  it('should handle re-activation (deactivate then activate)', async () => {
    const registry = new McpRegistry();

    // First activation
    await registry.activateAgent({
      id: 'reactivate-agent',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    const pids1 = registry.getPids('reactivate-agent');

    // Re-activate (should deactivate first, then activate)
    await registry.activateAgent({
      id: 'reactivate-agent',
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });

    const pids2 = registry.getPids('reactivate-agent');
    assert.ok(registry.isActive('reactivate-agent'));
    // PIDs should be different (new process)
    assert.notDeepEqual(pids1, pids2);

    await registry.deactivateAgent('reactivate-agent');
  });

  it('should return empty PIDs for inactive agent', () => {
    const registry = new McpRegistry();
    const pids = registry.getPids('nonexistent');
    assert.deepEqual(pids, []);
  });

  it('should return empty tools for inactive agent', () => {
    const registry = new McpRegistry();
    const tools = registry.getAvailableTools('nonexistent');
    assert.deepEqual(tools, []);
  });

  it('should handle multiple MCP servers per agent', async () => {
    const registry = new McpRegistry();

    await registry.activateAgent({
      id: 'multi-server-agent',
      mcpServers: [
        { command: `node ${MOCK_MCP_SERVER}` },
        { command: `node ${MOCK_MCP_SERVER}` },
      ],
    });

    const pids = registry.getPids('multi-server-agent');
    assert.equal(pids.length, 2);
    assert.ok(pids[0] > 0);
    assert.ok(pids[1] > 0);

    const tools = registry.getAvailableTools('multi-server-agent');
    // Both servers expose the same tools (echo, add, slow, error-tool) = 8 total
    assert.equal(tools.length, 8);

    await registry.deactivateAgent('multi-server-agent');
  });

  it('should route callTool to correct server', async () => {
    const registry = new McpRegistry();

    await registry.activateAgent({
      id: 'route-agent',
      mcpServers: [
        { command: `node ${MOCK_MCP_SERVER}` },
      ],
    });

    // echo is on the mock server
    const result = await registry.callTool('route-agent', 'echo', { text: 'routed' });
    assert.equal(result.content[0].text, 'routed');

    // add is also on the mock server
    const addResult = await registry.callTool('route-agent', 'add', { a: 5, b: 3 });
    assert.equal(addResult.content[0].text, '8');

    await registry.deactivateAgent('route-agent');
  });
});

/* ================================================================== */
/*  Agent Switching WS Tests                                          */
/* ================================================================== */

describe('Agent Switching (WebSocket)', () => {
  let dbPath, db, testServer, adminToken, agentId;

  before(async () => {
    dbPath = tmpDbPath();
    db = getDb(dbPath);
    initSchema(db);
    testServer = await createTestServer(db);

    // Create an admin user with a session
    const adminUser = createUser('admin-ws', 'hash_admin', { role: 'admin', displayName: 'Admin' });
    adminToken = crypto.randomBytes(32).toString('hex');
    createSession(adminUser.id, adminToken);

    // Create a test agent
    const agent = createAgent('Test Agent', {
      model: 'sonnet',
      userId: adminUser.id,
      enabled: true,
    });
    agentId = agent.id;
  });

  after(async () => {
    await testServer.mcpRegistry.shutdownAll();
    await testServer.close();
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('should switch agent via WS and receive agent-switched', async () => {
    const { ws, messages } = await connectAuthWs(testServer.wsUrl, adminToken);

    // Send agent switch
    const switchPromise = waitForMessage(ws, 'agent-switched');
    ws.send(JSON.stringify({ type: 'agent-switch', agentId }));

    const msg = await switchPromise;
    assert.equal(msg.type, 'agent-switched');
    assert.ok(msg.agent);
    assert.equal(msg.agent.id, agentId);
    assert.equal(msg.agent.name, 'Test Agent');

    ws.close();
  });

  it('should return error for unknown agent', async () => {
    const { ws } = await connectAuthWs(testServer.wsUrl, adminToken);

    const errorPromise = waitForMessage(ws, 'error');
    ws.send(JSON.stringify({ type: 'agent-switch', agentId: 'nonexistent-id' }));

    const msg = await errorPromise;
    assert.equal(msg.type, 'error');
    assert.ok(msg.message.includes('not found'));

    ws.close();
  });

  it('should return error for missing agentId', async () => {
    const { ws } = await connectAuthWs(testServer.wsUrl, adminToken);

    const errorPromise = waitForMessage(ws, 'error');
    ws.send(JSON.stringify({ type: 'agent-switch' }));

    const msg = await errorPromise;
    assert.equal(msg.type, 'error');
    assert.ok(msg.message.includes('agentId'));

    ws.close();
  });
});

/* ================================================================== */
/*  Setup Wizard API Tests                                            */
/* ================================================================== */

describe('Setup Wizard API', () => {
  let dbPath, db, testServer, adminToken;

  before(async () => {
    dbPath = tmpDbPath();
    db = getDb(dbPath);
    initSchema(db);
    testServer = await createTestServer(db);

    // Create an admin user with a session
    const adminUser = createUser('wizard-admin', 'hash_admin', { role: 'admin', displayName: 'WizAdmin' });
    adminToken = crypto.randomBytes(32).toString('hex');
    createSession(adminUser.id, adminToken);
  });

  after(async () => {
    await testServer.close();
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('should return setup status as incomplete initially', async () => {
    const res = await request(testServer.baseUrl, 'GET', '/api/setup/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.complete, false);
    assert.equal(res.body.totalSteps, 5);
  });

  it('should complete setup', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/setup/complete', {
      token: adminToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.complete, true);
  });

  it('should return setup status as complete after completion', async () => {
    const res = await request(testServer.baseUrl, 'GET', '/api/setup/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.complete, true);
  });

  it('should require admin for POST /api/setup/complete', async () => {
    // Create a non-admin user with session
    const normalUser = createUser('wizard-user', 'hash_user', { role: 'user' });
    const normalToken = crypto.randomBytes(32).toString('hex');
    createSession(normalUser.id, normalToken);

    const res = await request(testServer.baseUrl, 'POST', '/api/setup/complete', {
      token: normalToken,
    });
    assert.equal(res.status, 403);
  });
});

/* ================================================================== */
/*  MCP Router Endpoint Tests                                         */
/* ================================================================== */

describe('MCP Router Endpoints', () => {
  let dbPath, db, testServer, adminToken, normalToken, agentId, agentWithMcp;

  before(async () => {
    dbPath = tmpDbPath();
    db = getDb(dbPath);
    initSchema(db);
    testServer = await createTestServer(db);

    // Create admin user
    const adminUser = createUser('mcp-admin', 'hash_admin', { role: 'admin', displayName: 'Admin' });
    adminToken = crypto.randomBytes(32).toString('hex');
    createSession(adminUser.id, adminToken);

    // Create normal user
    const normalUser = createUser('mcp-user', 'hash_user', { role: 'user', displayName: 'User' });
    normalToken = crypto.randomBytes(32).toString('hex');
    createSession(normalUser.id, normalToken);

    // Create agent with MCP servers configured
    agentWithMcp = createAgent('MCP Agent', {
      model: 'sonnet',
      userId: adminUser.id,
      enabled: true,
      mcpServers: [{ command: `node ${MOCK_MCP_SERVER}` }],
    });
    agentId = agentWithMcp.id;
  });

  after(async () => {
    await testServer.mcpRegistry.shutdownAll();
    await testServer.close();
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('POST /api/agents/:id/mcp/start — should start MCP servers (admin)', async () => {
    const res = await request(testServer.baseUrl, 'POST', `/api/agents/${agentId}/mcp/start`, {
      token: adminToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.agentId, agentId);
    assert.ok(Array.isArray(res.body.tools));
    assert.ok(res.body.tools.length >= 2);
    assert.ok(res.body.tools.some(t => t.name === 'echo'));
    assert.ok(Array.isArray(res.body.pids));
    assert.ok(res.body.pids[0] > 0);
  });

  it('POST /api/agents/:id/mcp/start — should require admin', async () => {
    const res = await request(testServer.baseUrl, 'POST', `/api/agents/${agentId}/mcp/start`, {
      token: normalToken,
    });
    assert.equal(res.status, 403);
  });

  it('POST /api/agents/:id/mcp/start — should require auth', async () => {
    const res = await request(testServer.baseUrl, 'POST', `/api/agents/${agentId}/mcp/start`);
    assert.equal(res.status, 401);
  });

  it('POST /api/agents/:id/mcp/start — should 404 for unknown agent', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/agents/nonexistent-id/mcp/start', {
      token: adminToken,
    });
    assert.equal(res.status, 404);
  });

  it('GET /api/agents/:id/mcp/tools — should list tools (authenticated user)', async () => {
    // Ensure MCP is started first
    await request(testServer.baseUrl, 'POST', `/api/agents/${agentId}/mcp/start`, {
      token: adminToken,
    });

    const res = await request(testServer.baseUrl, 'GET', `/api/agents/${agentId}/mcp/tools`, {
      token: adminToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.agentId, agentId);
    assert.equal(res.body.active, true);
    assert.ok(Array.isArray(res.body.tools));
    assert.ok(res.body.tools.length >= 2);
  });

  it('GET /api/agents/:id/mcp/tools — should require auth', async () => {
    const res = await request(testServer.baseUrl, 'GET', `/api/agents/${agentId}/mcp/tools`);
    assert.equal(res.status, 401);
  });

  it('GET /api/agents/:id/mcp/tools — should 404 for unknown agent', async () => {
    const res = await request(testServer.baseUrl, 'GET', '/api/agents/nonexistent-id/mcp/tools', {
      token: adminToken,
    });
    assert.equal(res.status, 404);
  });

  it('GET /api/agents/:id/mcp/tools — non-owner non-admin should get 403', async () => {
    const res = await request(testServer.baseUrl, 'GET', `/api/agents/${agentId}/mcp/tools`, {
      token: normalToken,
    });
    assert.equal(res.status, 403);
  });

  it('POST /api/agents/:id/mcp/stop — should stop MCP servers (admin)', async () => {
    // First start
    await request(testServer.baseUrl, 'POST', `/api/agents/${agentId}/mcp/start`, {
      token: adminToken,
    });

    // Verify active
    assert.ok(testServer.mcpRegistry.isActive(agentId));

    // Stop
    const res = await request(testServer.baseUrl, 'POST', `/api/agents/${agentId}/mcp/stop`, {
      token: adminToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.agentId, agentId);

    // Verify inactive
    assert.ok(!testServer.mcpRegistry.isActive(agentId));
  });

  it('POST /api/agents/:id/mcp/stop — should require admin', async () => {
    const res = await request(testServer.baseUrl, 'POST', `/api/agents/${agentId}/mcp/stop`, {
      token: normalToken,
    });
    assert.equal(res.status, 403);
  });

  it('POST /api/agents/:id/mcp/stop — should 404 for unknown agent', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/agents/nonexistent-id/mcp/stop', {
      token: adminToken,
    });
    assert.equal(res.status, 404);
  });

  it('GET /api/agents/:id/mcp/tools — should show inactive state after stop', async () => {
    // Ensure stopped
    await request(testServer.baseUrl, 'POST', `/api/agents/${agentId}/mcp/stop`, {
      token: adminToken,
    });

    const res = await request(testServer.baseUrl, 'GET', `/api/agents/${agentId}/mcp/tools`, {
      token: adminToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.active, false);
    assert.deepEqual(res.body.tools, []);
  });
});

/* ================================================================== */
/*  Setup Wizard Integration Tests                                    */
/* ================================================================== */

describe('Setup Wizard Integration', () => {
  let dbPath, db, testServer, adminToken, adminUser, normalToken, normalUser;

  before(async () => {
    dbPath = tmpDbPath();
    db = getDb(dbPath);
    initSchema(db);
    testServer = await createTestServer(db);

    adminUser = createUser('wiz-integ-admin', 'hash_admin', { role: 'admin', displayName: 'WizIntegAdmin' });
    adminToken = crypto.randomBytes(32).toString('hex');
    createSession(adminUser.id, adminToken);

    normalUser = createUser('wiz-integ-user', 'hash_user', { role: 'user', displayName: 'WizUser' });
    normalToken = crypto.randomBytes(32).toString('hex');
    createSession(normalUser.id, normalToken);
  });

  after(async () => {
    await testServer.close();
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  /* ── Step progression logic ── */
  it('should start with incomplete status and 5 total steps', async () => {
    const res = await request(testServer.baseUrl, 'GET', '/api/setup/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.complete, false);
    assert.equal(res.body.totalSteps, 5);
    assert.ok(typeof res.body.currentStep === 'number');
  });

  it('should track step progression via admin config', async () => {
    const before = await request(testServer.baseUrl, 'GET', '/api/setup/status');
    assert.ok(before.body.currentStep >= 1);
  });

  /* ── Locale selection persists to preferences ── */
  it('should persist locale fr via preferences API', async () => {
    const res = await request(testServer.baseUrl, 'PUT', '/api/users/me/preferences', {
      token: adminToken,
      body: { locale: 'fr' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.locale, 'fr');

    // Verify persistence
    const get = await request(testServer.baseUrl, 'GET', '/api/users/me/preferences', {
      token: adminToken,
    });
    assert.equal(get.status, 200);
    assert.equal(get.body.locale, 'fr');
  });

  it('should persist locale en after changing back', async () => {
    const res = await request(testServer.baseUrl, 'PUT', '/api/users/me/preferences', {
      token: adminToken,
      body: { locale: 'en' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.locale, 'en');
  });

  /* ── Theme persistence ── */
  it('should persist theme selection via preferences API', async () => {
    const res = await request(testServer.baseUrl, 'PUT', '/api/users/me/preferences', {
      token: adminToken,
      body: { theme: 'dark' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.theme, 'dark');
  });

  it('should persist auto/system theme', async () => {
    const res = await request(testServer.baseUrl, 'PUT', '/api/users/me/preferences', {
      token: adminToken,
      body: { theme: 'system' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.theme, 'system');
  });

  /* ── BYOK API key storage ── */
  it('should store openai API key via BYOK endpoint (or 503 without enc key)', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/users/me/apikeys', {
      token: adminToken,
      body: { provider: 'openai', key: 'sk-test-1234567890' },
    });
    assert.ok(res.status === 201 || res.status === 503,
      `Expected 201 or 503, got ${res.status}`);
  });

  it('should handle missing provider gracefully (400 or 503)', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/users/me/apikeys', {
      token: adminToken,
      body: { key: 'sk-test' },
    });
    // 503 when ENCRYPTION_KEY missing (checked first), 400 otherwise
    assert.ok(res.status === 400 || res.status === 503,
      `Expected 400 or 503, got ${res.status}`);
  });

  it('should handle missing key gracefully (400 or 503)', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/users/me/apikeys', {
      token: adminToken,
      body: { provider: 'openai' },
    });
    assert.ok(res.status === 400 || res.status === 503,
      `Expected 400 or 503, got ${res.status}`);
  });

  it('should store anthropic key via BYOK endpoint', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/users/me/apikeys', {
      token: adminToken,
      body: { provider: 'anthropic', key: 'sk-ant-test-abcdef' },
    });
    assert.ok(res.status === 201 || res.status === 503);
    if (res.status === 201) {
      assert.equal(res.body.provider, 'anthropic');
    }
  });

  it('should store google key via BYOK endpoint', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/users/me/apikeys', {
      token: adminToken,
      body: { provider: 'google', key: 'AIza-test-key-google' },
    });
    assert.ok(res.status === 201 || res.status === 503);
  });

  /* ── Required vs optional step enforcement ── */
  it('should allow non-admin to save preferences (steps 1-2 data)', async () => {
    const res = await request(testServer.baseUrl, 'PUT', '/api/users/me/preferences', {
      token: normalToken,
      body: { locale: 'en', theme: 'light' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.locale, 'en');
    assert.equal(res.body.theme, 'light');
  });

  it('should block non-admin from completing setup (admin-only gate)', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/setup/complete', {
      token: normalToken,
    });
    assert.equal(res.status, 403);
  });

  /* ── Onboarding complete flag ── */
  it('should mark onboarding complete in user preferences', async () => {
    const res = await request(testServer.baseUrl, 'PUT', '/api/users/me/preferences', {
      token: adminToken,
      body: { onboardingComplete: true },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.onboardingComplete, true);
  });

  /* ── Completion prevents wizard from showing again ── */
  it('should mark setup complete via admin endpoint', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/setup/complete', {
      token: adminToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.complete, true);
  });

  it('should return complete=true (wizard should not show again)', async () => {
    const res = await request(testServer.baseUrl, 'GET', '/api/setup/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.complete, true);
  });

  it('should persist complete state across multiple status checks', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(testServer.baseUrl, 'GET', '/api/setup/status');
      assert.equal(res.body.complete, true, `Check ${i + 1} should still be complete`);
    }
  });

  /* ── Step data collection ── */
  it('should accept all preference fields together', async () => {
    const res = await request(testServer.baseUrl, 'PUT', '/api/users/me/preferences', {
      token: normalToken,
      body: {
        locale: 'fr',
        theme: 'dark',
        onboardingComplete: true,
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.locale, 'fr');
    assert.equal(res.body.theme, 'dark');
    assert.equal(res.body.onboardingComplete, true);
  });

  /* ── Auth enforcement ── */
  it('should require authentication for API key storage', async () => {
    const res = await request(testServer.baseUrl, 'POST', '/api/users/me/apikeys', {
      body: { provider: 'openai', key: 'sk-noauth' },
    });
    assert.equal(res.status, 401);
  });

  it('should require authentication for preferences update', async () => {
    const res = await request(testServer.baseUrl, 'PUT', '/api/users/me/preferences', {
      body: { locale: 'en' },
    });
    assert.equal(res.status, 401);
  });

  /* ── Setup status is public ── */
  it('should allow unauthenticated access to setup status', async () => {
    const res = await request(testServer.baseUrl, 'GET', '/api/setup/status');
    assert.equal(res.status, 200);
    assert.ok('complete' in res.body);
    assert.ok('totalSteps' in res.body);
  });
});
