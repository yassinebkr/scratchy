import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGenUIBlock,
  parseToonBlock,
  OP_TYPES,
  applyOps,
} from '../protocol/genui.js';

// ═══════════════════════════════════════════════════════════════════════════
// parseGenUIBlock
// ═══════════════════════════════════════════════════════════════════════════

describe('parseGenUIBlock', () => {
  it('1. single canvas block → extracted ops', () => {
    const text = 'Hello\n```scratchy-canvas\n{"op":"upsert","id":"c1","type":"card","data":{"title":"Hi"}}\n```\nbye';
    const ops = parseGenUIBlock(text);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'upsert');
    assert.equal(ops[0].id, 'c1');
    assert.equal(ops[0].type, 'card');
    assert.equal(ops[0].data.title, 'Hi');
  });

  it('2. multiple canvas blocks → all ops concatenated', () => {
    const text = [
      '```scratchy-canvas',
      '{"op":"upsert","id":"a","type":"card","data":{}}',
      '```',
      'Some text between',
      '```scratchy-canvas',
      '{"op":"upsert","id":"b","type":"table","data":{}}',
      '{"op":"remove","id":"a"}',
      '```',
    ].join('\n');
    const ops = parseGenUIBlock(text);
    assert.equal(ops.length, 3);
    assert.equal(ops[0].id, 'a');
    assert.equal(ops[1].id, 'b');
    assert.equal(ops[2].op, 'remove');
  });

  it('3. no blocks → empty array', () => {
    assert.deepEqual(parseGenUIBlock('No canvas here'), []);
    assert.deepEqual(parseGenUIBlock('```javascript\nconsole.log("hi")\n```'), []);
  });

  it('4. invalid JSON lines → skipped', () => {
    const text = '```scratchy-canvas\nnot valid json\n{"op":"upsert","id":"ok","type":"card","data":{}}\n```';
    const ops = parseGenUIBlock(text);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].id, 'ok');
  });

  it('5. lines without op field → skipped', () => {
    const text = '```scratchy-canvas\n{"id":"no-op","type":"card","data":{}}\n{"op":"upsert","id":"ok","type":"card","data":{}}\n```';
    const ops = parseGenUIBlock(text);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].id, 'ok');
  });

  it('6. non-string input → empty array', () => {
    assert.deepEqual(parseGenUIBlock(null), []);
    assert.deepEqual(parseGenUIBlock(undefined), []);
    assert.deepEqual(parseGenUIBlock(42), []);
    assert.deepEqual(parseGenUIBlock({}), []);
  });

  it('7. block with blank lines → blanks skipped', () => {
    const text = '```scratchy-canvas\n\n{"op":"upsert","id":"c1","type":"card","data":{}}\n\n{"op":"upsert","id":"c2","type":"card","data":{}}\n\n```';
    const ops = parseGenUIBlock(text);
    assert.equal(ops.length, 2);
  });

  it('upsert ops get default layout {zone:"auto"}', () => {
    const text = '```scratchy-canvas\n{"op":"upsert","id":"x","type":"card","data":{"title":"T"}}\n```';
    const ops = parseGenUIBlock(text);
    assert.deepEqual(ops[0].layout, { zone: 'auto' });
  });

  it('upsert with existing layout preserves it', () => {
    const text = '```scratchy-canvas\n{"op":"upsert","id":"x","type":"card","data":{},"layout":{"zone":"sidebar","order":1}}\n```';
    const ops = parseGenUIBlock(text);
    assert.deepEqual(ops[0].layout, { zone: 'sidebar', order: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseToonBlock
// ═══════════════════════════════════════════════════════════════════════════

describe('parseToonBlock', () => {
  it('8. single TOON block → extracted ops', () => {
    const text = [
      '```scratchy-toon',
      'op: upsert',
      'id: c1',
      'type: card',
      'data:',
      '  title: Hello',
      '```',
    ].join('\n');
    const ops = parseToonBlock(text);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'upsert');
    assert.equal(ops[0].id, 'c1');
    assert.equal(ops[0].type, 'card');
    assert.equal(ops[0].data.title, 'Hello');
  });

  it('9. multiple TOON blocks → all ops', () => {
    const text = [
      '```scratchy-toon',
      'op: upsert',
      'id: a',
      'type: card',
      'data:',
      '  title: A',
      '```',
      'text between',
      '```scratchy-toon',
      'op: upsert',
      'id: b',
      'type: table',
      'data:',
      '  title: B',
      '```',
    ].join('\n');
    const ops = parseToonBlock(text);
    assert.equal(ops.length, 2);
    assert.equal(ops[0].id, 'a');
    assert.equal(ops[1].id, 'b');
  });

  it('10. TOON with --- separators → multiple ops', () => {
    const text = [
      '```scratchy-toon',
      'op: upsert',
      'id: first',
      'type: card',
      'data:',
      '  title: First',
      '---',
      'op: upsert',
      'id: second',
      'type: gauge',
      'data:',
      '  label: CPU',
      '  value: 73',
      '```',
    ].join('\n');
    const ops = parseToonBlock(text);
    assert.equal(ops.length, 2);
    assert.equal(ops[0].id, 'first');
    assert.equal(ops[1].id, 'second');
    assert.equal(ops[1].type, 'gauge');
    assert.equal(ops[1].data.value, 73);
  });

  it('11. invalid TOON → skipped', () => {
    // parseToon throws on non-string — but parseToonBlock wraps in try/catch
    // A block that parseToon can handle but produces no valid ops
    const text = '```scratchy-toon\nthis is not valid toon at all without colons\n```';
    const ops = parseToonBlock(text);
    // No op field → skipped
    assert.equal(ops.length, 0);
  });

  it('12. non-string input → empty array', () => {
    assert.deepEqual(parseToonBlock(null), []);
    assert.deepEqual(parseToonBlock(undefined), []);
    assert.deepEqual(parseToonBlock(42), []);
    assert.deepEqual(parseToonBlock({}), []);
  });

  it('TOON upsert gets default layout', () => {
    const text = [
      '```scratchy-toon',
      'op: upsert',
      'id: t1',
      'type: card',
      'data:',
      '  title: Test',
      '```',
    ].join('\n');
    const ops = parseToonBlock(text);
    assert.deepEqual(ops[0].layout, { zone: 'auto' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OP_TYPES
// ═══════════════════════════════════════════════════════════════════════════

describe('OP_TYPES', () => {
  it('13. all 10 types present and frozen', () => {
    const expected = [
      'upsert', 'patch', 'remove', 'clear', 'move',
      'layout', 'toast', 'overlay', 'trigger', 'dismiss',
    ];
    for (const type of expected) {
      assert.equal(OP_TYPES[type], type, `OP_TYPES.${type} should be "${type}"`);
    }
    assert.equal(Object.keys(OP_TYPES).length, 10);
    assert.ok(Object.isFrozen(OP_TYPES), 'OP_TYPES should be frozen');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyOps
// ═══════════════════════════════════════════════════════════════════════════

describe('applyOps', () => {
  it('14. upsert → creates component', () => {
    const state = new Map();
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'Hi' } }]);
    assert.ok(state.has('c1'));
    assert.equal(state.get('c1').type, 'card');
    assert.equal(state.get('c1').data.title, 'Hi');
  });

  it('15. upsert → replaces existing', () => {
    const state = new Map();
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'First' } }]);
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'gauge', data: { label: 'CPU', value: 50 } }]);
    assert.equal(state.get('c1').type, 'gauge');
    assert.equal(state.get('c1').data.label, 'CPU');
    assert.equal(state.get('c1').data.title, undefined);
  });

  it('16. patch → merges data', () => {
    const state = new Map();
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'Hi', text: 'World' } }]);
    applyOps(state, [{ op: 'patch', id: 'c1', data: { text: 'Updated' } }]);
    assert.equal(state.get('c1').data.title, 'Hi');
    assert.equal(state.get('c1').data.text, 'Updated');
  });

  it('17. patch on non-existent → no-op', () => {
    const state = new Map();
    applyOps(state, [{ op: 'patch', id: 'ghost', data: { title: 'Nope' } }]);
    assert.equal(state.size, 0);
  });

  it('18. patch layout → merges layout', () => {
    const state = new Map();
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: {}, layout: { zone: 'main', order: 0 } }]);
    applyOps(state, [{ op: 'patch', id: 'c1', data: {}, layout: { order: 5 } }]);
    assert.equal(state.get('c1').layout.zone, 'main');
    assert.equal(state.get('c1').layout.order, 5);
  });

  it('19. remove → deletes component', () => {
    const state = new Map();
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: {} }]);
    assert.ok(state.has('c1'));
    applyOps(state, [{ op: 'remove', id: 'c1' }]);
    assert.ok(!state.has('c1'));
  });

  it('20. remove non-existent → no-op', () => {
    const state = new Map();
    applyOps(state, [{ op: 'remove', id: 'doesnt-exist' }]);
    assert.equal(state.size, 0);
  });

  it('21. clear → empties all', () => {
    const state = new Map();
    applyOps(state, [
      { op: 'upsert', id: 'a', type: 'card', data: {} },
      { op: 'upsert', id: 'b', type: 'gauge', data: {} },
    ]);
    assert.equal(state.size, 2);
    applyOps(state, [{ op: 'clear' }]);
    assert.equal(state.size, 0);
  });

  it('22. move → updates layout only', () => {
    const state = new Map();
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'X' }, layout: { zone: 'main' } }]);
    applyOps(state, [{ op: 'move', id: 'c1', layout: { zone: 'sidebar', order: 2 } }]);
    assert.equal(state.get('c1').layout.zone, 'sidebar');
    assert.equal(state.get('c1').layout.order, 2);
    // Data should be unchanged
    assert.equal(state.get('c1').data.title, 'X');
    assert.equal(state.get('c1').type, 'card');
  });

  it('23. layout → sets __layout__ key', () => {
    const state = new Map();
    applyOps(state, [{ op: 'layout', mode: 'dashboard' }]);
    assert.ok(state.has('__layout__'));
    assert.equal(state.get('__layout__').type, '__layout__');
    assert.equal(state.get('__layout__').data.mode, 'dashboard');
  });

  it('24. toast → creates __toast__ entry', () => {
    const state = new Map();
    applyOps(state, [{ op: 'toast', id: 'my-toast', data: { message: 'Saved!' } }]);
    assert.ok(state.has('my-toast'));
    assert.equal(state.get('my-toast').type, '__toast__');
    assert.equal(state.get('my-toast').data.message, 'Saved!');
  });

  it('25. overlay → creates __overlay__ entry', () => {
    const state = new Map();
    applyOps(state, [{ op: 'overlay', id: 'modal-1', data: { title: 'Confirm', body: 'Sure?' } }]);
    assert.ok(state.has('modal-1'));
    assert.equal(state.get('modal-1').type, '__overlay__');
    assert.equal(state.get('modal-1').data.title, 'Confirm');
  });

  it('26. trigger → creates __trigger__ entry', () => {
    const state = new Map();
    applyOps(state, [{ op: 'trigger', id: 'trig-1', action: 'admin-monitor', context: { refresh: true } }]);
    assert.ok(state.has('trig-1'));
    assert.equal(state.get('trig-1').type, '__trigger__');
    assert.equal(state.get('trig-1').data.action, 'admin-monitor');
    assert.deepEqual(state.get('trig-1').data.context, { refresh: true });
  });

  it('27. dismiss → deletes by id', () => {
    const state = new Map();
    applyOps(state, [{ op: 'toast', id: 'toast-1', data: { message: 'Hi' } }]);
    assert.ok(state.has('toast-1'));
    applyOps(state, [{ op: 'dismiss', id: 'toast-1' }]);
    assert.ok(!state.has('toast-1'));
  });

  it('28. null/undefined state → creates new Map', () => {
    const result1 = applyOps(null, [{ op: 'upsert', id: 'c1', type: 'card', data: {} }]);
    assert.ok(result1 instanceof Map);
    assert.ok(result1.has('c1'));

    const result2 = applyOps(undefined, [{ op: 'upsert', id: 'c2', type: 'card', data: {} }]);
    assert.ok(result2 instanceof Map);
    assert.ok(result2.has('c2'));
  });

  it('29. non-array ops → returns state unchanged', () => {
    const state = new Map();
    state.set('existing', { type: 'card', data: {}, layout: {} });
    const result = applyOps(state, 'not-an-array');
    assert.equal(result, state);
    assert.equal(result.size, 1);

    const result2 = applyOps(state, null);
    assert.equal(result2, state);

    const result3 = applyOps(state, 42);
    assert.equal(result3, state);
  });

  it('30. op without id (where required) → skipped', () => {
    const state = new Map();
    applyOps(state, [
      { op: 'upsert', type: 'card', data: { title: 'No ID' } }, // no id
      { op: 'patch', data: { title: 'No ID patch' } }, // no id
      { op: 'remove' }, // no id
      { op: 'move', layout: { zone: 'sidebar' } }, // no id
      { op: 'dismiss' }, // no id
    ]);
    assert.equal(state.size, 0);
  });

  it('31. multiple ops in sequence → all applied', () => {
    const state = new Map();
    applyOps(state, [
      { op: 'upsert', id: 'c1', type: 'card', data: { title: 'Card' } },
      { op: 'upsert', id: 'c2', type: 'gauge', data: { label: 'CPU', value: 75 } },
      { op: 'patch', id: 'c1', data: { text: 'Updated text' } },
      { op: 'upsert', id: 'c3', type: 'table', data: { headers: ['A'] } },
      { op: 'remove', id: 'c2' },
    ]);
    assert.equal(state.size, 2);
    assert.ok(state.has('c1'));
    assert.ok(state.has('c3'));
    assert.ok(!state.has('c2'));
    assert.equal(state.get('c1').data.title, 'Card');
    assert.equal(state.get('c1').data.text, 'Updated text');
  });

  it('32. upsert adds default layout {zone:"auto"}', () => {
    const state = new Map();
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'T' } }]);
    assert.deepEqual(state.get('c1').layout, { zone: 'auto' });
  });

  it('upsert preserves explicit layout', () => {
    const state = new Map();
    applyOps(state, [
      { op: 'upsert', id: 'c1', type: 'card', data: {}, layout: { zone: 'sidebar', order: 3 } },
    ]);
    assert.deepEqual(state.get('c1').layout, { zone: 'sidebar', order: 3 });
  });

  it('layout defaults mode to auto when not specified', () => {
    const state = new Map();
    applyOps(state, [{ op: 'layout' }]);
    assert.equal(state.get('__layout__').data.mode, 'auto');
  });

  it('toast without id uses auto-generated key', () => {
    const state = new Map();
    applyOps(state, [{ op: 'toast', data: { message: 'Auto ID' } }]);
    const keys = [...state.keys()];
    assert.equal(keys.length, 1);
    assert.ok(keys[0].startsWith('__toast__'));
  });

  it('overlay without id defaults to __overlay__', () => {
    const state = new Map();
    applyOps(state, [{ op: 'overlay', data: { title: 'Modal' } }]);
    assert.ok(state.has('__overlay__'));
  });

  it('trigger without id uses auto-generated key', () => {
    const state = new Map();
    applyOps(state, [{ op: 'trigger', action: 'refresh' }]);
    const keys = [...state.keys()];
    assert.equal(keys.length, 1);
    assert.ok(keys[0].startsWith('__trigger__'));
    assert.equal(state.get(keys[0]).data.action, 'refresh');
  });

  it('move on non-existent component → no-op', () => {
    const state = new Map();
    applyOps(state, [{ op: 'move', id: 'ghost', layout: { zone: 'sidebar' } }]);
    assert.equal(state.size, 0);
  });

  it('skips null/undefined entries in ops array', () => {
    const state = new Map();
    applyOps(state, [null, undefined, { op: 'upsert', id: 'c1', type: 'card', data: {} }]);
    assert.equal(state.size, 1);
    assert.ok(state.has('c1'));
  });

  it('unknown op type → silently ignored', () => {
    const state = new Map();
    applyOps(state, [{ op: 'explode', id: 'x' }]);
    assert.equal(state.size, 0);
  });

  it('returns the same map reference (mutation)', () => {
    const state = new Map();
    const result = applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: {} }]);
    assert.equal(result, state);
  });

  it('patch without layout does not change existing layout', () => {
    const state = new Map();
    applyOps(state, [{ op: 'upsert', id: 'c1', type: 'card', data: { title: 'Hi' }, layout: { zone: 'main', order: 1 } }]);
    applyOps(state, [{ op: 'patch', id: 'c1', data: { text: 'New' } }]);
    assert.deepEqual(state.get('c1').layout, { zone: 'main', order: 1 });
  });
});
