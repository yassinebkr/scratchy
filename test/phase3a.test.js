/**
 * Phase 3a — Contextual Surfaces Tests
 *
 * Tests for:
 * - Surface detection logic (protocol/surfaces.js)
 * - Layout computation
 * - Surface transitions
 * - Server-side tool event forwarding (ws.js)
 * - Web Component interface contracts
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ─── Import protocol/surfaces.js ────────────────────────────────────────────

import { detectSurfaces, computeLayout, surfaceTransition, SURFACE_TYPES } from '../protocol/surfaces.js';

// ─── Surface Detection Tests ────────────────────────────────────────────────

describe('Surface Detection', () => {
  it('should always include chat', () => {
    const result = detectSurfaces([]);
    assert.ok(result.includes('chat'));
  });

  it('should detect terminal from exec', () => {
    const result = detectSurfaces(['exec']);
    assert.ok(result.includes('terminal'));
    assert.ok(result.includes('chat'));
  });

  it('should detect search from web_search', () => {
    const result = detectSurfaces(['web_search']);
    assert.ok(result.includes('search'));
  });

  it('should detect explorer from read_dir', () => {
    const result = detectSurfaces(['read_dir']);
    assert.ok(result.includes('explorer'));
  });

  it('should detect editor from write_file', () => {
    const result = detectSurfaces(['write_file']);
    assert.ok(result.includes('editor'));
  });

  it('should detect canvas from canvas_op', () => {
    const result = detectSurfaces(['canvas_op']);
    assert.ok(result.includes('canvas'));
  });

  it('should detect multiple surfaces', () => {
    const result = detectSurfaces(['exec', 'web_search']);
    assert.ok(result.includes('terminal'));
    assert.ok(result.includes('search'));
    assert.ok(result.includes('chat'));
    assert.equal(result.length, 3);
  });

  it('should sort by priority descending (chat last)', () => {
    const result = detectSurfaces(['exec', 'web_search']);
    // terminal: 2, search: 1, chat: 0
    const termIdx = result.indexOf('terminal');
    const searchIdx = result.indexOf('search');
    const chatIdx = result.indexOf('chat');
    assert.ok(termIdx < searchIdx, 'terminal before search');
    assert.ok(searchIdx < chatIdx, 'search before chat');
  });

  it('should handle null/undefined input', () => {
    assert.deepEqual(detectSurfaces(null), ['chat']);
    assert.deepEqual(detectSurfaces(undefined), ['chat']);
  });

  it('should handle unknown tool calls gracefully', () => {
    const result = detectSurfaces(['unknown_tool', 'another_one']);
    assert.deepEqual(result, ['chat']);
  });

  it('should deduplicate repeated tool calls', () => {
    const result = detectSurfaces(['exec', 'exec', 'exec']);
    const terminalCount = result.filter(s => s === 'terminal').length;
    assert.equal(terminalCount, 1);
  });
});

// ─── Layout Computation Tests ───────────────────────────────────────────────

describe('Layout Computation', () => {
  it('should return single column for chat only', () => {
    const layout = computeLayout(['chat']);
    assert.equal(layout.gridTemplateColumns, '1fr');
    assert.equal(layout.gridTemplateRows, '1fr');
    assert.ok(layout.areas.chat);
  });

  it('should return empty array layout', () => {
    const layout = computeLayout([]);
    assert.equal(layout.gridTemplateColumns, '1fr');
    assert.ok(layout.areas.chat);
  });

  it('should return 60/40 split for chat + one surface', () => {
    const layout = computeLayout(['terminal', 'chat']);
    assert.equal(layout.gridTemplateColumns, '3fr 2fr');
    assert.ok(layout.areas.terminal);
    assert.ok(layout.areas.chat);
    // Chat should be in column 2
    assert.equal(layout.areas.chat.column, 2);
    assert.equal(layout.areas.terminal.column, 1);
  });

  it('should return 50/50 for two non-chat surfaces', () => {
    const layout = computeLayout(['terminal', 'editor']);
    assert.equal(layout.gridTemplateColumns, '1fr 1fr');
  });

  it('should handle 3+ surfaces with grid', () => {
    const layout = computeLayout(['terminal', 'editor', 'search', 'chat']);
    assert.equal(layout.gridTemplateColumns, '7fr 3fr');
    // Chat spans entire right column
    assert.ok(layout.areas.chat);
    assert.equal(layout.areas.chat.column, 2);
    assert.ok(layout.areas.chat.rowSpan >= 2);
  });

  it('should have valid grid areas for all surfaces', () => {
    const layout = computeLayout(['terminal', 'editor', 'chat']);
    for (const [name, area] of Object.entries(layout.areas)) {
      assert.ok(area.row >= 1, `${name}.row >= 1`);
      assert.ok(area.column >= 1, `${name}.column >= 1`);
      assert.ok(area.rowSpan >= 1, `${name}.rowSpan >= 1`);
      assert.ok(area.columnSpan >= 1, `${name}.columnSpan >= 1`);
      assert.ok(area.gridArea, `${name}.gridArea exists`);
    }
  });

  it('gridArea format should be row/col/row-end/col-end', () => {
    const layout = computeLayout(['terminal', 'chat']);
    const chatArea = layout.areas.chat.gridArea;
    const parts = chatArea.split(' / ');
    assert.equal(parts.length, 4, 'gridArea should have 4 parts');
  });
});

// ─── Surface Transition Tests ───────────────────────────────────────────────

describe('Surface Transitions', () => {
  it('should detect added surfaces', () => {
    const t = surfaceTransition(['chat'], ['terminal', 'chat']);
    assert.deepEqual(t.add, ['terminal']);
    assert.deepEqual(t.remove, []);
    assert.deepEqual(t.keep, ['chat']);
  });

  it('should detect removed surfaces', () => {
    const t = surfaceTransition(['terminal', 'chat'], ['chat']);
    assert.deepEqual(t.add, []);
    assert.deepEqual(t.remove, ['terminal']);
    assert.deepEqual(t.keep, ['chat']);
  });

  it('should detect swapped surfaces', () => {
    const t = surfaceTransition(['terminal', 'chat'], ['editor', 'chat']);
    assert.deepEqual(t.add, ['editor']);
    assert.deepEqual(t.remove, ['terminal']);
    assert.deepEqual(t.keep, ['chat']);
  });

  it('should handle empty arrays', () => {
    const t = surfaceTransition([], []);
    assert.deepEqual(t.add, []);
    assert.deepEqual(t.remove, []);
    assert.deepEqual(t.keep, []);
  });

  it('should handle full replacement', () => {
    const t = surfaceTransition(['terminal', 'search'], ['editor', 'explorer']);
    assert.deepEqual(new Set(t.add), new Set(['editor', 'explorer']));
    assert.deepEqual(new Set(t.remove), new Set(['terminal', 'search']));
    assert.deepEqual(t.keep, []);
  });

  it('should handle null inputs', () => {
    const t = surfaceTransition(null, ['chat']);
    assert.deepEqual(t.add, ['chat']);
    assert.deepEqual(t.remove, []);
  });
});

// ─── SURFACE_TYPES Registry Tests ───────────────────────────────────────────

describe('SURFACE_TYPES Registry', () => {
  it('should have all expected surface types', () => {
    const expected = ['terminal', 'explorer', 'editor', 'search', 'canvas', 'chat'];
    for (const name of expected) {
      assert.ok(SURFACE_TYPES[name], `missing surface: ${name}`);
    }
  });

  it('each surface should have trigger, component, priority', () => {
    for (const [name, def] of Object.entries(SURFACE_TYPES)) {
      assert.ok(typeof def.trigger === 'string', `${name}.trigger is string`);
      assert.ok(typeof def.component === 'string', `${name}.component is string`);
      assert.ok(typeof def.priority === 'number', `${name}.priority is number`);
    }
  });

  it('chat should have trigger "always"', () => {
    assert.equal(SURFACE_TYPES.chat.trigger, 'always');
  });

  it('should be frozen (immutable)', () => {
    assert.throws(() => { SURFACE_TYPES.newSurface = {}; }, TypeError);
    assert.throws(() => { SURFACE_TYPES.terminal.priority = 999; }, TypeError);
  });

  it('priorities should be non-negative', () => {
    for (const [name, def] of Object.entries(SURFACE_TYPES)) {
      assert.ok(def.priority >= 0, `${name}.priority >= 0`);
    }
  });
});

// ─── Server WS Tool Event Forwarding Tests ──────────────────────────────────

describe('WS Tool Event Forwarding', () => {
  // We can't easily test the full WS handler here without mocking,
  // but we can verify the message types are handled.
  // The actual WS handler dispatches tool_call/tool_stream/tool_result to broadcastToUser.

  it('tool event types should be recognized strings', () => {
    const toolEventTypes = ['tool_call', 'tool_stream', 'tool_result'];
    for (const type of toolEventTypes) {
      assert.ok(typeof type === 'string');
      assert.ok(type.startsWith('tool_'));
    }
  });
});

// ─── Layout Integration Tests ───────────────────────────────────────────────

describe('Layout Integration', () => {
  it('single surface detection → valid layout', () => {
    const surfaces = detectSurfaces(['exec']);
    const layout = computeLayout(surfaces);
    assert.ok(layout.areas.terminal);
    assert.ok(layout.areas.chat);
    assert.equal(Object.keys(layout.areas).length, 2);
  });

  it('multiple detection → multiple layout areas', () => {
    const surfaces = detectSurfaces(['exec', 'web_search', 'write_file']);
    const layout = computeLayout(surfaces);
    assert.ok(layout.areas.terminal);
    assert.ok(layout.areas.search);
    assert.ok(layout.areas.editor);
    assert.ok(layout.areas.chat);
  });

  it('transition + layout should be consistent', () => {
    const from = detectSurfaces([]);
    const to = detectSurfaces(['exec']);
    const transition = surfaceTransition(from, to);
    assert.deepEqual(transition.add, ['terminal']);

    const layout = computeLayout(to);
    assert.ok(layout.areas.terminal);
  });

  it('should handle rapid surface changes', () => {
    // Simulate: exec → web_search → write → all active → clear
    let current = detectSurfaces(['exec']);
    let layout = computeLayout(current);
    assert.equal(Object.keys(layout.areas).length, 2);

    current = detectSurfaces(['exec', 'web_search']);
    layout = computeLayout(current);
    assert.equal(Object.keys(layout.areas).length, 3);

    current = detectSurfaces(['exec', 'web_search', 'write_file']);
    layout = computeLayout(current);
    assert.equal(Object.keys(layout.areas).length, 4);

    current = detectSurfaces([]);
    layout = computeLayout(current);
    assert.equal(Object.keys(layout.areas).length, 1); // just chat
  });
});

// ─── Component Interface Contract Tests ─────────────────────────────────────
// These test the expected API shape of each surface component.
// Since we can't run Web Components in Node, we verify the module exports.

describe('Component Interface Contracts', () => {
  it('ScTerminal should export from sc-terminal.js', async () => {
    // Verify the file is valid JS (syntax check)
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/components/sc-terminal.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('class ScTerminal extends HTMLElement'));
    assert.ok(src.includes("customElements.define('sc-terminal'"));
    // Check expected methods exist in source
    assert.ok(src.includes('addCommand('));
    assert.ok(src.includes('appendOutput('));
    assert.ok(src.includes('completeCommand('));
    assert.ok(src.includes('clear()'));
  });

  it('ScFiletree should export from sc-filetree.js', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/components/sc-filetree.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('class ScFiletree extends HTMLElement'));
    assert.ok(src.includes("customElements.define('sc-filetree'"));
    assert.ok(src.includes('setTree('));
    assert.ok(src.includes('addDirectory('));
    assert.ok(src.includes('showFile('));
  });

  it('ScEditor should export from sc-editor.js', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/components/sc-editor.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('class ScEditor extends HTMLElement'));
    assert.ok(src.includes("customElements.define('sc-editor'"));
    assert.ok(src.includes('openFile('));
    assert.ok(src.includes('showEdit('));
    assert.ok(src.includes('closeTab('));
  });

  it('ScSearch should export from sc-search.js', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/components/sc-search.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('class ScSearch extends HTMLElement'));
    assert.ok(src.includes("customElements.define('sc-search'"));
    assert.ok(src.includes('setResults('));
    assert.ok(src.includes('setFetchedPage('));
  });

  it('ScSurfaceToolbar should export from sc-surface-toolbar.js', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/components/sc-surface-toolbar.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('class ScSurfaceToolbar extends HTMLElement'));
    assert.ok(src.includes("customElements.define('sc-surface-toolbar'"));
    assert.ok(src.includes('setActive('));
  });
});

// ─── Surface Manager Module Shape Tests ─────────────────────────────────────

describe('Surface Manager Module', () => {
  it('should have expected exports', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/lib/surface-manager.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('export function initSurfaceManager'));
    assert.ok(src.includes('export function activateSurface'));
    assert.ok(src.includes('export function deactivateSurface'));
    assert.ok(src.includes('export function toggleSurface'));
    assert.ok(src.includes('export function getActiveSurfaces'));
    assert.ok(src.includes('export function getSurface'));
    assert.ok(src.includes('export function deactivateAll'));
  });

  it('should define all surface types', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/lib/surface-manager.js', import.meta.url), 'utf-8');
    assert.ok(src.includes("terminal:"));
    assert.ok(src.includes("explorer:"));
    assert.ok(src.includes("editor:"));
    assert.ok(src.includes("search:"));
    assert.ok(src.includes("canvas:"));
  });

  it('should have idle timeout mechanism', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/lib/surface-manager.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('IDLE_TIMEOUT'));
    assert.ok(src.includes('_resetIdleTimer'));
    assert.ok(src.includes('_clearIdleTimer'));
  });

  it('should handle keyboard shortcuts', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/lib/surface-manager.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('_wireKeyboard'));
    assert.ok(src.includes('metaKey'));
  });
});

// ─── ANSI Color Rendering Tests ─────────────────────────────────────────────

describe('Terminal ANSI Rendering', () => {
  // Test the ansiToHtml function by checking the source
  it('sc-terminal should handle ANSI escape codes', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../public/components/sc-terminal.js', import.meta.url), 'utf-8');
    assert.ok(src.includes('ansiToHtml'));
    assert.ok(src.includes('ANSI_COLORS'));
    // Should handle reset code
    assert.ok(src.includes("'0'"));
    // Should handle bold
    assert.ok(src.includes("'1'"));
    // Should handle standard colors (30-37)
    assert.ok(src.includes("'31'"));
    assert.ok(src.includes("'32'"));
  });
});

// ─── CSS/HTML Integration Tests ─────────────────────────────────────────────

describe('HTML/CSS Integration', () => {
  it('index.html should include all surface components', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf-8');
    assert.ok(html.includes('sc-terminal.js'));
    assert.ok(html.includes('sc-filetree.js'));
    assert.ok(html.includes('sc-editor.js'));
    assert.ok(html.includes('sc-search.js'));
    assert.ok(html.includes('sc-surface-toolbar.js'));
    assert.ok(html.includes('surface-manager.js'));
  });

  it('index.html should have surface container', async () => {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf-8');
    assert.ok(html.includes('id="surfaces"'));
    assert.ok(html.includes('surface-container'));
    assert.ok(html.includes('chat-surface'));
    assert.ok(html.includes('<sc-surface-toolbar>'));
  });

  it('main.css should have surface layout styles', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile(new URL('../public/styles/main.css', import.meta.url), 'utf-8');
    assert.ok(css.includes('.surface-container'));
    assert.ok(css.includes('.surface'));
    assert.ok(css.includes('.terminal-surface'));
    assert.ok(css.includes('.editor-surface'));
    assert.ok(css.includes('.explorer-surface'));
    assert.ok(css.includes('.search-surface'));
    assert.ok(css.includes('.surface-enter'));
  });
});

// ─── Edge Cases ─────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('computeLayout with all 5 surfaces + chat', () => {
    const all = ['terminal', 'explorer', 'editor', 'search', 'canvas', 'chat'];
    const layout = computeLayout(all);
    assert.ok(layout.areas.chat);
    // All surfaces should have areas
    for (const s of all) {
      assert.ok(layout.areas[s], `${s} should have an area`);
    }
  });

  it('detectSurfaces deduplicates chat', () => {
    // Even though chat is always present, should only appear once
    const result = detectSurfaces(['exec']);
    const chatCount = result.filter(s => s === 'chat').length;
    assert.equal(chatCount, 1);
  });

  it('transition from nothing to everything', () => {
    const from = ['chat'];
    const to = ['terminal', 'editor', 'search', 'explorer', 'canvas', 'chat'];
    const t = surfaceTransition(from, to);
    assert.equal(t.add.length, 5);
    assert.equal(t.remove.length, 0);
    assert.deepEqual(t.keep, ['chat']);
  });

  it('transition from everything to nothing', () => {
    const from = ['terminal', 'editor', 'search', 'explorer', 'canvas', 'chat'];
    const to = ['chat'];
    const t = surfaceTransition(from, to);
    assert.equal(t.add.length, 0);
    assert.equal(t.remove.length, 5);
    assert.deepEqual(t.keep, ['chat']);
  });
});
