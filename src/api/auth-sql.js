// Prints the SQL Better Auth needs to bring its tables up to date (npm run db:auth-sql), for
// adding as a new file in db/migrations after a Better Auth upgrade. Prints nothing when they're current.

import { getMigrations } from 'better-auth/db/migration';
import { pool } from '../shared/db/pool.js';
import { authOptions } from './auth.js';

try {
  const { compileMigrations } = await getMigrations(authOptions, { throwOnUnsafe: false });
  console.log(await compileMigrations());
} finally {
  await pool.end();
}
