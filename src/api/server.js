// API server: the backend for the web apps in web/ (npm run api). They call it under /api: through
// Vite in development, through nginx in Docker.
//   /api/admin/...   the admin site (admin/routes.js)
//   /api/owner/...   later: the app for business owners
//
// It runs separately from the phone server, on its own port, and by default only accepts
// connections from this computer (127.0.0.1), so the ngrok tunnel never exposes it.
// Set ADMIN_PASSWORD to also require a password for the admin routes (any username).

import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { migrate } from '../shared/db/migrate.js';
import { adminRoutes } from './admin/routes.js';

const PORT = Number(process.env.API_PORT ?? 3001);
const HOST = process.env.API_HOST ?? '127.0.0.1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

try {
  await migrate();
} catch (err) {
  console.error(`Could not set up the database: ${err.message}`);
  console.error('Is Postgres running? Start it with: docker compose up -d db');
  process.exit(1);
}

// Compares hashes so both sides have the same length, which timingSafeEqual requires.
const sameText = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

// HTTP Basic auth: the browser asks for a username and password and sends them with every request.
function requireAdminPassword(req, res, next) {
  if (!ADMIN_PASSWORD) return next();
  const [scheme, encoded] = (req.header('Authorization') ?? '').split(' ');
  const password = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
  if (sameText(password, ADMIN_PASSWORD)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Receptionist admin"').status(401).send('Password required');
}

const app = express();
app.use('/api/admin', requireAdminPassword, adminRoutes);

app.listen(PORT, HOST, () => {
  console.log(`API: http://localhost:${PORT}/api${ADMIN_PASSWORD ? '' : ' (no ADMIN_PASSWORD set)'}`);
  console.log('Open the admin site with: cd web && npm run dev');
});
