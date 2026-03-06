/**
 * @module lib/embedding-quota
 * Per-user embedding rate limiter for Scratchy v2.
 *
 * Wraps an embedding provider with per-user daily quotas.
 * Quota limits are read from admin_config at runtime (hot-reloadable).
 *
 * Default limits:
 *   - Free tier: 200 embeds/day
 *   - Pro tier: 1000 embeds/day
 *   - BYOK users: unlimited (-1)
 *   - Admin: unlimited
 *
 * Usage counts reset at midnight UTC.
 */

import * as adminConfig from '../state/admin-config.js';

/* ------------------------------------------------------------------ */
/*  In-memory counters (reset at midnight UTC)                        */
/* ------------------------------------------------------------------ */

/**
 * @type {Map<string, {count: number, date: string}>}
 * Key: userId, Value: { count, date (YYYY-MM-DD) }
 */
const _counters = new Map();

/** Get today's date string in UTC */
function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get the current embed count for a user today.
 * @param {string} userId
 * @returns {number}
 */
function getCount(userId) {
  const entry = _counters.get(userId);
  if (!entry || entry.date !== todayUTC()) return 0;
  return entry.count;
}

/**
 * Increment the embed count for a user.
 * @param {string} userId
 * @param {number} [amount=1]
 */
function increment(userId, amount = 1) {
  const today = todayUTC();
  const entry = _counters.get(userId);
  if (!entry || entry.date !== today) {
    _counters.set(userId, { count: amount, date: today });
  } else {
    entry.count += amount;
  }
}

/* ------------------------------------------------------------------ */
/*  Quota configuration                                               */
/* ------------------------------------------------------------------ */

/**
 * Get the daily embedding limit for a user based on their plan.
 *
 * @param {string} planId - 'free', 'pro', 'max', 'admin'
 * @param {boolean} isByok - Whether user has their own API key
 * @returns {number} Daily limit (-1 = unlimited)
 */
function getDailyLimit(planId, isByok = false) {
  // Admin always unlimited
  if (planId === 'admin') return -1;

  // BYOK users get their own limit (default: unlimited)
  if (isByok) {
    return adminConfig.get('embedding_daily_limit_byok') ?? -1;
  }

  // Plan-based limits
  switch (planId) {
    case 'pro':
    case 'max':
      return adminConfig.get('embedding_daily_limit_pro') ?? 1000;
    default:
      return adminConfig.get('embedding_daily_limit_free') ?? 200;
  }
}

/* ------------------------------------------------------------------ */
/*  Quota check                                                       */
/* ------------------------------------------------------------------ */

/**
 * Check if a user can make an embedding call.
 *
 * @param {string} userId
 * @param {Object} [opts]
 * @param {string} [opts.planId='free']
 * @param {boolean} [opts.isByok=false]
 * @param {string} [opts.role]
 * @returns {{allowed: boolean, remaining: number, limit: number, used: number}}
 */
export function checkEmbeddingQuota(userId, opts = {}) {
  const { planId = 'free', isByok = false, role } = opts;

  const effectivePlan = role === 'admin' ? 'admin' : planId;
  const limit = getDailyLimit(effectivePlan, isByok);
  const used = getCount(userId);

  // -1 means unlimited
  if (limit === -1) {
    return { allowed: true, remaining: -1, limit: -1, used };
  }

  const remaining = Math.max(0, limit - used);
  return {
    allowed: used < limit,
    remaining,
    limit,
    used,
  };
}

/**
 * Record an embedding call for quota tracking.
 *
 * @param {string} userId
 * @param {number} [count=1] - Number of embeds in this call (for batch)
 */
export function recordEmbeddingUsage(userId, count = 1) {
  increment(userId, count);
}

/* ------------------------------------------------------------------ */
/*  Quota-wrapped embedding provider                                  */
/* ------------------------------------------------------------------ */

/**
 * Wrap an embedding provider with per-user quota enforcement.
 *
 * @param {import('./embeddings.js').EmbeddingProvider} provider - Base provider
 * @param {Object} opts
 * @param {(userId: string) => {planId: string, isByok: boolean, role: string}} opts.getUserPlan
 *   Function to look up user plan info (called on each embed)
 * @returns {Object} Wrapped provider with userId-aware methods
 */
export function createQuotaProvider(provider, opts) {
  const { getUserPlan } = opts;

  return {
    dimensions: provider.dimensions,

    /**
     * Embed with quota check.
     * @param {string} text
     * @param {string} userId
     * @returns {Promise<Float32Array>}
     */
    async embed(text, userId) {
      if (userId) {
        const plan = getUserPlan(userId);
        const quota = checkEmbeddingQuota(userId, plan);
        if (!quota.allowed) {
          throw new Error(`Embedding quota exceeded (${quota.used}/${quota.limit} today). Resets at midnight UTC.`);
        }
      }

      const result = await provider.embed(text);
      if (userId) recordEmbeddingUsage(userId, 1);
      return result;
    },

    /**
     * Batch embed with quota check.
     * @param {string[]} texts
     * @param {string} userId
     * @returns {Promise<Float32Array[]>}
     */
    async embedBatch(texts, userId) {
      if (texts.length === 0) return [];

      if (userId) {
        const plan = getUserPlan(userId);
        const quota = checkEmbeddingQuota(userId, plan);
        if (!quota.allowed) {
          throw new Error(`Embedding quota exceeded (${quota.used}/${quota.limit} today). Resets at midnight UTC.`);
        }
        // Check if batch would exceed remaining
        if (quota.limit !== -1 && quota.remaining < texts.length) {
          throw new Error(`Embedding batch (${texts.length}) exceeds remaining quota (${quota.remaining}/${quota.limit} today).`);
        }
      }

      const result = await provider.embedBatch(texts);
      if (userId) recordEmbeddingUsage(userId, texts.length);
      return result;
    },

    /**
     * Non-quota embed (for system/admin operations like indexing).
     */
    async embedSystem(text) {
      return provider.embed(text);
    },

    async embedBatchSystem(texts) {
      return provider.embedBatch(texts);
    },
  };
}

/**
 * Get quota stats for all users (admin dashboard).
 * @returns {Array<{userId: string, used: number, date: string}>}
 */
export function getAllQuotaStats() {
  const today = todayUTC();
  const stats = [];
  for (const [userId, entry] of _counters) {
    if (entry.date === today) {
      stats.push({ userId, used: entry.count, date: entry.date });
    }
  }
  return stats.sort((a, b) => b.used - a.used);
}

/**
 * Reset quota for a specific user (admin action).
 * @param {string} userId
 */
export function resetUserQuota(userId) {
  _counters.delete(userId);
}
