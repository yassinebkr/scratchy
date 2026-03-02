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
const DELEGATION_TIMEOUT_MS = 120_000; // 2 min

/** Max multi-turn iterations for delegation loop. */
const MAX_DELEGATION_TURNS = 5;

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

  // ── Delegation instructions ──
  parts.push('[How to delegate]');
  parts.push('To delegate a subtask to a team agent, include one or more DELEGATE blocks in your response:');
  parts.push('');
  parts.push('```');
  parts.push('[DELEGATE to="<agent_id>" task="<clear description of the subtask>"]');
  parts.push('Optional additional context for the agent goes here.');
  parts.push('Multiple lines are fine.');
  parts.push('[/DELEGATE]');
  parts.push('```');
  parts.push('');
  parts.push('You can include multiple DELEGATE blocks — they run in parallel. After all delegations complete,');
  parts.push('you will receive their results and can continue working (delegate more or produce your final answer).');
  parts.push('');
  parts.push('Guidelines:');
  parts.push('- **Conversation vs Task**: Not every message is a task. If the user is asking a question, discussing ideas, or chatting — just respond conversationally. Only delegate when there is an actual task to execute.');
  parts.push('- For actionable tasks: break into subtasks for specialized agents');
  parts.push('- Delegate to the agent best suited for each subtask');
  parts.push('- **Keep going.** After receiving delegation results, if there are more steps — delegate again. Do NOT stop to ask the user for permission. Complete the entire task in one go.');
  parts.push('- Only produce your final synthesis after ALL steps are done');
  parts.push('- For simple tasks or questions, answer directly without delegating');
  parts.push('- If a reviewer agent exists, route final output through them for QA');
  parts.push('- NEVER use http_request for delegation — always use DELEGATE blocks');
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

        // ── Route to worker via shared NullClaw instance ──
        // Same instance as orchestrator, different session_key for isolation
        const instanceKey = userId;
        const workerSessionKey = `team:${teamId}:worker:${agentId}`;
        let workerResponse = '';

        // Stream worker output to client with agentId tag
        const workerChunks = [];

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Delegation timeout')), DELEGATION_TIMEOUT_MS)
        );

        const routePromise = adapter.routeMessageStreaming(
          instanceKey,
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
          workerSessionKey,
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

    for (let turn = 0; turn < MAX_DELEGATION_TURNS; turn++) {
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
        // onToolEvent — forward tool events (non-delegation tools like web_search, etc.)
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

      // ── Parse delegation blocks from response ──
      const { delegations, cleanText } = parseDelegationBlocks(response);

      // ── Handle team_memory_save if present in text (simple pattern) ──
      // (Orchestrator can also save team memory inline)

      if (delegations.length === 0) {
        // No delegations — this is the final response
        finalResponse = response;
        break;
      }

      // Stream the clean text portion to user (before delegation blocks)
      if (cleanText) {
        finalResponse = cleanText; // Keep accumulating non-delegation text
      }

      // ── Execute delegations in parallel ──
      console.log(`[team-router] Turn ${turn}: ${delegations.length} delegation(s) to execute`);

      sendJson(ws, {
        type: 'team-delegations-start',
        teamId,
        count: delegations.length,
        agents: delegations.map(d => d.agentId),
        ts: Date.now(),
      });

      const delegationResults = await Promise.all(
        delegations.map(async (d) => {
          const result = await delegationExecutor.executeTool('delegate', {
            agentId: d.agentId,
            task: d.task,
            context: d.context,
          });
          const agentInfo = team.agents.find(a => a.agentId === d.agentId);
          return {
            agentId: d.agentId,
            agentName: agentInfo?.agentName || d.agentId,
            result: result.content,
            isError: !!result.isError,
          };
        })
      );

      sendJson(ws, {
        type: 'team-delegations-end',
        teamId,
        count: delegationResults.length,
        errors: delegationResults.filter(r => r.isError).length,
        ts: Date.now(),
      });

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

    // ── Persist response ──
    if (finalResponse) {
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
    const instanceKey = userId;
    const workerSessionKey = `team:${teamId}:worker:${agentId}`;

    let workerResponse = '';

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Delegation timeout')), DELEGATION_TIMEOUT_MS)
    );

    const routePromise = adapter.routeMessageStreaming(
      instanceKey,
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
      },
      workerSessionKey,
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
