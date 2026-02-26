/**
 * Phase 4 — Billing + Memory Consolidation Tests
 *
 * Covers:
 *   - Plans (getPlan, getPlanByPriceId, checkQuota, canAccessModel)
 *   - StripeClient (checkout, portal, webhook signature verification)
 *   - UsageTracker (record, getUsage, quota, monthly, model breakdown)
 *   - WebhookHandler (event dispatch, signature enforcement)
 *   - Billing Routes (HTTP endpoints)
 *   - Memory Consolidation (consolidate, scoreRelevance, pruneStale, stats)
 *
 * All tests use mocks — no real Stripe API calls, no real databases.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import Database from 'better-sqlite3';

// ═══════════════════════════════════════════════════════════════════════════════
//  Plans
// ═══════════════════════════════════════════════════════════════════════════════

import {
  PLANS,
  getPlan,
  getPlanByPriceId,
  checkQuota,
  canAccessModel,
} from '../lib/billing/plans.js';

describe('Phase 4: Billing + Memory Consolidation', () => {

  // ─── Plans ──────────────────────────────────────────────────────────────────
  describe('Plans', () => {
    it('getPlan returns correct plan by id (free)', () => {
      const plan = getPlan('free');
      assert.ok(plan);
      assert.equal(plan.id, 'free');
      assert.equal(plan.price, 0);
      assert.equal(plan.quotas.messagesPerDay, 50);
    });

    it('getPlan returns correct plan by id (pro)', () => {
      const plan = getPlan('pro');
      assert.ok(plan);
      assert.equal(plan.id, 'pro');
      assert.equal(plan.price, 1500);
      assert.equal(plan.interval, 'month');
    });

    it('getPlan returns correct plan by id (team)', () => {
      const plan = getPlan('team');
      assert.ok(plan);
      assert.equal(plan.id, 'team');
      assert.equal(plan.seats, 5);
    });

    it('getPlan returns correct plan by id (byok)', () => {
      const plan = getPlan('byok');
      assert.ok(plan);
      assert.equal(plan.id, 'byok');
      assert.equal(plan.quotas.messagesPerDay, Infinity);
      assert.equal(plan.quotas.tokensPerDay, Infinity);
    });

    it('getPlan returns undefined for unknown plan', () => {
      assert.equal(getPlan('nonexistent'), undefined);
    });

    it('getPlanByPriceId maps Stripe price to plan (pro)', () => {
      const plan = getPlanByPriceId('price_pro_monthly');
      assert.ok(plan);
      assert.equal(plan.id, 'pro');
    });

    it('getPlanByPriceId maps Stripe price to plan (team)', () => {
      const plan = getPlanByPriceId('price_team_monthly');
      assert.ok(plan);
      assert.equal(plan.id, 'team');
    });

    it('getPlanByPriceId maps Stripe price to plan (byok)', () => {
      const plan = getPlanByPriceId('price_byok_monthly');
      assert.ok(plan);
      assert.equal(plan.id, 'byok');
    });

    it('getPlanByPriceId returns undefined for unknown price', () => {
      assert.equal(getPlanByPriceId('price_fake'), undefined);
    });

    it('getPlanByPriceId matches free plan when called with undefined (no stripePriceId field)', () => {
      // Free plan has no stripePriceId, so plan.stripePriceId === undefined matches
      const plan = getPlanByPriceId(undefined);
      assert.ok(plan);
      assert.equal(plan.id, 'free');
    });

    it('checkQuota returns allowed/remaining/limit/resetAt when within quota', () => {
      const plan = getPlan('free');
      const result = checkQuota({ messages: 10, tokens: 5000 }, plan);
      assert.equal(result.allowed, true);
      assert.equal(result.remaining.messages, 40);
      assert.equal(result.remaining.tokens, 95_000);
      assert.equal(result.limit.messages, 50);
      assert.equal(result.limit.tokens, 100_000);
      assert.ok(result.resetAt); // ISO string
      assert.ok(result.resetAt.endsWith('Z'));
    });

    it('checkQuota disallows when messages exceed limit', () => {
      const plan = getPlan('free');
      const result = checkQuota({ messages: 50, tokens: 0 }, plan);
      assert.equal(result.allowed, false);
      assert.equal(result.remaining.messages, 0);
    });

    it('checkQuota disallows when tokens exceed limit', () => {
      const plan = getPlan('free');
      const result = checkQuota({ messages: 0, tokens: 100_000 }, plan);
      assert.equal(result.allowed, false);
      assert.equal(result.remaining.tokens, 0);
    });

    it('checkQuota remaining floors at 0', () => {
      const plan = getPlan('free');
      const result = checkQuota({ messages: 999, tokens: 999_999 }, plan);
      assert.equal(result.remaining.messages, 0);
      assert.equal(result.remaining.tokens, 0);
    });

    it('checkQuota with BYOK Infinity limits always allows', () => {
      const plan = getPlan('byok');
      const result = checkQuota({ messages: 1_000_000, tokens: 999_999_999 }, plan);
      assert.equal(result.allowed, true);
    });

    it('canAccessModel with wildcard (BYOK) allows any model', () => {
      const plan = getPlan('byok');
      assert.equal(canAccessModel(plan, 'sonnet'), true);
      assert.equal(canAccessModel(plan, 'opus'), true);
      assert.equal(canAccessModel(plan, 'gpt-5-turbo-max'), true);
      assert.equal(canAccessModel(plan, 'anything'), true);
    });

    it('canAccessModel allows listed models', () => {
      const plan = getPlan('pro');
      assert.equal(canAccessModel(plan, 'sonnet'), true);
      assert.equal(canAccessModel(plan, 'opus'), true);
    });

    it('canAccessModel denies restricted models on free plan', () => {
      const plan = getPlan('free');
      assert.equal(canAccessModel(plan, 'opus'), false);
      assert.equal(canAccessModel(plan, 'gpt-4'), false);
    });

    it('canAccessModel allows sonnet on free plan', () => {
      const plan = getPlan('free');
      assert.equal(canAccessModel(plan, 'sonnet'), true);
    });

    it('PLANS array has exactly 4 plans', () => {
      assert.equal(PLANS.length, 4);
    });

    it('all plans have required fields', () => {
      for (const plan of PLANS) {
        assert.ok(plan.id, `plan missing id`);
        assert.ok(plan.name, `plan ${plan.id} missing name`);
        assert.ok(plan.currency, `plan ${plan.id} missing currency`);
        assert.ok(plan.quotas, `plan ${plan.id} missing quotas`);
        assert.ok(Array.isArray(plan.models), `plan ${plan.id} models not array`);
        assert.ok(typeof plan.seats === 'number', `plan ${plan.id} seats not number`);
      }
    });
  });

  // ─── StripeClient ───────────────────────────────────────────────────────────
  describe('StripeClient', () => {
    // We need to dynamically import StripeClient so we can mock fetch before it runs
    let StripeClient;
    let originalFetch;

    beforeEach(async () => {
      originalFetch = globalThis.fetch;
      // Re-import fresh each time
      const mod = await import('../lib/billing/stripe-client.js');
      StripeClient = mod.StripeClient;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('constructor requires secretKey', () => {
      assert.throws(() => new StripeClient({ secretKey: '', webhookSecret: 'whsec_test' }), /secretKey/);
    });

    it('constructor requires webhookSecret', () => {
      assert.throws(() => new StripeClient({ secretKey: 'sk_test', webhookSecret: '' }), /webhookSecret/);
    });

    it('creates checkout session (mock fetch)', async () => {
      const mockResponse = { id: 'cs_test_123', url: 'https://checkout.stripe.com/test' };
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      }));

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      const result = await client.createCheckoutSession('cus_123', 'price_pro_monthly');

      assert.equal(result.id, 'cs_test_123');
      assert.equal(result.url, 'https://checkout.stripe.com/test');

      // Verify fetch was called with correct URL and auth
      const call = globalThis.fetch.mock.calls[0];
      assert.ok(call.arguments[0].includes('checkout/sessions'));
      assert.equal(call.arguments[1].method, 'POST');
      assert.ok(call.arguments[1].headers['Authorization'].startsWith('Bearer sk_test_key'));
    });

    it('creates customer portal URL', async () => {
      const mockResponse = { id: 'bps_test_123', url: 'https://billing.stripe.com/portal' };
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      }));

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      const result = await client.createPortalSession('cus_123');

      assert.equal(result.url, 'https://billing.stripe.com/portal');
      const call = globalThis.fetch.mock.calls[0];
      assert.ok(call.arguments[0].includes('billing_portal/sessions'));
    });

    it('creates customer with metadata', async () => {
      const mockResponse = { id: 'cus_new_123', email: 'test@example.com' };
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockResponse,
      }));

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      const result = await client.createCustomer('test@example.com', 'Test User', { userId: 'u1' });

      assert.equal(result.id, 'cus_new_123');
      const call = globalThis.fetch.mock.calls[0];
      assert.ok(call.arguments[0].includes('/customers'));
      // Body should contain form-encoded data
      assert.ok(call.arguments[1].body.includes('email='));
    });

    it('handles API error response', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: { code: 'invalid_request', message: 'Bad request' } }),
      }));

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      const result = await client.createCustomer('bad@email');

      assert.equal(result.error, true);
      assert.equal(result.code, 'invalid_request');
      assert.equal(result.message, 'Bad request');
    });

    it('handles network error', async () => {
      globalThis.fetch = mock.fn(async () => {
        throw new Error('ECONNRESET');
      });

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      const result = await client.createCustomer('test@example.com');

      assert.equal(result.error, true);
      assert.equal(result.code, 'network_error');
      assert.ok(result.message.includes('ECONNRESET'));
    });

    it('verifies webhook signature (valid)', () => {
      const secret = 'whsec_test_secret_key_1234';
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: secret });

      const payload = JSON.stringify({ type: 'test.event', data: { foo: 'bar' } });
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf-8').digest('hex');
      const header = `t=${timestamp},v1=${sig}`;

      const result = client.verifyWebhookSignature(payload, header);
      assert.equal(result.type, 'test.event');
      assert.deepEqual(result.data, { foo: 'bar' });
    });

    it('verifies webhook signature with Buffer payload', () => {
      const secret = 'whsec_test_secret_buf';
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: secret });

      const payload = JSON.stringify({ type: 'buf.event' });
      const payloadBuf = Buffer.from(payload, 'utf-8');
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf-8').digest('hex');
      const header = `t=${timestamp},v1=${sig}`;

      const result = client.verifyWebhookSignature(payloadBuf, header);
      assert.equal(result.type, 'buf.event');
    });

    it('rejects invalid webhook signature', () => {
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: 'whsec_real_secret' });
      const payload = JSON.stringify({ type: 'test.event' });
      const timestamp = Math.floor(Date.now() / 1000);
      const header = `t=${timestamp},v1=deadbeefcafebabe0000000000000000000000000000000000000000deadbeef`;

      assert.throws(() => client.verifyWebhookSignature(payload, header), /signature verification failed/);
    });

    it('rejects expired webhook timestamp', () => {
      const secret = 'whsec_ts';
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: secret });

      const payload = JSON.stringify({ type: 'test.event' });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signedPayload = `${oldTimestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf-8').digest('hex');
      const header = `t=${oldTimestamp},v1=${sig}`;

      assert.throws(() => client.verifyWebhookSignature(payload, header), /timestamp too old/);
    });

    it('rejects future webhook timestamp beyond tolerance', () => {
      const secret = 'whsec_future';
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: secret });

      const payload = JSON.stringify({ type: 'test.event' });
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in the future
      const signedPayload = `${futureTimestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf-8').digest('hex');
      const header = `t=${futureTimestamp},v1=${sig}`;

      assert.throws(() => client.verifyWebhookSignature(payload, header), /timestamp too old/);
    });

    it('rejects malformed signature header (no timestamp)', () => {
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: 'whsec_test' });
      assert.throws(
        () => client.verifyWebhookSignature('{}', 'v1=abc123'),
        /Invalid Stripe signature header format/
      );
    });

    it('rejects malformed signature header (no v1)', () => {
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: 'whsec_test' });
      assert.throws(
        () => client.verifyWebhookSignature('{}', 't=12345'),
        /Invalid Stripe signature header format/
      );
    });

    it('constant-time signature comparison (uses timingSafeEqual)', () => {
      const secret = 'whsec_timing';
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: secret });

      // Construct a valid signature to ensure we hit the timingSafeEqual path
      const payload = JSON.stringify({ type: 'timing.test' });
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf-8').digest('hex');

      // Tamper with the last byte of the signature — should still use timingSafeEqual internally
      const tamperedSig = sig.slice(0, -2) + 'ff';
      const header = `t=${timestamp},v1=${tamperedSig}`;

      assert.throws(() => client.verifyWebhookSignature(payload, header), /signature verification failed/);
    });

    it('accepts any of multiple v1 signatures', () => {
      const secret = 'whsec_multi';
      const client = new StripeClient({ secretKey: 'sk_test', webhookSecret: secret });

      const payload = JSON.stringify({ type: 'multi.sig' });
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const realSig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf-8').digest('hex');
      const fakeSig = 'a'.repeat(64);
      // Real sig is the second v1
      const header = `t=${timestamp},v1=${fakeSig},v1=${realSig}`;

      const result = client.verifyWebhookSignature(payload, header);
      assert.equal(result.type, 'multi.sig');
    });

    it('getSubscription calls correct endpoint', async () => {
      const mockSub = { id: 'sub_123', status: 'active' };
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => mockSub,
      }));

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      const result = await client.getSubscription('sub_123');

      assert.equal(result.id, 'sub_123');
      const call = globalThis.fetch.mock.calls[0];
      assert.ok(call.arguments[0].includes('/subscriptions/sub_123'));
      assert.equal(call.arguments[1].method, 'GET');
    });

    it('cancelSubscription at period end', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'sub_123', cancel_at_period_end: true }),
      }));

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      const result = await client.cancelSubscription('sub_123', true);

      assert.equal(result.cancel_at_period_end, true);
      const call = globalThis.fetch.mock.calls[0];
      assert.equal(call.arguments[1].method, 'POST');
      assert.ok(call.arguments[1].body.includes('cancel_at_period_end'));
    });

    it('cancelSubscription immediately uses DELETE', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'sub_123', status: 'canceled' }),
      }));

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      await client.cancelSubscription('sub_123', false);

      const call = globalThis.fetch.mock.calls[0];
      assert.equal(call.arguments[1].method, 'DELETE');
    });

    it('listInvoices calls with correct params', async () => {
      globalThis.fetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      const client = new StripeClient({ secretKey: 'sk_test_key', webhookSecret: 'whsec_test' });
      await client.listInvoices('cus_123', 5);

      const call = globalThis.fetch.mock.calls[0];
      assert.ok(call.arguments[0].includes('customer=cus_123'));
      assert.ok(call.arguments[0].includes('limit=5'));
    });
  });

  // ─── UsageTracker ───────────────────────────────────────────────────────────
  describe('UsageTracker', () => {
    // Import dynamically to avoid module-level side effects
    let UsageTracker;
    let db;

    beforeEach(async () => {
      const mod = await import('../lib/billing/usage-tracker.js');
      UsageTracker = mod.UsageTracker;
      db = new Database(':memory:');
    });

    afterEach(() => {
      if (db && db.open) db.close();
    });

    it('constructor requires a database instance', () => {
      assert.throws(() => new UsageTracker(null), /requires a database/);
    });

    it('creates usage_daily table on construction', () => {
      const tracker = new UsageTracker(db);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='usage_daily'"
      ).all();
      assert.equal(tables.length, 1);
    });

    it('records usage and increments daily counter', async () => {
      const tracker = new UsageTracker(db);
      await tracker.recordUsage('user1', { messages: 5, tokens: 1000 });

      const usage = await tracker.getUsage('user1');
      assert.equal(usage.messages, 5);
      assert.equal(usage.tokens, 1000);
    });

    it('increments existing usage counters', async () => {
      const tracker = new UsageTracker(db);
      await tracker.recordUsage('user1', { messages: 5, tokens: 1000 });
      await tracker.recordUsage('user1', { messages: 3, tokens: 500 });

      const usage = await tracker.getUsage('user1');
      assert.equal(usage.messages, 8);
      assert.equal(usage.tokens, 1500);
    });

    it('returns zero usage for new user', async () => {
      const tracker = new UsageTracker(db);
      const usage = await tracker.getUsage('nonexistent');
      assert.equal(usage.messages, 0);
      assert.equal(usage.tokens, 0);
      assert.deepEqual(usage.modelBreakdown, {});
    });

    it('automatic date reset (different day key)', async () => {
      const tracker = new UsageTracker(db);

      // Insert usage for a past date directly
      db.prepare(
        "INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)"
      ).run('user1', '2025-01-01', 42, 9999, '{}');

      // Today's usage should be zero (different date key)
      const todayUsage = await tracker.getUsage('user1');
      // If today is not 2025-01-01, usage should be 0
      const today = new Date().toISOString().slice(0, 10);
      if (today !== '2025-01-01') {
        assert.equal(todayUsage.messages, 0);
      }

      // Past date should still have data
      const pastUsage = await tracker.getUsage('user1', '2025-01-01');
      assert.equal(pastUsage.messages, 42);
      assert.equal(pastUsage.tokens, 9999);
    });

    it('checkQuota integrates with plans', async () => {
      const tracker = new UsageTracker(db);
      await tracker.recordUsage('user1', { messages: 10, tokens: 5000 });

      const quota = await tracker.checkQuota('user1', 'free');
      assert.equal(quota.allowed, true);
      assert.equal(quota.remaining.messages, 40);
      assert.equal(quota.remaining.tokens, 95_000);
      assert.ok(quota.resetAt);
    });

    it('checkQuota disallows when quota exceeded', async () => {
      const tracker = new UsageTracker(db);
      await tracker.recordUsage('user1', { messages: 50, tokens: 0 });

      const quota = await tracker.checkQuota('user1', 'free');
      assert.equal(quota.allowed, false);
    });

    it('checkQuota handles unknown plan gracefully', async () => {
      const tracker = new UsageTracker(db);
      const quota = await tracker.checkQuota('user1', 'nonexistent_plan');
      assert.equal(quota.allowed, false);
      assert.equal(quota.remaining.messages, 0);
      assert.equal(quota.remaining.tokens, 0);
    });

    it('getMonthlyUsage aggregates correctly', async () => {
      const tracker = new UsageTracker(db);
      const month = new Date().toISOString().slice(0, 7); // YYYY-MM
      const day1 = `${month}-05`;
      const day2 = `${month}-10`;

      db.prepare(
        "INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)"
      ).run('user1', day1, 100, 50000, JSON.stringify({ sonnet: { messages: 100, tokens: 50000 } }));
      db.prepare(
        "INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)"
      ).run('user1', day2, 200, 75000, JSON.stringify({ opus: { messages: 200, tokens: 75000 } }));

      const monthly = await tracker.getMonthlyUsage('user1', month);
      assert.equal(monthly.totalMessages, 300);
      assert.equal(monthly.totalTokens, 125000);
      assert.equal(monthly.days, 2);
      assert.equal(monthly.month, month);
    });

    it('getMonthlyUsage returns zeros for no data', async () => {
      const tracker = new UsageTracker(db);
      const monthly = await tracker.getMonthlyUsage('user1', '2020-01');
      assert.equal(monthly.totalMessages, 0);
      assert.equal(monthly.totalTokens, 0);
      assert.equal(monthly.days, 0);
    });

    it('model breakdown tracking', async () => {
      const tracker = new UsageTracker(db);
      await tracker.recordUsage('user1', { messages: 3, tokens: 1000, model: 'sonnet' });
      await tracker.recordUsage('user1', { messages: 2, tokens: 5000, model: 'opus' });
      await tracker.recordUsage('user1', { messages: 1, tokens: 200, model: 'sonnet' });

      const usage = await tracker.getUsage('user1');
      assert.equal(usage.messages, 6);
      assert.equal(usage.tokens, 6200);
      assert.equal(usage.modelBreakdown.sonnet.messages, 4);
      assert.equal(usage.modelBreakdown.sonnet.tokens, 1200);
      assert.equal(usage.modelBreakdown.opus.messages, 2);
      assert.equal(usage.modelBreakdown.opus.tokens, 5000);
    });

    it('model breakdown aggregates in monthly usage', async () => {
      const tracker = new UsageTracker(db);
      const month = '2025-06';

      db.prepare(
        "INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)"
      ).run('user1', '2025-06-01', 10, 1000, JSON.stringify({ sonnet: { messages: 10, tokens: 1000 } }));
      db.prepare(
        "INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)"
      ).run('user1', '2025-06-02', 5, 2000, JSON.stringify({ sonnet: { messages: 3, tokens: 1000 }, opus: { messages: 2, tokens: 1000 } }));

      const monthly = await tracker.getMonthlyUsage('user1', month);
      assert.equal(monthly.modelBreakdown.sonnet.messages, 13);
      assert.equal(monthly.modelBreakdown.sonnet.tokens, 2000);
      assert.equal(monthly.modelBreakdown.opus.messages, 2);
      assert.equal(monthly.modelBreakdown.opus.tokens, 1000);
    });

    it('getUsageRange returns correct date range', async () => {
      const tracker = new UsageTracker(db);

      db.prepare(
        "INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)"
      ).run('user1', '2025-03-01', 10, 1000, '{}');
      db.prepare(
        "INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)"
      ).run('user1', '2025-03-05', 20, 2000, '{}');
      db.prepare(
        "INSERT INTO usage_daily (userId, date, messages, tokens, modelBreakdown) VALUES (?, ?, ?, ?, ?)"
      ).run('user1', '2025-03-15', 30, 3000, '{}');

      const range = await tracker.getUsageRange('user1', '2025-03-01', '2025-03-10');
      assert.equal(range.length, 2);
      assert.equal(range[0].messages, 10);
      assert.equal(range[1].messages, 20);
    });

    it('isolates usage between users', async () => {
      const tracker = new UsageTracker(db);
      await tracker.recordUsage('alice', { messages: 10, tokens: 1000 });
      await tracker.recordUsage('bob', { messages: 20, tokens: 2000 });

      const aliceUsage = await tracker.getUsage('alice');
      const bobUsage = await tracker.getUsage('bob');

      assert.equal(aliceUsage.messages, 10);
      assert.equal(bobUsage.messages, 20);
    });
  });

  // ─── WebhookHandler ────────────────────────────────────────────────────────
  describe('WebhookHandler', () => {
    let createWebhookHandler;

    beforeEach(async () => {
      const mod = await import('../lib/billing/webhook-handler.js');
      createWebhookHandler = mod.createWebhookHandler;
    });

    /**
     * Create a mock IncomingMessage from a string body and headers.
     */
    function mockReq(body, headers = {}) {
      const emitter = new EventEmitter();
      emitter.headers = headers;
      // Simulate data event in next tick
      process.nextTick(() => {
        emitter.emit('data', Buffer.from(body, 'utf-8'));
        emitter.emit('end');
      });
      return emitter;
    }

    /**
     * Create a mock ServerResponse that captures writeHead and end calls.
     */
    function mockRes() {
      const res = {
        statusCode: null,
        headers: {},
        body: null,
        writeHead(status, headers) {
          res.statusCode = status;
          res.headers = headers || {};
        },
        end(data) {
          res.body = data ? JSON.parse(data) : null;
        },
      };
      return res;
    }

    /**
     * Build a valid Stripe webhook signature for test payloads.
     */
    function buildSignature(payload, secret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const sig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf-8').digest('hex');
      return `t=${timestamp},v1=${sig}`;
    }

    function makeStripeClient(secret) {
      // Minimal mock that has verifyWebhookSignature + getSubscription
      return {
        verifyWebhookSignature(payload, signature) {
          // Use the real StripeClient verification
          const payloadStr = typeof payload === 'string' ? payload : payload.toString('utf-8');
          const parts = signature.split(',').reduce((acc, part) => {
            const [key, val] = part.split('=', 2);
            if (key === 't') acc.timestamp = val;
            if (key === 'v1') acc.signatures.push(val);
            return acc;
          }, { timestamp: '', signatures: [] });

          if (!parts.timestamp || parts.signatures.length === 0) {
            throw new Error('Invalid Stripe signature header format');
          }
          const timestampAge = Math.floor(Date.now() / 1000) - Number(parts.timestamp);
          if (Math.abs(timestampAge) > 300) {
            throw new Error('Stripe webhook timestamp too old');
          }

          const signedPayload = `${parts.timestamp}.${payloadStr}`;
          const expectedSig = crypto.createHmac('sha256', secret).update(signedPayload, 'utf-8').digest('hex');
          const valid = parts.signatures.some((sig) => {
            try {
              return crypto.timingSafeEqual(Buffer.from(expectedSig, 'hex'), Buffer.from(sig, 'hex'));
            } catch { return false; }
          });
          if (!valid) throw new Error('Stripe webhook signature verification failed');
          return JSON.parse(payloadStr);
        },
        async getSubscription() {
          return {
            id: 'sub_test',
            items: { data: [{ price: { id: 'price_pro_monthly' } }] },
          };
        },
      };
    }

    it('checkout.session.completed activates subscription', async () => {
      const secret = 'whsec_handler_test';
      let planChangeEvent = null;
      const stripeClient = makeStripeClient(secret);
      const handler = createWebhookHandler(stripeClient, {
        onPlanChange: (e) => { planChangeEvent = e; },
      });

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_abc',
            subscription: 'sub_test',
            metadata: { userId: 'user_1' },
          },
        },
      };
      const payload = JSON.stringify(event);
      const sig = buildSignature(payload, secret);

      const req = mockReq(payload, { 'stripe-signature': sig });
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(planChangeEvent);
      assert.equal(planChangeEvent.customerId, 'cus_abc');
      assert.equal(planChangeEvent.newPlan, 'pro'); // price_pro_monthly → pro
      assert.equal(planChangeEvent.userId, 'user_1');
    });

    it('customer.subscription.deleted reverts to free', async () => {
      const secret = 'whsec_del';
      let planChangeEvent = null;
      const stripeClient = makeStripeClient(secret);
      const handler = createWebhookHandler(stripeClient, {
        onPlanChange: (e) => { planChangeEvent = e; },
      });

      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_del',
            customer: 'cus_del',
            metadata: { userId: 'user_2' },
          },
        },
      };
      const payload = JSON.stringify(event);
      const sig = buildSignature(payload, secret);

      const req = mockReq(payload, { 'stripe-signature': sig });
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(planChangeEvent);
      assert.equal(planChangeEvent.newPlan, 'free');
      assert.equal(planChangeEvent.customerId, 'cus_del');
    });

    it('invoice.payment_failed triggers callback', async () => {
      const secret = 'whsec_fail';
      let failEvent = null;
      const stripeClient = makeStripeClient(secret);
      const handler = createWebhookHandler(stripeClient, {
        onPaymentFailed: (e) => { failEvent = e; },
      });

      const event = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'inv_fail',
            customer: 'cus_fail',
            amount_due: 1500,
            attempt_count: 2,
          },
        },
      };
      const payload = JSON.stringify(event);
      const sig = buildSignature(payload, secret);

      const req = mockReq(payload, { 'stripe-signature': sig });
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(failEvent);
      assert.equal(failEvent.customerId, 'cus_fail');
      assert.equal(failEvent.amountDue, 1500);
      assert.equal(failEvent.attemptCount, 2);
    });

    it('invoice.payment_succeeded returns 200', async () => {
      const secret = 'whsec_succ';
      const stripeClient = makeStripeClient(secret);
      const handler = createWebhookHandler(stripeClient);

      const event = {
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'inv_ok',
            customer: 'cus_ok',
            amount_paid: 1500,
          },
        },
      };
      const payload = JSON.stringify(event);
      const sig = buildSignature(payload, secret);

      const req = mockReq(payload, { 'stripe-signature': sig });
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { received: true });
    });

    it('unknown event type returns 200 (no crash)', async () => {
      const secret = 'whsec_unknown';
      const stripeClient = makeStripeClient(secret);
      const handler = createWebhookHandler(stripeClient);

      const event = { type: 'some.unknown.event', data: { object: {} } };
      const payload = JSON.stringify(event);
      const sig = buildSignature(payload, secret);

      const req = mockReq(payload, { 'stripe-signature': sig });
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { received: true });
    });

    it('missing signature returns 400', async () => {
      const secret = 'whsec_nosig';
      const stripeClient = makeStripeClient(secret);
      const handler = createWebhookHandler(stripeClient);

      const payload = JSON.stringify({ type: 'test' });
      const req = mockReq(payload, {}); // No stripe-signature header
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 400);
      assert.ok(res.body.error.includes('Missing'));
    });

    it('invalid signature returns 400', async () => {
      const secret = 'whsec_badsig';
      const stripeClient = makeStripeClient(secret);
      const handler = createWebhookHandler(stripeClient);

      const payload = JSON.stringify({ type: 'test' });
      const ts = Math.floor(Date.now() / 1000);
      const badSig = `t=${ts},v1=${'a'.repeat(64)}`;

      const req = mockReq(payload, { 'stripe-signature': badSig });
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 400);
      assert.ok(res.body.error.includes('Invalid signature'));
    });

    it('customer.subscription.updated dispatches onPlanChange for active', async () => {
      const secret = 'whsec_updated';
      let planChangeEvent = null;
      const stripeClient = makeStripeClient(secret);
      const handler = createWebhookHandler(stripeClient, {
        onPlanChange: (e) => { planChangeEvent = e; },
      });

      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_upd',
            customer: 'cus_upd',
            status: 'active',
            metadata: { userId: 'user_3' },
            items: { data: [{ price: { id: 'price_team_monthly' } }] },
          },
          previous_attributes: {},
        },
      };
      const payload = JSON.stringify(event);
      const sig = buildSignature(payload, secret);

      const req = mockReq(payload, { 'stripe-signature': sig });
      const res = mockRes();
      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(planChangeEvent);
      assert.equal(planChangeEvent.newPlan, 'team');
    });
  });

  // ─── Billing Routes ────────────────────────────────────────────────────────
  describe('Billing Routes', () => {
    let billingRoutes;
    let originalFetch;

    beforeEach(async () => {
      originalFetch = globalThis.fetch;
      const mod = await import('../server/routes/billing.js');
      billingRoutes = mod.billingRoutes;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    /**
     * Create mock IncomingMessage (with URL and method).
     */
    function mockReq(method, url, body = null, headers = {}) {
      const emitter = new EventEmitter();
      emitter.method = method;
      emitter.url = url;
      emitter.headers = { host: 'localhost', ...headers };

      process.nextTick(() => {
        if (body) {
          emitter.emit('data', Buffer.from(JSON.stringify(body), 'utf-8'));
        }
        emitter.emit('end');
      });
      return emitter;
    }

    function mockRes() {
      const res = {
        statusCode: null,
        headers: {},
        body: null,
        writeHead(status, headers) {
          res.statusCode = status;
          res.headers = headers || {};
        },
        end(data) {
          res.body = data ? JSON.parse(data) : null;
        },
      };
      return res;
    }

    function makeDeps(overrides = {}) {
      const db = new Database(':memory:');
      return {
        stripeClient: {
          createCustomer: mock.fn(async () => ({ id: 'cus_new' })),
          createCheckoutSession: mock.fn(async () => ({ url: 'https://checkout.stripe.com/test' })),
          createPortalSession: mock.fn(async () => ({ url: 'https://portal.stripe.com/test' })),
          verifyWebhookSignature: mock.fn(() => ({ type: 'test', data: {} })),
        },
        usageTracker: {
          getUsage: mock.fn(async () => ({ messages: 10, tokens: 5000, modelBreakdown: {} })),
          checkQuota: mock.fn(async () => ({ allowed: true, remaining: { messages: 40, tokens: 95000 }, resetAt: '2025-01-02T00:00:00.000Z' })),
          getMonthlyUsage: mock.fn(async () => ({ month: '2025-01', totalMessages: 100, totalTokens: 50000, days: 5, modelBreakdown: {} })),
        },
        webhookHandler: mock.fn(async (req, res) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        }),
        authenticate: mock.fn(async () => ({
          id: 'user_1',
          username: 'testuser',
          plan: 'free',
        })),
        getUserBilling: mock.fn(() => ({ stripeCustomerId: 'cus_existing', plan: 'free' })),
        updateUserBilling: mock.fn(() => {}),
        ...overrides,
      };
    }

    it('GET /usage returns current usage + quota', async () => {
      const deps = makeDeps();
      const handlers = billingRoutes(null, deps);

      const req = mockReq('GET', '/api/billing/usage');
      const res = mockRes();
      await handlers.usage(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.today);
      assert.ok(res.body.quota);
      assert.ok(res.body.monthly);
      assert.equal(res.body.planId, 'free');
    });

    it('GET /usage returns 401 when unauthenticated', async () => {
      const deps = makeDeps({ authenticate: mock.fn(async () => null) });
      const handlers = billingRoutes(null, deps);

      const req = mockReq('GET', '/api/billing/usage');
      const res = mockRes();
      await handlers.usage(req, res);

      assert.equal(res.statusCode, 401);
    });

    it('GET /plan returns current plan', async () => {
      const deps = makeDeps();
      const handlers = billingRoutes(null, deps);

      const req = mockReq('GET', '/api/billing/plan');
      const res = mockRes();
      await handlers.plan(req, res);

      assert.equal(res.statusCode, 200);
      assert.ok(res.body.plan);
      assert.equal(res.body.plan.id, 'free');
      assert.ok(Array.isArray(res.body.allPlans));
      assert.equal(res.body.allPlans.length, 4);
    });

    it('GET /plan returns 401 when unauthenticated', async () => {
      const deps = makeDeps({ authenticate: mock.fn(async () => null) });
      const handlers = billingRoutes(null, deps);

      const req = mockReq('GET', '/api/billing/plan');
      const res = mockRes();
      await handlers.plan(req, res);

      assert.equal(res.statusCode, 401);
    });

    it('POST /checkout creates session', async () => {
      const deps = makeDeps();
      const handlers = billingRoutes(null, deps);

      const req = mockReq('POST', '/api/billing/checkout', { planId: 'pro' });
      const res = mockRes();
      await handlers.checkout(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.url, 'https://checkout.stripe.com/test');
    });

    it('POST /checkout returns 400 without planId', async () => {
      const deps = makeDeps();
      const handlers = billingRoutes(null, deps);

      const req = mockReq('POST', '/api/billing/checkout', {});
      const res = mockRes();
      await handlers.checkout(req, res);

      assert.equal(res.statusCode, 400);
      assert.ok(res.body.error.includes('planId'));
    });

    it('POST /checkout returns 400 for invalid plan', async () => {
      const deps = makeDeps();
      const handlers = billingRoutes(null, deps);

      const req = mockReq('POST', '/api/billing/checkout', { planId: 'free' }); // free has no stripePriceId
      const res = mockRes();
      await handlers.checkout(req, res);

      assert.equal(res.statusCode, 400);
      assert.ok(res.body.error.includes('Invalid plan'));
    });

    it('POST /checkout returns 401 when unauthenticated', async () => {
      const deps = makeDeps({ authenticate: mock.fn(async () => null) });
      const handlers = billingRoutes(null, deps);

      const req = mockReq('POST', '/api/billing/checkout', { planId: 'pro' });
      const res = mockRes();
      await handlers.checkout(req, res);

      assert.equal(res.statusCode, 401);
    });

    it('POST /checkout creates customer if none exists', async () => {
      const deps = makeDeps({
        getUserBilling: mock.fn(() => ({ stripeCustomerId: null, plan: 'free' })),
      });
      const handlers = billingRoutes(null, deps);

      const req = mockReq('POST', '/api/billing/checkout', { planId: 'pro' });
      const res = mockRes();
      await handlers.checkout(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(deps.stripeClient.createCustomer.mock.callCount(), 1);
      assert.equal(deps.updateUserBilling.mock.callCount(), 1);
    });

    it('POST /webhook validates signature (delegates to handler)', async () => {
      const deps = makeDeps();
      const handlers = billingRoutes(null, deps);

      const req = mockReq('POST', '/api/billing/webhook', null, { 'stripe-signature': 'sig' });
      const res = mockRes();
      await handlers.webhook(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(deps.webhookHandler.mock.callCount(), 1);
    });

    it('registers routes on a Map-based router', () => {
      const deps = makeDeps();
      const routerMap = new Map();
      billingRoutes(routerMap, deps);

      assert.ok(routerMap.has('POST /api/billing/checkout'));
      assert.ok(routerMap.has('GET /api/billing/portal'));
      assert.ok(routerMap.has('GET /api/billing/usage'));
      assert.ok(routerMap.has('GET /api/billing/plan'));
      assert.ok(routerMap.has('POST /api/billing/webhook'));
      assert.equal(routerMap.size, 5);
    });

    it('registers routes on a handle()-based router', () => {
      const deps = makeDeps();
      const routes = [];
      const router = {
        handle(method, path, handler) {
          routes.push({ method, path });
        },
      };
      billingRoutes(router, deps);

      assert.equal(routes.length, 5);
      assert.ok(routes.some(r => r.method === 'POST' && r.path === '/api/billing/checkout'));
      assert.ok(routes.some(r => r.method === 'GET' && r.path === '/api/billing/usage'));
    });
  });

  // ─── Memory Consolidation ──────────────────────────────────────────────────
  describe('Memory Consolidation', () => {
    let MemoryConsolidator;

    beforeEach(async () => {
      const mod = await import('../lib/memory-consolidation.js');
      MemoryConsolidator = mod.MemoryConsolidator;
    });

    function makeMockMemory(chunks = [], clusters = []) {
      const store = new Map();
      let nextId = 1;
      for (const chunk of chunks) {
        const c = { id: chunk.id || `chunk_${nextId++}`, ...chunk };
        store.set(c.id, c);
      }

      return {
        _store: store,
        store(userId, content, opts) {
          const id = `merged_${nextId++}`;
          const chunk = { id, userId, content, ...opts };
          store.set(id, chunk);
          return chunk;
        },
        get(id) {
          return store.get(id) || null;
        },
        search(userId, opts) {
          return [...store.values()].filter(c => c.userId === userId || !c.userId);
        },
        getChunkClusters(userId, threshold) {
          return clusters;
        },
        markConsolidated(sourceIds, targetId) {
          for (const id of sourceIds) {
            const c = store.get(id);
            if (c) c.consolidatedInto = targetId;
          }
        },
        updateConfidence(id, newConfidence) {
          const c = store.get(id);
          if (c) c.confidence = newConfidence;
        },
        softDelete(id) {
          const c = store.get(id);
          if (c) c.category = 'stale';
        },
        getAccessStats(userId) {
          return [...store.values()]
            .filter(c => c.userId === userId || !c.userId)
            .map(c => ({
              id: c.id,
              accessedAt: c.accessedAt || new Date().toISOString(),
              accessCount: c.accessCount || 1,
            }));
        },
      };
    }

    function makeMockEmbedder() {
      return {
        dimensions: 8,
        async embed(text) {
          // Return a deterministic tiny vector
          const vec = new Float32Array(8);
          for (let i = 0; i < 8; i++) vec[i] = (text.charCodeAt(i % text.length) % 100) / 100;
          return vec;
        },
      };
    }

    function makeSilentLogger() {
      return { info: () => {}, warn: () => {}, error: () => {} };
    }

    it('constructor requires memory', () => {
      assert.throws(() => new MemoryConsolidator({ embedder: makeMockEmbedder() }), /memory is required/);
    });

    it('constructor requires embedder', () => {
      assert.throws(() => new MemoryConsolidator({ memory: makeMockMemory() }), /embedder is required/);
    });

    it('merges facts with similarity > 0.85 (cluster of 2+ high-confidence chunks)', async () => {
      const chunks = [
        { id: 'c1', content: 'Paris is the capital of France', confidence: 0.9, tags: ['geo'], agentId: 'a1' },
        { id: 'c2', content: 'The capital of France is Paris', confidence: 0.85, tags: ['geography'], agentId: 'a1' },
      ];
      const clusters = [[chunks[0], chunks[1]]]; // pre-clustered

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.consolidate('user1');
      assert.equal(result.merged, 2);
      assert.equal(result.clusters, 1);
    });

    it('does NOT merge below threshold (single chunk cluster)', async () => {
      const chunks = [
        { id: 'c1', content: 'isolated fact', confidence: 0.9, tags: [] },
      ];
      const clusters = [[chunks[0]]]; // cluster of 1

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.consolidate('user1');
      assert.equal(result.merged, 0);
      assert.equal(result.clusters, 0);
    });

    it('merges cluster regardless of chunk confidence level', async () => {
      const chunks = [
        { id: 'c1', content: 'fact A', confidence: 0.3, tags: [] },
        { id: 'c2', content: 'fact B', confidence: 0.5, tags: [] },
      ];
      const clusters = [[chunks[0], chunks[1]]];

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.consolidate('user1');
      assert.equal(result.merged, 2);
      assert.equal(result.clusters, 1);
    });

    it('merged confidence caps at 1.0', async () => {
      const chunks = [
        { id: 'c1', content: 'fact 1', confidence: 0.99, tags: [], agentId: 'a1' },
        { id: 'c2', content: 'fact 2', confidence: 0.98, tags: [], agentId: 'a1' },
      ];
      const clusters = [[chunks[0], chunks[1]]];

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      await consolidator.consolidate('user1');

      // The merged chunk stored in memory should have confidence ≤ 1.0
      const mergedChunks = [...memory._store.values()].filter(c => c.id.startsWith('merged_'));
      assert.equal(mergedChunks.length, 1);
      assert.ok(mergedChunks[0].confidence <= 1.0);
    });

    it('unions tags from all merged chunks', async () => {
      const chunks = [
        { id: 'c1', content: 'fact about cats', confidence: 0.9, tags: ['animals', 'cats'], agentId: 'a1' },
        { id: 'c2', content: 'fact about cats too', confidence: 0.85, tags: ['animals', 'pets'], agentId: 'a1' },
      ];
      const clusters = [[chunks[0], chunks[1]]];

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      await consolidator.consolidate('user1');

      const mergedChunks = [...memory._store.values()].filter(c => c.id.startsWith('merged_'));
      assert.equal(mergedChunks.length, 1);
      const tags = mergedChunks[0].tags;
      assert.ok(tags.includes('animals'));
      assert.ok(tags.includes('cats'));
      assert.ok(tags.includes('pets'));
    });

    it('marks source chunks as consolidated', async () => {
      const chunks = [
        { id: 'c1', content: 'source 1', confidence: 0.9, tags: [], agentId: 'a1' },
        { id: 'c2', content: 'source 2', confidence: 0.8, tags: [], agentId: 'a1' },
      ];
      const clusters = [[chunks[0], chunks[1]]];

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      await consolidator.consolidate('user1');

      assert.ok(memory._store.get('c1').consolidatedInto);
      assert.ok(memory._store.get('c2').consolidatedInto);
    });

    it('merge creates new chunk and marks sources as consolidated', async () => {
      const chunks = [
        { id: 'c1', content: 'fact A', confidence: 0.9, tags: [], agentId: 'a1' },
        { id: 'c2', content: 'fact B', confidence: 0.85, tags: [], agentId: 'a1' },
      ];
      const clusters = [[chunks[0], chunks[1]]];

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.consolidate('user1');

      assert.equal(result.merged, 2);
      assert.ok(memory._store.get('c1').consolidatedInto);
      assert.ok(memory._store.get('c2').consolidatedInto);
    });

    it('merges content using mergeFacts (longest/most detailed version)', async () => {
      const chunks = [
        { id: 'c1', content: 'The sky is blue', confidence: 0.9, tags: [], agentId: 'a1' },
        { id: 'c2', content: 'Blue is the color of the sky', confidence: 0.85, tags: [], agentId: 'a1' },
      ];
      const clusters = [[chunks[0], chunks[1]]];

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      await consolidator.consolidate('user1');
      const merged = [...memory._store.values()].filter(c => c.id.startsWith('merged_'));
      assert.equal(merged.length, 1);
      // mergeFacts keeps the longer version for 2 unique facts
      assert.ok(merged[0].content.includes('Blue is the color of the sky'));
    });

    it('mergeFacts with 3+ unique facts appends supplementary info', async () => {
      const chunks = [
        { id: 'c1', content: 'Paris is the capital of France and a major city', confidence: 0.9, tags: [], agentId: 'a1' },
        { id: 'c2', content: 'France capital is Paris', confidence: 0.85, tags: [], agentId: 'a1' },
        { id: 'c3', content: 'Paris, capital of France', confidence: 0.80, tags: [], agentId: 'a1' },
      ];
      const clusters = [[chunks[0], chunks[1], chunks[2]]];

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      await consolidator.consolidate('user1');
      const merged = [...memory._store.values()].filter(c => c.id.startsWith('merged_'));
      assert.equal(merged.length, 1);
      // For 3+ unique facts, mergeFacts keeps longest and appends others in parentheses
      assert.ok(merged[0].content.includes('Paris is the capital of France and a major city'));
    });

    it('scoreRelevance decays chunks accessed days ago', async () => {
      const now = new Date();
      const recentDate = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

      const chunks = [
        { id: 'c1', userId: 'user1', content: 'recent fact', confidence: 0.7, accessedAt: recentDate, accessCount: 1 },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.scoreRelevance('user1');
      // applyDecay with minDaysBeforeDecay:0 — 2-day-old chunk gets decayed
      assert.equal(result.decayed, 1);
      assert.ok(memory._store.get('c1').confidence < 0.7);
    });

    it('scoreRelevance decays old unaccessed chunks', async () => {
      const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(); // 45 days ago

      const chunks = [
        { id: 'c1', userId: 'user1', content: 'old fact', confidence: 0.5, accessedAt: oldDate, accessCount: 1 },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.scoreRelevance('user1');
      assert.equal(result.decayed, 1);
      assert.ok(memory._store.get('c1').confidence < 0.5);
    });

    it('scoreRelevance does not decay very recently accessed chunks', async () => {
      const recentDate = new Date(Date.now() - 1000).toISOString();
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'popular fact', confidence: 0.5, accessedAt: recentDate, accessCount: 5 },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.scoreRelevance('user1');
      // Very recent access (~1s ago) means negligible decay (below 0.001 threshold)
      assert.equal(result.frequencyBoosted, 0);
      assert.equal(result.decayed, 0);
      // Confidence stays effectively the same
      assert.ok(Math.abs(memory._store.get('c1').confidence - 0.5) < 0.01);
    });

    it('scoreRelevance confidence caps at 1.0', async () => {
      const recentDate = new Date(Date.now() - 1000).toISOString();
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'very popular', confidence: 0.95, accessedAt: recentDate, accessCount: 10 },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      await consolidator.scoreRelevance('user1');
      assert.ok(memory._store.get('c1').confidence <= 1.0);
    });

    it('scoreRelevance confidence floors at 0.05', async () => {
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago

      const chunks = [
        { id: 'c1', userId: 'user1', content: 'fading fact', confidence: 0.12, accessedAt: oldDate, accessCount: 1 },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      await consolidator.scoreRelevance('user1');
      // Implementation confidenceFloor default is 0.05
      assert.ok(memory._store.get('c1').confidence >= 0.05);
    });

    it('pruneStale removes chunks below confidence threshold', async () => {
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'weak fact', confidence: 0.05 },
        { id: 'c2', userId: 'user1', content: 'strong fact', confidence: 0.9 },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.pruneStale('user1');
      assert.equal(result.pruned, 1);
      assert.equal(memory._store.get('c1').category, 'stale');
      assert.notEqual(memory._store.get('c2').category, 'stale');
    });

    it('pruneStale does not prune consolidated source chunks', async () => {
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'source', confidence: 0.05, consolidatedInto: 'merged_1' },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.pruneStale('user1');
      assert.equal(result.pruned, 0);
    });

    it('pruneStale custom threshold', async () => {
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'borderline', confidence: 0.3 },
        { id: 'c2', userId: 'user1', content: 'safe', confidence: 0.5 },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.pruneStale('user1', 0.4);
      assert.equal(result.pruned, 1);
      assert.equal(memory._store.get('c1').category, 'stale');
    });

    it('getConsolidationStats returns correct counts', () => {
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'active', confidence: 0.8, tags: ['geo'] },
        { id: 'c2', userId: 'user1', content: 'active2', confidence: 0.6, tags: ['geo', 'history'] },
        { id: 'c3', userId: 'user1', content: 'consolidated', confidence: 0.5, consolidatedInto: 'merged_1' },
        { id: 'c4', userId: 'user1', content: 'stale', confidence: 0.1, category: 'stale' },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const stats = consolidator.getConsolidationStats('user1');
      assert.equal(stats.totalChunks, 4);
      assert.equal(stats.consolidated, 1);
      assert.equal(stats.stale, 1);
      assert.ok(stats.avgConfidence > 0);
      assert.ok(stats.topTopics.length > 0);
      assert.equal(stats.topTopics[0].tag, 'geo');
      assert.equal(stats.topTopics[0].count, 2);
    });

    it('getConsolidationStats with no chunks returns zeros', () => {
      const memory = makeMockMemory([]);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const stats = consolidator.getConsolidationStats('user1');
      assert.equal(stats.totalChunks, 0);
      assert.equal(stats.consolidated, 0);
      assert.equal(stats.stale, 0);
      assert.equal(stats.avgConfidence, 0);
      assert.equal(stats.topTopics.length, 0);
    });

    it('consolidate merges all chunks in cluster regardless of agentId', async () => {
      const chunks = [
        { id: 'c1', content: 'agent1 fact', confidence: 0.9, tags: [], agentId: 'agent1' },
        { id: 'c2', content: 'agent1 fact2', confidence: 0.85, tags: [], agentId: 'agent1' },
        { id: 'c3', content: 'agent2 fact', confidence: 0.9, tags: [], agentId: 'agent2' },
      ];
      const clusters = [[chunks[0], chunks[1], chunks[2]]]; // all in one cluster

      const memory = makeMockMemory(chunks, clusters);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.consolidate('user1');
      assert.equal(result.merged, 3); // All chunks in cluster merged together
    });

    it('consolidate with no clusters returns zeros', async () => {
      const memory = makeMockMemory([], []);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.consolidate('user1');
      assert.equal(result.merged, 0);
      assert.equal(result.skipped, 0);
      assert.equal(result.clusters, 0);
    });

    it('scoreRelevance skips consolidated chunks', async () => {
      const recentDate = new Date(Date.now() - 1000).toISOString();
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'fact', confidence: 0.7, accessedAt: recentDate, accessCount: 1, consolidatedInto: 'merged_x' },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.scoreRelevance('user1');
      assert.equal(result.boosted, 0);
      assert.equal(result.decayed, 0);
    });

    it('scoreRelevance skips stale chunks', async () => {
      const recentDate = new Date(Date.now() - 1000).toISOString();
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'stale', confidence: 0.7, accessedAt: recentDate, accessCount: 1, category: 'stale' },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.scoreRelevance('user1');
      assert.equal(result.boosted, 0);
    });

    it('pruneStale marks low-confidence chunks as stale', async () => {
      const chunks = [
        { id: 'c1', userId: 'user1', content: 'weak', confidence: 0.01 },
      ];

      const memory = makeMockMemory(chunks);
      const consolidator = new MemoryConsolidator({
        memory,
        embedder: makeMockEmbedder(),
        logger: makeSilentLogger(),
      });

      const result = await consolidator.pruneStale('user1');
      assert.equal(result.pruned, 1);
      assert.equal(memory._store.get('c1').category, 'stale');
    });
  });
});
