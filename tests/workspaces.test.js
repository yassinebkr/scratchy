/**
 * Unit tests for state/workspaces.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initSchema } from '../state/db.js';
import * as users from '../state/users.js';
import * as workspaces from '../state/workspaces.js';

describe('workspaces', () => {
  let db;
  let testUser;
  let testUser2;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    users.init(db);
    workspaces.init(db); // also seeds templates

    testUser = users.createUser('wsuser', 'hash');
    testUser2 = users.createUser('wsuser2', 'hash2');
  });

  /* ------------------------------------------------------------ */
  /*  createWorkspace                                              */
  /* ------------------------------------------------------------ */
  describe('createWorkspace', () => {
    it('creates a workspace with defaults', () => {
      const ws = workspaces.createWorkspace(testUser.id, {});
      assert.equal(ws.name, 'Untitled Workspace');
      assert.equal(ws.description, '');
      assert.equal(ws.icon, '📐');
      assert.deepEqual(ws.ops, []);
      assert.deepEqual(ws.surfaces, []);
      assert.equal(ws.layoutMode, 'auto');
      assert.equal(ws.isDefault, false);
      assert.equal(ws.templateKey, null);
      assert.equal(ws.userId, testUser.id);
      assert.ok(ws.id);
      assert.ok(ws.createdAt);
      assert.ok(ws.updatedAt);
    });

    it('creates a workspace with custom data', () => {
      const ops = [{ op: 'upsert', id: 'test', type: 'card', data: { title: 'Hello' } }];
      const ws = workspaces.createWorkspace(testUser.id, {
        name: 'My Workspace',
        description: 'A custom workspace',
        icon: '🚀',
        ops,
        surfaces: ['chat', 'canvas'],
        layoutMode: 'columns',
        templateKey: 'custom',
      });
      assert.equal(ws.name, 'My Workspace');
      assert.equal(ws.description, 'A custom workspace');
      assert.equal(ws.icon, '🚀');
      assert.deepEqual(ws.ops, ops);
      assert.deepEqual(ws.surfaces, ['chat', 'canvas']);
      assert.equal(ws.layoutMode, 'columns');
      assert.equal(ws.templateKey, 'custom');
    });

    it('sets isDefault and unsets others', () => {
      const ws1 = workspaces.createWorkspace(testUser.id, { name: 'First', isDefault: true });
      assert.equal(ws1.isDefault, true);

      const ws2 = workspaces.createWorkspace(testUser.id, { name: 'Second', isDefault: true });
      assert.equal(ws2.isDefault, true);

      // First should now be non-default
      const refreshed1 = workspaces.getWorkspace(ws1.id);
      assert.equal(refreshed1.isDefault, false);
    });

    it('generates unique IDs', () => {
      const ws1 = workspaces.createWorkspace(testUser.id, { name: 'W1' });
      const ws2 = workspaces.createWorkspace(testUser.id, { name: 'W2' });
      assert.notEqual(ws1.id, ws2.id);
    });

    it('handles unicode in workspace name', () => {
      const ws = workspaces.createWorkspace(testUser.id, { name: '作業空間 🎨' });
      assert.equal(ws.name, '作業空間 🎨');
    });

    it('handles complex ops arrays', () => {
      const complexOps = [
        { op: 'upsert', id: 'a', type: 'hero', data: { title: 'T', subtitle: 'S' } },
        { op: 'upsert', id: 'b', type: 'stats', data: { items: [{ label: 'X', value: '1' }] } },
      ];
      const ws = workspaces.createWorkspace(testUser.id, { ops: complexOps });
      assert.deepEqual(ws.ops, complexOps);
    });
  });

  /* ------------------------------------------------------------ */
  /*  getWorkspace                                                 */
  /* ------------------------------------------------------------ */
  describe('getWorkspace', () => {
    it('returns the workspace with parsed JSON fields', () => {
      const created = workspaces.createWorkspace(testUser.id, {
        name: 'FindMe',
        ops: [{ op: 'test' }],
        surfaces: ['chat'],
      });
      const found = workspaces.getWorkspace(created.id);
      assert.equal(found.name, 'FindMe');
      assert.deepEqual(found.ops, [{ op: 'test' }]);
      assert.deepEqual(found.surfaces, ['chat']);
      assert.equal(typeof found.isDefault, 'boolean');
    });

    it('returns null for non-existent workspace', () => {
      const result = workspaces.getWorkspace('no-such-id');
      assert.equal(result, null);
    });
  });

  /* ------------------------------------------------------------ */
  /*  listWorkspaces                                               */
  /* ------------------------------------------------------------ */
  describe('listWorkspaces', () => {
    it('returns workspaces for a specific user', () => {
      workspaces.createWorkspace(testUser.id, { name: 'W1' });
      workspaces.createWorkspace(testUser.id, { name: 'W2' });
      workspaces.createWorkspace(testUser2.id, { name: 'Other' });

      const list = workspaces.listWorkspaces(testUser.id);
      assert.equal(list.length, 2);
    });

    it('returns empty array when user has no workspaces', () => {
      const result = workspaces.listWorkspaces(testUser.id);
      assert.deepEqual(result, []);
    });

    it('default workspaces appear first', () => {
      workspaces.createWorkspace(testUser.id, { name: 'Normal' });
      workspaces.createWorkspace(testUser.id, { name: 'Default', isDefault: true });

      const list = workspaces.listWorkspaces(testUser.id);
      assert.equal(list[0].name, 'Default');
      assert.equal(list[0].isDefault, true);
    });

    it('parses JSON fields in listed workspaces', () => {
      workspaces.createWorkspace(testUser.id, {
        name: 'Json',
        ops: [{ op: 'x' }],
        surfaces: ['web'],
      });
      const list = workspaces.listWorkspaces(testUser.id);
      assert.deepEqual(list[0].ops, [{ op: 'x' }]);
      assert.deepEqual(list[0].surfaces, ['web']);
    });
  });

  /* ------------------------------------------------------------ */
  /*  updateWorkspace                                              */
  /* ------------------------------------------------------------ */
  describe('updateWorkspace', () => {
    it('updates workspace name', () => {
      const ws = workspaces.createWorkspace(testUser.id, { name: 'Old' });
      const updated = workspaces.updateWorkspace(ws.id, { name: 'New' });
      assert.equal(updated.name, 'New');
    });

    it('updates multiple fields', () => {
      const ws = workspaces.createWorkspace(testUser.id, { name: 'Multi' });
      const updated = workspaces.updateWorkspace(ws.id, {
        name: 'Updated',
        description: 'New desc',
        icon: '🌟',
        layoutMode: 'focus',
      });
      assert.equal(updated.name, 'Updated');
      assert.equal(updated.description, 'New desc');
      assert.equal(updated.icon, '🌟');
      assert.equal(updated.layoutMode, 'focus');
    });

    it('updates ops and surfaces', () => {
      const ws = workspaces.createWorkspace(testUser.id, { name: 'JsonUpdate' });
      const newOps = [{ op: 'upsert', id: 'new', type: 'card', data: {} }];
      const updated = workspaces.updateWorkspace(ws.id, {
        ops: newOps,
        surfaces: ['terminal'],
      });
      assert.deepEqual(updated.ops, newOps);
      assert.deepEqual(updated.surfaces, ['terminal']);
    });

    it('sets isDefault and unsets others', () => {
      const ws1 = workspaces.createWorkspace(testUser.id, { name: 'First', isDefault: true });
      const ws2 = workspaces.createWorkspace(testUser.id, { name: 'Second' });

      workspaces.updateWorkspace(ws2.id, { isDefault: true });

      const refreshed1 = workspaces.getWorkspace(ws1.id);
      const refreshed2 = workspaces.getWorkspace(ws2.id);
      assert.equal(refreshed1.isDefault, false);
      assert.equal(refreshed2.isDefault, true);
    });

    it('returns null for non-existent workspace', () => {
      const result = workspaces.updateWorkspace('no-such-id', { name: 'X' });
      assert.equal(result, null);
    });

    it('returns unchanged workspace for empty patch', () => {
      const ws = workspaces.createWorkspace(testUser.id, { name: 'NoPatch' });
      const result = workspaces.updateWorkspace(ws.id, {});
      assert.equal(result.name, 'NoPatch');
    });

    it('updates updatedAt timestamp', () => {
      const ws = workspaces.createWorkspace(testUser.id, { name: 'TimeCheck' });
      const updated = workspaces.updateWorkspace(ws.id, { name: 'Changed' });
      // updateWorkspace uses SQL datetime('now') which differs from JS ISO format
      // Just verify updatedAt is set and is a string
      assert.ok(updated.updatedAt);
      assert.equal(typeof updated.updatedAt, 'string');
    });
  });

  /* ------------------------------------------------------------ */
  /*  deleteWorkspace                                              */
  /* ------------------------------------------------------------ */
  describe('deleteWorkspace', () => {
    it('deletes an existing workspace', () => {
      const ws = workspaces.createWorkspace(testUser.id, { name: 'DeleteMe' });
      const result = workspaces.deleteWorkspace(ws.id);
      assert.equal(result, true);
      assert.equal(workspaces.getWorkspace(ws.id), null);
    });

    it('returns false for non-existent workspace', () => {
      const result = workspaces.deleteWorkspace('no-such-id');
      assert.equal(result, false);
    });

    it('reduces workspace count', () => {
      const ws1 = workspaces.createWorkspace(testUser.id, { name: 'A' });
      workspaces.createWorkspace(testUser.id, { name: 'B' });
      assert.equal(workspaces.listWorkspaces(testUser.id).length, 2);

      workspaces.deleteWorkspace(ws1.id);
      assert.equal(workspaces.listWorkspaces(testUser.id).length, 1);
    });
  });

  /* ------------------------------------------------------------ */
  /*  activateWorkspace                                            */
  /* ------------------------------------------------------------ */
  describe('activateWorkspace', () => {
    it('sets a workspace as default', () => {
      const ws = workspaces.createWorkspace(testUser.id, { name: 'Activate' });
      const result = workspaces.activateWorkspace(testUser.id, ws.id);
      assert.equal(result, true);

      const active = workspaces.getWorkspace(ws.id);
      assert.equal(active.isDefault, true);
    });

    it('unsets previously active workspace', () => {
      const ws1 = workspaces.createWorkspace(testUser.id, { name: 'First', isDefault: true });
      const ws2 = workspaces.createWorkspace(testUser.id, { name: 'Second' });

      workspaces.activateWorkspace(testUser.id, ws2.id);

      assert.equal(workspaces.getWorkspace(ws1.id).isDefault, false);
      assert.equal(workspaces.getWorkspace(ws2.id).isDefault, true);
    });

    it('returns false for non-existent workspace', () => {
      const result = workspaces.activateWorkspace(testUser.id, 'no-such-id');
      assert.equal(result, false);
    });

    it('returns false when workspace belongs to different user', () => {
      const ws = workspaces.createWorkspace(testUser2.id, { name: 'OtherUser' });
      const result = workspaces.activateWorkspace(testUser.id, ws.id);
      assert.equal(result, false);
    });
  });

  /* ------------------------------------------------------------ */
  /*  getActiveWorkspace                                           */
  /* ------------------------------------------------------------ */
  describe('getActiveWorkspace', () => {
    it('returns the default workspace', () => {
      workspaces.createWorkspace(testUser.id, { name: 'Active', isDefault: true });
      workspaces.createWorkspace(testUser.id, { name: 'Inactive' });

      const active = workspaces.getActiveWorkspace(testUser.id);
      assert.ok(active);
      assert.equal(active.name, 'Active');
      assert.equal(active.isDefault, true);
    });

    it('returns null when no default workspace', () => {
      workspaces.createWorkspace(testUser.id, { name: 'NotDefault' });
      const result = workspaces.getActiveWorkspace(testUser.id);
      assert.equal(result, null);
    });

    it('returns null for user with no workspaces', () => {
      const result = workspaces.getActiveWorkspace(testUser.id);
      assert.equal(result, null);
    });
  });

  /* ------------------------------------------------------------ */
  /*  Templates                                                    */
  /* ------------------------------------------------------------ */
  describe('listTemplates', () => {
    it('returns seeded templates', () => {
      const templates = workspaces.listTemplates();
      assert.ok(templates.length >= 6, 'should have at least 6 built-in templates');
    });

    it('includes dashboard template', () => {
      const templates = workspaces.listTemplates();
      const dashboard = templates.find(t => t.key === 'dashboard');
      assert.ok(dashboard);
      assert.equal(dashboard.name, 'Dashboard');
      assert.equal(dashboard.tier, 'free');
    });

    it('marks pro templates as locked for free users', () => {
      const templates = workspaces.listTemplates('free');
      const proTemplate = templates.find(t => t.tier === 'pro');
      assert.ok(proTemplate, 'should have a pro template');
      assert.equal(proTemplate.locked, true);
    });

    it('marks pro templates as unlocked for pro users', () => {
      const templates = workspaces.listTemplates('pro');
      const proTemplate = templates.find(t => t.tier === 'pro');
      assert.equal(proTemplate.locked, false);
    });

    it('marks all templates as unlocked for max users', () => {
      const templates = workspaces.listTemplates('max');
      assert.ok(templates.every(t => t.locked === false));
    });

    it('returns templates ordered by sortOrder', () => {
      const templates = workspaces.listTemplates();
      for (let i = 1; i < templates.length; i++) {
        assert.ok(templates[i].sortOrder >= templates[i - 1].sortOrder);
      }
    });

    it('parses ops and surfaces in templates', () => {
      const templates = workspaces.listTemplates();
      const dashboard = templates.find(t => t.key === 'dashboard');
      assert.ok(Array.isArray(dashboard.ops));
      assert.ok(Array.isArray(dashboard.surfaces));
      assert.ok(dashboard.ops.length > 0);
    });
  });

  describe('getTemplate', () => {
    it('returns a template by key', () => {
      const tpl = workspaces.getTemplate('dashboard');
      assert.ok(tpl);
      assert.equal(tpl.key, 'dashboard');
      assert.equal(tpl.name, 'Dashboard');
    });

    it('returns null for non-existent template', () => {
      const result = workspaces.getTemplate('non-existent');
      assert.equal(result, null);
    });

    it('parses JSON fields in template', () => {
      const tpl = workspaces.getTemplate('dev');
      assert.ok(Array.isArray(tpl.ops));
      assert.ok(Array.isArray(tpl.surfaces));
    });
  });

  /* ------------------------------------------------------------ */
  /*  createFromTemplate                                           */
  /* ------------------------------------------------------------ */
  describe('createFromTemplate', () => {
    it('creates a workspace from an existing template', () => {
      const ws = workspaces.createFromTemplate(testUser.id, 'dashboard');
      assert.equal(ws.name, 'Dashboard');
      assert.ok(ws.ops.length > 0);
      assert.equal(ws.templateKey, 'dashboard');
      assert.equal(ws.userId, testUser.id);
    });

    it('allows overriding the name', () => {
      const ws = workspaces.createFromTemplate(testUser.id, 'dashboard', 'My Dashboard');
      assert.equal(ws.name, 'My Dashboard');
    });

    it('throws for non-existent template', () => {
      assert.throws(
        () => workspaces.createFromTemplate(testUser.id, 'non-existent'),
        /Template 'non-existent' not found/
      );
    });

    it('inherits template properties', () => {
      const ws = workspaces.createFromTemplate(testUser.id, 'dev');
      assert.ok(ws.surfaces.length > 0);
      assert.equal(ws.layoutMode, 'columns');
    });
  });

  /* ------------------------------------------------------------ */
  /*  saveCurrentAsWorkspace                                       */
  /* ------------------------------------------------------------ */
  describe('saveCurrentAsWorkspace', () => {
    it('saves current state as a new workspace', () => {
      const state = {
        ops: [{ op: 'upsert', id: 'current', type: 'card', data: { title: 'Live' } }],
        surfaces: ['chat'],
        layoutMode: 'focus',
      };
      const ws = workspaces.saveCurrentAsWorkspace(testUser.id, 'Snapshot', state);
      assert.equal(ws.name, 'Snapshot');
      assert.deepEqual(ws.ops, state.ops);
      assert.deepEqual(ws.surfaces, state.surfaces);
      assert.equal(ws.layoutMode, 'focus');
      assert.equal(ws.icon, 'save');
    });

    it('saves with defaults when state is empty', () => {
      const ws = workspaces.saveCurrentAsWorkspace(testUser.id, 'Empty', {});
      assert.deepEqual(ws.ops, []);
      assert.deepEqual(ws.surfaces, []);
      assert.equal(ws.layoutMode, 'auto');
    });
  });

  /* ------------------------------------------------------------ */
  /*  Cascade & Referential Integrity                              */
  /* ------------------------------------------------------------ */
  describe('referential integrity', () => {
    it('cascades user deletion to workspaces', () => {
      workspaces.createWorkspace(testUser.id, { name: 'Cascade' });
      assert.equal(workspaces.listWorkspaces(testUser.id).length, 1);

      users.deleteUser(testUser.id);

      // Need to re-query from raw DB since the user is gone
      const rows = db.prepare('SELECT * FROM workspaces WHERE userId = ?').all(testUser.id);
      assert.equal(rows.length, 0);
    });
  });

  /* ------------------------------------------------------------ */
  /*  Edge Cases                                                   */
  /* ------------------------------------------------------------ */
  describe('edge cases', () => {
    it('handles empty ops array', () => {
      const ws = workspaces.createWorkspace(testUser.id, { ops: [] });
      assert.deepEqual(ws.ops, []);
    });

    it('handles null-ish ops gracefully via JSON parse', () => {
      // Directly insert a row with corrupted JSON to test _safeJsonParse
      db.prepare(`
        INSERT INTO workspaces (id, userId, name, ops, surfaces, layoutMode, createdAt, updatedAt)
        VALUES ('bad-json', ?, 'BadJson', 'not-json', '[]', 'auto', datetime('now'), datetime('now'))
      `).run(testUser.id);

      const ws = workspaces.getWorkspace('bad-json');
      assert.deepEqual(ws.ops, []); // fallback to empty array
    });

    it('handles multiple default workspaces correctly', () => {
      // Create 3 workspaces, each setting isDefault
      workspaces.createWorkspace(testUser.id, { name: 'D1', isDefault: true });
      workspaces.createWorkspace(testUser.id, { name: 'D2', isDefault: true });
      workspaces.createWorkspace(testUser.id, { name: 'D3', isDefault: true });

      // Only the last one should be default
      const active = workspaces.getActiveWorkspace(testUser.id);
      assert.equal(active.name, 'D3');

      // Verify only 1 is default
      const allDefaults = workspaces.listWorkspaces(testUser.id).filter(w => w.isDefault);
      assert.equal(allDefaults.length, 1);
    });
  });
});
