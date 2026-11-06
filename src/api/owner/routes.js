// Owner routes of the API (mounted at /api/owner by src/api/app.js), used by the owner app in
// web/. Everything except /providers needs a signed-in owner.
//
//   GET  /api/owner/providers          the sign-in providers that are set up, e.g. ["google"]
//   GET  /api/owner/me                 the signed-in owner, their business (null until they set one
//                                      up) and its billing
//   GET  /api/owner/options            languages and features to choose from
//   PUT  /api/owner/business           save their business's settings, creating it the first time
//   POST /api/owner/preview            the greeting callers would hear with unsaved settings
//   GET  /api/owner/calls              ?after=<cursor>&limit=<1-100> -> { calls, next }: the business's
//                                      calls, newest first, with any message taken
//   GET  /api/owner/plans              { plans, topUp, testMode }: the plans, and extra minutes
//   POST /api/owner/billing/checkout   { plan } -> { url } of a Stripe Checkout page to pay for it
//   POST /api/owner/billing/top-up     { minutes } -> { url } of a Stripe Checkout page to buy them
//   POST /api/owner/billing/confirm    { sessionId } after Checkout -> the updated billing, and
//                                      kind ('plan' or 'top_up'), and added: extra minutes it added
//   POST /api/owner/billing/portal     -> { url } of Stripe's billing page
//   POST /api/owner/menu-imports       { photos: [{ mediaType, data (base64) }] } -> { id }: starts
//                                      reading a menu from photos (menu-import.js)
//   GET  /api/owner/menu-imports/:id   { status, photos, lines, error }: poll until done or failed
//   /api/owner/calendar/...            the owner's calendar connection (calendar-routes.js)
//
// Owners only change what the receptionist knows and does. Its phone number, whether it answers
// calls, its plan and who owns it are set by the app (and the admin site), never by the owner.

import express from 'express';
import { findBusinessRowByOwner, saveOwnerBusiness } from '../../shared/businesses.js';
import { listCalls } from '../../shared/usage.js';
import { getSession, signInProviders } from '../auth.js';
import {
  BillingError,
  billingSummary,
  confirmCheckout,
  isTestMode,
  openBillingPortal,
  planList,
  startCheckout,
  startTopUp,
  topUpOptions,
} from '../billing.js';
import { InputError, options, parseSettings, preview } from '../business-input.js';
import { MenuImportError } from '../menu-import.js';
import { calendarRoutes } from './calendar-routes.js';

// Where owners open the app; Stripe sends them back here.
const APP_URL = process.env.BETTER_AUTH_URL;

// stripe: the Stripe client, or null when billing isn't set up; phoneNumbers: buys a paying
// business its number (phone-numbers.js); menuImports: reads menus from photos (menu-import.js).
export function ownerRoutes({ stripe, phoneNumbers, menuImports }) {
  const router = express.Router();
  // Menu photos are large (the owner app shrinks each to a few hundred KB); other requests are small.
  router.use('/menu-imports', express.json({ limit: '25mb' }));
  router.use(express.json());

  router.get('/providers', (_req, res) => {
    res.json({ providers: signInProviders });
  });

  // Every route below needs a signed-in owner; req.user is who it is.
  router.use(async (req, res, next) => {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Please sign in.' });
    req.user = session.user;
    next();
  });

  router.get('/me', async (req, res) => {
    const { id, name, email, image } = req.user;
    const business = await findBusinessRowByOwner(id);
    res.json({ user: { id, name, email, image }, business, billing: await billingSummary(business) });
  });

  router.get('/options', (_req, res) => {
    res.json(options);
  });

  router.put('/business', async (req, res) => {
    res.json(await saveOwnerBusiness(req.user.id, parseSettings(req.body)));
  });

  // Only the greeting: Claude's instructions are for the admin site.
  router.post('/preview', (req, res) => {
    res.json({ greeting: preview(parseSettings(req.body)).greeting });
  });

  router.get('/calls', async (req, res) => {
    const business = await findBusinessRowByOwner(req.user.id);
    if (!business) return res.json({ calls: [], next: null });
    const after = typeof req.query.after === 'string' ? req.query.after : null;
    if (after && !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z~\d+$/.test(after)) return res.status(400).json({ error: 'Invalid cursor.' });
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    res.json(await listCalls(business.id, { after, limit }));
  });

  router.use('/calendar', calendarRoutes());

  router.get('/plans', (_req, res) => {
    res.json({ plans: planList(), topUp: topUpOptions(), testMode: Boolean(stripe) && isTestMode() });
  });

  // The billing routes need Stripe and the owner's business; req.business is it.
  const billing = express.Router();
  billing.use(async (req, res, next) => {
    if (!stripe) return res.status(503).json({ error: 'Billing is not set up yet.' });
    req.business = await findBusinessRowByOwner(req.user.id);
    if (!req.business) return res.status(400).json({ error: 'Set up your receptionist first.' });
    next();
  });

  billing.post('/checkout', async (req, res) => {
    const { business, user } = req;
    res.json({ url: await startCheckout(stripe, { business, user, plan: req.body?.plan, appUrl: APP_URL }) });
  });

  billing.post('/top-up', async (req, res) => {
    const { business, user } = req;
    res.json({ url: await startTopUp(stripe, { business, user, minutes: req.body?.minutes, appUrl: APP_URL }) });
  });

  billing.post('/confirm', async (req, res) => {
    const { business, kind, added } = await confirmCheckout(stripe, {
      business: req.business,
      sessionId: req.body?.sessionId,
      phoneNumbers,
    });
    res.json({ ...(await billingSummary(business)), kind, added });
  });

  billing.post('/portal', async (req, res) => {
    res.json({ url: await openBillingPortal(stripe, { business: req.business, appUrl: APP_URL }) });
  });

  router.use('/billing', billing);

  router.post('/menu-imports', async (req, res) => {
    const { id } = await menuImports.start(req.user.id, req.body?.photos);
    res.status(202).json({ id });
  });

  router.get('/menu-imports/:id', async (req, res) => {
    const job = await menuImports.get(req.user.id, req.params.id);
    if (!job) return res.status(404).json({ error: 'That upload no longer exists.' });
    res.json(job);
  });

  router.use((err, _req, res, _next) => {
    if (err instanceof InputError) return res.status(400).json({ error: err.message, fields: err.fields });
    if (err instanceof BillingError || err instanceof MenuImportError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Those photos are too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
    console.error('API error (owner):', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return router;
}
