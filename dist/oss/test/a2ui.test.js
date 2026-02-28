import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isA2UIMessage,
  parseA2UIMessage,
  a2uiToGenUI,
  genUIToA2UI,
  wrapA2UIEnvelope,
} from '../protocol/a2ui.js';

// ═══════════════════════════════════════════════════════════════════════════
// isA2UIMessage
// ═══════════════════════════════════════════════════════════════════════════

describe('isA2UIMessage', () => {
  it('1. returns true for an object with a2ui key', () => {
    assert.equal(isA2UIMessage({ a2ui: { version: '1.0', surfaces: [] } }), true);
  });

  it('2. returns true for a JSON string with a2ui key', () => {
    const json = JSON.stringify({ a2ui: { version: '1.0', surfaces: [] } });
    assert.equal(isA2UIMessage(json), true);
  });

  it('3. returns false for a plain string', () => {
    assert.equal(isA2UIMessage('Hello world'), false);
  });

  it('4. returns false for null', () => {
    assert.equal(isA2UIMessage(null), false);
  });

  it('4b. returns false for undefined', () => {
    assert.equal(isA2UIMessage(undefined), false);
  });

  it('5. returns false for an object without a2ui key', () => {
    assert.equal(isA2UIMessage({ foo: 'bar', version: '1.0' }), false);
  });

  it('6. returns false when a2ui key is null', () => {
    assert.equal(isA2UIMessage({ a2ui: null }), false);
  });

  it('7. returns true for deeply nested JSON string if it has a2ui', () => {
    const msg = JSON.stringify({
      a2ui: {
        version: '1.0',
        surfaces: [{ surface: 'main', components: [{ type: 'text', data: { nested: { deep: true } } }] }],
      },
    });
    assert.equal(isA2UIMessage(msg), true);
  });

  it('8. returns false for malformed JSON string', () => {
    assert.equal(isA2UIMessage('{"a2ui": broken json'), false);
  });

  it('returns false for a number', () => {
    assert.equal(isA2UIMessage(42), false);
  });

  it('returns false for an empty string', () => {
    assert.equal(isA2UIMessage(''), false);
  });

  it('returns false when a2ui is a primitive (string)', () => {
    assert.equal(isA2UIMessage({ a2ui: 'not-an-object' }), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// parseA2UIMessage
// ═══════════════════════════════════════════════════════════════════════════

describe('parseA2UIMessage', () => {
  it('9. valid envelope → extracts version, surfaces, metadata', () => {
    const msg = {
      a2ui: {
        version: '2.0',
        surfaces: [
          { surface: 'main', components: [{ type: 'text', id: 't1', data: { body: 'Hello' } }] },
        ],
        metadata: { agent: 'test-agent' },
      },
    };
    const result = parseA2UIMessage(msg);
    assert.equal(result.version, '2.0');
    assert.equal(result.surfaces.length, 1);
    assert.equal(result.surfaces[0].surface, 'main');
    assert.deepEqual(result.metadata, { agent: 'test-agent' });
    assert.equal(result.allComponents.length, 1);
    assert.equal(result.allComponents[0].type, 'text');
    assert.equal(result.allComponents[0].id, 't1');
  });

  it('10. multiple surfaces → all parsed', () => {
    const msg = {
      a2ui: {
        version: '1.0',
        surfaces: [
          { surface: 'main', components: [{ type: 'text', id: 'a', data: {} }] },
          { surface: 'sidebar', components: [{ type: 'code', id: 'b', data: {} }] },
        ],
      },
    };
    const result = parseA2UIMessage(msg);
    assert.equal(result.surfaces.length, 2);
    assert.equal(result.allComponents.length, 2);
    assert.equal(result.surfaces[0].surface, 'main');
    assert.equal(result.surfaces[1].surface, 'sidebar');
  });

  it('11. components without id → auto-generated id', () => {
    const msg = {
      a2ui: {
        surfaces: [
          { surface: 'main', components: [{ type: 'text', data: { body: 'no id' } }] },
        ],
      },
    };
    const result = parseA2UIMessage(msg);
    assert.ok(result.allComponents[0].id, 'id should be auto-generated');
    assert.ok(result.allComponents[0].id.startsWith('auto-'));
  });

  it('12. components without type → defaults to text', () => {
    const msg = {
      a2ui: {
        surfaces: [
          { surface: 'main', components: [{ id: 'x', data: { body: 'typeless' } }] },
        ],
      },
    };
    const result = parseA2UIMessage(msg);
    assert.equal(result.allComponents[0].type, 'text');
  });

  it('13. extra fields on components preserved', () => {
    const msg = {
      a2ui: {
        surfaces: [
          {
            surface: 'main',
            components: [{ type: 'text', id: 'e1', data: { body: 'hi' }, style: 'accent', config: { x: 1 } }],
          },
        ],
      },
    };
    const result = parseA2UIMessage(msg);
    assert.equal(result.allComponents[0].style, 'accent');
    assert.deepEqual(result.allComponents[0].config, { x: 1 });
  });

  it('14. empty surfaces array → empty allComponents', () => {
    const msg = { a2ui: { version: '1.0', surfaces: [] } };
    const result = parseA2UIMessage(msg);
    assert.deepEqual(result.allComponents, []);
    assert.deepEqual(result.surfaces, []);
  });

  it('15. null components in surface → skipped', () => {
    const msg = {
      a2ui: {
        surfaces: [
          { surface: 'main', components: [null, { type: 'text', id: 'ok', data: {} }, null] },
        ],
      },
    };
    const result = parseA2UIMessage(msg);
    assert.equal(result.allComponents.length, 1);
    assert.equal(result.allComponents[0].id, 'ok');
  });

  it('16. string input (valid JSON) → parsed', () => {
    const json = JSON.stringify({
      a2ui: {
        version: '1.0',
        surfaces: [{ surface: 'main', components: [{ type: 'text', id: 's1', data: { body: 'json' } }] }],
      },
    });
    const result = parseA2UIMessage(json);
    assert.ok(result);
    assert.equal(result.allComponents[0].id, 's1');
  });

  it('17. invalid input → null', () => {
    assert.equal(parseA2UIMessage('not json'), null);
    assert.equal(parseA2UIMessage(null), null);
    assert.equal(parseA2UIMessage(undefined), null);
    assert.equal(parseA2UIMessage(42), null);
    assert.equal(parseA2UIMessage({ noA2ui: true }), null);
  });

  it('18. metadata extraction', () => {
    const msg = {
      a2ui: {
        version: '1.0',
        surfaces: [],
        metadata: { agent: 'gpt-4', timestamp: 1234567890, tags: ['urgent'] },
      },
    };
    const result = parseA2UIMessage(msg);
    assert.deepEqual(result.metadata, { agent: 'gpt-4', timestamp: 1234567890, tags: ['urgent'] });
  });

  it('19. surface with invalid components (non-objects) → skipped', () => {
    const msg = {
      a2ui: {
        surfaces: [
          { surface: 'main', components: ['string', 42, true, { type: 'text', id: 'valid', data: {} }] },
        ],
      },
    };
    const result = parseA2UIMessage(msg);
    assert.equal(result.allComponents.length, 1);
    assert.equal(result.allComponents[0].id, 'valid');
  });

  it('defaults version to 1.0 when missing', () => {
    const msg = { a2ui: { surfaces: [] } };
    const result = parseA2UIMessage(msg);
    assert.equal(result.version, '1.0');
  });

  it('defaults metadata to empty object when missing', () => {
    const msg = { a2ui: { surfaces: [] } };
    const result = parseA2UIMessage(msg);
    assert.deepEqual(result.metadata, {});
  });

  it('normalizes component data to empty object when data is not an object', () => {
    const msg = {
      a2ui: {
        surfaces: [{ surface: 'main', components: [{ type: 'text', id: 'nd', data: 'string-data' }] }],
      },
    };
    const result = parseA2UIMessage(msg);
    assert.deepEqual(result.allComponents[0].data, {});
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// a2uiToGenUI
// ═══════════════════════════════════════════════════════════════════════════

describe('a2uiToGenUI', () => {
  it('20. text → card with body→text field mapping', () => {
    const ops = a2uiToGenUI([{ type: 'text', id: 't1', data: { title: 'Hi', body: 'World' } }]);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'upsert');
    assert.equal(ops[0].type, 'card');
    assert.equal(ops[0].data.text, 'World');
    assert.equal(ops[0].data.body, undefined);
    assert.equal(ops[0].data.title, 'Hi');
  });

  it('21. table → table (passthrough)', () => {
    const data = { title: 'T', headers: ['A', 'B'], rows: [['1', '2']] };
    const ops = a2uiToGenUI([{ type: 'table', id: 'tbl', data }]);
    assert.equal(ops[0].type, 'table');
    assert.deepEqual(ops[0].data.headers, ['A', 'B']);
    assert.deepEqual(ops[0].data.rows, [['1', '2']]);
  });

  it('22. form → form (passthrough)', () => {
    const data = { title: 'Contact', fields: [{ name: 'email', type: 'email' }] };
    const ops = a2uiToGenUI([{ type: 'form', id: 'f1', data }]);
    assert.equal(ops[0].type, 'form');
    assert.deepEqual(ops[0].data.fields, [{ name: 'email', type: 'email' }]);
  });

  it('23. chart with slices → chart-pie', () => {
    const ops = a2uiToGenUI([{
      type: 'chart', id: 'c1', data: { title: 'Pie', slices: [{ label: 'A', value: 50 }] },
    }]);
    assert.equal(ops[0].type, 'chart-pie');
  });

  it('24. chart with type=line → chart-line', () => {
    const ops = a2uiToGenUI([{
      type: 'chart', id: 'c2', data: { type: 'line', labels: ['a'], datasets: [{ data: [1] }] },
    }]);
    assert.equal(ops[0].type, 'chart-line');
    // type hint should be removed from data
    assert.equal(ops[0].data.type, undefined);
  });

  it('25. chart with temporal labels → chart-line', () => {
    const ops = a2uiToGenUI([{
      type: 'chart', id: 'c3', data: { labels: ['Jan', 'Feb', 'Mar'], datasets: [{ data: [10, 20, 30] }] },
    }]);
    assert.equal(ops[0].type, 'chart-line');
  });

  it('26. chart fallback → chart-bar', () => {
    const ops = a2uiToGenUI([{
      type: 'chart', id: 'c4', data: { labels: ['X', 'Y'], datasets: [{ data: [5, 10] }] },
    }]);
    assert.equal(ops[0].type, 'chart-bar');
  });

  it('27. image url → src mapping', () => {
    const ops = a2uiToGenUI([{
      type: 'image', id: 'img', data: { url: 'https://example.com/pic.png', alt: 'A pic' },
    }]);
    assert.equal(ops[0].type, 'image');
    assert.equal(ops[0].data.src, 'https://example.com/pic.png');
    assert.equal(ops[0].data.url, undefined);
    assert.equal(ops[0].data.alt, 'A pic');
  });

  it('28. button_group → buttons with label/text normalization', () => {
    const ops = a2uiToGenUI([{
      type: 'button_group', id: 'bg', data: {
        buttons: [
          { text: 'Click me', id: 'btn-1' },
          { label: 'Submit', action: 'submit', variant: 'primary' },
        ],
      },
    }]);
    assert.equal(ops[0].type, 'buttons');
    assert.equal(ops[0].data.buttons[0].label, 'Click me');
    assert.equal(ops[0].data.buttons[1].label, 'Submit');
    assert.equal(ops[0].data.buttons[1].action, 'submit');
  });

  it('29. status → alert with text→message and level→severity', () => {
    const ops = a2uiToGenUI([{
      type: 'status', id: 's1', data: { text: 'All systems go', level: 'success' },
    }]);
    assert.equal(ops[0].type, 'alert');
    assert.equal(ops[0].data.message, 'All systems go');
    assert.equal(ops[0].data.severity, 'success');
    assert.equal(ops[0].data.level, undefined);
  });

  it('30. list → checklist with completed→checked, label→text', () => {
    const ops = a2uiToGenUI([{
      type: 'list', id: 'l1', data: {
        items: [
          { label: 'Task A', completed: true },
          { label: 'Task B', completed: false },
        ],
      },
    }]);
    assert.equal(ops[0].type, 'checklist');
    assert.equal(ops[0].data.items[0].text, 'Task A');
    assert.equal(ops[0].data.items[0].checked, true);
    assert.equal(ops[0].data.items[0].label, undefined);
    assert.equal(ops[0].data.items[0].completed, undefined);
    assert.equal(ops[0].data.items[1].checked, false);
  });

  it('31. code → code (passthrough)', () => {
    const ops = a2uiToGenUI([{
      type: 'code', id: 'cd', data: { language: 'js', code: 'console.log("hi")' },
    }]);
    assert.equal(ops[0].type, 'code');
    assert.equal(ops[0].data.language, 'js');
    assert.equal(ops[0].data.code, 'console.log("hi")');
  });

  it('32. empty array → empty array', () => {
    assert.deepEqual(a2uiToGenUI([]), []);
  });

  it('33. unknown type → defaults to card', () => {
    const ops = a2uiToGenUI([{ type: 'custom_widget', id: 'cw', data: { foo: 'bar' } }]);
    assert.equal(ops[0].type, 'card');
    assert.equal(ops[0].data.foo, 'bar');
  });

  it('non-array input → empty array', () => {
    assert.deepEqual(a2uiToGenUI(null), []);
    assert.deepEqual(a2uiToGenUI('string'), []);
    assert.deepEqual(a2uiToGenUI(undefined), []);
  });

  it('all ops have layout {zone: "auto"}', () => {
    const ops = a2uiToGenUI([
      { type: 'text', id: 'a', data: {} },
      { type: 'table', id: 'b', data: {} },
    ]);
    for (const op of ops) {
      assert.deepEqual(op.layout, { zone: 'auto' });
    }
  });

  it('chart with chartType=pie → chart-pie', () => {
    const ops = a2uiToGenUI([{
      type: 'chart', id: 'cp', data: { chartType: 'pie' },
    }]);
    assert.equal(ops[0].type, 'chart-pie');
  });

  it('status level warn maps to severity warning', () => {
    const ops = a2uiToGenUI([{
      type: 'status', id: 'sw', data: { text: 'Watch out', level: 'warn' },
    }]);
    assert.equal(ops[0].data.severity, 'warning');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// genUIToA2UI
// ═══════════════════════════════════════════════════════════════════════════

describe('genUIToA2UI', () => {
  it('34. card → text with text→body mapping', () => {
    const comps = genUIToA2UI([
      { op: 'upsert', id: 'c1', type: 'card', data: { title: 'Hi', text: 'World' } },
    ]);
    assert.equal(comps.length, 1);
    assert.equal(comps[0].type, 'text');
    assert.equal(comps[0].data.body, 'World');
    assert.equal(comps[0].data.text, undefined);
  });

  it('35. alert → status with message→text, severity→level', () => {
    const comps = genUIToA2UI([
      { op: 'upsert', id: 'a1', type: 'alert', data: { message: 'Error!', severity: 'error' } },
    ]);
    assert.equal(comps[0].type, 'status');
    assert.equal(comps[0].data.text, 'Error!');
    assert.equal(comps[0].data.level, 'error');
    assert.equal(comps[0].data.message, undefined);
    assert.equal(comps[0].data.severity, undefined);
  });

  it('36. checklist → list with checked→completed', () => {
    const comps = genUIToA2UI([
      { op: 'upsert', id: 'cl', type: 'checklist', data: { items: [{ text: 'Do it', checked: true }] } },
    ]);
    assert.equal(comps[0].type, 'list');
    assert.equal(comps[0].data.items[0].completed, true);
    assert.equal(comps[0].data.items[0].checked, undefined);
  });

  it('37. chart-bar/line/pie → chart with chartType hint', () => {
    for (const sub of ['bar', 'line', 'pie']) {
      const comps = genUIToA2UI([
        { op: 'upsert', id: `ch-${sub}`, type: `chart-${sub}`, data: { title: sub } },
      ]);
      assert.equal(comps[0].type, 'chart');
      assert.equal(comps[0].data.chartType, sub);
    }
  });

  it('38. image src → url', () => {
    const comps = genUIToA2UI([
      { op: 'upsert', id: 'img', type: 'image', data: { src: 'https://example.com/pic.png', alt: 'pic' } },
    ]);
    assert.equal(comps[0].type, 'image');
    assert.equal(comps[0].data.url, 'https://example.com/pic.png');
    assert.equal(comps[0].data.src, undefined);
  });

  it('39. non-upsert ops → skipped', () => {
    const comps = genUIToA2UI([
      { op: 'patch', id: 'c1', data: { title: 'updated' } },
      { op: 'remove', id: 'c2' },
      { op: 'clear' },
      { op: 'upsert', id: 'c3', type: 'card', data: { text: 'kept' } },
    ]);
    assert.equal(comps.length, 1);
    assert.equal(comps[0].id, 'c3');
  });

  it('40. empty/null input → empty array', () => {
    assert.deepEqual(genUIToA2UI([]), []);
    assert.deepEqual(genUIToA2UI(null), []);
    assert.deepEqual(genUIToA2UI(undefined), []);
    assert.deepEqual(genUIToA2UI('not-array'), []);
  });

  it('skips null entries in ops array', () => {
    const comps = genUIToA2UI([null, undefined, { op: 'upsert', id: 'ok', type: 'card', data: {} }]);
    assert.equal(comps.length, 1);
    assert.equal(comps[0].id, 'ok');
  });

  it('unknown GenUI type defaults to text a2ui type', () => {
    const comps = genUIToA2UI([
      { op: 'upsert', id: 'u1', type: 'sparkline', data: { values: [1, 2, 3] } },
    ]);
    assert.equal(comps[0].type, 'text');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// wrapA2UIEnvelope
// ═══════════════════════════════════════════════════════════════════════════

describe('wrapA2UIEnvelope', () => {
  it('41. default options → version 1.0, surface main', () => {
    const comps = [{ type: 'text', id: 'x', data: { body: 'Hi' } }];
    const envelope = wrapA2UIEnvelope(comps);
    assert.equal(envelope.a2ui.version, '1.0');
    assert.equal(envelope.a2ui.surfaces.length, 1);
    assert.equal(envelope.a2ui.surfaces[0].surface, 'main');
    assert.deepEqual(envelope.a2ui.surfaces[0].components, comps);
    assert.deepEqual(envelope.a2ui.metadata, {});
  });

  it('42. custom surface/version/metadata', () => {
    const comps = [{ type: 'status', id: 's1', data: { text: 'ok' } }];
    const envelope = wrapA2UIEnvelope(comps, {
      surface: 'sidebar',
      version: '2.0',
      metadata: { agent: 'custom', priority: 'high' },
    });
    assert.equal(envelope.a2ui.version, '2.0');
    assert.equal(envelope.a2ui.surfaces[0].surface, 'sidebar');
    assert.deepEqual(envelope.a2ui.metadata, { agent: 'custom', priority: 'high' });
  });

  it('wraps empty/null components gracefully', () => {
    const envelope = wrapA2UIEnvelope(null);
    assert.deepEqual(envelope.a2ui.surfaces[0].components, []);
  });

  it('wraps empty array', () => {
    const envelope = wrapA2UIEnvelope([]);
    assert.deepEqual(envelope.a2ui.surfaces[0].components, []);
  });
});
