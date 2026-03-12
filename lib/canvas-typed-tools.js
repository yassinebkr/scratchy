/**
 * @module lib/canvas-typed-tools
 * Maps typed MCP canvas tool calls to canvas-ops arrays.
 *
 * Used by both agent-orchestrator.js and chat-handler.js to convert
 * NullClaw's mcp_canvas_* typed tools into GenUI canvas operations.
 *
 * IMPORTANT: This module intercepts tool_call_start events which contain
 * RAW model arguments (before MCP server processing). We must sanitize
 * HTML/CSS here — the MCP server's sanitization runs separately and its
 * output is NOT used by these interception paths.
 */

import * as widgetTemplates from './widget-templates/index.js';

// Ensure templates are loaded in the main server process (not just the MCP child).
// Without this, create_from_template interception returns 0 ops → canvas never renders.
widgetTemplates.loadAll().catch(err => {
  console.error('[canvas-typed-tools] Failed to load widget templates:', err.message);
});

// Load widget templates into the registry (required for create_from_template interception).
// canvas-mcp-server.js calls loadAll() in its own process, but the main server process
// (orchestrator/chat-handler) also needs them loaded here for the SSE interception path.
await widgetTemplates.loadAll();

/* ── HTML/CSS sanitization (mirrors canvas-mcp-server.js) ── */

function sanitizeWidgetHtml(html) {
  return html
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, '')
    .replace(/<script[\s>]/gi, '&lt;script ')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/data\s*:\s*text\/html/gi, 'blocked:text/html');
}

function sanitizeWidgetCss(css) {
  return css
    .replace(/@import\s+[^;]+;?/gi, '/* @import blocked */')
    .replace(/url\s*\(\s*['"]?\s*https?:\/\//gi, 'url(/* blocked */');
}

const TEAM_IDS = {
  frontend: '1b7d3616-d0c8-4d4a-b86b-c0c18fb82323',
  backend: '2d7c36a6-943e-44ee-8a6b-9b1a48e44147',
};

/**
 * Map a typed canvas tool (shortName after stripping `mcp_canvas_`) to an array of ops.
 * Returns [] if the shortName is not a known typed tool.
 *
 * @param {string} shortName - e.g. 'render_dashboard', 'suggest_team', 'render_data'
 * @param {object} args - parsed arguments from the tool call
 * @returns {Array<object>} ops array (may be empty if not a typed tool)
 */
export function mapTypedCanvasTool(shortName, args) {
  switch (shortName) {
    case 'render_dashboard':
      return mapDashboard(args);
    case 'render_comparison':
      return mapComparison(args);
    case 'render_code':
      return mapCode(args);
    case 'render_project':
      return mapProject(args);
    case 'suggest_team':
      return mapSuggestTeam(args);
    case 'render_data':
      return mapData(args);
    case 'create_from_template': {
      const { template, widgetId, config } = args;
      const tplResult = widgetTemplates.instantiate(template, widgetId, config || {});
      return tplResult.ops || [];
    }
    case 'create_live_widget': {
      const component = {
        html: sanitizeWidgetHtml(args.html || ''),
        css: sanitizeWidgetCss(args.css || ''),
        props: args.props || [],
        actions: args.actions || [],
        defaults: args.defaults || {},
      };
      // Client-side action handler — widget runs as standalone app
      if (args.js && typeof args.js === 'string') {
        component.js = args.js;
      }
      return [
        {
          op: 'define',
          id: args.widgetId,
          component,
        },
        // Auto-render an instance so the widget appears immediately
        {
          op: 'upsert',
          id: `lw-${args.widgetId}`,
          type: args.widgetId,
          data: args.defaults || {},
        },
      ];
    }
    case 'destroy_live_widget':
      return [{ op: 'undefine', id: args.widgetId }];
    default:
      return [];
  }
}

/** All known typed tool shortNames (for quick membership checks). */
export const TYPED_TOOL_NAMES = new Set([
  'render_dashboard',
  'render_comparison',
  'render_code',
  'render_project',
  'suggest_team',
  'render_data',
  'create_live_widget',
  'create_from_template',
  'destroy_live_widget',
]);

/* ── Individual mappers ── */

function mapDashboard(a) {
  const ops = [];
  ops.push({ op: 'upsert', id: 'dash-hero', type: 'hero', data: { title: a.title, subtitle: a.subtitle } });
  if (Array.isArray(a.gauges)) {
    a.gauges.forEach((g, i) => {
      ops.push({
        op: 'upsert',
        id: `dash-gauge-${i}`,
        type: 'gauge',
        data: { label: g.label, value: g.value, max: g.max || 100, unit: g.unit || '%', color: g.color },
      });
    });
  }
  if (Array.isArray(a.stats)) {
    ops.push({ op: 'upsert', id: 'dash-stats', type: 'stats', data: { title: 'Overview', items: a.stats } });
  }
  if (a.sparkline) {
    ops.push({ op: 'upsert', id: 'dash-sparkline', type: 'sparkline', data: a.sparkline });
  }
  return ops;
}

function mapComparison(a) {
  const ops = [];
  ops.push({ op: 'upsert', id: 'cmp-table', type: 'table', data: { title: a.title, headers: a.headers, rows: a.rows } });
  if (a.chart) {
    const chartType = a.chart.type || 'bar';
    const chartData = { title: a.title + ' Chart', labels: a.chart.labels };
    if (chartType === 'pie') {
      chartData.slices = a.chart.datasets;
    } else {
      chartData.datasets = a.chart.datasets;
    }
    ops.push({ op: 'upsert', id: 'cmp-chart', type: `chart-${chartType}`, data: chartData });
  }
  return ops;
}

function mapCode(a) {
  const ops = [];
  ops.push({ op: 'upsert', id: 'code-block', type: 'code', data: { title: a.title, language: a.language, code: a.code } });
  if (a.description) {
    ops.push({ op: 'upsert', id: 'code-desc', type: 'card', data: { title: a.title || 'Notes', text: a.description } });
  }
  return ops;
}

function mapProject(a) {
  const ops = [];
  ops.push({ op: 'upsert', id: 'proj-hero', type: 'hero', data: { title: a.title, subtitle: a.subtitle } });
  if (Array.isArray(a.tasks)) {
    ops.push({ op: 'upsert', id: 'proj-tasks', type: 'checklist', data: { title: 'Tasks', items: a.tasks } });
  }
  if (Array.isArray(a.timeline)) {
    ops.push({ op: 'upsert', id: 'proj-timeline', type: 'timeline', data: { title: 'Timeline', items: a.timeline } });
  }
  if (Array.isArray(a.stats)) {
    ops.push({ op: 'upsert', id: 'proj-stats', type: 'stats', data: { title: 'Status', items: a.stats } });
  }
  return ops;
}

function mapSuggestTeam(a) {
  const team = a.team || 'frontend';
  const teamId = TEAM_IDS[team] || TEAM_IDS.frontend;
  const label = team === 'frontend' ? '⚡ Switch to Frontend Team' : '🔧 Switch to Backend Team';
  return [
    { op: 'upsert', id: 'team-reason', type: 'card', data: { title: '🚀 Team Recommended', text: a.reason } },
    {
      op: 'upsert', id: 'team-suggest', type: 'buttons', data: {
        title: 'Switch to team',
        buttons: [{ label, action: `switch-team:${teamId}`, style: 'primary' }],
      },
    },
  ];
}

function mapData(a) {
  const fmt = a.format || 'kv';
  switch (fmt) {
    case 'kv':
      return [{ op: 'upsert', id: 'data-kv', type: 'kv', data: { title: a.title, items: a.items } }];
    case 'tags':
      return [{ op: 'upsert', id: 'data-tags', type: 'tags', data: { label: a.title, items: a.items } }];
    case 'alert':
      return [{
        op: 'upsert', id: 'data-alert', type: 'alert', data: {
          title: a.title,
          message: (Array.isArray(a.items) && a.items[0]?.value) || '',
          severity: a.severity || 'info',
        },
      }];
    case 'stats':
      return [{ op: 'upsert', id: 'data-stats', type: 'stats', data: { title: a.title, items: a.items } }];
    default:
      return [{ op: 'upsert', id: 'data-kv', type: 'kv', data: { title: a.title, items: a.items } }];
  }
}
