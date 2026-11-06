// Subscriptions and extra minutes with Stripe. Owners pay on Stripe's own Checkout page (a
// subscription for a plan, a one-time payment for extra minutes) and manage their plan, card and
// invoices on Stripe's billing page (the Customer Portal), so card details never reach us.
//
// Stripe is the source of truth: each business keeps a copy of its subscription (plan, status,
// period end), refreshed from Stripe whenever a webhook says it changed (stripe-webhook.js) and when
// the owner comes back from Checkout. Events are matched to a business by its Stripe Customer.
//
// Every function takes the Stripe client, so the tests can pass a fake one.

import Stripe from 'stripe';
import {
  findBusinessRowByStripeCustomer, saveSubscription, setStripeCustomer,
} from '../shared/businesses.js';
import { PAID_STATUSES, PLANS, TOP_UP, isPaid, planForLookupKey } from '../shared/plans.js';
import { addTopUp, usageFor } from '../shared/usage.js';
import { releaseDateFor } from './phone-numbers.js';

// Pinned, so an SDK upgrade can't change what the API sends without us noticing.
const API_VERSION = '2026-10-28.endive';
// Tags our Checkout Sessions in the Stripe Dashboard.
const INTEGRATION_IDENTIFIER = 'oriana-agent-owner-plans-qhvtmwzr';
// Marks the Customer Portal configuration npm run stripe:setup creates (an internal ID: see
// src/shared/brand.js).
export const PORTAL_METADATA = { app: 'bivoz' };

// The Stripe client for STRIPE_SECRET_KEY, or null when billing isn't set up.
export const createStripe = (secretKey = process.env.STRIPE_SECRET_KEY) =>
  secretKey ? new Stripe(secretKey, { apiVersion: API_VERSION }) : null;

// A problem the owner can understand, with the HTTP status to send.
export class BillingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Price lookup key -> Stripe Price ID, looked up once per process.
const priceIds = new Map();
async function priceIdFor(stripe, lookupKey) {
  if (!priceIds.has(lookupKey)) {
    const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    if (!data[0]) throw new BillingError('This is not available yet. Please try again later.', 503);
    priceIds.set(lookupKey, data[0].id);
  }
  return priceIds.get(lookupKey);
}

// The business's Stripe Customer, created the first time. Two requests at once get the same one:
// Stripe answers a repeated idempotency key with the customer it already made.
async function customerFor(stripe, business, user) {
  if (business.stripe_customer_id) return business.stripe_customer_id;
  const customer = await stripe.customers.create(
    { name: business.name, email: user.email, metadata: { business_id: business.id } },
    { idempotencyKey: `customer-for-business-${business.id}` },
  );
  return setStripeCustomer(business.id, customer.id);
}

// Starts paying for a plan: returns the address of a Stripe Checkout page. appUrl is where owners
// open the app; Stripe sends them back to the dashboard, or to the plans if they cancel.
export async function startCheckout(stripe, { business, user, plan, appUrl }) {
  if (!(plan in PLANS)) throw new BillingError('Pick one of the plans.');
  if (isPaid(business.subscription_status)) {
    throw new BillingError('You already have a plan. Use Manage billing to change it.', 409);
  }
  const customer = await customerFor(stripe, business, user);
  // A subscription paid for in another tab may not have reached us yet.
  const { data: current } = await stripe.subscriptions.list({ customer, status: 'all', limit: 10 });
  if (current.some((subscription) => PAID_STATUSES.includes(subscription.status))) {
    throw new BillingError('You already have a plan. Use Manage billing to change it.', 409);
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: business.id,
    line_items: [{ price: await priceIdFor(stripe, PLANS[plan].lookupKey), quantity: 1 }],
    success_url: `${appUrl}/?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/plan`,
    integration_identifier: INTEGRATION_IDENTIFIER,
  });
  return session.url;
}

// Stripe subscription -> the business's copy of it.
function toSubscription(subscription) {
  const item = subscription.items.data[0];
  return {
    id: subscription.id,
    plan: planForLookupKey(item?.price?.lookup_key),
    status: subscription.status,
    periodStart: item ? new Date(item.current_period_start * 1000) : null,
    periodEnd: item ? new Date(item.current_period_end * 1000) : null,
    cancels: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
  };
}

// Refreshes a business's copy of this subscription from Stripe (fetched again, so events that
// arrive out of order can't leave an old state behind), and once it's paid for, gets the business
// its phone number (phoneNumbers: from phone-numbers.js). Returns the business row, or null if the
// subscription isn't one of ours.
export async function syncSubscription(stripe, subscriptionId, phoneNumbers) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const business = await findBusinessRowByStripeCustomer(customerId);
  if (!business) return null;
  // An old subscription ending doesn't replace the one the business pays for now.
  if (
    business.stripe_subscription_id &&
    business.stripe_subscription_id !== subscription.id &&
    isPaid(business.subscription_status) &&
    !isPaid(subscription.status)
  ) {
    return business;
  }
  if (isPaid(subscription.status) && isPaid(business.subscription_status) && business.stripe_subscription_id !== subscription.id) {
    console.warn(`Business ${business.id} has two paid subscriptions (${business.stripe_subscription_id}, ${subscription.id})`);
  }
  const saved = await saveSubscription(customerId, toSubscription(subscription));
  return (await phoneNumbers?.ensureNumberFor(saved)) ?? saved;
}

// Buying extra minutes: returns the address of a Stripe Checkout page for a one-time payment of
// minutes x the price per minute. Only for businesses with a paid plan.
export async function startTopUp(stripe, { business, user, minutes, appUrl }) {
  const { min, max, step } = TOP_UP;
  if (!Number.isInteger(minutes) || minutes < min || minutes > max || minutes % step !== 0) {
    throw new BillingError(`Choose between ${min} and ${max} minutes, in steps of ${step}.`);
  }
  if (!isPaid(business.subscription_status)) throw new BillingError('Choose a plan first.');
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: await customerFor(stripe, business, user),
    client_reference_id: business.id,
    line_items: [{ price: await priceIdFor(stripe, TOP_UP.lookupKey), quantity: minutes }],
    success_url: `${appUrl}/plan?checkout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/plan`,
    integration_identifier: INTEGRATION_IDENTIFIER,
  });
  return session.url;
}

// A paid extra-minutes Checkout Session -> the minutes are added to its business, once (the
// webhook and the owner coming back can both get here; whichever is first adds them). Payments
// that are still pending (some payment methods take days) are added when the webhook says they
// went through. Returns { business, added } (added: the minutes this payment has added, 0 while
// it's pending), or null if the session isn't one of ours.
export async function fulfillTopUp(stripe, sessionId) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items.data.price'] });
  if (session.mode !== 'payment') return null;
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const business = customer && (await findBusinessRowByStripeCustomer(customer));
  if (!business) return null;
  const item = session.line_items?.data.find((line) => line.price?.lookup_key === TOP_UP.lookupKey);
  if (session.payment_status !== 'paid' || !item) return { business, added: 0 };
  await addTopUp(business.id, item.quantity, session.id);
  return { business, added: item.quantity };
}

// After Checkout: makes sure the owner sees the new plan or the extra minutes straight away, even
// if the webhook hasn't arrived yet. Only accepts a Checkout Session for this business's own
// customer. Returns { business, kind, added }: kind is 'plan' or 'top_up', added the extra
// minutes that payment added.
export async function confirmCheckout(stripe, { business, sessionId, phoneNumbers }) {
  if (typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) throw new BillingError('Unknown checkout.');
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (err.code === 'resource_missing') throw new BillingError('Unknown checkout.', 404);
    throw err;
  }
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!business.stripe_customer_id || customer !== business.stripe_customer_id) {
    throw new BillingError('Unknown checkout.', 404);
  }
  if (session.mode === 'payment') {
    return { business, added: 0, ...(await fulfillTopUp(stripe, session.id)), kind: 'top_up' };
  }
  if (!session.subscription) return { business, kind: 'plan', added: 0 };
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  const synced = await syncSubscription(stripe, subscriptionId, phoneNumbers);
  return { business: synced ?? business, kind: 'plan', added: 0 };
}

// The Customer Portal configuration npm run stripe:setup created, looked up once per process.
let portalConfiguration;
async function portalConfigurationId(stripe) {
  if (!portalConfiguration) {
    const { data } = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
    portalConfiguration = data.find((config) => config.metadata?.app === PORTAL_METADATA.app)?.id;
    if (!portalConfiguration) throw new BillingError('Billing is not set up yet (run npm run stripe:setup).', 503);
  }
  return portalConfiguration;
}

// The address of Stripe's billing page for this business: change plan or card, cancel, invoices.
export async function openBillingPortal(stripe, { business, appUrl }) {
  if (!business.stripe_customer_id) throw new BillingError('Choose a plan first.');
  const session = await stripe.billingPortal.sessions.create({
    customer: business.stripe_customer_id,
    configuration: await portalConfigurationId(stripe),
    return_url: `${appUrl}/`,
  });
  return session.url;
}

// What the owner app shows about the business's plan and its minutes this month (see usage.js).
export async function billingSummary(business) {
  if (!business) return null;
  return {
    usage: await usageFor(business),
    // The business won't answer calls until it has a paid plan.
    needsPlan: business.requires_subscription && !isPaid(business.subscription_status),
    plan: business.plan,
    status: business.subscription_status,
    periodEnd: business.subscription_period_end,
    cancels: business.subscription_cancels,
    // When the business's number will be released because its plan ended, or null.
    numberReleasesAt: releaseDateFor(business),
  };
}

// Extra minutes, for the slider on the plan page.
export const topUpOptions = () => {
  const { centsPerMinute, min, max, step } = TOP_UP;
  return { centsPerMinute, min, max, step };
};

// The plans, for the plan page.
export const planList = () =>
  Object.entries(PLANS).map(([code, { name, priceCents, minutes }]) => ({ code, name, priceCents, minutes }));

// True with a Stripe test key: payments are pretend, and the plan page says which card to use.
export const isTestMode = (secretKey = process.env.STRIPE_SECRET_KEY ?? '') => /^(sk|rk)_test_/.test(secretKey);
