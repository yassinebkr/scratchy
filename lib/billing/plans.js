/**
 * @module billing/plans
 * Plan definitions, quota enforcement, and model access control.
 *
 * Prices are in cents (EUR). Stripe price IDs are placeholders —
 * replace with real IDs after creating products in the Stripe dashboard.
 */

/**
 * @typedef {Object} PlanQuotas
 * @property {number} messagesPerDay - Max messages per day
 * @property {number} tokensPerDay   - Max tokens per day
 */

/**
 * @typedef {Object} Plan
 * @property {string}      id            - Unique plan identifier
 * @property {string}      name          - Display name
 * @property {number}      price         - Price in cents (EUR)
 * @property {string}      currency      - Currency code
 * @property {string|null} interval      - Billing interval ('month' | null for free)
 * @property {string}      [stripePriceId] - Stripe Price ID (omitted for free plan)
 * @property {PlanQuotas}  quotas        - Usage quotas
 * @property {string[]}    models        - Allowed model names ('*' = all)
 * @property {number}      seats         - Number of included seats
 */

/** @type {Plan[]} */
export const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'eur',
    interval: null,
    quotas: { messagesPerDay: 50, tokensPerDay: 100_000 },
    models: ['sonnet'],
    seats: 1,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 1500,
    currency: 'eur',
    interval: 'month',
    stripePriceId: 'price_pro_monthly',
    quotas: { messagesPerDay: 500, tokensPerDay: 1_000_000 },
    models: ['sonnet', 'opus'],
    seats: 1,
  },
  {
    id: 'team',
    name: 'Team',
    price: 3900,
    currency: 'eur',
    interval: 'month',
    stripePriceId: 'price_team_monthly',
    quotas: { messagesPerDay: 2000, tokensPerDay: 5_000_000 },
    models: ['sonnet', 'opus'],
    seats: 5,
  },
  {
    id: 'byok',
    name: 'BYOK',
    price: 500,
    currency: 'eur',
    interval: 'month',
    stripePriceId: 'price_byok_monthly',
    quotas: { messagesPerDay: Infinity, tokensPerDay: Infinity },
    models: ['*'],
    seats: 1,
  },
];

/** @type {Map<string, Plan>} */
const planMap = new Map(PLANS.map((p) => [p.id, p]));

/**
 * Look up a plan by ID.
 * @param {string} planId - Plan identifier ('free', 'pro', 'team', 'byok')
 * @returns {Plan|undefined} The plan definition, or undefined if not found
 */
export function getPlan(planId) {
  return planMap.get(planId);
}

/**
 * Look up a plan by its Stripe price ID.
 * @param {string} priceId - Stripe price ID
 * @returns {Plan|undefined} The plan definition, or undefined if not found
 */
export function getPlanByPriceId(priceId) {
  return PLANS.find((p) => p.stripePriceId === priceId);
}

/**
 * Check whether current usage is within plan quotas.
 *
 * @param {{ messages: number, tokens: number }} usage - Current usage counters
 * @param {Plan} plan - The plan to check against
 * @returns {{ allowed: boolean, remaining: { messages: number, tokens: number }, limit: { messages: number, tokens: number }, resetAt: string }}
 */
export function checkQuota(usage, plan) {
  const remaining = {
    messages: Math.max(0, plan.quotas.messagesPerDay - usage.messages),
    tokens: Math.max(0, plan.quotas.tokensPerDay - usage.tokens),
  };

  const allowed =
    usage.messages < plan.quotas.messagesPerDay &&
    usage.tokens < plan.quotas.tokensPerDay;

  // Reset at midnight UTC of the next day
  const now = new Date();
  const tomorrow = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ));

  return {
    allowed,
    remaining,
    limit: {
      messages: plan.quotas.messagesPerDay,
      tokens: plan.quotas.tokensPerDay,
    },
    resetAt: tomorrow.toISOString(),
  };
}

/**
 * Check whether a plan grants access to a specific model.
 *
 * Plans with `models: ['*']` (BYOK) can access any model.
 * Otherwise, the model name must be in the plan's model list.
 *
 * @param {Plan} plan - The plan to check
 * @param {string} modelName - Model identifier (e.g. 'sonnet', 'opus')
 * @returns {boolean} True if the plan allows access to this model
 */
export function canAccessModel(plan, modelName) {
  if (plan.models.includes('*')) return true;
  return plan.models.includes(modelName);
}
