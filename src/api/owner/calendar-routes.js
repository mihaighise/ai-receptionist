// The owner's calendar connection (src/integrations/calendars), mounted at /api/owner/calendar
// behind the owner routes' sign-in check (req.user is the owner).
//
//   GET    /                  { connected, provider, email, calendarId, calendars } (calendars: the ones
//                             bookings can go into, when connected)
//   GET    /connect           sends the browser to Google to allow access (opened in a popup)
//   GET    /callback          Google sends the browser back here; saves the connection and tells
//                             the page that opened the popup
//   PUT    /                  { calendarId }: which calendar bookings go into
//   DELETE /                  disconnects (and gives up access at Google)
//
// The popup keeps the setup's unsaved answers on the page. The state parameter is signed and tied
// to the owner, so a callback can't be forged or replayed for someone else.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import {
  connectionOf,
  provider,
  removeConnection,
  saveConnection,
  setCalendar,
} from '../../integrations/calendars/index.js';

const APP_URL = () => process.env.BETTER_AUTH_URL;
const redirectUri = () => `${APP_URL()}/api/owner/calendar/callback`;
const STATE_MINUTES = 15;

const sign = (payload) => createHmac('sha256', process.env.BETTER_AUTH_SECRET).update(`calendar-state:${payload}`).digest('base64url');

// "<userId>.<expires>.<nonce>.<signature>"
function makeState(userId) {
  const payload = `${userId}.${Date.now() + STATE_MINUTES * 60_000}.${randomBytes(9).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

function stateIsFor(state, userId) {
  const parts = String(state ?? '').split('.');
  if (parts.length !== 4) return false;
  const [owner, expires] = parts;
  const expected = Buffer.from(sign(parts.slice(0, 3).join('.')));
  const given = Buffer.from(parts[3]);
  return expected.length === given.length && timingSafeEqual(expected, given) && owner === userId && Number(expires) > Date.now();
}

// The page the popup ends on: tells the setup page (window.opener) and closes itself.
function popupPage(res, { ok, message }) {
  const data = JSON.stringify({ type: 'oriana-calendar', ok, message }).replace(/</g, '\\u003c');
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Calendar</title>
<body style="font-family:system-ui,sans-serif;padding:32px;text-align:center">
<p>${ok ? 'Your calendar is connected. You can close this window.' : `Your calendar wasn't connected: ${message.replace(/[<&>]/g, '')}`}</p>
<script>
  try { window.opener && window.opener.postMessage(${data}, ${JSON.stringify(APP_URL())}); } catch (e) {}
  ${ok ? 'setTimeout(function () { window.close(); }, 600);' : ''}
</script></body>`);
}

export function calendarRoutes() {
  const router = express.Router();
  const google = () => provider('google');

  router.get('/', async (req, res) => {
    const connection = await connectionOf(req.user.id);
    if (!connection) return res.json({ connected: false, available: Boolean(google()?.configured()) });
    let calendars = [];
    try {
      calendars = await provider(connection.provider).calendars(connection.refreshToken);
    } catch (err) {
      console.error('Could not list calendars:', err.message);
    }
    res.json({
      connected: true,
      available: true,
      provider: connection.provider,
      email: connection.accountEmail,
      calendarId: connection.calendarId,
      calendars,
    });
  });

  router.get('/connect', (req, res) => {
    if (!google()?.configured()) return res.status(503).send('Google Calendar is not set up on this server.');
    res.redirect(google().authUrl({ redirectUri: redirectUri(), state: makeState(req.user.id), loginHint: req.user.email }));
  });

  router.get('/callback', async (req, res) => {
    if (!stateIsFor(req.query.state, req.user.id)) {
      return popupPage(res, { ok: false, message: 'This link has expired. Please try connecting again.' });
    }
    if (req.query.error) {
      return popupPage(res, { ok: false, message: 'Access to the calendar was not allowed.' });
    }
    try {
      const { refreshToken, email } = await google().connect({ code: String(req.query.code ?? ''), redirectUri: redirectUri() });
      await saveConnection(req.user.id, { provider: 'google', accountEmail: email, refreshToken });
      popupPage(res, { ok: true });
    } catch (err) {
      console.error('Could not connect a calendar:', err.message);
      popupPage(res, { ok: false, message: err.message });
    }
  });

  router.put('/', async (req, res) => {
    const connection = await connectionOf(req.user.id);
    if (!connection) return res.status(400).json({ error: 'Connect a calendar first.' });
    const calendars = await provider(connection.provider).calendars(connection.refreshToken);
    const calendarId = req.body?.calendarId;
    if (!calendars.some((calendar) => calendar.id === calendarId)) {
      return res.status(400).json({ error: 'Choose one of your calendars.' });
    }
    await setCalendar(req.user.id, calendarId);
    res.json({ calendarId });
  });

  router.delete('/', async (req, res) => {
    await removeConnection(req.user.id);
    res.status(204).end();
  });

  return router;
}
