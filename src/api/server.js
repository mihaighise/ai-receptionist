// API server: the backend for the web apps in web/ (npm run api). They call it under /api: through
// Vite in development, through nginx in Docker. Its routes are in app.js.
//
// It runs separately from the phone server, on its own port, and by default only accepts
// connections from this computer (127.0.0.1), so the ngrok tunnel never exposes it.
// Set ADMIN_PASSWORD to also require a password for the admin routes (any username).

import { migrate } from '../shared/db/migrate.js';
import { createApp } from './app.js';
import { signInProviders, warnIfAuthSchemaOutdated } from './auth.js';

const PORT = Number(process.env.API_PORT ?? 3001);
const HOST = process.env.API_HOST ?? '127.0.0.1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Fail fast on startup instead of at the first sign-in if required settings are missing.
const missing = ['BETTER_AUTH_URL', 'BETTER_AUTH_SECRET'].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')} (see .env.example)`);
  process.exit(1);
}
if (!signInProviders.length) console.warn('No sign-in provider set up: owners can\'t sign in (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)');

try {
  await migrate();
  await warnIfAuthSchemaOutdated();
} catch (err) {
  console.error(`Could not set up the database: ${err.message}`);
  console.error('Is Postgres running? Start it with: docker compose up -d db');
  process.exit(1);
}

const app = createApp({ adminPassword: ADMIN_PASSWORD });

app.listen(PORT, HOST, () => {
  console.log(`API: http://localhost:${PORT}/api${ADMIN_PASSWORD ? '' : ' (no ADMIN_PASSWORD set)'}`);
  console.log(`Owner sign-in: ${signInProviders.join(', ') || 'none'} (owners open ${process.env.BETTER_AUTH_URL})`);
  console.log('Open the web app with: cd web && npm run dev');
});
