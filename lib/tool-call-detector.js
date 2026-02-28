/**
 * @module lib/tool-call-detector
 * Detects tool call patterns in NullClaw streaming output.
 *
 * NullClaw outputs tool calls in these formats during streaming:
 *
 * 1. Primary (NullClaw streaming): <tool_call>{"name":"shell","arguments":{"command":"ls"}}</tool_call>
 *    When streaming is enabled, NullClaw disables native tool calls and forces
 *    the LLM to emit XML-wrapped JSON. The JSON inside contains "name" and "arguments".
 *
 * 2. Legacy XML: <tool_use><name>exec</name><arguments>{"command":"ls"}</arguments></tool_use>
 *    Some LLMs use this nested-tag format.
 *
 * 3. JSON envelope: {"tool_call": {"name": "exec", "arguments": {"command": "ls"}}}
 *
 * The stream callback receives ALL text from every LLM iteration in the agent loop.
 * Between iterations (while NullClaw executes tools), the stream is silent.
 * Tool results appear only in NullClaw's internal history, not in the stream.
 *
 * This module provides a stateful detector that accumulates streaming text
 * and emits tool call events when complete tool calls are detected.
 */

/**
 * Create a streaming tool call detector.
 * Accumulates text chunks and detects tool call boundaries.
 *
 * @param {Object} opts
 * @param {(toolCall: {name: string, args: Object, id?: string}) => void} opts.onToolCall
 * @param {(toolResult: {name: string, result: string, id?: string}) => void} [opts.onToolResult]
 * @returns {{ feed(chunk: string): void, flush(): void }}
 */
export function createToolCallDetector({ onToolCall, onToolResult }) {
  let buffer = '';

  // ── Primary pattern: NullClaw streaming format ──
  // <tool_call>{"name":"shell","arguments":{"command":"ls -la"}}</tool_call>
  // The JSON inside may span multiple lines and contain nested braces.
  // We match the outer tags and parse the inner JSON.
  const ncToolCallRe = /<tool_call>([\s\S]*?)<\/tool_call>/g;

  // ── Legacy pattern: nested XML tags (some LLMs) ──
  // <tool_use><name>exec</name><arguments>{...}</arguments></tool_use>
  const xmlToolUseRe = /<tool_use[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<(?:arguments|input)>([\s\S]*?)<\/(?:arguments|input)>[\s\S]*?<\/tool_use>/g;

  // ── JSON envelope format ──
  const jsonToolCallRe = /\{"tool_call"\s*:\s*\{"name"\s*:\s*"([^"]+)"[^}]*"arguments"\s*:\s*(\{[^}]*\})/g;

  // ── Tool result (from NullClaw history injection — rare in stream) ──
  const xmlToolResultRe = /<tool_result[^>]*\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_result>/g;

  /**
   * Try to parse a NullClaw-style tool call JSON blob.
   * Handles: {"name":"shell","arguments":{"command":"ls"}}
   * Also handles string-encoded arguments.
   * @param {string} jsonStr
   * @returns {{name: string, args: Object}|null}
   */
  function parseToolCallJson(jsonStr) {
    try {
      const obj = JSON.parse(jsonStr.trim());
      const name = obj.name;
      if (!name || typeof name !== 'string') return null;
      let args = obj.arguments || obj.args || {};
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = { raw: args }; }
      }
      return { name, args };
    } catch {
      return null;
    }
  }

  return {
    /**
     * Feed a new chunk of streaming text.
     * @param {string} chunk
     */
    feed(chunk) {
      buffer += chunk;

      let match;

      // ── NullClaw primary format: <tool_call>{JSON}</tool_call> ──
      ncToolCallRe.lastIndex = 0;
      while ((match = ncToolCallRe.exec(buffer)) !== null) {
        const parsed = parseToolCallJson(match[1]);
        if (parsed) {
          onToolCall({ name: parsed.name, args: parsed.args, id: `tc-${Date.now()}` });
        }
        buffer = buffer.slice(0, match.index) + buffer.slice(match.index + match[0].length);
        ncToolCallRe.lastIndex = 0;
      }

      // ── Legacy XML: <tool_use>...<name>...<arguments>...</tool_use> ──
      xmlToolUseRe.lastIndex = 0;
      while ((match = xmlToolUseRe.exec(buffer)) !== null) {
        const name = match[1].trim();
        let args = {};
        try { args = JSON.parse(match[2].trim()); } catch { args = { raw: match[2].trim() }; }
        onToolCall({ name, args, id: `tc-${Date.now()}` });
        buffer = buffer.slice(0, match.index) + buffer.slice(match.index + match[0].length);
        xmlToolUseRe.lastIndex = 0;
      }

      // ── JSON envelope: {"tool_call": {"name": "...", ...}} ──
      jsonToolCallRe.lastIndex = 0;
      while ((match = jsonToolCallRe.exec(buffer)) !== null) {
        const name = match[1];
        let args = {};
        try { args = JSON.parse(match[2]); } catch { args = { raw: match[2] }; }
        onToolCall({ name, args, id: `tc-${Date.now()}` });
        buffer = buffer.slice(0, match.index) + buffer.slice(match.index + match[0].length);
        jsonToolCallRe.lastIndex = 0;
      }

      // ── Tool results (NullClaw format: <tool_result name="..." status="ok">output</tool_result>) ──
      if (onToolResult) {
        xmlToolResultRe.lastIndex = 0;
        while ((match = xmlToolResultRe.exec(buffer)) !== null) {
          const name = match[1].trim();
          const result = match[2].trim();
          onToolResult({ name, result, id: `tr-${Date.now()}` });
          buffer = buffer.slice(0, match.index) + buffer.slice(match.index + match[0].length);
          xmlToolResultRe.lastIndex = 0;
        }
      }

      // Keep buffer trimmed — only keep last 4KB for matching
      // (tool call JSON can be large — e.g. file_write with content)
      if (buffer.length > 8192) {
        buffer = buffer.slice(-4096);
      }
    },

    /** Flush remaining buffer (call at stream end). */
    flush() {
      buffer = '';
    },
  };
}
