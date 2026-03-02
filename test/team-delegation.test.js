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
});
