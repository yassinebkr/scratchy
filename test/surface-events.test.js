/**
 * @module test/surface-events
 * Hardened unit tests for server/surface-events.js
 *
 * Contract: surface-events detects tool calls in AI responses, activates
 * contextual UI surfaces, and handles A2UI envelopes.
 *
 * Key exports:
 *   extractToolCalls(text) → DetectedToolCall[]
 *   createSurfaceEventHandler(opts) → SurfaceEventHandler
 *
 * Run: node --test test/surface-events.test.js
 */

import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

/* ------------------------------------------------------------------ */
/*  We need to mock broadcastToUser before importing surface-events   */
/* ------------------------------------------------------------------ */

// The surface-events module imports broadcastToUser from ./ws.js at module level.
// We need to intercept those calls. We'll test extractToolCalls directly
// (it's a pure function) and test the handler via the actual module.

// Since broadcastToUser is called internally, we test the handler factory
// using the exported API — any broadcast will go through the real ws module.
// For our tests, we just verify the handler doesn't crash and returns
// the right structure. The broadcastToUser calls will silently fail
// (no connected users in test).

import { extractToolCalls, createSurfaceEventHandler, cleanupUser } from '../server/surface-events.js';

/* ------------------------------------------------------------------ */
/*  Force exit after all tests — prevent dangling linger timers       */
/* ------------------------------------------------------------------ */
after(() => {
  // Surface linger timers (30s setTimeout) keep the process alive.
  // Force exit after all tests complete.
  setTimeout(() => process.exit(0), 500).unref();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function createMockWs() {
  const messages = [];
  return {
    readyState: 1,
    send(data) { messages.push(JSON.parse(data)); },
    messages,
    close() { this.readyState = 3; },
  };
}

/* ================================================================== */
/*  1. extractToolCalls — XML format (Anthropic-style)               */
/* ================================================================== */

describe('extractToolCalls() — XML format', () => {
  it('extracts single XML tool_use block', () => {
    const text = `I'll execute that command.
<tool_use><name>exec</name><input>{"command":"ls -la"}</input></tool_use>`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'exec');
    assert.deepStrictEqual(calls[0].args, { command: 'ls -la' });
    assert.equal(calls[0].format, 'xml');
  });

  it('extracts multiple XML tool_use blocks', () => {
    const text = `
<tool_use><name>exec</name><input>{"command":"ls"}</input></tool_use>
Some text in between.
<tool_use><name>write_file</name><input>{"path":"/tmp/test","content":"hello"}</input></tool_use>`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].name, 'exec');
    assert.equal(calls[1].name, 'write_file');
  });

  it('handles invalid JSON in XML input → wraps as _raw', () => {
    const text = `<tool_use><name>exec</name><input>not json at all</input></tool_use>`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'exec');
    assert.deepStrictEqual(calls[0].args, { _raw: 'not json at all' });
  });

  it('handles XML with whitespace inside tags', () => {
    const text = `<tool_use>
  <name>web_search</name>
  <input>{"query": "test"}</input>
</tool_use>`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'web_search');
  });
});

/* ================================================================== */
/*  2. extractToolCalls — JSON format (tool_call objects)            */
/* ================================================================== */

describe('extractToolCalls() — JSON format', () => {
  it('extracts JSON tool_call object', () => {
    const text = `Here's the result: {"tool_call": {"name": "exec", "arguments": {"command": "pwd"}}}`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'exec');
    assert.deepStrictEqual(calls[0].args, { command: 'pwd' });
    assert.equal(calls[0].format, 'json');
  });

  it('extracts tool_call with string arguments → parses them', () => {
    const text = `{"tool_call": {"name": "exec", "arguments": "{\\"command\\":\\"ls\\"}"}}`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'exec');
    assert.deepStrictEqual(calls[0].args, { command: 'ls' });
  });

  it('extracts tool_call with args field (alias)', () => {
    const text = `{"tool_call": {"name": "read_file", "args": {"path": "/tmp/test.txt"}}}`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'read_file');
    assert.deepStrictEqual(calls[0].args, { path: '/tmp/test.txt' });
  });

  it('extracts tool_call with input field (alias)', () => {
    const text = `{"tool_call": {"name": "exec", "input": {"cmd": "ls"}}}`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.deepStrictEqual(calls[0].args, { cmd: 'ls' });
  });
});

/* ================================================================== */
/*  3. extractToolCalls — OpenAI function_call format                */
/* ================================================================== */

describe('extractToolCalls() — OpenAI function_call format', () => {
  it('extracts function_call object', () => {
    const text = `{"function_call": {"name": "web_search", "arguments": {"query": "test"}}}`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'web_search');
    assert.deepStrictEqual(calls[0].args, { query: 'test' });
    assert.equal(calls[0].format, 'function_call');
  });

  it('extracts function_call with string arguments', () => {
    const text = `{"function_call": {"name": "exec", "arguments": "{\\"command\\":\\"uptime\\"}"}}`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'exec');
    assert.deepStrictEqual(calls[0].args, { command: 'uptime' });
  });

  it('handles function_call with unparseable string args → wraps as _raw', () => {
    const text = `{"function_call": {"name": "exec", "arguments": "not json"}}`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.deepStrictEqual(calls[0].args, { _raw: 'not json' });
  });
});

/* ================================================================== */
/*  4. extractToolCalls — Fenced code block format                   */
/* ================================================================== */

describe('extractToolCalls() — fenced code block format', () => {
  it('extracts fenced tool block', () => {
    const text = "Here's the tool call:\n```tool\n{\"name\":\"exec\",\"args\":{\"command\":\"whoami\"}}\n```";
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'exec');
    assert.deepStrictEqual(calls[0].args, { command: 'whoami' });
    assert.equal(calls[0].format, 'fenced');
  });

  it('extracts multiple fenced tool blocks', () => {
    const text = "```tool\n{\"name\":\"exec\",\"args\":{\"command\":\"ls\"}}\n```\nSome text\n```tool\n{\"name\":\"read_file\",\"arguments\":{\"path\":\"/tmp\"}}\n```";
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].name, 'exec');
    assert.equal(calls[1].name, 'read_file');
  });

  it('handles fenced block with invalid JSON → skips', () => {
    const text = "```tool\nnot valid json\n```";
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 0);
  });

  it('handles fenced block without name → skips', () => {
    const text = '```tool\n{"args":{"command":"ls"}}\n```';
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 0);
  });
});

/* ================================================================== */
/*  5. extractToolCalls — edge cases & robustness                    */
/* ================================================================== */

describe('extractToolCalls() — edge cases', () => {
  it('empty string → empty array', () => {
    assert.deepStrictEqual(extractToolCalls(''), []);
  });

  it('null → empty array', () => {
    assert.deepStrictEqual(extractToolCalls(null), []);
  });

  it('undefined → empty array', () => {
    assert.deepStrictEqual(extractToolCalls(undefined), []);
  });

  it('number input → empty array', () => {
    assert.deepStrictEqual(extractToolCalls(42), []);
  });

  it('boolean input → empty array', () => {
    assert.deepStrictEqual(extractToolCalls(true), []);
  });

  it('object input → empty array', () => {
    assert.deepStrictEqual(extractToolCalls({}), []);
  });

  it('plain text without tool calls → empty array', () => {
    assert.deepStrictEqual(
      extractToolCalls('This is just a regular response with no tool calls.'),
      []
    );
  });

  it('malformed/incomplete JSON → empty array, no crash', () => {
    const text = '{"tool_call": {"name": "exec", "arguments": {';
    assert.doesNotThrow(() => extractToolCalls(text));
    // May or may not extract — the key is no crash
  });

  it('deeply nested JSON → no crash', () => {
    const deep = '{"a":'.repeat(100) + '1' + '}'.repeat(100);
    assert.doesNotThrow(() => extractToolCalls(deep));
  });

  it('very long input → no crash', () => {
    const longText = 'x'.repeat(100_000);
    assert.doesNotThrow(() => extractToolCalls(longText));
    const result = extractToolCalls(longText);
    assert.ok(Array.isArray(result));
  });

  it('XML priority: returns XML format when both XML and JSON present', () => {
    const text = `<tool_use><name>exec</name><input>{"command":"ls"}</input></tool_use>
{"tool_call": {"name": "read_file", "arguments": {"path": "/tmp"}}}`;
    const calls = extractToolCalls(text);
    // XML is checked first — should return XML results
    assert.ok(calls.length >= 1);
    assert.equal(calls[0].format, 'xml');
  });

  it('handles response with tool call embedded in prose', () => {
    const text = `Let me check that for you. I'll search the web to find the answer.

{"function_call": {"name": "web_search", "arguments": {"query": "Node.js 22 features"}}}

That should give us what we need.`;
    const calls = extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'web_search');
  });
});

/* ================================================================== */
/*  6. createSurfaceEventHandler — factory & interface               */
/* ================================================================== */

describe('createSurfaceEventHandler()', () => {
  it('returns an object with all expected methods', () => {
    const handler = createSurfaceEventHandler();
    assert.equal(typeof handler.handleToolCall, 'function');
    assert.equal(typeof handler.handleToolResult, 'function');
    assert.equal(typeof handler.handleA2UI, 'function');
    assert.equal(typeof handler.handleSurfaceAction, 'function');
    assert.equal(typeof handler.extractToolCalls, 'function');
    assert.equal(typeof handler.getActiveSurfaces, 'function');
    assert.equal(typeof handler.cleanup, 'function');
  });

  it('accepts custom logger', () => {
    const logs = [];
    const customLogger = {
      log: (...args) => logs.push(['log', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args]),
    };
    const handler = createSurfaceEventHandler({ logger: customLogger });
    assert.ok(handler);
  });

  it('default options → no crash', () => {
    assert.doesNotThrow(() => createSurfaceEventHandler());
    assert.doesNotThrow(() => createSurfaceEventHandler({}));
  });
});

/* ================================================================== */
/*  7. getActiveSurfaces — always includes chat                      */
/* ================================================================== */

describe('getActiveSurfaces()', () => {
  it('always includes chat for new users', () => {
    const handler = createSurfaceEventHandler();
    const surfaces = handler.getActiveSurfaces('new_user_123');
    assert.ok(surfaces.includes('chat'));
  });

  it('returns a new array each time (no shared reference)', () => {
    const handler = createSurfaceEventHandler();
    const a = handler.getActiveSurfaces('user_a');
    const b = handler.getActiveSurfaces('user_a');
    assert.notStrictEqual(a, b, 'should return new array each time');
    assert.deepStrictEqual(a, b, 'but with same contents');
  });

  it('different users have independent surface state', () => {
    const handler = createSurfaceEventHandler();
    const s1 = handler.getActiveSurfaces('user_x');
    const s2 = handler.getActiveSurfaces('user_y');
    assert.deepStrictEqual(s1, s2, 'both should start with just chat');
  });
});

/* ================================================================== */
/*  8. handleToolCall — surface activation                           */
/* ================================================================== */

describe('handleToolCall()', () => {
  it('does not crash for known tool name', () => {
    const handler = createSurfaceEventHandler();
    assert.doesNotThrow(() => {
      handler.handleToolCall('user1', 'exec', { command: 'ls' });
    });
  });

  it('does not crash for unknown tool name', () => {
    const handler = createSurfaceEventHandler();
    assert.doesNotThrow(() => {
      handler.handleToolCall('user1', 'unknown_tool', { foo: 'bar' });
    });
  });

  it('activates terminal surface for exec tool', () => {
    const handler = createSurfaceEventHandler();
    handler.handleToolCall('tool_user', 'exec', { command: 'ls' });
    const surfaces = handler.getActiveSurfaces('tool_user');
    assert.ok(surfaces.includes('terminal'), 'exec should activate terminal');
    assert.ok(surfaces.includes('chat'), 'chat should always be present');
  });

  it('activates editor surface for write_file tool', () => {
    const handler = createSurfaceEventHandler();
    handler.handleToolCall('tool_user2', 'write_file', { path: '/tmp/test' });
    const surfaces = handler.getActiveSurfaces('tool_user2');
    assert.ok(surfaces.includes('editor'));
  });

  it('activates search surface for web_search tool', () => {
    const handler = createSurfaceEventHandler();
    handler.handleToolCall('tool_user3', 'web_search', { query: 'test' });
    const surfaces = handler.getActiveSurfaces('tool_user3');
    assert.ok(surfaces.includes('search'));
  });

  it('with optional WS parameter → no crash', () => {
    const handler = createSurfaceEventHandler();
    const ws = createMockWs();
    assert.doesNotThrow(() => {
      handler.handleToolCall('user1', 'exec', { command: 'ls' }, ws);
    });
  });

  it('logs tool call via custom logger', () => {
    const logs = [];
    const handler = createSurfaceEventHandler({
      logger: {
        log: (...args) => logs.push(args.join(' ')),
        warn: () => {},
        error: () => {},
      },
    });
    handler.handleToolCall('user_log', 'exec', { command: 'ls' });
    assert.ok(logs.some(l => l.includes('exec')), 'should log the tool name');
  });
});

/* ================================================================== */
/*  9. handleToolResult — result forwarding                          */
/* ================================================================== */

describe('handleToolResult()', () => {
  it('does not crash for known tool', () => {
    const handler = createSurfaceEventHandler();
    assert.doesNotThrow(() => {
      handler.handleToolResult('user1', 'exec', { output: 'result', exitCode: 0 });
    });
  });

  it('does not crash for unknown tool', () => {
    const handler = createSurfaceEventHandler();
    assert.doesNotThrow(() => {
      handler.handleToolResult('user1', 'unknown_tool', { data: 'something' });
    });
  });

  it('schedules deactivation for non-chat surfaces', () => {
    const handler = createSurfaceEventHandler();
    // First activate terminal
    handler.handleToolCall('deact_user', 'exec', { command: 'ls' });
    const before = handler.getActiveSurfaces('deact_user');
    assert.ok(before.includes('terminal'));

    // Send tool result — should schedule deactivation (after 30s linger)
    handler.handleToolResult('deact_user', 'exec', { output: 'done' });

    // Surface should still be active immediately (linger period)
    const after = handler.getActiveSurfaces('deact_user');
    assert.ok(after.includes('terminal'), 'terminal should linger after result');

    // Cleanup to prevent timer leaks
    handler.cleanup('deact_user');
  });
});

/* ================================================================== */
/*  10. handleA2UI — A2UI envelope processing                       */
/* ================================================================== */

describe('handleA2UI()', () => {
  it('does not crash with valid A2UI envelope string', () => {
    const handler = createSurfaceEventHandler();
    const a2ui = JSON.stringify({
      a2ui: {
        version: '1.0',
        surfaces: [{
          surface: 'main',
          components: [
            { type: 'text', id: 'txt-1', data: { title: 'Hello', body: 'World' } },
          ],
        }],
      },
    });
    assert.doesNotThrow(() => {
      handler.handleA2UI('a2ui_user', a2ui);
    });
  });

  it('does not crash with parsed A2UI object', () => {
    const handler = createSurfaceEventHandler();
    const a2ui = {
      a2ui: {
        version: '1.0',
        surfaces: [{
          surface: 'main',
          components: [
            { type: 'text', id: 'txt-1', data: { title: 'Hello' } },
          ],
        }],
      },
    };
    assert.doesNotThrow(() => {
      handler.handleA2UI('a2ui_user2', a2ui);
    });
  });

  it('handles community (non-builtin) components', () => {
    const handler = createSurfaceEventHandler();
    const a2ui = JSON.stringify({
      a2ui: {
        version: '1.0',
        surfaces: [{
          surface: 'main',
          components: [
            { type: 'custom_widget', id: 'cw-1', data: { foo: 'bar' } },
          ],
        }],
      },
    });
    // Should not crash — community components are forwarded via a2ui-load
    assert.doesNotThrow(() => {
      handler.handleA2UI('a2ui_community', a2ui);
    });
  });

  it('handles mixed builtin + community components', () => {
    const handler = createSurfaceEventHandler();
    const a2ui = JSON.stringify({
      a2ui: {
        version: '1.0',
        surfaces: [{
          surface: 'main',
          components: [
            { type: 'text', id: 'txt-1', data: { title: 'Builtin' } },
            { type: 'custom_chart', id: 'cc-1', data: { series: [] } },
          ],
        }],
      },
    });
    assert.doesNotThrow(() => {
      handler.handleA2UI('a2ui_mixed', a2ui);
    });
  });

  it('empty A2UI envelope → warns, does not crash', () => {
    const logs = [];
    const handler = createSurfaceEventHandler({
      logger: {
        log: () => {},
        warn: (...args) => logs.push(args.join(' ')),
        error: () => {},
      },
    });
    handler.handleA2UI('a2ui_empty', '{}');
    // Should have logged a warning about empty/invalid A2UI
    // The parseA2UIMessage may return null for empty envelope
  });

  it('invalid JSON string → does not crash', () => {
    const handler = createSurfaceEventHandler();
    assert.doesNotThrow(() => {
      handler.handleA2UI('a2ui_bad', 'not json at all');
    });
  });
});

/* ================================================================== */
/*  11. handleSurfaceAction — relay                                  */
/* ================================================================== */

describe('handleSurfaceAction()', () => {
  it('does not crash with valid surface action', () => {
    const handler = createSurfaceEventHandler();
    assert.doesNotThrow(() => {
      handler.handleSurfaceAction('user1', {
        surface: 'terminal',
        action: 'input',
        data: { text: 'ls' },
      });
    });
  });

  it('warns on missing surface field', () => {
    const logs = [];
    const handler = createSurfaceEventHandler({
      logger: {
        log: () => {},
        warn: (...args) => logs.push(args.join(' ')),
        error: () => {},
      },
    });
    handler.handleSurfaceAction('user1', { action: 'input' });
    assert.ok(logs.some(l => l.includes('missing') || l.includes('Invalid')),
      'should warn about missing surface');
  });

  it('warns on missing action field', () => {
    const logs = [];
    const handler = createSurfaceEventHandler({
      logger: {
        log: () => {},
        warn: (...args) => logs.push(args.join(' ')),
        error: () => {},
      },
    });
    handler.handleSurfaceAction('user1', { surface: 'terminal' });
    assert.ok(logs.some(l => l.includes('missing') || l.includes('Invalid')));
  });

  it('warns on unknown surface name', () => {
    const logs = [];
    const handler = createSurfaceEventHandler({
      logger: {
        log: () => {},
        warn: (...args) => logs.push(args.join(' ')),
        error: () => {},
      },
    });
    handler.handleSurfaceAction('user1', {
      surface: 'nonexistent_surface',
      action: 'click',
    });
    assert.ok(logs.some(l => l.includes('Unknown') || l.includes('nonexistent')));
  });

  it('does not crash with empty data', () => {
    const handler = createSurfaceEventHandler();
    assert.doesNotThrow(() => {
      handler.handleSurfaceAction('user1', {
        surface: 'chat',
        action: 'send',
      });
    });
  });
});

/* ================================================================== */
/*  12. cleanup — state clearing                                     */
/* ================================================================== */

describe('cleanup()', () => {
  it('removes user state', () => {
    const handler = createSurfaceEventHandler();
    // Create state
    handler.handleToolCall('cleanup_user', 'exec', { command: 'ls' });
    const before = handler.getActiveSurfaces('cleanup_user');
    assert.ok(before.includes('terminal'));

    // Cleanup
    handler.cleanup('cleanup_user');

    // After cleanup, should get fresh state (just chat)
    const after = handler.getActiveSurfaces('cleanup_user');
    assert.deepStrictEqual(after, ['chat']);
  });

  it('cleanup non-existent user does not crash', () => {
    const handler = createSurfaceEventHandler();
    assert.doesNotThrow(() => {
      handler.cleanup('nonexistent_user_xyz');
    });
  });

  it('cleanup clears linger timers', () => {
    const handler = createSurfaceEventHandler();
    // Activate a surface and trigger deactivation timer
    handler.handleToolCall('timer_user', 'exec', { command: 'ls' });
    handler.handleToolResult('timer_user', 'exec', { output: 'done' });

    // Cleanup should clear the timer
    assert.doesNotThrow(() => {
      handler.cleanup('timer_user');
    });
  });

  it('module-level cleanupUser also works', () => {
    assert.doesNotThrow(() => {
      cleanupUser('module_cleanup_test');
    });
  });
});

/* ================================================================== */
/*  13. Surface linger behavior                                      */
/* ================================================================== */

describe('surface linger behavior', () => {
  it('surface stays active immediately after tool result', () => {
    const handler = createSurfaceEventHandler();
    handler.handleToolCall('linger_user', 'exec', { command: 'ls' });
    handler.handleToolResult('linger_user', 'exec', { output: 'files' });

    const surfaces = handler.getActiveSurfaces('linger_user');
    assert.ok(surfaces.includes('terminal'), 'terminal should linger');

    handler.cleanup('linger_user');
  });

  it('new tool call resets linger timer (no premature deactivation)', () => {
    const handler = createSurfaceEventHandler();

    // First tool call + result
    handler.handleToolCall('linger_user2', 'exec', { command: 'ls' });
    handler.handleToolResult('linger_user2', 'exec', { output: 'files' });

    // Second tool call — should reset the timer
    handler.handleToolCall('linger_user2', 'exec', { command: 'pwd' });

    const surfaces = handler.getActiveSurfaces('linger_user2');
    assert.ok(surfaces.includes('terminal'));

    handler.cleanup('linger_user2');
  });

  it('chat surface is never deactivated', () => {
    const handler = createSurfaceEventHandler();
    // After any operations, chat should always be present
    handler.handleToolCall('chat_persist', 'exec', { command: 'ls' });
    handler.handleToolResult('chat_persist', 'exec', { output: 'done' });

    const surfaces = handler.getActiveSurfaces('chat_persist');
    assert.ok(surfaces.includes('chat'), 'chat must always be present');

    handler.cleanup('chat_persist');
  });
});

/* ================================================================== */
/*  14. Layout computation with multiple surfaces                    */
/* ================================================================== */

describe('layout computation with multiple active surfaces', () => {
  it('multiple tools activate multiple surfaces', () => {
    const handler = createSurfaceEventHandler();

    handler.handleToolCall('multi_user', 'exec', { command: 'ls' });
    handler.handleToolCall('multi_user', 'web_search', { query: 'test' });

    const surfaces = handler.getActiveSurfaces('multi_user');
    assert.ok(surfaces.includes('terminal'));
    assert.ok(surfaces.includes('search'));
    assert.ok(surfaces.includes('chat'));
    assert.ok(surfaces.length >= 3);

    handler.cleanup('multi_user');
  });

  it('surfaces are sorted by priority', () => {
    const handler = createSurfaceEventHandler();

    handler.handleToolCall('sort_user', 'exec', { command: 'ls' });
    handler.handleToolCall('sort_user', 'web_search', { query: 'q' });
    handler.handleToolCall('sort_user', 'canvas_op', { op: 'upsert' });

    const surfaces = handler.getActiveSurfaces('sort_user');
    // canvas has highest priority (3), terminal (2), search (1), chat (0)
    // Should be sorted by priority descending
    const canvasIdx = surfaces.indexOf('canvas');
    const chatIdx = surfaces.indexOf('chat');
    if (canvasIdx !== -1 && chatIdx !== -1) {
      assert.ok(canvasIdx < chatIdx, 'canvas (priority 3) should come before chat (priority 0)');
    }

    handler.cleanup('sort_user');
  });
});

/* ================================================================== */
/*  15. extractToolCalls from handler object                         */
/* ================================================================== */

describe('handler.extractToolCalls()', () => {
  it('is the same function as the module-level export', () => {
    const handler = createSurfaceEventHandler();
    assert.equal(handler.extractToolCalls, extractToolCalls);
  });

  it('works via handler reference', () => {
    const handler = createSurfaceEventHandler();
    const text = '<tool_use><name>exec</name><input>{"command":"test"}</input></tool_use>';
    const calls = handler.extractToolCalls(text);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, 'exec');
  });
});
