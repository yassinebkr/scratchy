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
 *   5. Executes delegations server-side (parallel) via worker NullClaw instances
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

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

/** Max delegation depth (prevent infinite loops). */
const MAX_DELEGATION_DEPTH = 3;

/** Max concurrent delegations per team message. */
const MAX_CONCURRENT_DELEGATIONS = 4;

/** Timeout for a single delegation call (ms). */
const DELEGATION_TIMEOUT_MS = 300_000; // 5 min — workers generating full components need time

/** Max multi-turn iterations for delegation loop. */
const MAX_DELEGATION_TURNS = 3;

/** Overall timeout for the entire team routing operation (ms). */
const TEAM_ROUTING_TIMEOUT_MS = 600_000; // 10 min hard cap

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
  // Match [DELEGATE to="..." task="..."] ... [/DELEGATE]
  // Handles both quoted and unquoted attributes, multiline content
  const blockRegex = /\[DELEGATE\s+to=["']?([^"'\]\s]+)["']?\s+task=["']([^"']+)["']\s*\]([\s\S]*?)\[\/DELEGATE\]/gi;

  let cleanText = text;
  let match;

  while ((match = blockRegex.exec(text)) !== null) {
    delegations.push({
      agentId: match[1].trim(),
      task: match[2].trim(),
      context: match[3].trim(),
    });
  }

  // Remove delegation blocks from the text shown to user
  cleanText = text.replace(blockRegex, '').trim();

  // Also handle single-line format: [DELEGATE to="id" task="desc"/]
  const inlineRegex = /\[DELEGATE\s+to=["']?([^"'\]\s]+)["']?\s+task=["']([^"']+)["']\s*\/\]/gi;
  while ((match = inlineRegex.exec(text)) !== null) {
    delegations.push({
      agentId: match[1].trim(),
      task: match[2].trim(),
      context: '',
    });
  }
  cleanText = cleanText.replace(inlineRegex, '').trim();

  return { delegations, cleanText };
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
  parts.push('[DELEGATE to="<agent_id>" task="<clear description>"]');
  parts.push('Context the agent needs.');
  parts.push('[/DELEGATE]');
  parts.push('');
  parts.push('Multiple blocks run in parallel. After results come back, delegate more or synthesize.');
  parts.push('');
  parts.push('Rules:');
  parts.push('- Break tasks into subtasks for the best-suited agent');
  parts.push('- **Maximum 3-4 DELEGATE blocks per response.** If you need more, do them in batches across turns.');
  parts.push('- After receiving results, if more steps remain — delegate again immediately');
  parts.push('- Only produce your final synthesis after ALL steps are done');
  parts.push('- If a reviewer exists, route final output through them');
  parts.push('- NEVER use http_request or tool calls for delegation — ONLY [DELEGATE] blocks');
  parts.push('- NEVER write implementation (code, markup, styles) yourself — ALWAYS delegate it');
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
function createDelegationExecutor({ userId, teamId, team, adapter, ws, sendJson, depth = 0, parentSignal = null }) {
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
      return [DELEGATE_TOOL, TEAM_MEMORY_SAVE_TOOL];
    },

    async executeTool(name, args) {
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

      const { agentId, task, context } = args;
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

      try {
        // ── Build the worker prompt ──
        const workerPrompt = buildWorkerPrompt(agentInfo, task, context, team);
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
          // ── Route to worker via DEDICATED NullClaw instance ──
          // Workers use a separate instance key (userId:workers) so they
          // NEVER contend with the orchestrator's NullClaw instance.
          // session_key isolates each worker's conversation within that instance.
          const workerInstanceKey = `${userId}:workers`;
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

        // ── Notify client delegation complete ──
        sendJson(ws, {
          type: 'team-delegation',
          status: 'complete',
          teamId,
          fromAgent: 'orchestrator',
          toAgent: agentId,
          toAgentName: agentName,
          responseLength: workerResponse.length,
          ts: Date.now(),
        });

        // Truncate very long responses for the orchestrator's context
        const maxResponseLen = 8000;
        const truncated = workerResponse.length > maxResponseLen
          ? workerResponse.slice(0, maxResponseLen) + '\n\n[Response truncated — full output was sent to user]'
          : workerResponse;

        return {
          content: `[Response from ${agentName}]\n${truncated}`,
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
function buildWorkerPrompt(agentInfo, task, context, team) {
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
  parts.push(`Output your work as text in the response — use fenced code blocks for code.`);
  parts.push(`Do NOT write files or use shell commands — just provide the content directly.\n`);

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

  // ── Load team ──
  const team = teamsState.getTeam(teamId);
  if (!team) throw new Error(`Team ${teamId} not found`);

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
    });

    // ── Multi-turn delegation loop ──
    // The orchestrator may include [DELEGATE] blocks in its response.
    // We parse them, execute delegations server-side, send results back,
    // and loop until the response has no more delegations (or max turns).
    // Shared NullClaw instance per user — agents isolated via session_key
    const instanceKey = userId;
    const orchestratorSessionKey = `team:${teamId}:orchestrator`;
    let currentPrompt = augmentedPrompt;
    let response = '';
    let finalResponse = '';
    let enforcementUsed = false;

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
        ts: Date.now(),
      });

      response = await adapter.routeMessageStreaming(
        instanceKey,
        currentPrompt,
        // onChunk — stream text to client
        (chunk) => {
          sendJson(ws, {
            type: 'chat-stream',
            delta: chunk,
            agentId: orchestratorAgentId,
            agentName: orchestratorAssignment.agentName,
            teamId,
            turn,
            ts: Date.now(),
          });
        },
        orchestratorSessionKey,
        // onToolEvent — forward tool calls to client
        (evt) => {
          if (evt.type === 'tool_call_start') {
            sendJson(ws, {
              type: 'tool_call',
              tool: evt.name,
              args: safeParseJson(evt.arguments),
              agentId: orchestratorAgentId,
              teamId,
              ts: Date.now(),
            });
          } else if (evt.type === 'tool_call_result') {
            sendJson(ws, {
              type: 'tool_result',
              tool: evt.name,
              result: { content: evt.output, success: evt.success },
              agentId: orchestratorAgentId,
              teamId,
              ts: Date.now(),
            });
          }
        }
      );

      sendJson(ws, { type: 'chat-stream-end', agentId: orchestratorAgentId, teamId, turn, ts: Date.now() });

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

      if (delegations.length === 0) {
        // ── Enforcement: detect orchestrator doing work instead of delegating ──
        // If the response is long (implementation-like) with no delegation blocks,
        // re-prompt once to force delegation. Short conversational replies pass through.
        if (response.length > ENFORCEMENT_THRESHOLD_CHARS && turn === 0 && !enforcementUsed) {
          enforcementUsed = true;
          console.log(`[team-router] Enforcement: response ${response.length} chars with no delegations — re-prompting`);

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

      // ── Execute delegations SEQUENTIALLY ──
      // NullClaw is single-threaded — concurrent requests to the same instance
      // cause queueing + race conditions on destroy/respawn. Sequential execution
      // gives each worker the full timeout and avoids contention.
      console.log(`[team-router] Turn ${turn}: ${delegations.length} delegation(s) to execute sequentially`);

      sendJson(ws, {
        type: 'team-delegations-start',
        teamId,
        count: delegations.length,
        agents: delegations.map(d => d.agentId),
        ts: Date.now(),
      });

      const delegationResults = [];
      for (const d of delegations) {
        // Check overall timeout before starting next worker
        if (teamAbort.signal.aborted) {
          console.log(`[team-router] Overall timeout — skipping remaining delegations`);
          delegationResults.push({
            agentId: d.agentId,
            agentName: team.agents.find(a => a.agentId === d.agentId)?.agentName || d.agentId,
            result: 'Skipped — team routing timeout reached',
            isError: true,
          });
          continue;
        }

        const result = await delegationExecutor.executeTool('delegate', {
          agentId: d.agentId,
          task: d.task,
          context: d.context,
        });
        const agentInfo = team.agents.find(a => a.agentId === d.agentId);
        delegationResults.push({
          agentId: d.agentId,
          agentName: agentInfo?.agentName || d.agentId,
          result: result.content,
          isError: !!result.isError,
        });
      }

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

      // ── Build follow-up prompt with results ──
      currentPrompt = formatDelegationResults(delegationResults);
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
    if (finalResponse && response === finalResponse) {
      appendHistory(userId, historyKey, 'assistant', finalResponse, `team:${team.name}`);
    }

    // ── Notify client complete ──
    sendJson(ws, {
      type: 'team-message-end',
      teamId,
      teamName: team.name,
      ts: Date.now(),
    });

    return finalResponse;

  } catch (err) {
    sendJson(ws, { type: 'typing', status: 'stop', agentId: orchestratorAgentId, teamId, ts: Date.now() });
    throw err;
  } finally {
    clearTimeout(teamTimer);
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
