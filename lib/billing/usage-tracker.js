/**
 * @module billing/usage-tracker
 * Per-user daily usage tracking backed by SQLite (better-sqlite3).
 *
 * Counters reset automatically at midnight UTC — each row is keyed
 * by (userId, date) so there's nothing to "reset"; a new day simply
 * starts with zero counters.
 */

import { getPlan, checkQuota as checkPlanQuota } from './plans.js';

/**
 * Get today's date as a YYYY-MM-DD string in UTC.
 * @returns {string}
 */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get midnight UTC of the next day as an ISO string.
 * @returns {string}
 */
function nextMidnightUTC() {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ));
  return tomorrow.toISOString();
}

export class UsageTracker {
  /** @type {import('better-sqlite3').Database} */
  #db;

  /**
   * @param {import('better-sqlite3').Database} db - better-sqlite3 database instance
   */
  constructor(db) {
    if (!db) throw new Error('UsageTracker requires a database instance');
    this.#db = db;
    this.#ensureTable();
  }

  /**
   * Create the usage_daily table if it doesn't exist.
   */
  #ensureTable() {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS usage_daily (
        userId         TEXT    NOT NULL,
        date           TEXT    NOT NULL,
        messages       INTEGER NOT NULL DEFAULT 0,
        tokens         INTEGER NOT NULL DEFAULT 0,
        modelBreakdown TEXT    NOT NULL DEFAULT '{}',
        PRIMARY KEY (userId, date)
      );

      CREATE INDEX IF NOT EXISTS idx_usage_daily_userId
        ON usage_daily(userId);
      CREATE INDEX IF NOT EXISTS idx_usage_daily_date
        ON usage_daily(date);
    `);
  }

  /**
   * Record usage for a user. Increments today's daily counters.
   *
   * @param {string} userId - User ID
   * @param {{ messages?: number, tokens?: number, model?: string }} usage
   */
  async recordUsage(userId, { messages = 0, tokens = 0, model }) {
    const date = todayUTC();

    // Upsert the daily row
    const existing = this.#db.prepare(
      'SELECT messages, tokens, modelBreakdown FROM usage_daily WHERE userId = ? AND date = ?'
    ).get(userId, date);

    if (!existing) {
      // First usage today — insert
      const breakdown = model ? { [model]: { messages, tokens } } : {};
      this.#db.prepare(
        'INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, date, messages, tokens, JSON.stringify(breakdown));
    } else {
      // Update existing row
      const breakdown = JSON.parse(existing.modelBreakdown || '{}');
      if (model) {
        if (!breakdown[model]) breakdown[model] = { messages: 0, tokens: 0 };
        breakdown[model].messages += messages;
        breakdown[model].tokens += tokens;
      }

      this.#db.prepare(
        'UPDATE usage_daily SET messages = messages + ?, tokens = tokens + ?, modelBreakdown = ? WHERE userId = ? AND date = ?'
      ).run(messages, tokens, JSON.stringify(breakdown), userId, date);
    }
  }

  /**
   * Get usage for a specific day (defaults to today).
   *
   * @param {string} userId - User ID
   * @param {string} [date] - Date in YYYY-MM-DD format (default: today UTC)
   * @returns {Promise<{ messages: number, tokens: number, modelBreakdown: Record<string, { messages: number, tokens: number }> }>}
   */
  async getUsage(userId, date) {
    const d = date ?? todayUTC();
    const row = this.#db.prepare(
      'SELECT messages, tokens, modelBreakdown FROM usage_daily WHERE userId = ? AND date = ?'
    ).get(userId, d);

    if (!row) {
      return { messages: 0, tokens: 0, modelBreakdown: {} };
    }

    return {
      messages: row.messages,
      tokens: row.tokens,
      modelBreakdown: JSON.parse(row.modelBreakdown || '{}'),
    };
  }

  /**
   * Get usage records for a date range (inclusive).
   *
   * @param {string} userId - User ID
   * @param {string} startDate - Start date YYYY-MM-DD
   * @param {string} endDate - End date YYYY-MM-DD
   * @returns {Promise<Array<{ date: string, messages: number, tokens: number, modelBreakdown: Record<string, unknown> }>>}
   */
  async getUsageRange(userId, startDate, endDate) {
    const rows = this.#db.prepare(
      'SELECT date, messages, tokens, modelBreakdown FROM usage_daily WHERE userId = ? AND date >= ? AND date <= ? ORDER BY date ASC'
    ).all(userId, startDate, endDate);

    return rows.map((row) => ({
      date: row.date,
      messages: row.messages,
      tokens: row.tokens,
      modelBreakdown: JSON.parse(row.modelBreakdown || '{}'),
    }));
  }

  /**
   * Check whether a user is within their plan's quotas for today.
   *
   * @param {string} userId - User ID
   * @param {string} planId - Plan ID ('free', 'pro', 'team', 'byok')
   * @returns {Promise<{ allowed: boolean, remaining: { messages: number, tokens: number }, resetAt: string }>}
   */
  async checkQuota(userId, planId) {
    const plan = getPlan(planId);
    if (!plan) {
      return {
        allowed: false,
        remaining: { messages: 0, tokens: 0 },
        resetAt: nextMidnightUTC(),
      };
    }

    const usage = await this.getUsage(userId);
    const result = checkPlanQuota(usage, plan);

    return {
      allowed: result.allowed,
      remaining: result.remaining,
      resetAt: result.resetAt,
    };
  }

  /**
   * Get aggregated monthly usage totals.
   *
   * @param {string} userId - User ID
   * @param {string} [month] - Month in YYYY-MM format (default: current month)
   * @returns {Promise<{ month: string, totalMessages: number, totalTokens: number, days: number, modelBreakdown: Record<string, { messages: number, tokens: number }> }>}
   */
  async getMonthlyUsage(userId, month) {
    const m = month ?? todayUTC().slice(0, 7); // YYYY-MM
    const startDate = `${m}-01`;
    // End date: last day of month
    const [year, mon] = m.split('-').map(Number);
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    const endDate = `${m}-${String(lastDay).padStart(2, '0')}`;

    const rows = await this.getUsageRange(userId, startDate, endDate);

    let totalMessages = 0;
    let totalTokens = 0;
    /** @type {Record<string, { messages: number, tokens: number }>} */
    const modelBreakdown = {};

    for (const row of rows) {
      totalMessages += row.messages;
      totalTokens += row.tokens;

      // Merge model breakdowns
      for (const [model, stats] of Object.entries(row.modelBreakdown)) {
        if (!modelBreakdown[model]) modelBreakdown[model] = { messages: 0, tokens: 0 };
        const s = /** @type {{ messages: number, tokens: number }} */ (stats);
        modelBreakdown[model].messages += s.messages;
        modelBreakdown[model].tokens += s.tokens;
      }
    }

    return {
      month: m,
      totalMessages,
      totalTokens,
      days: rows.length,
      modelBreakdown,
    };
  }
}
