#!/usr/bin/env node
/**
 * @fileoverview Canvas MCP Server — tool=component architecture.
 *
 * Instead of a generic "render" tool where the model picks component types
 * (unreliable), this server exposes **typed tools** that map to specific
 * component layouts. The model calls a typed tool with structured data,
 * and the server decides what canvas components to render.
 *
 * Protocol: MCP over stdio (JSON-RPC 2.0, newline-delimited).
 * Tool prefix in NullClaw: mcp_canvas_*
 *
 * @module lib/canvas-mcp-server
 */

import { createInterface } from 'node:readline';

// ── Team IDs (for suggest_team) ───────────────────────────────────────────
const TEAM_IDS = {
  frontend: '1b7d3616-d0c8-4d4a-b86b-c0c18fb82323',
  backend:  '2d7c36a6-943e-44ee-8a6b-9b1a48e44147',
};

// ── Tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  // ── Typed tools ─────────────────────────────────────────────────────────

  {
    name: 'render_dashboard',
    description:
      'Display a metrics dashboard with gauges, stats, and optional sparkline. Use when showing system health, performance monitoring, or KPI overview.',
    inputSchema: {
      type: 'object',
      properties: {
        title:    { type: 'string' },
        subtitle: { type: 'string' },
        gauges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'number' },
              max:   { type: 'number', default: 100 },
              unit:  { type: 'string', default: '%' },
              color: { type: 'string' },
            },
            required: ['label', 'value'],
          },
        },
        stats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['label', 'value'],
          },
        },
        sparkline: {
          type: 'object',
          properties: {
            label:  { type: 'string' },
            values: { type: 'array', items: { type: 'number' } },
            color:  { type: 'string' },
          },
        },
      },
      required: ['title', 'gauges'],
    },
  },

  {
    name: 'render_comparison',
    description:
      'Display a comparison of items using table and/or chart. Use when comparing frameworks, tools, options, or any structured data.',
    inputSchema: {
      type: 'object',
      properties: {
        title:   { type: 'string' },
        headers: { type: 'array', items: { type: 'string' } },
        rows:    { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        chart: {
          type: 'object',
          properties: {
            type:     { type: 'string', enum: ['bar', 'pie', 'line'] },
            labels:   { type: 'array', items: { type: 'string' } },
            datasets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  data:  { type: 'array', items: { type: 'number' } },
                  color: { type: 'string' },
                },
              },
            },
          },
        },
      },
      required: ['title', 'headers', 'rows'],
    },
  },

  {
    name: 'render_code',
    description:
      'Display a code snippet with syntax highlighting. Use when showing code examples, configurations, or technical output.',
    inputSchema: {
      type: 'object',
      properties: {
        title:       { type: 'string' },
        language:    { type: 'string' },
        code:        { type: 'string' },
        description: { type: 'string' },
      },
      required: ['code'],
    },
  },

  {
    name: 'render_project',
    description:
      'Display a project overview with status, tasks, and timeline. Use when showing project plans, progress tracking, or milestone status.',
    inputSchema: {
      type: 'object',
      properties: {
        title:    { type: 'string' },
        subtitle: { type: 'string' },
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text:    { type: 'string' },
              checked: { type: 'boolean', default: false },
            },
            required: ['text'],
          },
        },
        timeline: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              text:  { type: 'string' },
              icon:  { type: 'string' },
            },
            required: ['title'],
          },
        },
        stats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['label', 'value'],
          },
        },
      },
      required: ['title'],
    },
  },

  {
    name: 'suggest_team',
    description:
      'Suggest switching to a team for multi-agent collaborative work. Use when the user asks to BUILD, CREATE, or MAKE something that needs multiple specialists (websites, apps, landing pages, full projects). ALWAYS use this instead of trying to build things yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief explanation of why this needs a team (1 sentence)',
        },
        team: {
          type: 'string',
          enum: ['frontend', 'backend'],
          description: 'Which team to suggest',
        },
      },
      required: ['reason', 'team'],
    },
  },

  {
    name: 'render_data',
    description:
      'Display structured data in the most appropriate format. Use for key-value pairs, lists, tags, or any structured information that doesn\'t fit the other specific tools.',
    inputSchema: {
      type: 'object',
      properties: {
        title:  { type: 'string' },
        format: { type: 'string', enum: ['kv', 'tags', 'alert', 'stats'], default: 'kv' },
        items:  { type: 'array', items: { type: 'object' } },
        severity: { type: 'string', enum: ['info', 'warning', 'error', 'success'] },
      },
      required: ['title', 'items'],
    },
  },

  {
    name: 'create_live_widget',
    description: 'Define AND render a custom UI component as a Web Component with Shadow DOM. The widget is created and immediately displayed on the canvas in one step. Use when the 34 built-in components don\'t fit — custom layouts, domain-specific UIs, interactive elements, or novel visualizations. To update the widget later, use the update tool with id "lw-{widgetId}".',
    inputSchema: {
      type: 'object',
      properties: {
        widgetId: {
          type: 'string',
          description: 'Unique type name for this widget (lowercase, hyphens only, 2-49 chars). The widget instance will have id "lw-{widgetId}" on the canvas.',
          pattern: '^[a-z][a-z0-9-]{1,48}$',
        },
        html: {
          type: 'string',
          description: 'HTML template. Use {{propName}} for reactive bindings (HTML-escaped). Use {{{propName}}} for raw HTML. Use {{#each arr}}...{{/each}} for loops. Use {{#if prop}}...{{/if}} for conditionals. Use data-action="actionName" on interactive elements. NEVER use inline event handlers (onclick, ondragover, onmouseover, etc.) — they are stripped for security. For drag-and-drop: use data-action="dragstart" on draggable items and data-action="drop" on drop zones — the runtime handles dragover/drop events automatically.',
        },
        css: {
          type: 'string',
          description: 'Scoped CSS (auto-wrapped in Shadow DOM, no style leaks to parent page). IMPORTANT: Use dark theme colors — the host app has a dark background (#0d0b07). Use CSS variables: var(--text, #f0ead6) for text, var(--text-muted, #8a7e6a) for secondary text, var(--surface, #1a1610) for card backgrounds, var(--bg, #0d0b07) for container backgrounds, var(--accent, #F9A602) for highlights, var(--border, rgba(255,255,255,0.06)) for borders, var(--radius, 8px) for border-radius. Never use white/light backgrounds.',
        },
        props: {
          type: 'array',
          items: { type: 'string' },
          description: 'Reactive property names. Component re-renders when these change via patch/update.',
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Action name (matches data-action attr in HTML)' },
              emits: { type: 'string', description: 'Event name dispatched back to server via widget-action protocol' },
            },
            required: ['name'],
          },
          description: 'Interactive actions. Clicks on data-action elements dispatch events through widget-action protocol.',
        },
        defaults: {
          type: 'object',
          description: 'Default values for props when not provided in data.',
        },
      },
      required: ['widgetId', 'html'],
    },
  },
  {
    name: 'destroy_live_widget',
    description: 'Remove a previously defined custom widget type. Existing rendered instances remain visible but stop receiving updates.',
    inputSchema: {
      type: 'object',
      properties: {
        widgetId: { type: 'string', description: 'Widget type name to remove' },
      },
      required: ['widgetId'],
    },
  },

  // ── Fallback generic tool (renamed from render) ─────────────────────────

  {
    name: 'render_custom',
    description:
      'Render arbitrary canvas components (fallback). Prefer the typed render_* tools when possible. Use this only for component types not covered by other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        components: {
          type: 'array',
          description: 'Array of canvas components to render',
          items: {
            type: 'object',
            properties: {
              id:   { type: 'string', description: 'Unique component ID' },
              type: { type: 'string', description: 'Component type' },
              data: { type: 'object', description: 'Component data' },
            },
            required: ['id', 'type', 'data'],
          },
        },
      },
      required: ['components'],
    },
  },

  // ── Utility tools (unchanged) ───────────────────────────────────────────

  {
    name: 'update',
    description:
      'Update specific fields of an existing canvas component (partial patch). Only include the changed fields in data.',
    inputSchema: {
      type: 'object',
      properties: {
        id:   { type: 'string', description: 'Component ID to update' },
        data: { type: 'object', description: 'Fields to update (merged with existing)' },
      },
      required: ['id', 'data'],
    },
  },

  {
    name: 'remove',
    description: 'Remove a specific component from the canvas by ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Component ID to remove' },
      },
      required: ['id'],
    },
  },

  {
    name: 'clear',
    description: 'Remove ALL components from the canvas. Use before rendering a completely new view.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────
// Each typed tool handler returns { ops: [...], message: string }.
// `ops` is the array of canvas operations that Scratchy will render.
// `message` is the confirmation text returned to the model.

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
}

function op(action, id, type, data, layout) {
  const o = { op: action, id };
  if (type) o.type = type;
  if (data) o.data = data;
  if (layout) o.layout = layout;
  return o;
}

function handleRenderDashboard(args) {
  const { title, subtitle, gauges, stats, sparkline } = args;
  const ops = [];
  const parts = [];

  // Hero
  const heroData = { title };
  if (subtitle) heroData.subtitle = subtitle;
  ops.push(op('upsert', 'dash-hero', 'hero', heroData));
  parts.push('hero');

  // Gauges
  for (const g of gauges) {
    const slug = slugify(g.label) || String(gauges.indexOf(g));
    ops.push(op('upsert', `dash-gauge-${slug}`, 'gauge', {
      label: g.label,
      value: g.value,
      max:   g.max ?? 100,
      unit:  g.unit ?? '%',
      ...(g.color ? { color: g.color } : {}),
    }));
  }
  parts.push(`${gauges.length} gauge(s)`);

  // Stats
  if (stats && stats.length > 0) {
    ops.push(op('upsert', 'dash-stats', 'stats', {
      title: 'Stats',
      items: stats,
    }));
    parts.push('stats');
  }

  // Sparkline
  if (sparkline) {
    ops.push(op('upsert', 'dash-sparkline', 'sparkline', {
      label:  sparkline.label || 'Trend',
      values: sparkline.values || [],
      ...(sparkline.color ? { color: sparkline.color } : {}),
    }));
    parts.push('sparkline');
  }

  return {
    ops,
    message: `✅ Dashboard "${title}" rendered: ${parts.join(', ')}`,
  };
}

function handleRenderComparison(args) {
  const { title, headers, rows, chart } = args;
  const ops = [];
  const parts = [];

  // Table
  ops.push(op('upsert', 'comparison-table', 'table', { title, headers, rows }));
  parts.push('table');

  // Chart (optional)
  if (chart && chart.type) {
    const chartType = `chart-${chart.type}`;
    const chartId = `comparison-${chartType}`;

    if (chart.type === 'pie') {
      // Convert datasets to slices for pie chart
      const slices = (chart.labels || []).map((label, i) => ({
        label,
        value: chart.datasets?.[0]?.data?.[i] ?? 0,
        ...(chart.datasets?.[0]?.color ? {} : {}),
      }));
      // Try to get colors from individual dataset entries or use defaults
      if (chart.datasets) {
        chart.datasets.forEach((ds, di) => {
          if (ds.color && slices[di]) slices[di].color = ds.color;
        });
      }
      ops.push(op('upsert', chartId, chartType, { title: `${title} — Chart`, slices }));
    } else {
      ops.push(op('upsert', chartId, chartType, {
        title:    `${title} — Chart`,
        labels:   chart.labels || [],
        datasets: chart.datasets || [],
      }));
    }
    parts.push(chartType);
  }

  return {
    ops,
    message: `✅ Comparison "${title}" rendered: ${parts.join(', ')}`,
  };
}

function handleRenderCode(args) {
  const { title, language, code, description } = args;
  const ops = [];
  const parts = [];

  const codeData = { code };
  if (title)    codeData.title = title;
  if (language) codeData.language = language;
  ops.push(op('upsert', 'code-snippet', 'code', codeData));
  parts.push('code');

  if (description) {
    ops.push(op('upsert', 'code-desc', 'card', {
      title: title || 'Description',
      text:  description,
    }));
    parts.push('description card');
  }

  return {
    ops,
    message: `✅ Code snippet rendered: ${parts.join(', ')}`,
  };
}

function handleRenderProject(args) {
  const { title, subtitle, tasks, timeline, stats } = args;
  const ops = [];
  const parts = [];

  // Hero
  const heroData = { title };
  if (subtitle) heroData.subtitle = subtitle;
  ops.push(op('upsert', 'project-hero', 'hero', heroData));
  parts.push('hero');

  // Checklist
  if (tasks && tasks.length > 0) {
    ops.push(op('upsert', 'project-tasks', 'checklist', {
      title: 'Tasks',
      items: tasks.map(t => ({ text: t.text, checked: t.checked ?? false })),
    }));
    parts.push(`${tasks.length} task(s)`);
  }

  // Timeline
  if (timeline && timeline.length > 0) {
    ops.push(op('upsert', 'project-timeline', 'timeline', {
      title: 'Timeline',
      items: timeline.map(t => ({
        title: t.title,
        ...(t.text ? { text: t.text } : {}),
        ...(t.icon ? { icon: t.icon } : {}),
      })),
    }));
    parts.push(`${timeline.length} milestone(s)`);
  }

  // Stats
  if (stats && stats.length > 0) {
    ops.push(op('upsert', 'project-stats', 'stats', {
      title: 'Project Stats',
      items: stats,
    }));
    parts.push('stats');
  }

  return {
    ops,
    message: `✅ Project "${title}" rendered: ${parts.join(', ')}`,
  };
}

function handleSuggestTeam(args) {
  const { reason, team } = args;
  const teamId = TEAM_IDS[team];
  const teamLabel = team.charAt(0).toUpperCase() + team.slice(1);
  const ops = [];

  ops.push(op('upsert', 'team-reason', 'card', {
    title: `🚀 Team Recommended: ${teamLabel}`,
    text:  reason,
  }));

  ops.push(op('upsert', 'team-switch', 'buttons', {
    title: 'Switch to Team',
    buttons: [
      {
        label:  `Switch to ${teamLabel} Team`,
        action: `switch-team:${teamId}`,
        style:  'primary',
      },
    ],
  }));

  return {
    ops,
    message: `✅ Team switch button rendered. Your response is COMPLETE. Do NOT continue writing — the user will click the button to proceed. Say nothing more.`,
  };
}

function handleRenderData(args) {
  const { title, format, items, severity } = args;
  const fmt = format || 'kv';
  const ops = [];

  switch (fmt) {
    case 'kv':
      ops.push(op('upsert', 'data-kv', 'kv', {
        title,
        items: items.map(i => ({ key: i.key || i.label || '', value: i.value || '' })),
      }));
      break;

    case 'tags':
      ops.push(op('upsert', 'data-tags', 'tags', {
        label: title,
        items: items.map(i => ({ text: i.text || i.label || '', ...(i.color ? { color: i.color } : {}) })),
      }));
      break;

    case 'alert':
      ops.push(op('upsert', 'data-alert', 'alert', {
        title,
        message: items.map(i => i.text || i.message || i.value || '').join('\n'),
        severity: severity || 'info',
      }));
      break;

    case 'stats':
      ops.push(op('upsert', 'data-stats', 'stats', {
        title,
        items: items.map(i => ({ label: i.label || i.key || '', value: String(i.value || '') })),
      }));
      break;

    default:
      // Fallback to kv
      ops.push(op('upsert', 'data-kv', 'kv', {
        title,
        items: items.map(i => ({ key: i.key || i.label || '', value: i.value || '' })),
      }));
  }

  return {
    ops,
    message: `✅ Data "${title}" rendered as ${fmt} (${items.length} item(s))`,
  };
}

function handleRenderCustom(args) {
  const components = args.components || [];
  const ops = components.map(c => op('upsert', c.id, c.type, c.data));
  const types = components.map(c => c.type).join(', ');
  return {
    ops,
    message: `✅ Rendered ${components.length} custom component(s): ${types}`,
  };
}

// ── Built-in type names (cannot be overridden by live widgets) ──
const BUILTIN_TYPES = new Set([
  'hero','card','alert','stats','gauge','progress','sparkline',
  'chart-bar','chart-line','chart-pie','stacked-bar','table',
  'checklist','timeline','kv','tags','accordion','buttons','chips',
  'toggle','input','slider','rating','tabs','streak','form-strip',
  'link-card','status','weather','code','video','image','form',
]);

function validateWidgetDefinition({ widgetId, html, css }) {
  const errors = [];
  // ID format
  if (!widgetId || !/^[a-z][a-z0-9-]{1,48}$/.test(widgetId)) {
    errors.push('widgetId must be 2-49 chars, lowercase alphanumeric + hyphens, start with letter');
  }
  // No built-in collision
  if (BUILTIN_TYPES.has(widgetId)) {
    errors.push(`Cannot redefine built-in type "${widgetId}"`);
  }
  // Size limit
  const totalSize = (html || '').length + (css || '').length;
  if (totalSize > 50_000) {
    errors.push(`Definition too large: ${totalSize} bytes (max 50000)`);
  }
  // HTML required
  if (!html || html.trim().length === 0) {
    errors.push('html template is required');
  }
  return errors;
}

function sanitizeHtml(html) {
  return html
    // Remove script tags
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
    .replace(/<script[\s>]/gi, '&lt;script ')
    // Remove event handler attributes
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    // Remove javascript: URLs
    .replace(/javascript\s*:/gi, 'blocked:')
    // Remove data:text/html
    .replace(/data\s*:\s*text\/html/gi, 'blocked:text/html');
}

function sanitizeCss(css) {
  return css
    // Remove @import
    .replace(/@import\s+[^;]+;?/gi, '/* @import blocked */')
    // Remove url() with http/https
    .replace(/url\s*\(\s*['"]?\s*https?:\/\//gi, 'url(/* blocked */');
}

function handleCreateLiveWidget(args) {
  const { widgetId, html, css, props, actions, defaults } = args;

  const errors = validateWidgetDefinition(args);
  if (errors.length > 0) {
    return {
      ops: [],
      message: `❌ Widget definition rejected: ${errors.join('; ')}`,
    };
  }

  const cleanHtml = sanitizeHtml(html);
  const cleanCss = sanitizeCss(css || '');

  const ops = [
    {
      op: 'define',
      id: widgetId,
      component: {
        html: cleanHtml,
        css: cleanCss,
        props: props || [],
        actions: actions || [],
        defaults: defaults || {},
      },
    },
    // Auto-render an instance so the widget appears immediately
    {
      op: 'upsert',
      id: `lw-${widgetId}`,
      type: widgetId,
      data: defaults || {},
    },
  ];

  const propCount = (props || []).length;
  const actionCount = (actions || []).length;
  return {
    ops,
    message: `✅ Widget "${widgetId}" created and rendered (${propCount} prop(s), ${actionCount} action(s)). To update its data, use the update tool with id "lw-${widgetId}".`,
  };
}

function handleDestroyLiveWidget(args) {
  const { widgetId } = args;
  if (!widgetId) {
    return { ops: [], message: '❌ widgetId is required' };
  }
  return {
    ops: [{ op: 'undefine', id: widgetId }],
    message: `✅ Widget type "${widgetId}" removed. Existing instances remain but won't update.`,
  };
}

// ── JSON-RPC handler ──────────────────────────────────────────────────────

function handleRequest(msg) {
  const { id, method, params } = msg;

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'canvas-tools', version: '2.0.0' },
        },
      };

    case 'notifications/initialized':
      return null;

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      };

    case 'tools/call': {
      const toolName = params?.name;
      const args = params?.arguments || {};

      let result;

      switch (toolName) {
        // ── Typed tools ───────────────────────────────────────────────
        case 'render_dashboard':
          result = handleRenderDashboard(args);
          break;
        case 'render_comparison':
          result = handleRenderComparison(args);
          break;
        case 'render_code':
          result = handleRenderCode(args);
          break;
        case 'render_project':
          result = handleRenderProject(args);
          break;
        case 'suggest_team':
          result = handleSuggestTeam(args);
          break;
        case 'render_data':
          result = handleRenderData(args);
          break;

        case 'create_live_widget':
          result = handleCreateLiveWidget(args);
          break;
        case 'destroy_live_widget':
          result = handleDestroyLiveWidget(args);
          break;

        // ── Fallback generic ──────────────────────────────────────────
        case 'render_custom':
          result = handleRenderCustom(args);
          break;

        // ── Utility tools (unchanged) ─────────────────────────────────
        case 'update':
          result = {
            ops: [{ op: 'patch', id: args.id, data: args.data }],
            message: `✅ Updated component "${args.id}" on canvas`,
          };
          break;
        case 'remove':
          result = {
            ops: [{ op: 'remove', id: args.id }],
            message: `✅ Removed component "${args.id}" from canvas`,
          };
          break;
        case 'clear':
          result = {
            ops: [{ op: 'clear' }],
            message: '✅ Canvas cleared',
          };
          break;

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Unknown tool: ${toolName}` },
          };
      }

      // Attach canvas ops as metadata so Scratchy's chat-handler can
      // intercept them from the tool_call_start SSE event.
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: result.message }],
          _canvas_ops: result.ops,
        },
      };
    }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Unknown method: ${method}` },
      };
  }
}

// ── Stdio transport ───────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    const response = handleRequest(msg);
    if (response) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    }) + '\n');
  }
});

rl.on('close', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
