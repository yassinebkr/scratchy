/**
 * @module lib/team-router
 * Team-aware message routing — inter-agent delegation engine.
 *
 * When a user sends a message to a team (instead of a single agent),
 * the team router:
 *   1. Resolves the team's orchestrator agent
 *   2. Builds a team-aware system prompt with agent descriptions
 *   3. Injects a `delegate` tool that routes subtasks to worker agents
 *   4. Streams orchestrator output + worker results to the client
 *   5. Aggregates shared team memory into context
 *
 * Architecture:
 *   routeTeamMessage(userId, teamId, message, ws, deps)
 *     → orchestrator NullClaw instance with delegate tool
 *       → delegate("atlas", "write the API") → worker NullClaw instance
 *       → delegate("iris", "design the UI")  → worker NullClaw instance
 *     → orchestrator synthesizes final response
 *     → all intermediate WS events tagged with agentId for client rendering
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
const DELEGATION_TIMEOUT_MS = 120_000; // 2 min

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

  // ── Delegation instructions ──
  parts.push('[How to delegate]');
  parts.push('To delegate a subtask, use the `http_request` tool to POST to the internal delegation endpoint:');
  parts.push('');
  parts.push('  URL: http://127.0.0.1:3002/api/internal/team-delegate');
  parts.push('  Method: POST');
  parts.push('  Body (JSON):');
  parts.push(`  {`);
  parts.push(`    "userId": "${userId || 'YOUR_USER_ID'}",`);
  parts.push(`    "teamId": "${team.id}",`);
  parts.push('    "agentId": "<agent ID from roster>",');
  parts.push('    "task": "<clear description of the subtask>",');
  parts.push('    "context": "<optional additional context>"');
  parts.push('  }');
  parts.push('');
  parts.push('The response contains the worker agent output. You can delegate multiple times in sequence or parallel.');
  parts.push('');
  parts.push('Guidelines:');
  parts.push('- **Conversation vs Task**: Not every message is a task. If the user is asking a question, discussing ideas, or chatting — just respond conversationally. Only decompose and delegate when there is an actual task to execute.');
  parts.push('- For actionable tasks: break into subtasks for specialized agents');
  parts.push('- Delegate to the agent best suited for each subtask');
  parts.push('- You can delegate to multiple agents (they run in parallel)');
  parts.push('- **Keep going.** After receiving delegation results, if there are more steps in your plan — execute them immediately by delegating again. Do NOT stop to ask the user for permission to continue. Complete the entire task in one go.');
  parts.push('- Only produce your final synthesis after ALL steps are done');
  parts.push('- For simple tasks or questions, answer directly without delegating');
  parts.push('- If a reviewer agent exists, route final output through them for QA');
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
function createDelegationExecutor({ userId, teamId, team, adapter, ws, sendJson, depth = 0 }) {
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

        // ── Route to worker's NullClaw instance ──
        const adapterKey = `${userId}:${agentId}`;
        let workerResponse = '';

        // Stream worker output to client with agentId tag
        const workerChunks = [];

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Delegation timeout')), DELEGATION_TIMEOUT_MS)
        );

        const routePromise = adapter.routeMessageStreaming(
          adapterKey,
          workerPrompt,
          (chunk) => {
            workerChunks.push(chunk);
            // Stream worker output to client so user sees progress
            sendJson(ws, {
              type: 'team-worker-stream',
              delta: chunk,
              agentId,
              agentName,
              teamId,
              ts: Date.now(),
            });
          },
          undefined, // sessionKey
          (evt) => {
            // Forward tool events from worker with team context
            if (evt.type === 'tool_call_start') {
              sendJson(ws, {
                type: 'tool_call',
                tool: evt.name,
                args: safeParseJson(evt.arguments),
                agentId,
                agentName,
                teamId,
                ts: Date.now(),
              });
            } else if (evt.type === 'tool_call_result') {
              sendJson(ws, {
                type: 'tool_result',
                tool: evt.name,
                result: { content: evt.output, success: evt.success },
                agentId,
                agentName,
                teamId,
                ts: Date.now(),
              });
            }
          }
        );

        workerResponse = await Promise.race([routePromise, timeoutPromise]);

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
  parts.push(`Focus on your assigned task and provide a clear, complete response.\n`);

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
    });

    // ── Route to orchestrator's NullClaw instance ──
    // The orchestrator runs through the same adapter pool but with
    // the delegate tool available via NullClaw's http_request tool
    // calling back to our internal endpoint.
    //
    // For now, we inject the delegate tool description into the prompt
    // and handle delegate calls through NullClaw's tool event callback.
    // The actual delegation happens when we intercept the tool call.
    const adapterKey = `${userId}:${orchestratorAgentId}`;
    let response = '';

    // ── Stream filter for clean client output ──
    const { _createStreamFilter } = await import('../server/agent-orchestrator.js').catch(() => ({ _createStreamFilter: null }));

    // Collect tool calls for delegation interception
    const pendingDelegations = [];

    response = await adapter.routeMessageStreaming(
      adapterKey,
      augmentedPrompt,
      // onChunk
      (chunk) => {
        sendJson(ws, {
          type: 'chat-stream',
          delta: chunk,
          agentId: orchestratorAgentId,
          agentName: orchestratorAssignment.agentName,
          teamId,
          ts: Date.now(),
        });
      },
      undefined, // sessionKey
      // onToolEvent — intercept delegate calls
      async (evt) => {
        if (evt.type === 'tool_call_start' && evt.name === 'delegate') {
          const args = safeParseJson(evt.arguments);
          sendJson(ws, {
            type: 'tool_call',
            tool: 'delegate',
            args,
            agentId: orchestratorAgentId,
            teamId,
            ts: Date.now(),
          });
        } else if (evt.type === 'tool_call_start' && evt.name === 'team_memory_save') {
          const args = safeParseJson(evt.arguments);
          sendJson(ws, {
            type: 'tool_call',
            tool: 'team_memory_save',
            args,
            agentId: orchestratorAgentId,
            teamId,
            ts: Date.now(),
          });
        } else if (evt.type === 'tool_call_start') {
          // Regular tool call from orchestrator
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

    // ── End stream ──
    sendJson(ws, { type: 'chat-stream-end', agentId: orchestratorAgentId, teamId, ts: Date.now() });
    sendJson(ws, { type: 'typing', status: 'stop', agentId: orchestratorAgentId, teamId, ts: Date.now() });

    // ── GenUI extraction ──
    if (response && parseGenUIResponse) {
      const { text: cleanText, ops, hasOps } = parseGenUIResponse(response);
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

        response = cleanText;
      }
    }

    // ── Persist response ──
    if (response) {
      appendHistory(userId, historyKey, 'assistant', response, `team:${team.name}`);
    }

    // ── Notify client complete ──
    sendJson(ws, {
      type: 'team-message-end',
      teamId,
      teamName: team.name,
      ts: Date.now(),
    });

    return response;

  } catch (err) {
    sendJson(ws, { type: 'typing', status: 'stop', agentId: orchestratorAgentId, teamId, ts: Date.now() });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/*  Internal MCP bridge for delegation                                */
/* ------------------------------------------------------------------ */

/**
 * Handle a delegation request from NullClaw's http_request tool.
 * Called from the /api/internal/team-delegate endpoint.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.teamId
 * @param {string} opts.agentId — target worker agent
 * @param {string} opts.task
 * @param {string} [opts.context]
 * @param {import('../lib/nullclaw-adapter.js').NullClawAdapter} opts.adapter
 * @param {import('ws').WebSocket|null} opts.ws — for streaming (may be null for sync)
 * @param {Function} opts.sendJson
 * @returns {Promise<{ content: string, isError?: boolean }>}
 */
export async function handleDelegation(opts) {
  const { userId, teamId, agentId, task, context, adapter, ws, sendJson: sj } = opts;

  const team = teamsState.getTeam(teamId);
  if (!team) return { content: 'Team not found', isError: true };

  // Verify the agent is in the team
  const agentInfo = team.agents.find(a => a.agentId === agentId);
  if (!agentInfo) return { content: `Agent ${agentId} not in team`, isError: true };
  if (agentInfo.role === 'orchestrator') {
    return { content: 'Cannot delegate to the orchestrator', isError: true };
  }

  const agentName = agentInfo.agentName || agentId;

  // Notify client
  if (ws && sj) {
    sj(ws, {
      type: 'team-delegation',
      status: 'start',
      teamId,
      toAgent: agentId,
      toAgentName: agentName,
      task: task.slice(0, 200),
      ts: Date.now(),
    });
  }

  try {
    const workerPrompt = buildWorkerPrompt(agentInfo, task, context, team);
    const adapterKey = `${userId}:${agentId}`;

    let workerResponse = '';

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Delegation timeout')), DELEGATION_TIMEOUT_MS)
    );

    const routePromise = adapter.routeMessageStreaming(
      adapterKey,
      workerPrompt,
      (chunk) => {
        workerResponse; // already accumulated by adapter
        if (ws && sj) {
          sj(ws, {
            type: 'team-worker-stream',
            delta: chunk,
            agentId,
            agentName,
            teamId,
            ts: Date.now(),
          });
        }
      }
    );

    workerResponse = await Promise.race([routePromise, timeoutPromise]);

    if (ws && sj) {
      sj(ws, {
        type: 'team-delegation',
        status: 'complete',
        teamId,
        toAgent: agentId,
        toAgentName: agentName,
        ts: Date.now(),
      });
    }

    // Truncate for orchestrator context
    const max = 8000;
    const result = workerResponse.length > max
      ? workerResponse.slice(0, max) + '\n[truncated]'
      : workerResponse;

    return { content: result };
  } catch (err) {
    if (ws && sj) {
      sj(ws, {
        type: 'team-delegation',
        status: 'error',
        teamId,
        toAgent: agentId,
        error: err.message,
        ts: Date.now(),
      });
    }
    return { content: `Delegation failed: ${err.message}`, isError: true };
  }
}

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

function safeParseJson(str) {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return { raw: str }; }
}
