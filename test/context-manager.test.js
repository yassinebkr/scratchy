import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addTurn,
  buildContext,
  getTurnCount,
  getTokenEstimate,
  clearSession,
  clearAll,
  stats,
  _testing,
} from '../lib/context-manager.js';

const SK = 'test:session:1';

describe('context-manager — addTurn & basics', () => {
  beforeEach(() => clearAll());

  it('adds turns and tracks count', () => {
    addTurn(SK, 'user', 'Hello');
    addTurn(SK, 'assistant', 'Hi there');
    assert.equal(getTurnCount(SK), 2);
  });

  it('estimates tokens', () => {
    addTurn(SK, 'user', 'x'.repeat(350)); // ~100 tokens
    assert.ok(getTokenEstimate(SK) >= 90);
    assert.ok(getTokenEstimate(SK) <= 110);
  });

  it('caps at 200 turns', () => {
    for (let i = 0; i < 210; i++) {
      addTurn(SK, 'user', `turn ${i}`);
    }
    assert.equal(getTurnCount(SK), 200);
  });

  it('clears session', () => {
    addTurn(SK, 'user', 'test');
    clearSession(SK);
    assert.equal(getTurnCount(SK), 0);
  });

  it('reports stats', () => {
    addTurn('s1', 'user', 'a');
    addTurn('s2', 'user', 'b');
    const s = stats();
    assert.equal(s.sessionCount, 2);
    assert.equal(s.totalTurns, 2);
  });
});

describe('context-manager — observation masking', () => {
  beforeEach(() => clearAll());

  it('masks old tool results but keeps recent ones', () => {
    // Add 10 turns, first 4 have tool calls
    for (let i = 0; i < 4; i++) {
      addTurn(SK, 'user', `Do task ${i}`);
      addTurn(SK, 'assistant', `<tool_call><name>shell</name><arguments>{"command":"ls"}</arguments></tool_call>\n<tool_result>file1.js\nfile2.js</tool_result>\nI found 2 files.`);
    }
    // Add 2 more recent turns (no tools)
    addTurn(SK, 'user', 'What did you find?');
    addTurn(SK, 'assistant', 'I found several files across the project.');

    const ctx = buildContext(SK, 'You are a helper.', { toolKeepRecent: 4 });

    // Oldest tool turns should be masked
    const oldTurns = ctx.messages.filter(m => m.content.includes('[tool results masked'));
    assert.ok(oldTurns.length > 0, 'Expected some masked turns');

    // Recent tool turns should NOT be masked
    const recentToolTurns = ctx.messages.filter(m => m.content.includes('<tool_call>'));
    assert.ok(recentToolTurns.length > 0, 'Expected recent tool turns to be preserved');

    assert.ok(ctx.masked > 0, 'Expected masked count > 0');
  });

  it('keeps all tool results when within recent window', () => {
    addTurn(SK, 'user', 'run ls');
    addTurn(SK, 'assistant', '<tool_call><name>shell</name></tool_call><tool_result>output</tool_result>');

    const ctx = buildContext(SK, 'system', { toolKeepRecent: 6 });
    assert.equal(ctx.masked, 0);
    assert.ok(ctx.messages[1].content.includes('<tool_result>'));
  });
});

describe('context-manager — canvas pruning', () => {
  beforeEach(() => clearAll());

  it('strips old canvas blocks but keeps recent ones', () => {
    // 5 turns with canvas
    for (let i = 0; i < 5; i++) {
      addTurn(SK, 'user', `Show chart ${i}`);
      addTurn(SK, 'assistant', `Here's the chart:\n\`\`\`scratchy-toon\nop: upsert\nid: chart-${i}\ntype: gauge\ndata:\n  label: CPU\n  value: ${i * 20}\n\`\`\`\nChart ${i} displayed.`);
    }

    const ctx = buildContext(SK, 'system', { canvasKeepRecent: 3 });

    // Older canvas blocks should be replaced
    const removedCount = ctx.messages.filter(m => m.content.includes('[canvas output removed]')).length;
    assert.ok(removedCount > 0, 'Expected some canvas blocks to be pruned');

    // Recent canvas blocks should be preserved
    const keptCanvas = ctx.messages.filter(m => m.content.includes('scratchy-toon'));
    assert.ok(keptCanvas.length > 0, 'Expected recent canvas blocks to be kept');

    assert.ok(ctx.pruned > 0, 'Expected pruned count > 0');
  });
});

describe('context-manager — token budgeting', () => {
  beforeEach(() => clearAll());

  it('drops oldest turns when over budget', () => {
    // Add many large turns
    for (let i = 0; i < 20; i++) {
      addTurn(SK, 'user', 'x'.repeat(3500)); // ~1000 tokens each
    }

    // Budget of 5000 tokens (system=100 + 4900 for messages)
    const ctx = buildContext(SK, 'system prompt', { maxTokens: 5000 });

    // Should have dropped old turns to fit budget
    assert.ok(ctx.turnCount < 20, `Expected fewer than 20 turns, got ${ctx.turnCount}`);
    assert.ok(ctx.tokenEstimate <= 5000, `Expected <= 5000 tokens, got ${ctx.tokenEstimate}`);
    // Should keep at least 4 turns (MIN_KEEP)
    assert.ok(ctx.turnCount >= 4, `Expected at least 4 turns, got ${ctx.turnCount}`);
  });

  it('keeps all turns when under budget', () => {
    addTurn(SK, 'user', 'Hello');
    addTurn(SK, 'assistant', 'Hi');
    addTurn(SK, 'user', 'How are you?');

    const ctx = buildContext(SK, 'system', { maxTokens: 100000 });
    assert.equal(ctx.turnCount, 3);
  });
});

describe('context-manager — combined masking + pruning', () => {
  beforeEach(() => clearAll());

  it('applies both masking and pruning to old turns', () => {
    // Turn with both tool calls and canvas
    addTurn(SK, 'user', 'Check server and show dashboard');
    addTurn(SK, 'assistant',
      '<tool_call><name>shell</name></tool_call><tool_result>CPU: 73%</tool_result>\n' +
      'Server is healthy.\n' +
      '```scratchy-toon\nop: upsert\nid: dash\ntype: gauge\ndata:\n  label: CPU\n  value: 73\n```\nDashboard updated.');

    // Add enough recent turns to push the old one past both thresholds
    for (let i = 0; i < 8; i++) {
      addTurn(SK, i % 2 === 0 ? 'user' : 'assistant', `Turn ${i}`);
    }

    const ctx = buildContext(SK, 'system', { toolKeepRecent: 3, canvasKeepRecent: 2 });

    // The old turn should have been processed
    assert.ok(ctx.masked > 0 || ctx.pruned > 0, 'Expected masking or pruning');
  });
});

describe('context-manager — edge cases', () => {
  beforeEach(() => clearAll());

  it('handles empty session', () => {
    const ctx = buildContext('nonexistent', 'system');
    assert.equal(ctx.turnCount, 0);
    assert.equal(ctx.messages.length, 0);
  });

  it('detects canvas content correctly', () => {
    assert.ok(_testing.hasCanvasContent('```scratchy-canvas\n{"op":"clear"}\n```'));
    assert.ok(_testing.hasCanvasContent(`\`\`\`scratchy-toon\nop: upsert\n\`\`\``));
    assert.ok(!_testing.hasCanvasContent('just regular text'));
  });

  it('detects tool content correctly', () => {
    assert.ok(_testing.hasToolContent('<tool_call><name>shell</name></tool_call>'));
    assert.ok(_testing.hasToolContent('<tool_result>output</tool_result>'));
    assert.ok(!_testing.hasToolContent('just regular text'));
  });

  it('summarizes tool results', () => {
    const summary = _testing.summarizeToolResults('<tool_call><name>shell</name></tool_call><tool_result>file.js</tool_result>');
    assert.ok(summary.includes('shell'));
  });
});
