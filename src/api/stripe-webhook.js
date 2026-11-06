// POST /api/stripe/webhook: Stripe tells us when a subscription starts, renews, fails to renew,
// changes plan or ends, and the business's copy of it is refreshed (billing.js); and when extra
// minutes are paid for, which adds them. Each request is checked against STRIPE_WEBHOOK_SECRET,
// so only Stripe can send them.
//
// In development the Stripe CLI forwards them here (the command, with its list of events, is in
// the README under Billing).

import express from 'express';
import { fulfillTopUp, syncSubscription } from './billing.js';

// The subscription an event is about, or null for events we don't act on.
function subscriptionOf(event) {
  const object = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
      return object.mode === 'subscription' ? object.subscription : null;
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return object.id;
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return object.parent?.subscription_details?.subscription ?? null;
    default:
      return null;
  }
}

// Acts on one event. Extra-minute payments are added when they've gone through: straight away for
// cards, later (async_payment_succeeded) for payment methods that take a few days.
async function handle(stripe, event) {
  const object = event.data.object;
  const isCheckout = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
  if (isCheckout && object.mode === 'payment') return fulfillTopUp(stripe, object.id);
  const subscription = subscriptionOf(event);
  if (subscription) await syncSubscription(stripe, typeof subscription === 'string' ? subscription : subscription.id);
}

// stripe: the Stripe client (null when billing isn't set up); secret: the webhook signing secret.
export function stripeWebhook({ stripe, secret }) {
  const router = express.Router();
  // The signature is over the exact bytes Stripe sent, so the body is kept raw.
  router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !secret) return res.status(503).json({ error: 'Billing is not set up.' });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.header('Stripe-Signature') ?? '', secret);
    } catch {
      return res.status(400).json({ error: 'Invalid signature.' });
    }
    try {
      await handle(stripe, event);
    } catch (err) {
      // A 500 makes Stripe send the event again later.
      console.error(`Stripe webhook ${event.type} (${event.id}) failed:`, err.message);
      return res.status(500).json({ error: 'Could not process the event.' });
    }
    res.json({ received: true });
  });
  return router;
}
