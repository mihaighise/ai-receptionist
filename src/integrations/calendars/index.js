// Calendars an owner can connect, behind one interface, so the bookings skill never needs to know
// which one it is. Google is the first; another (e.g. Outlook) is a new file with the same methods
// as google.js, registered in PROVIDERS.
//
// A connection belongs to the owner (calendar_connections.user_id), and their business books into it.

import { pool } from '../../shared/db/pool.js';
import { decrypt, encrypt } from '../../shared/secrets.js';
import { createGoogleCalendar } from './google.js';

const PROVIDERS = { google: createGoogleCalendar() };

export const provider = (name) => PROVIDERS[name] ?? null;

// For tests: replace a provider (e.g. Google with a fake fetch).
export function useCalendarProvider(name, implementation) {
  PROVIDERS[name] = implementation;
}

// An owner's connection: { provider, accountEmail, calendarId, refreshToken }, or null.
export async function connectionOf(userId) {
  if (!userId) return null;
  const { rows } = await pool.query('SELECT * FROM calendar_connections WHERE user_id = $1', [userId]);
  const row = rows[0];
  if (!row) return null;
  return { provider: row.provider, accountEmail: row.account_email, calendarId: row.calendar_id, refreshToken: decrypt(row.refresh_token) };
}

export async function saveConnection(userId, { provider: name, accountEmail, refreshToken, calendarId = 'primary' }) {
  await pool.query(
    `INSERT INTO calendar_connections (user_id, provider, account_email, calendar_id, refresh_token) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET provider = $2, account_email = $3, calendar_id = $4, refresh_token = $5, connected_at = now()`,
    [userId, name, accountEmail, calendarId, encrypt(refreshToken)],
  );
}

export async function setCalendar(userId, calendarId) {
  await pool.query('UPDATE calendar_connections SET calendar_id = $2 WHERE user_id = $1', [userId, calendarId]);
}

export async function removeConnection(userId) {
  const connection = await connectionOf(userId);
  await pool.query('DELETE FROM calendar_connections WHERE user_id = $1', [userId]);
  if (connection) await provider(connection.provider)?.disconnect(connection.refreshToken);
}

// The calendar an owner's business books into: { busy(from, to), createEvent(event), provider }, or
// null when they haven't connected one.
export async function calendarOf(userId) {
  const connection = await connectionOf(userId);
  const impl = connection && provider(connection.provider);
  if (!impl) return null;
  return {
    provider: connection.provider,
    busy: (from, to) => impl.busy(connection.refreshToken, connection.calendarId, from, to),
    createEvent: (event) => impl.createEvent(connection.refreshToken, connection.calendarId, event),
  };
}
