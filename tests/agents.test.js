/**
 * Unit tests for state/agents.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../state/db.js';
import * as users from '../state/users.js';
import * as agents from '../state/agents.js';

describe('agents', () => {
  let db;
  let testUser;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    users.init(db);
    agents.init(db);

    testUser = users.createUser('testuser', 'hash');
  });

  /* ------------------------------------------------------------ */
  /*  createAgent                                                  */
  /* ------------------------------------------------------------ */
  describe('createAgent', () => {
    it('creates an agent with defaults', () => {
      const agent = agents.createAgent('TestBot');
      assert.equal(agent.name, 'TestBot');
      assert.equal(agent.systemPrompt, '');
      assert.equal(agent.model, 'sonnet');
      assert.equal(agent.temperature, 0.7);
      assert.deepEqual(agent.surfaces, []);
      assert.deepEqual(agent.mcpServers, []);
      assert.deepEqual(agent.skills, []);
      assert.equal(agent.avatar, null);
      assert.equal(agent.enabled, 1);
      assert.equal(agent.isBuiltin, 0);
      assert.equal(agent.userId, null);
      assert.ok(agent.id);
      assert.ok(agent.createdAt);
      assert.ok(agent.updatedAt);
    });

    it('creates an agent with all custom options', () => {
      const agent = agents.createAgent('CustomBot', {
        systemPrompt: 'You are a helpful assistant',
        model: 'opus',
        temperature: 0.3,
        surfaces: ['chat', 'canvas'],
        mcpServers: ['server1'],
        skills: ['code', 'search'],
        avatar: 'https://example.com/avatar.png',
        enabled: false,
        isBuiltin: true,
        userId: testUser.id,
      });

      assert.equal(agent.name, 'CustomBot');
      assert.equal(agent.systemPrompt, 'You are a helpful assistant');
      assert.equal(agent.model, 'opus');
      assert.equal(agent.temperature, 0.3);
      assert.deepEqual(agent.surfaces, ['chat', 'canvas']);
      assert.deepEqual(agent.mcpServers, ['server1']);
      assert.deepEqual(agent.skills, ['code', 'search']);
      assert.equal(agent.avatar, 'https://example.com/avatar.png');
      assert.equal(agent.enabled, 0);
      assert.equal(agent.isBuiltin, 1);
      assert.equal(agent.userId, testUser.id);
    });

    it('trims the agent name', () => {
      const agent = agents.createAgent('  Spaced Bot  ');
      assert.equal(agent.name, 'Spaced Bot');
    });

    it('throws on empty name', () => {
      assert.throws(
        () => agents.createAgent(''),
        /Agent name must be a non-empty string/
      );
    });

    it('throws on whitespace-only name', () => {
      assert.throws(
        () => agents.createAgent('   '),
        /Agent name must be a non-empty string/
      );
    });

    it('throws on null name', () => {
      assert.throws(
        () => agents.createAgent(null),
        /Agent name must be a non-empty string/
      );
    });

    it('throws on non-string name', () => {
      assert.throws(
        () => agents.createAgent(42),
        /Agent name must be a non-empty string/
      );
    });

    it('throws on non-string model', () => {
      assert.throws(
        () => agents.createAgent('Bot', { model: 123 }),
        /Agent model must be a string/
      );
    });

    it('allows duplicate agent names', () => {
      const a1 = agents.createAgent('DupBot');
      const a2 = agents.createAgent('DupBot');
      assert.notEqual(a1.id, a2.id);
      assert.equal(a1.name, a2.name);
    });

    it('generates unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 10; i++) {
        const agent = agents.createAgent(`Bot${i}`);
        ids.add(agent.id);
      }
      assert.equal(ids.size, 10);
    });

    it('handles unicode in agent name', () => {
      const agent = agents.createAgent('ロボット🤖');
      assert.equal(agent.name, 'ロボット🤖');
    });

    it('handles empty arrays for JSON fields', () => {
      const agent = agents.createAgent('EmptyArrays', {
        surfaces: [],
        mcpServers: [],
        skills: [],
      });
      assert.deepEqual(agent.surfaces, []);
      assert.deepEqual(agent.mcpServers, []);
      assert.deepEqual(agent.skills, []);
    });
  });

  /* ------------------------------------------------------------ */
  /*  getAgent                                                     */
  /* ------------------------------------------------------------ */
  describe('getAgent', () => {
    it('returns the agent with parsed JSON fields', () => {
      const created = agents.createAgent('FindMe', {
        surfaces: ['chat'],
        mcpServers: ['s1'],
        skills: ['search'],
      });
      const found = agents.getAgent(created.id);
      assert.equal(found.name, 'FindMe');
      assert.deepEqual(found.surfaces, ['chat']);
      assert.deepEqual(found.mcpServers, ['s1']);
      assert.deepEqual(found.skills, ['search']);
    });

    it('returns undefined for non-existent agent', () => {
      const result = agents.getAgent('no-such-id');
      assert.equal(result, undefined);
    });

    it('returns undefined for empty string ID', () => {
      const result = agents.getAgent('');
      assert.equal(result, undefined);
    });
  });

  /* ------------------------------------------------------------ */
  /*  listAgents                                                   */
  /* ------------------------------------------------------------ */
  describe('listAgents', () => {
    it('returns all agents when no filter', () => {
      agents.createAgent('A');
      agents.createAgent('B');
      agents.createAgent('C');

      const list = agents.listAgents();
      assert.equal(list.length, 3);
    });

    it('returns empty array when no agents', () => {
      const result = agents.listAgents();
      assert.deepEqual(result, []);
    });

    it('filters by userId', () => {
      agents.createAgent('UserBot', { userId: testUser.id });
      agents.createAgent('NoUserBot');

      const filtered = agents.listAgents({ userId: testUser.id });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].name, 'UserBot');
    });

    it('filters by enabled status', () => {
      agents.createAgent('Enabled', { enabled: true });
      agents.createAgent('Disabled', { enabled: false });

      const enabledOnly = agents.listAgents({ enabled: true });
      assert.equal(enabledOnly.length, 1);
      assert.equal(enabledOnly[0].name, 'Enabled');

      const disabledOnly = agents.listAgents({ enabled: false });
      assert.equal(disabledOnly.length, 1);
      assert.equal(disabledOnly[0].name, 'Disabled');
    });

    it('combines userId and enabled filters', () => {
      agents.createAgent('Active1', { userId: testUser.id, enabled: true });
      agents.createAgent('Active2', { userId: testUser.id, enabled: false });
      agents.createAgent('Active3', { enabled: true });

      const result = agents.listAgents({ userId: testUser.id, enabled: true });
      assert.equal(result.length, 1);
      assert.equal(result[0].name, 'Active1');
    });

    it('orders by createdAt ASC', () => {
      agents.createAgent('First');
      agents.createAgent('Second');
      agents.createAgent('Third');

      const list = agents.listAgents();
      assert.equal(list[0].name, 'First');
      assert.equal(list[1].name, 'Second');
      assert.equal(list[2].name, 'Third');
    });

    it('parses JSON fields for all returned agents', () => {
      agents.createAgent('JsonBot', { surfaces: ['canvas'], skills: ['code'] });
      const list = agents.listAgents();
      assert.deepEqual(list[0].surfaces, ['canvas']);
      assert.deepEqual(list[0].skills, ['code']);
    });
  });

  /* ------------------------------------------------------------ */
  /*  updateAgent                                                  */
  /* ------------------------------------------------------------ */
  describe('updateAgent', () => {
    it('updates the agent name', () => {
      const agent = agents.createAgent('OldName');
      const updated = agents.updateAgent(agent.id, { name: 'NewName' });
      assert.equal(updated.name, 'NewName');
    });

    it('trims updated name', () => {
      const agent = agents.createAgent('Original');
      const updated = agents.updateAgent(agent.id, { name: '  Trimmed  ' });
      assert.equal(updated.name, 'Trimmed');
    });

    it('throws on empty name update', () => {
      const agent = agents.createAgent('Valid');
      assert.throws(
        () => agents.updateAgent(agent.id, { name: '' }),
        /Agent name must be a non-empty string/
      );
    });

    it('throws on non-string model update', () => {
      const agent = agents.createAgent('ModelBot');
      assert.throws(
        () => agents.updateAgent(agent.id, { model: 42 }),
        /Agent model must be a string/
      );
    });

    it('updates JSON fields', () => {
      const agent = agents.createAgent('JsonUpdate');
      const updated = agents.updateAgent(agent.id, {
        surfaces: ['web', 'mobile'],
        mcpServers: ['new-server'],
        skills: ['analysis'],
      });
      assert.deepEqual(updated.surfaces, ['web', 'mobile']);
      assert.deepEqual(updated.mcpServers, ['new-server']);
      assert.deepEqual(updated.skills, ['analysis']);
    });

    it('updates boolean fields (enabled/isBuiltin)', () => {
      const agent = agents.createAgent('BoolBot', { enabled: true });
      const disabled = agents.updateAgent(agent.id, { enabled: false });
      assert.equal(disabled.enabled, 0);

      const reEnabled = agents.updateAgent(agent.id, { enabled: true });
      assert.equal(reEnabled.enabled, 1);
    });

    it('updates multiple fields at once', () => {
      const agent = agents.createAgent('MultiUpdate');
      const updated = agents.updateAgent(agent.id, {
        name: 'Updated',
        model: 'opus',
        temperature: 0.9,
        systemPrompt: 'New prompt',
      });
      assert.equal(updated.name, 'Updated');
      assert.equal(updated.model, 'opus');
      assert.equal(updated.temperature, 0.9);
      assert.equal(updated.systemPrompt, 'New prompt');
    });

    it('returns unchanged agent for empty patch', () => {
      const agent = agents.createAgent('NoPatch');
      const result = agents.updateAgent(agent.id, {});
      assert.equal(result.name, 'NoPatch');
    });

    it('ignores unknown keys', () => {
      const agent = agents.createAgent('IgnoreKeys');
      const result = agents.updateAgent(agent.id, { unknownField: 'value' });
      assert.equal(result.name, 'IgnoreKeys');
    });

    it('returns undefined for non-existent agent', () => {
      const result = agents.updateAgent('no-such-id', { name: 'X' });
      assert.equal(result, undefined);
    });

    it('updates updatedAt timestamp', () => {
      const agent = agents.createAgent('TimeBot');
      const updated = agents.updateAgent(agent.id, { name: 'Changed' });
      assert.ok(updated.updatedAt >= agent.updatedAt);
    });

    it('updates userId', () => {
      const agent = agents.createAgent('UserChangeBot');
      const updated = agents.updateAgent(agent.id, { userId: testUser.id });
      assert.equal(updated.userId, testUser.id);
    });

    it('updates avatar', () => {
      const agent = agents.createAgent('AvatarBot');
      const updated = agents.updateAgent(agent.id, { avatar: 'https://new-avatar.png' });
      assert.equal(updated.avatar, 'https://new-avatar.png');
    });
  });

  /* ------------------------------------------------------------ */
  /*  deleteAgent                                                  */
  /* ------------------------------------------------------------ */
  describe('deleteAgent', () => {
    it('deletes an existing agent', () => {
      const agent = agents.createAgent('DeleteMe');
      const result = agents.deleteAgent(agent.id);
      assert.equal(result, true);
      assert.equal(agents.getAgent(agent.id), undefined);
    });

    it('returns false for non-existent agent', () => {
      const result = agents.deleteAgent('no-such-id');
      assert.equal(result, false);
    });

    it('reduces agent count after deletion', () => {
      agents.createAgent('A');
      const b = agents.createAgent('B');
      assert.equal(agents.listAgents().length, 2);

      agents.deleteAgent(b.id);
      assert.equal(agents.listAgents().length, 1);
    });

    it('cascades delete to agent_conversations', () => {
      const agent = agents.createAgent('ConvAgent', { userId: testUser.id });
      db.prepare(`
        INSERT INTO agent_conversations (id, agentId, userId, title, messages)
        VALUES (?, ?, ?, 'Test Conv', '[]')
      `).run('conv-1', agent.id, testUser.id);

      agents.deleteAgent(agent.id);

      const conv = db.prepare('SELECT * FROM agent_conversations WHERE agentId = ?').get(agent.id);
      assert.equal(conv, undefined);
    });
  });

  /* ------------------------------------------------------------ */
  /*  listByUser                                                   */
  /* ------------------------------------------------------------ */
  describe('listByUser', () => {
    it('returns agents owned by a specific user', () => {
      agents.createAgent('UserBot1', { userId: testUser.id });
      agents.createAgent('UserBot2', { userId: testUser.id });
      agents.createAgent('OtherBot');

      const result = agents.listByUser(testUser.id);
      assert.equal(result.length, 2);
      assert.ok(result.every(a => a.userId === testUser.id));
    });

    it('returns empty array for user with no agents', () => {
      const anotherUser = users.createUser('noagents', 'hash');
      const result = agents.listByUser(anotherUser.id);
      assert.deepEqual(result, []);
    });
  });

  /* ------------------------------------------------------------ */
  /*  getBuiltinAgents                                             */
  /* ------------------------------------------------------------ */
  describe('getBuiltinAgents', () => {
    it('returns only builtin agents', () => {
      agents.createAgent('BuiltinBot', { isBuiltin: true });
      agents.createAgent('CustomBot', { isBuiltin: false });

      const builtins = agents.getBuiltinAgents();
      assert.equal(builtins.length, 1);
      assert.equal(builtins[0].name, 'BuiltinBot');
      assert.equal(builtins[0].isBuiltin, 1);
    });

    it('returns empty array when no builtin agents', () => {
      agents.createAgent('CustomOnly');
      const result = agents.getBuiltinAgents();
      assert.deepEqual(result, []);
    });

    it('parses JSON fields in builtin agents', () => {
      agents.createAgent('BuiltinJson', {
        isBuiltin: true,
        surfaces: ['api'],
        skills: ['translate'],
      });
      const builtins = agents.getBuiltinAgents();
      assert.deepEqual(builtins[0].surfaces, ['api']);
      assert.deepEqual(builtins[0].skills, ['translate']);
    });
  });
});
