#!/usr/bin/env node
/**
 * Mock MCP server for testing.
 * Responds to JSON-RPC 2.0 over stdin/stdout.
 * Supports: initialize, tools/list, tools/call
 */

import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, terminal: false });

const TOOLS = [
  { name: 'echo', description: 'Echoes back the input', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'add', description: 'Adds two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } },
  { name: 'slow', description: 'Never responds (for timeout testing)', inputSchema: { type: 'object', properties: {} } },
  { name: 'error-tool', description: 'Always returns an error', inputSchema: { type: 'object', properties: { message: { type: 'string' } } } },
];

function respond(id, result) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(msg + '\n');
}

function respondError(id, code, message) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(msg + '\n');
}

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line.trim());
  } catch {
    return;
  }

  // Notifications (no id) — just acknowledge silently
  if (msg.id == null) return;

  switch (msg.method) {
    case 'initialize':
      respond(msg.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mock-mcp', version: '1.0.0' },
      });
      break;

    case 'tools/list':
      respond(msg.id, { tools: TOOLS });
      break;

    case 'tools/call': {
      const { name, arguments: args } = msg.params || {};
      if (name === 'echo') {
        respond(msg.id, { content: [{ type: 'text', text: args?.text || '' }] });
      } else if (name === 'add') {
        respond(msg.id, { content: [{ type: 'text', text: String((args?.a || 0) + (args?.b || 0)) }] });
      } else if (name === 'slow') {
        // Don't respond — used for timeout testing
      } else if (name === 'error-tool') {
        respondError(msg.id, -32000, args?.message || 'Tool error');
      } else {
        respondError(msg.id, -32601, `Unknown tool: ${name}`);
      }
      break;
    }

    default:
      respondError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
});

// Handle exit signals gracefully
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
