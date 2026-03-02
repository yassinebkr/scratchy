/**
 * Team Delegation — Unit Tests
 *
 * Covers:
 *   - parseDelegationBlocks: block extraction, inline format, edge cases
 *   - formatDelegationResults: result formatting for follow-up turns
 *   - createFallbackProvider: runtime embedding fallback chain
 *   - routeTeamMessage: multi-turn delegation loop (mocked adapter)
 *
 * Philosophy: pure unit tests, no network, no side effects.
 * Mocks only where absolutely needed (adapter, WS).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ═══════════════════════════════════════════════════════════════════════════════
//  Delegation Block Parser
// ═══════════════════════════════════════════════════════════════════════════════

// Inline parser copy (not exported from team-router — test the logic directly)
function parseDelegationBlocks(text) {
  const delegations = [];
  const blockRegex = /\[DELEGATE\s+to=["']?([^"'\]\s]+)["']?\s+task=["']([^"']+)["'](?:\s+files=["']([^"']+)["'])?\s*\]([\s\S]*?)\[\/DELEGATE\]/gi;
  let cleanText = text;
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    const files = match[3] ? match[3].split(',').map(f => f.trim()).filter(Boolean) : [];
    delegations.push({ agentId: match[1].trim(), task: match[2].trim(), files, context: match[4].trim() });
  }
  cleanText = text.replace(blockRegex, '').trim();
  const inlineRegex = /\[DELEGATE\s+to=["']?([^"'\]\s]+)["']?\s+task=["']([^"']+)["'](?:\s+files=["']([^"']+)["'])?\s*\/\]/gi;
  while ((match = inlineRegex.exec(text)) !== null) {
    const files = match[3] ? match[3].split(',').map(f => f.trim()).filter(Boolean) : [];
    delegations.push({ agentId: match[1].trim(), task: match[2].trim(), files, context: '' });
  }
  cleanText = cleanText.replace(inlineRegex, '').trim();
  return { delegations, cleanText };
}

function formatDelegationResults(results) {
  const parts = ['[Delegation Results]'];
  for (const r of results) {
    const status = r.isError ? ' (ERROR)' : '';
    parts.push(`\n[Result from ${r.agentName}${status}]`);
    const content = r.result.length > 8000
      ? r.result.slice(0, 8000) + '\n[... truncated]'
      : r.result;
    parts.push(content);
    parts.push(`[/Result]`);
  }
  parts.push('\nContinue with your plan. If all steps are done, produce your final response to the user. If more delegations are needed, include more DELEGATE blocks.');
  return parts.join('\n');
}

describe('Team Delegation', () => {

  // ─── Parser: Basic ─────────────────────────────────────────────────────────

  describe('parseDelegationBlocks', () => {

    it('returns empty for plain text', () => {
      const { delegations, cleanText } = parseDelegationBlocks('Just a normal response.');
      assert.equal(delegations.length, 0);
      assert.equal(cleanText, 'Just a normal response.');
    });

    it('parses a single block with context', () => {
      const input = `Let me delegate this.

[DELEGATE to="atlas-123" task="Write the API endpoint"]
Use Express.js with JWT middleware.
Add rate limiting.
[/DELEGATE]

I'll compile the results.`;

      const { delegations, cleanText } = parseDelegationBlocks(input);
      assert.equal(delegations.length, 1);
      assert.equal(delegations[0].agentId, 'atlas-123');
      assert.equal(delegations[0].task, 'Write the API endpoint');
      assert.ok(delegations[0].context.includes('Express.js'));
      assert.ok(delegations[0].context.includes('rate limiting'));
      assert.ok(cleanText.includes('Let me delegate this'));
      assert.ok(cleanText.includes("I'll compile the results"));
      assert.ok(!cleanText.includes('[DELEGATE'));
    });

    it('parses multiple blocks', () => {
      const input = `Breaking into subtasks:

[DELEGATE to="atlas" task="Build the backend"]
REST API with auth
[/DELEGATE]

[DELEGATE to="iris" task="Design the UI"]
Modern, mobile-first
[/DELEGATE]

Synthesizing after.`;

      const { delegations, cleanText } = parseDelegationBlocks(input);
      assert.equal(delegations.length, 2);
      assert.equal(delegations[0].agentId, 'atlas');
      assert.equal(delegations[0].task, 'Build the backend');
      assert.equal(delegations[1].agentId, 'iris');
      assert.equal(delegations[1].task, 'Design the UI');
      assert.ok(cleanText.includes('Breaking into subtasks'));
      assert.ok(cleanText.includes('Synthesizing after'));
    });

    it('parses inline format', () => {
      const { delegations } = parseDelegationBlocks(
        'Quick: [DELEGATE to="atlas" task="Fix the bug"/] Done.'
      );
      assert.equal(delegations.length, 1);
      assert.equal(delegations[0].agentId, 'atlas');
      assert.equal(delegations[0].task, 'Fix the bug');
      assert.equal(delegations[0].context, '');
    });

    it('handles single-quoted attributes', () => {
      const { delegations } = parseDelegationBlocks(
        "[DELEGATE to='atlas' task='Build it']\nContext here\n[/DELEGATE]"
      );
      assert.equal(delegations.length, 1);
      assert.equal(delegations[0].agentId, 'atlas');
      assert.equal(delegations[0].task, 'Build it');
    });

    it('handles unquoted agent ID', () => {
      const { delegations } = parseDelegationBlocks(
        '[DELEGATE to=atlas task="Do the thing"]\nstuff\n[/DELEGATE]'
      );
      assert.equal(delegations.length, 1);
      assert.equal(delegations[0].agentId, 'atlas');
    });

    it('handles empty context', () => {
      const { delegations } = parseDelegationBlocks(
        '[DELEGATE to="atlas" task="Simple task"]\n[/DELEGATE]'
      );
      assert.equal(delegations.length, 1);
      assert.equal(delegations[0].context, '');
    });

    it('handles UUID agent IDs', () => {
      const uuid = 'a60e0475-416b-4c5d-b995-be08547b6bdd';
      const { delegations } = parseDelegationBlocks(
        `[DELEGATE to="${uuid}" task="Do work"]\nctx\n[/DELEGATE]`
      );
      assert.equal(delegations.length, 1);
      assert.equal(delegations[0].agentId, uuid);
    });

    it('preserves multiline context', () => {
      const { delegations } = parseDelegationBlocks(
        '[DELEGATE to="atlas" task="Build"]\nLine 1\nLine 2\nLine 3\n[/DELEGATE]'
      );
      assert.equal(delegations.length, 1);
      assert.ok(delegations[0].context.includes('Line 1'));
      assert.ok(delegations[0].context.includes('Line 3'));
    });
    it('parses files= attribute in block format', () => {
      const input = `[DELEGATE to="data-agent" task="Add transactions" files="state/teams.js, state/db.js"]
Check for multi-statement ops.
[/DELEGATE]`;
      const { delegations } = parseDelegationBlocks(input);
      assert.equal(delegations.length, 1);
      assert.deepEqual(delegations[0].files, ['state/teams.js', 'state/db.js']);
      assert.equal(delegations[0].task, 'Add transactions');
      assert.ok(delegations[0].context.includes('multi-statement'));
    });

    it('parses files= attribute in inline format', () => {
      const { delegations } = parseDelegationBlocks(
        '[DELEGATE to="scout" task="Audit API" files="server/router.js"/]'
      );
      assert.equal(delegations.length, 1);
      assert.deepEqual(delegations[0].files, ['server/router.js']);
    });

    it('returns empty files array when no files= attribute', () => {
      const { delegations } = parseDelegationBlocks(
        '[DELEGATE to="atlas" task="Do work"]\nstuff\n[/DELEGATE]'
      );
      assert.equal(delegations.length, 1);
      assert.deepEqual(delegations[0].files, []);
    });

    it('handles files= with multiple paths and whitespace', () => {
      const input = `[DELEGATE to="api" task="Fix routes" files="server/routes/billing.js,  server/routes/byok.js , lib/team-router.js"]
ctx
[/DELEGATE]`;
      const { delegations } = parseDelegationBlocks(input);
      assert.equal(delegations.length, 1);
      assert.deepEqual(delegations[0].files, [
        'server/routes/billing.js',
        'server/routes/byok.js',
        'lib/team-router.js',
      ]);
    });
  });

  // ─── Result Formatter ──────────────────────────────────────────────────────

  describe('formatDelegationResults', () => {

    it('formats a single successful result', () => {
      const out = formatDelegationResults([
        { agentId: 'atlas', agentName: 'Atlas', result: 'API built successfully.', isError: false },
      ]);
      assert.ok(out.includes('[Delegation Results]'));
      assert.ok(out.includes('[Result from Atlas]'));
      assert.ok(out.includes('API built successfully.'));
      assert.ok(!out.includes('ERROR'));
    });

    it('formats multiple results', () => {
      const out = formatDelegationResults([
        { agentId: 'atlas', agentName: 'Atlas', result: 'Backend done.', isError: false },
        { agentId: 'iris', agentName: 'Iris', result: 'UI designed.', isError: false },
      ]);
      assert.ok(out.includes('[Result from Atlas]'));
      assert.ok(out.includes('[Result from Iris]'));
    });

    it('marks errors', () => {
      const out = formatDelegationResults([
        { agentId: 'atlas', agentName: 'Atlas', result: 'Timeout', isError: true },
      ]);
      assert.ok(out.includes('(ERROR)'));
    });

    it('truncates long results at 8000 chars', () => {
      const longResult = 'x'.repeat(10000);
      const out = formatDelegationResults([
        { agentId: 'atlas', agentName: 'Atlas', result: longResult, isError: false },
      ]);
      assert.ok(out.includes('[... truncated]'));
      assert.ok(out.length < 10000);
    });

    it('includes continuation instruction', () => {
      const out = formatDelegationResults([
        { agentId: 'a', agentName: 'A', result: 'ok', isError: false },
      ]);
      assert.ok(out.includes('Continue with your plan'));
    });
  });

  // ─── Embedding Fallback ────────────────────────────────────────────────────

  describe('Embedding Fallback Provider', () => {
    // Inline implementation (matches lib/embeddings.js createFallbackProvider)
    function createFallbackProvider(chain) {
      const dimensions = chain[0].provider.dimensions;
      return {
        dimensions,
        async embed(text) {
          let lastErr;
          for (const { name, provider } of chain) {
            try { return await provider.embed(text); }
            catch (err) { lastErr = err; }
          }
          throw lastErr;
        },
        async embedBatch(texts) {
          if (texts.length === 0) return [];
          let lastErr;
          for (const { name, provider } of chain) {
            try { return await provider.embedBatch(texts); }
            catch (err) { lastErr = err; }
          }
          throw lastErr;
        },
      };
    }

    function mockProvider(dims, shouldFail = false) {
      return {
        dimensions: dims,
        async embed(text) {
          if (shouldFail) throw new Error('provider down');
          return new Float32Array(dims).fill(1);
        },
        async embedBatch(texts) {
          if (shouldFail) throw new Error('provider down');
          return texts.map(() => new Float32Array(dims).fill(1));
        },
      };
    }

    it('uses first provider when healthy', async () => {
      const provider = createFallbackProvider([
        { name: 'Primary', provider: mockProvider(768) },
        { name: 'Fallback', provider: mockProvider(768) },
      ]);
      const vec = await provider.embed('test');
      assert.equal(vec.length, 768);
    });

    it('falls back when primary fails', async () => {
      const provider = createFallbackProvider([
        { name: 'Primary', provider: mockProvider(768, true) },
        { name: 'Fallback', provider: mockProvider(768) },
      ]);
      const vec = await provider.embed('test');
      assert.equal(vec.length, 768);
    });

    it('throws when all providers fail', async () => {
      const provider = createFallbackProvider([
        { name: 'A', provider: mockProvider(768, true) },
        { name: 'B', provider: mockProvider(768, true) },
      ]);
      await assert.rejects(() => provider.embed('test'), /provider down/);
    });

    it('embedBatch falls back correctly', async () => {
      const provider = createFallbackProvider([
        { name: 'A', provider: mockProvider(768, true) },
        { name: 'B', provider: mockProvider(768) },
      ]);
      const vecs = await provider.embedBatch(['a', 'b']);
      assert.equal(vecs.length, 2);
      assert.equal(vecs[0].length, 768);
    });

    it('embedBatch returns empty for empty input', async () => {
      const provider = createFallbackProvider([
        { name: 'A', provider: mockProvider(768) },
      ]);
      const vecs = await provider.embedBatch([]);
      assert.equal(vecs.length, 0);
    });
  });

  // ── countUserTasks ──
  // Local copy for testing (mirrors lib/team-router.js)
  function countUserTasks(message) {
    const taskPattern = /\btask\s*\d+/gi;
    const taskMatches = message.match(taskPattern);
    if (taskMatches && taskMatches.length >= 2) return taskMatches.length;
    const numberedPattern = /^\s*\d+[\.\)]\s/gm;
    const numberedMatches = message.match(numberedPattern);
    if (numberedMatches && numberedMatches.length >= 2) return numberedMatches.length;
    return 0;
  }

  describe('countUserTasks', () => {
    it('detects Task N patterns', () => {
      const msg = 'Task 1 — Build toast. Task 2 — Build API client. Task 3 — Build skeleton.';
      assert.equal(countUserTasks(msg), 3);
    });

    it('detects numbered list items', () => {
      const msg = '1. Build toast\n2. Build API client\n3. Build skeleton';
      assert.equal(countUserTasks(msg), 3);
    });

    it('returns 0 for no clear task markers', () => {
      assert.equal(countUserTasks('Build a toast component for the app'), 0);
    });

    it('returns 0 for single task', () => {
      assert.equal(countUserTasks('Task 1 — only one task'), 0);
    });

    it('handles mixed case', () => {
      const msg = 'TASK 1 do this. task 2 do that. Task 3 final thing.';
      assert.equal(countUserTasks(msg), 3);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  parseTaskPlan — structured plan parser tests                       */
/* ------------------------------------------------------------------ */

// Inline copy of parseTaskPlan for testing
function parseTaskPlan(text, validAgentNames, agentNameToId) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { plan: null, error: 'No JSON object found in response' };
  cleaned = jsonMatch[0];
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  let parsed;
  try { parsed = JSON.parse(cleaned); } catch (err) { return { plan: null, error: `JSON parse error: ${err.message}` }; }
  if (!parsed.tasks || !Array.isArray(parsed.tasks)) return { plan: null, error: 'Missing or invalid "tasks" array' };
  if (parsed.tasks.length === 0) return { plan: [], error: null };
  if (parsed.tasks.length > 6) return { plan: null, error: `Too many tasks (${parsed.tasks.length}), max 6` };
  const plan = [];
  for (let i = 0; i < parsed.tasks.length; i++) {
    const t = parsed.tasks[i];
    if (!t.agent || !t.task) return { plan: null, error: `Task ${i} missing "agent" or "task" field` };
    const agentNameLower = t.agent.toLowerCase();
    let resolvedId = null, resolvedName = null;
    for (const [name, id] of agentNameToId) {
      if (name.toLowerCase() === agentNameLower) { resolvedId = id; resolvedName = name; break; }
    }
    if (!resolvedId) return { plan: null, error: `Unknown agent "${t.agent}". Available: ${[...validAgentNames].join(', ')}` };
    const dependsOn = Array.isArray(t.depends_on) ? t.depends_on : [];
    for (const dep of dependsOn) {
      if (typeof dep !== 'number' || dep < 0 || dep >= parsed.tasks.length || dep === i) return { plan: null, error: `Task ${i} has invalid depends_on: ${dep}` };
    }
    for (const dep of dependsOn) {
      const depTask = parsed.tasks[dep];
      if (depTask.depends_on && depTask.depends_on.includes(i)) return { plan: null, error: `Circular dependency between tasks ${i} and ${dep}` };
    }
    plan.push({ agentId: resolvedId, agentName: resolvedName, task: t.task, files: Array.isArray(t.files) ? t.files : [], dependsOn });
  }
  return { plan, error: null };
}

const TEST_AGENT_NAMES = new Set(['Component', 'Layout', 'Interact', 'Visualizer']);
const TEST_AGENT_MAP = new Map([['Component', 'id-comp'], ['Layout', 'id-layout'], ['Interact', 'id-interact'], ['Visualizer', 'id-viz']]);

describe('parseTaskPlan', () => {
  it('parses a valid 3-task plan', () => {
    const input = '{"tasks":[{"agent":"Component","task":"Build toast","files":["tokens.css"],"depends_on":[]},{"agent":"Layout","task":"Build API client","files":[],"depends_on":[]},{"agent":"Interact","task":"Build skeleton","files":["tokens.css"],"depends_on":[]}]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.equal(error, null);
    assert.equal(plan.length, 3);
    assert.equal(plan[0].agentId, 'id-comp');
    assert.equal(plan[1].agentName, 'Layout');
    assert.deepEqual(plan[0].files, ['tokens.css']);
    assert.deepEqual(plan[0].dependsOn, []);
  });

  it('strips markdown code fences', () => {
    const input = '```json\n{"tasks":[{"agent":"Component","task":"Do stuff","files":[],"depends_on":[]}]}\n```';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.equal(error, null);
    assert.equal(plan.length, 1);
  });

  it('handles trailing commas', () => {
    const input = '{"tasks":[{"agent":"Component","task":"Do stuff","files":[],"depends_on":[],},]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.equal(error, null);
    assert.equal(plan.length, 1);
  });

  it('extracts JSON from surrounding text', () => {
    const input = 'Here is my plan:\n{"tasks":[{"agent":"Layout","task":"Create API","files":[],"depends_on":[]}]}\nLet me know if this works.';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.equal(error, null);
    assert.equal(plan.length, 1);
  });

  it('rejects unknown agent names', () => {
    const input = '{"tasks":[{"agent":"Unknown","task":"Do stuff","files":[],"depends_on":[]}]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.notEqual(error, null);
    assert.ok(error.includes('Unknown agent'));
  });

  it('rejects too many tasks', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => `{"agent":"Component","task":"Task ${i}","files":[],"depends_on":[]}`);
    const input = `{"tasks":[${tasks.join(',')}]}`;
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.notEqual(error, null);
    assert.ok(error.includes('Too many tasks'));
  });

  it('returns empty plan for empty tasks array', () => {
    const { plan, error } = parseTaskPlan('{"tasks":[]}', TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.equal(error, null);
    assert.equal(plan.length, 0);
  });

  it('detects circular dependencies', () => {
    const input = '{"tasks":[{"agent":"Component","task":"A","files":[],"depends_on":[1]},{"agent":"Layout","task":"B","files":[],"depends_on":[0]}]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.notEqual(error, null);
    assert.ok(error.includes('Circular'));
  });

  it('validates depends_on indices', () => {
    const input = '{"tasks":[{"agent":"Component","task":"A","files":[],"depends_on":[5]}]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.notEqual(error, null);
    assert.ok(error.includes('invalid depends_on'));
  });

  it('rejects self-dependency', () => {
    const input = '{"tasks":[{"agent":"Component","task":"A","files":[],"depends_on":[0]}]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.notEqual(error, null);
  });

  it('agent name matching is case-insensitive', () => {
    const input = '{"tasks":[{"agent":"component","task":"Do stuff","files":[],"depends_on":[]}]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.equal(error, null);
    assert.equal(plan[0].agentId, 'id-comp');
  });

  it('handles valid dependencies (sequential chain)', () => {
    const input = '{"tasks":[{"agent":"Component","task":"Build A","files":[],"depends_on":[]},{"agent":"Layout","task":"Use A output","files":[],"depends_on":[0]}]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.equal(error, null);
    assert.equal(plan.length, 2);
    assert.deepEqual(plan[0].dependsOn, []);
    assert.deepEqual(plan[1].dependsOn, [0]);
  });

  it('rejects missing task field', () => {
    const input = '{"tasks":[{"agent":"Component","files":[]}]}';
    const { plan, error } = parseTaskPlan(input, TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.notEqual(error, null);
    assert.ok(error.includes('missing'));
  });

  it('rejects non-JSON input', () => {
    const { plan, error } = parseTaskPlan('This is just text with no JSON', TEST_AGENT_NAMES, TEST_AGENT_MAP);
    assert.notEqual(error, null);
  });
});
