/**
 * @module server/routes/billing
 * Billing API routes for Scratchy v2.
 *
 * Registers endpoints for Stripe Checkout, Customer Portal, usage queries,
 * plan details, and webhook processing.
 */

import { getPlan, PLANS } from '../../lib/billing/plans.js';

/**
 * @typedef {Object} BillingDeps
 * @property {import('../../lib/billing/stripe-client.js').StripeClient} stripeClient - Stripe API client
 * @property {import('../../lib/billing/usage-tracker.js').UsageTracker} usageTracker - Usage tracking
 * @property {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>} webhookHandler - Stripe webhook handler
 * @property {(req: import('node:http').IncomingMessage) => Promise<{ id: string, username: string, plan: string, stripeCustomerId?: string }|null>} authenticate - Auth middleware
 * @property {(userId: string) => { stripeCustomerId?: string, plan?: string }|null} getUserBilling - Get user billing info from DB
 * @property {(userId: string, updates: Record<string, unknown>) => void} updateUserBilling - Update user billing info in DB
 */

/**
 * Parse JSON body from a request.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on('data', (chunk) => {
      len += chunk.length;
      if (len > 65_536) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} data
 */
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

/**
 * Register billing API routes on the given router.
 *
 * Routes:
 *   POST /api/billing/checkout  — Create Stripe Checkout session (auth required)
 *   GET  /api/billing/portal    — Get Customer Portal URL (auth required)
 *   GET  /api/billing/usage     — Get current usage + quota status (auth required)
 *   GET  /api/billing/plan      — Get current plan details (auth required)
 *   POST /api/billing/webhook   — Stripe webhook endpoint (no auth, signature verified)
 *
 * @param {{ handle: (method: string, path: string, handler: Function) => void } | Map<string, Function>} router
 *   Either a router with a .handle() method, or a Map to register handlers into.
 *   If a Map is passed, keys are "METHOD /path" strings.
 * @param {BillingDeps} deps - Dependencies injected by the app
 */
export function billingRoutes(router, deps) {
  const {
    stripeClient,
    usageTracker,
    webhookHandler,
    authenticate,
    getUserBilling,
    updateUserBilling,
  } = deps;

  /**
   * POST /api/billing/checkout
   * Create a Stripe Checkout session for subscribing to a plan.
   *
   * Body: { planId: string, successUrl?: string, cancelUrl?: string }
   * Returns: { url: string } — redirect the user to this URL
   */
  async function handleCheckout(req, res) {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'Authentication required' });

    let body;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    const planId = /** @type {string} */ (body.planId);
    if (!planId) return json(res, 400, { error: 'planId is required' });

    const plan = getPlan(planId);
    if (!plan || !plan.stripePriceId) {
      return json(res, 400, { error: `Invalid plan: ${planId}` });
    }

    // Ensure the user has a Stripe customer ID
    let billing = getUserBilling(user.id);
    let customerId = billing?.stripeCustomerId;

    if (!customerId) {
      const customer = await stripeClient.createCustomer(
        user.username, // email fallback — ideally use user.email
        user.username,
        { userId: user.id },
      );
      if (customer.error) {
        return json(res, 502, { error: 'Failed to create Stripe customer', detail: customer.message });
      }
      customerId = /** @type {string} */ (customer.id);
      updateUserBilling(user.id, { stripeCustomerId: customerId });
    }

    // Create checkout session
    const session = await stripeClient.createCheckoutSession(customerId, plan.stripePriceId, {
      successUrl: /** @type {string|undefined} */ (body.successUrl),
      cancelUrl: /** @type {string|undefined} */ (body.cancelUrl),
      metadata: { userId: user.id, planId: plan.id },
    });

    if (session.error) {
      return json(res, 502, { error: 'Failed to create checkout session', detail: session.message });
    }

    return json(res, 200, { url: session.url });
  }

  /**
   * GET /api/billing/portal
   * Get a Stripe Customer Portal URL for self-service subscription management.
   *
   * Query: ?returnUrl=<url>
   * Returns: { url: string }
   */
  async function handlePortal(req, res) {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'Authentication required' });

    const billing = getUserBilling(user.id);
    const customerId = billing?.stripeCustomerId;

    if (!customerId) {
      return json(res, 400, { error: 'No billing account found. Subscribe to a plan first.' });
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const returnUrl = url.searchParams.get('returnUrl') || undefined;

    const session = await stripeClient.createPortalSession(customerId, returnUrl);
    if (session.error) {
      return json(res, 502, { error: 'Failed to create portal session', detail: session.message });
    }

    return json(res, 200, { url: session.url });
  }

  /**
   * GET /api/billing/usage
   * Get the current user's usage and quota status for today.
   *
   * Returns: { today: { messages, tokens, modelBreakdown }, quota: { allowed, remaining, resetAt }, monthly: { ... } }
   */
  async function handleUsage(req, res) {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'Authentication required' });

    const billing = getUserBilling(user.id);
    const planId = billing?.plan ?? user.plan ?? 'free';

    const [today, quota, monthly] = await Promise.all([
      usageTracker.getUsage(user.id),
      usageTracker.checkQuota(user.id, planId),
      usageTracker.getMonthlyUsage(user.id),
    ]);

    return json(res, 200, { today, quota, monthly, planId });
  }

  /**
   * GET /api/billing/plan
   * Get the current user's plan details.
   *
   * Returns: { plan: Plan, allPlans: Plan[] }
   */
  async function handlePlan(req, res) {
    const user = await authenticate(req);
    if (!user) return json(res, 401, { error: 'Authentication required' });

    const billing = getUserBilling(user.id);
    const planId = billing?.plan ?? user.plan ?? 'free';
    const plan = getPlan(planId) ?? getPlan('free');

    return json(res, 200, {
      plan,
      allPlans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        currency: p.currency,
        interval: p.interval,
        quotas: p.quotas,
        models: p.models,
        seats: p.seats,
      })),
    });
  }

  // Register routes
  // Support both Map-based and method-based router patterns
  if (typeof router === 'object' && router instanceof Map) {
    router.set('POST /api/billing/checkout', handleCheckout);
    router.set('GET /api/billing/portal', handlePortal);
    router.set('GET /api/billing/usage', handleUsage);
    router.set('GET /api/billing/plan', handlePlan);
    router.set('POST /api/billing/webhook', webhookHandler);
  } else if (router && typeof router.handle === 'function') {
    router.handle('POST', '/api/billing/checkout', handleCheckout);
    router.handle('GET', '/api/billing/portal', handlePortal);
    router.handle('GET', '/api/billing/usage', handleUsage);
    router.handle('GET', '/api/billing/plan', handlePlan);
    router.handle('POST', '/api/billing/webhook', webhookHandler);
  } else {
    // Return handlers object for manual wiring
    return {
      checkout: handleCheckout,
      portal: handlePortal,
      usage: handleUsage,
      plan: handlePlan,
      webhook: webhookHandler,
      /** Route table for integration into any router */
      routes: [
        { method: 'POST', path: '/api/billing/checkout', handler: handleCheckout },
        { method: 'GET', path: '/api/billing/portal', handler: handlePortal },
        { method: 'GET', path: '/api/billing/usage', handler: handleUsage },
        { method: 'GET', path: '/api/billing/plan', handler: handlePlan },
        { method: 'POST', path: '/api/billing/webhook', handler: webhookHandler },
      ],
    };
  }
}
