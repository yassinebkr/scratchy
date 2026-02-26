/**
 * @module lib/mcp-registry
 * Manages MCP server lifecycle per-agent.
 * When an agent activates, starts its configured MCP servers.
 * When it deactivates, stops them.
 */

import { McpClient } from './mcp-client.js';

/**
 * @typedef {Object} McpServerConfig
 * @property {string}  command — Shell command to spawn
 * @property {string[]} [args] — Additional arguments
 * @property {Record<string,string>} [env] — Extra environment variables
 * @property {number}  [timeout] — Timeout in ms
 * @property {string}  [name]   — Optional server name (for concurrency keying)
 */

/**
 * @typedef {Object} ActiveServer
 * @property {McpClient} client
 * @property {McpServerConfig} config
 * @property {Array<{name: string, description: string, inputSchema: Object}>} tools
 * @property {number|null} pid — PID of the child process
 */

export class McpRegistry {
  constructor() {
    /** @type {Map<string, ActiveServer[]>} agentId → active MCP server connections */
    this._agents = new Map();
    /** @type {Set<string>} concurrency guard — tracks in-progress activations */
    this._activating = new Set();
  }

  /**
   * Activate an agent — start all its configured MCP servers.
   * @param {Object} agentConfig — Agent object with id, mcpServers array
   * @returns {Promise<{agentId: string, tools: Array}>}
   */
  async activateAgent(agentConfig) {
    const { id: agentId, mcpServers = [] } = agentConfig;

    // Concurrency guard — prevent double-activation
    if (this._activating.has(agentId)) {
      throw new Error(`Agent ${agentId} is already being activated`);
    }
    this._activating.add(agentId);

    try {
      // Deactivate first if already active
      if (this._agents.has(agentId)) {
        await this.deactivateAgent(agentId);
      }

      if (!mcpServers || mcpServers.length === 0) {
        this._agents.set(agentId, []);
        return { agentId, tools: [] };
      }

      const activeServers = [];
      const allTools = [];

      for (const serverConfig of mcpServers) {
        const client = new McpClient({
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env,
          timeout: serverConfig.timeout,
        });

        try {
          await client.connect();
          const tools = await client.listTools();
          activeServers.push({
            client,
            config: serverConfig,
            tools,
            pid: client.pid,
          });
          allTools.push(...tools);
        } catch (err) {
          console.error(`[mcp-registry] Failed to start MCP server for agent ${agentId}:`, err.message);
          // Don't fail the whole activation — log and skip this server
          try { await client.disconnect(); } catch { /* ignore */ }
        }
      }

      this._agents.set(agentId, activeServers);
      return { agentId, tools: allTools };
    } finally {
      this._activating.delete(agentId);
    }
  }

  /**
   * Deactivate an agent — stop all its MCP servers.
   * @param {string} agentId
   */
  async deactivateAgent(agentId) {
    const servers = this._agents.get(agentId);
    if (!servers) return;

    for (const { client } of servers) {
      try {
        await client.disconnect();
      } catch (err) {
        console.error(`[mcp-registry] Error disconnecting MCP server for agent ${agentId}:`, err.message);
      }
    }

    this._agents.delete(agentId);
  }

  /**
   * Call a tool — routes to the correct MCP server for the given agent.
   * @param {string} agentId
   * @param {string} toolName
   * @param {Object} args
   * @returns {Promise<Object>} Tool result
   */
  async callTool(agentId, toolName, args = {}) {
    const servers = this._agents.get(agentId);
    if (!servers) {
      throw new Error(`No active MCP servers for agent ${agentId}`);
    }

    // Find which server has this tool
    for (const { client, tools } of servers) {
      if (tools.some(t => t.name === toolName)) {
        return await client.callTool(toolName, args);
      }
    }

    throw new Error(`Tool '${toolName}' not found for agent ${agentId}`);
  }

  /**
   * List all tools available for an agent (from all its active MCP servers).
   * @param {string} agentId
   * @returns {Array<{name: string, description: string, inputSchema: Object}>}
   */
  getAvailableTools(agentId) {
    const servers = this._agents.get(agentId);
    if (!servers) return [];
    return servers.flatMap(s => s.tools);
  }

  /**
   * Get PIDs of all running MCP server processes for an agent.
   * @param {string} agentId
   * @returns {Array<number|null>}
   */
  getPids(agentId) {
    const servers = this._agents.get(agentId);
    if (!servers) return [];
    return servers.map(s => s.client.pid);
  }

  /**
   * Check if an agent has active MCP servers.
   * @param {string} agentId
   * @returns {boolean}
   */
  isActive(agentId) {
    return this._agents.has(agentId);
  }

  /**
   * Check if an agent is currently being activated.
   * @param {string} agentId
   * @returns {boolean}
   */
  isActivating(agentId) {
    return this._activating.has(agentId);
  }

  /**
   * Shut down all MCP servers for all agents.
   */
  async shutdownAll() {
    const agentIds = [...this._agents.keys()];
    await Promise.all(agentIds.map(id => this.deactivateAgent(id)));
  }

  // ── Aliases for task-spec compatibility ──

  /** @see activateAgent */
  async startForAgent(agentConfig) {
    return this.activateAgent(agentConfig);
  }

  /** @see deactivateAgent */
  async stopForAgent(agentId) {
    return this.deactivateAgent(agentId);
  }

  /** @see getAvailableTools */
  getTools(agentId) {
    return this.getAvailableTools(agentId);
  }

  /** @see shutdownAll */
  async stopAll() {
    return this.shutdownAll();
  }
}
