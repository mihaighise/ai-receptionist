// The test database: created on first use, migrated like the real one, and emptied before each
// test. Everything here refuses to run on a database whose name doesn't end in _test.
// Run directly (node --import ./test/support/env.js test/support/database.js) to set it up.

import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { migrate } from '../../src/shared/db/migrate.js';
import { pool } from '../../src/shared/db/pool.js';

const url = new URL(process.env.DATABASE_URL);
const name = url.pathname.slice(1);
if (!name.endsWith('_test')) throw new Error(`Refusing to use ${name} for tests: its name must end in _test`);

// Creates the test database if it doesn't exist yet, then brings its schema up to date.
export async function setUpTestDatabase() {
  const server = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).href });
  await server.connect();
  try {
    const { rowCount } = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    // The name is checked above (it can't be a query parameter here).
    if (!rowCount) await server.query(`CREATE DATABASE "${name.replaceAll('"', '')}"`);
  } finally {
    await server.end();
  }
  await migrate();
}

// Deletes every business (with its calls and extra minutes) and every user (with their sessions and
// accounts).
export async function emptyTestDatabase() {
  await pool.query('TRUNCATE menu_imports, phone_number_orders, calls, extra_minutes, businesses, session, account, verification, "user"');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await setUpTestDatabase();
  } finally {
    await pool.end();
  }
}
