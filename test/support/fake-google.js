// A stand-in for Google's OAuth and Calendar APIs, as a fetch function for createGoogleCalendar:
// it answers the same URLs Google does from `state`, and keeps every request in `requests`.
// Nothing reaches Google.

export function fakeGoogle() {
  const state = {
    busy: [],
    events: [],
    calendars: [
      { id: 'primary', summary: 'owner@example.com', primary: true },
      { id: 'team@group.calendar.google.com', summary: 'Team bookings' },
    ],
    // What the token endpoint grants when a code is exchanged.
    grantedScopes: 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    revoked: [],
    failCalendar: null,
  };
  const requests = [];
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const idToken = (email) => `x.${Buffer.from(JSON.stringify({ email })).toString('base64url')}.y`;

  async function fetch(url, options = {}) {
    const { pathname, searchParams, origin } = new URL(url);
    const body = typeof options.body === 'string' && options.body.startsWith('{') ? JSON.parse(options.body) : options.body;
    requests.push({ url, method: options.method ?? 'GET', body, auth: options.headers?.Authorization });
    if (origin === 'https://oauth2.googleapis.com' && pathname === '/token') {
      const params = new URLSearchParams(body);
      if (params.get('grant_type') === 'authorization_code') {
        if (params.get('code') !== 'good-code') return json({ error: 'invalid_grant' }, 400);
        return json({ access_token: 'access-1', expires_in: 3599, refresh_token: 'refresh-1', scope: state.grantedScopes, id_token: idToken('owner@example.com') });
      }
      return json({ access_token: `access-for-${params.get('refresh_token')}`, expires_in: 3599 });
    }
    if (origin === 'https://oauth2.googleapis.com' && pathname === '/revoke') {
      state.revoked.push(searchParams.get('token'));
      return json({});
    }
    if (state.failCalendar) return json({ error: { message: state.failCalendar } }, 503);
    if (pathname === '/calendar/v3/users/me/calendarList') return json({ items: state.calendars });
    if (pathname === '/calendar/v3/freeBusy') {
      const id = body.items[0].id;
      return json({ calendars: { [id]: { busy: state.busy } } });
    }
    const insert = pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events$/);
    if (insert && options.method === 'POST') {
      const event = { id: `event-${state.events.length + 1}`, calendarId: decodeURIComponent(insert[1]), ...body };
      state.events.push(event);
      return json(event);
    }
    return json({ error: { message: `Fake Google doesn't know ${url}` } }, 404);
  }

  return { fetch, state, requests };
}
