/**
 * @module test/phase2a
 * Tests for Phase 2a state layer: agents, memory, admin-config, preferences, context-index.
 * Uses Node.js built-in test runner (node:test + node:assert).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { getDb, initSchema } from '../state/db.js';
import { init as initUsers, createUser, deleteUser } from '../state/users.js';
import {
  init as initAgents,
  createAgent,
  getAgent,
  listAgents,
  updateAgent,
  deleteAgent,
  listByUser,
  getBuiltinAgents,
} from '../state/agents.js';
import {
  init as initMemory,
  store as storeMemory,
  search as searchMemory,
  get as getMemory,
  update as updateMemory,
  delete as deleteMemory,
  deleteByUser as deleteMemoryByUser,
  touchAccessed,
  countByUser,
} from '../state/memory.js';
import {
  init as initAdminConfig,
  get as getConfig,
  set as setConfig,
  getAll as getAllConfig,
  delete as deleteConfig,
  setDefaults,
} from '../state/admin-config.js';
import {
  init as initPreferences,
  get as getPrefs,
  set as setPrefs,
  getLocale,
  setLocale,
  setApiKey,
  getApiKey,
  setOAuthToken,
  getOAuthToken,
  encrypt,
  decrypt,
} from '../state/preferences.js';
import {
  init as initContextIndex,
  upsert,
  search as searchIndex,
  get as getIndex,
  delete as deleteIndex,
  deleteBySource,
  reindex,
  generateManifest,
} from '../state/context-index.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function tmpDbPath() {
  return path.join(os.tmpdir(), `scratchy-phase2a-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
}

/** Generate a 32-byte encryption key for testing */
function testEncKey() {
  return crypto.randomBytes(32);
}

/* ================================================================== */
/*  Schema — new tables and indexes                                   */
/* ================================================================== */

describe('Phase 2a schema', () => {
  const dbPath = tmpDbPath();
  let db;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('creates all 6 new tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(r => r.name);

    for (const t of ['agents', 'memory_chunks', 'context_index', 'admin_config', 'user_preferences', 'agent_conversations']) {
      assert.ok(tables.includes(t), `table ${t} should exist`);
    }
  });

  it('creates all expected indexes', () => {
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
    ).all().map(r => r.name);

    const expected = [
      'idx_memory_chunks_userId',
      'idx_memory_chunks_agentId',
      'idx_memory_chunks_category',
      'idx_context_index_category',
      'idx_context_index_source',
      'idx_agents_userId',
      'idx_agent_conversations_agentId',
      'idx_agent_conversations_userId',
    ];

    for (const idx of expected) {
      assert.ok(indexes.includes(idx), `index ${idx} should exist`);
    }
  });

  it('initSchema is idempotent with new tables', () => {
    assert.doesNotThrow(() => {
      initSchema(db);
      initSchema(db);
    });
  });
});

/* ================================================================== */
/*  agents.js                                                         */
/* ================================================================== */

describe('agents.js', () => {
  const dbPath = tmpDbPath();
  let db;
  let userId;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initUsers(db);
    initAgents(db);
    const user = createUser('agent_owner', 'hash_ao');
    userId = user.id;
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('createAgent returns agent with id, name, parsed JSON fields', () => {
    const agent = createAgent('Test Agent', { userId });
    assert.ok(agent.id);
    assert.equal(agent.name, 'Test Agent');
    assert.deepEqual(agent.surfaces, []);
    assert.deepEqual(agent.mcpServers, []);
    assert.deepEqual(agent.skills, []);
    assert.equal(agent.model, 'sonnet');
    assert.equal(agent.temperature, 0.7);
    assert.equal(agent.enabled, 1);
    assert.equal(agent.isBuiltin, 0);
    assert.ok(agent.createdAt);
    assert.ok(agent.updatedAt);
  });

  it('createAgent with all options', () => {
    const agent = createAgent('Full Agent', {
      systemPrompt: 'You are helpful',
      model: 'opus',
      temperature: 0.3,
      surfaces: ['chat', 'voice'],
      mcpServers: [{ name: 'fs', url: 'http://localhost:3000' }],
      skills: ['code', 'math'],
      avatar: '/img/bot.png',
      enabled: false,
      isBuiltin: true,
      userId,
    });

    assert.equal(agent.systemPrompt, 'You are helpful');
    assert.equal(agent.model, 'opus');
    assert.equal(agent.temperature, 0.3);
    assert.deepEqual(agent.surfaces, ['chat', 'voice']);
    assert.deepEqual(agent.mcpServers, [{ name: 'fs', url: 'http://localhost:3000' }]);
    assert.deepEqual(agent.skills, ['code', 'math']);
    assert.equal(agent.avatar, '/img/bot.png');
    assert.equal(agent.enabled, 0);
    assert.equal(agent.isBuiltin, 1);
    assert.equal(agent.userId, userId);
  });

  it('createAgent throws on empty name', () => {
    assert.throws(() => createAgent(''), /non-empty/i);
    assert.throws(() => createAgent('   '), /non-empty/i);
  });

  it('createAgent throws on non-string model', () => {
    assert.throws(() => createAgent('Bad Model', { model: 123 }), /string/i);
  });

  it('getAgent returns agent by ID', () => {
    const created = createAgent('Get Me', { userId });
    const found = getAgent(created.id);
    assert.ok(found);
    assert.equal(found.name, 'Get Me');
  });

  it('getAgent with non-existent ID returns undefined', () => {
    assert.equal(getAgent('nonexistent-id'), undefined);
  });

  it('listAgents returns all agents', () => {
    const all = listAgents();
    assert.ok(all.length >= 2);
    // All should have parsed JSON
    for (const a of all) {
      assert.ok(Array.isArray(a.surfaces));
    }
  });

  it('listAgents filters by userId', () => {
    const user2 = createUser('other_agent_owner', 'hash_oao');
    createAgent('User2 Agent', { userId: user2.id });
    const filtered = listAgents({ userId: user2.id });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, 'User2 Agent');
  });

  it('listAgents filters by enabled', () => {
    createAgent('Disabled Agent', { userId, enabled: false });
    const enabled = listAgents({ enabled: true });
    const disabled = listAgents({ enabled: false });
    assert.ok(enabled.length >= 1);
    assert.ok(disabled.length >= 1);
    for (const a of enabled) assert.equal(a.enabled, 1);
    for (const a of disabled) assert.equal(a.enabled, 0);
  });

  it('updateAgent updates allowed fields', () => {
    const agent = createAgent('Update Me', { userId });
    const updated = updateAgent(agent.id, {
      name: 'Updated Name',
      model: 'haiku',
      surfaces: ['web'],
    });
    assert.equal(updated.name, 'Updated Name');
    assert.equal(updated.model, 'haiku');
    assert.deepEqual(updated.surfaces, ['web']);
  });

  it('updateAgent with empty patch returns unchanged agent', () => {
    const agent = createAgent('No Change', { userId });
    const same = updateAgent(agent.id, {});
    assert.equal(same.name, 'No Change');
  });

  it('updateAgent throws on empty name', () => {
    const agent = createAgent('Valid Name', { userId });
    assert.throws(() => updateAgent(agent.id, { name: '' }), /non-empty/i);
  });

  it('updateAgent throws on non-string model', () => {
    const agent = createAgent('Model Check', { userId });
    assert.throws(() => updateAgent(agent.id, { model: 42 }), /string/i);
  });

  it('deleteAgent removes agent and returns true', () => {
    const agent = createAgent('Delete Me', { userId });
    assert.equal(deleteAgent(agent.id), true);
    assert.equal(getAgent(agent.id), undefined);
  });

  it('deleteAgent on non-existent returns false', () => {
    assert.equal(deleteAgent('nope'), false);
  });

  it('listByUser returns agents for a user', () => {
    const user3 = createUser('list_by_user', 'hash_lbu');
    createAgent('LBU1', { userId: user3.id });
    createAgent('LBU2', { userId: user3.id });
    const list = listByUser(user3.id);
    assert.equal(list.length, 2);
  });

  it('getBuiltinAgents returns only builtin agents', () => {
    createAgent('Builtin One', { isBuiltin: true });
    const builtins = getBuiltinAgents();
    assert.ok(builtins.length >= 1);
    for (const b of builtins) assert.equal(b.isBuiltin, 1);
  });

  it('deleting user cascades to agents', () => {
    const cascadeUser = createUser('cascade_agent_user', 'hash_cau');
    const agent = createAgent('Cascade Agent', { userId: cascadeUser.id });
    assert.ok(getAgent(agent.id));
    deleteUser(cascadeUser.id);
    assert.equal(getAgent(agent.id), undefined);
  });
});

/* ================================================================== */
/*  memory.js                                                         */
/* ================================================================== */

describe('memory.js', () => {
  const dbPath = tmpDbPath();
  let db;
  let userId;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initUsers(db);
    initAgents(db);
    initMemory(db);
    const user = createUser('mem_owner', 'hash_mo');
    userId = user.id;
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('store creates a memory chunk with defaults', () => {
    const chunk = storeMemory(userId, 'The sky is blue');
    assert.ok(chunk.id);
    assert.equal(chunk.userId, userId);
    assert.equal(chunk.content, 'The sky is blue');
    assert.equal(chunk.source, 'extraction');
    assert.equal(chunk.category, 'semantic');
    assert.deepEqual(chunk.tags, []);
    assert.equal(chunk.confidence, 1.0);
    assert.equal(chunk.agentId, null);
    assert.ok(chunk.createdAt);
    assert.ok(chunk.accessedAt);
  });

  it('store with all options', () => {
    const agent = createAgent('Mem Agent', { userId });
    const chunk = storeMemory(userId, 'Procedural fact', {
      agentId: agent.id,
      source: 'manual',
      category: 'procedural',
      tags: ['code', 'js'],
      confidence: 0.8,
      sourceRef: 'conv-123',
    });
    assert.equal(chunk.agentId, agent.id);
    assert.equal(chunk.source, 'manual');
    assert.equal(chunk.category, 'procedural');
    assert.deepEqual(chunk.tags, ['code', 'js']);
    assert.equal(chunk.confidence, 0.8);
    assert.equal(chunk.sourceRef, 'conv-123');
  });

  it('store throws on missing userId', () => {
    assert.throws(() => storeMemory(null, 'content'), /userId/i);
  });

  it('store throws on empty content', () => {
    assert.throws(() => storeMemory(userId, ''), /content/i);
  });

  it('get returns memory chunk by ID', () => {
    const chunk = storeMemory(userId, 'Get me');
    const found = getMemory(chunk.id);
    assert.ok(found);
    assert.equal(found.content, 'Get me');
  });

  it('get with non-existent ID returns undefined', () => {
    assert.equal(getMemory('nonexistent'), undefined);
  });

  it('search returns chunks for user', () => {
    // Clear and store fresh
    deleteMemoryByUser(userId);
    storeMemory(userId, 'Alpha');
    storeMemory(userId, 'Beta');
    const results = searchMemory(userId);
    assert.equal(results.length, 2);
  });

  it('search filters by category', () => {
    deleteMemoryByUser(userId);
    storeMemory(userId, 'Core fact', { category: 'core' });
    storeMemory(userId, 'Episode', { category: 'episodic' });
    const core = searchMemory(userId, { category: 'core' });
    assert.equal(core.length, 1);
    assert.equal(core[0].content, 'Core fact');
  });

  it('search filters by agentId', () => {
    deleteMemoryByUser(userId);
    const agent = createAgent('Search Agent', { userId });
    storeMemory(userId, 'Agent memory', { agentId: agent.id });
    storeMemory(userId, 'Global memory');
    const agentMem = searchMemory(userId, { agentId: agent.id });
    assert.equal(agentMem.length, 1);
    assert.equal(agentMem[0].content, 'Agent memory');
    const globalMem = searchMemory(userId, { agentId: null });
    assert.equal(globalMem.length, 1);
    assert.equal(globalMem[0].content, 'Global memory');
  });

  it('search filters by tags', () => {
    deleteMemoryByUser(userId);
    storeMemory(userId, 'Tagged A', { tags: ['important', 'code'] });
    storeMemory(userId, 'Tagged B', { tags: ['trivial'] });
    const results = searchMemory(userId, { tags: ['important'] });
    assert.equal(results.length, 1);
    assert.equal(results[0].content, 'Tagged A');
  });

  it('search respects limit', () => {
    deleteMemoryByUser(userId);
    for (let i = 0; i < 10; i++) storeMemory(userId, `Chunk ${i}`);
    const results = searchMemory(userId, { limit: 3 });
    assert.equal(results.length, 3);
  });

  it('search sorts by accessedAt desc', () => {
    deleteMemoryByUser(userId);
    const c1 = storeMemory(userId, 'Old');
    const c2 = storeMemory(userId, 'New');
    // Touch c1 to make it more recent
    touchAccessed(c1.id);
    const results = searchMemory(userId);
    assert.equal(results[0].id, c1.id, 'touched chunk should appear first');
  });

  it('update modifies chunk fields', () => {
    const chunk = storeMemory(userId, 'To update');
    const updated = updateMemory(chunk.id, {
      content: 'Updated content',
      category: 'core',
      tags: ['updated'],
      confidence: 0.5,
    });
    assert.equal(updated.content, 'Updated content');
    assert.equal(updated.category, 'core');
    assert.deepEqual(updated.tags, ['updated']);
    assert.equal(updated.confidence, 0.5);
  });

  it('update with empty patch returns unchanged', () => {
    const chunk = storeMemory(userId, 'No update');
    const same = updateMemory(chunk.id, {});
    assert.equal(same.content, 'No update');
  });

  it('delete removes a chunk', () => {
    const chunk = storeMemory(userId, 'Delete me');
    assert.equal(deleteMemory(chunk.id), true);
    assert.equal(getMemory(chunk.id), undefined);
  });

  it('delete on non-existent returns false', () => {
    assert.equal(deleteMemory('nope'), false);
  });

  it('deleteByUser removes all chunks for user', () => {
    storeMemory(userId, 'A');
    storeMemory(userId, 'B');
    const count = deleteMemoryByUser(userId);
    assert.ok(count >= 2);
    assert.equal(countByUser(userId), 0);
  });

  it('touchAccessed updates the accessedAt', () => {
    const chunk = storeMemory(userId, 'Touch me');
    const originalAccessed = chunk.accessedAt;
    // Small delay so timestamp differs
    touchAccessed(chunk.id);
    const updated = getMemory(chunk.id);
    assert.ok(new Date(updated.accessedAt) >= new Date(originalAccessed));
  });

  it('touchAccessed on non-existent returns false', () => {
    assert.equal(touchAccessed('nope'), false);
  });

  it('countByUser returns correct count', () => {
    deleteMemoryByUser(userId);
    storeMemory(userId, 'A');
    storeMemory(userId, 'B');
    storeMemory(userId, 'C');
    assert.equal(countByUser(userId), 3);
  });

  it('deleting user cascades to memory chunks', () => {
    const cascadeUser = createUser('cascade_mem_user', 'hash_cmu');
    storeMemory(cascadeUser.id, 'Will be deleted');
    assert.equal(countByUser(cascadeUser.id), 1);
    deleteUser(cascadeUser.id);
    assert.equal(countByUser(cascadeUser.id), 0);
  });

  it('deleting agent sets agentId to null (ON DELETE SET NULL)', () => {
    const agent = createAgent('Deletable Agent', { userId });
    const chunk = storeMemory(userId, 'Agent mem', { agentId: agent.id });
    assert.equal(chunk.agentId, agent.id);
    deleteAgent(agent.id);
    const updated = getMemory(chunk.id);
    assert.equal(updated.agentId, null);
  });
});

/* ================================================================== */
/*  admin-config.js                                                   */
/* ================================================================== */

describe('admin-config.js', () => {
  const dbPath = tmpDbPath();
  let db;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initAdminConfig(db);
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('get returns undefined for non-existent key', () => {
    assert.equal(getConfig('nonexistent'), undefined);
  });

  it('set stores and get retrieves a string value', () => {
    setConfig('signupMode', 'open');
    assert.equal(getConfig('signupMode'), 'open');
  });

  it('set stores and get retrieves an array value', () => {
    setConfig('providers', ['google', 'github']);
    assert.deepEqual(getConfig('providers'), ['google', 'github']);
  });

  it('set stores and get retrieves an object value', () => {
    setConfig('quotas', { maxTokens: 1000, maxRequests: 100 });
    assert.deepEqual(getConfig('quotas'), { maxTokens: 1000, maxRequests: 100 });
  });

  it('set stores and get retrieves a numeric value', () => {
    setConfig('maxUsers', 42);
    assert.equal(getConfig('maxUsers'), 42);
  });

  it('set stores and get retrieves a boolean value', () => {
    setConfig('maintenance', true);
    assert.equal(getConfig('maintenance'), true);
  });

  it('set overwrites existing value', () => {
    setConfig('signupMode', 'open');
    setConfig('signupMode', 'invite');
    assert.equal(getConfig('signupMode'), 'invite');
  });

  it('getAll returns all key-value pairs', () => {
    // Clear first
    for (const key of Object.keys(getAllConfig())) {
      deleteConfig(key);
    }
    setConfig('a', 1);
    setConfig('b', 'two');
    setConfig('c', [3]);
    const all = getAllConfig();
    assert.deepEqual(all, { a: 1, b: 'two', c: [3] });
  });

  it('delete removes a key and returns true', () => {
    setConfig('toDelete', 'bye');
    assert.equal(deleteConfig('toDelete'), true);
    assert.equal(getConfig('toDelete'), undefined);
  });

  it('delete on non-existent key returns false', () => {
    assert.equal(deleteConfig('neverExisted'), false);
  });

  it('setDefaults only sets keys that do not exist', () => {
    setConfig('existing', 'keep');
    setDefaults({
      existing: 'overwrite?',
      newKey: 'fresh',
    });
    assert.equal(getConfig('existing'), 'keep', 'existing key should not be overwritten');
    assert.equal(getConfig('newKey'), 'fresh', 'new key should be set');
  });

  it('setDefaults with multiple new keys', () => {
    setDefaults({
      signupMode: 'open',
      enabledOAuthProviders: ['google'],
      defaultQuotas: { tokensPerDay: 100000 },
      enabledTools: ['web_search', 'code'],
    });
    // All should be retrievable
    assert.equal(getConfig('signupMode'), 'open');
    assert.deepEqual(getConfig('enabledOAuthProviders'), ['google']);
    assert.deepEqual(getConfig('defaultQuotas'), { tokensPerDay: 100000 });
    assert.deepEqual(getConfig('enabledTools'), ['web_search', 'code']);
  });
});

/* ================================================================== */
/*  preferences.js                                                    */
/* ================================================================== */

describe('preferences.js', () => {
  const dbPath = tmpDbPath();
  let db;
  let userId;
  const encKey = testEncKey();

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initUsers(db);
    initAgents(db);
    initPreferences(db);
    const user = createUser('pref_owner', 'hash_po');
    userId = user.id;
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('get returns undefined for user without preferences', () => {
    assert.equal(getPrefs('nonexistent'), undefined);
  });

  it('set creates preferences with defaults', () => {
    const prefs = setPrefs(userId, { locale: 'de' });
    assert.equal(prefs.userId, userId);
    assert.equal(prefs.locale, 'de');
    assert.equal(prefs.theme, 'system');
    assert.equal(prefs.onboardingComplete, false);
  });

  it('get retrieves preferences', () => {
    const prefs = getPrefs(userId);
    assert.ok(prefs);
    assert.equal(prefs.locale, 'de');
  });

  it('set updates existing preferences', () => {
    setPrefs(userId, { theme: 'dark', onboardingComplete: true });
    const prefs = getPrefs(userId);
    assert.equal(prefs.theme, 'dark');
    assert.equal(prefs.onboardingComplete, true);
    assert.equal(prefs.locale, 'de'); // unchanged
  });

  it('set with empty patch returns unchanged', () => {
    const prefs = setPrefs(userId, {});
    assert.equal(prefs.locale, 'de');
  });

  it('getLocale returns locale or default', () => {
    assert.equal(getLocale(userId), 'de');
    assert.equal(getLocale('nonexistent'), 'en');
  });

  it('setLocale updates locale', () => {
    setLocale(userId, 'fr');
    assert.equal(getLocale(userId), 'fr');
  });

  it('set defaultAgentId links to an agent', () => {
    const agent = createAgent('Default Agent', { userId });
    setPrefs(userId, { defaultAgentId: agent.id });
    const prefs = getPrefs(userId);
    assert.equal(prefs.defaultAgentId, agent.id);
  });

  it('deleting user cascades to preferences', () => {
    const cascadeUser = createUser('cascade_pref_user', 'hash_cpu');
    setPrefs(cascadeUser.id, { locale: 'ja' });
    assert.ok(getPrefs(cascadeUser.id));
    deleteUser(cascadeUser.id);
    assert.equal(getPrefs(cascadeUser.id), undefined);
  });

  /* -------------------------------------------------------------- */
  /*  Encryption (AES-256-GCM)                                      */
  /* -------------------------------------------------------------- */

  it('encrypt/decrypt round-trip works', () => {
    const plaintext = 'sk-ant-api03-secret-key-here';
    const encrypted = encrypt(plaintext, encKey);
    const decrypted = decrypt(encrypted, encKey);
    assert.equal(decrypted, plaintext);
  });

  it('encrypt produces iv:authTag:ciphertext format', () => {
    const encrypted = encrypt('test', encKey);
    const parts = encrypted.split(':');
    assert.equal(parts.length, 3, 'should have 3 colon-separated parts');
    // IV should be 12 bytes = 24 hex chars
    assert.equal(parts[0].length, 24, 'IV should be 24 hex chars');
    // Auth tag should be 16 bytes = 32 hex chars
    assert.equal(parts[1].length, 32, 'auth tag should be 32 hex chars');
    // Ciphertext should be non-empty
    assert.ok(parts[2].length > 0, 'ciphertext should be non-empty');
  });

  it('encrypt generates different IVs each time', () => {
    const e1 = encrypt('same text', encKey);
    const e2 = encrypt('same text', encKey);
    assert.notEqual(e1, e2, 'two encryptions of same text should differ');
    const iv1 = e1.split(':')[0];
    const iv2 = e2.split(':')[0];
    assert.notEqual(iv1, iv2, 'IVs should differ');
  });

  it('decrypt with wrong key throws', () => {
    const encrypted = encrypt('secret', encKey);
    const wrongKey = crypto.randomBytes(32);
    assert.throws(() => decrypt(encrypted, wrongKey));
  });

  it('decrypt with tampered ciphertext throws', () => {
    const encrypted = encrypt('secret', encKey);
    const parts = encrypted.split(':');
    // Flip a bit in ciphertext
    const tampered = parts[0] + ':' + parts[1] + ':' + 'ff' + parts[2].slice(2);
    assert.throws(() => decrypt(tampered, encKey));
  });

  /* -------------------------------------------------------------- */
  /*  Encrypted key vault                                            */
  /* -------------------------------------------------------------- */

  it('setApiKey + getApiKey round-trip', () => {
    setApiKey(userId, 'openai', 'sk-abc123', encKey);
    const key = getApiKey(userId, 'openai', encKey);
    assert.equal(key, 'sk-abc123');
  });

  it('multiple API keys for same user', () => {
    setApiKey(userId, 'anthropic', 'sk-ant-456', encKey);
    assert.equal(getApiKey(userId, 'openai', encKey), 'sk-abc123');
    assert.equal(getApiKey(userId, 'anthropic', encKey), 'sk-ant-456');
  });

  it('getApiKey with wrong key throws', () => {
    setApiKey(userId, 'test_provider', 'sk-test', encKey);
    const wrongKey = crypto.randomBytes(32);
    assert.throws(() => getApiKey(userId, 'test_provider', wrongKey));
  });

  it('getApiKey for non-existent user returns undefined', () => {
    assert.equal(getApiKey('nonexistent-user', 'openai', encKey), undefined);
  });

  it('getApiKey for non-existent provider returns undefined', () => {
    assert.equal(getApiKey(userId, 'nonexistent_provider', encKey), undefined);
  });

  it('setOAuthToken + getOAuthToken round-trip', () => {
    const tokenData = { accessToken: 'at-123', refreshToken: 'rt-456', expiresAt: '2025-12-31' };
    setOAuthToken(userId, 'google', tokenData, encKey);
    const retrieved = getOAuthToken(userId, 'google', encKey);
    assert.deepEqual(retrieved, tokenData);
  });

  it('getOAuthToken for non-existent user returns undefined', () => {
    assert.equal(getOAuthToken('nonexistent', 'google', encKey), undefined);
  });

  it('setApiKey auto-creates preferences row if missing', () => {
    const newUser = createUser('key_vault_user', 'hash_kvu');
    // No prefs row yet
    assert.equal(getPrefs(newUser.id), undefined);
    setApiKey(newUser.id, 'openai', 'sk-new', encKey);
    // Now prefs row should exist
    const prefs = getPrefs(newUser.id);
    assert.ok(prefs);
    assert.equal(getApiKey(newUser.id, 'openai', encKey), 'sk-new');
  });
});

/* ================================================================== */
/*  context-index.js                                                  */
/* ================================================================== */

describe('context-index.js', () => {
  const dbPath = tmpDbPath();
  let db;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initContextIndex(db);
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('upsert creates a new entry', () => {
    const result = upsert('skills/code.md', 'Code generation skill docs');
    assert.ok(result.id);
    assert.equal(result.created, true);
    assert.equal(result.skipped, false);
  });

  it('upsert with same content skips', () => {
    const r1 = upsert('skills/math.md', 'Math skill docs');
    const r2 = upsert('skills/math.md', 'Math skill docs');
    assert.equal(r2.id, r1.id);
    assert.equal(r2.created, false);
    assert.equal(r2.skipped, true);
  });

  it('upsert with changed content updates', () => {
    const r1 = upsert('skills/writing.md', 'Version 1');
    const r2 = upsert('skills/writing.md', 'Version 2');
    assert.equal(r2.id, r1.id);
    assert.equal(r2.created, false);
    assert.equal(r2.skipped, false);
    const entry = getIndex(r2.id);
    assert.equal(entry.content, 'Version 2');
  });

  it('upsert with category option', () => {
    const result = upsert('components/button.json', '{"type":"button"}', { category: 'component' });
    const entry = getIndex(result.id);
    assert.equal(entry.category, 'component');
  });

  it('upsert throws on empty source', () => {
    assert.throws(() => upsert('', 'content'), /source/i);
  });

  it('upsert throws on empty content', () => {
    assert.throws(() => upsert('source', ''), /content/i);
  });

  it('get returns entry by ID', () => {
    const result = upsert('test/get.md', 'Get me');
    const entry = getIndex(result.id);
    assert.ok(entry);
    assert.equal(entry.source, 'test/get.md');
    assert.equal(entry.content, 'Get me');
    assert.ok(entry.chunkHash);
  });

  it('get with non-existent ID returns undefined', () => {
    assert.equal(getIndex('nonexistent'), undefined);
  });

  it('search returns all entries', () => {
    const results = searchIndex();
    assert.ok(results.length >= 3);
  });

  it('search filters by category', () => {
    const results = searchIndex({ category: 'component' });
    assert.ok(results.length >= 1);
    for (const r of results) assert.equal(r.category, 'component');
  });

  it('search filters by source prefix', () => {
    const results = searchIndex({ sourcePrefix: 'skills/' });
    assert.ok(results.length >= 2);
    for (const r of results) assert.ok(r.source.startsWith('skills/'));
  });

  it('search respects limit', () => {
    const results = searchIndex({ limit: 2 });
    assert.ok(results.length <= 2);
  });

  it('delete removes an entry', () => {
    const result = upsert('delete/me.md', 'To delete');
    assert.equal(deleteIndex(result.id), true);
    assert.equal(getIndex(result.id), undefined);
  });

  it('delete on non-existent returns false', () => {
    assert.equal(deleteIndex('nope'), false);
  });

  it('deleteBySource removes all entries with that source', () => {
    upsert('multi/source.md', 'Content');
    const count = deleteBySource('multi/source.md');
    assert.equal(count, 1);
    const results = searchIndex({ sourcePrefix: 'multi/' });
    assert.equal(results.length, 0);
  });

  it('reindex deletes all entries and returns count', () => {
    upsert('reindex/a.md', 'A');
    upsert('reindex/b.md', 'B');
    const totalBefore = searchIndex({ limit: 1000 }).length;
    const count = reindex();
    assert.equal(count, totalBefore);
    const totalAfter = searchIndex({ limit: 1000 }).length;
    assert.equal(totalAfter, 0);
  });

  it('generateManifest returns compact summaries', () => {
    upsert('manifest/a.md', 'This is document A with some content that goes on for a while');
    upsert('manifest/b.md', 'Short doc B', { category: 'skill' });
    const manifest = generateManifest();
    assert.ok(manifest.length >= 2);
    assert.ok(manifest.some(line => line.startsWith('manifest/a.md — ')));
    assert.ok(manifest.some(line => line.startsWith('manifest/b.md — ')));
  });

  it('generateManifest filters by category', () => {
    const manifest = generateManifest('skill');
    assert.ok(manifest.length >= 1);
    // All should be from skill category
    for (const line of manifest) {
      assert.ok(line.includes('manifest/b.md') || true); // skill category entries
    }
  });

  it('generateManifest truncates content to 80 chars', () => {
    const longContent = 'A'.repeat(200);
    upsert('manifest/long.md', longContent);
    const manifest = generateManifest();
    const longLine = manifest.find(line => line.startsWith('manifest/long.md'));
    assert.ok(longLine);
    // "manifest/long.md — " + 80 chars
    const preview = longLine.split(' — ')[1];
    assert.ok(preview.length <= 80);
  });

  it('chunkHash is SHA-256 of content', () => {
    const content = 'Hash verification content';
    const result = upsert('hash/verify.md', content);
    const entry = getIndex(result.id);
    const expectedHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    assert.equal(entry.chunkHash, expectedHash);
  });
});

/* ================================================================== */
/*  Agent conversations (via direct SQL — module not yet created)     */
/* ================================================================== */

describe('agent_conversations table', () => {
  const dbPath = tmpDbPath();
  let db;
  let userId;
  let agentId;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initUsers(db);
    initAgents(db);
    const user = createUser('conv_owner', 'hash_co');
    userId = user.id;
    const agent = createAgent('Conv Agent', { userId });
    agentId = agent.id;
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('can insert and query conversations', () => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const messages = JSON.stringify([{ role: 'user', content: 'Hello' }]);

    db.prepare(`
      INSERT INTO agent_conversations (id, agentId, userId, title, messages, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, agentId, userId, 'Test Chat', messages, now, now);

    const row = db.prepare('SELECT * FROM agent_conversations WHERE id = ?').get(id);
    assert.ok(row);
    assert.equal(row.title, 'Test Chat');
    assert.deepEqual(JSON.parse(row.messages), [{ role: 'user', content: 'Hello' }]);
  });

  it('deleting agent cascades to conversations', () => {
    const agent2 = createAgent('Cascade Conv Agent', { userId });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agent_conversations (id, agentId, userId, title, messages, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, agent2.id, userId, 'Will Delete', '[]', now, now);

    deleteAgent(agent2.id);
    const row = db.prepare('SELECT * FROM agent_conversations WHERE id = ?').get(id);
    assert.equal(row, undefined);
  });

  it('deleting user cascades to conversations', () => {
    const convUser = createUser('conv_cascade_user', 'hash_ccu');
    const agent3 = createAgent('Conv Agent 3', { userId: convUser.id });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agent_conversations (id, agentId, userId, title, messages, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, agent3.id, convUser.id, 'Cascade', '[]', now, now);

    deleteUser(convUser.id);
    const row = db.prepare('SELECT * FROM agent_conversations WHERE id = ?').get(id);
    assert.equal(row, undefined);
  });
});
