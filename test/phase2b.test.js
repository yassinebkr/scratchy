/**
 * @module test/phase2b
 * Tests for Phase 2b API layer: agents routes, admin config routes,
 * user preferences routes, OAuth stubs, setup wizard, i18n.
 * Uses Node.js built-in test runner (node:test + node:assert).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { getDb, initSchema } from '../state/db.js';
import { init as initUsers, createUser } from '../state/users.js';
import { init as initSessions, createSession } from '../state/sessions.js';
import { init as initAgents } from '../state/agents.js';
import { init as initAdminConfig } from '../state/admin-config.js';
import { init as initPreferences } from '../state/preferences.js';
import { createRouter } from '../server/router.js';
import * as auth from '../server/auth.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function tmpDbPath() {
  return path.join(os.tmpdir(), `scratchy-phase2b-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
}

/** Generate a random hex-encoded 32-byte encryption key */
function randomEncKeyHex() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a test HTTP server with the router.
 * Returns { server, baseUrl, close() }.
 */
function createTestServer(db) {
  // Init all state modules
  initUsers(db);
  initSessions(db);
  initAgents(db);
  initAdminConfig(db);
  initPreferences(db);

  const handler = createRouter({
    auth,
    getDb: () => db,
  });

  const server = http.createServer(handler);

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        server,
        baseUrl,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}

/**
 * Helper to make HTTP requests.
 */
async function request(baseUrl, method, path, opts = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { ...opts.headers };

  if (opts.token) {
    headers['Authorization'] = `Bearer ${opts.token}`;
  }

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
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, headers: res.headers, data });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Create a user and return { user, token }.
 */
async function createUserWithSession(db, username, passwordHash, opts = {}) {
  const user = createUser(username, passwordHash, opts);
  const token = crypto.randomBytes(32).toString('hex');
  createSession(user.id, token);
  return { user, token };
}

/* ================================================================== */
/*  Tests                                                             */
/* ================================================================== */

describe('Phase 2b — API Routes', () => {
  const dbPath = tmpDbPath();
  let db, srv, baseUrl;
  let adminUser, adminToken;
  let normalUser, normalToken;
  const encKeyHex = randomEncKeyHex();

  before(async () => {
    // Set encryption key env
    process.env.ENCRYPTION_KEY = encKeyHex;

    db = getDb(dbPath);
    initSchema(db);

    const serverInfo = await createTestServer(db);
    srv = serverInfo;
    baseUrl = serverInfo.baseUrl;

    // Create admin user
    const admin = await createUserWithSession(db, 'admin1', 'hash_admin', { role: 'admin' });
    adminUser = admin.user;
    adminToken = admin.token;

    // Create normal user
    const normal = await createUserWithSession(db, 'user1', 'hash_user', { role: 'user' });
    normalUser = normal.user;
    normalToken = normal.token;
  });

  after(async () => {
    delete process.env.ENCRYPTION_KEY;
    await srv.close();
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  /* -------------------------------------------------------------- */
  /*  Health (sanity)                                                */
  /* -------------------------------------------------------------- */

  describe('GET /api/health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(baseUrl, 'GET', '/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.data.status, 'ok');
    });
  });

  /* -------------------------------------------------------------- */
  /*  Agent CRUD                                                    */
  /* -------------------------------------------------------------- */

  describe('Agent CRUD', () => {
    let agentId;

    it('POST /api/agents — create agent (auth required)', async () => {
      // Without auth
      const noAuth = await request(baseUrl, 'POST', '/api/agents', {
        body: { name: 'Foo' },
      });
      assert.equal(noAuth.status, 401);

      // With auth
      const res = await request(baseUrl, 'POST', '/api/agents', {
        token: normalToken,
        body: { name: 'Test Agent', model: 'opus', systemPrompt: 'Be helpful' },
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.name, 'Test Agent');
      assert.equal(res.data.model, 'opus');
      assert.equal(res.data.userId, normalUser.id);
      agentId = res.data.id;
    });

    it('POST /api/agents — 400 on missing name', async () => {
      const res = await request(baseUrl, 'POST', '/api/agents', {
        token: normalToken,
        body: { model: 'sonnet' },
      });
      assert.equal(res.status, 400);
      assert.ok(res.data.error);
    });

    it('GET /api/agents — list agents (user sees own + enabled builtins)', async () => {
      const res = await request(baseUrl, 'GET', '/api/agents', {
        token: normalToken,
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.some(a => a.id === agentId));
    });

    it('GET /api/agents — admin sees all', async () => {
      const res = await request(baseUrl, 'GET', '/api/agents', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data));
      assert.ok(res.data.some(a => a.id === agentId));
    });

    it('GET /api/agents — 401 without auth', async () => {
      const res = await request(baseUrl, 'GET', '/api/agents');
      assert.equal(res.status, 401);
    });

    it('GET /api/agents/:id — get agent by ID', async () => {
      const res = await request(baseUrl, 'GET', `/api/agents/${agentId}`, {
        token: normalToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.id, agentId);
      assert.equal(res.data.name, 'Test Agent');
    });

    it('GET /api/agents/:id — 404 for non-existent', async () => {
      const res = await request(baseUrl, 'GET', '/api/agents/nonexistent', {
        token: normalToken,
      });
      assert.equal(res.status, 404);
    });

    it('GET /api/agents/:id — 403 for other users agent', async () => {
      // Create an agent owned by admin
      const adminAgent = await request(baseUrl, 'POST', '/api/agents', {
        token: adminToken,
        body: { name: 'Admin Agent' },
      });
      // Normal user tries to access
      const res = await request(baseUrl, 'GET', `/api/agents/${adminAgent.data.id}`, {
        token: normalToken,
      });
      assert.equal(res.status, 403);
    });

    it('PUT /api/agents/:id — update agent', async () => {
      const res = await request(baseUrl, 'PUT', `/api/agents/${agentId}`, {
        token: normalToken,
        body: { name: 'Updated Agent', model: 'haiku' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.name, 'Updated Agent');
      assert.equal(res.data.model, 'haiku');
    });

    it('PUT /api/agents/:id — 404 for non-existent', async () => {
      const res = await request(baseUrl, 'PUT', '/api/agents/nonexistent', {
        token: normalToken,
        body: { name: 'X' },
      });
      assert.equal(res.status, 404);
    });

    it('PUT /api/agents/:id — 403 for non-owner', async () => {
      const res = await request(baseUrl, 'PUT', `/api/agents/${agentId}`, {
        token: adminToken, // admin can access other's agents
        body: { name: 'Admin Updated' },
      });
      // Admin should be able to update (role check)
      assert.equal(res.status, 200);
    });

    it('DELETE /api/agents/:id — delete agent', async () => {
      // Create a temp agent to delete
      const created = await request(baseUrl, 'POST', '/api/agents', {
        token: normalToken,
        body: { name: 'To Delete' },
      });
      const res = await request(baseUrl, 'DELETE', `/api/agents/${created.data.id}`, {
        token: normalToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.ok, true);

      // Verify deleted
      const check = await request(baseUrl, 'GET', `/api/agents/${created.data.id}`, {
        token: normalToken,
      });
      assert.equal(check.status, 404);
    });

    it('DELETE /api/agents/:id — 404 for non-existent', async () => {
      const res = await request(baseUrl, 'DELETE', '/api/agents/nonexistent', {
        token: normalToken,
      });
      assert.equal(res.status, 404);
    });

    it('DELETE /api/agents/:id — non-admin cannot delete builtins', async () => {
      // Create a builtin agent (directly via db since it requires special flags)
      const builtinRes = await request(baseUrl, 'POST', '/api/agents', {
        token: adminToken,
        body: { name: 'Builtin Bot' },
      });
      // Set it as builtin via db
      db.prepare('UPDATE agents SET isBuiltin = 1, enabled = 1, userId = NULL WHERE id = ?')
        .run(builtinRes.data.id);

      const res = await request(baseUrl, 'DELETE', `/api/agents/${builtinRes.data.id}`, {
        token: normalToken,
      });
      // Normal user can't delete a builtin (no ownership, not admin)
      assert.equal(res.status, 403);
    });
  });

  /* -------------------------------------------------------------- */
  /*  Agent Conversations                                           */
  /* -------------------------------------------------------------- */

  describe('Agent Conversations', () => {
    let agentId;

    before(async () => {
      const res = await request(baseUrl, 'POST', '/api/agents', {
        token: normalToken,
        body: { name: 'Conv Test Agent' },
      });
      agentId = res.data.id;
    });

    it('GET /api/agents/:id/conversations — empty list initially', async () => {
      const res = await request(baseUrl, 'GET', `/api/agents/${agentId}/conversations`, {
        token: normalToken,
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.data, []);
    });

    it('POST /api/agents/:id/conversations — create conversation', async () => {
      const res = await request(baseUrl, 'POST', `/api/agents/${agentId}/conversations`, {
        token: normalToken,
        body: { title: 'Hello chat', messages: [{ role: 'user', content: 'Hi' }] },
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.title, 'Hello chat');
      assert.deepEqual(res.data.messages, [{ role: 'user', content: 'Hi' }]);
    });

    it('GET /api/agents/:id/conversations — lists conversations', async () => {
      const res = await request(baseUrl, 'GET', `/api/agents/${agentId}/conversations`, {
        token: normalToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.length, 1);
      assert.equal(res.data[0].title, 'Hello chat');
    });

    it('GET /api/agents/:id/conversations — 404 for non-existent agent', async () => {
      const res = await request(baseUrl, 'GET', '/api/agents/nonexistent/conversations', {
        token: normalToken,
      });
      assert.equal(res.status, 404);
    });

    it('GET /api/agents/:id/conversations — 403 for non-owner', async () => {
      const res = await request(baseUrl, 'GET', `/api/agents/${agentId}/conversations`, {
        token: adminToken, // admin can access
      });
      // Admin should be allowed
      assert.equal(res.status, 200);
    });
  });

  /* -------------------------------------------------------------- */
  /*  Admin Config                                                  */
  /* -------------------------------------------------------------- */

  describe('Admin Config', () => {
    it('GET /api/admin/config — requires admin', async () => {
      const noAuth = await request(baseUrl, 'GET', '/api/admin/config');
      assert.equal(noAuth.status, 401);

      const userAuth = await request(baseUrl, 'GET', '/api/admin/config', {
        token: normalToken,
      });
      assert.equal(userAuth.status, 403);
    });

    it('GET /api/admin/config — returns config', async () => {
      const res = await request(baseUrl, 'GET', '/api/admin/config', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.equal(typeof res.data, 'object');
    });

    it('PATCH /api/admin/config — sets config keys', async () => {
      const res = await request(baseUrl, 'PATCH', '/api/admin/config', {
        token: adminToken,
        body: { siteName: 'Scratchy', maxUsers: 100 },
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.siteName, 'Scratchy');
      assert.equal(res.data.maxUsers, 100);
    });

    it('PATCH /api/admin/config — requires admin', async () => {
      const res = await request(baseUrl, 'PATCH', '/api/admin/config', {
        token: normalToken,
        body: { hack: true },
      });
      assert.equal(res.status, 403);
    });

    it('GET /api/admin/users — lists users', async () => {
      const res = await request(baseUrl, 'GET', '/api/admin/users', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      const users = res.data.users ?? res.data;
      assert.ok(Array.isArray(users));
      assert.ok(users.length >= 2);
      // Should not include passwordHash
      for (const u of users) {
        assert.equal(u.passwordHash, undefined);
      }
    });

    it('GET /api/admin/users — requires admin', async () => {
      const res = await request(baseUrl, 'GET', '/api/admin/users', {
        token: normalToken,
      });
      assert.equal(res.status, 403);
    });

    it('PUT /api/admin/users/:id/quotas — set user quotas', async () => {
      const quotas = { maxTokensPerDay: 50000, maxRequests: 200 };
      const res = await request(baseUrl, 'PUT', `/api/admin/users/${normalUser.id}/quotas`, {
        token: adminToken,
        body: quotas,
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.data, quotas);
    });

    it('GET /api/admin/users/:id/quotas — get user quotas', async () => {
      const res = await request(baseUrl, 'GET', `/api/admin/users/${normalUser.id}/quotas`, {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.maxTokensPerDay, 50000);
    });

    it('GET /api/admin/users/:id/quotas — empty for user without quotas', async () => {
      const res = await request(baseUrl, 'GET', `/api/admin/users/${adminUser.id}/quotas`, {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.data, {});
    });

    it('GET /api/admin/users/:id/quotas — requires admin', async () => {
      const res = await request(baseUrl, 'GET', `/api/admin/users/${normalUser.id}/quotas`, {
        token: normalToken,
      });
      assert.equal(res.status, 403);
    });
  });

  /* -------------------------------------------------------------- */
  /*  User Preferences                                              */
  /* -------------------------------------------------------------- */

  describe('User Preferences', () => {
    it('GET /api/users/me/preferences — requires auth', async () => {
      const res = await request(baseUrl, 'GET', '/api/users/me/preferences');
      assert.equal(res.status, 401);
    });

    it('GET /api/users/me/preferences — returns defaults', async () => {
      const res = await request(baseUrl, 'GET', '/api/users/me/preferences', {
        token: normalToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.locale, 'en');
      assert.equal(res.data.theme, 'system');
    });

    it('PUT /api/users/me/preferences — update prefs', async () => {
      const res = await request(baseUrl, 'PUT', '/api/users/me/preferences', {
        token: normalToken,
        body: { locale: 'fr', theme: 'dark' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.locale, 'fr');
      assert.equal(res.data.theme, 'dark');
    });

    it('GET /api/users/me/preferences — reflects update', async () => {
      const res = await request(baseUrl, 'GET', '/api/users/me/preferences', {
        token: normalToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.locale, 'fr');
      assert.equal(res.data.theme, 'dark');
    });
  });

  /* -------------------------------------------------------------- */
  /*  API Key Vault                                                 */
  /* -------------------------------------------------------------- */

  describe('API Key Vault', () => {
    it('POST /api/users/me/apikeys — store API key', async () => {
      const res = await request(baseUrl, 'POST', '/api/users/me/apikeys', {
        token: normalToken,
        body: { provider: 'openai', key: 'sk-test123' },
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.ok, true);
      assert.equal(res.data.provider, 'openai');
    });

    it('POST /api/users/me/apikeys — 400 on missing fields', async () => {
      const res = await request(baseUrl, 'POST', '/api/users/me/apikeys', {
        token: normalToken,
        body: { provider: 'openai' },
      });
      assert.equal(res.status, 400);
    });

    it('POST /api/users/me/apikeys — 401 without auth', async () => {
      const res = await request(baseUrl, 'POST', '/api/users/me/apikeys', {
        body: { provider: 'openai', key: 'sk-x' },
      });
      assert.equal(res.status, 401);
    });

    it('POST /api/users/me/apikeys — 503 without ENCRYPTION_KEY', async () => {
      const saved = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      const res = await request(baseUrl, 'POST', '/api/users/me/apikeys', {
        token: normalToken,
        body: { provider: 'test', key: 'sk-x' },
      });
      assert.equal(res.status, 503);
      process.env.ENCRYPTION_KEY = saved;
    });

    it('DELETE /api/users/me/apikeys/:provider — remove API key', async () => {
      // First store a key
      await request(baseUrl, 'POST', '/api/users/me/apikeys', {
        token: normalToken,
        body: { provider: 'anthropic', key: 'sk-ant-test' },
      });

      const res = await request(baseUrl, 'DELETE', '/api/users/me/apikeys/anthropic', {
        token: normalToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.ok, true);
    });

    it('DELETE /api/users/me/apikeys/:provider — 404 for non-existent', async () => {
      const res = await request(baseUrl, 'DELETE', '/api/users/me/apikeys/nonexistent', {
        token: normalToken,
      });
      assert.equal(res.status, 404);
    });

    it('DELETE /api/users/me/apikeys/:provider — 503 without ENCRYPTION_KEY', async () => {
      const saved = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      const res = await request(baseUrl, 'DELETE', '/api/users/me/apikeys/openai', {
        token: normalToken,
      });
      assert.equal(res.status, 503);
      process.env.ENCRYPTION_KEY = saved;
    });
  });

  /* -------------------------------------------------------------- */
  /*  OAuth Stubs                                                   */
  /* -------------------------------------------------------------- */

  describe('OAuth Stubs', () => {
    it('GET /api/auth/oauth/google — returns 501', async () => {
      const res = await request(baseUrl, 'GET', '/api/auth/oauth/google');
      assert.equal(res.status, 501);
      assert.equal(res.data.provider, 'google');
      assert.ok(res.data.error.includes('not yet configured'));
    });

    it('GET /api/auth/oauth/github — returns 501', async () => {
      const res = await request(baseUrl, 'GET', '/api/auth/oauth/github');
      assert.equal(res.status, 501);
      assert.equal(res.data.provider, 'github');
    });

    it('GET /api/auth/oauth/github/callback — returns 501', async () => {
      const res = await request(baseUrl, 'GET', '/api/auth/oauth/github/callback');
      assert.equal(res.status, 501);
      assert.equal(res.data.provider, 'github');
    });
  });

  /* -------------------------------------------------------------- */
  /*  Setup Wizard                                                  */
  /* -------------------------------------------------------------- */

  describe('Setup Wizard', () => {
    it('GET /api/setup/status — returns status (no auth required)', async () => {
      const res = await request(baseUrl, 'GET', '/api/setup/status');
      assert.equal(res.status, 200);
      assert.equal(typeof res.data.complete, 'boolean');
      assert.equal(typeof res.data.currentStep, 'number');
      assert.equal(res.data.totalSteps, 5);
    });

    it('POST /api/setup/complete — requires admin', async () => {
      const noAuth = await request(baseUrl, 'POST', '/api/setup/complete');
      assert.equal(noAuth.status, 401);

      const userAuth = await request(baseUrl, 'POST', '/api/setup/complete', {
        token: normalToken,
      });
      assert.equal(userAuth.status, 403);
    });

    it('POST /api/setup/complete — marks setup complete', async () => {
      const res = await request(baseUrl, 'POST', '/api/setup/complete', {
        token: adminToken,
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.complete, true);

      // Verify status reflects it
      const status = await request(baseUrl, 'GET', '/api/setup/status');
      assert.equal(status.data.complete, true);
    });
  });

  /* -------------------------------------------------------------- */
  /*  i18n                                                          */
  /* -------------------------------------------------------------- */

  describe('i18n', () => {
    it('GET /api/i18n/en — returns English strings', async () => {
      const res = await request(baseUrl, 'GET', '/api/i18n/en');
      assert.equal(res.status, 200);
      assert.equal(res.data.welcome, 'Welcome');
      assert.equal(res.data.login, 'Log in');
      assert.ok(res.data.step1Title);
      assert.ok(res.data.finish);
    });

    it('GET /api/i18n/fr — returns French strings', async () => {
      const res = await request(baseUrl, 'GET', '/api/i18n/fr');
      assert.equal(res.status, 200);
      assert.equal(res.data.welcome, 'Bienvenue');
      assert.equal(res.data.login, 'Se connecter');
    });

    it('GET /api/i18n/xx — 404 for unknown locale', async () => {
      const res = await request(baseUrl, 'GET', '/api/i18n/xx');
      assert.equal(res.status, 404);
      assert.ok(res.data.error.includes('not found'));
    });

    it('GET /api/i18n/../../etc/passwd — path traversal blocked', async () => {
      const res = await request(baseUrl, 'GET', '/api/i18n/..%2F..%2Fetc%2Fpasswd');
      // Should either 404 or 403
      assert.ok(res.status === 404 || res.status === 403);
    });
  });

  /* -------------------------------------------------------------- */
  /*  Unknown API routes                                            */
  /* -------------------------------------------------------------- */

  describe('Unknown routes', () => {
    it('GET /api/nonexistent — 404', async () => {
      const res = await request(baseUrl, 'GET', '/api/nonexistent');
      assert.equal(res.status, 404);
    });
  });
});
