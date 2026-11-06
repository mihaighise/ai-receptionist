// A stand-in for the Stripe client in tests: the calls billing.js makes answer from `state` instead
// of Stripe, and each call is recorded in `calls`. Webhook signatures are made and checked by the
// real Stripe library, which needs no network for them.

import Stripe from 'stripe';

export const WEBHOOK_SECRET = 'whsec_test_secret';
export const PRICES = { bivoz_starter_monthly: 'price_starter', bivoz_pro_monthly: 'price_pro', bivoz_business_monthly: 'price_business' };

// A Stripe subscription as the API returns it.
export function subscription({ id = 'sub_1', customer = 'cus_1', status = 'active', plan = 'pro', periodEnd = 1796000000, cancels = false } = {}) {
  return {
    id,
    object: 'subscription',
    customer,
    status,
    cancel_at_period_end: cancels,
    cancel_at: null,
    items: { data: [{ current_period_end: periodEnd, price: { lookup_key: `bivoz_${plan}_monthly` } }] },
  };
}

export function fakeStripe() {
  const stripe = new Stripe('sk_test_fake');
  const state = { subscriptions: new Map(), sessions: new Map(), customerCount: 0 };
  const calls = [];
  const record = (name, result) => (...args) => {
    calls.push([name, ...args]);
    return result(...args);
  };
  const missing = (id) => Object.assign(new Error(`No such object: ${id}`), { code: 'resource_missing' });

  Object.assign(stripe, {
    customers: { create: record('customers.create', async () => ({ id: `cus_${++state.customerCount}` })) },
    prices: {
      list: record('prices.list', async ({ lookup_keys }) => ({
        data: lookup_keys.filter((key) => PRICES[key]).map((key) => ({ id: PRICES[key], lookup_key: key })),
      })),
    },
    subscriptions: {
      list: record('subscriptions.list', async ({ customer }) => ({
        data: [...state.subscriptions.values()].filter((s) => s.customer === customer),
      })),
      retrieve: record('subscriptions.retrieve', async (id) => {
        if (!state.subscriptions.has(id)) throw missing(id);
        return state.subscriptions.get(id);
      }),
    },
    checkout: {
      sessions: {
        create: record('checkout.sessions.create', async (params) => ({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1', ...params })),
        retrieve: record('checkout.sessions.retrieve', async (id) => {
          if (!state.sessions.has(id)) throw missing(id);
          return state.sessions.get(id);
        }),
      },
    },
    billingPortal: {
      configurations: { list: record('billingPortal.configurations.list', async () => ({ data: [{ id: 'bpc_1', metadata: { app: 'bivoz' } }] })) },
      sessions: { create: record('billingPortal.sessions.create', async () => ({ url: 'https://billing.stripe.test/session' })) },
    },
  });

  // The body and Stripe-Signature header of a webhook for this event.
  const webhook = (type, object) => {
    const payload = JSON.stringify({ id: `evt_${calls.length}`, object: 'event', type, data: { object } });
    return { payload, signature: stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) };
  };

  return { stripe, state, calls, webhook };
}
