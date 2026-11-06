// The API's routes, as an Express app. server.js starts it; the tests in test/ run it directly.
//   /api/admin/...   the admin site (admin/routes.js)
//   /api/owner/...   the owner app (owner/routes.js)
//   /api/auth/...    owner sign-in, answered by Better Auth (auth.js)

import { createHash, timingSafeEqual } from 'node:crypto';
import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import { adminRoutes } from './admin/routes.js';
import { getAuth } from './auth.js';
import { ownerRoutes } from './owner/routes.js';

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

// adminPassword: required for the admin routes when set.
export function createApp({ adminPassword } = {}) {
  const app = express();
  // Better Auth reads the request body itself, so it comes before any JSON parsing.
  app.all('/api/auth/{*path}', toNodeHandler(getAuth()));
  app.use('/api/admin', requireAdminPassword(adminPassword), adminRoutes);
  app.use('/api/owner', ownerRoutes);
  return app;
}
