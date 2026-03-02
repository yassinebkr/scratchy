/**
 * @module lib/direct-provider
 * Direct Anthropic API provider for team worker agents.
 *
 * Why this exists:
 *   NullClaw is single-threaded — it processes one /api/message at a time.
 *   When team workers are routed through NullClaw via Promise.all, they:
 *   1. Queue up (NullClaw can't parallelize)
 *   2. Race-condition on destroy/respawn when they timeout
 *   3. Use Opus (NullClaw ignores per-agent model settings)
 *
 *   Direct API calls bypass all of this:
 *   - TRUE parallelism (multiple concurrent fetch requests)
 *   - Configurable model per worker (default: Sonnet for speed)
 *   - No NullClaw contention or single-thread bottleneck
 *   - Workers just generate text — they don't need tools/sessions
 *
 * Usage:
 *   const provider = new DirectProvider({ apiKey, model });
 *   const text = await provider.chat(systemPrompt, userMessage, onChunk, signal);
 */

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 8192;
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export class DirectProvider {
  #apiKey;
  #model;
  #maxTokens;

  /**
   * @param {Object} opts
   * @param {string} opts.apiKey — Anthropic API key or OAuth token
   * @param {string} [opts.model] — model identifier (default: claude-sonnet-4-20250514)
   * @param {number} [opts.maxTokens] — max output tokens (default: 8192)
   */
  constructor({ apiKey, model, maxTokens }) {
    if (!apiKey) throw new Error('DirectProvider: apiKey is required');
    this.#apiKey = apiKey;
    this.#model = model || DEFAULT_MODEL;
    this.#maxTokens = maxTokens || DEFAULT_MAX_TOKENS;
  }

  get model() { return this.#model; }

  /**
   * Send a message to Anthropic and stream the response.
   *
   * @param {string} systemPrompt — system instructions for the worker
   * @param {string} userMessage — the task/message
   * @param {(chunk: string) => void} [onChunk] — called for each text delta
   * @param {AbortSignal} [signal] — optional abort signal
   * @returns {Promise<string>} — full accumulated response text
   */
  async chat(systemPrompt, userMessage, onChunk, signal) {
    const isOAuth = this.#apiKey.startsWith('sk-ant-oat');

    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': API_VERSION,
    };

    if (isOAuth) {
      // OAuth tokens: Bearer auth + beta headers (matches NullClaw's approach)
      headers['Authorization'] = `Bearer ${this.#apiKey}`;
      headers['anthropic-beta'] = 'oauth-2025-04-20';
      headers['User-Agent'] = 'claude-cli/2.1.2 (external, cli)';
    } else {
      headers['x-api-key'] = this.#apiKey;
    }

    const body = {
      model: this.#model,
      max_tokens: this.#maxTokens,
      stream: true,
      messages: [{ role: 'user', content: userMessage }],
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    // OAuth tokens need ?beta=true on the URL
    const url = isOAuth ? `${API_URL}?beta=true` : API_URL;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      let errBody;
      try { errBody = await res.json(); } catch { errBody = await res.text(); }
      const errMsg = typeof errBody === 'object'
        ? (errBody.error?.message || JSON.stringify(errBody))
        : String(errBody);
      throw new Error(`Anthropic API ${res.status}: ${errMsg}`);
    }

    // Parse SSE stream
    let fullText = '';
    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body stream');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        let eventEnd;
        while ((eventEnd = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          // Parse SSE lines
          let eventType = '';
          let data = '';
          for (const line of event.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            else if (line.startsWith('data: ')) data = line.slice(6);
          }

          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (eventType === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              if (onChunk) onChunk(parsed.delta.text);
            }

            if (eventType === 'error') {
              throw new Error(`Stream error: ${parsed.error?.message || data}`);
            }
          } catch (parseErr) {
            if (parseErr.message.startsWith('Stream error:')) throw parseErr;
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullText;
  }
}

/**
 * Create a DirectProvider from NullClaw config or environment.
 * Reads the API key from ~/.nullclaw/config.json.
 *
 * @param {Object} [opts]
 * @param {string} [opts.model] — override model
 * @returns {DirectProvider|null} — null if no API key found
 */
export function createDirectProviderFromConfig(opts = {}) {
  try {
    const { readFileSync } = await_import_fs();
    const { join } = await_import_path();
    const { homedir } = await_import_os();
    const configPath = join(homedir(), '.nullclaw', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const apiKey = config?.models?.providers?.anthropic?.api_key;
    if (!apiKey) return null;
    return new DirectProvider({ apiKey, model: opts.model });
  } catch {
    return null;
  }
}

// Lazy module imports (avoid top-level await)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
function await_import_fs() { return { readFileSync }; }
function await_import_path() { return { join }; }
function await_import_os() { return { homedir }; }

/**
 * Create a DirectProvider from a known API key.
 *
 * @param {string} apiKey
 * @param {string} [model]
 * @returns {DirectProvider}
 */
export function createDirectProvider(apiKey, model) {
  return new DirectProvider({ apiKey, model });
}
