// Subscriptions (src/api/billing.js, the billing routes and the Stripe webhook), with a fake Stripe
// client, against the test database.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createBusiness, findBusinessByNumber, saveOwnerBusiness } from '../src/shared/businesses.js';
import { pool } from '../src/shared/db/pool.js';
import { startApi } from './support/api.js';
import { emptyTestDatabase, setUpTestDatabase } from './support/database.js';
import { fakeStripe, subscription, WEBHOOK_SECRET } from './support/fake-stripe.js';
import { signedInOwner } from './support/owners.js';

const settings = { name: 'Rapid Flow Plumbing', description: 'a plumber', languages: ['en'], features: [] };
const NUMBER = '+18312490526';
let api;
let fake;

before(async () => {
  await setUpTestDatabase();
  fake = fakeStripe();
  api = await startApi({ stripe: fake.stripe, stripeWebhookSecret: WEBHOOK_SECRET });
});
beforeEach(async () => {
  await emptyTestDatabase();
  fake.state.subscriptions.clear();
  fake.state.sessions.clear();
  fake.state.customerCount = 0;
  fake.calls.length = 0;
});
after(async () => {
  await api.close();
  await pool.end();
});

// A signed-in owner whose business is set up, with a phone number, but not paid for.
async function ownerWithBusiness(email = 'owner@example.com') {
  const owner = await signedInOwner({ email });
  const business = await saveOwnerBusiness(owner.user.id, settings);
  await pool.query('UPDATE businesses SET twilio_number = $2 WHERE id = $1', [business.id, NUMBER]);
  return { ...owner, business };
}

// Stripe has this subscription, and tells us about it.
async function sendWebhook(type, object) {
  if (object.object === 'subscription') fake.state.subscriptions.set(object.id, object);
  const { payload, signature } = fake.webhook(type, object);
  return api.request('POST', '/stripe/webhook', { raw: payload, headers: { 'Stripe-Signature': signature } });
}

const businessRow = async (id) => (await pool.query('SELECT * FROM businesses WHERE id = $1', [id])).rows[0];
const checkout = (cookie, plan = 'pro') => api.request('POST', '/owner/billing/checkout', { cookie, body: { plan } });

test('demo businesses answer calls without a plan; owners’ businesses only once it’s paid', async () => {
  await createBusiness({ ...settings, slug: 'demo', twilio_number: '+15550100001' });
  assert.ok(await findBusinessByNumber('+15550100001'));

  const { business } = await ownerWithBusiness();
  assert.equal(business.requires_subscription, true);
  assert.equal(await findBusinessByNumber(NUMBER), null);
  for (const [status, answers] of [['active', true], ['trialing', true], ['past_due', true], ['unpaid', false], ['canceled', false]]) {
    await pool.query('UPDATE businesses SET subscription_status = $2 WHERE id = $1', [business.id, status]);
    assert.equal(Boolean(await findBusinessByNumber(NUMBER)), answers, status);
  }
});

test('the plans are listed for signed-in owners', async () => {
  const { cookie } = await signedInOwner();
  const { body } = await api.request('GET', '/owner/plans', { cookie });
  assert.deepEqual(body.plans.map((plan) => [plan.code, plan.priceCents, plan.minutes]), [
    ['starter', 7900, 200],
    ['pro', 17900, 600],
    ['business', 34900, 1500],
  ]);
});

test('checkout needs a business and a known plan', async () => {
  const { cookie } = await signedInOwner();
  assert.equal((await checkout(cookie)).status, 400);
  await saveOwnerBusiness((await pool.query('SELECT id FROM "user"')).rows[0].id, settings);
  const unknown = await checkout(cookie, 'platinum');
  assert.deepEqual(unknown, { status: 400, body: { error: 'Pick one of the plans.' } });
  assert.equal((await api.request('POST', '/owner/billing/checkout', { body: { plan: 'pro' } })).status, 401);
});

test('checkout creates the business’s Stripe customer once and opens Stripe Checkout for the plan', async () => {
  const { cookie, business } = await ownerWithBusiness();
  const first = await checkout(cookie, 'pro');
  assert.deepEqual(first, { status: 200, body: { url: 'https://checkout.stripe.test/cs_test_1' } });
  await checkout(cookie, 'starter');

  assert.equal(fake.calls.filter(([name]) => name === 'customers.create').length, 1);
  const [, customer, { idempotencyKey }] = fake.calls.find(([name]) => name === 'customers.create');
  assert.equal(customer.email, 'owner@example.com');
  assert.equal(idempotencyKey, `customer-for-business-${business.id}`);
  assert.equal((await businessRow(business.id)).stripe_customer_id, 'cus_1');

  const [, session] = fake.calls.find(([name]) => name === 'checkout.sessions.create');
  assert.equal(session.mode, 'subscription');
  assert.equal(session.customer, 'cus_1');
  assert.deepEqual(session.line_items, [{ price: 'price_pro', quantity: 1 }]);
  assert.equal(session.success_url, 'http://localhost:5199/?checkout={CHECKOUT_SESSION_ID}');
  assert.equal(session.cancel_url, 'http://localhost:5199/plan');
  assert.equal('payment_method_types' in session, false);
});

test('owners who already pay are sent to the billing page instead of paying twice', async () => {
  const { cookie, business } = await ownerWithBusiness();
  await checkout(cookie);
  // Paid in another tab, before the webhook arrived.
  fake.state.subscriptions.set('sub_1', subscription({ customer: 'cus_1' }));
  assert.equal((await checkout(cookie)).status, 409);
  // And once it has.
  fake.state.subscriptions.clear();
  await pool.query("UPDATE businesses SET subscription_status = 'active' WHERE id = $1", [business.id]);
  assert.equal((await checkout(cookie)).status, 409);
});

test('webhooks keep the business’s plan up to date, and only Stripe can send them', async () => {
  const { cookie, business } = await ownerWithBusiness();
  await checkout(cookie);

  const forged = await api.request('POST', '/stripe/webhook', {
    raw: JSON.stringify({ type: 'customer.subscription.updated', data: { object: subscription() } }),
    headers: { 'Stripe-Signature': 't=1,v1=forged' },
  });
  assert.equal(forged.status, 400);
  assert.equal((await businessRow(business.id)).subscription_status, null);

  assert.equal((await sendWebhook('customer.subscription.created', subscription({ customer: 'cus_1' }))).status, 200);
  let row = await businessRow(business.id);
  assert.equal(row.plan, 'pro');
  assert.equal(row.subscription_status, 'active');
  assert.equal(row.stripe_subscription_id, 'sub_1');
  assert.equal(row.subscription_period_end.getTime(), 1796000000 * 1000);
  assert.ok(await findBusinessByNumber(NUMBER));

  await sendWebhook('customer.subscription.updated', subscription({ customer: 'cus_1', plan: 'business', cancels: true }));
  row = await businessRow(business.id);
  assert.equal(row.plan, 'business');
  assert.equal(row.subscription_cancels, true);

  await sendWebhook('customer.subscription.deleted', subscription({ customer: 'cus_1', status: 'canceled' }));
  assert.equal((await businessRow(business.id)).subscription_status, 'canceled');
  assert.equal(await findBusinessByNumber(NUMBER), null);
});

test('webhook events use the subscription as it is now, whatever order they arrive in', async () => {
  const { cookie, business } = await ownerWithBusiness();
  await checkout(cookie);
  fake.state.subscriptions.set('sub_1', subscription({ customer: 'cus_1', status: 'past_due' }));
  // An older "active" event arriving late: the business gets Stripe's current status.
  const { payload, signature } = fake.webhook('customer.subscription.updated', subscription({ customer: 'cus_1' }));
  await api.request('POST', '/stripe/webhook', { raw: payload, headers: { 'Stripe-Signature': signature } });
  assert.equal((await businessRow(business.id)).subscription_status, 'past_due');
});

test('a failed or paid invoice refreshes its subscription', async () => {
  const { cookie, business } = await ownerWithBusiness();
  await checkout(cookie);
  fake.state.subscriptions.set('sub_1', subscription({ customer: 'cus_1', status: 'past_due' }));
  const invoice = { object: 'invoice', parent: { subscription_details: { subscription: 'sub_1' } } };
  const { payload, signature } = fake.webhook('invoice.payment_failed', invoice);
  await api.request('POST', '/stripe/webhook', { raw: payload, headers: { 'Stripe-Signature': signature } });
  assert.equal((await businessRow(business.id)).subscription_status, 'past_due');
});

test('an old subscription ending does not cancel the one the business pays for now', async () => {
  const { cookie, business } = await ownerWithBusiness();
  await checkout(cookie);
  await sendWebhook('customer.subscription.created', subscription({ id: 'sub_new', customer: 'cus_1' }));
  await sendWebhook('customer.subscription.deleted', subscription({ id: 'sub_old', customer: 'cus_1', status: 'canceled' }));
  const row = await businessRow(business.id);
  assert.equal(row.stripe_subscription_id, 'sub_new');
  assert.equal(row.subscription_status, 'active');
});

test('events for other Stripe customers are ignored, and failures are retried', async () => {
  assert.equal((await sendWebhook('customer.subscription.created', subscription({ customer: 'cus_unknown' }))).status, 200);
  assert.equal((await sendWebhook('customer.created', { object: 'customer', id: 'cus_1' })).status, 200);
  // Stripe couldn't be reached to fetch the subscription: a 500 makes Stripe send it again.
  const { payload, signature } = fake.webhook('customer.subscription.updated', subscription({ id: 'sub_gone' }));
  const failed = await api.request('POST', '/stripe/webhook', { raw: payload, headers: { 'Stripe-Signature': signature } });
  assert.equal(failed.status, 500);
});

test('coming back from Checkout shows the plan straight away, for the owner’s own checkout only', async () => {
  const { cookie } = await ownerWithBusiness();
  await checkout(cookie);
  fake.state.subscriptions.set('sub_1', subscription({ customer: 'cus_1', plan: 'starter' }));
  fake.state.sessions.set('cs_mine', { id: 'cs_mine', customer: 'cus_1', subscription: 'sub_1' });
  fake.state.sessions.set('cs_theirs', { id: 'cs_theirs', customer: 'cus_other', subscription: 'sub_2' });

  const theirs = await api.request('POST', '/owner/billing/confirm', { cookie, body: { sessionId: 'cs_theirs' } });
  assert.equal(theirs.status, 404);
  const mine = await api.request('POST', '/owner/billing/confirm', { cookie, body: { sessionId: 'cs_mine' } });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.needsPlan, false);
  assert.equal(mine.body.plan, 'starter');
  const me = await api.request('GET', '/owner/me', { cookie });
  assert.equal(me.body.billing.plan, 'starter');
});

test('the billing page opens for owners who have chosen a plan', async () => {
  const { cookie } = await ownerWithBusiness();
  assert.equal((await api.request('POST', '/owner/billing/portal', { cookie })).status, 400);
  await checkout(cookie);
  const { body } = await api.request('POST', '/owner/billing/portal', { cookie });
  assert.equal(body.url, 'https://billing.stripe.test/session');
  const [, params] = fake.calls.find(([name]) => name === 'billingPortal.sessions.create');
  assert.deepEqual(params, { customer: 'cus_1', configuration: 'bpc_1', return_url: 'http://localhost:5199/' });
});

test('without Stripe keys, billing says it is not set up', async () => {
  const off = await startApi({ stripe: null, stripeWebhookSecret: undefined });
  try {
    const { cookie } = await ownerWithBusiness();
    assert.equal((await off.request('POST', '/owner/billing/checkout', { cookie, body: { plan: 'pro' } })).status, 503);
    assert.equal((await off.request('POST', '/stripe/webhook', { raw: '{}' })).status, 503);
    assert.equal((await off.request('GET', '/owner/plans', { cookie })).body.testMode, false);
  } finally {
    await off.close();
  }
});
