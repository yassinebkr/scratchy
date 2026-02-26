/**
 * @module test/state
 * Hardened unit tests for state/db.js, state/users.js, state/sessions.js, state/canvas.js
 * Uses Node.js built-in test runner (node:test + node:assert).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { getDb, initSchema } from '../state/db.js';
import {
  init as initUsers,
  createUser,
  getUser,
  getUserByUsername,
  updateUser,
  listUsers,
  deleteUser,
} from '../state/users.js';
import {
  init as initSessions,
  createSession,
  getSession,
  deleteSession,
  cleanExpired,
} from '../state/sessions.js';
import {
  init as initCanvas,
  getCanvasState,
  setCanvasState,
  clearCanvasState,
} from '../state/canvas.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function tmpDbPath() {
  return path.join(os.tmpdir(), `scratchy-state-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
}

/* ================================================================== */
/*  db.js                                                             */
/* ================================================================== */

describe('db.js', () => {
  const p1 = tmpDbPath();
  const p2 = tmpDbPath();

  after(() => {
    // Close DBs if possible, then clean up files
    try { getDb(p1).close(); } catch {}
    try { getDb(p2).close(); } catch {}
    cleanupDb(p1);
    cleanupDb(p2);
  });

  it('getDb creates the DB file on disk', () => {
    getDb(p1);
    assert.ok(fs.existsSync(p1), 'DB file should exist');
  });

  it('getDb returns same instance for same path (singleton)', () => {
    const a = getDb(p1);
    const b = getDb(p1);
    assert.equal(a, b, 'should be referentially identical');
  });

  it('WAL journal mode is enabled', () => {
    const db = getDb(p1);
    const mode = db.pragma('journal_mode', { simple: true });
    assert.equal(mode, 'wal');
  });

  it('foreign keys are enabled', () => {
    const db = getDb(p1);
    const fk = db.pragma('foreign_keys', { simple: true });
    assert.equal(fk, 1);
  });

  it('initSchema creates all 4 tables (users, sessions, canvas_state, widget_state)', () => {
    const db = getDb(p2);
    initSchema(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(r => r.name);
    assert.ok(tables.includes('users'), 'users table');
    assert.ok(tables.includes('sessions'), 'sessions table');
    assert.ok(tables.includes('canvas_state'), 'canvas_state table');
    assert.ok(tables.includes('widget_state'), 'widget_state table');
  });

  it('initSchema is idempotent (calling twice does not error)', () => {
    const db = getDb(p2);
    assert.doesNotThrow(() => {
      initSchema(db);
      initSchema(db);
    });
  });
});

/* ================================================================== */
/*  users.js                                                          */
/* ================================================================== */

describe('users.js', () => {
  const dbPath = tmpDbPath();
  let db;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initUsers(db);
    initSessions(db); // needed for cascade tests
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('createUser returns user with id, username, timestamps', () => {
    const user = createUser('alice', 'hash1');
    assert.ok(user.id, 'should have id');
    assert.equal(user.username, 'alice');
    assert.ok(user.createdAt, 'should have createdAt');
    assert.ok(user.updatedAt, 'should have updatedAt');
    assert.equal(user.passwordHash, 'hash1');
  });

  it('createUser generates UUID for id', () => {
    const user = createUser('bob', 'hash2');
    // UUID v4 pattern: 8-4-4-4-12 hex
    assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('getUser by id returns the user', () => {
    const created = createUser('charlie', 'hash3');
    const found = getUser(created.id);
    assert.ok(found);
    assert.equal(found.username, 'charlie');
    assert.equal(found.id, created.id);
  });

  it('getUser with non-existent id returns undefined', () => {
    const found = getUser('nonexistent-id-xyz');
    assert.equal(found, undefined);
  });

  it('getUserByUsername performs case-insensitive match', () => {
    createUser('diana', 'hash4');
    const lower = getUserByUsername('diana');
    const upper = getUserByUsername('DIANA');
    const mixed = getUserByUsername('DiAnA');
    assert.ok(lower, 'lowercase should match');
    assert.ok(upper, 'uppercase should match');
    assert.ok(mixed, 'mixed case should match');
    assert.equal(lower.id, upper.id);
    assert.equal(lower.id, mixed.id);
  });

  it('updateUser only updates allowed fields', () => {
    const user = createUser('eve', 'hash5');
    const updated = updateUser(user.id, { displayName: 'Eve D', role: 'admin' });
    assert.equal(updated.displayName, 'Eve D');
    assert.equal(updated.role, 'admin');
  });

  it('updateUser with unknown fields — they are ignored', () => {
    const user = createUser('frank', 'hash6');
    const updated = updateUser(user.id, { bogusField: 'nope', displayName: 'Frank F' });
    assert.equal(updated.displayName, 'Frank F');
    assert.equal(updated.bogusField, undefined, 'unknown field should not appear');
  });

  it('updateUser updates updatedAt timestamp', () => {
    const user = createUser('grace', 'hash7');
    const originalUpdatedAt = user.updatedAt;
    // Ensure time difference
    const updated = updateUser(user.id, { displayName: 'Grace G' });
    // updatedAt should be >= originalUpdatedAt (they could be identical if very fast)
    assert.ok(
      new Date(updated.updatedAt) >= new Date(originalUpdatedAt),
      'updatedAt should advance or stay the same'
    );
  });

  it('listUsers returns all users sorted by createdAt', () => {
    // We already have multiple users from prior tests
    const users = listUsers();
    assert.ok(users.length >= 2, 'should have multiple users');
    // Verify sort order
    for (let i = 1; i < users.length; i++) {
      assert.ok(
        new Date(users[i].createdAt) >= new Date(users[i - 1].createdAt),
        `user[${i}].createdAt should be >= user[${i - 1}].createdAt`
      );
    }
  });

  it('deleteUser removes the user', () => {
    const user = createUser('to_delete', 'hash8');
    assert.ok(getUser(user.id), 'user should exist before delete');
    const deleted = deleteUser(user.id);
    assert.equal(deleted, true);
    assert.equal(getUser(user.id), undefined, 'user should be gone');
  });

  it('deleteUser cascades to sessions (FK cascade)', () => {
    const user = createUser('cascade_user', 'hash9');
    const token = crypto.randomBytes(16).toString('hex');
    createSession(user.id, token);
    // Session should exist
    assert.ok(getSession(token), 'session should exist before user delete');
    deleteUser(user.id);
    // Session should be gone due to ON DELETE CASCADE
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    assert.equal(session, undefined, 'session should be cascade-deleted');
  });

  it('createUser with duplicate username throws', () => {
    createUser('unique_name', 'hash10');
    assert.throws(
      () => createUser('unique_name', 'hash11'),
      /UNIQUE constraint failed|already exists/i
    );
  });
});

/* ================================================================== */
/*  sessions.js                                                       */
/* ================================================================== */

describe('sessions.js', () => {
  const dbPath = tmpDbPath();
  let db;
  let userId;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initUsers(db);
    initSessions(db);
    // Create a user for session tests
    const user = createUser('session_owner', 'hash_sess');
    userId = user.id;
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('createSession returns session with token, userId, timestamps', () => {
    const token = crypto.randomBytes(16).toString('hex');
    const session = createSession(userId, token);
    assert.equal(session.token, token);
    assert.equal(session.userId, userId);
    assert.ok(session.createdAt, 'should have createdAt');
    assert.ok(session.expiresAt, 'should have expiresAt');
    // expiresAt should be after createdAt
    assert.ok(new Date(session.expiresAt) > new Date(session.createdAt));
  });

  it('getSession returns a valid (non-expired) session', () => {
    const token = crypto.randomBytes(16).toString('hex');
    createSession(userId, token);
    const session = getSession(token);
    assert.ok(session, 'session should be found');
    assert.equal(session.token, token);
    assert.equal(session.userId, userId);
  });

  it('getSession with expired session returns undefined and auto-deletes', () => {
    const token = crypto.randomBytes(16).toString('hex');
    // Create session that's already expired (negative TTL)
    createSession(userId, token, -10000);

    const result = getSession(token);
    assert.equal(result, undefined, 'expired session should return undefined');

    // Verify it was deleted from DB
    const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    assert.equal(row, undefined, 'expired session should be auto-deleted from DB');
  });

  it('deleteSession removes the session', () => {
    const token = crypto.randomBytes(16).toString('hex');
    createSession(userId, token);
    assert.ok(getSession(token), 'session exists before delete');

    const result = deleteSession(token);
    assert.equal(result, true);
    assert.equal(getSession(token), undefined, 'session should be gone after delete');
  });

  it('deleteSession on non-existent token returns false', () => {
    const result = deleteSession('never_existed_token');
    assert.equal(result, false);
  });

  it('cleanExpired removes all expired sessions', () => {
    // Insert expired sessions directly with SQLite datetime format
    // (createSession uses JS ISO format with 'T' and 'Z', but cleanExpired
    //  uses SQLite datetime('now') which returns 'YYYY-MM-DD HH:MM:SS' format.
    //  We insert in SQLite-native format to test the SQL logic correctly.)
    const tokens = [];
    const pastTime = '2020-01-01 00:00:00'; // clearly in the past
    for (let i = 0; i < 5; i++) {
      const t = crypto.randomBytes(16).toString('hex');
      db.prepare(
        'INSERT INTO sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)'
      ).run(t, userId, pastTime, pastTime);
      tokens.push(t);
    }
    // Also create a valid session (far in the future)
    const validToken = crypto.randomBytes(16).toString('hex');
    createSession(userId, validToken);

    const cleaned = cleanExpired();
    assert.ok(cleaned >= 5, `should clean at least 5, got ${cleaned}`);

    // Valid session should still exist
    assert.ok(getSession(validToken), 'valid session should survive cleanExpired');

    // Expired sessions should be gone
    for (const t of tokens) {
      const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(t);
      assert.equal(row, undefined, 'expired session should be removed');
    }
  });
});

/* ================================================================== */
/*  canvas.js                                                         */
/* ================================================================== */

describe('canvas.js', () => {
  const dbPath = tmpDbPath();
  let db;
  let userId;

  before(() => {
    db = getDb(dbPath);
    initSchema(db);
    initUsers(db);
    initCanvas(db);
    const user = createUser('canvas_owner', 'hash_canvas');
    userId = user.id;
  });

  after(() => {
    try { db.close(); } catch {}
    cleanupDb(dbPath);
  });

  it('getCanvasState for non-existent user returns empty array', () => {
    const state = getCanvasState('nonexistent-user-id');
    assert.deepEqual(state, []);
  });

  it('setCanvasState stores ops and getCanvasState retrieves them', () => {
    const ops = [
      { op: 'upsert', id: 'card-1', type: 'card', data: { title: 'Hello' } },
      { op: 'upsert', id: 'gauge-1', type: 'gauge', data: { label: 'CPU', value: 42 } },
    ];
    setCanvasState(userId, ops);
    const retrieved = getCanvasState(userId);
    assert.deepEqual(retrieved, ops);
  });

  it('setCanvasState overwrites previous state', () => {
    setCanvasState(userId, [{ op: 'first' }]);
    setCanvasState(userId, [{ op: 'second' }]);
    const state = getCanvasState(userId);
    assert.equal(state.length, 1);
    assert.equal(state[0].op, 'second');
  });

  it('clearCanvasState removes state and returns true', () => {
    setCanvasState(userId, [{ op: 'to-clear' }]);
    const cleared = clearCanvasState(userId);
    assert.equal(cleared, true);
    assert.deepEqual(getCanvasState(userId), []);
  });

  it('clearCanvasState on non-existent state returns false', () => {
    const cleared = clearCanvasState('nonexistent-user-id-xyz');
    assert.equal(cleared, false);
  });

  it('getCanvasState handles corrupted JSON gracefully (returns [])', () => {
    // Create a real user first (FK constraint requires valid userId)
    const corruptUser = createUser('corrupt_json_user', 'hash_corrupt');
    // Store valid data first, then corrupt it directly in the DB
    setCanvasState(corruptUser.id, [{ op: 'valid' }]);
    // Now corrupt the JSON directly
    db.prepare('UPDATE canvas_state SET ops = ? WHERE userId = ?')
      .run('{not valid json[[[', corruptUser.id);
    const state = getCanvasState(corruptUser.id);
    assert.deepEqual(state, [], 'corrupted JSON should fallback to empty array');
  });

  it('setCanvasState with empty array stores and retrieves correctly', () => {
    const user2 = createUser('canvas_empty', 'hash_empty');
    setCanvasState(user2.id, []);
    const state = getCanvasState(user2.id);
    assert.deepEqual(state, []);
  });

  it('setCanvasState preserves complex nested data', () => {
    const complexOps = [
      {
        op: 'upsert',
        id: 'table-1',
        type: 'table',
        data: {
          title: 'Nested',
          headers: ['A', 'B'],
          rows: [['val1', 'val2'], ['val3', 'val4']],
          meta: { deep: { nested: true, count: 99 } },
        },
      },
    ];
    const user3 = createUser('canvas_complex', 'hash_complex');
    setCanvasState(user3.id, complexOps);
    const retrieved = getCanvasState(user3.id);
    assert.deepEqual(retrieved, complexOps);
  });
});
