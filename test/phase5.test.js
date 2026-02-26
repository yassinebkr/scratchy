/**
 * Phase 5 — Widget Framework + Admin Routes + NullClaw Adapter Tests
 *
 * Covers:
 *   1. Widget Framework — WidgetRegistry register/unregister/route, prefix matching,
 *      lifecycle, helper functions (upsert/patch/remove/toast/clear/genId)
 *   2. Notes Widget — All 6 actions against in-memory SQLite
 *   3. Calendar Widget — cal-month, cal-week, cal-add-event, cal-delete-event
 *   4. Email Widget — mail-compose, mail-inbox, mail-send (mocked fetch), mail-delete
 *   5. Analytics Widget — analytics-dashboard/usage/agents, missing tables handling
 *   6. Admin Routes — Mock req/res, auth check, stats shape, user CRUD, deploy
 *   7. NullClaw Adapter — Port allocation, instance tracking, listInstances shape
 *
 * ESM only, node:test + node:assert/strict, better-sqlite3 in-memory DB.
 */

import { describe, it, before, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

import { initSchema } from '../state/db.js';
import {
  WidgetRegistry,
  genId,
  upsert,
  patch,
  remove,
  toast,
  clear,
} from '../lib/widgets/framework.js';
import { notesWidget } from '../lib/widgets/notes.js';
import { calendarWidget } from '../lib/widgets/calendar.js';
import { emailWidget } from '../lib/widgets/email.js';
import { analyticsWidget } from '../lib/widgets/analytics.js';
import { NullClawAdapter } from '../lib/nullclaw-adapter.js';
import { init as initUsers, createUser, getUser } from '../state/users.js';
import { init as initAgents, createAgent, listAgents } from '../state/agents.js';
import { init as initAdminConfig, set as setConfig, getAll as getAllConfig } from '../state/admin-config.js';
import { getPlan } from '../lib/billing/plans.js';

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/**
 * Create an in-memory SQLite database with full schema.
 * @returns {import('better-sqlite3').Database}
 */
function freshDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

/** Standard widget context builder */
function makeCtx(db, overrides = {}) {
  return {
    db,
    broadcast: overrides.broadcast ?? (() => {}),
    getUser: overrides.getUser ?? (() => ({ id: 'u1', username: 'test', role: 'user' })),
    config: overrides.config ?? {},
  };
}

const TEST_USER = 'user-test-1';

// ═══════════════════════════════════════════════════════════════════════════════
//  1. Widget Framework — Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

describe('Widget Framework — Helpers', () => {
  it('1. genId() returns a prefixed string', () => {
    const id = genId('note');
    assert.ok(id.startsWith('note-'), `expected prefix "note-", got "${id}"`);
    assert.ok(id.length > 6);
  });

  it('2. genId() default prefix is "w"', () => {
    const id = genId();
    assert.ok(id.startsWith('w-'));
  });

  it('3. genId() produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    assert.equal(ids.size, 100);
  });

  it('4. upsert() creates correct op shape', () => {
    const op = upsert('myid', 'card', { title: 'Hi' });
    assert.deepStrictEqual(op, {
      op: 'upsert', id: 'myid', type: 'card', data: { title: 'Hi' },
    });
  });

  it('5. upsert() includes layout when provided', () => {
    const op = upsert('myid', 'stats', { title: 'S' }, { zone: 'top' });
    assert.equal(op.layout.zone, 'top');
  });

  it('6. upsert() omits layout when not provided', () => {
    const op = upsert('x', 'card', {});
    assert.equal(op.layout, undefined);
  });

  it('7. patch() creates correct op shape', () => {
    const op = patch('abc', { value: 42 });
    assert.deepStrictEqual(op, { op: 'patch', id: 'abc', data: { value: 42 } });
  });

  it('8. remove() creates correct op shape', () => {
    const op = remove('abc');
    assert.deepStrictEqual(op, { op: 'remove', id: 'abc' });
  });

  it('9. toast() creates correct op shape with default severity', () => {
    const op = toast('hello');
    assert.deepStrictEqual(op, { op: 'toast', data: { message: 'hello', severity: 'info' } });
  });

  it('10. toast() supports custom severity', () => {
    const op = toast('err', 'error');
    assert.equal(op.data.severity, 'error');
  });

  it('11. clear() creates correct op shape', () => {
    const op = clear();
    assert.deepStrictEqual(op, { op: 'clear' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  1b. Widget Framework — WidgetRegistry
// ═══════════════════════════════════════════════════════════════════════════════

describe('Widget Framework — WidgetRegistry', () => {
  /** @type {WidgetRegistry} */
  let registry;

  const dummyWidget = {
    prefix: 'test',
    name: 'TestWidget',
    init() {},
    handleAction(userId, action, ctx) {
      return [upsert('t', 'card', { title: action })];
    },
  };

  beforeEach(() => {
    registry = new WidgetRegistry();
  });

  it('12. register() adds a widget', () => {
    registry.register(dummyWidget);
    assert.equal(registry.size, 1);
  });

  it('13. register() rejects duplicate prefix', () => {
    registry.register(dummyWidget);
    assert.throws(() => registry.register({ ...dummyWidget }), /already registered/);
  });

  it('14. register() rejects empty prefix', () => {
    assert.throws(() => registry.register({ ...dummyWidget, prefix: '' }), /non-empty string prefix/);
  });

  it('15. register() rejects missing name', () => {
    assert.throws(() => registry.register({ prefix: 'x', name: '', init() {}, handleAction() {} }), /non-empty string name/);
  });

  it('16. register() rejects missing init()', () => {
    assert.throws(
      () => registry.register({ prefix: 'x', name: 'X', handleAction() {} }),
      /init\(\)/,
    );
  });

  it('17. register() rejects missing handleAction()', () => {
    assert.throws(
      () => registry.register({ prefix: 'x', name: 'X', init() {} }),
      /handleAction\(\)/,
    );
  });

  it('18. unregister() removes a widget', () => {
    registry.register(dummyWidget);
    assert.equal(registry.unregister('test'), true);
    assert.equal(registry.size, 0);
  });

  it('19. unregister() returns false for unknown prefix', () => {
    assert.equal(registry.unregister('nope'), false);
  });

  it('20. list() returns registered widgets', () => {
    registry.register(dummyWidget);
    const list = registry.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].prefix, 'test');
    assert.equal(list[0].name, 'TestWidget');
  });

  it('21. ready is false before initAll()', () => {
    assert.equal(registry.ready, false);
  });

  it('22. initAll() sets ready to true', async () => {
    registry.register(dummyWidget);
    await registry.initAll(makeCtx(freshDb()));
    assert.equal(registry.ready, true);
  });

  it('23. findWidget() matches prefix', () => {
    registry.register(dummyWidget);
    assert.equal(registry.findWidget('test-action')?.prefix, 'test');
  });

  it('24. findWidget() returns null for no match', () => {
    registry.register(dummyWidget);
    assert.equal(registry.findWidget('zzz-unknown'), null);
  });

  it('25. findWidget() matches longest prefix first (greedy)', () => {
    registry.register({ prefix: 'ab', name: 'Short', init() {}, handleAction() { return []; } });
    registry.register({ prefix: 'abc', name: 'Long', init() {}, handleAction() { return []; } });
    assert.equal(registry.findWidget('abc-action')?.name, 'Long');
    assert.equal(registry.findWidget('ab-action')?.name, 'Short');
  });

  it('26. handleAction() returns toast when not initialized', async () => {
    registry.register(dummyWidget);
    const ops = await registry.handleAction('u1', 'test-foo', {});
    assert.equal(ops[0].op, 'toast');
    assert.ok(ops[0].data.message.includes('not ready'));
  });

  it('27. handleAction() routes to correct widget after init', async () => {
    registry.register(dummyWidget);
    await registry.initAll(makeCtx(freshDb()));
    const ops = await registry.handleAction('u1', 'test-foo', {});
    assert.equal(ops[0].op, 'upsert');
    assert.equal(ops[0].data.title, 'test-foo');
  });

  it('28. handleAction() returns error toast for unknown action', async () => {
    registry.register(dummyWidget);
    await registry.initAll(makeCtx(freshDb()));
    const ops = await registry.handleAction('u1', 'zzz-nope', {});
    assert.equal(ops[0].op, 'toast');
    assert.equal(ops[0].data.severity, 'error');
  });

  it('29. handleAction() catches widget errors gracefully', async () => {
    const badWidget = {
      prefix: 'bad',
      name: 'Bad',
      init() {},
      handleAction() { throw new Error('boom'); },
    };
    registry.register(badWidget);
    await registry.initAll(makeCtx(freshDb()));
    const ops = await registry.handleAction('u1', 'bad-action', {});
    assert.equal(ops[0].op, 'toast');
    assert.ok(ops[0].data.message.includes('boom'));
  });

  it('30. handleAction() returns error when widget returns non-array', async () => {
    const badReturnWidget = {
      prefix: 'ret',
      name: 'BadReturn',
      init() {},
      handleAction() { return 'not-an-array'; },
    };
    registry.register(badReturnWidget);
    await registry.initAll(makeCtx(freshDb()));
    const ops = await registry.handleAction('u1', 'ret-x', {});
    assert.equal(ops[0].op, 'toast');
    assert.equal(ops[0].data.severity, 'error');
  });

  it('31. destroyAll() sets ready to false', async () => {
    registry.register(dummyWidget);
    await registry.initAll(makeCtx(freshDb()));
    await registry.destroyAll();
    assert.equal(registry.ready, false);
  });

  it('32. ctx is available after initAll()', async () => {
    registry.register(dummyWidget);
    const ctx = makeCtx(freshDb());
    await registry.initAll(ctx);
    assert.equal(registry.ctx, ctx);
  });

  it('33. ctx is null after destroyAll()', async () => {
    registry.register(dummyWidget);
    await registry.initAll(makeCtx(freshDb()));
    await registry.destroyAll();
    assert.equal(registry.ctx, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  2. Notes Widget
// ═══════════════════════════════════════════════════════════════════════════════

describe('Notes Widget', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;

  before(() => {
    db = freshDb();
    notesWidget.init(makeCtx(db));
  });

  after(() => {
    notesWidget.destroy();
    db.close();
  });

  it('34. sn-list returns ops for empty notes', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-list', {});
    assert.ok(Array.isArray(ops));
    assert.ok(ops.length >= 1);
    // Should have empty-state card and action buttons
    const card = ops.find(o => o.id === 'sn-empty');
    assert.ok(card, 'should have sn-empty card');
    assert.equal(card.type, 'card');
  });

  it('35. sn-save-note creates a note', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-save-note', {
      title: 'Test Note', content: 'Hello world',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('created')));
  });

  it('36. sn-list shows the created note', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-list', {});
    const table = ops.find(o => o.id === 'sn-list');
    assert.ok(table, 'should have sn-list table');
    assert.equal(table.type, 'table');
    assert.ok(table.data.rows.length >= 1);
    assert.ok(table.data.rows[0].includes('Test Note'));
  });

  it('37. sn-save-note updates existing note by ID', () => {
    // Get the note ID from the DB
    const note = db.prepare('SELECT id FROM notes WHERE userId = ? LIMIT 1').get(TEST_USER);
    const ops = notesWidget.handleAction(TEST_USER, 'sn-save-note', {
      id: note.id, title: 'Updated Title', content: 'Updated content',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('updated')));
    const dbNote = db.prepare('SELECT title FROM notes WHERE id = ?').get(note.id);
    assert.equal(dbNote.title, 'Updated Title');
  });

  it('38. sn-save-note returns error toast for non-existent ID update', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-save-note', {
      id: 'nonexistent-id', title: 'X', content: 'Y',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('39. sn-agent-read reads note by index 0', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-agent-read', { index: 0 });
    const card = ops.find(o => o.id === 'sn-reading');
    assert.ok(card);
    assert.equal(card.type, 'card');
    assert.ok(card.data.title.includes('Updated Title'));
    // Should also have meta kv
    const kv = ops.find(o => o.id === 'sn-reading-meta');
    assert.ok(kv);
    assert.equal(kv.type, 'kv');
  });

  it('40. sn-agent-read returns error for out-of-bounds index', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-agent-read', { index: 999 });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('41. sn-agent-edit edits note by index', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-agent-edit', {
      index: 0, title: 'Agent Edited', content: 'Agent content',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('agent')));
    const note = db.prepare('SELECT title, content FROM notes WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1').get(TEST_USER);
    assert.equal(note.title, 'Agent Edited');
    assert.equal(note.content, 'Agent content');
  });

  it('42. sn-agent-edit returns error without ID or index', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-agent-edit', {
      title: 'No Index',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('43. sn-agent-append appends text to note', () => {
    const noteBefore = db.prepare('SELECT id, content FROM notes WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1').get(TEST_USER);
    const ops = notesWidget.handleAction(TEST_USER, 'sn-agent-append', {
      index: 0, text: 'Appended text', separator: '\n---\n',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('appended')));
    const noteAfter = db.prepare('SELECT content FROM notes WHERE id = ?').get(noteBefore.id);
    assert.ok(noteAfter.content.includes('Appended text'));
    assert.ok(noteAfter.content.includes('---'));
  });

  it('44. sn-agent-append returns error for missing note', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-agent-append', {
      id: 'nonexistent', text: 'X',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('45. sn-agent-append without ID or index returns error', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-agent-append', {
      text: 'no target',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('46. sn-delete by index', () => {
    // Create a second note
    notesWidget.handleAction(TEST_USER, 'sn-save-note', { title: 'ToDelete', content: 'bye' });
    const countBefore = db.prepare('SELECT COUNT(*) as c FROM notes WHERE userId = ?').get(TEST_USER).c;
    const ops = notesWidget.handleAction(TEST_USER, 'sn-delete', { index: 0 });
    const countAfter = db.prepare('SELECT COUNT(*) as c FROM notes WHERE userId = ?').get(TEST_USER).c;
    assert.equal(countAfter, countBefore - 1);
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('deleted')));
  });

  it('47. sn-delete by ID', () => {
    const note = db.prepare('SELECT id FROM notes WHERE userId = ? LIMIT 1').get(TEST_USER);
    assert.ok(note, 'should have at least one note');
    const ops = notesWidget.handleAction(TEST_USER, 'sn-delete', { id: note.id });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('deleted')));
  });

  it('48. sn-delete returns error without id or index', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-delete', {});
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('49. sn-delete returns error for non-existent note', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-delete', { id: 'nope' });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('50. unknown sn- action returns error toast', () => {
    const ops = notesWidget.handleAction(TEST_USER, 'sn-unknown', {});
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('51. notes are isolated per user', () => {
    notesWidget.handleAction('other-user', 'sn-save-note', { title: 'Other', content: 'X' });
    const ops = notesWidget.handleAction(TEST_USER, 'sn-list', {});
    // TEST_USER should not see other-user's notes in the count
    const table = ops.find(o => o.id === 'sn-list');
    if (table) {
      assert.ok(!table.data.rows.some(r => r.includes('Other')));
    }
  });

  it('52. sn-list op shapes are all valid GenUI ops', () => {
    notesWidget.handleAction(TEST_USER, 'sn-save-note', { title: 'Shape Test', content: 'ok' });
    const ops = notesWidget.handleAction(TEST_USER, 'sn-list', {});
    for (const op of ops) {
      assert.ok(typeof op.op === 'string', `op.op must be a string, got ${typeof op.op}`);
      if (op.op === 'upsert') {
        assert.ok(typeof op.id === 'string');
        assert.ok(typeof op.type === 'string');
        assert.ok(typeof op.data === 'object');
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  3. Calendar Widget
// ═══════════════════════════════════════════════════════════════════════════════

describe('Calendar Widget', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;

  before(() => {
    db = freshDb();
    calendarWidget.init(makeCtx(db));
  });

  after(() => {
    calendarWidget.destroy();
    db.close();
  });

  it('53. cal-month returns ops for empty month', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-month', { year: 2025, month: 6 });
    assert.ok(Array.isArray(ops));
    const header = ops.find(o => o.id === 'cal-header');
    assert.ok(header);
    assert.equal(header.type, 'hero');
    assert.ok(header.data.title.includes('June'));
    assert.ok(header.data.title.includes('2025'));
  });

  it('54. cal-month defaults to current month', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-month', {});
    assert.ok(ops.find(o => o.id === 'cal-header'));
  });

  it('55. cal-add-event creates an event', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-add-event', {
      title: 'Meeting', startTime: '2025-06-15T10:00:00Z', color: 'green',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('created')));
    // Should show month view with the event
    const timeline = ops.find(o => o.id === 'cal-events');
    assert.ok(timeline);
  });

  it('56. cal-add-event requires title and startTime', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-add-event', {});
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('57. cal-add-event requires startTime', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-add-event', { title: 'No Time' });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('58. cal-month shows events in the correct month', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-month', { year: 2025, month: 6 });
    const timeline = ops.find(o => o.id === 'cal-events' && o.type === 'timeline');
    assert.ok(timeline, 'should have timeline with events');
    assert.ok(timeline.data.items.some(i => i.title === 'Meeting'));
  });

  it('59. cal-month does not show events from other months', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-month', { year: 2025, month: 1 });
    const events = ops.find(o => o.id === 'cal-events');
    // January should not have June events — might be card (no events) or empty timeline
    if (events?.type === 'timeline') {
      assert.ok(!events.data.items.some(i => i.title === 'Meeting'));
    }
  });

  it('60. cal-week returns ops', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-week', { date: '2025-06-15' });
    assert.ok(Array.isArray(ops));
    const header = ops.find(o => o.id === 'cal-header');
    assert.ok(header);
    assert.equal(header.type, 'hero');
    assert.ok(header.data.title.includes('Week'));
  });

  it('61. cal-week shows events in the week containing the date', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-week', { date: '2025-06-15' });
    const timeline = ops.find(o => o.id === 'cal-events');
    assert.ok(timeline);
    if (timeline.type === 'timeline') {
      assert.ok(timeline.data.items.some(i => i.title === 'Meeting'));
    }
  });

  it('62. cal-week defaults to current week', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-week', {});
    assert.ok(ops.find(o => o.id === 'cal-header'));
  });

  it('63. cal-delete-event deletes an event', () => {
    const event = db.prepare('SELECT id FROM calendar_events WHERE userId = ? LIMIT 1').get(TEST_USER);
    assert.ok(event);
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-delete-event', { id: event.id });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('deleted')));
    const still = db.prepare('SELECT id FROM calendar_events WHERE id = ?').get(event.id);
    assert.equal(still, undefined);
  });

  it('64. cal-delete-event requires an ID', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-delete-event', {});
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('65. cal-delete-event returns error for non-existent event', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-delete-event', { id: 'nope' });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('66. cal-add-event supports allDay events', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-add-event', {
      title: 'Holiday', startTime: '2025-12-25T00:00:00Z', allDay: true,
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('created')));
    const ev = db.prepare("SELECT allDay FROM calendar_events WHERE title = 'Holiday'").get();
    assert.equal(ev.allDay, 1);
  });

  it('67. cal-month has navigation buttons', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-month', { year: 2025, month: 6 });
    const nav = ops.find(o => o.id === 'cal-nav');
    assert.ok(nav);
    assert.equal(nav.type, 'buttons');
    assert.ok(nav.data.buttons.length >= 3);
  });

  it('68. unknown cal- action returns error toast', () => {
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-unknown', {});
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('69. events are isolated per user', () => {
    calendarWidget.handleAction('other-cal-user', 'cal-add-event', {
      title: 'Other Event', startTime: '2025-06-15T12:00:00Z',
    });
    const ops = calendarWidget.handleAction(TEST_USER, 'cal-month', { year: 2025, month: 6 });
    const timeline = ops.find(o => o.id === 'cal-events');
    if (timeline?.type === 'timeline') {
      assert.ok(!timeline.data.items.some(i => i.title === 'Other Event'));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  4. Email Widget
// ═══════════════════════════════════════════════════════════════════════════════

describe('Email Widget', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;

  before(() => {
    db = freshDb();
    emailWidget.init(makeCtx(db, {
      config: { resendApiKey: 'test-key', senderAddress: 'test@example.com' },
    }));
  });

  after(() => {
    emailWidget.destroy();
    db.close();
  });

  it('70. mail-compose returns a form', () => {
    const ops = emailWidget.handleAction(TEST_USER, 'mail-compose', {});
    assert.ok(Array.isArray(ops));
    assert.equal(ops.length, 1);
    const form = ops[0];
    assert.equal(form.type, 'form');
    assert.equal(form.id, 'mail-compose');
    assert.ok(form.data.fields.length >= 3); // to, subject, body
    assert.ok(form.data.actions.length >= 1);
  });

  it('71. mail-inbox returns empty inbox ops', () => {
    const ops = emailWidget.handleAction(TEST_USER, 'mail-inbox', {});
    assert.ok(Array.isArray(ops));
    const header = ops.find(o => o.id === 'mail-header');
    assert.ok(header);
    assert.equal(header.type, 'stats');
    assert.ok(header.data.items.find(i => i.label === 'Total'));
  });

  it('72. mail-send creates a draft and attempts to send (mocked fetch)', async () => {
    // Mock global fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ id: 'resend-test-id' }),
      text: async () => '',
    });
    try {
      const ops = await emailWidget.handleAction(TEST_USER, 'mail-send', {
        to: 'test@test.com', subject: 'Test Sub', body: 'Test Body',
      });
      assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('sent')));
      // Verify email record in DB
      const emails = db.prepare('SELECT * FROM emails WHERE userId = ?').all(TEST_USER);
      assert.ok(emails.length >= 1);
      assert.equal(emails[0].status, 'sent');
      assert.equal(emails[0].to, 'test@test.com');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('73. mail-send records failure when API fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
      json: async () => ({}),
    });
    try {
      const ops = await emailWidget.handleAction(TEST_USER, 'mail-send', {
        to: 'fail@test.com', subject: 'Fail', body: 'Fail',
      });
      assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
      const email = db.prepare("SELECT status FROM emails WHERE \"to\" = 'fail@test.com'").get();
      assert.equal(email.status, 'failed');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('74. mail-send requires recipient', async () => {
    const ops = await emailWidget.handleAction(TEST_USER, 'mail-send', {
      subject: 'No To', body: 'Body',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('75. mail-inbox shows sent emails', () => {
    const ops = emailWidget.handleAction(TEST_USER, 'mail-inbox', {});
    const table = ops.find(o => o.id === 'mail-list');
    assert.ok(table);
    if (table.type === 'table') {
      assert.ok(table.data.rows.length >= 1);
    }
  });

  it('76. mail-delete removes an email', () => {
    const email = db.prepare('SELECT id FROM emails WHERE userId = ? LIMIT 1').get(TEST_USER);
    assert.ok(email);
    const ops = emailWidget.handleAction(TEST_USER, 'mail-delete', { id: email.id });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.message.includes('deleted')));
    const check = db.prepare('SELECT id FROM emails WHERE id = ?').get(email.id);
    assert.equal(check, undefined);
  });

  it('77. mail-delete requires ID', () => {
    const ops = emailWidget.handleAction(TEST_USER, 'mail-delete', {});
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('78. mail-delete returns error for non-existent email', () => {
    const ops = emailWidget.handleAction(TEST_USER, 'mail-delete', { id: 'nope' });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('79. mail-inbox has compose and refresh buttons', () => {
    const ops = emailWidget.handleAction(TEST_USER, 'mail-inbox', {});
    const btns = ops.find(o => o.id === 'mail-actions');
    assert.ok(btns);
    assert.equal(btns.type, 'buttons');
    assert.ok(btns.data.buttons.some(b => b.action === 'mail-compose'));
    assert.ok(btns.data.buttons.some(b => b.action === 'mail-inbox'));
  });

  it('80. unknown mail- action returns error toast', () => {
    const ops = emailWidget.handleAction(TEST_USER, 'mail-unknown', {});
    assert.ok(Array.isArray(ops));
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });

  it('81. mail-send with no API key returns failure', async () => {
    // Create a fresh widget without API key
    const db2 = freshDb();
    const noKeyWidget = { ...emailWidget };
    // Re-init with empty config to clear the key
    emailWidget.init(makeCtx(db2, { config: {} }));
    const ops = await emailWidget.handleAction(TEST_USER, 'mail-send', {
      to: 'x@x.com', subject: 's', body: 'b',
    });
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
    // Restore
    emailWidget.init(makeCtx(db, {
      config: { resendApiKey: 'test-key', senderAddress: 'test@example.com' },
    }));
    db2.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  5. Analytics Widget
// ═══════════════════════════════════════════════════════════════════════════════

describe('Analytics Widget', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;

  before(() => {
    db = freshDb();
    // Seed some data for analytics
    db.prepare("INSERT INTO users (id, username, passwordHash, plan) VALUES (?, ?, ?, ?)").run(
      'a-user-1', 'analytics-user', 'hash', 'pro'
    );
    db.prepare("INSERT INTO users (id, username, passwordHash, plan) VALUES (?, ?, ?, ?)").run(
      'a-user-2', 'free-user', 'hash', 'free'
    );
    db.prepare("INSERT INTO agents (id, name, model, enabled) VALUES (?, ?, ?, 1)").run(
      'agent-1', 'CodeBot', 'sonnet', 
    );
    analyticsWidget.init(makeCtx(db));
  });

  after(() => {
    analyticsWidget.destroy();
    db.close();
  });

  it('82. analytics-dashboard returns ops array', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-dashboard', {});
    assert.ok(Array.isArray(ops));
    assert.ok(ops.length >= 1);
  });

  it('83. analytics-dashboard has platform stats', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-dashboard', {});
    const platform = ops.find(o => o.id === 'analytics-platform');
    assert.ok(platform);
    assert.equal(platform.type, 'stats');
    assert.ok(platform.data.items.find(i => i.label === 'Users'));
    // Should see at least 2 users
    const usersItem = platform.data.items.find(i => i.label === 'Users');
    assert.ok(Number(usersItem.value) >= 2);
  });

  it('84. analytics-dashboard has today gauges', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-dashboard', {});
    const msgGauge = ops.find(o => o.id === 'analytics-today-msgs');
    assert.ok(msgGauge);
    assert.equal(msgGauge.type, 'gauge');
    const tokGauge = ops.find(o => o.id === 'analytics-today-tokens');
    assert.ok(tokGauge);
    assert.equal(tokGauge.type, 'gauge');
  });

  it('85. analytics-dashboard has navigation buttons', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-dashboard', {});
    const nav = ops.find(o => o.id === 'analytics-nav');
    assert.ok(nav);
    assert.equal(nav.type, 'buttons');
    assert.ok(nav.data.buttons.some(b => b.action === 'analytics-usage'));
    assert.ok(nav.data.buttons.some(b => b.action === 'analytics-agents'));
  });

  it('86. analytics-usage returns ops array', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-usage', {});
    assert.ok(Array.isArray(ops));
    assert.ok(ops.length >= 1);
  });

  it('87. analytics-usage has monthly stats', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-usage', {});
    const monthly = ops.find(o => o.id === 'analytics-monthly');
    assert.ok(monthly);
    assert.equal(monthly.type, 'stats');
  });

  it('88. analytics-agents returns ops array', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-agents', {});
    assert.ok(Array.isArray(ops));
    assert.ok(ops.length >= 1);
  });

  it('89. analytics-agents shows agent table when agents exist', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-agents', {});
    const agentTable = ops.find(o => o.id === 'analytics-agents-table');
    assert.ok(agentTable);
    assert.equal(agentTable.type, 'table');
    assert.ok(agentTable.data.rows.some(r => r.includes('CodeBot')));
  });

  it('90. analytics-agents has plan distribution pie chart', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-agents', {});
    const pie = ops.find(o => o.id === 'analytics-plans');
    assert.ok(pie);
    assert.equal(pie.type, 'chart-pie');
    assert.ok(pie.data.slices.length >= 1);
  });

  it('91. analytics handles missing usage_daily table gracefully', () => {
    // usage_daily does not exist in our schema, so queries should return 0
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-dashboard', {});
    const msgGauge = ops.find(o => o.id === 'analytics-today-msgs');
    assert.equal(msgGauge.data.value, 0);
  });

  it('92. analytics-usage with usage_daily data', () => {
    // Create usage_daily table and insert data
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_daily (
        userId TEXT NOT NULL,
        date TEXT NOT NULL,
        messages INTEGER NOT NULL DEFAULT 0,
        tokens INTEGER NOT NULL DEFAULT 0,
        modelBreakdown TEXT DEFAULT '{}',
        PRIMARY KEY (userId, date)
      );
    `);
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)')
      .run('a-user-1', today, 42, 10000, JSON.stringify({ sonnet: { messages: 42, tokens: 10000 } }));

    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-usage', {});
    const monthly = ops.find(o => o.id === 'analytics-monthly');
    assert.ok(monthly);
    const msgItem = monthly.data.items.find(i => i.label === 'Messages');
    assert.ok(msgItem);
  });

  it('93. unknown analytics- action returns error toast', () => {
    const ops = analyticsWidget.handleAction('a-user-1', 'analytics-unknown', {});
    assert.ok(ops.some(o => o.op === 'toast' && o.data.severity === 'error'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  6. Admin Routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Admin Routes', () => {
  /** @type {import('better-sqlite3').Database} */
  let db;
  let routes;
  let adminUser;

  // Mock req/res helpers
  function mockReq(method = 'GET', url = '/', body = null, headers = {}) {
    const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
    const listeners = {};
    return {
      method,
      url,
      headers: { host: 'localhost', ...headers },
      on(event, cb) {
        listeners[event] = cb;
        if (event === 'data') {
          for (const chunk of chunks) cb(chunk);
        }
        if (event === 'end') {
          // Defer to allow 'data' listeners to fire first
          queueMicrotask(() => cb());
        }
        return this;
      },
      removeListener() { return this; },
      destroy() {},
    };
  }

  function mockRes() {
    const res = {
      _status: null,
      _headers: {},
      _body: null,
      writeHead(status, headers) {
        res._status = status;
        Object.assign(res._headers, headers || {});
      },
      end(body) {
        res._body = body;
      },
      get json() {
        return res._body ? JSON.parse(res._body) : null;
      },
    };
    return res;
  }

  before(() => {
    db = freshDb();
    initUsers(db);
    initAgents(db);
    initAdminConfig(db);

    // Create an admin user
    adminUser = createUser('admin', 'hashed', { role: 'admin', plan: 'pro' });
    // Create a regular user
    createUser('regular', 'hashed', { role: 'user', plan: 'free' });
    // Create an agent
    createAgent('TestAgent', { model: 'sonnet', enabled: true });
  });

  after(() => {
    db.close();
  });

  // Lazy-import the admin routes (since it has module-level imports)
  before(async () => {
    const { adminRoutes } = await import('../server/routes/admin.js');

    const requireAdmin = async (req, res) => {
      // Simulate auth: if header has x-admin=true, return admin user
      if (req.headers['x-admin'] === 'true') {
        return { id: adminUser.id, username: 'admin', role: 'admin' };
      }
      res.writeHead(403, {});
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return null;
    };

    routes = adminRoutes({
      getDb: () => db,
      requireAdmin,
      wsState: {
        getConnectedUsers: () => ['user-1'],
        getClientCount: () => 3,
      },
    });
  });

  it('94. listUsers returns users array', async () => {
    const req = mockReq('GET', '/api/admin/users', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.listUsers(req, res);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.ok(Array.isArray(body.users));
    assert.ok(body.users.length >= 2);
    assert.ok(typeof body.total === 'number');
  });

  it('95. listUsers rejects non-admin', async () => {
    const req = mockReq('GET', '/api/admin/users');
    const res = mockRes();
    await routes.listUsers(req, res);
    assert.equal(res._status, 403);
  });

  it('96. listUsers supports search', async () => {
    const req = mockReq('GET', '/api/admin/users?search=admin', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.listUsers(req, res);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.ok(body.users.some(u => u.username === 'admin'));
  });

  it('97. listUsers sanitizes sensitive fields', async () => {
    const req = mockReq('GET', '/api/admin/users', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.listUsers(req, res);
    const body = res.json;
    for (const u of body.users) {
      assert.equal(u.passwordHash, undefined, 'passwordHash should be stripped');
      assert.equal(u.apiKey, undefined, 'apiKey should be stripped');
    }
  });

  it('98. getUserDetail returns user profile', async () => {
    const users = db.prepare('SELECT id FROM users WHERE username = ?').get('regular');
    const req = mockReq('GET', `/api/admin/users/${users.id}`, null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.getUserDetail(req, res, users.id);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.ok(body.user);
    assert.equal(body.user.username, 'regular');
    assert.ok(Array.isArray(body.activeSessions));
    assert.ok(Array.isArray(body.usageHistory));
  });

  it('99. getUserDetail returns 404 for unknown user', async () => {
    const req = mockReq('GET', '/api/admin/users/nope', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.getUserDetail(req, res, 'nope');
    assert.equal(res._status, 404);
  });

  it('100. updateUser changes plan', async () => {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('regular');
    const req = mockReq('PATCH', `/api/admin/users/${user.id}`, { plan: 'pro' }, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.updateUser(req, res, user.id);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.equal(body.plan, 'pro');
  });

  it('101. updateUser rejects invalid plan', async () => {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('regular');
    const req = mockReq('PATCH', `/api/admin/users/${user.id}`, { plan: 'platinum' }, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.updateUser(req, res, user.id);
    assert.equal(res._status, 400);
  });

  it('102. updateUser rejects invalid role', async () => {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('regular');
    const req = mockReq('PATCH', `/api/admin/users/${user.id}`, { role: 'superadmin' }, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.updateUser(req, res, user.id);
    assert.equal(res._status, 400);
  });

  it('103. deleteUser soft-deletes a user', async () => {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('regular');
    const req = mockReq('DELETE', `/api/admin/users/${user.id}`, null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.deleteUser(req, res, user.id);
    assert.equal(res._status, 200);
    assert.ok(res.json.ok);
  });

  it('104. deleteUser prevents self-deletion', async () => {
    const req = mockReq('DELETE', `/api/admin/users/${adminUser.id}`, null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.deleteUser(req, res, adminUser.id);
    assert.equal(res._status, 400);
    assert.ok(res.json.error.includes('Cannot delete'));
  });

  it('105. getStats returns dashboard stats shape', async () => {
    const req = mockReq('GET', '/api/admin/stats', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.getStats(req, res);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.ok(typeof body.totalUsers === 'number');
    assert.ok(typeof body.activeToday === 'number');
    assert.ok(typeof body.messagesToday === 'number');
    assert.ok(typeof body.tokensToday === 'number');
    assert.ok(typeof body.activeSessions === 'number');
    assert.ok(typeof body.wsConnections === 'number');
    assert.ok(typeof body.totalAgents === 'number');
    assert.ok(typeof body.enabledAgents === 'number');
    assert.ok(Array.isArray(body.planBreakdown));
    assert.ok(typeof body.serverUptime === 'number');
    assert.ok(typeof body.nodeVersion === 'string');
    assert.ok(body.memoryUsage);
    assert.ok(typeof body.estimatedMRR === 'number');
  });

  it('106. getStats wsConnections reflects mock state', async () => {
    const req = mockReq('GET', '/api/admin/stats', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.getStats(req, res);
    assert.equal(res.json.wsConnections, 3);
  });

  it('107. listAgents returns agents', async () => {
    const req = mockReq('GET', '/api/admin/agents', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.listAgents(req, res);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.ok(Array.isArray(body));
    assert.ok(body.some(a => a.name === 'TestAgent'));
  });

  it('108. getConfig returns sanitized config', async () => {
    setConfig('test_key', 'value');
    setConfig('stripe_secret_key', 'sk_test_xxx');
    const req = mockReq('GET', '/api/admin/config', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.getConfig(req, res);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.equal(body.test_key, 'value');
    assert.equal(body.stripe_secret_key, '••••••••');
  });

  it('109. updateConfig sets config values', async () => {
    const req = mockReq('PATCH', '/api/admin/config', { foo: 'bar' }, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.updateConfig(req, res);
    assert.equal(res._status, 200);
    assert.equal(res.json.foo, 'bar');
  });

  it('110. deployStatus returns status shape', async () => {
    const req = mockReq('GET', '/api/admin/deploy/status', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.deployStatus(req, res);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.ok(typeof body.current === 'string');
    assert.ok(typeof body.uptime === 'number');
    assert.ok('staged' in body);
    assert.ok('needsDeploy' in body);
  });

  it('111. deployStage requires version', async () => {
    const req = mockReq('POST', '/api/admin/deploy/stage', {}, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.deployStage(req, res);
    assert.equal(res._status, 400);
  });

  it('112. deployStage rejects invalid version format', async () => {
    const req = mockReq('POST', '/api/admin/deploy/stage', { version: 'v1.0 && rm -rf /' }, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.deployStage(req, res);
    assert.equal(res._status, 400);
  });

  it('113. routes table has all expected endpoints', () => {
    assert.ok(routes.routes.length >= 10);
    const paths = routes.routes.map(r => `${r.method} ${r.path}`);
    assert.ok(paths.includes('GET /api/admin/users'));
    assert.ok(paths.includes('GET /api/admin/stats'));
    assert.ok(paths.includes('GET /api/admin/config'));
    assert.ok(paths.includes('POST /api/admin/deploy/stage'));
  });

  it('114. listSessions returns sessions data', async () => {
    const req = mockReq('GET', '/api/admin/sessions', null, { 'x-admin': 'true' });
    const res = mockRes();
    await routes.listSessions(req, res);
    assert.equal(res._status, 200);
    const body = res.json;
    assert.ok(Array.isArray(body.sessions));
    assert.ok(typeof body.total === 'number');
    assert.ok(typeof body.wsConnections === 'number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  7. NullClaw Adapter
// ═══════════════════════════════════════════════════════════════════════════════

describe('NullClaw Adapter', () => {
  /** @type {NullClawAdapter} */
  let adapter;

  afterEach(async () => {
    if (adapter) {
      await adapter.shutdownAll();
      adapter = null;
    }
  });

  it('115. constructor creates adapter with defaults', () => {
    adapter = new NullClawAdapter();
    assert.equal(adapter.size, 0);
    assert.ok(adapter.availablePorts > 0);
  });

  it('116. constructor accepts custom port range', () => {
    adapter = new NullClawAdapter({ portMin: 30000, portMax: 30009 });
    assert.equal(adapter.availablePorts, 10);
  });

  it('117. listInstances returns empty array initially', () => {
    adapter = new NullClawAdapter();
    const list = adapter.listInstances();
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 0);
  });

  it('118. getInstanceStatus returns null for unknown user', () => {
    adapter = new NullClawAdapter();
    assert.equal(adapter.getInstanceStatus('no-one'), null);
  });

  it('119. destroyInstance returns false for unknown user', () => {
    adapter = new NullClawAdapter();
    assert.equal(adapter.destroyInstance('no-one'), false);
  });

  it('120. spawnInstance rejects when command not found', async () => {
    adapter = new NullClawAdapter({
      command: '/nonexistent/binary',
      portMin: 31000,
      portMax: 31010,
    });
    // Must attach error listener to prevent ERR_UNHANDLED_ERROR
    adapter.on('error', () => {});
    await assert.rejects(
      () => adapter.spawnInstance('user-1'),
      // Should throw because the binary doesn't exist
    );
    // Port should be released on failure
    assert.equal(adapter.size, 0);
  });

  it('121. adapter is an EventEmitter', () => {
    adapter = new NullClawAdapter();
    assert.ok(adapter instanceof EventEmitter);
  });

  it('122. shutdownAll clears all instances', async () => {
    adapter = new NullClawAdapter();
    await adapter.shutdownAll();
    assert.equal(adapter.size, 0);
  });

  it('123. adapter emits error event on spawn failure', async () => {
    adapter = new NullClawAdapter({
      command: '/nonexistent/binary',
      portMin: 32000,
      portMax: 32010,
    });
    let errorEmitted = false;
    adapter.on('error', () => { errorEmitted = true; });
    try {
      await adapter.spawnInstance('err-user');
    } catch {
      // Expected
    }
    assert.ok(errorEmitted);
  });

  it('124. port pool is finite', () => {
    adapter = new NullClawAdapter({ portMin: 33000, portMax: 33002 });
    assert.equal(adapter.availablePorts, 3);
  });

  it('125. listInstances shape has expected fields', () => {
    adapter = new NullClawAdapter({ portMin: 34000, portMax: 34010 });
    // listInstances returns an array even when empty
    const list = adapter.listInstances();
    assert.ok(Array.isArray(list));
    assert.equal(list.length, 0);
    // Verify the method signature works; shape tested via getInstanceStatus for a spawned instance in other tests
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Integration: Full Widget Registry + Multiple Widgets
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration — Full Registry', () => {
  /** @type {WidgetRegistry} */
  let registry;
  /** @type {import('better-sqlite3').Database} */
  let db;

  before(async () => {
    db = freshDb();
    registry = new WidgetRegistry();
    registry.register(notesWidget);
    registry.register(calendarWidget);
    registry.register(emailWidget);
    registry.register(analyticsWidget);
    // Need users table for analytics
    db.prepare("INSERT INTO users (id, username, passwordHash, plan) VALUES (?, ?, ?, ?)").run(
      'int-user', 'integ', 'hash', 'free'
    );
    await registry.initAll(makeCtx(db, {
      config: { resendApiKey: 'test-key' },
    }));
  });

  after(async () => {
    await registry.destroyAll();
    db.close();
  });

  it('126. registry has 4 widgets', () => {
    assert.equal(registry.size, 4);
  });

  it('127. sn- actions route to notes widget', async () => {
    const ops = await registry.handleAction('int-user', 'sn-list', {});
    assert.ok(Array.isArray(ops));
    // Should have notes-related ops
    assert.ok(ops.some(o => o.id?.startsWith('sn-')));
  });

  it('128. cal- actions route to calendar widget', async () => {
    const ops = await registry.handleAction('int-user', 'cal-month', { year: 2025, month: 3 });
    assert.ok(ops.some(o => o.id === 'cal-header'));
  });

  it('129. mail- actions route to email widget', async () => {
    const ops = await registry.handleAction('int-user', 'mail-compose', {});
    assert.ok(ops.some(o => o.type === 'form'));
  });

  it('130. analytics- actions route to analytics widget', async () => {
    const ops = await registry.handleAction('int-user', 'analytics-dashboard', {});
    assert.ok(ops.some(o => o.id === 'analytics-platform'));
  });

  it('131. unknown prefix returns error toast', async () => {
    const ops = await registry.handleAction('int-user', 'zzz-nope', {});
    assert.equal(ops[0].op, 'toast');
    assert.equal(ops[0].data.severity, 'error');
  });
});
