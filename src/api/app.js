// The API's routes, as an Express app. server.js starts it; the tests in test/ run it directly.
//   /api/admin/...   the admin site (admin/routes.js)
//   /api/owner/...   the owner app (owner/routes.js)
//   /api/auth/...    owner sign-in, answered by Better Auth (auth.js)
//   /api/stripe/webhook   subscription changes, sent by Stripe (stripe-webhook.js)
//   /api/plans       the plans and the price of extra minutes, for the public landing page

import { createHash, timingSafeEqual } from 'node:crypto';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { adminRoutes } from './admin/routes.js';
import { getAuth } from './auth.js';
import { createStripe, planList, topUpOptions } from './billing.js';
import { ownerRoutes } from './owner/routes.js';
import { createMenuImports } from './menu-import.js';
import { createPhoneNumbers } from './phone-numbers.js';
import { stripeWebhook } from './stripe-webhook.js';

// Compares hashes so both sides have the same length, which timingSafeEqual requires.
const sameText = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// HTTP Basic auth: the browser asks for a username and password and sends them with every request.
const requireAdminPassword = (adminPassword) => (req, res, next) => {
  if (!adminPassword) return next();
  const [scheme, encoded] = (req.header('Authorization') ?? '').split(' ');
  const password = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
  if (sameText(password, adminPassword)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Receptionist admin"').status(401).send('Password required');
};

// adminPassword: required for the admin routes when set. stripe: the Stripe client (null turns
// billing off); stripeWebhookSecret: checks that webhooks come from Stripe; phoneNumbers: buys
// paying businesses their Twilio number (dry run unless TWILIO_BUY_NUMBERS=live); menuImports:
// reads menus from photos with Claude.
export function createApp({
  adminPassword,
  stripe = createStripe(),
  stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  phoneNumbers = createPhoneNumbers(),
  menuImports = createMenuImports(),
} = {}) {
  const app = express();
  // Better Auth and the Stripe webhook read the request body themselves, so they come before any
  // JSON parsing.
  app.all('/api/auth/{*path}', toNodeHandler(getAuth()));
  app.use('/api/stripe/webhook', stripeWebhook({ stripe, secret: stripeWebhookSecret, phoneNumbers }));
  // Public: the landing page shows the same prices as the app (src/shared/plans.js).
  app.get('/api/plans', (_req, res) => res.json({ plans: planList(), topUp: topUpOptions() }));
  app.use('/api/admin', requireAdminPassword(adminPassword), adminRoutes);
  app.use('/api/owner', ownerRoutes({ stripe, phoneNumbers, menuImports }));
  return app;
}
