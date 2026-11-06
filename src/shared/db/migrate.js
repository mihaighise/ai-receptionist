// Brings the database schema up to date by running the SQL files in db/migrations that haven't
// run yet, in filename order (001_..., 002_...). Each file runs once, in its own transaction, and
// is recorded in the schema_migrations table. To change the schema, add a new file; never edit
// one that has already run.
// Runs when the server starts, and on its own with `npm run db:migrate`.

import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pool } from './pool.js';

const MIGRATIONS_DIR = new URL('../../../db/migrations/', import.meta.url);
// Identifies the lock below; any number works as long as every copy of the server uses the same one.
const LOCK_ID = 7_274_001;

export async function migrate() {
  const db = await pool.connect();
  try {
    // When several copies of the server start at once, only one migrates; the others wait for
    // it to finish and then find nothing left to do.
    await db.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await db.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));

    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
      await db.query('BEGIN');
      try {
        await db.query(sql);
        await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await db.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (err) {
        await db.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    db.release();
  }
}

// Run directly (npm run db:migrate): migrate, then exit.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await migrate();
    console.log('Database is up to date');
  } finally {
    await pool.end();
  }
}
