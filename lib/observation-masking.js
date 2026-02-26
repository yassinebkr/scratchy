/**
 * @module lib/observation-masking
 * Hide old tool results from the conversation history to reduce context window usage.
 * Preserves tool calls (what was requested) and reasoning chains.
 */

/**
 * Generate a brief summary of a tool result for the masked placeholder.
 * @param {Object} msg - The tool result message
 * @returns {string}
 */
function summarizeToolResult(msg) {
  const content = typeof msg.content === 'string'
    ? msg.content
    : JSON.stringify(msg.content);

  // Truncate to first line or 80 chars
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length <= 80) return firstLine;
  return firstLine.slice(0, 77) + '...';
}

/**
 * Determine if a message is a tool result.
 * @param {Object} msg
 * @returns {boolean}
 */
function isToolResult(msg) {
  return msg.role === 'tool';
}

/**
 * Determine if a message contains tool calls.
 * @param {Object} msg
 * @returns {boolean}
 */
function hasToolCalls(msg) {
  return msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
}

/**
 * Count "turns" in a message array. A turn is a user message.
 * @param {Array} messages
 * @returns {number}
 */
function countTurns(messages) {
  return messages.filter(m => m.role === 'user').length;
}

/**
 * Apply observation masking to a conversation history.
 * Hides tool result content from old turns while preserving:
 * - The tool call (what was requested)
 * - The reasoning chain (assistant thinking/content)
 * - A brief summary of the result
 *
 * Only masks tool results older than `keepRecent` turns.
 *
 * @param {Array} messages - Conversation messages (OpenAI format)
 * @param {Object} [opts]
 * @param {number} [opts.keepRecent=10] - Keep this many recent user turns unmasked
 * @returns {Array} - Masked messages (same format, some tool results replaced)
 */
export function maskObservations(messages, opts = {}) {
  const { keepRecent = 10 } = opts;

  if (!messages || messages.length === 0) return [];

  const totalTurns = countTurns(messages);

  // If we have fewer turns than threshold, nothing to mask
  if (totalTurns <= keepRecent) {
    return messages.map(m => ({ ...m }));
  }

  const cutoffTurn = totalTurns - keepRecent;
  let turnsSeen = 0;
  const result = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      turnsSeen++;
    }

    if (isToolResult(msg) && turnsSeen <= cutoffTurn) {
      // Mask this tool result
      const summary = summarizeToolResult(msg);
      result.push({
        ...msg,
        content: `[Tool result masked — ${summary}]`,
      });
    } else {
      // Keep message as-is (shallow copy)
      result.push({ ...msg });
    }
  }

  return result;
}
