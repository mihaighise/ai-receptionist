// Shared Postgres connection pool, used by everything that reads or writes the database.
// DATABASE_URL comes from .env, or from docker-compose.yml when the server runs in Docker.

import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set (see .env.example; start the database with: docker compose up -d db)');
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// An idle connection can drop, e.g. when Postgres restarts. Log it instead of crashing the server;
// the pool opens a new connection for the next query.
pool.on('error', (err) => console.error('Postgres connection error:', err.message));
