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

/** @type {Record<string, TierConfig>} */
const TIER_CONFIGS = {
  free: {
    messagesPerDay: 50,
    tokensPerDay: 500_000,
    toolCallsPerDay: 100,
    uploadsPerDay: 10,
    uploadMaxMb: 5,
    agentsMax: 2,
    messagesPerMinute: 10,
    bypassTokenQuota: false,
  },
  pro: {  // Scratchy Pro — €14.99/mo
    messagesPerDay: 500,
    tokensPerDay: 5_000_000,
    toolCallsPerDay: 1_000,
    uploadsPerDay: 100,
    uploadMaxMb: 20,
    agentsMax: 10,
    messagesPerMinute: 30,
    bypassTokenQuota: false,
  },
  max: {  // Scratchy Max — €39.99/mo
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
    `);
  }

  _prepareStatements() {
    this.#stmts.insertEvent = this.#db.prepare(
      `INSERT INTO usage_events (userId, type, count, metadata) VALUES (?, ?, ?, ?)`
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

    this.#stmts.getDailyUsage = this.#db.prepare(
      `SELECT * FROM usage_daily WHERE userId = ? AND date = date('now')`
    );

    this.#stmts.getUsageRange = this.#db.prepare(
      `SELECT date, messages, tokens, toolCalls, uploads, genuiOps
       FROM usage_daily WHERE userId = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`
    );

    this.#stmts.getUserPlan = this.#db.prepare(
      `SELECT plan, apiKey FROM users WHERE id = ?`
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
   */
  log(userId, type, count = 1, metadata = {}) {
    try {
      this.#stmts.insertEvent.run(userId, type, count, JSON.stringify(metadata));

      // Update daily aggregate
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
   * Get today's usage for a user.
   * @param {string} userId
   * @returns {{ messages: number, tokens: number, toolCalls: number, uploads: number, genuiOps: number }}
   */
  getToday(userId) {
    return this._getDailyUsage(userId);
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
