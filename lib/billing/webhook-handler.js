/**
 * @module billing/webhook-handler
 * Stripe webhook processor.
 *
 * Handles subscription lifecycle events: checkout completion, plan changes,
 * cancellations, and payment outcomes. Designed for Node.js built-in `http`.
 */

import { getPlanByPriceId } from './plans.js';

/**
 * Read the raw request body as a string.
 * Stripe requires the raw body for signature verification.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes=65536] - Maximum body size (64 KB — Stripe events are small)
 * @returns {Promise<string>}
 */
function readRawBody(req, maxBytes = 65_536) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let len = 0;
    req.on('data', (chunk) => {
      len += chunk.length;
      if (len > maxBytes) {
        req.destroy();
        reject(new Error('Webhook payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

/**
 * @typedef {Object} WebhookHandlerOpts
 * @property {(event: { userId?: string, customerId: string, oldPlan?: string, newPlan: string, subscriptionId: string }) => Promise<void>|void} [onPlanChange]
 *   Called when a user's plan changes (checkout, upgrade, downgrade, cancel).
 * @property {(event: { customerId: string, invoiceId: string, amountDue: number, attemptCount: number }) => Promise<void>|void} [onPaymentFailed]
 *   Called when an invoice payment fails.
 */

/**
 * Create an HTTP request handler for Stripe webhooks.
 *
 * The returned function:
 * 1. Reads the raw body from the request
 * 2. Verifies the webhook signature via the StripeClient
 * 3. Dispatches to the appropriate event handler
 * 4. Always returns 200 OK (Stripe retries on non-2xx)
 *
 * @param {import('./stripe-client.js').StripeClient} stripeClient - Initialized Stripe client
 * @param {WebhookHandlerOpts} [opts={}] - Callback hooks
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createWebhookHandler(stripeClient, opts = {}) {
  const { onPlanChange, onPaymentFailed } = opts;

  /**
   * Handle checkout.session.completed — customer just subscribed.
   * @param {Record<string, unknown>} event
   */
  async function handleCheckoutCompleted(event) {
    const session = /** @type {Record<string, unknown>} */ (event.data?.object ?? {});
    const customerId = /** @type {string} */ (session.customer ?? '');
    const subscriptionId = /** @type {string} */ (session.subscription ?? '');
    const metadata = /** @type {Record<string, string>} */ (session.metadata ?? {});

    // Retrieve the subscription to find the price → plan
    if (subscriptionId) {
      const sub = await stripeClient.getSubscription(subscriptionId);
      if (!sub.error) {
        const items = /** @type {any} */ (sub).items?.data ?? [];
        const priceId = items[0]?.price?.id;
        const plan = priceId ? getPlanByPriceId(priceId) : null;

        if (onPlanChange) {
          await onPlanChange({
            userId: metadata.userId,
            customerId,
            newPlan: plan?.id ?? 'pro',
            subscriptionId,
          });
        }
      }
    }

    console.log(`[billing] Checkout completed: customer=${customerId} subscription=${subscriptionId}`);
  }

  /**
   * Handle customer.subscription.updated — plan change (upgrade/downgrade).
   * @param {Record<string, unknown>} event
   */
  async function handleSubscriptionUpdated(event) {
    const sub = /** @type {Record<string, unknown>} */ (event.data?.object ?? {});
    const customerId = /** @type {string} */ (sub.customer ?? '');
    const subscriptionId = /** @type {string} */ (sub.id ?? '');
    const status = /** @type {string} */ (sub.status ?? '');
    const metadata = /** @type {Record<string, string>} */ (sub.metadata ?? {});

    // Find the current price → plan
    const items = /** @type {any} */ (sub).items?.data ?? [];
    const priceId = items[0]?.price?.id;
    const plan = priceId ? getPlanByPriceId(priceId) : null;

    // Determine previous plan from the event's previous_attributes
    const prevAttrs = /** @type {Record<string, unknown>} */ (event.data?.previous_attributes ?? {});
    const prevItems = /** @type {any} */ (prevAttrs).items?.data ?? [];
    const prevPriceId = prevItems[0]?.price?.id;
    const prevPlan = prevPriceId ? getPlanByPriceId(prevPriceId) : null;

    if (onPlanChange && status === 'active') {
      await onPlanChange({
        userId: metadata.userId,
        customerId,
        oldPlan: prevPlan?.id,
        newPlan: plan?.id ?? 'pro',
        subscriptionId,
      });
    }

    console.log(`[billing] Subscription updated: customer=${customerId} status=${status} plan=${plan?.id ?? 'unknown'}`);
  }

  /**
   * Handle customer.subscription.deleted — subscription canceled.
   * @param {Record<string, unknown>} event
   */
  async function handleSubscriptionDeleted(event) {
    const sub = /** @type {Record<string, unknown>} */ (event.data?.object ?? {});
    const customerId = /** @type {string} */ (sub.customer ?? '');
    const subscriptionId = /** @type {string} */ (sub.id ?? '');
    const metadata = /** @type {Record<string, string>} */ (sub.metadata ?? {});

    if (onPlanChange) {
      await onPlanChange({
        userId: metadata.userId,
        customerId,
        newPlan: 'free',
        subscriptionId,
      });
    }

    console.log(`[billing] Subscription deleted: customer=${customerId} → free plan`);
  }

  /**
   * Handle invoice.payment_succeeded — log successful payment.
   * @param {Record<string, unknown>} event
   */
  async function handlePaymentSucceeded(event) {
    const invoice = /** @type {Record<string, unknown>} */ (event.data?.object ?? {});
    const customerId = /** @type {string} */ (invoice.customer ?? '');
    const invoiceId = /** @type {string} */ (invoice.id ?? '');
    const amountPaid = /** @type {number} */ (invoice.amount_paid ?? 0);

    console.log(`[billing] Payment succeeded: customer=${customerId} invoice=${invoiceId} amount=${amountPaid}`);
  }

  /**
   * Handle invoice.payment_failed — warn user, trigger grace period.
   * @param {Record<string, unknown>} event
   */
  async function handlePaymentFailed(event) {
    const invoice = /** @type {Record<string, unknown>} */ (event.data?.object ?? {});
    const customerId = /** @type {string} */ (invoice.customer ?? '');
    const invoiceId = /** @type {string} */ (invoice.id ?? '');
    const amountDue = /** @type {number} */ (invoice.amount_due ?? 0);
    const attemptCount = /** @type {number} */ (invoice.attempt_count ?? 1);

    if (onPaymentFailed) {
      await onPaymentFailed({
        customerId,
        invoiceId,
        amountDue,
        attemptCount,
      });
    }

    console.log(`[billing] Payment FAILED: customer=${customerId} invoice=${invoiceId} attempt=${attemptCount}`);
  }

  /** Event type → handler dispatch table */
  const handlers = {
    'checkout.session.completed': handleCheckoutCompleted,
    'customer.subscription.updated': handleSubscriptionUpdated,
    'customer.subscription.deleted': handleSubscriptionDeleted,
    'invoice.payment_succeeded': handlePaymentSucceeded,
    'invoice.payment_failed': handlePaymentFailed,
  };

  /**
   * HTTP request handler for POST /api/billing/webhook.
   *
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  return async function webhookHandler(req, res) {
    try {
      // Read raw body (signature verification needs the exact bytes)
      const rawBody = await readRawBody(req);
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing stripe-signature header' }));
        return;
      }

      // Verify signature and parse event
      let event;
      try {
        event = stripeClient.verifyWebhookSignature(rawBody, /** @type {string} */ (signature));
      } catch (err) {
        console.error('[billing] Webhook signature verification failed:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid signature' }));
        return;
      }

      // Dispatch to handler
      const eventType = /** @type {string} */ (event.type ?? '');
      const handler = handlers[eventType];

      if (handler) {
        try {
          await handler(event);
        } catch (err) {
          // Log but don't fail — Stripe would retry, causing duplicate processing
          console.error(`[billing] Error handling ${eventType}:`, err);
        }
      } else {
        console.log(`[billing] Unhandled webhook event: ${eventType}`);
      }

      // Always 200 OK — Stripe retries on non-2xx
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    } catch (err) {
      console.error('[billing] Webhook handler error:', err);
      // Still return 200 to prevent Stripe from hammering us with retries
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true, error: 'Internal error' }));
    }
  };
}
