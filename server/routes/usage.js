/**
 * @module server/routes/usage
 * Usage tracking API routes.
 *
 * GET  /api/usage          — today's usage + limits for current user
 * GET  /api/usage/history   — usage history (date range)
 * GET  /api/usage/limits    — tier limits for current user
 */

import { getUsageTracker } from '../../lib/usage-tracker.js';

/* ── Input-validation helpers ── */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Register usage routes on the router.
 * @param {import('express').Router} router
 * @param {Function} requireAuth — auth middleware
 */
export function registerUsageRoutes(router, requireAuth) {
  // Today's usage + limits
  router.get('/api/usage', requireAuth, (req, res) => {
    try {
      const tracker = getUsageTracker();
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Authentication required' });
      }
      const today = tracker.getToday(userId);
      const limits = tracker.getLimits(userId);

      res.json({
        today: {
          messages: today.messages,
          tokens: today.tokens,
          toolCalls: today.toolCalls,
          uploads: today.uploads,
          genuiOps: today.genuiOps,
        },
        limits: {
          tier: limits.tier,
          messagesPerDay: limits.messagesPerDay,
          tokensPerDay: limits.tokensPerDay,
          toolCallsPerDay: limits.toolCallsPerDay,
          uploadsPerDay: limits.uploadsPerDay,
          uploadMaxMb: limits.uploadMaxMb,
          agentsMax: limits.agentsMax,
          messagesPerMinute: limits.messagesPerMinute,
        },
        resetAt: new Date(new Date().setUTCHours(24, 0, 0, 0)).toISOString(),
      });
    } catch (err) {
      console.error('[usage] Error fetching usage:', err);
      res.status(500).json({ ok: false, error: 'Failed to fetch usage' });
    }
  });

  // Usage history (date range)
  router.get('/api/usage/history', requireAuth, (req, res) => {
    try {
      const tracker = getUsageTracker();
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Authentication required' });
      }

      const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const defaultTo   = new Date().toISOString().slice(0, 10);
      const from = req.query.from || defaultFrom;
      const to   = req.query.to   || defaultTo;

      // Validate date formats (YYYY-MM-DD)
      if (!DATE_RE.test(from)) {
        return res.status(400).json({ ok: false, error: 'from must be in YYYY-MM-DD format' });
      }
      if (!DATE_RE.test(to)) {
        return res.status(400).json({ ok: false, error: 'to must be in YYYY-MM-DD format' });
      }
      // Ensure valid date values
      if (isNaN(Date.parse(from))) {
        return res.status(400).json({ ok: false, error: 'from is not a valid date' });
      }
      if (isNaN(Date.parse(to))) {
        return res.status(400).json({ ok: false, error: 'to is not a valid date' });
      }
      // Sanity check: range must not exceed 366 days
      const diffMs = Date.parse(to) - Date.parse(from);
      if (diffMs < 0) {
        return res.status(400).json({ ok: false, error: 'from must be before to' });
      }
      if (diffMs > 366 * 86400000) {
        return res.status(400).json({ ok: false, error: 'Date range must not exceed 366 days' });
      }

      const data = tracker.getRange(userId, from, to);
      res.json({ from, to, data });
    } catch (err) {
      console.error('[usage] Error fetching history:', err);
      res.status(500).json({ ok: false, error: 'Failed to fetch usage history' });
    }
  });

  // Per-agent usage breakdown
  router.get('/api/usage/agents', requireAuth, (req, res) => {
    try {
      const tracker = getUsageTracker();
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ ok: false, error: 'Authentication required' });

      const agents = tracker.getAgentUsage(userId);
      res.json({ ok: true, data: { agents } });
    } catch (err) {
      console.error('[usage] Error fetching agent usage:', err);
      res.status(500).json({ ok: false, error: 'Failed to fetch agent usage' });
    }
  });

  // Tier limits
  router.get('/api/usage/limits', requireAuth, (req, res) => {
    try {
      const tracker = getUsageTracker();
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ ok: false, error: 'Authentication required' });
      }
      const limits = tracker.getLimits(userId);
      res.json(limits);
    } catch (err) {
      res.status(500).json({ ok: false, error: 'Failed to fetch limits' });
    }
  });
}
