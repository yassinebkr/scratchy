/**
 * @module lib/usage-tracker
 * Scratchy v2 — Usage Tracking & Rate Limiting
 *
 * Tracks per-user usage (messages, tokens, tool calls, file uploads)
 * and enforces tier-based rate limits.
 *
 * Architecture:
 *   - SQLite `usage_events` table for persistent tracking
 *   - In-memory sliding window for fast rate limit checks
 *   - Tier configs define quotas (messages/day, tokens/day, etc.)
 *   - BYOK users bypass token quotas (still rate-limited on messages)
 */

/* ------------------------------------------------------------------ */
/*  Tier Configurations                                               */
/* ------------------------------------------------------------------ */

/**
 * @typedef {Object} TierConfig
 * @property {number} messagesPerDay     — max chat messages per 24h
 * @property {number} tokensPerDay       — max input+output tokens per 24h
 * @property {number} toolCallsPerDay    — max tool invocations per 24h
 * @property {number} uploadsPerDay      — max file uploads per 24h
 * @property {number} uploadMaxMb        — max file size per upload (MB)
 * @property {number} agentsMax          — max custom agents
 * @property {number} messagesPerMinute  — burst rate limit
 * @property {boolean} bypassTokenQuota  — if true, tokensPerDay is not enforced
 */

/** Plan display metadata */
export const PLAN_META = {
  free:       { label: 'Self-Hosted', price: null, description: 'Open-core — run it yourself' },
  pro:        { label: 'Scratchy Pro', price: '€14.99/mo', description: 'Cloud hosted for individuals' },
  max:        { label: 'Scratchy Max', price: '€39.99/mo', description: 'Cloud hosted for power users' },
  byok:       { label: 'BYOK', price: null, description: 'Use your own API key — bypasses quotas' },
  enterprise: { label: 'Enterprise', price: 'Custom', description: 'Contact us for teams' },
};

/** @type {Record<string, TierConfig>} */
const TIER_CONFIGS = {
  free: {  // Self-Hosted (open-core)
    messagesPerDay: 50,
    tokensPerDay: 500_000,
    toolCallsPerDay: 100,
    uploadsPerDay: 10,
    uploadMaxMb: 5,
    agentsMax: 2,
    messagesPerMinute: 10,
    bypassTokenQuota: false,
  },
  pro: {  // Scratchy Pro — €14.99/mo (cloud)
    messagesPerDay: 500,
    tokensPerDay: 5_000_000,
    toolCallsPerDay: 1_000,
    uploadsPerDay: 100,
    uploadMaxMb: 20,
    agentsMax: 10,
    messagesPerMinute: 30,
    bypassTokenQuota: false,
  },
  max: {  // Scratchy Max — €39.99/mo (cloud)
    messagesPerDay: 2_000,
    tokensPerDay: 20_000_000,
    toolCallsPerDay: 5_000,
    uploadsPerDay: 500,
    uploadMaxMb: 50,
    agentsMax: -1, // unlimited
    messagesPerMinute: 60,
    bypassTokenQuota: false,
  },
  team: {  // Legacy alias → same as max
    messagesPerDay: 2_000,
    tokensPerDay: 20_000_000,
    toolCallsPerDay: 5_000,
    uploadsPerDay: 500,
    uploadMaxMb: 50,
    agentsMax: -1,
    messagesPerMinute: 60,
    bypassTokenQuota: false,
  },
  byok: {
    messagesPerDay: 10_000,
    tokensPerDay: -1, // unlimited (own key)
    toolCallsPerDay: 10_000,
    uploadsPerDay: 500,
    uploadMaxMb: 50,
    agentsMax: -1,
    messagesPerMinute: 60,
    bypassTokenQuota: true,
  },
  enterprise: {
    messagesPerDay: -1, // unlimited
    tokensPerDay: -1,
    toolCallsPerDay: -1,
    uploadsPerDay: -1,
    uploadMaxMb: 100,
    agentsMax: -1,
    messagesPerMinute: 120,
    bypassTokenQuota: true,
  },
};

/* ------------------------------------------------------------------ */
/*  In-memory rate limit windows                                      */
/* ------------------------------------------------------------------ */

/** @type {Map<string, number[]>} userId → array of epoch-ms timestamps */
const _minuteWindows = new Map();

/** Sliding window cleanup interval */
const WINDOW_CLEANUP_MS = 60_000;

/* ------------------------------------------------------------------ */
/*  UsageTracker class                                                */
/* ------------------------------------------------------------------ */

export class UsageTracker {
  /** @type {import('better-sqlite3').Database} */
  #db;

  /** Prepared statements (lazy-init) */
  #stmts = {};

  constructor(db) {
    this.#db = db;
    this._ensureTable();
    this._prepareStatements();

    // Periodic cleanup of in-memory windows
    this._cleanupInterval = setInterval(() => this._cleanupWindows(), WINDOW_CLEANUP_MS);
  }

  /* ---------------------------------------------------------------- */
  /*  Schema                                                          */
  /* ---------------------------------------------------------------- */

  _ensureTable() {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        userId    TEXT NOT NULL,
        type      TEXT NOT NULL CHECK (type IN ('message', 'tokens', 'tool_call', 'upload', 'genui_op')),
        count     INTEGER NOT NULL DEFAULT 1,
        metadata  TEXT DEFAULT '{}',
        createdAt TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_usage_userId_type_date
        ON usage_events(userId, type, createdAt);

      -- Daily aggregate view for fast quota checks
      CREATE TABLE IF NOT EXISTS usage_daily (
        userId    TEXT NOT NULL,
        date      TEXT NOT NULL,
        messages  INTEGER NOT NULL DEFAULT 0,
        tokens    INTEGER NOT NULL DEFAULT 0,
        toolCalls INTEGER NOT NULL DEFAULT 0,
        uploads   INTEGER NOT NULL DEFAULT 0,
        genuiOps  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (userId, date)
      );

      -- Per-agent daily aggregates
      CREATE TABLE IF NOT EXISTS usage_daily_agent (
        userId    TEXT NOT NULL,
        agentId   TEXT NOT NULL,
        date      TEXT NOT NULL,
        messages  INTEGER NOT NULL DEFAULT 0,
        tokens    INTEGER NOT NULL DEFAULT 0,
        toolCalls INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (userId, agentId, date)
      );

      CREATE INDEX IF NOT EXISTS idx_usage_daily_agent_userId_date
        ON usage_daily_agent(userId, date);
    `);

    // Migration: add agentId column to usage_events if missing
    const cols = this.#db.pragma('table_info(usage_events)');
    if (!cols.some(c => c.name === 'agentId')) {
      this.#db.exec(`ALTER TABLE usage_events ADD COLUMN agentId TEXT`);
      this.#db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_agentId ON usage_events(agentId)`);
    }
  }

  _prepareStatements() {
    this.#stmts.insertEvent = this.#db.prepare(
      `INSERT INTO usage_events (userId, type, count, metadata, agentId) VALUES (?, ?, ?, ?, ?)`
    );

    this.#stmts.upsertDaily = this.#db.prepare(`
      INSERT INTO usage_daily (userId, date, messages, tokens, toolCalls, uploads, genuiOps)
      VALUES (?, date('now'), ?, ?, ?, ?, ?)
      ON CONFLICT(userId, date) DO UPDATE SET
        messages  = messages  + excluded.messages,
        tokens    = tokens    + excluded.tokens,
        toolCalls = toolCalls + excluded.toolCalls,
        uploads   = uploads   + excluded.uploads,
        genuiOps  = genuiOps  + excluded.genuiOps
    `);

    this.#stmts.upsertDailyAgent = this.#db.prepare(`
      INSERT INTO usage_daily_agent (userId, agentId, date, messages, tokens, toolCalls)
      VALUES (?, ?, date('now'), ?, ?, ?)
      ON CONFLICT(userId, agentId, date) DO UPDATE SET
        messages  = messages  + excluded.messages,
        tokens    = tokens    + excluded.tokens,
        toolCalls = toolCalls + excluded.toolCalls
    `);

    this.#stmts.getDailyUsage = this.#db.prepare(
      `SELECT * FROM usage_daily WHERE userId = ? AND date = date('now')`
    );

    this.#stmts.getAgentDailyUsage = this.#db.prepare(
      `SELECT * FROM usage_daily_agent WHERE userId = ? AND agentId = ? AND date = date('now')`
    );

    this.#stmts.getAllAgentsDailyUsage = this.#db.prepare(
      `SELECT agentId, messages, tokens, toolCalls
       FROM usage_daily_agent
       WHERE userId = ? AND date = date('now')
       ORDER BY messages DESC`
    );

    this.#stmts.getUsageRange = this.#db.prepare(
      `SELECT date, messages, tokens, toolCalls, uploads, genuiOps
       FROM usage_daily WHERE userId = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`
    );

    this.#stmts.getUserPlan = this.#db.prepare(
      `SELECT plan, apiKey FROM users WHERE id = ?`
    );

    this.#stmts.getAgentLimits = this.#db.prepare(
      `SELECT messagesPerDay, tokensPerDay FROM agents WHERE id = ?`
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Logging                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Log a usage event.
   * @param {string} userId
   * @param {'message'|'tokens'|'tool_call'|'upload'|'genui_op'} type
   * @param {number} [count=1]
   * @param {object} [metadata={}]
   * @param {string|null} [agentId=null] — optional agent to attribute usage to
   */
  log(userId, type, count = 1, metadata = {}, agentId = null) {
    try {
      this.#stmts.insertEvent.run(userId, type, count, JSON.stringify(metadata), agentId);

      // Update user-level daily aggregate
      const deltas = { messages: 0, tokens: 0, toolCalls: 0, uploads: 0, genuiOps: 0 };
      switch (type) {
        case 'message':   deltas.messages  = count; break;
        case 'tokens':    deltas.tokens    = count; break;
        case 'tool_call': deltas.toolCalls = count; break;
        case 'upload':    deltas.uploads   = count; break;
        case 'genui_op':  deltas.genuiOps  = count; break;
      }
      this.#stmts.upsertDaily.run(
        userId, deltas.messages, deltas.tokens, deltas.toolCalls, deltas.uploads, deltas.genuiOps
      );

      // Update per-agent daily aggregate if agentId provided
      if (agentId && (type === 'message' || type === 'tokens' || type === 'tool_call')) {
        const ad = { messages: 0, tokens: 0, toolCalls: 0 };
        if (type === 'message')   ad.messages  = count;
        if (type === 'tokens')    ad.tokens    = count;
        if (type === 'tool_call') ad.toolCalls = count;
        this.#stmts.upsertDailyAgent.run(userId, agentId, ad.messages, ad.tokens, ad.toolCalls);
      }
    } catch (err) {
      console.error('[usage-tracker] Failed to log event:', err.message);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Quota checks                                                    */
  /* ---------------------------------------------------------------- */

  /**
   * Check if a user can perform an action.
   * @param {string} userId
   * @param {'message'|'tokens'|'tool_call'|'upload'} type
   * @param {number} [count=1] — how many units this action costs
   * @returns {{ allowed: boolean, remaining: number, limit: number, resetAt: string }}
   */
  check(userId, type, count = 1) {
    const tier = this._getUserTier(userId);
    const config = TIER_CONFIGS[tier] || TIER_CONFIGS.free;
    const daily = this._getDailyUsage(userId);

    let used = 0;
    let limit = 0;

    switch (type) {
      case 'message':
        used = daily.messages;
        limit = config.messagesPerDay;
        break;
      case 'tokens':
        if (config.bypassTokenQuota) return { allowed: true, remaining: -1, limit: -1, resetAt: this._nextMidnight() };
        used = daily.tokens;
        limit = config.tokensPerDay;
        break;
      case 'tool_call':
        used = daily.toolCalls;
        limit = config.toolCallsPerDay;
        break;
      case 'upload':
        used = daily.uploads;
        limit = config.uploadsPerDay;
        break;
    }

    // -1 means unlimited
    if (limit === -1) return { allowed: true, remaining: -1, limit: -1, resetAt: this._nextMidnight() };

    const remaining = Math.max(0, limit - used);
    return {
      allowed: used + count <= limit,
      remaining,
      limit,
      resetAt: this._nextMidnight(),
    };
  }

  /**
   * Check per-minute burst rate limit (in-memory).
   * @param {string} userId
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  checkBurst(userId) {
    const tier = this._getUserTier(userId);
    const config = TIER_CONFIGS[tier] || TIER_CONFIGS.free;
    const limit = config.messagesPerMinute;

    const now = Date.now();
    const windowStart = now - 60_000;

    let timestamps = _minuteWindows.get(userId);
    if (!timestamps) {
      timestamps = [];
      _minuteWindows.set(userId, timestamps);
    }

    // Trim old entries
    while (timestamps.length > 0 && timestamps[0] < windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= limit) {
      const oldestInWindow = timestamps[0];
      const retryAfterMs = (oldestInWindow + 60_000) - now;
      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    // Record this request
    timestamps.push(now);
    return { allowed: true, retryAfterMs: 0 };
  }

  /* ---------------------------------------------------------------- */
  /*  Queries                                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Check if a specific agent is within its custom quotas.
   * Falls back to user-level check if no per-agent limits are set.
   * @param {string} userId
   * @param {string} agentId
   * @param {'message'|'tokens'|'tool_call'} type
   * @param {number} [count=1]
   * @returns {{ allowed: boolean, remaining: number, limit: number, resetAt: string, scope: 'agent'|'user' }}
   */
  checkAgent(userId, agentId, type, count = 1) {
    try {
      const agent = this.#stmts.getAgentLimits.get(agentId);
      if (!agent) return { ...this.check(userId, type, count), scope: 'user' };

      let agentLimit = null;
      if (type === 'message' && agent.messagesPerDay != null) agentLimit = agent.messagesPerDay;
      if (type === 'tokens' && agent.tokensPerDay != null) agentLimit = agent.tokensPerDay;

      // No per-agent limit for this type → fall back to user-level
      if (agentLimit == null) return { ...this.check(userId, type, count), scope: 'user' };

      const usage = this._getAgentDailyUsage(userId, agentId);
      const used = type === 'message' ? usage.messages : type === 'tokens' ? usage.tokens : usage.toolCalls;
      const remaining = Math.max(0, agentLimit - used);

      return {
        allowed: used + count <= agentLimit,
        remaining,
        limit: agentLimit,
        resetAt: this._nextMidnight(),
        scope: 'agent',
      };
    } catch {
      return { ...this.check(userId, type, count), scope: 'user' };
    }
  }

  /**
   * Get today's usage for a user.
   * @param {string} userId
   * @returns {{ messages: number, tokens: number, toolCalls: number, uploads: number, genuiOps: number }}
   */
  getToday(userId) {
    return this._getDailyUsage(userId);
  }

  /**
   * Get today's usage for a specific agent.
   * @param {string} userId
   * @param {string} agentId
   * @returns {{ messages: number, tokens: number, toolCalls: number }}
   */
  getAgentToday(userId, agentId) {
    return this._getAgentDailyUsage(userId, agentId);
  }

  /**
   * Get usage for all agents today.
   * @param {string} userId
   * @returns {Array<{ agentId: string, messages: number, tokens: number, toolCalls: number }>}
   */
  getAgentUsage(userId) {
    try {
      return this.#stmts.getAllAgentsDailyUsage.all(userId);
    } catch {
      return [];
    }
  }

  /**
   * Get usage for a date range.
   * @param {string} userId
   * @param {string} from — ISO date (YYYY-MM-DD)
   * @param {string} to — ISO date (YYYY-MM-DD)
   * @returns {Array<{ date: string, messages: number, tokens: number, toolCalls: number, uploads: number }>}
   */
  getRange(userId, from, to) {
    return this.#stmts.getUsageRange.all(userId, from, to);
  }

  /**
   * Get the tier config for a user's plan.
   * @param {string} userId
   * @returns {TierConfig}
   */
  getLimits(userId) {
    const tier = this._getUserTier(userId);
    return { ...TIER_CONFIGS[tier] || TIER_CONFIGS.free, tier };
  }

  /* ---------------------------------------------------------------- */
  /*  Internals                                                       */
  /* ---------------------------------------------------------------- */

  _getUserTier(userId) {
    try {
      const row = this.#stmts.getUserPlan.get(userId);
      if (!row) return 'free';
      // BYOK: if user has their own API key, treat as byok tier (unless already higher)
      if (row.apiKey && row.plan === 'free') return 'byok';
      return row.plan || 'free';
    } catch {
      return 'free';
    }
  }

  _getDailyUsage(userId) {
    try {
      const row = this.#stmts.getDailyUsage.get(userId);
      return row || { messages: 0, tokens: 0, toolCalls: 0, uploads: 0, genuiOps: 0 };
    } catch {
      return { messages: 0, tokens: 0, toolCalls: 0, uploads: 0, genuiOps: 0 };
    }
  }

  _getAgentDailyUsage(userId, agentId) {
    try {
      const row = this.#stmts.getAgentDailyUsage.get(userId, agentId);
      return row || { messages: 0, tokens: 0, toolCalls: 0 };
    } catch {
      return { messages: 0, tokens: 0, toolCalls: 0 };
    }
  }

  _nextMidnight() {
    const d = new Date();
    d.setUTCHours(24, 0, 0, 0);
    return d.toISOString();
  }

  _cleanupWindows() {
    const cutoff = Date.now() - 120_000; // 2 min old
    for (const [userId, timestamps] of _minuteWindows) {
      while (timestamps.length > 0 && timestamps[0] < cutoff) {
        timestamps.shift();
      }
      if (timestamps.length === 0) _minuteWindows.delete(userId);
    }
  }

  /** Cleanup on shutdown */
  destroy() {
    if (this._cleanupInterval) clearInterval(this._cleanupInterval);
  }
}

/** @type {UsageTracker|null} */
let _instance = null;

/**
 * Initialize the usage tracker singleton.
 * @param {import('better-sqlite3').Database} db
 * @returns {UsageTracker}
 */
export function initUsageTracker(db) {
  if (_instance) return _instance;
  _instance = new UsageTracker(db);
  return _instance;
}

/**
 * Get the usage tracker singleton.
 * @returns {UsageTracker}
 */
export function getUsageTracker() {
  if (!_instance) throw new Error('UsageTracker not initialized — call initUsageTracker(db) first');
  return _instance;
}

/**
 * Get tier config by plan name.
 * @param {string} plan
 * @returns {TierConfig}
 */
export function getTierConfig(plan) {
  return TIER_CONFIGS[plan] || TIER_CONFIGS.free;
}
