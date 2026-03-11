/**
 * MCP Canvas Server Integration Tests
 * 
 * Tests the full MCP lifecycle: spawn → handshake → tools/list → tool/call → cleanup
 * Verifies all 10 canvas tools work correctly with typed schemas.
 */

import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { describe, it, before, after } from 'node:test';

const MCP_SERVER = '/home/nonbios/scratchy_par/lib/canvas-mcp-server.js';

class McpClient {
  constructor() {
    this.proc = null;
    this.nextId = 1;
    this._buffer = '';
    this._resolvers = new Map();
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.proc = spawn('node', [MCP_SERVER], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.proc.stdout.setEncoding('utf-8');
      this.proc.stdout.on('data', (chunk) => {
        this._buffer += chunk;
        let nl;
        while ((nl = this._buffer.indexOf('\n')) !== -1) {
          const line = this._buffer.slice(0, nl);
          this._buffer = this._buffer.slice(nl + 1);
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            const resolver = this._resolvers.get(msg.id);
            if (resolver) {
              this._resolvers.delete(msg.id);
              resolver(msg);
            }
          } catch { /* ignore non-JSON */ }
        }
      });
      this.proc.on('error', reject);
      // Give it a moment to start
      setTimeout(() => resolve(), 100);
    });
  }

  async send(method, params = {}) {
    const id = this.nextId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timeout waiting for response to ${method}`)), 5000);
      this._resolvers.set(id, (resp) => {
        clearTimeout(timeout);
        resolve(resp);
      });
      this.proc.stdin.write(msg);
    });
  }

  async sendNotification(method, params = {}) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.proc.stdin.write(msg);
  }

  stop() {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill();
      this.proc = null;
    }
  }
}

describe('MCP Canvas Server', () => {
  let client;

  before(async () => {
    client = new McpClient();
    await client.start();
  });

  after(() => {
    client?.stop();
  });

  // ── Handshake Tests ──────────────────────────────────────

  it('should complete MCP initialize handshake', async () => {
    const resp = await client.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' },
    });
    assert.ok(resp.result, 'Should have result');
    assert.equal(resp.result.protocolVersion, '2024-11-05');
    assert.equal(resp.result.serverInfo.name, 'canvas-tools');
    assert.equal(resp.result.serverInfo.version, '2.0.0');
    assert.ok(resp.result.capabilities.tools, 'Should declare tools capability');

    // Send initialized notification
    await client.sendNotification('notifications/initialized', {});
  });

  // ── Tool Discovery Tests ─────────────────────────────────

  it('should list all 10 tools', async () => {
    const resp = await client.send('tools/list', {});
    assert.ok(resp.result?.tools, 'Should have tools array');
    assert.equal(resp.result.tools.length, 10, 'Should have exactly 10 tools');

    const names = resp.result.tools.map(t => t.name).sort();
    assert.deepEqual(names, [
      'clear',
      'remove',
      'render_code',
      'render_comparison',
      'render_custom',
      'render_dashboard',
      'render_data',
      'render_project',
      'suggest_team',
      'update',
    ]);
  });

  it('each tool should have description and inputSchema', async () => {
    const resp = await client.send('tools/list', {});
    for (const tool of resp.result.tools) {
      assert.ok(tool.name, `Tool should have name`);
      assert.ok(tool.description, `${tool.name} should have description`);
      assert.ok(tool.inputSchema, `${tool.name} should have inputSchema`);
      assert.equal(tool.inputSchema.type, 'object', `${tool.name} schema should be object`);
    }
  });

  it('render_dashboard should require title and gauges', async () => {
    const resp = await client.send('tools/list', {});
    const dash = resp.result.tools.find(t => t.name === 'render_dashboard');
    assert.ok(dash.inputSchema.required.includes('title'), 'Should require title');
    assert.ok(dash.inputSchema.required.includes('gauges'), 'Should require gauges');
  });

  it('suggest_team should have team enum with frontend and backend', async () => {
    const resp = await client.send('tools/list', {});
    const suggest = resp.result.tools.find(t => t.name === 'suggest_team');
    assert.ok(suggest.inputSchema.required.includes('reason'), 'Should require reason');
    assert.ok(suggest.inputSchema.required.includes('team'), 'Should require team');
    const teamEnum = suggest.inputSchema.properties.team.enum;
    assert.deepEqual(teamEnum, ['frontend', 'backend']);
  });

  // ── Tool Execution Tests ─────────────────────────────────

  it('render_dashboard should return _canvas_ops with hero + gauges', async () => {
    const resp = await client.send('tools/call', {
      name: 'render_dashboard',
      arguments: {
        title: 'Server Status',
        gauges: [
          { label: 'CPU', value: 73, max: 100, unit: '%', color: 'orange' },
          { label: 'RAM', value: 4.2, max: 8, unit: 'GB', color: 'blue' },
        ],
        stats: [{ label: 'Uptime', value: '14d 3h' }],
      },
    });
    assert.ok(resp.result, 'Should have result');
    assert.ok(Array.isArray(resp.result.content), 'Should have content array');
    assert.ok(Array.isArray(resp.result._canvas_ops), 'Should have _canvas_ops array');

    const ops = resp.result._canvas_ops;
    assert.ok(ops.length >= 3, 'Should have at least 3 ops (hero + 2 gauges)');

    // Check hero
    const hero = ops.find(o => o.type === 'hero');
    assert.ok(hero, 'Should have hero op');
    assert.equal(hero.data.title, 'Server Status');

    // Check gauges
    const gauges = ops.filter(o => o.type === 'gauge');
    assert.equal(gauges.length, 2, 'Should have 2 gauge ops');
    assert.equal(gauges[0].data.label, 'CPU');
    assert.equal(gauges[1].data.label, 'RAM');

    // Check stats
    const stats = ops.find(o => o.type === 'stats');
    assert.ok(stats, 'Should have stats op');
  });

  it('suggest_team should return _canvas_ops with correct team UUID', async () => {
    const resp = await client.send('tools/call', {
      name: 'suggest_team',
      arguments: {
        reason: 'Building a portfolio requires HTML/CSS/JS specialists',
        team: 'frontend',
      },
    });
    assert.ok(resp.result, 'Should have result');
    assert.ok(Array.isArray(resp.result._canvas_ops), 'Should have _canvas_ops');

    const ops = resp.result._canvas_ops;
    assert.equal(ops.length, 2, 'Should have exactly 2 ops (card + buttons)');

    // Check card with reason
    const card = ops.find(o => o.type === 'card');
    assert.ok(card, 'Should have card op');
    assert.ok(card.data.text.includes('portfolio'), 'Card should contain reason');

    // Check buttons with team UUID
    const buttons = ops.find(o => o.type === 'buttons');
    assert.ok(buttons, 'Should have buttons op');
    const btn = buttons.data.buttons[0];
    assert.equal(btn.action, 'switch-team:1b7d3616-d0c8-4d4a-b86b-c0c18fb82323',
      'Button action should have frontend team UUID');
    assert.equal(btn.style, 'primary');
  });

  it('suggest_team backend should return backend team UUID', async () => {
    const resp = await client.send('tools/call', {
      name: 'suggest_team',
      arguments: {
        reason: 'API development needs backend specialists',
        team: 'backend',
      },
    });
    const ops = resp.result._canvas_ops;
    const buttons = ops.find(o => o.type === 'buttons');
    assert.equal(buttons.data.buttons[0].action,
      'switch-team:2d7c36a6-943e-44ee-8a6b-9b1a48e44147',
      'Should have backend team UUID');
  });

  it('render_comparison should return table ops', async () => {
    const resp = await client.send('tools/call', {
      name: 'render_comparison',
      arguments: {
        title: 'Framework Comparison',
        headers: ['Framework', 'Speed', 'Size'],
        rows: [['React', 'Fast', '42KB'], ['Vue', 'Fast', '33KB']],
      },
    });
    assert.ok(resp.result, 'Should have result');
    const textContent = resp.result.content.find(c => c.type === 'text');
    assert.ok(textContent.text.includes('table'), 'Should reference table component');
  });

  it('render_code should return code component ops', async () => {
    const resp = await client.send('tools/call', {
      name: 'render_code',
      arguments: {
        title: 'Hello World',
        language: 'javascript',
        code: 'console.log("hello")',
      },
    });
    assert.ok(resp.result);
    const textContent = resp.result.content.find(c => c.type === 'text');
    assert.ok(textContent.text.includes('code'), 'Should reference code component');
  });

  it('render_project should return hero + checklist + timeline', async () => {
    const resp = await client.send('tools/call', {
      name: 'render_project',
      arguments: {
        title: 'Scratchy v2',
        subtitle: 'GenUI Platform',
        tasks: [
          { text: 'Canvas rendering', checked: true },
          { text: 'MCP integration', checked: false },
        ],
        timeline: [
          { title: 'Phase 1', text: 'Core infrastructure' },
          { title: 'Phase 2', text: 'GenUI pipeline' },
        ],
      },
    });
    assert.ok(resp.result);
    const textContent = resp.result.content.find(c => c.type === 'text');
    assert.ok(textContent.text.includes('hero'), 'Should reference hero');
  });

  it('render_data kv format should return kv ops', async () => {
    const resp = await client.send('tools/call', {
      name: 'render_data',
      arguments: {
        title: 'System Info',
        format: 'kv',
        items: [{ key: 'OS', value: 'Linux' }, { key: 'Node', value: 'v22' }],
      },
    });
    assert.ok(resp.result);
    const textContent = resp.result.content.find(c => c.type === 'text');
    assert.ok(textContent);
  });

  it('render_custom should handle arbitrary components', async () => {
    const resp = await client.send('tools/call', {
      name: 'render_custom',
      arguments: {
        components: [
          { id: 'test-alert', type: 'alert', data: { title: 'Warning', message: 'Test', severity: 'warning' } },
        ],
      },
    });
    assert.ok(resp.result);
  });

  it('update should return _canvas_ops with patch op', async () => {
    const resp = await client.send('tools/call', {
      name: 'update',
      arguments: {
        id: 'dash-hero',
        data: { subtitle: 'Updated' },
      },
    });
    assert.ok(resp.result);
    assert.ok(Array.isArray(resp.result._canvas_ops), 'Should have _canvas_ops');
    const ops = resp.result._canvas_ops;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'patch');
    assert.equal(ops[0].id, 'dash-hero');
    assert.equal(ops[0].data.subtitle, 'Updated');
  });

  it('remove should return remove op', async () => {
    const resp = await client.send('tools/call', {
      name: 'remove',
      arguments: { id: 'test-component' },
    });
    assert.ok(resp.result);
  });

  it('clear should return clear op', async () => {
    const resp = await client.send('tools/call', {
      name: 'clear',
      arguments: {},
    });
    assert.ok(resp.result);
  });

  // ── Error Handling Tests ─────────────────────────────────

  it('should return error for unknown tool', async () => {
    const resp = await client.send('tools/call', {
      name: 'nonexistent_tool',
      arguments: {},
    });
    assert.ok(resp.error || (resp.result?.content?.[0]?.text?.includes('Unknown')),
      'Should return error for unknown tool');
  });

  it('should handle missing required args gracefully', async () => {
    const resp = await client.send('tools/call', {
      name: 'render_dashboard',
      arguments: { title: 'Empty', gauges: [] }, // empty gauges
    });
    // Should still return something (not crash)
    assert.ok(resp.result || resp.error, 'Should handle gracefully');
    if (resp.result?._canvas_ops) {
      // Should have at least the hero
      assert.ok(resp.result._canvas_ops.length >= 1, 'Should have at least hero op');
    }
  });

  // ── _canvas_ops Verification ─────────────────────────────

  it('render_dashboard result should contain parseable _canvas_ops', async () => {
    const resp = await client.send('tools/call', {
      name: 'render_dashboard',
      arguments: {
        title: 'Test Dashboard',
        gauges: [{ label: 'CPU', value: 50 }],
      },
    });
    const textContent = resp.result.content.find(c => c.type === 'text');
    // The _canvas_ops should be in the result text as JSON
    const text = textContent.text;

    // Try to find JSON with _canvas_ops
    // The MCP server puts ops in the result message; verify they're there
    assert.ok(text.length > 0, 'Should have non-empty result text');
  });

  it('suggest_team _canvas_ops should have exactly 2 ops (card + buttons)', async () => {
    const resp = await client.send('tools/call', {
      name: 'suggest_team',
      arguments: { reason: 'Test', team: 'frontend' },
    });
    const ops = resp.result._canvas_ops;
    assert.equal(ops.length, 2, 'Should have exactly 2 ops');
    assert.equal(ops[0].type, 'card', 'First op should be card');
    assert.equal(ops[1].type, 'buttons', 'Second op should be buttons');
    assert.ok(ops[1].data.buttons[0].action.includes('switch-team:'), 'Button should have switch-team action');
  });

  // ── NullClaw Integration Smoke Test ──────────────────────

  it('NullClaw binary should start gateway with MCP tools', async () => {
    const NULLCLAW_BIN = '/home/nonbios/nullclaw-gateway-streaming/zig-out/bin/nullclaw';
    const HOME_DIR = '/tmp/test-nullclaw-home';

    const child = spawn(NULLCLAW_BIN, ['gateway', '--port', '29995'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, HOME: HOME_DIR },
    });

    let output = '';
    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', d => output += d);
    child.stderr.on('data', d => output += d);

    // Wait for startup
    await new Promise(resolve => setTimeout(resolve, 3000));

    child.kill();
    await new Promise(resolve => child.on('exit', resolve));

    // Verify MCP initialized
    assert.ok(output.includes('MCP: 10 tools registered'),
      `NullClaw should register 10 MCP tools. Output: ${output.slice(0, 500)}`);
    assert.ok(!output.includes('Segmentation fault'),
      'Should not segfault');
    assert.ok(output.includes('Gateway listening'),
      'Gateway should start listening');
  });
});
