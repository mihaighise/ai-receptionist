// People who have signed in to the owner app. The table belongs to Better Auth (src/api/auth.js),
// which creates and updates users; this only looks them up.

import { pool } from './db/pool.js';

// The ID of the user with this email (case doesn't matter), or null if they've never signed in.
export async function findUserIdByEmail(email) {
  const { rows } = await pool.query('SELECT id FROM "user" WHERE lower(email) = lower($1)', [email]);
  return rows[0]?.id ?? null;
}
