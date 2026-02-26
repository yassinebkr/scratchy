/**
 * @module lib/compaction
 * Progressive 4-phase compaction pipeline for context window management.
 *
 * Phase 1: Mask old tool results (observation masking) — saves ~11%
 * Phase 2: Summarize old turns — saves ~40%
 * Phase 3: Extract facts to memory, drop old turns — saves ~30%
 * Phase 4: Core prompt + recent turns + recalled memories only
 */

import { maskObservations } from './observation-masking.js';

/**
 * Estimate token count for a message array.
 * Rough heuristic: count words × 1.3 (accounts for subword tokenization).
 * More accurate than chars/4 for mixed content.
 *
 * @param {Array|string} input - Message array or string
 * @returns {number} Estimated token count
 */
export function estimateTokens(input) {
  let text;
  if (typeof input === 'string') {
    text = input;
  } else if (Array.isArray(input)) {
    text = input.map(m => {
      if (typeof m === 'string') return m;
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content.map(c => {
          if (typeof c === 'string') return c;
          if (c.text) return c.text;
          return '';
        }).join(' ');
      }
      // Tool calls
      if (m.tool_calls) {
        return m.tool_calls.map(tc =>
          `${tc.function?.name || ''} ${tc.function?.arguments || ''}`
        ).join(' ');
      }
      return JSON.stringify(m.content || '');
    }).join(' ');
  } else {
    return 0;
  }

  // Count words and multiply by 1.3
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

/**
 * Determine which compaction phase is needed.
 * @param {number} currentTokens
 * @param {number} maxTokens
 * @returns {number} Phase 0 (no compaction needed) through 4
 */
function determinePhase(currentTokens, maxTokens) {
  const ratio = currentTokens / maxTokens;
  if (ratio < 0.7) return 0;  // Plenty of room
  if (ratio < 0.85) return 1; // Mask observations
  if (ratio < 0.95) return 2; // Summarize old turns
  if (ratio < 1.05) return 3; // Extract & drop
  return 4;                    // Emergency: core only
}

/**
 * Phase 2: Summarize old turns into a compact summary.
 * Keeps the last `keepRecent` turns verbatim, summarizes earlier ones.
 *
 * @param {Array} messages
 * @param {Object} opts
 * @param {Function} opts.llmCall - async (systemPrompt, userPrompt) => string
 * @param {number} [opts.keepRecent=6]
 * @returns {Promise<Array>}
 */
async function summarizeOldTurns(messages, opts) {
  const { llmCall, keepRecent = 6 } = opts;

  // Find the split point: keep last N user turns
  let turnCount = 0;
  let splitIdx = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      turnCount++;
      if (turnCount >= keepRecent) {
        splitIdx = i;
        break;
      }
    }
  }

  if (splitIdx <= 1) return messages; // Nothing old enough to summarize

  const oldMessages = messages.slice(0, splitIdx);
  const recentMessages = messages.slice(splitIdx);

  // Build a text representation of old messages for summarization
  const oldText = oldMessages
    .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.tool_calls))
    .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : '[complex]'}`)
    .join('\n');

  if (!oldText.trim()) return messages;

  const summary = await llmCall(
    'Summarize this conversation history into key points. Be concise. Preserve important facts, decisions, and context. Output plain text, no markdown.',
    oldText
  );

  // Replace old messages with a single summary message
  return [
    { role: 'system', content: `[Conversation summary]\n${summary}` },
    ...recentMessages,
  ];
}

/**
 * Phase 3: Extract remaining facts to memory, then drop old turn content.
 *
 * @param {Array} messages
 * @param {Object} opts
 * @param {Function} opts.extractMemories
 * @param {number} [opts.keepRecent=3]
 * @returns {Promise<Array>}
 */
async function extractAndDrop(messages, opts) {
  const { extractMemories, keepRecent = 3 } = opts;

  // Find user-assistant pairs in old section
  let turnCount = 0;
  let splitIdx = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      turnCount++;
      if (turnCount >= keepRecent) {
        splitIdx = i;
        break;
      }
    }
  }

  if (splitIdx <= 0) return messages;

  const oldMessages = messages.slice(0, splitIdx);
  const recentMessages = messages.slice(splitIdx);

  // Extract facts from old user-assistant pairs
  if (extractMemories) {
    for (let i = 0; i < oldMessages.length; i++) {
      if (oldMessages[i].role === 'user' && i + 1 < oldMessages.length && oldMessages[i + 1].role === 'assistant') {
        const userMsg = typeof oldMessages[i].content === 'string' ? oldMessages[i].content : '';
        const assistantMsg = typeof oldMessages[i + 1].content === 'string' ? oldMessages[i + 1].content : '';
        if (userMsg && assistantMsg) {
          try {
            await extractMemories(userMsg, assistantMsg);
          } catch {
            // Non-fatal: extraction failure shouldn't break compaction
          }
        }
      }
    }
  }

  // Keep only system messages from old section
  const systemMsgs = oldMessages.filter(m => m.role === 'system');
  return [...systemMsgs, ...recentMessages];
}

/**
 * Phase 4: Emergency — core prompt + last few turns + recalled memories.
 *
 * @param {Array} messages
 * @param {Object} opts
 * @param {Function} [opts.searchMemory]
 * @param {string} [opts.userId]
 * @param {string} [opts.agentId]
 * @returns {Promise<Array>}
 */
async function coreOnly(messages, opts) {
  const { searchMemory, userId } = opts;

  // Keep only system messages and last 2 user-assistant pairs
  const systemMsgs = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  // Keep last 4 non-system messages (roughly 2 turns)
  const recent = nonSystem.slice(-4);

  // Recall relevant memories if available
  let memoryContext = [];
  if (searchMemory && userId && recent.length > 0) {
    const lastUserMsg = recent.filter(m => m.role === 'user').pop();
    if (lastUserMsg) {
      try {
        const query = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '';
        if (query) {
          const memories = await searchMemory(query);
          if (memories.length > 0) {
            const memText = memories.map(m => `- ${m.content}`).join('\n');
            memoryContext = [
              { role: 'system', content: `[Recalled memories]\n${memText}` },
            ];
          }
        }
      } catch {
        // Non-fatal
      }
    }
  }

  return [...systemMsgs, ...memoryContext, ...recent];
}

/**
 * Progressive compaction pipeline.
 * Applied when context approaches the window limit.
 *
 * @param {Array} messages - Full conversation history
 * @param {Object} opts
 * @param {number} opts.maxTokens - Target context window size
 * @param {number} [opts.currentTokens] - Approximate current token count (computed if omitted)
 * @param {Function} [opts.llmCall] - For summarization (Phase 2)
 * @param {Function} [opts.extractMemories] - For fact extraction (Phase 3)
 * @param {Function} [opts.searchMemory] - For memory recall (Phase 4)
 * @param {string} [opts.userId]
 * @param {string} [opts.agentId]
 * @returns {Promise<{messages: Array, phase: number, tokensSaved: number}>}
 */
export async function compact(messages, opts) {
  const { maxTokens } = opts;
  const currentTokens = opts.currentTokens ?? estimateTokens(messages);

  const phase = determinePhase(currentTokens, maxTokens);

  if (phase === 0) {
    return { messages: [...messages], phase: 0, tokensSaved: 0 };
  }

  let result = messages;
  let appliedPhase = 0;

  // Phase 1: Mask observations
  if (phase >= 1) {
    result = maskObservations(result, { keepRecent: 10 });
    appliedPhase = 1;
    const afterTokens = estimateTokens(result);
    if (afterTokens / maxTokens < 0.85) {
      return { messages: result, phase: 1, tokensSaved: currentTokens - afterTokens };
    }
  }

  // Phase 2: Summarize old turns
  if (phase >= 2 && opts.llmCall) {
    result = await summarizeOldTurns(result, {
      llmCall: opts.llmCall,
      keepRecent: 6,
    });
    appliedPhase = 2;
    const afterTokens = estimateTokens(result);
    if (afterTokens / maxTokens < 0.9) {
      return { messages: result, phase: 2, tokensSaved: currentTokens - afterTokens };
    }
  }

  // Phase 3: Extract and drop
  if (phase >= 3) {
    result = await extractAndDrop(result, {
      extractMemories: opts.extractMemories,
      keepRecent: 3,
    });
    appliedPhase = 3;
    const afterTokens = estimateTokens(result);
    if (afterTokens / maxTokens < 0.95) {
      return { messages: result, phase: 3, tokensSaved: currentTokens - afterTokens };
    }
  }

  // Phase 4: Core only
  if (phase >= 4) {
    result = await coreOnly(result, {
      searchMemory: opts.searchMemory,
      userId: opts.userId,
      agentId: opts.agentId,
    });
    appliedPhase = 4;
  }

  const finalTokens = estimateTokens(result);
  return { messages: result, phase: appliedPhase, tokensSaved: currentTokens - finalTokens };
}
