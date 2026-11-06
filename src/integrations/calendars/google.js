// Google Calendar, through Google's REST APIs: OAuth to connect a calendar, free/busy times, and
// creating events. Uses the same OAuth client as owner sign-in (GOOGLE_CLIENT_ID/SECRET); the
// owner approves calendar access separately, in a popup (see src/api/owner/calendar-routes.js).
//
// fetch can be replaced (the tests use a fake Google).

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/calendar/v3';

// Only what bookings need: create events, see busy times, and list calendars to pick one.
export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export class CalendarError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function createGoogleCalendar({ fetch = globalThis.fetch } = {}) {
  const clientId = () => process.env.GOOGLE_CLIENT_ID;
  const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET;
  // refresh token -> { token, expires }: access tokens last an hour.
  const accessTokens = new Map();

  async function call(url, options = {}) {
    const res = await fetch(url, options);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new CalendarError(body.error?.message ?? body.error_description ?? body.error ?? `Google answered ${res.status}`, res.status);
    return body;
  }

  async function token(params) {
    return call(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
    });
  }

  async function accessToken(refreshToken) {
    const cached = accessTokens.get(refreshToken);
    if (cached && cached.expires > Date.now() + 60_000) return cached.token;
    const { access_token, expires_in } = await token({ grant_type: 'refresh_token', refresh_token: refreshToken });
    accessTokens.set(refreshToken, { token: access_token, expires: Date.now() + expires_in * 1000 });
    return access_token;
  }

  const api = async (refreshToken, path, options = {}) =>
    call(`${API}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${await accessToken(refreshToken)}`, 'Content-Type': 'application/json' },
    });

  return {
    name: 'Google Calendar',
    configured: () => Boolean(clientId() && clientSecret()),

    // Where to send the owner to approve access. state comes back to the callback unchanged.
    authUrl: ({ redirectUri, state, loginHint }) =>
      `${AUTH_URL}?${new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        // A refresh token, so calls can book long after the owner has left.
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
        ...(loginHint && { login_hint: loginHint }),
      })}`,

    // The code Google sends back -> { refreshToken, email }.
    async connect({ code, redirectUri }) {
      const body = await token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
      if (!body.refresh_token) throw new CalendarError('Google did not give access to the calendar. Please try again.');
      const missing = SCOPES.filter((scope) => scope.startsWith('https://') && !body.scope?.split(' ').includes(scope));
      if (missing.length) throw new CalendarError('Please allow access to your calendar (tick every box Google shows).');
      // The account's email, from the ID token Google signed (its payload is plain base64url JSON).
      const email = body.id_token ? JSON.parse(Buffer.from(body.id_token.split('.')[1], 'base64url')).email : null;
      return { refreshToken: body.refresh_token, email };
    },

    async disconnect(refreshToken) {
      accessTokens.delete(refreshToken);
      await fetch(`${REVOKE_URL}?${new URLSearchParams({ token: refreshToken })}`, { method: 'POST' }).catch(() => {});
    },

    // The calendars the owner can add events to: [{ id, name, primary }].
    async calendars(refreshToken) {
      const { items = [] } = await api(refreshToken, '/users/me/calendarList?minAccessRole=writer');
      return items.map((item) => ({ id: item.id, name: item.summaryOverride ?? item.summary, primary: Boolean(item.primary) }));
    },

    // Busy times between two instants: [{ start, end }] (ISO strings).
    async busy(refreshToken, calendarId, from, to) {
      const body = await api(refreshToken, '/freeBusy', {
        method: 'POST',
        body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: calendarId }] }),
      });
      const calendar = body.calendars?.[calendarId];
      if (calendar?.errors?.length) throw new CalendarError(`Could not read the calendar (${calendar.errors[0].reason})`);
      return calendar?.busy ?? [];
    },

    // Adds an event; returns its id.
    async createEvent(refreshToken, calendarId, { title, description, start, end, timeZone }) {
      const event = await api(refreshToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify({
          summary: title,
          description,
          start: { dateTime: start.toISOString(), timeZone },
          end: { dateTime: end.toISOString(), timeZone },
        }),
      });
      return event.id;
    },
  };
}
