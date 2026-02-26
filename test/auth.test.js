/**
 * @module test/auth
 * Hardened unit tests for server/auth.js
 * Uses Node.js built-in test runner (node:test + node:assert).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { getDb, initSchema } from '../state/db.js';
import { init as initUsers } from '../state/users.js';
import { init as initSessions, createSession as rawCreateSession } from '../state/sessions.js';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  login,
  signup,
  validateSession,
  logout,
} from '../server/auth.js';

/* ------------------------------------------------------------------ */
/*  DB Setup / Teardown                                               */
/* ------------------------------------------------------------------ */

const dbPath = path.join(os.tmpdir(), `scratchy-auth-test-${crypto.randomUUID()}.db`);
let db;

before(() => {
  db = getDb(dbPath);
  initSchema(db);
  initUsers(db);
  initSessions(db);
});

after(() => {
  try { db.close(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch {}
  }
});

/* ------------------------------------------------------------------ */
/*  hashPassword                                                      */
/* ------------------------------------------------------------------ */

describe('hashPassword', () => {
  it('returns a string in "salt:hash" format', async () => {
    const result = await hashPassword('test123');
    const parts = result.split(':');
    assert.equal(parts.length, 2, 'should have exactly one colon separator');
    assert.ok(parts[0].length > 0, 'salt should be non-empty');
    assert.ok(parts[1].length > 0, 'hash should be non-empty');
  });

  it('different calls produce different salts', async () => {
    const h1 = await hashPassword('samepass');
    const h2 = await hashPassword('samepass');
    const salt1 = h1.split(':')[0];
    const salt2 = h2.split(':')[0];
    assert.notEqual(salt1, salt2, 'salts should differ between calls');
  });

  it('output is hex-encoded (matches /^[0-9a-f]+:[0-9a-f]+$/)', async () => {
    const result = await hashPassword('hexcheck');
    assert.match(result, /^[0-9a-f]+:[0-9a-f]+$/, 'should be lowercase hex:hex');
  });
});

/* ------------------------------------------------------------------ */
/*  verifyPassword                                                    */
/* ------------------------------------------------------------------ */

describe('verifyPassword', () => {
  it('correct password returns true', async () => {
    const hash = await hashPassword('correct');
    const ok = await verifyPassword('correct', hash);
    assert.equal(ok, true);
  });

  it('wrong password returns false', async () => {
    const hash = await hashPassword('correct');
    const ok = await verifyPassword('WRONG', hash);
    assert.equal(ok, false);
  });

  it('malformed hash (no colon) returns false', async () => {
    const ok = await verifyPassword('anything', 'noColonHere');
    assert.equal(ok, false);
  });

  it('empty hash returns false', async () => {
    const ok = await verifyPassword('anything', '');
    assert.equal(ok, false);
  });
});

/* ------------------------------------------------------------------ */
/*  generateToken                                                     */
/* ------------------------------------------------------------------ */

describe('generateToken', () => {
  it('returns a hex string', () => {
    const token = generateToken();
    assert.match(token, /^[0-9a-f]+$/);
  });

  it('default length is 64 chars (32 bytes × 2)', () => {
    const token = generateToken();
    assert.equal(token.length, 64);
  });

  it('custom byte count changes length', () => {
    const token16 = generateToken(16);
    assert.equal(token16.length, 32, '16 bytes → 32 hex chars');

    const token8 = generateToken(8);
    assert.equal(token8.length, 16, '8 bytes → 16 hex chars');
  });

  it('tokens are unique (100 generated, no duplicates)', () => {
    const tokens = new Set();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken());
    }
    assert.equal(tokens.size, 100, 'all 100 tokens should be unique');
  });
});

/* ------------------------------------------------------------------ */
/*  login (high-level)                                                */
/* ------------------------------------------------------------------ */

describe('login', () => {
  before(async () => {
    // Seed a user for login tests
    await signup('login_user', 'secret123');
  });

  it('valid credentials return token + user', async () => {
    const result = await login('login_user', 'secret123');
    assert.ok(result.token, 'should have a token');
    assert.ok(result.user, 'should have a user');
    assert.equal(result.user.username, 'login_user');
    assert.ok(result.user.id, 'user should have an id');
  });

  it('wrong password throws with status 401', async () => {
    await assert.rejects(
      () => login('login_user', 'wrongpassword'),
      (err) => {
        assert.equal(err.status, 401);
        assert.match(err.message, /invalid credentials/i);
        return true;
      }
    );
  });

  it('non-existent username throws with status 401', async () => {
    await assert.rejects(
      () => login('nonexistent_user_xyz', 'anypass'),
      (err) => {
        assert.equal(err.status, 401);
        return true;
      }
    );
  });

  it('token from login can be used with validateSession', async () => {
    const { token, user } = await login('login_user', 'secret123');
    const sessionUser = await validateSession(token);
    assert.equal(sessionUser.id, user.id);
    assert.equal(sessionUser.username, 'login_user');
  });
});

/* ------------------------------------------------------------------ */
/*  signup (high-level)                                               */
/* ------------------------------------------------------------------ */

describe('signup', () => {
  it('new user creates user + session + returns token', async () => {
    const result = await signup('signup_fresh', 'pass456');
    assert.ok(result.token, 'should return a token');
    assert.ok(result.user.id, 'user should have id');
    assert.equal(result.user.username, 'signup_fresh');

    // Token should be valid
    const sessionUser = await validateSession(result.token);
    assert.equal(sessionUser.username, 'signup_fresh');
  });

  it('duplicate username throws with status 409', async () => {
    await signup('dupe_user', 'pass1');
    await assert.rejects(
      () => signup('dupe_user', 'pass2'),
      (err) => {
        assert.equal(err.status, 409);
        assert.match(err.message, /already taken/i);
        return true;
      }
    );
  });

  it('optional displayName is stored', async () => {
    const result = await signup('display_user', 'pass789', 'Display Name');
    assert.equal(result.user.displayName, 'Display Name');

    const sessionUser = await validateSession(result.token);
    assert.equal(sessionUser.displayName, 'Display Name');
  });
});

/* ------------------------------------------------------------------ */
/*  validateSession                                                   */
/* ------------------------------------------------------------------ */

describe('validateSession', () => {
  it('valid token returns user info', async () => {
    const { token } = await signup('validate_user', 'passval');
    const user = await validateSession(token);
    assert.equal(user.username, 'validate_user');
    assert.ok(user.id);
    assert.ok('role' in user, 'should include role');
  });

  it('expired token throws with status 401', async () => {
    // Create a user, then create a session that's already expired
    const { user } = await signup('expire_user', 'passexp');
    const expiredToken = generateToken();
    // Create session with negative TTL → already expired
    rawCreateSession(user.id, expiredToken, -10000);

    await assert.rejects(
      () => validateSession(expiredToken),
      (err) => {
        assert.equal(err.status, 401);
        return true;
      }
    );
  });

  it('invalid (random) token throws with status 401', async () => {
    await assert.rejects(
      () => validateSession('totally_bogus_token_abc123'),
      (err) => {
        assert.equal(err.status, 401);
        return true;
      }
    );
  });

  it('deleted user → session fails (cascade or user-not-found)', async () => {
    const { token, user } = await signup('ghost_user', 'ghostpass');

    // Verify session works first
    const validUser = await validateSession(token);
    assert.equal(validUser.username, 'ghost_user');

    // Disable FK to delete user without cascading, so the session remains
    // but the user is gone — tests the "User not found" path in validateSession
    db.pragma('foreign_keys = OFF');
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    db.pragma('foreign_keys = ON');

    await assert.rejects(
      () => validateSession(token),
      (err) => {
        assert.equal(err.status, 401);
        assert.match(err.message, /user not found/i);
        return true;
      }
    );
  });
});

/* ------------------------------------------------------------------ */
/*  logout                                                            */
/* ------------------------------------------------------------------ */

describe('logout', () => {
  it('deletes session → validateSession fails after', async () => {
    const { token } = await signup('logout_user', 'logoutpass');

    // Session valid before logout
    await validateSession(token);

    const result = await logout(token);
    assert.equal(result, true);

    // Session invalid after logout
    await assert.rejects(
      () => validateSession(token),
      (err) => {
        assert.equal(err.status, 401);
        return true;
      }
    );
  });

  it('non-existent token returns false', async () => {
    const result = await logout('nonexistent_token_xyz');
    assert.equal(result, false);
  });
});
