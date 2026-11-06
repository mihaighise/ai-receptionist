// Owner routes of the API (mounted at /api/owner by src/api/server.js), used by the owner app in
// web/. Everything except /providers needs a signed-in owner.
//
//   GET /api/owner/providers   the sign-in providers that are set up, e.g. ["google"]
//   GET /api/owner/me          the signed-in owner, and their business (null until one is linked)

import express from 'express';
import { findBusinessRowByOwner } from '../../shared/businesses.js';
import { getSession, signInProviders } from '../auth.js';

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

ownerRoutes.use((err, _req, res, _next) => {
  console.error('API error (owner):', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
