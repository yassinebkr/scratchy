/**
 * @module lib/builtin-tools
 * Built-in tool definitions and executors for Scratchy v2 agents.
 *
 * These tools are available to all agents without requiring external MCP servers.
 * The executor handles tool calls from the LLM and returns results.
 *
 * Implements the same shape that mcp-registry.js consumers expect:
 *   getTools()  → Array<{ name, description, inputSchema }>
 *   executeTool(name, args, userId) → Promise<{ content, isError? }>
 */

import { serializeEmbedding } from './embeddings.js';

/**
 * Tool definitions in MCP-compatible format.
 * Each tool has: name, description, inputSchema (JSON Schema)
 */
export const BUILTIN_TOOLS = [
  {
    name: 'memory_search',
    description:
      'Search your semantic memory for relevant past conversations, facts, and context. Use when you need to recall something discussed before.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for memory lookup' },
        limit: { type: 'number', description: 'Max results (default 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_save',
    description:
      'Save an important fact, preference, or piece of context to long-term memory.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The information to remember' },
        category: {
          type: 'string',
          description: 'Category: fact, preference, context, task',
          enum: ['fact', 'preference', 'context', 'task'],
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'context_search',
    description: 'Search indexed documents and knowledge base for relevant information.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_search',
    description:
      'Search the web for current information. Returns titles, URLs, and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Web search query' },
        count: { type: 'number', description: 'Number of results (1-10)', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: 'Fetch and extract readable content from a URL. Returns markdown text.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        maxChars: {
          type: 'number',
          description: 'Max characters to return',
          default: 5000,
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'get_current_time',
    description: 'Get the current date and time.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'canvas_clear',
    description: 'Clear all components from the visual canvas.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'open_webapp',
    description: 'Open a web application in the workspace canvas as an embedded iframe. Use for tools like Excalidraw, CodeSandbox, Cal.com, or any web app the user wants to work with alongside chat.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL of the web app to embed (must be https)' },
        title: { type: 'string', description: 'Display title for the webapp panel' },
      },
      required: ['url'],
    },
  },
];

/**
 * Create a tool executor bound to the given dependencies.
 *
 * @param {Object} deps
 * @param {Object} deps.embedder — embedding provider from embeddings.js
 * @param {Object} deps.memory — state/memory module (uses .store() and .search())
 * @param {Object} deps.contextIndex — state/context-index module
 * @param {Function} deps.searchContext — from context-search.js
 * @param {Function} deps.searchMemory — from context-search.js
 * @param {Function} deps.formatResultsAsToon — from context-search.js
 * @returns {Object} executor with { getTools(), executeTool(name, args, userId) }
 */
export function createToolExecutor(deps) {
  return {
    getTools() {
      return BUILTIN_TOOLS;
    },

    /**
     * Execute a tool call and return the result.
     * @param {string} name — tool name
     * @param {Object} args — tool arguments
     * @param {string} userId — calling user
     * @returns {Promise<{ content: string, isError?: boolean }>}
     */
    async executeTool(name, args, userId) {
      switch (name) {
        case 'memory_search': {
          const results = await deps.searchMemory(args.query, {
            embedder: deps.embedder,
            memory: deps.memory,
            userId,
            topK: args.limit || 5,
            minScore: 0.3,
          });
          if (results.length === 0) return { content: 'No relevant memories found.' };
          return {
            content: deps.formatResultsAsToon(results, { label: 'memories' }),
          };
        }

        case 'memory_save': {
          // Embed the content so future semantic searches can find it
          let embeddingBuf = null;
          try {
            const vec = await deps.embedder.embed(args.content);
            embeddingBuf = serializeEmbedding(vec);
          } catch (err) {
            console.warn('[builtin-tools] Failed to embed memory content:', err.message);
          }

          // Map the tool category to the memory store's category vocabulary.
          // memory.store accepts any string category; the extraction pipeline
          // uses episodic/semantic/procedural, but user-facing tools use
          // fact/preference/context/task which are equally valid.
          const category = args.category || 'semantic';

          // state/memory.store(userId, content, opts)
          deps.memory.store(userId, args.content, {
            source: 'user-tool',
            category,
            tags: [],
            confidence: 1.0,
            embedding: embeddingBuf,
          });

          const preview = args.content.length > 100
            ? args.content.slice(0, 100) + '...'
            : args.content;
          return { content: `Saved to memory: "${preview}"` };
        }

        case 'context_search': {
          const results = await deps.searchContext(args.query, {
            embedder: deps.embedder,
            contextIndex: deps.contextIndex,
            topK: args.limit || 5,
            minScore: 0.3,
          });
          if (results.length === 0) return { content: 'No relevant context found.' };
          return {
            content: deps.formatResultsAsToon(results, { label: 'context' }),
          };
        }

        case 'web_search': {
          // Placeholder — actual implementation depends on available search API
          return {
            content: `Web search for "${args.query}" — tool not yet connected to search API.`,
          };
        }

        case 'web_fetch': {
          try {
            const res = await fetch(args.url);
            const text = await res.text();
            const truncated = text.slice(0, args.maxChars || 5000);
            return { content: truncated };
          } catch (err) {
            return {
              content: `Failed to fetch ${args.url}: ${err.message}`,
              isError: true,
            };
          }
        }

        case 'get_current_time': {
          return { content: new Date().toISOString() };
        }

        case 'canvas_clear': {
          return {
            content: 'Canvas cleared. (Client will process the clear operation.)',
          };
        }

        case 'open_webapp': {
          const url = args.url;
          if (!url) return { content: 'Missing required parameter: url', isError: true };
          try {
            const parsed = new URL(url);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              return { content: 'Only http/https URLs are supported.', isError: true };
            }
          } catch {
            return { content: `Invalid URL: ${url}`, isError: true };
          }
          // Return a special marker — the orchestrator will send a WS event
          // to the client to actually open the webapp surface
          return {
            content: `Opening web app: ${args.title || url}`,
            _webapp: { url, title: args.title || null },
          };
        }

        default:
          return { content: `Unknown tool: ${name}`, isError: true };
      }
    },
  };
}
