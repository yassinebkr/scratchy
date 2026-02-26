/**
 * @module lib/memory-consolidation
 * Memory consolidation engine: merges near-duplicate facts by embedding similarity,
 * manages confidence scoring with boost/reduce operations, applies time-based
 * relevance decay, and enforces plan-based memory quotas.
 *
 * Designed as pure functions where possible, with a ConsolidationScheduler class
 * for periodic orchestration.
 *
 * Works with state/memory.js for persistence and lib/embeddings.js for vector math.
 * Uses state/memory.js getChunkClusters() for embedding similarity grouping.
 */

import {
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
} from './embeddings.js';
import { getPlan } from './billing/plans.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Memory quota limits per plan tier */
const MEMORY_QUOTAS = {
  free: 500,
  pro: 5000,
  team: 25000,
  byok: Infinity,
};

/**
 * Category-specific decay rates per day of inactivity.
 * Lower value = faster decay. Applied as confidence × factor^days.
 */
const CATEGORY_DECAY = {
  episodic: 0.92,   // Events/episodes fade fastest
  semantic: 0.97,   // Facts and knowledge persist longest
  procedural: 0.95, // How-to knowledge decays at moderate rate
};

/** 24 hours in milliseconds */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default rate-limit interval for the scheduler (24 hours) */
const SCHEDULER_INTERVAL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count active (non-stale, non-consolidated) memories for a user.
 * @param {Object} db - state/memory module
 * @param {string} userId
 * @returns {number}
 */
function countActive(db, userId) {
  const chunks = db.search(userId, { limit: 100000 });
  return chunks.filter(c => c.category !== 'stale' && !c.consolidatedInto).length;
}

/**
 * Merge multiple fact strings into a single coherent statement.
 * Keeps the most detailed (longest) version as the base and discards near-duplicates.
 * For 3+ distinct facts, appends unique supplementary info in parentheses.
 *
 * @param {string[]} facts - Array of fact strings to merge
 * @returns {string} Merged statement
 */
function mergeFacts(facts) {
  if (facts.length === 0) return '';
  if (facts.length === 1) return facts[0];

  // Sort by length descending — longest is usually most detailed
  const sorted = [...facts].sort((a, b) => b.length - a.length);
  const unique = [...new Set(sorted)];

  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return unique[0]; // Keep the longer/more detailed version

  // For 3+ unique facts, append supplementary info
  return unique[0] + ' (' + unique.slice(1).join('; ') + ')';
}

// ---------------------------------------------------------------------------
// Confidence Management (pure functions)
// ---------------------------------------------------------------------------

/**
 * Boost confidence of a memory by a given amount, capped at 1.0.
 * Use when a fact is re-confirmed, referenced again, or corroborated by new info.
 *
 * @param {Object} db - state/memory module
 * @param {string} memoryId - ID of the memory chunk
 * @param {number} amount - Positive amount to add (e.g. 0.1)
 * @returns {{ id: string, oldConfidence: number, newConfidence: number } | null}
 *   null if the memory doesn't exist
 */
export function boostConfidence(db, memoryId, amount) {
  if (typeof amount !== 'number' || amount < 0) {
    throw new Error('amount must be a non-negative number');
  }

  const chunk = db.get(memoryId);
  if (!chunk) return null;

  const oldConfidence = chunk.confidence;
  const newConfidence = Math.round(Math.min(oldConfidence + amount, 1.0) * 1000) / 1000;

  if (newConfidence !== oldConfidence) {
    db.updateConfidence(memoryId, newConfidence);
  }

  return { id: memoryId, oldConfidence, newConfidence };
}

/**
 * Reduce confidence of a memory by a given amount, floored at 0.0.
 * Use when a fact is contradicted, outdated, or found to be incorrect.
 *
 * @param {Object} db - state/memory module
 * @param {string} memoryId - ID of the memory chunk
 * @param {number} amount - Positive amount to subtract (e.g. 0.2)
 * @returns {{ id: string, oldConfidence: number, newConfidence: number } | null}
 *   null if the memory doesn't exist
 */
export function reduceConfidence(db, memoryId, amount) {
  if (typeof amount !== 'number' || amount < 0) {
    throw new Error('amount must be a non-negative number');
  }

  const chunk = db.get(memoryId);
  if (!chunk) return null;

  const oldConfidence = chunk.confidence;
  const newConfidence = Math.round(Math.max(oldConfidence - amount, 0.0) * 1000) / 1000;

  if (newConfidence !== oldConfidence) {
    db.updateConfidence(memoryId, newConfidence);
  }

  return { id: memoryId, oldConfidence, newConfidence };
}

// ---------------------------------------------------------------------------
// Relevance Decay
// ---------------------------------------------------------------------------

/**
 * Apply time-based relevance decay to memories that haven't been recalled recently.
 * Confidence is reduced exponentially: `confidence × factor^daysSinceLastAccess`.
 *
 * Decay rates vary by category — episodic memories (events) fade fastest,
 * semantic memories (facts) persist longest. The base factor (default 0.95)
 * is used for categories without a specific override.
 *
 * @param {Object} db - state/memory module
 * @param {Object} [options]
 * @param {string} [options.userId] - Scope to a single user (default: all users)
 * @param {number} [options.baseFactor=0.95] - Base decay factor per day of inactivity
 * @param {Object} [options.categoryFactors] - Per-category override factors
 *   (e.g. { episodic: 0.90, semantic: 0.98 })
 * @param {number} [options.minDaysBeforeDecay=1] - Grace period: no decay within N days
 * @param {number} [options.confidenceFloor=0.05] - Never decay below this value
 * @param {number} [options.now] - Current timestamp in ms (for testing)
 * @returns {{ decayed: number, unchanged: number }}
 */
export function applyDecay(db, options = {}) {
  const {
    userId,
    baseFactor = 0.95,
    categoryFactors = {},
    minDaysBeforeDecay = 1,
    confidenceFloor = 0.05,
    now = Date.now(),
  } = options;

  const factors = { ...CATEGORY_DECAY, ...categoryFactors };
  const userIds = userId ? [userId] : db.getAllUserIds();
  let decayed = 0;
  let unchanged = 0;

  for (const uid of userIds) {
    const stats = db.getAccessStats(uid);

    for (const stat of stats) {
      const accessedMs = new Date(stat.accessedAt).getTime();
      const daysSinceAccess = (now - accessedMs) / DAY_MS;

      // Grace period — skip recently accessed memories
      if (daysSinceAccess < minDaysBeforeDecay) {
        unchanged++;
        continue;
      }

      const chunk = db.get(stat.id);
      if (!chunk || chunk.consolidatedInto || chunk.category === 'stale') {
        unchanged++;
        continue;
      }

      // Select decay factor for this memory's category
      const categoryFactor = factors[chunk.category] ?? baseFactor;

      // Exponential decay: confidence × factor^days
      const decayMultiplier = Math.pow(categoryFactor, daysSinceAccess);
      let newConfidence = chunk.confidence * decayMultiplier;
      newConfidence = Math.max(newConfidence, confidenceFloor);
      newConfidence = Math.round(newConfidence * 1000) / 1000;

      // Only persist if there's a meaningful change (> 0.001)
      if (Math.abs(newConfidence - chunk.confidence) > 0.001) {
        db.updateConfidence(chunk.id, newConfidence);
        decayed++;
      } else {
        unchanged++;
      }
    }
  }

  return { decayed, unchanged };
}

// ---------------------------------------------------------------------------
// Merging Near-Duplicates
// ---------------------------------------------------------------------------

/**
 * Find near-duplicate memories via embedding cosine similarity and merge each cluster
 * into a single higher-quality fact.
 *
 * For each cluster:
 * - Keep the highest-confidence version as the base content
 * - Apply a small corroboration boost (+0.02 per extra source, max +0.10)
 * - Union all tags from source memories
 * - Re-embed the merged content
 * - Mark source chunks as consolidated
 *
 * @param {Object} db - state/memory module
 * @param {Function} embedFn - async (text) => Float32Array
 * @param {Object} [options]
 * @param {string} [options.userId] - Scope to a single user
 * @param {number} [options.similarityThreshold=0.85] - Cosine similarity threshold
 * @returns {Promise<{ merged: number, clustersFound: number }>}
 */
async function findAndMergeDuplicates(db, embedFn, options = {}) {
  const { userId, similarityThreshold = 0.85 } = options;
  const userIds = userId ? [userId] : db.getAllUserIds();
  let merged = 0;
  let clustersFound = 0;

  for (const uid of userIds) {
    const clusters = db.getChunkClusters(uid, similarityThreshold);

    for (const cluster of clusters) {
      if (cluster.length < 2) continue;
      clustersFound++;

      // Sort by confidence descending — best version first
      const sorted = [...cluster].sort((a, b) => b.confidence - a.confidence);
      const best = sorted[0];
      const rest = sorted.slice(1);

      // Merge content strings
      const mergedContent = mergeFacts(sorted.map(c => c.content));

      // Confidence: keep highest + small corroboration boost
      const corroborationBoost = Math.min(rest.length * 0.02, 0.10);
      const mergedConfidence = Math.min(
        Math.round((best.confidence + corroborationBoost) * 1000) / 1000,
        1.0,
      );

      // Union all tags from the cluster
      const allTags = [...new Set(sorted.flatMap(c => c.tags || []))];

      // Re-embed the merged content
      const embedding = await embedFn(mergedContent);
      const embeddingBuf = serializeEmbedding(embedding);

      // Store the merged fact
      const mergedChunk = db.store(uid, mergedContent, {
        agentId: best.agentId || null,
        source: 'consolidation',
        category: best.category,
        tags: allTags,
        confidence: mergedConfidence,
        embedding: embeddingBuf,
      });

      // Mark all source chunks as consolidated into the new one
      const sourceIds = sorted.map(c => c.id);
      db.markConsolidated(sourceIds, mergedChunk.id);

      merged += sourceIds.length;
    }
  }

  return { merged, clustersFound };
}

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

/**
 * Soft-delete memories whose confidence has fallen below a threshold.
 * Skips memories that are already stale or have been consolidated into another.
 *
 * @param {Object} db - state/memory module
 * @param {Object} [options]
 * @param {string} [options.userId] - Scope to a single user
 * @param {number} [options.threshold=0.1] - Prune memories below this confidence
 * @returns {{ pruned: number }}
 */
function pruneByConfidence(db, options = {}) {
  const { userId, threshold = 0.1 } = options;
  const userIds = userId ? [userId] : db.getAllUserIds();
  let pruned = 0;

  for (const uid of userIds) {
    const chunks = db.search(uid, { limit: 100000 });

    for (const chunk of chunks) {
      if (chunk.category === 'stale') continue;
      if (chunk.consolidatedInto) continue;
      if (chunk.confidence < threshold) {
        db.softDelete(chunk.id);
        pruned++;
      }
    }
  }

  return { pruned };
}

// ---------------------------------------------------------------------------
// Main Consolidation Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run a complete consolidation pipeline.
 *
 * Steps:
 * 1. **Merge** — Find and merge duplicate/near-duplicate facts (cosine similarity > threshold)
 * 2. **Decay** — Apply time-based relevance decay to inactive memories
 * 3. **Prune** — Remove memories that have fallen below the confidence threshold
 *
 * @param {Object} db - state/memory module
 * @param {Function} embedFn - async (text) => Float32Array — embedding function
 * @param {Object} [options]
 * @param {string} [options.userId] - Scope to a single user (default: all users)
 * @param {number} [options.similarityThreshold=0.85] - Cosine similarity for duplicate detection
 * @param {number} [options.pruneThreshold=0.1] - Remove memories below this confidence
 * @param {number} [options.decayFactor=0.95] - Base decay factor per day of inactivity
 * @param {Object} [options.categoryDecayFactors] - Per-category decay factor overrides
 * @param {number} [options.now] - Current timestamp in ms (for testing)
 * @returns {Promise<{ merged: number, decayed: number, pruned: number, totalRemaining: number }>}
 */
export async function runConsolidation(db, embedFn, options = {}) {
  const {
    userId,
    similarityThreshold = 0.85,
    pruneThreshold = 0.1,
    decayFactor = 0.95,
    categoryDecayFactors,
    now,
  } = options;

  // Step 1: Merge near-duplicate memories
  const mergeResult = await findAndMergeDuplicates(db, embedFn, {
    userId,
    similarityThreshold,
  });

  // Step 2: Apply relevance decay
  const decayResult = applyDecay(db, {
    userId,
    baseFactor: decayFactor,
    categoryFactors: categoryDecayFactors,
    now,
  });

  // Step 3: Prune low-confidence memories
  const pruneResult = pruneByConfidence(db, {
    userId,
    threshold: pruneThreshold,
  });

  // Count remaining active memories
  let totalRemaining = 0;
  const userIds = userId ? [userId] : db.getAllUserIds();
  for (const uid of userIds) {
    totalRemaining += countActive(db, uid);
  }

  return {
    merged: mergeResult.merged,
    decayed: decayResult.decayed,
    pruned: pruneResult.pruned,
    totalRemaining,
  };
}

// ---------------------------------------------------------------------------
// Plan Enforcement
// ---------------------------------------------------------------------------

/**
 * Enforce memory quota based on user's plan tier.
 * When a user exceeds their plan's memory limit, the lowest-confidence memories
 * are soft-deleted first until the count is within quota.
 *
 * Quota limits:
 * - Free: 500 memories max
 * - Pro: 5,000 memories max
 * - Team: 25,000 memories max
 * - BYOK: unlimited
 *
 * @param {Object} db - state/memory module
 * @param {string} userId - User to enforce quota for
 * @param {string|Object} planOrId - Plan ID string ('free', 'pro', 'team', 'byok')
 *   or a plan object with an `id` property
 * @returns {{ enforced: boolean, removed: number, limit: number, remaining: number }}
 */
export function enforceMemoryQuota(db, userId, planOrId) {
  const planId = typeof planOrId === 'string' ? planOrId : planOrId?.id;
  const limit = MEMORY_QUOTAS[planId];

  if (limit == null) {
    throw new Error(`Unknown plan: ${planId}`);
  }

  // Unlimited plans skip enforcement
  if (!isFinite(limit)) {
    return { enforced: false, removed: 0, limit, remaining: countActive(db, userId) };
  }

  // Gather active (non-stale, non-consolidated) memories
  const chunks = db.search(userId, { limit: 100000 });
  const active = chunks.filter(c => c.category !== 'stale' && !c.consolidatedInto);
  const currentCount = active.length;

  if (currentCount <= limit) {
    return { enforced: false, removed: 0, limit, remaining: currentCount };
  }

  // Over quota — prune lowest-confidence memories first
  const overBy = currentCount - limit;
  const sorted = [...active].sort((a, b) => a.confidence - b.confidence);
  const toPrune = sorted.slice(0, overBy);

  let removed = 0;
  for (const chunk of toPrune) {
    db.softDelete(chunk.id);
    removed++;
  }

  return { enforced: true, removed, limit, remaining: currentCount - removed };
}

// ---------------------------------------------------------------------------
// Consolidation Scheduler (class)
// ---------------------------------------------------------------------------

/**
 * Consolidation scheduler — manages periodic consolidation runs with per-user
 * rate limiting. Wraps the functional `runConsolidation` pipeline.
 *
 * Usage:
 * ```js
 * const scheduler = new ConsolidationScheduler({
 *   db: memoryState,
 *   embedFn: provider.embed.bind(provider),
 * });
 * const report = await scheduler.runAll();
 * ```
 */
export class ConsolidationScheduler {
  /**
   * @param {Object} opts
   * @param {Object} opts.db - state/memory module
   * @param {Function} opts.embedFn - async (text) => Float32Array
   * @param {Object} [opts.logger] - Logger (defaults to console)
   * @param {number} [opts.intervalMs=86400000] - Min interval between runs per user (ms)
   * @param {Object} [opts.consolidationOptions] - Default options passed to runConsolidation
   */
  constructor({ db, embedFn, logger, intervalMs, consolidationOptions }) {
    if (!db) throw new Error('opts.db is required');
    if (!embedFn) throw new Error('opts.embedFn is required');

    /** @type {Object} */
    this.db = db;
    /** @type {Function} */
    this.embedFn = embedFn;
    /** @type {Object} */
    this.logger = logger || console;
    /** @type {number} */
    this.intervalMs = intervalMs ?? SCHEDULER_INTERVAL_MS;
    /** @type {Object} */
    this.consolidationOptions = consolidationOptions || {};

    /** Per-user last-run timestamps @type {Map<string, number>} */
    this.lastRuns = new Map();

    /** Aggregate statistics */
    this.stats = {
      /** @type {number} */ totalRuns: 0,
      /** @type {string|null} */ lastRunAt: null,
      /** @type {number} */ usersProcessed: 0,
      /** @type {number} */ errors: 0,
    };
  }

  /**
   * Check whether a user is eligible for consolidation (respects rate limit).
   * @param {string} userId
   * @returns {boolean}
   */
  isEligible(userId) {
    const last = this.lastRuns.get(userId);
    if (!last) return true;
    return (Date.now() - last) > this.intervalMs;
  }

  /**
   * Run consolidation for all eligible users.
   * Skips users whose last run was within the rate-limit interval.
   *
   * @param {Object} [options] - Override consolidation options for this run
   * @returns {Promise<{
   *   processed: number,
   *   skipped: number,
   *   results: Array<{ userId: string, report: Object }>
   * }>}
   */
  async runAll(options = {}) {
    const userIds = this.db.getAllUserIds();
    const results = [];
    let processed = 0;
    let skipped = 0;

    for (const userId of userIds) {
      if (!this.isEligible(userId)) {
        skipped++;
        continue;
      }

      try {
        const report = await runConsolidation(
          this.db,
          this.embedFn,
          { userId, ...this.consolidationOptions, ...options },
        );

        this.lastRuns.set(userId, Date.now());
        processed++;
        results.push({ userId, report });

        this.logger.info?.(
          `[consolidation] User ${userId}: merged=${report.merged} decayed=${report.decayed} pruned=${report.pruned} remaining=${report.totalRemaining}`,
        );
      } catch (err) {
        this.stats.errors++;
        this.logger.error?.(`[consolidation] Error for user ${userId}:`, err);
      }
    }

    this.stats.totalRuns++;
    this.stats.lastRunAt = new Date().toISOString();
    this.stats.usersProcessed += processed;

    return { processed, skipped, results };
  }

  /**
   * Run consolidation for a single user, bypassing the rate limit.
   *
   * @param {string} userId
   * @param {Object} [options] - Override consolidation options
   * @returns {Promise<{ merged: number, decayed: number, pruned: number, totalRemaining: number }>}
   */
  async runForUser(userId, options = {}) {
    const report = await runConsolidation(
      this.db,
      this.embedFn,
      { userId, ...this.consolidationOptions, ...options },
    );
    this.lastRuns.set(userId, Date.now());
    return report;
  }

  /**
   * Get scheduler statistics including per-user timing.
   *
   * @returns {{
   *   totalRuns: number,
   *   lastRunAt: string|null,
   *   usersProcessed: number,
   *   errors: number,
   *   perUser: Array<{ userId: string, lastRun: string, nextEligible: string }>
   * }}
   */
  getStats() {
    return {
      ...this.stats,
      perUser: [...this.lastRuns.entries()].map(([userId, ts]) => ({
        userId,
        lastRun: new Date(ts).toISOString(),
        nextEligible: new Date(ts + this.intervalMs).toISOString(),
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Backward compatibility — MemoryConsolidator (deprecated)
// The memory-scheduler.js module imports this class. Wraps the new functional API.
// ---------------------------------------------------------------------------

/**
 * @deprecated Use the functional API (runConsolidation, boostConfidence, etc.)
 *   or ConsolidationScheduler instead.
 */
export class MemoryConsolidator {
  constructor({ memory, embedder, llmCall, logger }) {
    if (!memory) throw new Error('opts.memory is required');
    if (!embedder) throw new Error('opts.embedder is required');
    this.memory = memory;
    this.embedder = embedder;
    this.llmCall = llmCall || null;
    this.logger = logger || console;
    this.log = [];
  }

  async consolidate(userId) {
    const result = await findAndMergeDuplicates(this.memory, this.embedder.embed.bind(this.embedder), {
      userId,
    });
    return { merged: result.merged, skipped: 0, clusters: result.clustersFound };
  }

  async scoreRelevance(userId) {
    const result = applyDecay(this.memory, { userId, minDaysBeforeDecay: 0 });
    return { boosted: 0, decayed: result.decayed, frequencyBoosted: 0 };
  }

  async pruneStale(userId, minConfidence = 0.15) {
    return pruneByConfidence(this.memory, { userId, threshold: minConfidence });
  }

  getConsolidationStats(userId) {
    const chunks = this.memory.search(userId, { limit: 100000 });
    const consolidated = chunks.filter(c => c.consolidatedInto).length;
    const stale = chunks.filter(c => c.category === 'stale').length;
    const active = chunks.filter(c => !c.consolidatedInto && c.category !== 'stale');
    const avgConfidence = active.length > 0
      ? Math.round(active.reduce((s, c) => s + c.confidence, 0) / active.length * 1000) / 1000
      : 0;
    const tagCounts = new Map();
    for (const c of active) for (const t of (c.tags || [])) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    const topTopics = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => ({ tag, count }));
    return { totalChunks: chunks.length, consolidated, stale, avgConfidence, topTopics };
  }
}
