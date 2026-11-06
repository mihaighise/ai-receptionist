// Owner routes of the API (mounted at /api/owner by src/api/server.js), used by the owner app in
// web/. Everything except /providers needs a signed-in owner.
//
//   GET /api/owner/providers   the sign-in providers that are set up, e.g. ["google"]
//   GET /api/owner/me          the signed-in owner, and their business (null until they set one up)
//   GET /api/owner/options     languages and features to choose from
//   PUT /api/owner/business    save their business's settings, creating it the first time
//   POST /api/owner/preview    the greeting callers would hear with unsaved settings
//
// Owners only change what the receptionist knows and does. Its phone number, whether it answers
// calls and who owns it are set by the app (and the admin site), never by the owner.

import express from 'express';
import { findBusinessRowByOwner, saveOwnerBusiness } from '../../shared/businesses.js';
import { getSession, signInProviders } from '../auth.js';
import { InputError, options, parseSettings, preview } from '../business-input.js';

export const ownerRoutes = express.Router();
ownerRoutes.use(express.json());

ownerRoutes.get('/providers', (_req, res) => {
  res.json({ providers: signInProviders });
});

// Every route below needs a signed-in owner; req.user is who it is.
ownerRoutes.use(async (req, res, next) => {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Please sign in.' });
  req.user = session.user;
  next();
});

ownerRoutes.get('/me', async (req, res) => {
  const { id, name, email, image } = req.user;
  res.json({ user: { id, name, email, image }, business: await findBusinessRowByOwner(id) });
});

ownerRoutes.get('/options', (_req, res) => {
  res.json(options);
});

ownerRoutes.put('/business', async (req, res) => {
  res.json(await saveOwnerBusiness(req.user.id, parseSettings(req.body)));
});

// Only the greeting: Claude's instructions are for the admin site.
ownerRoutes.post('/preview', (req, res) => {
  res.json({ greeting: preview(parseSettings(req.body)).greeting });
});

ownerRoutes.use((err, _req, res, _next) => {
  if (err instanceof InputError) return res.status(400).json({ error: err.message, fields: err.fields });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
  console.error('API error (owner):', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
