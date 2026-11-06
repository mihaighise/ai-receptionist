// npm run stripe:setup: creates what billing needs in Stripe, or brings it up to date. Safe to run
// again.
//   - One Product per plan in src/shared/plans.js (id bivoz_<plan>), with a monthly USD Price found by
//     the plan's lookup key. A changed price gets a new Price that takes over the lookup key; existing
//     subscribers keep paying the old one until they change plan.
//   - The Customer Portal (Stripe's billing page): owners can switch between the plans (upgrades
//     are charged straight away, downgrades start when the paid month ends), update their card, see
//     invoices and cancel at the end of the month.
// Only runs with a test key (sk_test_ / rk_test_) for now.

import { PLANS } from '../shared/plans.js';
import { createStripe, PORTAL_METADATA } from './billing.js';

const key = process.env.STRIPE_SECRET_KEY ?? '';
if (!/^(sk|rk)_test_/.test(key)) {
  console.error('Set STRIPE_SECRET_KEY to a test key (sk_test_... or rk_test_...) in .env first.');
  process.exit(1);
}
const stripe = createStripe(key);

async function setUpPlan(code, plan) {
  const productId = `bivoz_${code}`;
  const details = { name: `Bivoz ${plan.name}`, description: `${plan.minutes} call minutes a month`, metadata: { plan: code } };
  let product;
  try {
    product = await stripe.products.update(productId, details);
  } catch (err) {
    if (err.code !== 'resource_missing') throw err;
    product = await stripe.products.create({ id: productId, ...details });
  }

  const { data } = await stripe.prices.list({ lookup_keys: [plan.lookupKey], active: true, limit: 1 });
  const current = data[0];
  if (current?.unit_amount === plan.priceCents && current.product === product.id) {
    console.log(`${plan.name}: $${plan.priceCents / 100}/month (${current.id})`);
    return { product: product.id, prices: [current.id] };
  }
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: plan.priceCents,
    recurring: { interval: 'month' },
    lookup_key: plan.lookupKey,
    transfer_lookup_key: true,
  });
  console.log(`${plan.name}: $${plan.priceCents / 100}/month (created ${price.id})`);
  return { product: product.id, prices: [price.id] };
}

async function setUpPortal(products) {
  const settings = {
    business_profile: { headline: 'Manage your Bivoz plan' },
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        products,
        // An upgrade is charged straight away, for the rest of the month.
        proration_behavior: 'always_invoice',
        // A downgrade waits until the month the owner paid for ends.
        schedule_at_period_end: { conditions: [{ type: 'decreasing_item_amount' }] },
      },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address'] },
    },
    metadata: PORTAL_METADATA,
  };
  const { data } = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const existing = data.find((config) => config.metadata?.app === PORTAL_METADATA.app);
  const portal = existing
    ? await stripe.billingPortal.configurations.update(existing.id, settings)
    : await stripe.billingPortal.configurations.create(settings);
  console.log(`Billing page: ${existing ? 'updated' : 'created'} (${portal.id})`);
}

const products = [];
for (const [code, plan] of Object.entries(PLANS)) products.push(await setUpPlan(code, plan));
await setUpPortal(products);
console.log('Stripe is set up.');
