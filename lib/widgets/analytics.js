/**
 * @module lib/widgets/analytics
 * Analytics widget for Scratchy v2.
 *
 * Provides dashboard views for usage statistics, session analytics,
 * and agent performance. Reads from existing tables: `usage_daily`,
 * `sessions`, `users`, and `agents`.
 *
 * Actions:
 *   analytics-dashboard — Overview with key metrics
 *   analytics-usage     — Detailed usage breakdown (messages, tokens, models)
 *   analytics-agents    — Agent usage and performance stats
 *
 * @example
 * ```js
 * import { analyticsWidget } from './analytics.js';
 * registry.register(analyticsWidget);
 * ```
 */

import { upsert, toast } from './framework.js';

// ─── State ──────────────────────────────────────────────────────────────────

/** @type {import('better-sqlite3').Database} */
let db;

// ─── Date Helpers ───────────────────────────────────────────────────────────

/**
 * Get today's UTC date as YYYY-MM-DD.
 * @returns {string}
 */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get a date N days ago as YYYY-MM-DD.
 * @param {number} n
 * @returns {string}
 */
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Get the first day of the current month.
 * @returns {string}
 */
function monthStart() {
  return todayUTC().slice(0, 7) + '-01';
}

// ─── Data Queries ───────────────────────────────────────────────────────────

/**
 * Check if a table exists in the database.
 * @param {string} tableName
 * @returns {boolean}
 */
function tableExists(tableName) {
  const row = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
  ).get(tableName);
  return !!row;
}

/**
 * Get overall platform stats.
 * @returns {{ totalUsers: number, activeSessions: number, totalAgents: number }}
 */
function getPlatformStats() {
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get()?.c ?? 0;

  let activeSessions = 0;
  try {
    const now = new Date().toISOString();
    activeSessions = db.prepare(
      'SELECT COUNT(*) as c FROM sessions WHERE expiresAt > ?'
    ).get(now)?.c ?? 0;
  } catch {
    // sessions table might not exist
  }

  let totalAgents = 0;
  try {
    totalAgents = db.prepare(
      'SELECT COUNT(*) as c FROM agents WHERE enabled = 1'
    ).get()?.c ?? 0;
  } catch {
    // agents table might not exist
  }

  return { totalUsers, activeSessions, totalAgents };
}

/**
 * Get usage totals for a user over a date range.
 * @param {string} userId
 * @param {string} startDate
 * @param {string} endDate
 * @returns {{ messages: number, tokens: number, days: Array<{ date: string, messages: number, tokens: number }> }}
 */
function getUsageRange(userId, startDate, endDate) {
  if (!tableExists('usage_daily')) {
    return { messages: 0, tokens: 0, days: [] };
  }

  const rows = db.prepare(
    'SELECT date, messages, tokens FROM usage_daily WHERE userId = ? AND date >= ? AND date <= ? ORDER BY date ASC'
  ).all(userId, startDate, endDate);

  let totalMessages = 0;
  let totalTokens = 0;
  for (const row of rows) {
    totalMessages += row.messages;
    totalTokens += row.tokens;
  }

  return { messages: totalMessages, tokens: totalTokens, days: rows };
}

/**
 * Get usage with model breakdown for a user on a given date range.
 * @param {string} userId
 * @param {string} startDate
 * @param {string} endDate
 * @returns {{ models: Record<string, { messages: number, tokens: number }>, daily: Array<Object> }}
 */
function getUsageWithModels(userId, startDate, endDate) {
  if (!tableExists('usage_daily')) {
    return { models: {}, daily: [] };
  }

  const rows = db.prepare(
    'SELECT date, messages, tokens, modelBreakdown FROM usage_daily WHERE userId = ? AND date >= ? AND date <= ? ORDER BY date ASC'
  ).all(userId, startDate, endDate);

  /** @type {Record<string, { messages: number, tokens: number }>} */
  const models = {};

  for (const row of rows) {
    try {
      const breakdown = JSON.parse(row.modelBreakdown || '{}');
      for (const [model, stats] of Object.entries(breakdown)) {
        if (!models[model]) models[model] = { messages: 0, tokens: 0 };
        const s = /** @type {{ messages: number, tokens: number }} */ (stats);
        models[model].messages += s.messages;
        models[model].tokens += s.tokens;
      }
    } catch {
      // skip malformed breakdown
    }
  }

  return { models, daily: rows };
}

/**
 * Get agent stats: conversation counts and message volume.
 * @returns {Array<{ id: string, name: string, conversations: number, model: string }>}
 */
function getAgentStats() {
  if (!tableExists('agents') || !tableExists('agent_conversations')) {
    return [];
  }

  try {
    return db.prepare(`
      SELECT a.id, a.name, a.model,
             COUNT(ac.id) as conversations
      FROM agents a
      LEFT JOIN agent_conversations ac ON ac.agentId = a.id
      WHERE a.enabled = 1
      GROUP BY a.id
      ORDER BY conversations DESC
    `).all();
  } catch {
    return [];
  }
}

/**
 * Get user plan distribution.
 * @returns {Array<{ plan: string, count: number }>}
 */
function getPlanDistribution() {
  try {
    return db.prepare(
      'SELECT plan, COUNT(*) as count FROM users GROUP BY plan ORDER BY count DESC'
    ).all();
  } catch {
    return [];
  }
}

// ─── Formatting Helpers ─────────────────────────────────────────────────────

/**
 * Format large numbers for display.
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── GenUI Builders ─────────────────────────────────────────────────────────

/**
 * Build the main dashboard view.
 * @param {string} userId
 * @returns {import('./framework.js').GenUIOp[]}
 */
function buildDashboard(userId) {
  const ops = [];
  const platform = getPlatformStats();
  const todayUsage = getUsageRange(userId, todayUTC(), todayUTC());
  const weekUsage = getUsageRange(userId, daysAgo(7), todayUTC());

  // Platform overview
  ops.push(upsert('analytics-platform', 'stats', {
    title: '📊 Platform Overview',
    items: [
      { label: 'Users', value: String(platform.totalUsers) },
      { label: 'Active Sessions', value: String(platform.activeSessions) },
      { label: 'Agents', value: String(platform.totalAgents) },
    ],
  }));

  // Today's usage gauges
  ops.push(upsert('analytics-today-msgs', 'gauge', {
    label: 'Messages Today',
    value: todayUsage.messages,
    max: Math.max(todayUsage.messages * 2, 50),
    unit: 'msgs',
    color: 'blue',
  }));

  ops.push(upsert('analytics-today-tokens', 'gauge', {
    label: 'Tokens Today',
    value: todayUsage.tokens,
    max: Math.max(todayUsage.tokens * 2, 100000),
    unit: 'tok',
    color: 'green',
  }));

  // 7-day message sparkline
  if (weekUsage.days.length > 0) {
    ops.push(upsert('analytics-week-spark', 'sparkline', {
      label: 'Messages (7 days)',
      values: weekUsage.days.map(d => d.messages),
      color: 'blue',
      trend: weekUsage.days.length >= 2
        ? (weekUsage.days.at(-1).messages >= weekUsage.days.at(-2).messages ? 'up' : 'down')
        : null,
    }));
  }

  // Navigation
  ops.push(upsert('analytics-nav', 'buttons', {
    title: 'Analytics',
    buttons: [
      { label: '📈 Usage Details', action: 'analytics-usage', style: 'ghost' },
      { label: '🤖 Agents', action: 'analytics-agents', style: 'ghost' },
      { label: '🔄 Refresh', action: 'analytics-dashboard', style: 'ghost' },
    ],
  }));

  return ops;
}

/**
 * Build the detailed usage view.
 * @param {string} userId
 * @returns {import('./framework.js').GenUIOp[]}
 */
function buildUsageView(userId) {
  const ops = [];
  const monthlyUsage = getUsageRange(userId, monthStart(), todayUTC());
  const weeklyUsage = getUsageRange(userId, daysAgo(7), todayUTC());
  const { models, daily } = getUsageWithModels(userId, daysAgo(30), todayUTC());

  // Monthly totals
  ops.push(upsert('analytics-monthly', 'stats', {
    title: '📈 This Month',
    items: [
      { label: 'Messages', value: formatNumber(monthlyUsage.messages) },
      { label: 'Tokens', value: formatNumber(monthlyUsage.tokens) },
      { label: 'Active Days', value: String(monthlyUsage.days.length) },
    ],
  }));

  // Weekly bar chart
  if (weeklyUsage.days.length > 0) {
    ops.push(upsert('analytics-week-bar', 'chart-bar', {
      title: 'Messages (Last 7 Days)',
      labels: weeklyUsage.days.map(d => d.date.slice(5)), // MM-DD
      datasets: [{
        label: 'Messages',
        data: weeklyUsage.days.map(d => d.messages),
        color: 'blue',
      }],
    }));
  }

  // Token usage by model (pie chart)
  const modelEntries = Object.entries(models);
  if (modelEntries.length > 0) {
    const modelColors = ['blue', 'green', 'orange', 'purple', 'red', 'teal'];
    ops.push(upsert('analytics-models', 'chart-pie', {
      title: 'Token Usage by Model (30 days)',
      slices: modelEntries.map(([model, stats], i) => ({
        label: model,
        value: stats.tokens,
        color: modelColors[i % modelColors.length],
      })),
    }));
  }

  // Daily table (last 7 days)
  if (daily.length > 0) {
    const recentDays = daily.slice(-7);
    ops.push(upsert('analytics-daily-table', 'table', {
      title: 'Daily Breakdown',
      headers: ['Date', 'Messages', 'Tokens'],
      rows: recentDays.map(d => [
        d.date,
        formatNumber(d.messages),
        formatNumber(d.tokens),
      ]),
    }));
  }

  // Navigation
  ops.push(upsert('analytics-nav', 'buttons', {
    title: 'Navigation',
    buttons: [
      { label: '← Dashboard', action: 'analytics-dashboard', style: 'ghost' },
      { label: '🤖 Agents', action: 'analytics-agents', style: 'ghost' },
    ],
  }));

  return ops;
}

/**
 * Build the agent analytics view.
 * @returns {import('./framework.js').GenUIOp[]}
 */
function buildAgentView() {
  const ops = [];
  const agents = getAgentStats();
  const plans = getPlanDistribution();

  // Agent stats
  if (agents.length > 0) {
    ops.push(upsert('analytics-agents-table', 'table', {
      title: '🤖 Agent Performance',
      headers: ['Agent', 'Model', 'Conversations'],
      rows: agents.map(a => [
        a.name,
        a.model,
        String(a.conversations),
      ]),
    }));

    // Top agents bar chart
    const top5 = agents.slice(0, 5);
    if (top5.length > 0) {
      ops.push(upsert('analytics-agents-bar', 'chart-bar', {
        title: 'Top Agents by Conversations',
        labels: top5.map(a => a.name),
        datasets: [{
          label: 'Conversations',
          data: top5.map(a => a.conversations),
          color: 'purple',
        }],
      }));
    }
  } else {
    ops.push(upsert('analytics-agents-empty', 'card', {
      title: '🤖 No Agents',
      text: 'No agents configured yet.',
    }));
  }

  // Plan distribution
  if (plans.length > 0) {
    const planColors = { free: 'gray', pro: 'blue', team: 'green', byok: 'orange', enterprise: 'purple' };
    ops.push(upsert('analytics-plans', 'chart-pie', {
      title: 'User Plans',
      slices: plans.map(p => ({
        label: p.plan,
        value: p.count,
        color: planColors[p.plan] || 'gray',
      })),
    }));
  }

  // Navigation
  ops.push(upsert('analytics-nav', 'buttons', {
    title: 'Navigation',
    buttons: [
      { label: '← Dashboard', action: 'analytics-dashboard', style: 'ghost' },
      { label: '📈 Usage', action: 'analytics-usage', style: 'ghost' },
    ],
  }));

  return ops;
}

// ─── Action Handlers ────────────────────────────────────────────────────────

/**
 * Handle analytics-dashboard: show overview.
 * @param {string} userId
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleDashboard(userId) {
  return buildDashboard(userId);
}

/**
 * Handle analytics-usage: show usage details.
 * @param {string} userId
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleUsage(userId) {
  return buildUsageView(userId);
}

/**
 * Handle analytics-agents: show agent stats.
 * @returns {import('./framework.js').GenUIOp[]}
 */
function handleAgents() {
  return buildAgentView();
}

// ─── Widget Definition ──────────────────────────────────────────────────────

/** @type {import('./framework.js').WidgetDef} */
export const analyticsWidget = {
  prefix: 'analytics',
  name: 'Analytics',

  /**
   * Initialize the analytics widget.
   * @param {import('./framework.js').WidgetContext} ctx
   */
  init(ctx) {
    db = ctx.db;
    // No extra tables — reads from existing billing/session/user tables
    console.log('[analytics] Widget initialized');
  },

  /**
   * Route an action to the appropriate handler.
   * @param {string} userId
   * @param {string} action
   * @param {Record<string, unknown>} context
   * @returns {import('./framework.js').GenUIOp[]}
   */
  handleAction(userId, action, context) {
    switch (action) {
      case 'analytics-dashboard':
        return handleDashboard(userId);
      case 'analytics-usage':
        return handleUsage(userId);
      case 'analytics-agents':
        return handleAgents();
      default:
        return [toast(`Unknown analytics action: ${action}`, 'error')];
    }
  },

  /**
   * Cleanup.
   */
  destroy() {
    db = null;
  },
};
