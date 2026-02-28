// OSS stub — no MCP integration
export class McpRegistry {
  async activateAgent() { return { agentId: null, tools: [] }; }
  async deactivateAgent() {}
  getAvailableTools() { return []; }
  getPids() { return []; }
  isActive() { return false; }
  async callTool() { return null; }
  async shutdownAll() {}
}
