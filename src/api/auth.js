// Sign-in for business owners, with Better Auth. Owners sign in with Google (Microsoft and Apple
// later); there are no passwords. Users, their sessions and the accounts they sign in with are
// stored in Postgres (db/migrations/002_create_auth.sql).
//
// Better Auth answers everything under /api/auth: the redirect to Google, Google's callback,
// get-session and sign-out. The web app talks to it with better-auth/react.

import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import { pool } from '../shared/db/pool.js';

// Each provider is turned on once its keys are in .env. Google's come from Google Cloud Console >
// APIs & Services > Credentials > OAuth client ID (type "Web application"), with the redirect URI
// <BETTER_AUTH_URL>/api/auth/callback/google.
const socialProviders = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

// The sign-in providers that are set up, e.g. ['google'], for the sign-in page.
export const signInProviders = Object.keys(socialProviders);

export const authOptions = {
  database: pool,
  // The address owners open the app on (the web app, which forwards /api here). Google sends
  // them back to it after signing in, and session cookies are set for it.
  baseURL: process.env.BETTER_AUTH_URL,
  // Signs the session cookies. Changing it signs everyone out.
  secret: process.env.BETTER_AUTH_SECRET,
  basePath: '/api/auth',
  socialProviders,
  // The API is only reached through the web app (Vite or nginx), which puts the visitor's address
  // in X-Forwarded-For. Better Auth uses it to rate-limit each visitor separately.
  advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
};

// Better Auth checks its tables when it's created, so it's only created on first use, after the
// server has run the migrations that add them.
let instance;
export const getAuth = () => (instance ??= betterAuth(authOptions));

// The signed-in user and session for an Express request, or null.
export const getSession = (req) => getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) });

// Better Auth's tables come from our own migrations. If an upgrade needs changes to them, say so
// on startup instead of failing at the first sign-in.
export async function warnIfAuthSchemaOutdated() {
  const { toBeCreated, toBeAdded } = await getMigrations(authOptions, { throwOnUnsafe: false });
  const tables = [...toBeCreated, ...toBeAdded].map((change) => change.table);
  if (tables.length) {
    console.warn(`Better Auth needs database changes (${[...new Set(tables)].join(', ')}).`);
    console.warn('Run npm run db:auth-sql and add its output as a new file in db/migrations.');
  }
}
