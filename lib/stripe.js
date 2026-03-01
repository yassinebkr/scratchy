/**
 * @module lib/stripe
 * Scratchy v2 — Stripe Integration
 *
 * Handles subscription lifecycle: checkout, webhooks, plan sync.
 * Uses Stripe's raw HTTP API (no SDK dependency).
 *
 * Environment:
 *   STRIPE_SECRET_KEY     — sk_test_... or sk_live_...
 *   STRIPE_WEBHOOK_SECRET — whsec_...
 *   STRIPE_PRICE_PRO      — price_... for Pro plan
 *   STRIPE_PRICE_TEAM     — price_... for Team plan
 *
 * Flow:
 *   1. User clicks upgrade → POST /api/billing/checkout
 *   2. Server creates Stripe Checkout Session → redirect URL
 *   3. User pays on Stripe → webhook fires
 *   4. POST /api/billing/webhook → update user plan in DB
 *   5. Customer portal for management → POST /api/billing/portal
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/* ------------------------------------------------------------------ */
/*  Config                                                            */
/* ------------------------------------------------------------------ */

const STRIPE_API = 'https://api.stripe.com/v1';

function getStripeKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return key;
}

function getWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET || '';
}

/** Map Stripe price IDs → plan names */
function getPriceMap() {
  return {
    [process.env.STRIPE_PRICE_PRO || 'price_pro']: 'pro',
    [process.env.STRIPE_PRICE_TEAM || 'price_team']: 'team',
  };
}

/** Map plan names → Stripe price IDs */
function getPlanPriceId(plan) {
  if (plan === 'pro') return process.env.STRIPE_PRICE_PRO || '';
  if (plan === 'team') return process.env.STRIPE_PRICE_TEAM || '';
  return '';
}

/* ------------------------------------------------------------------ */
/*  Stripe API helpers (no SDK)                                       */
/* ------------------------------------------------------------------ */

/**
 * Make a Stripe API request.
 * @param {string} endpoint — e.g. '/checkout/sessions'
 * @param {'GET'|'POST'|'DELETE'} method
 * @param {Record<string, string>} [params] — form-encoded params
 * @returns {Promise<object>}
 */
async function stripeRequest(endpoint, method = 'GET', params = null) {
  const key = getStripeKey();
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    signal: AbortSignal.timeout(15_000),
  };

  if (params && method !== 'GET') {
    opts.body = new URLSearchParams(params).toString();
  }

  const url = endpoint.startsWith('http') ? endpoint : `${STRIPE_API}${endpoint}`;
  const resp = await fetch(url, opts);
  const data = await resp.json();

  if (!resp.ok) {
    const msg = data.error?.message || `Stripe error ${resp.status}`;
    throw new Error(msg);
  }

  return data;
}

/* ------------------------------------------------------------------ */
/*  Webhook signature verification                                    */
/* ------------------------------------------------------------------ */

/**
 * Verify Stripe webhook signature (v1 scheme).
 * @param {string|Buffer} rawBody
 * @param {string} sigHeader — Stripe-Signature header
 * @returns {object} — parsed event
 */
export function verifyWebhookSignature(rawBody, sigHeader) {
  const secret = getWebhookSecret();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');

  const parts = {};
  for (const item of sigHeader.split(',')) {
    const [key, val] = item.split('=');
    if (key === 't') parts.timestamp = val;
    if (key === 'v1') parts.signature = val;
  }

  if (!parts.timestamp || !parts.signature) {
    throw new Error('Invalid Stripe signature format');
  }

  // Check timestamp tolerance (5 minutes)
  const age = Math.abs(Date.now() / 1000 - parseInt(parts.timestamp));
  if (age > 300) throw new Error('Webhook timestamp too old');

  // Compute expected signature
  const payload = `${parts.timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(parts.signature))) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(rawBody.toString());
}

/* ------------------------------------------------------------------ */
/*  Checkout & Portal                                                 */
/* ------------------------------------------------------------------ */

/**
 * Create a Stripe Checkout Session for a subscription.
 * @param {object} opts
 * @param {string} opts.userId — Scratchy user ID
 * @param {string} opts.email — user email
 * @param {string} opts.plan — 'pro' or 'team'
 * @param {string} opts.successUrl — redirect after success
 * @param {string} opts.cancelUrl — redirect on cancel
 * @param {string} [opts.customerId] — existing Stripe customer ID
 * @returns {Promise<{url: string, sessionId: string}>}
 */
export async function createCheckoutSession({ userId, email, plan, successUrl, cancelUrl, customerId }) {
  const priceId = getPlanPriceId(plan);
  if (!priceId) throw new Error(`No Stripe price configured for plan: ${plan}`);

  const params = {
    'mode': 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'success_url': successUrl,
    'cancel_url': cancelUrl,
    'client_reference_id': userId,
    'metadata[userId]': userId,
    'metadata[plan]': plan,
  };

  if (customerId) {
    params['customer'] = customerId;
  } else if (email) {
    params['customer_email'] = email;
  }

  const session = await stripeRequest('/checkout/sessions', 'POST', params);
  return { url: session.url, sessionId: session.id };
}

/**
 * Create a Stripe Customer Portal session for subscription management.
 * @param {string} customerId — Stripe customer ID
 * @param {string} returnUrl — where to return after portal
 * @returns {Promise<{url: string}>}
 */
export async function createPortalSession(customerId, returnUrl) {
  const session = await stripeRequest('/billing_portal/sessions', 'POST', {
    'customer': customerId,
    'return_url': returnUrl,
  });
  return { url: session.url };
}

/**
 * Get or create a Stripe customer for a user.
 * @param {string} email
 * @param {string} userId — stored as metadata
 * @returns {Promise<string>} — customer ID
 */
export async function getOrCreateCustomer(email, userId) {
  // Search for existing customer
  const search = await stripeRequest(`/customers/search?query=metadata["userId"]:"${userId}"`, 'GET');
  if (search.data?.length > 0) return search.data[0].id;

  // Create new customer
  const customer = await stripeRequest('/customers', 'POST', {
    'email': email,
    'metadata[userId]': userId,
  });
  return customer.id;
}

/**
 * Get subscription details for a customer.
 * @param {string} customerId
 * @returns {Promise<object|null>}
 */
export async function getSubscription(customerId) {
  const subs = await stripeRequest(`/subscriptions?customer=${customerId}&status=active&limit=1`, 'GET');
  return subs.data?.[0] || null;
}

/* ------------------------------------------------------------------ */
/*  Webhook event handlers                                            */
/* ------------------------------------------------------------------ */

/**
 * Process a verified Stripe webhook event.
 * @param {object} event — Stripe event object
 * @param {import('better-sqlite3').Database} db
 * @returns {{ action: string, userId?: string, plan?: string }}
 */
export function handleWebhookEvent(event, db) {
  const type = event.type;
  const data = event.data?.object;

  switch (type) {
    case 'checkout.session.completed': {
      const userId = data.client_reference_id || data.metadata?.userId;
      const plan = data.metadata?.plan;
      const customerId = data.customer;
      if (userId && plan) {
        // Update user plan + store Stripe customer ID
        db.prepare(`UPDATE users SET plan = ?, updatedAt = datetime('now') WHERE id = ?`).run(plan, userId);
        db.prepare(`
          INSERT INTO stripe_customers (userId, customerId) VALUES (?, ?)
          ON CONFLICT(userId) DO UPDATE SET customerId = excluded.customerId
        `).run(userId, customerId);
        console.log(`[stripe] User ${userId} upgraded to ${plan} (customer: ${customerId})`);
        return { action: 'upgraded', userId, plan };
      }
      break;
    }

    case 'customer.subscription.updated': {
      const customerId = data.customer;
      const status = data.status;
      const priceId = data.items?.data?.[0]?.price?.id;
      const priceMap = getPriceMap();
      const plan = priceMap[priceId];

      const row = db.prepare(`SELECT userId FROM stripe_customers WHERE customerId = ?`).get(customerId);
      if (row?.userId && plan) {
        if (status === 'active') {
          db.prepare(`UPDATE users SET plan = ?, updatedAt = datetime('now') WHERE id = ?`).run(plan, row.userId);
          return { action: 'plan_changed', userId: row.userId, plan };
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = data.customer;
      const row = db.prepare(`SELECT userId FROM stripe_customers WHERE customerId = ?`).get(customerId);
      if (row?.userId) {
        // Check for BYOK — don't downgrade to free if they have own keys
        const hasKeys = db.prepare(`SELECT COUNT(*) as c FROM user_api_keys WHERE userId = ? AND isActive = 1`).get(row.userId);
        const newPlan = hasKeys?.c > 0 ? 'byok' : 'free';
        db.prepare(`UPDATE users SET plan = ?, updatedAt = datetime('now') WHERE id = ?`).run(newPlan, row.userId);
        console.log(`[stripe] User ${row.userId} subscription cancelled → ${newPlan}`);
        return { action: 'cancelled', userId: row.userId, plan: newPlan };
      }
      break;
    }

    case 'invoice.payment_failed': {
      const customerId = data.customer;
      const row = db.prepare(`SELECT userId FROM stripe_customers WHERE customerId = ?`).get(customerId);
      if (row?.userId) {
        console.warn(`[stripe] Payment failed for user ${row.userId}`);
        return { action: 'payment_failed', userId: row.userId };
      }
      break;
    }

    default:
      return { action: 'ignored', type };
  }

  return { action: 'no_match', type };
}

/* ------------------------------------------------------------------ */
/*  DB schema for Stripe customer mapping                             */
/* ------------------------------------------------------------------ */

/**
 * Ensure stripe_customers table exists.
 * @param {import('better-sqlite3').Database} db
 */
export function ensureStripeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_customers (
      userId     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      customerId TEXT NOT NULL UNIQUE,
      createdAt  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
