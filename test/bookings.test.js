// Booking appointments: open times (src/skills/bookings/slots.js), Google Calendar
// (src/integrations/calendars) against a fake Google, connecting a calendar through the owner API,
// and the bookings skill on a call. Nothing reaches Google.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { toolsFor } from '../src/phone/receptionist.js';
import { createGoogleCalendar, SCOPES } from '../src/integrations/calendars/google.js';
import { saveConnection, useCalendarProvider } from '../src/integrations/calendars/index.js';
import { findBusinessById, saveOwnerBusiness } from '../src/shared/businesses.js';
import { pool } from '../src/shared/db/pool.js';
import { buildSystemPrompt } from '../src/shared/prompt.js';
import { listCalls, recordCall } from '../src/shared/usage.js';
import { skillById } from '../src/skills/index.js';
import {
  addDays,
  bookingSettingsProblem,
  localDate,
  openSlots,
  readBookingSettings,
  zonedTime,
} from '../src/skills/bookings/slots.js';
import { startApi } from './support/api.js';
import { emptyTestDatabase, setUpTestDatabase } from './support/database.js';
import { fakeGoogle } from './support/fake-google.js';
import { signedInOwner } from './support/owners.js';

const ZONE = 'America/New_York';
const EVERY_DAY = Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [day, [{ from: '09:00', to: '12:00' }]]));
const SETTINGS = {
  services: [
    { name: 'Service call', minutes: 60 },
    { name: 'Quick check', minutes: 20 },
  ],
  hours: EVERY_DAY,
  timeZone: ZONE,
  bufferMinutes: 0,
  noticeHours: 0,
  horizonDays: 60,
};
let api;
let google;

before(async () => {
  await setUpTestDatabase();
  api = await startApi();
});
beforeEach(async () => {
  await emptyTestDatabase();
  google = fakeGoogle();
  useCalendarProvider('google', createGoogleCalendar({ fetch: google.fetch }));
});
after(async () => {
  await api.close();
  await pool.end();
});

const times = (slots) => slots.map((slot) => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(slot));

// --- Open times ---

test('open times fill the bookable hours, around what is busy, with a gap', () => {
  const settings = readBookingSettings({ ...SETTINGS, bufferMinutes: 15 });
  const date = '2026-11-12';
  const busy = [{ start: zonedTime(date, '10:00', ZONE), end: zonedTime(date, '10:30', ZONE) }];
  const now = new Date('2026-11-01T00:00:00Z');
  assert.deepEqual(times(openSlots({ date, minutes: 60, settings, busy: [], now })), ['09:00', '09:30', '10:00', '10:30', '11:00']);
  assert.deepEqual(times(openSlots({ date, minutes: 60, settings, busy, now })), ['11:00']);
  // Short appointments start every 15 minutes.
  assert.equal(openSlots({ date, minutes: 20, settings, busy: [], now }).length, 11);
});

test('open times respect minimum notice, how far ahead, and closed days', () => {
  const settings = readBookingSettings({ ...SETTINGS, noticeHours: 24, horizonDays: 3, hours: { thu: [{ from: '09:00', to: '12:00' }] } });
  const now = zonedTime('2026-11-11', '10:00', ZONE); // Wednesday 10:00
  assert.deepEqual(times(openSlots({ date: '2026-11-12', minutes: 60, settings, busy: [], now })), ['10:00', '10:30', '11:00']);
  assert.deepEqual(openSlots({ date: '2026-11-19', minutes: 60, settings, busy: [], now }), []); // too far ahead
  assert.deepEqual(openSlots({ date: '2026-11-13', minutes: 60, settings, busy: [], now }), []); // Friday: closed
});

test('local times follow daylight saving', () => {
  assert.equal(zonedTime('2026-03-07', '09:00', ZONE).toISOString(), '2026-03-07T14:00:00.000Z');
  assert.equal(zonedTime('2026-03-08', '09:00', ZONE).toISOString(), '2026-03-08T13:00:00.000Z');
  assert.equal(zonedTime('2026-11-12', '09:00', 'Europe/Bucharest').toISOString(), '2026-11-12T07:00:00.000Z');
});

test('booking settings are cleaned, and must list something to book and some hours', () => {
  const settings = readBookingSettings({
    services: [{ name: '  Haircut ', minutes: '45' }, { name: '', minutes: 30 }, { name: 'Bad', minutes: 'x' }],
    hours: { mon: [{ from: '09:00', to: '17:00' }, { from: '18:00', to: '17:00' }], funday: [{ from: '01:00', to: '02:00' }] },
    timeZone: 'Mars/Olympus',
    bufferMinutes: -5,
  });
  assert.deepEqual(settings.services, [{ name: 'Haircut', minutes: 45 }]);
  assert.deepEqual(settings.hours, { mon: [{ from: '09:00', to: '17:00' }] });
  assert.equal(settings.timeZone, 'America/New_York');
  assert.equal(settings.bufferMinutes, 0);
  assert.equal(readBookingSettings(undefined), undefined);
  assert.match(bookingSettingsProblem(readBookingSettings({ hours: EVERY_DAY })), /Add at least one thing/);
  assert.match(bookingSettingsProblem(readBookingSettings({ services: SETTINGS.services })), /Choose the days and hours/);
  assert.equal(bookingSettingsProblem(readBookingSettings(SETTINGS)), null);
});

// --- Google Calendar ---

test('connecting asks Google for calendar access only, with a refresh token', () => {
  const url = new URL(createGoogleCalendar({ fetch: google.fetch }).authUrl({ redirectUri: 'http://app/cb', state: 'st', loginHint: 'a@b.c' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepEqual(url.searchParams.get('scope').split(' '), SCOPES);
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://app/cb');
  assert.equal(url.searchParams.get('login_hint'), 'a@b.c');
});

test('a connection is refused when the owner unticks calendar access', async () => {
  google.state.grantedScopes = 'openid email';
  await assert.rejects(
    createGoogleCalendar({ fetch: google.fetch }).connect({ code: 'good-code', redirectUri: 'x' }),
    /allow access to your calendar/,
  );
});

test('busy times and new events use the calendar API, with one access token per hour', async () => {
  const calendar = createGoogleCalendar({ fetch: google.fetch });
  google.state.busy = [{ start: '2026-11-12T15:00:00Z', end: '2026-11-12T16:00:00Z' }];
  const from = new Date('2026-11-12T05:00:00Z');
  const to = new Date('2026-11-13T05:00:00Z');
  assert.deepEqual(await calendar.busy('refresh-1', 'primary', from, to), google.state.busy);
  const id = await calendar.createEvent('refresh-1', 'team@group.calendar.google.com', {
    title: 'Service call: Jane',
    description: 'Name: Jane',
    start: new Date('2026-11-12T16:00:00Z'),
    end: new Date('2026-11-12T17:00:00Z'),
    timeZone: ZONE,
  });
  assert.equal(id, 'event-1');
  assert.deepEqual(google.state.events[0].start, { dateTime: '2026-11-12T16:00:00.000Z', timeZone: ZONE });
  assert.equal(google.state.events[0].calendarId, 'team@group.calendar.google.com');
  assert.equal(google.requests.filter((r) => r.url.endsWith('/token')).length, 1);
  assert.ok(google.requests.filter((r) => r.auth).every((r) => r.auth === 'Bearer access-for-refresh-1'));
});

// --- Connecting through the owner API ---

// Follows /connect to Google, then comes back to the callback as Google would.
async function connectThroughApi(cookie, { code = 'good-code', tamper = (state) => state } = {}) {
  const start = await apiFetch('/owner/calendar/connect', cookie);
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  return apiFetch(`/owner/calendar/callback?code=${code}&state=${encodeURIComponent(tamper(state))}`, cookie);
}
const apiFetch = (path, cookie) => api.raw(path, { headers: { Cookie: cookie }, redirect: 'manual' });

test('an owner connects their calendar through Google, and the token is stored encrypted', async () => {
  const owner = await signedInOwner();
  assert.deepEqual((await api.request('GET', '/owner/calendar', { cookie: owner.cookie })).body, { connected: false, available: true });

  const back = await connectThroughApi(owner.cookie);
  assert.equal(back.status, 200);
  const page = await back.text();
  assert.match(page, /Your calendar is connected/);
  assert.match(page, /postMessage/);

  const { rows } = await pool.query('SELECT provider, account_email, calendar_id, refresh_token FROM calendar_connections');
  assert.equal(rows[0].account_email, 'owner@example.com');
  assert.equal(rows[0].calendar_id, 'primary');
  assert.notEqual(rows[0].refresh_token, 'refresh-1');
  assert.match(rows[0].refresh_token, /^v1\./);

  const status = (await api.request('GET', '/owner/calendar', { cookie: owner.cookie })).body;
  assert.equal(status.connected, true);
  assert.equal(status.email, 'owner@example.com');
  assert.deepEqual(status.calendars.map((c) => c.id), ['primary', 'team@group.calendar.google.com']);
});

test("a callback with someone else's, a changed or an old link connects nothing", async () => {
  const alice = await signedInOwner({ email: 'alice@example.com' });
  const bob = await signedInOwner({ email: 'bob@example.com' });
  const start = await apiFetch('/owner/calendar/connect', alice.cookie);
  const aliceState = new URL(start.headers.get('location')).searchParams.get('state');
  const asBob = await apiFetch(`/owner/calendar/callback?code=good-code&state=${encodeURIComponent(aliceState)}`, bob.cookie);
  assert.match(await asBob.text(), /expired/);
  const changed = await connectThroughApi(alice.cookie, { tamper: (state) => state.replace(/\.(\d+)\./, '.9999999999999.') });
  assert.match(await changed.text(), /expired/);
  const badCode = await connectThroughApi(alice.cookie, { code: 'bad-code' });
  assert.match(await badCode.text(), /wasn't connected/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM calendar_connections')).rows[0].n, 0);
  assert.equal((await apiFetch('/owner/calendar/connect', '')).status, 401);
});

test('the owner picks which calendar bookings go into, and can disconnect', async () => {
  const owner = await signedInOwner();
  await connectThroughApi(owner.cookie);
  const wrong = await api.request('PUT', '/owner/calendar', { cookie: owner.cookie, body: { calendarId: 'someone-else' } });
  assert.equal(wrong.status, 400);
  const right = await api.request('PUT', '/owner/calendar', { cookie: owner.cookie, body: { calendarId: 'team@group.calendar.google.com' } });
  assert.equal(right.status, 200);
  assert.equal((await api.request('GET', '/owner/calendar', { cookie: owner.cookie })).body.calendarId, 'team@group.calendar.google.com');

  assert.equal((await api.request('DELETE', '/owner/calendar', { cookie: owner.cookie })).status, 204);
  assert.deepEqual(google.state.revoked, ['refresh-1']);
  assert.equal((await api.request('GET', '/owner/calendar', { cookie: owner.cookie })).body.connected, false);
});

// --- The skill on a call ---

// An owner's business with bookings on, and (unless connected is false) a calendar connected.
async function bookingBusiness({ connected = true, settings = SETTINGS } = {}) {
  const owner = await signedInOwner({ email: `owner${Math.random()}@example.com` });
  const row = await saveOwnerBusiness(owner.user.id, {
    name: 'Rapid Flow Plumbing',
    description: 'a plumber',
    languages: ['en'],
    features: ['messages', 'bookings'],
    notify_sms: '+15125550100',
    booking_settings: settings,
  });
  await pool.query("UPDATE businesses SET subscription_status = 'active', plan = 'pro' WHERE id = $1", [row.id]);
  if (connected) await saveConnection(owner.user.id, { provider: 'google', accountEmail: 'owner@example.com', refreshToken: 'refresh-1' });
  return findBusinessById(row.id);
}

const call = { callSid: 'CAbook', from: '+15551234567', to: '+15550001111' };
const result = (content, isError = false) => ({ content, isError });
const nextWeek = () => addDays(localDate(new Date(), ZONE), 7);

test('bookings are offered on calls once a calendar is connected and something can be booked', async () => {
  const off = await bookingBusiness({ connected: false });
  assert.equal(off.actions.bookings, null);
  assert.ok(!toolsFor(off).some((tool) => tool.name === 'book_appointment'));

  const on = await bookingBusiness();
  assert.deepEqual(toolsFor(on).map((tool) => tool.name), ['take_message', 'cancel_message', 'check_availability', 'book_appointment', 'end_call']);
  const prompt = buildSystemPrompt(on, { callerNumber: '+1555', now: new Date('2026-11-12T15:00:00Z') });
  assert.match(prompt, /You can book appointments in the business's calendar: Service call \(1 hour\), Quick check \(20 minutes\)\./);
  assert.match(prompt, /Today is Thursday, November 12, 2026 \(America\/New_York\)\./);
  // Booking requests no longer go to messages; changes and cancellations still do.
  assert.match(prompt, /- To change or cancel an appointment, or for anything you can't handle yourself, take a message/);

  const nothingToBook = await bookingBusiness({ settings: { ...SETTINGS, services: [] } });
  assert.equal(nothingToBook.actions.bookings, null);
});

test('check_availability offers the open times, and the next ones when a day is full', async () => {
  const business = await bookingBusiness();
  const session = skillById('bookings').startCall({ business, call });
  const date = nextWeek();
  google.state.busy = [{ start: zonedTime(date, '09:00', ZONE).toISOString(), end: zonedTime(date, '11:00', ZONE).toISOString() }];
  const open = await session.run({ name: 'check_availability', input: { appointment: 'Service call', date } }, result);
  assert.match(open.content, new RegExp(`Open times for Service call on ${date}: 11:00 \\(.+ at 11:00 AM\\)\\.`));

  google.state.busy = [{ start: zonedTime(date, '08:00', ZONE).toISOString(), end: zonedTime(date, '13:00', ZONE).toISOString() }];
  const full = await session.run({ name: 'check_availability', input: { appointment: 'Service call', date } }, result);
  assert.match(full.content, new RegExp(`Nothing open on ${date}\\. The next open times are on ${addDays(date, 1)}`));

  const unknown = await session.run({ name: 'check_availability', input: { appointment: 'Massage', date } }, result);
  assert.equal(unknown.isError, true);
  const past = await session.run({ name: 'check_availability', input: { appointment: 'Service call', date: '2020-01-01' } }, result);
  assert.match(past.content, /in the past/);
});

test('book_appointment creates the event, records it, and shows it in the call history', async () => {
  const business = await bookingBusiness();
  const session = skillById('bookings').startCall({ business, call });
  const date = nextWeek();
  const booked = await session.run(
    {
      name: 'book_appointment',
      input: { appointment: 'Service call', date, time: '10:00', caller_name: 'Jane Doe', callback_number: '+15125550111', notes: 'Leaking tap' },
    },
    result,
  );
  assert.match(booked.content, /^Booked: Service call on .+ at 10:00 AM\. Tell the caller it's confirmed\.$/);

  const [event] = google.state.events;
  assert.equal(event.summary, 'Service call: Jane Doe');
  assert.match(event.description, /Name: Jane Doe\nPhone: \+15125550111\nNotes: Leaking tap\n\nBooked by Oriana Agent on a call from \+15551234567\./);
  assert.deepEqual(event.start, { dateTime: zonedTime(date, '10:00', ZONE).toISOString(), timeZone: ZONE });
  assert.deepEqual(event.end, { dateTime: zonedTime(date, '11:00', ZONE).toISOString(), timeZone: ZONE });
  assert.equal(session.outcome().bookings.length, 1);

  await recordCall({ businessId: business.id, callSid: 'CAbook', caller: '+15551234567', startedAt: new Date(), endedAt: new Date() });
  const { calls } = await listCalls(business.id);
  const [shown] = calls[0].bookings;
  assert.equal(shown.service, 'Service call');
  assert.equal(new Date(shown.starts_at).getTime(), zonedTime(date, '10:00', ZONE).getTime());
});

test("a time that's been taken since it was offered isn't booked twice", async () => {
  const business = await bookingBusiness();
  const session = skillById('bookings').startCall({ business, call });
  const date = nextWeek();
  google.state.busy = [{ start: zonedTime(date, '10:00', ZONE).toISOString(), end: zonedTime(date, '11:00', ZONE).toISOString() }];
  const input = { appointment: 'Service call', date, time: '10:00', caller_name: 'Jane', callback_number: '+1555' };
  const taken = await session.run({ name: 'book_appointment', input }, result);
  assert.match(taken.content, /no longer open/);
  assert.deepEqual(google.state.events, []);
  const missing = await session.run({ name: 'book_appointment', input: { ...input, caller_name: ' ' } }, result);
  assert.match(missing.content, /name and callback number/);
});

test('when the calendar can’t be reached, the receptionist offers a message instead', async () => {
  const business = await bookingBusiness();
  const session = skillById('bookings').startCall({ business, call });
  google.state.failCalendar = 'Backend Error';
  const failed = await session.run({ name: 'check_availability', input: { appointment: 'Service call', date: nextWeek() } }, result);
  assert.equal(failed.isError, true);
  assert.match(failed.content, /offer to take a message/);
});

test('owners save booking settings; the admin site leaves them as they are', async () => {
  const owner = await signedInOwner();
  const body = { name: 'X', description: 'y', languages: ['en'], features: ['bookings'], booking_settings: { hours: EVERY_DAY } };
  const missing = await api.request('PUT', '/owner/business', { cookie: owner.cookie, body });
  assert.equal(missing.status, 400);
  assert.match(missing.body.fields.booking_settings, /Add at least one thing/);
  const saved = await api.request('PUT', '/owner/business', { cookie: owner.cookie, body: { ...body, booking_settings: SETTINGS } });
  assert.deepEqual(saved.body.booking_settings.services, SETTINGS.services);

  const admin = await api.request('PUT', `/admin/businesses/${saved.body.id}`, {
    body: { ...saved.body, slug: saved.body.slug, booking_settings: undefined, owner_email: 'owner@example.com' },
  });
  assert.equal(admin.status, 200);
  assert.deepEqual(admin.body.booking_settings.services, SETTINGS.services);
});
