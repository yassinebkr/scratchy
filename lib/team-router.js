/**
 * @module lib/team-router
 * Team-aware message routing — server-managed multi-turn delegation engine.
 *
 * When a user sends a message to a team (instead of a single agent),
 * the team router:
 *   1. Resolves the team's orchestrator agent
 *   2. Builds a team-aware system prompt with agent roster + delegation format
 *   3. Sends to orchestrator via NullClaw adapter
 *   4. Parses [DELEGATE] blocks from orchestrator response
 *   5. Executes delegations in TRUE PARALLEL via NullClaw multi-threaded fork
 *   6. Sends results back to orchestrator as a follow-up turn
 *   7. Loops until no more delegations (max 5 turns)
 *
 * Architecture:
 *   routeTeamMessage(userId, teamId, message, ws, deps)
 *     → orchestrator NullClaw: "[DELEGATE to=atlas task=...]...[/DELEGATE]"
 *     → server parses blocks, runs delegationExecutor.executeTool()
 *     → sends results back: "[Result from Atlas]...output...[/Result]"
 *     → orchestrator continues or produces final response
 *     → all intermediate WS events tagged with agentId for client rendering
 *
 * No http_request — delegation is fully server-managed.
 */

import * as teamsState from '../state/teams.js';
import { readFile, readdir, stat, cp, mkdir } from 'node:fs/promises';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  getRole,
  generateConfig,
  auditToolEvent,
  cleanupConfig,
  instanceKey as policyInstanceKey,
} from './tool-policy.js';
import * as artifactStore from './artifact-store.js';
import { mapTypedCanvasTool, TYPED_TOOL_NAMES } from './canvas-typed-tools.js';

// ── NullClaw-routed planning (restricted role, tools will fail) ─────────────

/**
 * Route the planning phase through NullClaw with a restricted "planner" role.
 *
 * The planner NullClaw instance is configured with:
 *   - allowed_paths: [] (all file tools fail at Zig level)
 *   - allowed_commands: [] (all shell commands fail)
 *   - max_actions_per_hour: 0 (rate-limited to zero)
 *
 * When the model tries to use tools, NullClaw blocks them. The model falls
 * back to text output — producing the JSON task plan we need.
 *
 * This replaces the previous direct-API approach. All model calls go through
 * NullClaw — no direct Anthropic API usage from Scratchy.
 *
 * @param {Object} adapter — NullClaw adapter instance
 * @param {string} userId — user ID for instance key
 * @param {string} apiKey — API key for NullClaw config
 * @param {string} systemPrompt — team roster + planning instructions
 * @param {string} userMessage — the planning prompt (user request + planning suffix)
 * @param {AbortSignal} [signal] — optional abort signal
 * @returns {Promise<string>} — raw text response (should be JSON plan)
 */
async function planWithNullClaw(adapter, userId, apiKey, systemPrompt, userMessage, signal) {
  const plannerHomeDir = generateConfig(userId, 'planner', {
    apiKey,
    // No workspaceDir override — planner gets a minimal default workspace
    // No allowedPaths — all file tools blocked at Zig level
  });

  const plannerKey = policyInstanceKey(userId, 'planner');
  await adapter.spawnInstance(plannerKey, { homeDir: plannerHomeDir });

  // Combine system prompt + user message into a single prompt.
  // NullClaw's config has systemPrompt: '' — we pass everything as the message.
  const planMessage = systemPrompt + '\n\n' + userMessage;
  const plannerSessionKey = `plan:${userId}:${Date.now()}`;

  let response = '';
  response = await adapter.routeMessageStreaming(
    plannerKey,
    planMessage,
    () => {},  // Don't stream planning phase to client
    plannerSessionKey,
    () => {},  // Suppress tool events (they'll all fail anyway)
    signal,
  );

  // Strip any tool call XML that leaked into text
  return stripToolCallXml(response);
}

/** Project root — files in DELEGATE blocks are resolved relative to this. */
const PROJECT_ROOT = resolve(import.meta.dirname, '..');

/** Deferred cleanup timers for worker instances (session persistence). */
const _workerCleanupTimers = new Map();

// ── Task Sandbox Utilities ──────────────────────────────────────────────────

/**
 * Recursively scan a directory and return a flat file listing.
 * @param {string} dir — root directory to scan
 * @param {string} [base] — base for relative paths
 * @returns {Promise<{rel: string, size: string}[]>}
 */
async function scanDir(dir, base = dir) {
  const results = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await scanDir(full, base));
      } else if (entry.isFile()) {
        const info = await stat(full);
        const bytes = info.size;
        const size = bytes > 1024 ? `${(bytes / 1024).toFixed(1)}KB` : `${bytes}B`;
        results.push({ rel: relative(base, full), size });
      }
    }
  } catch { /* dir doesn't exist or not readable */ }
  return results;
}

/**
 * Promote files from a task sandbox to the user's published directory.
 * Only called after orchestrator/reviewer approval.
 *
 * @param {string} userId
 * @param {string} taskBatchId — the sandbox UUID
 * @param {string} [publishName] — optional subdirectory name in published/
 * @returns {Promise<{publishedPath: string, fileCount: number}>}
 */
async function publishTaskFiles(userId, taskBatchId, publishName = null, sourceDir = null) {
  const sandboxDir = join(PROJECT_ROOT, '.scratchy-data', 'team-workspace', userId, 'tasks', taskBatchId);
  const name = publishName || taskBatchId;
  const publishedDir = join(PROJECT_ROOT, '.scratchy-data', 'team-workspace', userId, 'published', name);

  // Try sourceDir first (NullClaw home), then task sandbox
  let actualSource = null;
  for (const dir of [sourceDir, sandboxDir].filter(Boolean)) {
    try {
      const files = await scanDir(dir);
      if (files.length > 0) { actualSource = dir; break; }
    } catch {}
  }
  if (!actualSource) {
    throw new Error(`No files found in task sandbox ${taskBatchId}`);
  }

  // Copy (not move) so sandbox stays intact for audit
  await mkdir(publishedDir, { recursive: true });
  await cp(actualSource, publishedDir, { recursive: true });

  const files = await scanDir(actualSource);
  return { publishedPath: publishedDir, fileCount: files.length };
}

/**
 * Read the NullClaw API key from the default config.
 * Cached after first read.
 * @returns {string}
 */
let _cachedApiKey = null;
function getNullClawApiKey() {
  if (_cachedApiKey) return _cachedApiKey;
  try {
    const configPath = join(homedir(), '.nullclaw', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    _cachedApiKey = config?.models?.providers?.anthropic?.api_key || '';
  } catch {
    _cachedApiKey = '';
  }
  return _cachedApiKey;
}

/** Per-team routing locks — prevents concurrent team messages from colliding. */
const _teamLocks = new Map();

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Max delegation depth (prevent infinite loops). */
const MAX_DELEGATION_DEPTH = 3;

/** Max concurrent delegations per team message. */
const MAX_CONCURRENT_DELEGATIONS = 4;

/** Timeout for a single delegation call (ms). */
const DELEGATION_TIMEOUT_MS = 720_000; // 12 min — Opus workers generating full components need time (sequential on shared instance)

/** Max multi-turn iterations for delegation loop. */
const MAX_DELEGATION_TURNS = 2;

/** Overall timeout for the entire team routing operation (ms). */
const TEAM_ROUTING_TIMEOUT_MS = 1_800_000; // 30 min hard cap — generous with parallel workers (~2 min per batch)

/** Threshold (chars) above which a no-delegation response triggers enforcement. */
const ENFORCEMENT_THRESHOLD_CHARS = 600;

/** Max enforcement re-prompts before accepting the response as-is. */
const MAX_ENFORCEMENT_RETRIES = 1;

/** Re-prompt sent when orchestrator produces implementation instead of delegating. */
const ENFORCEMENT_REPROMPT =
  `STOP. You just wrote implementation code/content yourself instead of delegating.\n` +
  `You are the COORDINATOR — you NEVER produce artifacts directly.\n\n` +
  `Take what you just tried to do and break it into [DELEGATE] blocks for your team agents.\n` +
  `Each agent handles their specialty. You synthesize the results.\n\n` +
  `Rewrite your response using ONLY [DELEGATE] blocks. Do not include any code or implementation.`;

/** Re-prompt sent when orchestrator under-batches (fewer delegations than detected tasks). */
const BATCH_ENFORCEMENT_REPROMPT = (found, expected) =>
  `You delegated ${found} task(s) but the request contains ${expected} independent tasks.\n` +
  `All independent tasks MUST be delegated in the SAME response for parallel execution.\n` +
  `Rewrite your response with ALL ${expected} tasks as separate [DELEGATE] blocks.\n` +
  `Do NOT serialize independent tasks across turns — that defeats the performance advantage.`;

/**
 * Count the number of distinct tasks in a user message.
 * Looks for patterns like "Task 1", "Task 2", numbered lists, or bullet items
 * that indicate independent work items.
 */
function countUserTasks(message) {
  // Match "Task N" patterns (case-insensitive)
  const taskPattern = /\btask\s*\d+/gi;
  const taskMatches = message.match(taskPattern);
  if (taskMatches && taskMatches.length >= 2) return taskMatches.length;

  // Match numbered items like "1." "2." "3." at line starts
  const numberedPattern = /^\s*\d+[\.\)]\s/gm;
  const numberedMatches = message.match(numberedPattern);
  if (numberedMatches && numberedMatches.length >= 2) return numberedMatches.length;

  return 0; // can't determine task count
}

/* ------------------------------------------------------------------ */
/*  Structured task plan — server-side dispatch                       */
/* ------------------------------------------------------------------ */

/**
 * System prompt suffix that tells the orchestrator to produce a JSON task plan
 * instead of [DELEGATE] blocks. Used for the "planning phase".
 */
const PLANNING_PROMPT_SUFFIX = `
[IMPORTANT — Planning Phase]
You are in PLANNING MODE. Do NOT produce [DELEGATE] blocks.
Instead, analyze the user's request and produce a JSON task plan.

Output ONLY a JSON object (no markdown fences, no explanation) with this exact structure:
{"tasks":[{"agent":"<agent_name>","task":"<clear task description>","files":["<path1>","<path2>"],"depends_on":[]}]}

Rules:
- "agent" must be the exact agent NAME from your team roster (e.g. "Component", "Layout")
- "task" is a clear, complete description of what the agent should produce
- "files" lists project-relative paths the worker needs for context (e.g. "public/styles/tokens.css")
- "depends_on" is an array of indices (0-based) of tasks this depends on. Empty = independent = runs in parallel
- Independent tasks get depends_on: [] — they ALL run in parallel
- Only add a dependency if the task literally needs another task's OUTPUT to begin
- Max 4 tasks. If more are needed, pick the 4 most important.
- If the request is a simple question or chat (not a build/create/code task), output: {"tasks":[]}

Output the JSON object ONLY. No text before or after.`;

/**
 * Parse a JSON task plan from orchestrator response.
 * Lenient: strips markdown fences, fixes common JSON issues.
 *
 * @param {string} text — raw orchestrator response
 * @param {Set<string>} validAgentNames — set of valid agent names in the team
 * @param {Map<string,string>} agentNameToId — map of agent name → agent ID
 * @returns {{ plan: Array<{agentId, agentName, task, files, dependsOn}> | null, error: string | null }}
 */
function parseTaskPlan(text, validAgentNames, agentNameToId) {
  // Strip markdown code fences
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  // Try to extract the first balanced JSON object (handles trailing text/multiple objects)
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace === -1) return { plan: null, error: 'No JSON object found in response' };
  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;
  for (let i = firstBrace; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
  }
  if (endIdx === -1) return { plan: null, error: 'Unbalanced JSON braces in response' };
  cleaned = cleaned.slice(firstBrace, endIdx + 1);

  // Fix trailing commas (common LLM issue)
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return { plan: null, error: `JSON parse error: ${err.message}` };
  }

  if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
    return { plan: null, error: 'Missing or invalid "tasks" array' };
  }

  // Empty tasks = simple question, no delegation needed
  if (parsed.tasks.length === 0) {
    return { plan: [], error: null };
  }

  // Validate task count
  if (parsed.tasks.length > 6) {
    return { plan: null, error: `Too many tasks (${parsed.tasks.length}), max 6` };
  }

  // Validate and resolve each task
  const plan = [];
  for (let i = 0; i < parsed.tasks.length; i++) {
    const t = parsed.tasks[i];
    if (!t.agent || !t.task) {
      return { plan: null, error: `Task ${i} missing "agent" or "task" field` };
    }

    // Resolve agent name to ID (case-insensitive)
    const agentNameLower = t.agent.toLowerCase();
    let resolvedId = null;
    let resolvedName = null;
    for (const [name, id] of agentNameToId) {
      if (name.toLowerCase() === agentNameLower) {
        resolvedId = id;
        resolvedName = name;
        break;
      }
    }
    if (!resolvedId) {
      return { plan: null, error: `Unknown agent "${t.agent}". Available: ${[...validAgentNames].join(', ')}` };
    }

    // Validate depends_on
    const dependsOn = Array.isArray(t.depends_on) ? t.depends_on : [];
    for (const dep of dependsOn) {
      if (typeof dep !== 'number' || dep < 0 || dep >= parsed.tasks.length || dep === i) {
        return { plan: null, error: `Task ${i} has invalid depends_on: ${dep}` };
      }
    }

    // Check for dependency cycles (simple: no task can depend on a task that depends on it)
    for (const dep of dependsOn) {
      const depTask = parsed.tasks[dep];
      if (depTask.depends_on && depTask.depends_on.includes(i)) {
        return { plan: null, error: `Circular dependency between tasks ${i} and ${dep}` };
      }
    }

    plan.push({
      agentId: resolvedId,
      agentName: resolvedName,
      task: t.task,
      files: Array.isArray(t.files) ? t.files : [],
      dependsOn,
    });
  }

  return { plan, error: null };
}

/**
 * Execute a structured task plan with dependency-aware parallel dispatch.
 * Independent tasks (dependsOn=[]) run via Promise.all.
 * Dependent tasks wait for their dependencies to complete first.
 *
 * @returns {Array<{agentId, agentName, result, isError}>}
 */
async function executeTaskPlan(plan, delegationExecutor, ws, sendJson, teamId, teamAbort) {
  if (!plan || plan.length === 0) return [];

  const results = new Array(plan.length).fill(null);
  const completed = new Set();

  // Build batches: tasks whose dependencies are all satisfied
  const MAX_BATCHES = 3; // prevent infinite loops
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    if (completed.size >= plan.length) break;
    if (teamAbort.signal.aborted) break;

    // Find tasks ready to run (all deps completed)
    const ready = [];
    for (let i = 0; i < plan.length; i++) {
      if (completed.has(i)) continue;
      const allDepsReady = plan[i].dependsOn.every(d => completed.has(d));
      if (allDepsReady) ready.push(i);
    }

    if (ready.length === 0) {
      console.error('[team-router] Plan deadlock: no tasks ready but not all completed');
      break;
    }

    console.log(`[team-router] Plan batch ${batch}: dispatching ${ready.length} task(s) in parallel: ${ready.map(i => plan[i].agentName).join(', ')}`);

    sendJson(ws, {
      type: 'team-delegations-start',
      teamId,
      count: ready.length,
      agents: ready.map(i => plan[i].agentId),
      batch,
      ts: Date.now(),
    });

    // Dispatch all ready tasks in parallel
    const batchPromises = ready.map(async (taskIdx) => {
      const t = plan[taskIdx];
      if (teamAbort.signal.aborted) {
        return { idx: taskIdx, result: { agentId: t.agentId, agentName: t.agentName, result: 'Skipped — timeout', isError: true } };
      }

      try {
        // Build context with dependency results
        let context = '';
        if (t.dependsOn.length > 0) {
          const depResults = t.dependsOn.map(d => `[Output from ${plan[d].agentName}]\n${results[d]?.result || '(no output)'}\n[/Output]`);
          context = depResults.join('\n');
        }

        const result = await delegationExecutor.executeTool('delegate', {
          agentId: t.agentId,
          task: t.task,
          context,
          files: t.files,
        });

        return {
          idx: taskIdx,
          result: {
            agentId: t.agentId,
            agentName: t.agentName,
            result: result.content,
            isError: !!result.isError,
            taskBatchId: result.taskBatchId,
            filesCreated: result.filesCreated,
            hasHtmlFiles: result.hasHtmlFiles,
          },
        };
      } catch (err) {
        console.error(`[team-router] Plan task ${taskIdx} (${t.agentName}) failed:`, err.message);
        return {
          idx: taskIdx,
          result: {
            agentId: t.agentId,
            agentName: t.agentName,
            result: `Worker error: ${err.message}`,
            isError: true,
          },
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    for (const br of batchResults) {
      results[br.idx] = br.result;
      completed.add(br.idx);
    }

    sendJson(ws, {
      type: 'team-delegations-end',
      teamId,
      count: batchResults.length,
      errors: batchResults.filter(r => r.result.isError).length,
      batch,
      ts: Date.now(),
    });
  }

  return results.filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  Delegation block parser                                           */
/* ------------------------------------------------------------------ */

/**
 * Parse [DELEGATE] blocks from orchestrator response text.
 *
 * Format:
 *   [DELEGATE to="agentId" task="description"]
 *   optional context
 *   [/DELEGATE]
 *
 * @param {string} text — orchestrator response
 * @returns {{ delegations: Array<{agentId: string, task: string, context: string}>, cleanText: string }}
 */
function parseDelegationBlocks(text) {
  const delegations = [];
  // Match [DELEGATE to="..." task="..." files="..."] ... [/DELEGATE]
  // files= attribute is optional — comma-separated list of project-relative paths
  // Handles both quoted and unquoted attributes, multiline content
  const blockRegex = /\[DELEGATE\s+to=["']?([^"'\]\s]+)["']?\s+task=["']([^"']+)["'](?:\s+files=["']([^"']*)["'])?\s*\]([\s\S]*?)\[\/DELEGATE\]/gi;

  let cleanText = text;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    const files = match[3]
      ? match[3].split(',').map(f => f.trim()).filter(Boolean)
      : [];
    delegations.push({
      agentId: match[1].trim(),
      task: match[2].trim(),
      files,
      context: match[4].trim(),
    });
  }

  // Remove delegation blocks from the text shown to user
  cleanText = text.replace(blockRegex, '').trim();

  // Also handle single-line format: [DELEGATE to="id" task="desc" files="..."/]
  const inlineRegex = /\[DELEGATE\s+to=["']?([^"'\]\s]+)["']?\s+task=["']([^"']+)["'](?:\s+files=["']([^"']*)["'])?\s*\/\]/gi;
  while ((match = inlineRegex.exec(text)) !== null) {
    const files = match[3]
      ? match[3].split(',').map(f => f.trim()).filter(Boolean)
      : [];
    delegations.push({
      agentId: match[1].trim(),
      task: match[2].trim(),
      files,
      context: '',
    });
  }
  cleanText = cleanText.replace(inlineRegex, '').trim();

  return { delegations, cleanText };
}

/* ------------------------------------------------------------------ */
/*  Server-side file injection                                        */
/* ------------------------------------------------------------------ */

/**
 * Read project files and format them as context for a worker.
 * Paths are resolved relative to PROJECT_ROOT.
 * Files that don't exist or can't be read are skipped with a note.
 * Total injected content is capped at ~60KB to stay within NullClaw limits.
 *
 * @param {string[]} filePaths — project-relative paths (e.g. "state/teams.js")
 * @returns {Promise<string>} — formatted file contents block
 */
async function injectFileContents(filePaths) {
  if (!filePaths || filePaths.length === 0) return '';

  const MAX_FILE_SIZE = 15_000;  // 15KB per file
  const MAX_TOTAL_SIZE = 60_000; // 60KB total injection budget
  let totalSize = 0;
  const parts = ['[Project Files — READ ONLY, provided by server]'];
  parts.push('These are the actual file contents from the project. Use them as the source of truth.\n');

  for (const relPath of filePaths) {
    if (totalSize >= MAX_TOTAL_SIZE) {
      parts.push(`\n--- File budget exceeded (${Math.round(MAX_TOTAL_SIZE / 1024)}KB) — remaining files skipped ---`);
      break;
    }

    // Security: prevent path traversal outside project root
    const absPath = resolve(PROJECT_ROOT, relPath);
    if (!absPath.startsWith(PROJECT_ROOT)) {
      parts.push(`\n--- ${relPath}: BLOCKED (path traversal) ---`);
      continue;
    }

    try {
      let content = await readFile(absPath, 'utf-8');
      if (content.length > MAX_FILE_SIZE) {
        content = content.slice(0, MAX_FILE_SIZE) + `\n... [truncated at ${Math.round(MAX_FILE_SIZE / 1024)}KB]`;
      }
      parts.push(`\n--- FILE: ${relPath} ---`);
      parts.push(content);
      parts.push(`--- END: ${relPath} ---`);
      totalSize += content.length;
    } catch (err) {
      parts.push(`\n--- ${relPath}: ${err.code === 'ENOENT' ? 'FILE NOT FOUND' : err.message} ---`);
    }
  }

  return parts.join('\n');
}

/**
 * Format delegation results for the orchestrator's next turn.
 *
 * @param {Array<{agentId: string, agentName: string, result: string, isError: boolean}>} results
 * @returns {string}
 */
function formatDelegationResults(results) {
  const parts = ['[Delegation Results]'];
  for (const r of results) {
    const status = r.isError ? ' (ERROR)' : '';
    parts.push(`\n[Result from ${r.agentName}${status}]`);
    // Truncate very long results
    const content = r.result.length > 8000
      ? r.result.slice(0, 8000) + '\n[... truncated]'
      : r.result;
    parts.push(content);
    parts.push(`[/Result]`);
  }
  parts.push('\nContinue with your plan. If all steps are done, produce your final response to the user. If more delegations are needed, include more DELEGATE blocks.');
  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Team system prompt builder                                        */
/* ------------------------------------------------------------------ */

/**
 * Build the team orchestrator's system prompt.
 * Describes the team, its agents, and how to use the delegate tool.
 *
 * @param {Object} team — full team object from teams.getTeam()
 * @param {Object} orchestratorAgent — the orchestrator's agent config
 * @param {Object[]} teamMemory — shared context entries
 * @returns {string}
 */
function buildTeamSystemPrompt(team, orchestratorAgent, teamMemory, userId) {
  const parts = [];

  // ── Team context ──
  parts.push(`[Team: ${team.name}]`);
  if (team.description) parts.push(team.description);
  parts.push('');

  // ── Orchestrator identity ──
  if (orchestratorAgent.systemPrompt) {
    parts.push(`[Your Role — Orchestrator]`);
    parts.push(orchestratorAgent.systemPrompt);
    parts.push('');
  }

  // ── Agent roster ──
  const workers = team.agents.filter(a => a.role !== 'orchestrator' && a.enabled !== 0);
  if (workers.length > 0) {
    parts.push('[Team Agents — you can delegate tasks to these agents]');
    for (const w of workers) {
      const roleTag = w.role === 'reviewer' ? ' (reviewer)' : '';
      parts.push(`- ${w.agentName}${roleTag} (id: ${w.agentId}, model: ${w.model || 'default'})`);
      // Include first 200 chars of their system prompt as capability description
      if (w.systemPrompt) {
        const desc = w.systemPrompt.slice(0, 200).replace(/\n/g, ' ');
        parts.push(`  Capabilities: ${desc}`);
      }
    }
    parts.push('');
  }

  // ── Core identity: pure coordinator ──
  parts.push('[Your Job]');
  parts.push('You are a COORDINATOR. You have two modes:');
  parts.push('');
  parts.push('1. **Short answer** — If the user asks a simple question, wants your opinion, or is chatting,');
  parts.push('   reply in 1-3 sentences. No delegation needed for conversation.');
  parts.push('');
  parts.push('2. **Delegate** — If the user wants something BUILT, WRITTEN, CODED, DESIGNED, or ANALYZED,');
  parts.push('   you MUST delegate to your team. You NEVER produce artifacts yourself.');
  parts.push('');
  parts.push('**HARD RULE: You never write code, CSS, HTML, components, or long-form content yourself.**');
  parts.push('**If your response would be longer than ~3 sentences AND is not a delegation, something is wrong.**');
  parts.push('');

  // ── Delegation format ──
  parts.push('[How to delegate]');
  parts.push('Include DELEGATE blocks in your response:');
  parts.push('');
  parts.push('[DELEGATE to="<agent_id>" task="<clear description>" files="<path1>, <path2>"]');
  parts.push('Context the agent needs.');
  parts.push('[/DELEGATE]');
  parts.push('');
  parts.push('The files= attribute is IMPORTANT: list project-relative file paths the worker needs to read.');
  parts.push('The server will pre-load these files and inject them into the worker\'s context.');
  parts.push('Workers CANNOT read files themselves — you MUST specify every file they need.');
  parts.push('Example: files="state/teams.js, server/routes/teams.js"');
  parts.push('');
  parts.push('Multiple blocks in the SAME response run IN PARALLEL — this is the key performance advantage.');
  parts.push('');
  parts.push('**CRITICAL: Batch independent tasks together.**');
  parts.push('If you have 3 independent tasks, emit ALL 3 [DELEGATE] blocks in ONE response.');
  parts.push('Do NOT serialize them across turns — that defeats parallel execution.');
  parts.push('Only use multi-turn delegation when a later task DEPENDS ON the output of an earlier one.');
  parts.push('');
  parts.push('Rules:');
  parts.push('- Break tasks into subtasks for the best-suited agent');
  parts.push('- **Emit up to 4 DELEGATE blocks per response.** All independent tasks go in the SAME turn.');
  parts.push('- After receiving results, if more steps remain — delegate again immediately');
  parts.push('- Only produce your final synthesis after ALL steps are done');
  parts.push('- If a reviewer exists, route final output through them');
  parts.push('- NEVER use http_request or tool calls for delegation — ONLY [DELEGATE] blocks');
  parts.push('- NEVER write implementation (code, markup, styles) yourself — ALWAYS delegate it');
  parts.push('- NEVER claim to "check results" from workers you did not delegate to — only delegated tasks produce results');
  parts.push('');

  // ── Shared team memory ──
  if (teamMemory.length > 0) {
    parts.push('[Team Shared Context]');
    for (const mem of teamMemory.slice(0, 20)) {
      parts.push(`- ${mem.key}: ${mem.content}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Delegate tool definition                                          */
/* ------------------------------------------------------------------ */

/**
 * The delegate tool definition (injected into orchestrator's tool list).
 */
const DELEGATE_TOOL = {
  name: 'delegate',
  description:
    'Delegate a subtask to another agent on your team. The agent will process the task and return its response. Use this to leverage specialized agents for specific parts of a complex task.',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'ID of the team agent to delegate to (from the roster)',
      },
      task: {
        type: 'string',
        description: 'Clear description of the subtask for the agent',
      },
      context: {
        type: 'string',
        description: 'Optional additional context the agent needs',
      },
    },
    required: ['agentId', 'task'],
  },
};

/**
 * The team_memory_save tool — lets the orchestrator write to shared memory.
 */
const TEAM_MEMORY_SAVE_TOOL = {
  name: 'team_memory_save',
  description:
    'Save a piece of knowledge to the team\'s shared memory. Other team agents and future sessions can access this.',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Topic or label for this knowledge' },
      content: { type: 'string', description: 'The information to save' },
    },
    required: ['key', 'content'],
  },
};

const PUBLISH_ARTIFACT_TOOL = {
  name: 'publish_artifact',
  description:
    'Publish a shared artifact (code, schema, contract, config) that other workers and teams can reference. ' +
    'Use this to share outputs that other agents need (API contracts, database schemas, type definitions, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Unique artifact identifier (e.g. "api-contract", "db-schema", "user-types")' },
      content: { type: 'string', description: 'The artifact content (max 64KB)' },
    },
    required: ['id', 'content'],
  },
};

/* ------------------------------------------------------------------ */
/*  Delegation executor                                               */
/* ------------------------------------------------------------------ */

/**
 * Create a delegation executor for a specific team message context.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.teamId
 * @param {Object} opts.team — full team object
 * @param {import('../lib/nullclaw-adapter.js').NullClawAdapter} opts.adapter
 * @param {import('ws').WebSocket} opts.ws — client WebSocket
 * @param {Function} opts.sendJson — (ws, msg) => void
 * @param {number} [opts.depth=0] — current delegation depth
 * @returns {Object} — { executeTool(name, args) => Promise<{ content, isError? }> }
 */
function createDelegationExecutor({ userId, teamId, team, adapter, ws, sendJson, depth = 0, parentSignal = null, teamContext = null, workerHomeDir = null }) {
  /** Track active delegations for concurrency limit */
  let activeDelegations = 0;

  /** Set of valid agent IDs in this team */
  const validAgentIds = new Set(
    team.agents
      .filter(a => a.role !== 'orchestrator' && a.enabled !== 0)
      .map(a => a.agentId)
  );

  return {
    getTools() {
      return [DELEGATE_TOOL, TEAM_MEMORY_SAVE_TOOL, PUBLISH_ARTIFACT_TOOL];
    },

    async executeTool(name, args) {
      if (name === 'publish_artifact') {
        const agentInfo = team.agents.find(a => a.agentId === args._callerAgentId) || {};
        const res = artifactStore.publish(args.id, args.content, {
          userId,
          authorAgentId: args._callerAgentId || 'unknown',
          authorAgentName: agentInfo.agentName || 'Worker',
          teamId,
          teamName: team.name || teamId,
        });
        if (res.ok) {
          return { content: `Artifact "${args.id}" published (${Math.round(args.content.length / 1024)}KB). Other workers and teams can now reference it.` };
        }
        return { content: `Failed to publish artifact: ${res.error}`, isError: true };
      }

      if (name === 'team_memory_save') {
        try {
          teamsState.addMemory(teamId, String(args.key), String(args.content), {
            createdBy: userId,
          });
          return { content: `Saved to team memory: "${args.key}"` };
        } catch (err) {
          return { content: `Failed to save team memory: ${err.message}`, isError: true };
        }
      }

      if (name !== 'delegate') {
        return { content: `Unknown team tool: ${name}`, isError: true };
      }

      // ── Validate delegation ──
      if (depth >= MAX_DELEGATION_DEPTH) {
        return {
          content: 'Delegation depth limit reached. Please handle this subtask directly.',
          isError: true,
        };
      }

      if (activeDelegations >= MAX_CONCURRENT_DELEGATIONS) {
        return {
          content: 'Too many concurrent delegations. Wait for current ones to finish.',
          isError: true,
        };
      }

      const { agentId, task, context, files } = args;
      if (!agentId || !task) {
        return { content: 'agentId and task are required', isError: true };
      }

      if (!validAgentIds.has(agentId)) {
        return {
          content: `Agent ${agentId} is not a valid team member. Available: ${[...validAgentIds].join(', ')}`,
          isError: true,
        };
      }

      // ── Find the agent info ──
      const agentInfo = team.agents.find(a => a.agentId === agentId);
      const agentName = agentInfo?.agentName || agentId;

      // ── Notify client that delegation is starting ──
      sendJson(ws, {
        type: 'team-delegation',
        status: 'start',
        teamId,
        fromAgent: 'orchestrator',
        toAgent: agentId,
        toAgentName: agentName,
        task: task.slice(0, 200),
        ts: Date.now(),
      });

      activeDelegations++;

      // ── Per-task sandbox ──
      const taskBatchId = randomUUID().slice(0, 12);
      const workerWorkspace = join(PROJECT_ROOT, '.scratchy-data', 'team-workspace', userId, 'tasks', taskBatchId);

      // Create the sandbox dir so the worker can write into it.
      // Worker NullClaw workspace = .../tasks/ (parent). We tell the worker
      // to prefix all paths with taskBatchId/, which lands in this dir.
      mkdirSync(workerWorkspace, { recursive: true });

      try {
        // ── Inject file contents (server-side, no sandbox bypass) ──
        const fileContents = await injectFileContents(args.files || []);
        if (fileContents) {
          console.log(`[team-router] Worker ${agentName}: injected ${args.files.length} file(s) (${Math.round(fileContents.length / 1024)}KB)`);
        }

        // ── Build the worker prompt ──
        const workerPrompt = buildWorkerPrompt(agentInfo, task, context, team, fileContents, userId, taskBatchId);
        let workerResponse = '';

        // AbortController for timeout
        const delegationAbort = new AbortController();
        const delegationTimer = setTimeout(() => delegationAbort.abort(), DELEGATION_TIMEOUT_MS);

        // If parent (overall team timeout) fires, abort this delegation too
        const onParentAbort = () => delegationAbort.abort();
        if (parentSignal) {
          if (parentSignal.aborted) { clearTimeout(delegationTimer); throw new Error('Team routing timeout'); }
          parentSignal.addEventListener('abort', onParentAbort, { once: true });
        }

        try {
          // ── Route to worker via ROLE-SPECIFIC NullClaw instance ──
          // Workers use a dedicated instance with tool-policy enforcement
          // (no http_request, restricted shell, workspace-scoped files).
          // session_key isolates each worker's conversation within that instance.
          const workerInstanceKey = policyInstanceKey(userId, 'worker');
          const workerSessionKey = `team:${teamId}:worker:${agentId}`;
          const startMs = Date.now();

          console.log(`[team-router] Worker ${agentName}: routing via NullClaw (instance=${workerInstanceKey})`);

          workerResponse = await adapter.routeMessageStreaming(
            workerInstanceKey,
            workerPrompt,
            (chunk) => {
              sendJson(ws, {
                type: 'team-worker-stream',
                delta: chunk,
                agentId,
                agentName,
                teamId,
                ts: Date.now(),
              });
            },
            workerSessionKey,
            (evt) => {
              // Audit: check tool usage against role policy
              const workerRole = teamContext
                ? getRole(agentId, teamContext)
                : 'worker';
              const audit = auditToolEvent(evt, workerRole, agentId, teamId);
              if (audit.violated) {
                sendJson(ws, { type: 'tool-violation', ...audit, ts: Date.now() });
              }

              if (evt.type === 'tool_call_start') {
                sendJson(ws, { type: 'tool_call', tool: evt.name, args: safeParseJson(evt.arguments), agentId, agentName, teamId, ts: Date.now() });
              } else if (evt.type === 'tool_call_result') {
                sendJson(ws, { type: 'tool_result', tool: evt.name, result: { content: evt.output, success: evt.success }, agentId, agentName, teamId, ts: Date.now() });
              }
            },
            delegationAbort.signal
          );

          console.log(`[team-router] Worker ${agentName}: completed in ${Math.floor((Date.now() - startMs) / 1000)}s (${workerResponse.length} chars)`);
        } finally {
          clearTimeout(delegationTimer);
          if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
        }

        // ── Scan for created files ──
        // NullClaw ignores our workspaceDir config — it always writes to
        // {HOME}/.nullclaw/workspace/. Workers are told to prefix paths with
        // taskBatchId/, so files land at: nullclaw-homes/{user}-worker/.nullclaw/workspace/{taskBatchId}/
        // We scan BOTH locations (NullClaw home + task sandbox) to be safe.
        let fileManifest = '';
        let scannedFiles = [];
        let hasHtmlFiles = false;
        try {
          const nullclawWorkerWs = join(workerHomeDir, '.nullclaw', 'workspace', taskBatchId);
          const taskDir = workerWorkspace; // original task sandbox dir

          let sourceDir = null;
          scannedFiles = await scanDir(nullclawWorkerWs).catch(() => []);
          if (scannedFiles.length > 0) { sourceDir = nullclawWorkerWs; }
          if (scannedFiles.length === 0) {
            // Fallback: check task sandbox in case future NullClaw versions respect workspaceDir
            scannedFiles = await scanDir(taskDir).catch(() => []);
            if (scannedFiles.length > 0) { sourceDir = taskDir; }
          }
          if (scannedFiles.length > 0) {
            const listing = scannedFiles.map(f => `  ${f.rel} (${f.size})`).join('\n');
            fileManifest = `\n\n[Files Created — sandbox: ${taskBatchId}]\n${listing}\n[/Files]`;
            console.log(`[team-router] Worker ${agentName}: found ${scannedFiles.length} files in sandbox ${taskBatchId}`);

            // Publish immediately — NullClaw home may be destroyed before preview scan
            hasHtmlFiles = scannedFiles.some(f => f.rel.endsWith('.html'));
            if (hasHtmlFiles && sourceDir) {
              try {
                await publishTaskFiles(userId, taskBatchId, null, sourceDir);
                console.log(`[team-router] Worker ${agentName}: published ${scannedFiles.length} files for preview`);
              } catch (pubErr) {
                console.warn(`[team-router] Worker ${agentName}: publish failed: ${pubErr.message}`);
              }
            }
          }
        } catch { /* sandbox may not exist if no files written */ }

        // ── Notify client delegation complete (after file scan for file info) ──
        sendJson(ws, {
          type: 'team-delegation',
          status: 'complete',
          teamId,
          fromAgent: 'orchestrator',
          toAgent: agentId,
          toAgentName: agentName,
          responseLength: workerResponse.length,
          filesCreated: scannedFiles.length,
          fileNames: scannedFiles.map(f => f.rel).slice(0, 10),
          ts: Date.now(),
        });

        // Truncate very long responses for the orchestrator's context
        const maxResponseLen = 8000;
        const truncated = workerResponse.length > maxResponseLen
          ? workerResponse.slice(0, maxResponseLen) + '\n\n[Response truncated — full output was sent to user]'
          : workerResponse;

        return {
          content: `[Response from ${agentName}]\n${truncated}${fileManifest}`,
          taskBatchId,
          filesCreated: fileManifest.length > 0,
          hasHtmlFiles,
        };

      } catch (err) {
        sendJson(ws, {
          type: 'team-delegation',
          status: 'error',
          teamId,
          toAgent: agentId,
          toAgentName: agentName,
          error: err.message,
          ts: Date.now(),
        });

        return {
          content: `Delegation to ${agentName} failed: ${err.message}`,
          isError: true,
        };
      } finally {
        activeDelegations--;
      }
    },
  };
}

/**
 * Build the prompt sent to a worker agent during delegation.
 *
 * @param {Object} agentInfo — team_agents row with agent details
 * @param {string} task — the subtask description
 * @param {string} [context] — additional context
 * @param {Object} team — team object for shared context
 * @returns {string}
 */
/**
 * Build the worker's task prompt.
 *
 * @param {Object} agentInfo — worker agent config
 * @param {string} task — task description
 * @param {string} context — orchestrator-provided context
 * @param {Object} team — team object
 * @param {string} [fileContents=''] — pre-read project files injected by server
 * @returns {string}
 */
function buildWorkerPrompt(agentInfo, task, context, team, fileContents = '', userId = null, taskBatchId = null) {
  const parts = [];

  // Worker's own system prompt
  if (agentInfo.systemPrompt) {
    parts.push(`[System]\n${agentInfo.systemPrompt}\n`);
  }

  // Team context
  parts.push(`[Team Context]`);
  parts.push(`You are working as part of team "${team.name}".`);
  parts.push(`You have been assigned a specific subtask by the team orchestrator.`);
  parts.push(`Focus on your assigned task and provide a clear, complete response.`);
  if (taskBatchId) {
    parts.push(`\n### FILE OUTPUT RULES (MANDATORY) ###`);
    parts.push(`1. You MUST call file_write for EVERY code file (HTML, CSS, JS, config, etc.). Code in your response text is DISCARDED — only file_write saves work.`);
    parts.push(`2. Prefix ALL paths with "${taskBatchId}/". Example: file_write path="${taskBatchId}/index.html"`);
    parts.push(`3. After writing files, give a brief summary (2-3 sentences). Do NOT repeat code in your response.`);
    parts.push(`### END FILE OUTPUT RULES ###\n`);
  } else {
    parts.push(`When your task involves creating files (websites, apps, configs, etc.), use the file_write tool to create actual files in your workspace directory.`);
  }
  parts.push(`When your task is analysis, review, or planning, output your work as text in the response.`);
  parts.push(`Base your work on the actual file contents provided below when available. Do NOT invent or assume file contents for existing files.\n`);

  // Shared artifacts from other workers/teams
  if (userId) {
    const artifactCtx = artifactStore.buildPromptContext(userId);
    if (artifactCtx) {
      parts.push(artifactCtx);
    }
  }

  // Server-injected file contents (real, sandboxed)
  if (fileContents) {
    parts.push(fileContents);
    parts.push('');
  }

  // Additional context from orchestrator
  if (context) {
    parts.push(`[Additional Context]\n${context}\n`);
  }

  // The actual task
  parts.push(`[Task]\n${task}`);

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Main team routing entry point                                     */
/* ------------------------------------------------------------------ */

/**
 * Route a message through the team system.
 *
 * Called by the agent-orchestrator when a message targets a team.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.teamId
 * @param {string} opts.text — user message
 * @param {import('ws').WebSocket} opts.ws
 * @param {import('../lib/nullclaw-adapter.js').NullClawAdapter} opts.adapter
 * @param {Function} opts.sendJson — (ws, msg) => void
 * @param {Function} opts.buildAugmentedPrompt — from orchestrator
 * @param {Function} opts.getHistory — (userId, agentId, limit) => turns
 * @param {Function} opts.appendHistory — (userId, agentId, role, content, model)
 * @param {Function} opts.retrieveContext — (query, userId) => contextBlock
 * @param {Function} opts.parseGenUIResponse — from genui-response-parser
 * @param {Object} opts.canvasState — canvas state module
 * @returns {Promise<string>} — final orchestrator response
 */
export async function routeTeamMessage(opts) {
  const {
    userId, teamId, text, ws, adapter, sendJson,
    getHistory, appendHistory, retrieveContext,
    parseGenUIResponse, canvasState,
  } = opts;

  // ── Per-team routing lock ──
  // Prevent concurrent messages from colliding on the same team's NullClaw instances.
  // If a team is already processing, wait (up to 30s) then reject.
  const lockKey = `${userId}:${teamId}`;
  if (_teamLocks.has(lockKey)) {
    console.warn(`[team-router] Team ${teamId} already processing — rejecting concurrent request`);
    sendJson(ws, {
      type: 'team-error',
      teamId,
      error: 'This team is still processing a previous request. Please wait for it to finish.',
      ts: Date.now(),
    });
    throw new Error('Team is busy — concurrent request rejected');
  }
  _teamLocks.set(lockKey, Date.now());

  // ── Load team ──
  const team = teamsState.getTeam(teamId);
  if (!team) { _teamLocks.delete(lockKey); throw new Error(`Team ${teamId} not found`); }

  // ── Verify membership ──
  const membership = teamsState.checkMembership(teamId, userId);
  if (!membership.isMember) throw new Error('Not a member of this team');

  // ── Find orchestrator ──
  const orchestratorAssignment = teamsState.getOrchestrator(teamId);
  if (!orchestratorAssignment) {
    throw new Error('Team has no orchestrator agent assigned. Assign one with the "orchestrator" role.');
  }

  const orchestratorAgentId = orchestratorAssignment.agentId;

  // ── Load team shared memory ──
  const teamMemory = teamsState.getMemory(teamId, { limit: 30 });

  // ── Build orchestrator system prompt ──
  const teamSystemPrompt = buildTeamSystemPrompt(team, orchestratorAssignment, teamMemory, userId);

  // ── Conversation history (per team, keyed by team ID) ──
  const historyKey = `team:${teamId}`;
  const history = getHistory(userId, historyKey, 20);

  // Save user message
  appendHistory(userId, historyKey, 'user', text);

  // ── Notify client ──
  sendJson(ws, {
    type: 'team-message-start',
    teamId,
    teamName: team.name,
    orchestratorId: orchestratorAgentId,
    orchestratorName: orchestratorAssignment.agentName,
    agents: team.agents.map(a => ({
      id: a.agentId,
      name: a.agentName,
      role: a.role,
      avatar: a.avatar,
    })),
    ts: Date.now(),
  });

  sendJson(ws, {
    type: 'typing',
    status: 'start',
    agentId: orchestratorAgentId,
    teamId,
    phase: 'planning',
    ts: Date.now(),
  });

  // ── Overall timeout for the entire team routing operation ──
  const teamAbort = new AbortController();
  const teamTimer = setTimeout(() => teamAbort.abort(), TEAM_ROUTING_TIMEOUT_MS);
  const teamStartTime = Date.now();

  try {
    // ── Context retrieval ──
    const contextBlock = await retrieveContext(text, userId);

    // ── Build the full prompt ──
    // Cap history to ~16KB to stay within NullClaw's body size limit (~64KB).
    // Truncate individual messages and limit total history chars.
    const MAX_HISTORY_CHARS = 16_000;
    const MAX_MSG_CHARS = 2_000;
    let historyBudget = MAX_HISTORY_CHARS;
    const historyLines = [];
    for (const h of history) {
      const prefix = h.role === 'user' ? 'User' : 'Assistant';
      const truncated = h.content.length > MAX_MSG_CHARS
        ? h.content.slice(0, MAX_MSG_CHARS) + '… [truncated]'
        : h.content;
      const line = `${prefix}: ${truncated}`;
      if (historyBudget - line.length < 0) break;
      historyBudget -= line.length;
      historyLines.push(line);
    }

    const promptParts = [];
    promptParts.push(teamSystemPrompt);
    if (contextBlock) promptParts.push(`[Retrieved context]\n${contextBlock}\n`);
    if (historyLines.length > 0) promptParts.push(`[Conversation history]\n${historyLines.join('\n')}\n`);
    promptParts.push(text);
    const augmentedPrompt = promptParts.join('\n');

    // ── Role-based NullClaw instances (tool-policy enforcement) ──
    // Generate per-role configs so orchestrator/workers get Zig-level tool restrictions.
    // Orchestrator: locked (no shell, no files). Workers: supervised (dev tools only).
    const apiKey = getNullClawApiKey();
    const orchHomeDir = generateConfig(userId, 'orchestrator', {
      apiKey,
      workspaceDir: join(PROJECT_ROOT, '.scratchy-data', 'team-workspace', userId),
    });
    // Worker sandbox root: all per-delegation task directories live under this.
    // NullClaw's path_security uses prefix matching on allowed_paths, so allowing
    // the tasks/ parent lets any UUID subdirectory be accessed. Per-task isolation
    // is organizational (different UUID per delegation) rather than Zig-enforced
    // per-directory. The security boundary is per-user (workers can't escape
    // team-workspace/{userId}/).
    const workerTasksRoot = join(PROJECT_ROOT, '.scratchy-data', 'team-workspace', userId, 'tasks');
    const workerHomeDir = generateConfig(userId, 'worker', {
      apiKey,
      workspaceDir: workerTasksRoot,
      allowedPaths: [workerTasksRoot],
    });

    // Determine reviewer IDs for audit
    const reviewerIds = team.agents
      .filter(a => a.role === 'reviewer' || a.role === 'qa')
      .map(a => a.agentId);
    const teamContext = {
      orchestratorId: orchestratorAgentId,
      reviewerIds,
    };

    // Spawn role-specific instances
    const orchKey = policyInstanceKey(userId, 'orchestrator');
    const workerKey = policyInstanceKey(userId, 'worker');
    // NOTE: orchKey/workerKey already include the role suffix (from policyInstanceKey).
    // Do NOT pass role to spawnInstance — it would double-suffix the key
    // (e.g. "userId:orchestrator:orchestrator"). Pass homeDir only.
    await adapter.spawnInstance(orchKey, { homeDir: orchHomeDir });
    await adapter.spawnInstance(workerKey, { homeDir: workerHomeDir });
    console.log(`[team-router] Role instances spawned: orchestrator=${orchKey}, worker=${workerKey}`);

    // ── Create delegation executor ──
    const delegationExecutor = createDelegationExecutor({
      userId,
      teamId,
      team,
      adapter,
      ws,
      sendJson,
      depth: 0,
      parentSignal: teamAbort.signal,
      teamContext, // pass for audit
      workerHomeDir, // for file scan — NullClaw writes to {homeDir}/.nullclaw/workspace/
    });

    // ── Structured Plan Phase (Fast Path) ──
    // Ask orchestrator for a JSON task plan. If valid, dispatch workers
    // directly via Promise.all — bypassing the unreliable [DELEGATE] loop.
    // Falls back to legacy [DELEGATE] loop on plan parse failure.
    const instanceKey = orchKey; // Use role-specific orchestrator instance
    const orchestratorSessionKey = `team:${teamId}:orchestrator`;

    // Build agent name→ID map for plan validation
    const workers = team.agents.filter(a => a.role !== 'orchestrator' && a.enabled !== 0);
    const agentNameToId = new Map(workers.map(a => [a.agentName, a.agentId]));
    const validAgentNames = new Set(workers.map(a => a.agentName));

    let usedFastPath = false;
    let finalResponse = '';

    // Only attempt planning if the message looks like a work request (not chat)
    const looksLikeWork = text.length > 80 || /\b(create|build|implement|write|make|add|fix|update|design|refactor)\b/i.test(text);

    if (looksLikeWork && workers.length >= 2) {
      console.log(`[team-router] Attempting structured plan phase (${workers.length} workers available)`);

      // Build the planning prompt. By default, only the current user message + planning
      // suffix. BUT if the user references a previous run ("redo", "retry", "aborted",
      // "failed workers"), include the last assistant message so the planner knows which
      // tasks already succeeded and only re-plans the failed ones.
      const looksLikeFollowUp = /\b(redo|retry|again|aborted|failed|re-?run|just the|only the|remaining|missing)\b/i.test(text);
      let planContext = '';
      if (looksLikeFollowUp && history.length > 0) {
        // Find the last assistant message — it contains the synthesis of previous worker results
        const lastAssistant = [...history].reverse().find(h => h.role === 'assistant');
        if (lastAssistant) {
          const trimmed = lastAssistant.content.length > 4000
            ? lastAssistant.content.slice(0, 4000) + '\n… [truncated]'
            : lastAssistant.content;
          planContext = `[Previous run result]\n${trimmed}\n[/Previous run result]\n\n`;
          console.log(`[team-router] Follow-up detected — injecting ${trimmed.length} chars of previous context into planner`);
        }
      }
      const planUserMessage = planContext + text + '\n\n' + PLANNING_PROMPT_SUFFIX;

      try {
        // Route planning through NullClaw with restricted "planner" role.
        // Planner config has allowed_paths: [], allowed_commands: [], max_actions: 0.
        // If the model tries tools, NullClaw blocks them → model falls back to text.
        // All model calls go through NullClaw — no direct API from Scratchy.
        let planResponse = '';
        sendJson(ws, {
          type: 'team-planning',
          teamId,
          status: 'start',
          ts: Date.now(),
        });

        const planStartTime = Date.now();
        planResponse = await planWithNullClaw(
          adapter,
          userId,
          apiKey,
          teamSystemPrompt,
          planUserMessage,
          teamAbort.signal,
        );
        console.log(`[team-router] Plan phase completed in ${Date.now() - planStartTime}ms (${planResponse.length} chars, NullClaw planner)`);

        const { plan, error } = parseTaskPlan(planResponse, validAgentNames, agentNameToId);

        if (error) {
          console.log(`[team-router] Plan parse failed: ${error} — falling back to [DELEGATE] loop`);
          sendJson(ws, { type: 'team-planning', teamId, status: 'fallback', reason: error, ts: Date.now() });
          // Fall through to legacy loop
        } else if (plan.length === 0) {
          console.log('[team-router] Plan is empty (simple question) — falling back to direct response');
          sendJson(ws, { type: 'team-planning', teamId, status: 'simple', ts: Date.now() });
          // Fall through to legacy loop for simple Q&A
        } else {
          // ── Valid plan — execute via fast path ──
          console.log(`[team-router] Plan accepted: ${plan.length} task(s) — ${plan.map(t => `${t.agentName}:"${t.task.slice(0, 50)}"`).join(', ')}`);
          const independentCount = plan.filter(t => t.dependsOn.length === 0).length;
          console.log(`[team-router] ${independentCount} independent (parallel), ${plan.length - independentCount} dependent (sequential)`);

          sendJson(ws, {
            type: 'team-planning',
            teamId,
            status: 'accepted',
            taskCount: plan.length,
            parallelCount: independentCount,
            tasks: plan.map(t => ({ agentName: t.agentName, agentId: t.agentId, task: t.task.slice(0, 100) })),
            ts: Date.now(),
          });

          // Execute all tasks with dependency-aware parallel dispatch
          const taskResults = await executeTaskPlan(plan, delegationExecutor, ws, sendJson, teamId, teamAbort);

          // ── QA Review Pass (if team has a reviewer) ──
          // Automatically routes all worker output through the reviewer agent.
          // Reviewer evaluates quality, flags issues, and provides feedback.
          // This runs BEFORE synthesis so the orchestrator sees reviewer notes.
          let reviewFeedback = '';
          const reviewerAgent = team.agents.find(a =>
            (a.role === 'reviewer' || a.role === 'qa') && a.enabled !== 0
          );

          if (reviewerAgent && !teamAbort.signal.aborted) {
            console.log(`[team-router] QA review pass: routing ${taskResults.length} results to ${reviewerAgent.agentName}`);
            sendJson(ws, {
              type: 'team-delegation',
              status: 'start',
              teamId,
              fromAgent: 'orchestrator',
              toAgent: reviewerAgent.agentId,
              toAgentName: reviewerAgent.agentName,
              task: 'Review all worker outputs for quality, correctness, and completeness',
              ts: Date.now(),
            });

            try {
              const reviewPrompt = formatDelegationResults(taskResults) +
                '\n\n**You are the QA reviewer.** Evaluate ALL worker outputs above.\n' +
                'Check for:\n' +
                '- Correctness: Does the code/output actually solve the task?\n' +
                '- Completeness: Are there missing pieces, TODOs, or placeholders?\n' +
                '- Quality: Code style, error handling, edge cases\n' +
                '- Consistency: Do outputs from different workers integrate properly?\n' +
                '- Security: Any obvious vulnerabilities?\n\n' +
                'Respond with:\n' +
                '1. **PASS** or **ISSUES FOUND** verdict\n' +
                '2. Brief summary of each worker\'s output quality\n' +
                '3. Specific issues to fix (if any)\n' +
                'Be concise — your feedback goes to the orchestrator for final synthesis.';

              const reviewerSessionKey = `team:${teamId}:reviewer:${reviewerAgent.agentId}`;
              const workerInstanceKey = policyInstanceKey(userId, 'worker');

              reviewFeedback = await adapter.routeMessageStreaming(
                workerInstanceKey,
                reviewPrompt,
                (chunk) => {
                  sendJson(ws, {
                    type: 'team-worker-stream',
                    delta: chunk,
                    agentId: reviewerAgent.agentId,
                    agentName: reviewerAgent.agentName,
                    teamId,
                    ts: Date.now(),
                  });
                },
                reviewerSessionKey,
                (evt) => {
                  const audit = auditToolEvent(evt, 'reviewer', reviewerAgent.agentId, teamId);
                  if (audit.violated) {
                    sendJson(ws, { type: 'tool-violation', ...audit, ts: Date.now() });
                  }
                },
                teamAbort.signal
              );

              reviewFeedback = stripToolCallXml(reviewFeedback);

              sendJson(ws, {
                type: 'team-delegation',
                status: 'complete',
                teamId,
                fromAgent: 'orchestrator',
                toAgent: reviewerAgent.agentId,
                toAgentName: reviewerAgent.agentName,
                responseLength: reviewFeedback.length,
                ts: Date.now(),
              });

              console.log(`[team-router] QA review complete: ${reviewFeedback.length} chars`);
            } catch (err) {
              console.warn(`[team-router] QA review failed (non-fatal): ${err.message}`);
              sendJson(ws, {
                type: 'team-delegation',
                status: 'error',
                teamId,
                toAgent: reviewerAgent.agentId,
                toAgentName: reviewerAgent.agentName,
                error: err.message,
                ts: Date.now(),
              });
              // Non-fatal — continue to synthesis without review feedback
            }
          }

          // ── Synthesis turn: orchestrator reviews and combines results ──
          let synthesisInstructions = '\n\nAll tasks are complete. Give the user a SHORT summary (3-5 sentences max) of what was built. ' +
            'Do NOT repeat code, do NOT show file contents, do NOT list implementation details. ' +
            'Just say what was created and that it is ready to preview. ' +
            'Do NOT delegate further — synthesis only. Do NOT use canvas tools — the preview button is handled automatically.';

          if (reviewFeedback) {
            synthesisInstructions = '\n\n[QA Reviewer Feedback]\n' + reviewFeedback + '\n[/QA Reviewer Feedback]' +
              '\n\nAll tasks are complete. The QA reviewer has evaluated the outputs above. ' +
              'Consider their feedback when producing your final response. ' +
              'If the reviewer flagged issues, note them in your response. ' +
              'Do NOT delegate further — synthesis only.';
          }

          const synthesisPrompt = formatDelegationResults(taskResults) + synthesisInstructions;

          console.log(`[team-router] Synthesis turn: sending ${taskResults.length} results to orchestrator`);

          // Cooldown before synthesis — workers just made N concurrent Anthropic calls.
          // Firing synthesis immediately risks rate limiting on the same API key.
          const SYNTHESIS_COOLDOWN_MS = 2_000;
          await new Promise(r => setTimeout(r, SYNTHESIS_COOLDOWN_MS));

          // Ensure orchestrator NullClaw is alive before synthesis.
          // It may have exited during the idle gap while workers ran.
          try {
            await adapter.ensureReady(instanceKey);
          } catch (respawnErr) {
            console.warn(`[team-router] Orchestrator respawn before synthesis: ${respawnErr.message}`);
            // If respawn fails, try once more with a fresh instance
            try {
              adapter.destroyInstance(instanceKey);
              await adapter.spawnInstance(instanceKey, { homeDir: orchHomeDir });
              await adapter.ensureReady(instanceKey);
              console.log(`[team-router] Orchestrator respawned successfully for synthesis`);
            } catch (e2) {
              console.error(`[team-router] Failed to respawn orchestrator for synthesis: ${e2.message}`);
              throw new Error('Orchestrator died during worker phase and could not be restarted');
            }
          }

          sendJson(ws, { type: 'team-synthesis-start', teamId, ts: Date.now() });

          sendJson(ws, {
            type: 'typing',
            status: 'start',
            agentId: orchestratorAgentId,
            teamId,
            turn: 'synthesis',
            phase: 'synthesizing',
            ts: Date.now(),
          });

          // ── Stream gate for synthesis: suppress verbose post-canvas-tool text ──
          let synthCanvasToolFired = false;
          let synthInsideToolBlock = false;
          let synthSentenceCount = 0;
          let synthStreamBuffer = '';

          function synthGatedChunk(chunk) {
            synthStreamBuffer += chunk;

            // Detect <tool_call> opening — start suppressing
            if (!synthInsideToolBlock && synthStreamBuffer.includes('<tool_call>')) {
              const idx = synthStreamBuffer.indexOf('<tool_call>');
              const before = synthStreamBuffer.slice(0, idx).trim();
              if (before) {
                sendJson(ws, { type: 'chat-stream', delta: before, agentId: orchestratorAgentId, agentName: orchestratorAssignment.agentName, teamId, turn: 'synthesis', ts: Date.now() });
              }
              synthInsideToolBlock = true;
              synthStreamBuffer = synthStreamBuffer.slice(idx);
              return;
            }

            // Inside tool block — suppress until </tool_result>
            if (synthInsideToolBlock) {
              if (synthStreamBuffer.includes('</tool_result>')) {
                const endIdx = synthStreamBuffer.indexOf('</tool_result>') + '</tool_result>'.length;
                synthStreamBuffer = synthStreamBuffer.slice(endIdx);
                synthInsideToolBlock = false;
              }
              return;
            }

            // After canvas tool fired — limit to 1 sentence
            if (synthCanvasToolFired) {
              const sentences = synthStreamBuffer.match(/[.!?]\s/g);
              if (sentences) synthSentenceCount += sentences.length;
              if (synthSentenceCount >= 1) {
                const match = synthStreamBuffer.match(/^(.*?[.!?])\s/);
                if (match) {
                  sendJson(ws, { type: 'chat-stream', delta: match[1], agentId: orchestratorAgentId, agentName: orchestratorAssignment.agentName, teamId, turn: 'synthesis', ts: Date.now() });
                  synthStreamBuffer = '';
                }
                return; // suppress further text
              }
              // Haven't finished first sentence yet — hold in buffer
              return;
            }

            // Normal text — send directly
            sendJson(ws, { type: 'chat-stream', delta: chunk, agentId: orchestratorAgentId, agentName: orchestratorAssignment.agentName, teamId, turn: 'synthesis', ts: Date.now() });
            synthStreamBuffer = '';
          }

          let synthesisResponse = '';
          synthesisResponse = await adapter.routeMessageStreaming(
            instanceKey,
            synthesisPrompt,
            synthGatedChunk,
            orchestratorSessionKey,
            // onToolEvent — intercept mcp_canvas_* tools during synthesis
            (evt) => {
              if (evt.type !== 'tool_call_start') return;
              const toolName = evt.name || '';
              if (!toolName.startsWith('mcp_canvas_')) return;

              synthCanvasToolFired = true;
              synthSentenceCount = 0;
              synthStreamBuffer = '';

              const shortName = toolName.replace('mcp_canvas_', '');
              let args;
              try {
                args = typeof evt.arguments === 'string' ? JSON.parse(evt.arguments) : (evt.arguments || {});
              } catch { args = {}; }

              let ops = [];
              if (shortName === 'render' && args.components) {
                ops = args.components.map(c => ({ op: 'upsert', id: c.id || `auto-${Date.now()}`, type: c.type || 'card', data: c.data || {} }));
              } else if (shortName === 'update') {
                ops = [{ op: 'patch', id: args.id, data: args.data || {} }];
              } else if (shortName === 'remove') {
                ops = [{ op: 'remove', id: args.id }];
              } else if (shortName === 'clear') {
                ops = [{ op: 'clear' }];
              } else if (TYPED_TOOL_NAMES.has(shortName)) {
                ops = mapTypedCanvasTool(shortName, args);
              }
              if (ops.length > 0) {
                sendJson(ws, { type: 'genui-pending', count: ops.length, ts: Date.now() });
                sendJson(ws, { type: 'canvas-ops', ops, source: 'genui-tool', teamId, ts: Date.now() });
                console.log(`[team-router] Synthesis canvas tool: ${shortName} → ${ops.length} ops`);
              }
            },
          );

          // ── Flush synthesis gate buffer (remaining unsent text < 1 sentence) ──
          if (synthCanvasToolFired && synthStreamBuffer.trim() && synthSentenceCount < 1) {
            const cleaned = synthStreamBuffer
              .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
              .replace(/<tool_result>[\s\S]*?<\/tool_result>/g, '').trim();
            if (cleaned) {
              sendJson(ws, { type: 'chat-stream', delta: cleaned, agentId: orchestratorAgentId, agentName: orchestratorAssignment.agentName, teamId, turn: 'synthesis', ts: Date.now() });
            }
          }

          synthesisResponse = stripToolCallXml(synthesisResponse);
          // Clean response if canvas tools were used during synthesis
          if (synthCanvasToolFired && synthesisResponse) {
            const sentenceMatch = synthesisResponse.match(/^(.*?[.!?])\s/);
            if (sentenceMatch && synthesisResponse.length > 150) {
              synthesisResponse = sentenceMatch[1];
            }
          }
          sendJson(ws, { type: 'chat-stream-end', agentId: orchestratorAgentId, teamId, turn: 'synthesis', ts: Date.now() });

          finalResponse = synthesisResponse;
          appendHistory(userId, historyKey, 'assistant', synthesisResponse, `team:${team.name}`);
          usedFastPath = true;

          // Preview links are now sent via team-message-end (more reliable than canvas-ops).
          // No duplicate canvas-ops preview here — the end event handles it.

          const totalElapsed = Math.floor((Date.now() - teamStartTime) / 1000);
          console.log(`[team-router] Fast path complete: ${plan.length} tasks, ${totalElapsed}s total`);
        }
      } catch (err) {
        console.warn(`[team-router] Planning phase error: ${err.message} — falling back to [DELEGATE] loop`);
        sendJson(ws, { type: 'team-planning', teamId, status: 'error', error: err.message, ts: Date.now() });
        // Fall through to legacy loop
      }
    }

    // ── Legacy [DELEGATE] loop (fallback) ──
    // Used when: planning phase failed/skipped, simple messages, complex multi-step work
    if (!usedFastPath) {

    let currentPrompt = augmentedPrompt;
    let response = '';
    let enforcementUsed = false;
    let batchEnforcementUsed = false;
    const expectedTasks = countUserTasks(text);
    if (expectedTasks >= 2) {
      console.log(`[team-router] Detected ${expectedTasks} independent tasks in user message — will enforce parallel batching`);
    }

    for (let turn = 0; turn < MAX_DELEGATION_TURNS; turn++) {
      // Check overall timeout
      if (teamAbort.signal.aborted) {
        console.log(`[team-router] Overall team timeout reached after ${Math.floor((Date.now() - teamStartTime) / 1000)}s`);
        break;
      }
      response = '';
      // ── Send to orchestrator and stream ──
      sendJson(ws, {
        type: 'typing',
        status: 'start',
        agentId: orchestratorAgentId,
        teamId,
        turn,
        phase: turn === 0 ? 'planning' : 'coordinating',
        ts: Date.now(),
      });

      // Buffer orchestrator output — only stream final response to client.
      // Intermediate turns (with DELEGATE blocks, enforcement re-prompts) are
      // internal coordination and shouldn't appear in user chat.
      let orchestratorUsedFileWrite = false;
      response = await adapter.routeMessageStreaming(
        instanceKey,
        currentPrompt,
        // onChunk — buffer only (streamed to client after loop if this is the final turn)
        () => {},
        orchestratorSessionKey,
        // onToolEvent — detect file_write usage (orchestrators must delegate, not write)
        (evt) => {
          if (evt.type === 'tool_call_start' && evt.name === 'file_write') {
            orchestratorUsedFileWrite = true;
            console.log(`[team-router] ⚠ Orchestrator used file_write — will re-prompt to delegate`);
          }
        },
      );

      // ── Strip raw tool call XML from response ──
      // NullClaw streams <tool_call>...</tool_call> as text deltas alongside
      // the SSE tool events. Remove them so they don't leak into chat or history.
      response = stripToolCallXml(response);

      // ── Parse delegation blocks from response ──
      const { delegations, cleanText } = parseDelegationBlocks(response);

      const elapsed = Math.floor((Date.now() - teamStartTime) / 1000);
      console.log(`[team-router] Turn ${turn}: response length=${response.length}, delegations=${delegations.length}, elapsed=${elapsed}s`);
      if (delegations.length > 0) {
        console.log(`[team-router] Delegations: ${delegations.map(d => `${d.agentId}:"${d.task.slice(0, 60)}"`).join(', ')}`);
      } else {
        // Log first 300 chars to debug why no blocks were found
        const preview = response.slice(0, 300).replace(/\n/g, '\\n');
        console.log(`[team-router] No delegation blocks found. Response preview: ${preview}`);
      }

      // ── Enforcement: detect orchestrator using file_write (must delegate instead) ──
      // Only enforce on Turn 0 — on later turns the orchestrator may be producing final output
      if (orchestratorUsedFileWrite && !enforcementUsed && turn === 0) {
        enforcementUsed = true;
        console.log(`[team-router] Enforcement: orchestrator used file_write directly — re-prompting to delegate`);
        sendJson(ws, { type: 'typing', status: 'stop', agentId: orchestratorAgentId, teamId, ts: Date.now() });
        sendJson(ws, {
          type: 'team-enforcement',
          teamId,
          reason: 'orchestrator-file-write',
          ts: Date.now(),
        });
        currentPrompt = 'ERROR: You used file_write directly. You are the COORDINATOR — you MUST NOT write files yourself. ' +
          'Delegate ALL file creation to your team workers using [DELEGATE] blocks. ' +
          'Each [DELEGATE] block assigns a task to a specialist worker who will create the files. ' +
          'Redo your response using ONLY [DELEGATE to="agent-id" task="..." files="file1,file2"] blocks.';
        continue;
      }

      if (delegations.length === 0) {
        // ── Enforcement: detect orchestrator doing work instead of delegating ──
        // If the response is long (implementation-like) with no delegation blocks,
        // re-prompt once to force delegation. Short conversational replies pass through.
        if (response.length > ENFORCEMENT_THRESHOLD_CHARS && turn === 0 && !enforcementUsed) {
          enforcementUsed = true;
          console.log(`[team-router] Enforcement: response ${response.length} chars with no delegations — re-prompting`);

          // Stop typing before re-prompting (prevents duplicate indicators)
          sendJson(ws, { type: 'typing', status: 'stop', agentId: orchestratorAgentId, teamId, ts: Date.now() });

          sendJson(ws, {
            type: 'team-enforcement',
            teamId,
            reason: 'orchestrator-redirect',
            responseLength: response.length,
            ts: Date.now(),
          });

          // Re-prompt: tell it to delegate instead of implementing
          currentPrompt = ENFORCEMENT_REPROMPT;
          continue; // retry this turn
        }

        // No delegations — this is the final response
        finalResponse = response;
        break;
      }

      // ── Batch enforcement: detect under-batching on Turn 0 ──
      // If user message has N tasks but orchestrator only delegated <N,
      // re-prompt to emit all tasks. Only on Turn 0, once.
      // The re-prompt tells the orchestrator to redo with ALL tasks batched.
      // We discard the under-batched delegations (don't execute them).
      if (turn === 0 && !batchEnforcementUsed && expectedTasks >= 2 && delegations.length < expectedTasks) {
        batchEnforcementUsed = true;
        console.log(`[team-router] Batch enforcement: ${delegations.length} delegation(s) but ${expectedTasks} tasks detected — re-prompting (discarding partial delegations)`);

        // Stop typing before re-prompting (prevents duplicate indicators)
        sendJson(ws, { type: 'typing', status: 'stop', agentId: orchestratorAgentId, teamId, ts: Date.now() });

        sendJson(ws, {
          type: 'team-enforcement',
          teamId,
          reason: 'under-batching',
          found: delegations.length,
          expected: expectedTasks,
          ts: Date.now(),
        });

        currentPrompt = BATCH_ENFORCEMENT_REPROMPT(delegations.length, expectedTasks);
        continue; // retry — orchestrator gets the enforcement message as next turn
      }

      // Save intermediate orchestrator message to history (survives refresh)
      if (cleanText) {
        finalResponse = cleanText;
        appendHistory(userId, historyKey, 'assistant', cleanText, `team:${team.name}`);
      }

      // ── Cap delegations per turn ──
      if (delegations.length > MAX_CONCURRENT_DELEGATIONS) {
        console.log(`[team-router] Capping ${delegations.length} delegations to ${MAX_CONCURRENT_DELEGATIONS} (excess deferred to next turn)`);
        delegations.splice(MAX_CONCURRENT_DELEGATIONS);
      }

      // ── Execute delegations in PARALLEL ──
      // NullClaw multi-threaded fork handles concurrent requests natively.
      // Each worker gets its own thread in the gateway, different session_keys
      // run in true parallel. This reduces 3-worker execution from ~6 min to ~2 min.
      console.log(`[team-router] Turn ${turn}: ${delegations.length} delegation(s) to execute in parallel`);

      sendJson(ws, {
        type: 'team-delegations-start',
        teamId,
        count: delegations.length,
        agents: delegations.map(d => d.agentId),
        ts: Date.now(),
      });

      // Update typing phase to 'delegating' so client shows worker progress
      sendJson(ws, {
        type: 'typing',
        status: 'start',
        agentId: orchestratorAgentId,
        teamId,
        phase: 'delegating',
        workerCount: delegations.length,
        ts: Date.now(),
      });

      const delegationPromises = delegations.map(async (d) => {
        // Check overall timeout before starting
        if (teamAbort.signal.aborted) {
          return {
            agentId: d.agentId,
            agentName: team.agents.find(a => a.agentId === d.agentId)?.agentName || d.agentId,
            result: 'Skipped — team routing timeout reached',
            isError: true,
          };
        }

        try {
          const result = await delegationExecutor.executeTool('delegate', {
            agentId: d.agentId,
            task: d.task,
            context: d.context,
            files: d.files,
          });
          const agentInfo = team.agents.find(a => a.agentId === d.agentId);
          return {
            agentId: d.agentId,
            agentName: agentInfo?.agentName || d.agentId,
            result: result.content,
            isError: !!result.isError,
          };
        } catch (err) {
          console.error(`[team-router] Worker ${d.agentId} failed:`, err.message);
          return {
            agentId: d.agentId,
            agentName: team.agents.find(a => a.agentId === d.agentId)?.agentName || d.agentId,
            result: `Worker error: ${err.message}`,
            isError: true,
          };
        }
      });

      const delegationResults = await Promise.all(delegationPromises);

      sendJson(ws, {
        type: 'team-delegations-end',
        teamId,
        count: delegationResults.length,
        errors: delegationResults.filter(r => r.isError).length,
        ts: Date.now(),
      });

      // ── Pre-synthesis health check ──
      // Workers may have run for minutes — the orchestrator's NullClaw
      // could be unresponsive after a long idle. Verify it's alive before
      // sending the results back for synthesis.
      try {
        await adapter.ensureReady(instanceKey);
      } catch (err) {
        console.warn(`[team-router] Orchestrator health check failed: ${err.message}`);
      }

      // Update phase to synthesizing — workers done, orchestrator combining
      sendJson(ws, { type: 'team-synthesis-start', teamId, ts: Date.now() });

      sendJson(ws, {
        type: 'typing',
        status: 'start',
        agentId: orchestratorAgentId,
        teamId,
        phase: 'synthesizing',
        ts: Date.now(),
      });

      // ── Build follow-up prompt with results ──
      // Add synthesis instruction to prevent re-delegation loops
      currentPrompt = formatDelegationResults(delegationResults) +
        '\n\nIMPORTANT: The workers have completed their tasks. Synthesize the results into a final response for the user. ' +
        'Do NOT delegate again. Summarize what was built and present the results.';
    }

    } // end if (!usedFastPath) — legacy [DELEGATE] loop

    // ── Preview scan for legacy loop ──
    // The fast path has its own preview scan keyed on taskResults. For the legacy
    // loop we scan the entire worker workspace for HTML files and offer preview.
    if (!usedFastPath && workerHomeDir) {
      try {
        const nullclawWsRoot = join(workerHomeDir, '.nullclaw', 'workspace');
        // Publish files for preview (actual preview buttons sent via team-message-end)
        const { readdirSync, statSync: statS } = await import('node:fs');
        let batchDirs = [];
        try {
          batchDirs = readdirSync(nullclawWsRoot).filter(d => {
            const p = join(nullclawWsRoot, d);
            const s = statS(p);
            return s.isDirectory() && s.mtimeMs >= teamStartTime;
          });
        } catch {}
        for (const batchId of batchDirs) {
          const dir = join(nullclawWsRoot, batchId);
          try {
            const files = await scanDir(dir);
            if (files.some(f => f.rel.endsWith('.html'))) {
              try { await publishTaskFiles(userId, batchId, null, dir); } catch (pubErr) {
                console.warn(`[team-router] Legacy preview publish failed for ${batchId}: ${pubErr.message}`);
              }
            }
          } catch {}
        }
      } catch (err) {
        console.warn(`[team-router] Legacy preview scan error: ${err.message}`);
      }
    }

    // ── Stream final response to client (legacy loop only) ──
    // The delegation loop buffers all orchestrator turns. Now that we have the
    // final response, stream it to the client as a single chat message.
    if (!usedFastPath && finalResponse) {
      sendJson(ws, {
        type: 'chat-stream',
        delta: finalResponse,
        agentId: orchestratorAgentId,
        agentName: orchestratorAssignment.agentName,
        teamId,
        turn: 'final',
        ts: Date.now(),
      });
      sendJson(ws, { type: 'chat-stream-end', agentId: orchestratorAgentId, teamId, turn: 'final', ts: Date.now() });
    }

    // ── End typing ──
    sendJson(ws, { type: 'typing', status: 'stop', agentId: orchestratorAgentId, teamId, ts: Date.now() });

    // ── GenUI extraction ──
    if (finalResponse && parseGenUIResponse) {
      const { text: cleanText, ops, hasOps } = parseGenUIResponse(finalResponse);
      if (hasOps && ops.length > 0) {
        sendJson(ws, { type: 'genui-pending', count: ops.length, ts: Date.now() });
        sendJson(ws, { type: 'canvas-ops', ops, source: 'team-genui', teamId, ts: Date.now() });

        // Persist canvas state
        if (canvasState) {
          try {
            const existing = canvasState.getCanvasState(userId);
            let merged = [...existing];
            for (const op of ops) {
              if (op.op === 'clear') { merged = []; continue; }
              if (op.op === 'remove') { merged = merged.filter(o => o.id !== op.id); continue; }
              const idx = merged.findIndex(o => o.id === op.id);
              if (idx >= 0) { merged[idx] = { ...merged[idx], ...op }; } else { merged.push(op); }
            }
            canvasState.setCanvasState(userId, merged);
          } catch (err) {
            console.warn('[team-router] Failed to persist canvas state:', err.message);
          }
        }

        finalResponse = cleanText;
      }
    }

    // ── Persist final response (only if it's new — intermediate turns already saved) ──
    // The final break-out response (no delegations) needs saving.
    // Intermediate delegation turns were already saved in the loop.
    // Fast path already saves in its own synthesis block.
    if (!usedFastPath && finalResponse) {
      appendHistory(userId, historyKey, 'assistant', finalResponse, `team:${team.name}`);
    }

    // ── Collect preview URLs for the client ──
    // Scan published dir for any HTML files from this team run
    let endPreviewUrls = [];
    try {
      const { readdirSync: readdirS, statSync: statS2 } = await import('node:fs');
      const publishedRoot = join(PROJECT_ROOT, '.scratchy-data', 'team-workspace', userId, 'published');
      let pubDirs = [];
      try { pubDirs = readdirS(publishedRoot); } catch {}
      for (const name of pubDirs) {
        const dir = join(publishedRoot, name);
        try {
          const s = statS2(dir);
          // Only include dirs from this team run (created after team start)
          if (!s.isDirectory() || s.mtimeMs < teamStartTime) continue;
          const files = await scanDir(dir);
          if (files.some(f => f.rel.endsWith('.html'))) {
            endPreviewUrls.push(`/api/preview/${userId}/${name}/index.html`);
          }
        } catch {}
      }
    } catch {}

    // ── Notify client complete (with preview URLs for bubble) ──
    sendJson(ws, {
      type: 'team-message-end',
      teamId,
      teamName: team.name,
      previewUrls: endPreviewUrls.length > 0 ? endPreviewUrls : undefined,
      ts: Date.now(),
    });

    return finalResponse;

  } catch (err) {
    sendJson(ws, { type: 'typing', status: 'stop', agentId: orchestratorAgentId, teamId, ts: Date.now() });
    // Send error to client so UI doesn't hang
    sendJson(ws, {
      type: 'team-error',
      teamId,
      teamName: team.name,
      error: err.message || 'Team routing failed',
      ts: Date.now(),
    });
    throw err;
  } finally {
    clearTimeout(teamTimer);
    _teamLocks.delete(lockKey);

    // ── Cleanup role-specific NullClaw instances + temp configs ──
    // Orchestrator: always destroyed (locked mode, no persistent value)
    // Worker: kept alive for 5 min so next team invocation reuses session history.
    //   Workers retain conversation context across follow-up requests.
    //   Adapter's idle timer will clean up after SESSION_PERSIST_MS.
    try {
      const orchKey = policyInstanceKey(userId, 'orchestrator');
      const workerKey = policyInstanceKey(userId, 'worker');

      // Destroy orchestrator immediately
      adapter.destroyInstance(orchKey);
      cleanupConfig(userId, 'orchestrator');

      // Keep worker alive with deferred cleanup
      const WORKER_PERSIST_MS = 5 * 60 * 1000; // 5 min idle
      const workerStatus = adapter.getInstanceStatus(workerKey);
      if (workerStatus) {
        // Schedule deferred cleanup instead of immediate destroy
        // Clear any existing timer for this worker
        const existingTimer = _workerCleanupTimers.get(workerKey);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
          try {
            adapter.destroyInstance(workerKey);
            cleanupConfig(userId, 'worker');
            _workerCleanupTimers.delete(workerKey);
            console.log(`[team-router] Deferred worker cleanup: ${workerKey}`);
          } catch { /* instance may already be gone */ }
        }, WORKER_PERSIST_MS);
        timer.unref(); // Don't keep process alive
        _workerCleanupTimers.set(workerKey, timer);
        console.log(`[team-router] Worker ${workerKey} kept alive for ${WORKER_PERSIST_MS / 1000}s (session persistence)`);
      } else {
        cleanupConfig(userId, 'worker');
      }

      // Expire stale artifacts (non-blocking, best-effort)
      artifactStore.expire();
      console.log(`[team-router] Orchestrator destroyed, worker persisted for ${userId}`);
    } catch (cleanupErr) {
      console.warn(`[team-router] Cleanup warning: ${cleanupErr.message}`);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  (handleDelegation removed — delegation is fully server-managed    */
/*   via [DELEGATE] blocks. No http_request path exists.)             */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Pre-built team templates                                          */
/* ------------------------------------------------------------------ */

/**
 * Pre-built team package definitions.
 * These configure orchestrator + workers with appropriate system prompts.
 */
export const TEAM_PACKAGES = {
  devops: {
    name: 'DevOps Team',
    description: 'Code, deploy, and monitor — Atlas leads, Nova researches',
    icon: '⚙️',
    color: 'green',
    agents: [
      { name: 'Atlas', role: 'orchestrator', builtinId: 'atlas' },
      { name: 'Nova', role: 'worker', builtinId: 'nova' },
    ],
  },
  content: {
    name: 'Content Team',
    description: 'Write, design, and publish — Echo writes, Iris designs',
    icon: '✍️',
    color: 'purple',
    agents: [
      { name: 'Echo', role: 'orchestrator', builtinId: 'echo' },
      { name: 'Iris', role: 'worker', builtinId: 'iris' },
    ],
  },
  support: {
    name: 'Support Team',
    description: 'Help users with code and research — Echo leads, Atlas codes',
    icon: '🛟',
    color: 'blue',
    agents: [
      { name: 'Echo', role: 'orchestrator', builtinId: 'echo' },
      { name: 'Atlas', role: 'worker', builtinId: 'atlas' },
    ],
  },
  fullstack: {
    name: 'Full-Stack Team',
    description: 'Complete product development — all agents, Atlas orchestrates',
    icon: '🚀',
    color: 'indigo',
    agents: [
      { name: 'Atlas', role: 'orchestrator', builtinId: 'atlas' },
      { name: 'Iris', role: 'worker', builtinId: 'iris' },
      { name: 'Nova', role: 'worker', builtinId: 'nova' },
      { name: 'Echo', role: 'reviewer', builtinId: 'echo' },
    ],
  },
  'backend-dev': {
    name: 'Backend Dev Team',
    description: 'Spec-driven backend engineering — Architect leads, specialists build, QA reviews',
    icon: '⚙️',
    color: 'green',
    agents: [
      { name: 'Architect', role: 'orchestrator', builtinId: 'architect' },
      { name: 'Sys',       role: 'worker',       builtinId: 'sys' },
      { name: 'Api',       role: 'worker',       builtinId: 'api' },
      { name: 'Data',      role: 'worker',       builtinId: 'data' },
      { name: 'Scout',     role: 'worker',       builtinId: 'scout' },
      { name: 'QA',        role: 'reviewer',     builtinId: 'qa' },
    ],
  },
  frontend: {
    name: 'Frontend Team',
    description: 'UI implementation — Director leads, specialists build components, layouts, and interactions',
    icon: '🎨',
    color: 'purple',
    agents: [
      { name: 'Director',   role: 'orchestrator', builtinId: 'director' },
      { name: 'Component',  role: 'worker',       builtinId: 'component' },
      { name: 'Layout',     role: 'worker',       builtinId: 'layout' },
      { name: 'Interact',   role: 'worker',       builtinId: 'interact' },
      { name: 'Visualizer', role: 'worker',       builtinId: 'visualizer' },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/**
 * Strip <tool_call>...</tool_call> and <tool_result>...</tool_result> XML
 * from response text. NullClaw includes these in the text stream alongside
 * SSE tool events — they shouldn't leak into chat or history.
 *
 * @param {string} text
 * @returns {string}
 */
function stripToolCallXml(text) {
  if (!text) return text;
  // Remove <tool_call>...</tool_call> blocks (including multiline)
  let cleaned = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '');
  // Remove <tool_result>...</tool_result> blocks
  cleaned = cleaned.replace(/<tool_result>[\s\S]*?<\/tool_result>/gi, '');
  // Remove standalone <tool_call> tags without closing (truncated streams)
  cleaned = cleaned.replace(/<tool_call>[\s\S]*$/gi, '');
  // Collapse multiple blank lines left behind
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned.trim();
}

function safeParseJson(str) {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return { raw: str }; }
}
