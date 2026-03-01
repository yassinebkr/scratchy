/**
 * @module server/routes/billing
 * Billing API routes (Stripe-powered).
 *
 * POST /api/billing/checkout  — create checkout session for upgrade
 * POST /api/billing/portal    — create customer portal session
 * GET  /api/billing/status    — current subscription status
 * POST /api/billing/webhook   — Stripe webhook endpoint (no auth)
 */

import {
  createCheckoutSession,
  createPortalSession,
  getOrCreateCustomer,
  getSubscription,
  verifyWebhookSignature,
  handleWebhookEvent,
} from '../../lib/stripe.js';

/**
 * Handle billing API requests.
 * @param {string} method
 * @param {string} pathname
 * @param {object|null} user — authenticated user (null for webhooks)
 * @param {object} body — parsed request body
 * @param {Function} json — response helper
 * @param {object} res
 * @param {object} req — raw request (for webhook body)
 * @param {Function} getDb
 * @param {string} baseUrl — e.g. https://v2.clawos.fr
 * @returns {boolean} — true if handled
 */
export async function handleBilling(method, pathname, user, body, json, res, req, getDb, baseUrl) {

  // ── Webhook (no auth — Stripe signs it) ──
  if (method === 'POST' && pathname === '/api/billing/webhook') {
    try {
      const sigHeader = req.headers['stripe-signature'];
      if (!sigHeader) return json(res, 400, { error: 'Missing Stripe-Signature' });

      // Read raw body for signature verification
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks);

      const event = verifyWebhookSignature(rawBody, sigHeader);
      const db = getDb();
      if (!db) return json(res, 500, { error: 'Database not available' });

      const result = handleWebhookEvent(event, db);
      console.log(`[billing] Webhook ${event.type} → ${result.action}`);
      return json(res, 200, { received: true, ...result });
    } catch (err) {
      console.error('[billing] Webhook error:', err.message);
      return json(res, 400, { error: err.message });
    }
  }

  // ── All other routes require auth ──
  if (!user) return json(res, 401, { error: 'Authentication required' });

  // POST /api/billing/checkout — create upgrade session
  if (method === 'POST' && pathname === '/api/billing/checkout') {
    const { plan } = body || {};
    if (!plan || !['pro', 'max'].includes(plan)) {
      return json(res, 400, { error: 'Plan must be "pro" or "max"' });
    }
    try {
      const result = await createCheckoutSession({
        userId: user.id,
        email: user.username, // username is email in Scratchy
        plan,
        successUrl: `${baseUrl}/?upgraded=${plan}`,
        cancelUrl: `${baseUrl}/?cancelled=true`,
      });
      return json(res, 200, result);
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  // POST /api/billing/portal — customer portal
  if (method === 'POST' && pathname === '/api/billing/portal') {
    try {
      const db = getDb();
      const row = db?.prepare(`SELECT customerId FROM stripe_customers WHERE userId = ?`).get(user.id);
      if (!row?.customerId) {
        return json(res, 404, { error: 'No active subscription found' });
      }
      const result = await createPortalSession(row.customerId, `${baseUrl}/`);
      return json(res, 200, result);
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  // GET /api/billing/status — current plan + subscription info
  if (method === 'GET' && pathname === '/api/billing/status') {
    try {
      const db = getDb();
      const userRow = db?.prepare(`SELECT plan FROM users WHERE id = ?`).get(user.id);
      const stripeRow = db?.prepare(`SELECT customerId FROM stripe_customers WHERE userId = ?`).get(user.id);

      const status = {
        plan: userRow?.plan || 'free',
        hasStripeSubscription: !!stripeRow?.customerId,
        customerId: stripeRow?.customerId || null,
        subscription: null,
      };

      // Fetch active subscription details from Stripe if customer exists
      if (stripeRow?.customerId) {
        try {
          const sub = await getSubscription(stripeRow.customerId);
          if (sub) {
            status.subscription = {
              id: sub.id,
              status: sub.status,
              currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            };
          }
        } catch {
          // Stripe API error — return what we have
        }
      }

      return json(res, 200, status);
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }

  return false;
}
