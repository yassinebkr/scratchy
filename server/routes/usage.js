/**
 * @module server/routes/usage
 * Usage tracking API routes.
 *
 * GET  /api/usage          — today's usage + limits for current user
 * GET  /api/usage/history   — usage history (date range)
 * GET  /api/usage/limits    — tier limits for current user
 */

import { getUsageTracker } from '../../lib/usage-tracker.js';

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
      const userId = req.user.id;
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
      res.status(500).json({ error: 'Failed to fetch usage' });
    }
  });

  // Usage history (date range)
  router.get('/api/usage/history', requireAuth, (req, res) => {
    try {
      const tracker = getUsageTracker();
      const userId = req.user.id;
      const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = req.query.to || new Date().toISOString().slice(0, 10);
      const data = tracker.getRange(userId, from, to);
      res.json({ from, to, data });
    } catch (err) {
      console.error('[usage] Error fetching history:', err);
      res.status(500).json({ error: 'Failed to fetch usage history' });
    }
  });

  // Tier limits
  router.get('/api/usage/limits', requireAuth, (req, res) => {
    try {
      const tracker = getUsageTracker();
      const limits = tracker.getLimits(req.user.id);
      res.json(limits);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch limits' });
    }
  });
}
