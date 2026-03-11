/**
 * @fileoverview Tool Policy Manager — role-based NullClaw instance configuration.
 *
 * Generates per-role NullClaw configs using the `autonomy` system for
 * Zig-level enforcement of tool restrictions. Each role (user, orchestrator,
 * worker, reviewer) gets a tailored config with appropriate sandbox settings.
 *
 * Security model:
 *   - Hosted users: sandboxed (no network, workspace-only, command whitelist)
 *   - Self-hosted users: unrestricted (their machine, their rules)
 *   - Orchestrators: locked (no shell, no files, memory-only)
 *   - Workers: supervised (dev tools only, workspace-scoped, no network)
 *   - Reviewers: supervised (same as worker, prompt says read-only)
 *
 * @module lib/tool-policy
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ─── Role Definitions ───────────────────────────────────────────────────────

/**
 * @typedef {'user'|'user-selfhosted'|'orchestrator'|'planner'|'worker'|'reviewer'} AgentRole
 */

/**
 * Autonomy config templates per role.
 * These map directly to NullClaw's `autonomy` config in security/policy.zig.
 */
const ROLE_AUTONOMY = {
  /** Hosted user — full tools within sandbox */
  user: {
    level: 'supervised',
    workspace_only: true,
    block_high_risk_commands: true,
    require_approval_for_medium_risk: false,
    max_actions_per_hour: 30,
    allowed_commands: [
      'ls', 'cat', 'grep', 'find', 'echo', 'pwd', 'wc', 'head', 'tail',
      'node', 'npm', 'npx', 'git', 'tsc', 'prettier', 'eslint',
    ],
  },

  /** Self-hosted user — no restrictions */
  'user-selfhosted': {
    level: 'full',
    workspace_only: false,
    block_high_risk_commands: false,
    require_approval_for_medium_risk: false,
    max_actions_per_hour: 999,
  },

  /** Orchestrator — coordination only, no file/shell access */
  orchestrator: {
    level: 'locked',
    workspace_only: true,
    block_high_risk_commands: true,
    require_approval_for_medium_risk: true,
    max_actions_per_hour: 10,
    allowed_commands: [],
    allowed_paths: [],
  },

  /** Planner — ultra-restricted, forces text-only output (JSON plans) */
  planner: {
    level: 'locked',
    workspace_only: true,
    block_high_risk_commands: true,
    require_approval_for_medium_risk: true,
    max_actions_per_hour: 0,
    allowed_commands: [],
    allowed_paths: [],
  },

  /** Worker — dev tools, workspace-scoped, no network */
  worker: {
    level: 'supervised',
    workspace_only: true,
    block_high_risk_commands: true,
    require_approval_for_medium_risk: false,
    max_actions_per_hour: 50,
    allowed_commands: [
      'ls', 'cat', 'grep', 'find', 'echo', 'pwd', 'head', 'tail',
      'node', 'npm', 'npx', 'git', 'tsc', 'prettier', 'eslint',
    ],
  },

  /** Reviewer — same tools as worker, prompt restricts to read-only */
  reviewer: {
    level: 'supervised',
    workspace_only: true,
    block_high_risk_commands: true,
    require_approval_for_medium_risk: false,
    max_actions_per_hour: 30,
    allowed_commands: [
      'ls', 'cat', 'grep', 'find', 'echo', 'pwd', 'head', 'tail',
      'node', 'npm', 'npx', 'git',
    ],
  },
};

/**
 * Default models per role.
 */
const ROLE_MODELS = {
  user: 'anthropic/claude-sonnet-4-20250514',
  'user-selfhosted': 'anthropic/claude-sonnet-4-20250514',
  orchestrator: 'anthropic/claude-sonnet-4-20250514',
  worker: 'anthropic/claude-sonnet-4-20250514',
  planner: 'anthropic/claude-sonnet-4-20250514',
  reviewer: 'anthropic/claude-sonnet-4-20250514',
};

/**
 * Tools config per role (shell timeouts, output limits).
 */
const ROLE_TOOLS = {
  user: { shell_timeout_secs: 120, shell_max_output_bytes: 50_000 },
  'user-selfhosted': { shell_timeout_secs: 300, shell_max_output_bytes: 100_000 },
  orchestrator: { shell_timeout_secs: 5, shell_max_output_bytes: 1_000 },
  worker: { shell_timeout_secs: 60, shell_max_output_bytes: 30_000 },
  planner: { shell_timeout_secs: 1, shell_max_output_bytes: 100 },
  reviewer: { shell_timeout_secs: 60, shell_max_output_bytes: 50_000 },
};

// ─── High-Risk Commands (mirror of NullClaw's list for audit) ───────────────

const HIGH_RISK_COMMANDS = new Set([
  'rm', 'mkfs', 'dd', 'shutdown', 'reboot', 'halt', 'poweroff',
  'sudo', 'su', 'chown', 'chmod', 'useradd', 'userdel', 'usermod', 'passwd',
  'mount', 'umount', 'iptables', 'ufw', 'firewall-cmd',
  'curl', 'wget', 'nc', 'ncat', 'netcat', 'scp', 'ssh', 'ftp', 'telnet',
]);

// ─── Role Detection ─────────────────────────────────────────────────────────

/**
 * Determine the role of an agent in a given context.
 *
 * @param {string} agentId
 * @param {Object|null} teamContext — null for single-agent chat
 * @param {string} teamContext.orchestratorId
 * @param {Set<string>|string[]} [teamContext.reviewerIds]
 * @param {boolean} [isSelfHosted=false]
 * @returns {AgentRole}
 */
export function getRole(agentId, teamContext, isSelfHosted = false) {
  if (!teamContext) {
    return isSelfHosted ? 'user-selfhosted' : 'user';
  }
  if (agentId === teamContext.orchestratorId) return 'orchestrator';
  const reviewers = teamContext.reviewerIds;
  if (reviewers) {
    const isReviewer = reviewers instanceof Set
      ? reviewers.has(agentId)
      : reviewers.includes(agentId);
    if (isReviewer) return 'reviewer';
  }
  return 'worker';
}

// ─── Config Generation ──────────────────────────────────────────────────────

/**
 * Generate a NullClaw config directory for a specific role.
 *
 * Creates `/tmp/nullclaw-{userId}-{role}/.nullclaw/config.json` with
 * role-appropriate autonomy settings. The returned path should be used
 * as HOME when spawning the NullClaw instance.
 *
 * @param {string} userId
 * @param {AgentRole} role
 * @param {Object} [opts]
 * @param {string} [opts.model] — override default model
 * @param {string} [opts.workspaceDir] — workspace directory for file tools
 * @param {string[]} [opts.allowedPaths] — additional allowed paths
 * @param {string} [opts.apiKey] — API key (required)
 * @returns {string} homeDir — use as HOME env var when spawning
 */
export function generateConfig(userId, role, opts = {}) {
  // Store NullClaw configs under .scratchy-data instead of /tmp/ to prevent
  // cross-user reads. /tmp/ is world-readable on most Linux systems.
  const PROJECT_ROOT = path.resolve(path.dirname(import.meta.url.replace('file://', '')), '..');
  const homeDir = path.join(PROJECT_ROOT, '.scratchy-data', 'nullclaw-homes', `${userId.slice(0, 12)}-${role}`);
  const nullclawDir = path.join(homeDir, '.nullclaw');
  const workspaceDir = opts.workspaceDir || path.join(nullclawDir, 'workspace');

  const autonomy = { ...ROLE_AUTONOMY[role] };
  if (opts.allowedPaths?.length) {
    autonomy.allowed_paths = opts.allowedPaths;
  }

  const config = {
    name: `scratchy-${role}-${userId.slice(0, 8)}`,
    models: {
      providers: {
        anthropic: {
          api_key: opts.apiKey || '',
        },
      },
    },
    agents: {
      defaults: {
        model: {
          primary: opts.model || ROLE_MODELS[role],
        },
        systemPrompt: role === 'user' || role === 'user-selfhosted'
          ? [
              'MANDATORY: When user asks to build/create/make ANY project (website, app, portfolio, landing page):',
              '→ You MUST call the mcp_canvas_suggest_team tool immediately. No exceptions.',
              '→ Do NOT explain, describe, list features, or write any text before calling the tool.',
              '→ Do NOT use file_write or shell. Do NOT write HTML/CSS/JS.',
              '→ After the tool call, STOP. Do not write anything else.',
              '',
              'For data display: call mcp_canvas_render_dashboard, render_comparison, render_code, render_project, or render_data.',
              'Keep text to 1-2 sentences. Tools handle visual output.',
            ].join('\n')
          : '',
      },
    },
    gateway: {
      // Port set at spawn time via --port
      host: '127.0.0.1',
      require_pairing: false,
    },
    http_request: {
      enabled: role === 'user-selfhosted',
    },
    autonomy,
    tools: ROLE_TOOLS[role] || {},
    mcp_servers: {
      canvas: {
        command: 'node',
        args: ['/home/nonbios/scratchy_par/lib/canvas-mcp-server.js'],
      },
    },
    memory: {
      backend: 'markdown',
    },
  };

  // Create dirs
  fs.mkdirSync(nullclawDir, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  // NOTE: chmod 555 was tried here to prevent orchestrator/planner file_write,
  // but NullClaw crashes with AccessDenied on startup if workspace isn't writable
  // (it writes memory init files). Enforcement is handled server-side instead:
  // team-router.js intercepts file_write tool events from orchestrator and
  // re-prompts to force [DELEGATE] usage.

  // Write config
  fs.writeFileSync(
    path.join(nullclawDir, 'config.json'),
    JSON.stringify(config, null, 2),
  );

  return homeDir;
}

// ─── Audit Trail ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AuditResult
 * @property {boolean} violated
 * @property {string} [tool]
 * @property {string} [command] — for shell violations, the command attempted
 * @property {AgentRole} [role]
 * @property {string} [agentId]
 * @property {string} [teamId]
 * @property {string} [reason]
 */

/**
 * Tools that should never be used by specific roles.
 * This is a Scratchy-level audit check on top of NullClaw's Zig enforcement.
 * If NullClaw's config is correct, these should never fire — but defense in depth.
 */
const ROLE_BLOCKED_TOOLS = {
  orchestrator: new Set(['shell', 'file_write', 'file_edit', 'file_read', 'git', 'http_request']),
  planner: new Set(['shell', 'file_write', 'file_edit', 'file_read', 'git', 'http_request', 'delegate', 'schedule', 'spawn', 'memory_read', 'memory_write']),
  worker: new Set(['http_request', 'delegate', 'message']),
  reviewer: new Set(['http_request', 'delegate', 'message']),
  user: new Set(['http_request']),
  'user-selfhosted': new Set(), // no restrictions
};

/**
 * Audit a tool_call_start event against role policy.
 * Returns violation info if the tool shouldn't have been used.
 *
 * Note: NullClaw's autonomy config blocks most violations at the Zig level.
 * This audit is a second layer — catches config mismatches and logs for monitoring.
 *
 * @param {Object} event — SSE tool event
 * @param {string} event.type — 'tool_call_start' or 'tool_call_result'
 * @param {string} event.name — tool name
 * @param {string} [event.arguments_json] — tool arguments (JSON string)
 * @param {AgentRole} role
 * @param {string} agentId
 * @param {string} [teamId]
 * @returns {AuditResult}
 */
export function auditToolEvent(event, role, agentId, teamId) {
  if (event.type !== 'tool_call_start') {
    return { violated: false };
  }

  const blocked = ROLE_BLOCKED_TOOLS[role];
  if (!blocked || !blocked.has(event.name)) {
    return { violated: false };
  }

  const result = {
    violated: true,
    tool: event.name,
    role,
    agentId,
    teamId: teamId || null,
    reason: `${role} used blocked tool "${event.name}"`,
  };

  // Extra detail for shell commands
  if (event.name === 'shell' && event.arguments_json) {
    try {
      const args = JSON.parse(event.arguments_json);
      result.command = args.command || '(unknown)';

      // Check if it's a high-risk command
      const firstWord = (args.command || '').trim().split(/\s+/)[0]?.split('/')?.pop();
      if (firstWord && HIGH_RISK_COMMANDS.has(firstWord.toLowerCase())) {
        result.reason += ` (high-risk: ${firstWord})`;
      }
    } catch { /* malformed args */ }
  }

  console.error(`[tool-policy] VIOLATION: ${result.reason} | agent=${agentId} team=${teamId || 'none'}`);
  return result;
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Remove temp config directory for a specific role instance.
 *
 * @param {string} userId
 * @param {AgentRole} role
 */
export function cleanupConfig(userId, role) {
  const PROJECT_ROOT = path.resolve(path.dirname(import.meta.url.replace('file://', '')), '..');
  const homeDir = path.join(PROJECT_ROOT, '.scratchy-data', 'nullclaw-homes', `${userId.slice(0, 12)}-${role}`);
  try {
    fs.rmSync(homeDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[tool-policy] Failed to clean up ${homeDir}: ${err.message}`);
  }
  // Also clean legacy /tmp/ dirs if any remain
  const legacyDir = path.join(os.tmpdir(), `nullclaw-${userId}-${role}`);
  try { fs.rmSync(legacyDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

/**
 * Remove ALL temp config directories for a user (all roles).
 *
 * @param {string} userId
 */
export function cleanupAllConfigs(userId) {
  for (const role of Object.keys(ROLE_AUTONOMY)) {
    cleanupConfig(userId, role);
  }
}

/**
 * Clean up any stale temp dirs from previous runs.
 * Call on Scratchy startup.
 */
export function cleanupStaleConfigs() {
  // Clean legacy /tmp/ dirs
  const tmpDir = os.tmpdir();
  try {
    const entries = fs.readdirSync(tmpDir);
    let cleaned = 0;
    for (const entry of entries) {
      if (entry.startsWith('nullclaw-') && fs.statSync(path.join(tmpDir, entry)).isDirectory()) {
        fs.rmSync(path.join(tmpDir, entry), { recursive: true, force: true });
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[tool-policy] Cleaned up ${cleaned} stale NullClaw config dir(s) from /tmp/`);
    }
  } catch { /* tmpdir read failure — non-fatal */ }
}

// ─── Instance Key Helper ────────────────────────────────────────────────────

/**
 * Build the adapter instance key for a user+role combination.
 * User instances use just userId (backward compat).
 * Team instances use userId:role.
 *
 * @param {string} userId
 * @param {AgentRole} [role='user']
 * @returns {string}
 */
export function instanceKey(userId, role = 'user') {
  if (role === 'user' || role === 'user-selfhosted') return userId;
  return `${userId}:${role}`;
}

// ─── Exports for testing ────────────────────────────────────────────────────

export const _testing = {
  ROLE_AUTONOMY,
  ROLE_MODELS,
  ROLE_TOOLS,
  ROLE_BLOCKED_TOOLS,
  HIGH_RISK_COMMANDS,
};
