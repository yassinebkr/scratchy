/**
 * @fileoverview Hardened unit tests for protocol/surfaces.js
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 * Run: node --test test/surfaces.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SURFACE_TYPES,
  detectSurfaces,
  computeLayout,
  surfaceTransition,
} from '../protocol/surfaces.js';

// ─── SURFACE_TYPES ──────────────────────────────────────────────────────────

describe('SURFACE_TYPES', () => {
  it('1. contains all 6 expected surface types', () => {
    const expected = ['terminal', 'explorer', 'editor', 'search', 'canvas', 'chat'];
    assert.deepStrictEqual(Object.keys(SURFACE_TYPES).sort(), expected.sort());
  });

  it('2. all entries are frozen (immutable)', () => {
    assert.ok(Object.isFrozen(SURFACE_TYPES), 'SURFACE_TYPES itself should be frozen');
    for (const [name, def] of Object.entries(SURFACE_TYPES)) {
      assert.ok(Object.isFrozen(def), `SURFACE_TYPES.${name} should be frozen`);
    }
  });

  it('3. chat has trigger "always" and priority 0', () => {
    assert.equal(SURFACE_TYPES.chat.trigger, 'always');
    assert.equal(SURFACE_TYPES.chat.priority, 0);
  });

  it('4. canvas has the highest priority (3)', () => {
    const maxPriority = Math.max(
      ...Object.values(SURFACE_TYPES).map(d => d.priority),
    );
    assert.equal(SURFACE_TYPES.canvas.priority, 3);
    assert.equal(SURFACE_TYPES.canvas.priority, maxPriority);
  });

  it('5. all surfaces have component and trigger fields', () => {
    for (const [name, def] of Object.entries(SURFACE_TYPES)) {
      assert.ok(
        typeof def.component === 'string' && def.component.length > 0,
        `${name}.component should be a non-empty string`,
      );
      assert.ok(
        typeof def.trigger === 'string' && def.trigger.length > 0,
        `${name}.trigger should be a non-empty string`,
      );
    }
  });
});

// ─── detectSurfaces ─────────────────────────────────────────────────────────

describe('detectSurfaces', () => {
  it('6. empty toolCalls → only ["chat"]', () => {
    assert.deepStrictEqual(detectSurfaces([]), ['chat']);
  });

  it('7. single tool "exec" → ["terminal", "chat"]', () => {
    const result = detectSurfaces(['exec']);
    assert.ok(result.includes('terminal'), 'should contain terminal');
    assert.ok(result.includes('chat'), 'should contain chat');
    assert.equal(result.length, 2);
  });

  it('8. single tool "web_search" → ["search", "chat"]', () => {
    const result = detectSurfaces(['web_search']);
    assert.ok(result.includes('search'), 'should contain search');
    assert.ok(result.includes('chat'), 'should contain chat');
    assert.equal(result.length, 2);
  });

  it('9. multiple tools ["exec", "web_search"] → both surfaces + chat', () => {
    const result = detectSurfaces(['exec', 'web_search']);
    assert.ok(result.includes('terminal'), 'should contain terminal');
    assert.ok(result.includes('search'), 'should contain search');
    assert.ok(result.includes('chat'), 'should contain chat');
    assert.equal(result.length, 3);
  });

  it('10. unknown tool → only chat', () => {
    assert.deepStrictEqual(detectSurfaces(['totally_unknown_tool']), ['chat']);
  });

  it('11. all known tools → all surfaces active', () => {
    const allTriggers = Object.values(SURFACE_TYPES)
      .map(d => d.trigger)
      .filter(t => t !== 'always');
    const result = detectSurfaces(allTriggers);
    const expectedSurfaces = Object.keys(SURFACE_TYPES);
    for (const s of expectedSurfaces) {
      assert.ok(result.includes(s), `should contain ${s}`);
    }
    assert.equal(result.length, expectedSurfaces.length);
  });

  it('12. duplicate tools → no duplicate surfaces', () => {
    const result = detectSurfaces(['exec', 'exec', 'exec']);
    const unique = [...new Set(result)];
    assert.equal(result.length, unique.length, 'no duplicates');
    assert.ok(result.includes('terminal'));
    assert.ok(result.includes('chat'));
    assert.equal(result.length, 2);
  });

  it('13. null/undefined input → only chat', () => {
    assert.deepStrictEqual(detectSurfaces(null), ['chat']);
    assert.deepStrictEqual(detectSurfaces(undefined), ['chat']);
  });

  it('14. result sorted by priority descending (chat last)', () => {
    const result = detectSurfaces(['exec', 'web_search', 'canvas_op']);
    // chat (priority 0) should always be last
    assert.equal(result[result.length - 1], 'chat');
    // Verify descending priority order
    for (let i = 0; i < result.length - 1; i++) {
      const pa = SURFACE_TYPES[result[i]].priority;
      const pb = SURFACE_TYPES[result[i + 1]].priority;
      assert.ok(pa >= pb, `priority of ${result[i]} (${pa}) >= ${result[i + 1]} (${pb})`);
    }
  });

  it('15. canvas_op → canvas (priority 3) first in result', () => {
    const result = detectSurfaces(['canvas_op', 'exec']);
    assert.equal(result[0], 'canvas', 'canvas should be first (highest priority)');
  });
});

// ─── computeLayout ──────────────────────────────────────────────────────────

describe('computeLayout', () => {
  it('16. empty/null input → single column, chat area', () => {
    for (const input of [[], null, undefined]) {
      const layout = computeLayout(input);
      assert.equal(layout.gridTemplateColumns, '1fr');
      assert.equal(layout.gridTemplateRows, '1fr');
      assert.ok(layout.areas.chat, 'should have chat area');
    }
  });

  it('17. single surface (chat only) → 1fr / 1fr, single area', () => {
    const layout = computeLayout(['chat']);
    assert.equal(layout.gridTemplateColumns, '1fr');
    assert.equal(layout.gridTemplateRows, '1fr');
    assert.ok(layout.areas.chat);
    assert.equal(Object.keys(layout.areas).length, 1);
  });

  it('18. two surfaces (terminal + chat) → 3fr 2fr (60/40), chat on right', () => {
    const layout = computeLayout(['terminal', 'chat']);
    assert.equal(layout.gridTemplateColumns, '3fr 2fr');
    assert.equal(layout.areas.terminal.column, 1, 'terminal on left (column 1)');
    assert.equal(layout.areas.chat.column, 2, 'chat on right (column 2)');
  });

  it('19. two non-chat surfaces → 1fr 1fr (50/50)', () => {
    const layout = computeLayout(['terminal', 'editor']);
    assert.equal(layout.gridTemplateColumns, '1fr 1fr');
    assert.equal(layout.areas.terminal.column, 1);
    assert.equal(layout.areas.editor.column, 2);
  });

  it('20. three surfaces → 2-column grid, chat spans right column', () => {
    const layout = computeLayout(['canvas', 'terminal', 'chat']);
    // Should be 2 columns
    assert.ok(layout.gridTemplateColumns.includes('fr'), 'should use fractional columns');
    // Chat should span right column fully
    assert.equal(layout.areas.chat.column, 2, 'chat in right column');
    assert.ok(layout.areas.chat.rowSpan >= 2, 'chat spans multiple rows');
  });

  it('21. four surfaces → left column stacked, chat spans right', () => {
    const layout = computeLayout(['canvas', 'terminal', 'editor', 'chat']);
    // 3 non-chat surfaces stacked on left, chat spanning right
    const nonChat = Object.entries(layout.areas).filter(([k]) => k !== 'chat');
    for (const [name, area] of nonChat) {
      assert.equal(area.column, 1, `${name} should be in left column`);
      assert.equal(area.columnSpan, 1, `${name} columnSpan = 1`);
    }
    assert.equal(layout.areas.chat.column, 2, 'chat in right column');
    assert.equal(layout.areas.chat.rowSpan, 3, 'chat spans all 3 rows');
  });

  it('22. grid areas have correct row/column/span values', () => {
    const layout = computeLayout(['terminal', 'chat']);
    const termArea = layout.areas.terminal;
    assert.equal(typeof termArea.row, 'number');
    assert.equal(typeof termArea.column, 'number');
    assert.equal(typeof termArea.rowSpan, 'number');
    assert.equal(typeof termArea.columnSpan, 'number');
    assert.ok(termArea.row >= 1);
    assert.ok(termArea.column >= 1);
    assert.ok(termArea.rowSpan >= 1);
    assert.ok(termArea.columnSpan >= 1);
  });

  it('23. grid areas have valid CSS gridArea shorthand string', () => {
    const layout = computeLayout(['terminal', 'chat']);
    for (const [name, area] of Object.entries(layout.areas)) {
      assert.equal(typeof area.gridArea, 'string', `${name}.gridArea should be a string`);
      const parts = area.gridArea.split(' / ');
      assert.equal(parts.length, 4, `${name}.gridArea should have 4 parts separated by " / "`);
      for (const part of parts) {
        assert.ok(!isNaN(Number(part)), `each part should be numeric, got "${part}"`);
      }
    }
  });

  it('24. row template matches number of left-column surfaces', () => {
    const layout = computeLayout(['canvas', 'terminal', 'editor', 'chat']);
    // 3 non-chat surfaces → 3 rows
    const rowParts = layout.gridTemplateRows.split(' ');
    assert.equal(rowParts.length, 3, 'should have 3 row tracks');
    for (const part of rowParts) {
      assert.equal(part, '1fr');
    }
  });

  it('25. single non-chat surface → full width', () => {
    const layout = computeLayout(['terminal']);
    assert.equal(layout.gridTemplateColumns, '1fr');
    assert.equal(layout.gridTemplateRows, '1fr');
    assert.equal(layout.areas.terminal.column, 1);
    assert.equal(layout.areas.terminal.columnSpan, 1);
    assert.equal(Object.keys(layout.areas).length, 1);
  });
});

// ─── surfaceTransition ──────────────────────────────────────────────────────

describe('surfaceTransition', () => {
  it('26. no change (same sets) → empty add/remove, all keep', () => {
    const t = surfaceTransition(['chat', 'terminal'], ['chat', 'terminal']);
    assert.deepStrictEqual(t.add, []);
    assert.deepStrictEqual(t.remove, []);
    assert.ok(t.keep.includes('chat'));
    assert.ok(t.keep.includes('terminal'));
    assert.equal(t.keep.length, 2);
  });

  it('27. add one surface → appears in add', () => {
    const t = surfaceTransition(['chat'], ['terminal', 'chat']);
    assert.deepStrictEqual(t.add, ['terminal']);
    assert.deepStrictEqual(t.remove, []);
    assert.deepStrictEqual(t.keep, ['chat']);
  });

  it('28. remove one surface → appears in remove', () => {
    const t = surfaceTransition(['terminal', 'chat'], ['chat']);
    assert.deepStrictEqual(t.add, []);
    assert.deepStrictEqual(t.remove, ['terminal']);
    assert.deepStrictEqual(t.keep, ['chat']);
  });

  it('29. replace surface → one add, one remove, rest keep', () => {
    const t = surfaceTransition(['terminal', 'chat'], ['editor', 'chat']);
    assert.deepStrictEqual(t.add, ['editor']);
    assert.deepStrictEqual(t.remove, ['terminal']);
    assert.deepStrictEqual(t.keep, ['chat']);
  });

  it('30. from empty to multiple → all add', () => {
    const t = surfaceTransition([], ['terminal', 'chat']);
    assert.ok(t.add.includes('terminal'));
    assert.ok(t.add.includes('chat'));
    assert.equal(t.add.length, 2);
    assert.deepStrictEqual(t.remove, []);
    assert.deepStrictEqual(t.keep, []);
  });

  it('31. from multiple to empty → all remove', () => {
    const t = surfaceTransition(['terminal', 'chat'], []);
    assert.deepStrictEqual(t.add, []);
    assert.ok(t.remove.includes('terminal'));
    assert.ok(t.remove.includes('chat'));
    assert.equal(t.remove.length, 2);
    assert.deepStrictEqual(t.keep, []);
  });

  it('32. null/undefined inputs → graceful handling (empty arrays)', () => {
    const t1 = surfaceTransition(null, ['chat']);
    assert.deepStrictEqual(t1.add, ['chat']);
    assert.deepStrictEqual(t1.remove, []);
    assert.deepStrictEqual(t1.keep, []);

    const t2 = surfaceTransition(['chat'], undefined);
    assert.deepStrictEqual(t2.add, []);
    assert.deepStrictEqual(t2.remove, ['chat']);
    assert.deepStrictEqual(t2.keep, []);

    const t3 = surfaceTransition(null, null);
    assert.deepStrictEqual(t3.add, []);
    assert.deepStrictEqual(t3.remove, []);
    assert.deepStrictEqual(t3.keep, []);
  });

  it('33. complete replacement (no overlap) → all add, all remove, empty keep', () => {
    const t = surfaceTransition(['terminal', 'search'], ['editor', 'canvas']);
    assert.ok(t.add.includes('editor'));
    assert.ok(t.add.includes('canvas'));
    assert.equal(t.add.length, 2);
    assert.ok(t.remove.includes('terminal'));
    assert.ok(t.remove.includes('search'));
    assert.equal(t.remove.length, 2);
    assert.deepStrictEqual(t.keep, []);
  });
});

// ─── makeArea (indirectly via computeLayout) ────────────────────────────────

describe('makeArea (via computeLayout)', () => {
  it('34. all areas have row, column, rowSpan, columnSpan, gridArea', () => {
    const layout = computeLayout(['canvas', 'terminal', 'editor', 'chat']);
    for (const [name, area] of Object.entries(layout.areas)) {
      assert.ok('row' in area, `${name} missing row`);
      assert.ok('column' in area, `${name} missing column`);
      assert.ok('rowSpan' in area, `${name} missing rowSpan`);
      assert.ok('columnSpan' in area, `${name} missing columnSpan`);
      assert.ok('gridArea' in area, `${name} missing gridArea`);
    }
  });

  it('35. gridArea format is "row / col / row+rowSpan / col+colSpan"', () => {
    const layout = computeLayout(['canvas', 'terminal', 'chat']);
    for (const [name, area] of Object.entries(layout.areas)) {
      const expected = `${area.row} / ${area.column} / ${area.row + area.rowSpan} / ${area.column + area.columnSpan}`;
      assert.equal(
        area.gridArea,
        expected,
        `${name}.gridArea should match computed format`,
      );
    }
  });
});
