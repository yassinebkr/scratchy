/**
 * @module billing/stripe-client
 * Stripe API wrapper using native fetch() — no stripe npm package needed.
 *
 * All methods return Stripe objects on success or { error: true, code, message }
 * on failure (never throws for API errors).
 */

import crypto from 'node:crypto';

const BASE_URL = 'https://api.stripe.com/v1';

/**
 * Encode an object as application/x-www-form-urlencoded.
 * Supports nested objects and arrays using Stripe's bracket notation.
 * @param {Record<string, unknown>} obj
 * @param {string} [prefix]
 * @returns {string}
 */
function formEncode(obj, prefix) {
  const parts = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object' && !Array.isArray(value)) {
      parts.push(formEncode(/** @type {Record<string, unknown>} */ (value), fullKey));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object' && item !== null) {
          parts.push(formEncode(/** @type {Record<string, unknown>} */ (item), `${fullKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

export class StripeClient {
  /** @type {string} */
  #secretKey;

  /** @type {string} */
  #webhookSecret;

  /**
   * @param {{ secretKey: string, webhookSecret: string }} config
   */
  constructor({ secretKey, webhookSecret }) {
    if (!secretKey) throw new Error('Stripe secretKey is required');
    if (!webhookSecret) throw new Error('Stripe webhookSecret is required');
    this.#secretKey = secretKey;
    this.#webhookSecret = webhookSecret;
  }

  /**
   * Make an authenticated request to the Stripe API.
   * @param {string} method - HTTP method
   * @param {string} path - API path (e.g. '/customers')
   * @param {Record<string, unknown>} [body] - Request body (form-encoded for POST)
   * @returns {Promise<Record<string, unknown>>}
   */
  async #request(method, path, body) {
    const url = `${BASE_URL}${path}`;
    /** @type {Record<string, string>} */
    const headers = {
      'Authorization': `Bearer ${this.#secretKey}`,
      'Stripe-Version': '2024-12-18.acacia',
    };

    /** @type {RequestInit} */
    const opts = { method, headers };

    if (body && (method === 'POST' || method === 'DELETE')) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.body = formEncode(body);
    }

    try {
      const resp = await fetch(url, opts);
      const data = await resp.json();

      if (!resp.ok) {
        return {
          error: true,
          code: data?.error?.code ?? `http_${resp.status}`,
          message: data?.error?.message ?? `Stripe API error (${resp.status})`,
        };
      }

      return data;
    } catch (err) {
      return {
        error: true,
        code: 'network_error',
        message: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Create a Stripe customer.
   * @param {string} email - Customer email
   * @param {string} [name] - Customer name
   * @param {Record<string, string>} [metadata] - Arbitrary metadata
   * @returns {Promise<Record<string, unknown>>} Stripe customer object or error
   */
  async createCustomer(email, name, metadata) {
    /** @type {Record<string, unknown>} */
    const body = { email };
    if (name) body.name = name;
    if (metadata) body.metadata = metadata;
    return this.#request('POST', '/customers', body);
  }

  /**
   * Create a Stripe Checkout session for subscription billing.
   * @param {string} customerId - Stripe customer ID
   * @param {string} priceId - Stripe price ID
   * @param {{ successUrl?: string, cancelUrl?: string, trialDays?: number, metadata?: Record<string, string> }} [opts]
   * @returns {Promise<Record<string, unknown>>} Checkout session object (includes .url) or error
   */
  async createCheckoutSession(customerId, priceId, opts = {}) {
    /** @type {Record<string, unknown>} */
    const body = {
      customer: customerId,
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: opts.successUrl ?? 'https://scratchy.app/billing?success=1',
      cancel_url: opts.cancelUrl ?? 'https://scratchy.app/billing?canceled=1',
      'automatic_tax[enabled]': 'true',
    };

    if (opts.trialDays && opts.trialDays > 0) {
      body.subscription_data = { trial_period_days: opts.trialDays };
    }

    if (opts.metadata) {
      body.metadata = opts.metadata;
    }

    return this.#request('POST', '/checkout/sessions', body);
  }

  /**
   * Create a Customer Portal session for self-service subscription management.
   * @param {string} customerId - Stripe customer ID
   * @param {string} [returnUrl] - URL to return to after portal
   * @returns {Promise<Record<string, unknown>>} Portal session object (includes .url) or error
   */
  async createPortalSession(customerId, returnUrl) {
    /** @type {Record<string, unknown>} */
    const body = {
      customer: customerId,
      return_url: returnUrl ?? 'https://scratchy.app/billing',
    };
    return this.#request('POST', '/billing_portal/sessions', body);
  }

  /**
   * Retrieve a subscription by ID.
   * @param {string} subscriptionId - Stripe subscription ID
   * @returns {Promise<Record<string, unknown>>} Subscription object or error
   */
  async getSubscription(subscriptionId) {
    return this.#request('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  /**
   * Cancel a subscription.
   * @param {string} subscriptionId - Stripe subscription ID
   * @param {boolean} [atPeriodEnd=true] - If true, cancel at end of billing period
   * @returns {Promise<Record<string, unknown>>} Updated subscription or error
   */
  async cancelSubscription(subscriptionId, atPeriodEnd = true) {
    if (atPeriodEnd) {
      return this.#request('POST', `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        cancel_at_period_end: 'true',
      });
    }
    return this.#request('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`);
  }

  /**
   * List invoices for a customer.
   * @param {string} customerId - Stripe customer ID
   * @param {number} [limit=10] - Max invoices to return (1-100)
   * @returns {Promise<Record<string, unknown>>} Invoice list or error
   */
  async listInvoices(customerId, limit = 10) {
    const params = new URLSearchParams({
      customer: customerId,
      limit: String(Math.min(Math.max(limit, 1), 100)),
    });
    return this.#request('GET', `/invoices?${params.toString()}`);
  }

  /**
   * Verify a Stripe webhook signature and parse the event.
   *
   * Uses the `stripe-signature` header with HMAC-SHA256 (v1 scheme).
   * @param {string|Buffer} payload - Raw request body
   * @param {string} signature - Value of the `stripe-signature` header
   * @returns {Record<string, unknown>} Parsed Stripe event
   * @throws {Error} If signature is invalid or timestamp is too old
   */
  verifyWebhookSignature(payload, signature) {
    const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf-8');

    // Parse the signature header: t=<timestamp>,v1=<sig>,v1=<sig>,...
    const parts = signature.split(',').reduce((acc, part) => {
      const [key, val] = part.split('=', 2);
      if (key === 't') acc.timestamp = val;
      if (key === 'v1') acc.signatures.push(val);
      return acc;
    }, { timestamp: '', signatures: /** @type {string[]} */ ([]) });

    if (!parts.timestamp || parts.signatures.length === 0) {
      throw new Error('Invalid Stripe signature header format');
    }

    // Check timestamp tolerance (5 minutes)
    const timestampAge = Math.floor(Date.now() / 1000) - Number(parts.timestamp);
    if (Math.abs(timestampAge) > 300) {
      throw new Error('Stripe webhook timestamp too old');
    }

    // Compute expected signature
    const signedPayload = `${parts.timestamp}.${payloadStr}`;
    const expectedSig = crypto
      .createHmac('sha256', this.#webhookSecret)
      .update(signedPayload, 'utf-8')
      .digest('hex');

    // Constant-time comparison against all provided v1 signatures
    const valid = parts.signatures.some((sig) => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(expectedSig, 'hex'),
          Buffer.from(sig, 'hex'),
        );
      } catch {
        return false;
      }
    });

    if (!valid) {
      throw new Error('Stripe webhook signature verification failed');
    }

    return JSON.parse(payloadStr);
  }
}
