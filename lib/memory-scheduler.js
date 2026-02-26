/**
 * @module lib/memory-scheduler
 * Consolidation scheduler — runs memory consolidation during idle periods.
 * Designed to be called by a heartbeat or cron job, not to run its own timer.
 *
 * Rate-limits to at most 1 consolidation pass per user per 24 hours.
 * Orchestrates: consolidate → score relevance → prune stale.
 */

/** 24 hours in milliseconds */
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

/** Default max chunks per user before pruning kicks in */
const DEFAULT_PRUNE_THRESHOLD = 1000;

/**
 * Memory consolidation scheduler.
 * Coordinates consolidation passes, relevance scoring, and pruning
 * across all users, with per-user rate limiting.
 */
export class MemoryScheduler {
  /**
   * @param {Object} opts
   * @param {import('./memory-consolidation.js').MemoryConsolidator} opts.consolidator - Consolidation engine
   * @param {Object} opts.memory - state/memory module (countByUser, getAllUserIds, etc.)
   * @param {Object} [opts.logger] - Logger instance (defaults to console)
   * @param {number} [opts.pruneThreshold=1000] - Per-user chunk count before pruning triggers
   */
  constructor({ consolidator, memory, logger, pruneThreshold }) {
    if (!consolidator) throw new Error('opts.consolidator is required');
    if (!memory) throw new Error('opts.memory is required');

    /** @type {import('./memory-consolidation.js').MemoryConsolidator} */
    this.consolidator = consolidator;
    /** @type {Object} */
    this.memory = memory;
    /** @type {Object} */
    this.logger = logger || console;
    /** @type {number} */
    this.pruneThreshold = pruneThreshold || DEFAULT_PRUNE_THRESHOLD;

    /**
     * Per-user last consolidation timestamp.
     * @type {Map<string, number>}
     */
    this.lastRuns = new Map();

    /**
     * Aggregate scheduler statistics.
     * @type {{totalRuns: number, lastRunAt: string|null, usersProcessed: number, errors: number}}
     */
    this.stats = {
      totalRuns: 0,
      lastRunAt: null,
      usersProcessed: 0,
      errors: 0,
    };
  }

  /**
   * Check whether a user is eligible for consolidation (rate limit: 24h).
   * @param {string} userId
   * @returns {boolean}
   */
  _isEligible(userId) {
    const last = this.lastRuns.get(userId);
    if (!last) return true;
    return (Date.now() - last) > TWENTY_FOUR_HOURS;
  }

  /**
   * Record that a consolidation run completed for a user.
   * @param {string} userId
   */
  _markRun(userId) {
    this.lastRuns.set(userId, Date.now());
  }

  /**
   * Run a full scheduled consolidation pass across all users.
   *
   * For each user with memory chunks:
   * 1. Skip if last consolidation was < 24h ago
   * 2. Run consolidation (merge related facts)
   * 3. Run relevance scoring (boost/decay/frequency)
   * 4. Prune stale chunks if total exceeds threshold
   *
   * @returns {Promise<{usersProcessed: number, skipped: number, results: Array<{userId: string, consolidation: Object, relevance: Object, pruned: Object|null}>}>}
   */
  async runScheduledConsolidation() {
    const userIds = this.memory.getAllUserIds();
    const results = [];
    let processed = 0;
    let skipped = 0;

    for (const userId of userIds) {
      // Rate limit: max 1 consolidation per user per 24 hours
      if (!this._isEligible(userId)) {
        skipped++;
        continue;
      }

      try {
        // Step 1: Consolidate related chunks
        const consolidation = await this.consolidator.consolidate(userId);

        // Step 2: Recalculate relevance scores
        const relevance = await this.consolidator.scoreRelevance(userId);

        // Step 3: Prune if chunk count exceeds threshold
        let pruned = null;
        const chunkCount = this.memory.countByUser(userId);
        if (chunkCount > this.pruneThreshold) {
          pruned = await this.consolidator.pruneStale(userId);
        }

        this._markRun(userId);
        processed++;

        results.push({ userId, consolidation, relevance, pruned });

        this.logger.info?.(
          `[scheduler] Processed user ${userId}: merged=${consolidation.merged}, boosted=${relevance.boosted}, decayed=${relevance.decayed}${pruned ? `, pruned=${pruned.pruned}` : ''}`
        );
      } catch (err) {
        this.stats.errors++;
        this.logger.error?.(`[scheduler] Error processing user ${userId}:`, err);
      }
    }

    // Update aggregate stats
    this.stats.totalRuns++;
    this.stats.lastRunAt = new Date().toISOString();
    this.stats.usersProcessed += processed;

    return { usersProcessed: processed, skipped, results };
  }

  /**
   * Get scheduler statistics and per-user timing info.
   *
   * @returns {{totalRuns: number, lastRunAt: string|null, usersProcessed: number, errors: number, perUser: Array<{userId: string, lastRun: string, nextEligible: string}>}}
   */
  getSchedulerStats() {
    const perUser = [...this.lastRuns.entries()].map(([userId, ts]) => ({
      userId,
      lastRun: new Date(ts).toISOString(),
      nextEligible: new Date(ts + TWENTY_FOUR_HOURS).toISOString(),
    }));

    return {
      ...this.stats,
      perUser,
    };
  }
}
