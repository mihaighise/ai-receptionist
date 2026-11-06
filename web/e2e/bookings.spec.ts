// Booking appointments: connecting Google Calendar and choosing what callers can book in the setup,
// and booked appointments in the call history. The calendar routes are answered in the browser
// (context.route, so the popup is too), so nothing reaches Google; the API side is tested in
// test/bookings.test.js.

import type { BrowserContext, Page } from '@playwright/test';
import { saveOwnerBusiness } from '../../src/shared/businesses.js';
import { pool } from '../../src/shared/db/pool.js';
import { recordCall } from '../../src/shared/usage.js';
import { expect, expectNoSidewaysScroll, PHONE, test } from './fixtures';

const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click();
const CALENDARS = [
  { id: 'primary', name: 'owner@example.com', primary: true },
  { id: 'team', name: 'Team bookings', primary: false },
];

// A pretend calendar API: not connected until the popup from /connect has been through "Google".
async function fakeCalendar(context: BrowserContext) {
  const state = { connected: false, calendarId: 'primary' };
  await context.route('**/api/owner/calendar', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') state.calendarId = route.request().postDataJSON().calendarId;
    if (method === 'DELETE') {
      state.connected = false;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: state.connected
        ? {
            connected: true,
            available: true,
            email: 'owner@example.com',
            calendarId: state.calendarId,
            calendars: CALENDARS,
          }
        : { connected: false, available: true },
    });
  });
  // The page the real callback ends on, as if the owner had allowed access.
  await context.route('**/api/owner/calendar/connect', (route) => {
    state.connected = true;
    return route.fulfill({
      contentType: 'text/html',
      body: `<p>Your calendar is connected.</p><script>
        window.opener.postMessage({ type: 'oriana-calendar', ok: true }, location.origin);
        setTimeout(() => window.close(), 100);
      </script>`,
    });
  });
  return state;
}

test('an owner connects Google Calendar and chooses what callers can book', async ({ page, context, signIn }) => {
  const calendar = await fakeCalendar(context);
  const { user } = await signIn();
  await page.goto('/setup');
  await page.getByText('Salon, spa or barber', { exact: true }).click();
  await page.getByLabel('Business name').fill('Bella Hair');
  await page.getByLabel('What does your business do?').fill('a hair salon in Miami');
  await next(page);
  await next(page);

  await page.getByLabel('Text messages to').fill('+15125550100');
  await page.getByLabel('Book appointments in your calendar').check();
  const bookings = page.getByRole('group', { name: 'Bookings' });

  // Connecting happens in a popup, and the page updates when it's done.
  const popup = page.waitForEvent('popup');
  await bookings.getByRole('button', { name: 'Connect Google Calendar' }).click();
  await (await popup).waitForEvent('close');
  await expect(page.getByText('Your calendar is connected.')).toBeVisible();
  await expect(bookings.getByText('Connected to owner@example.com')).toBeVisible();
  await bookings.getByLabel('Add appointments to').click();
  await page.getByRole('option', { name: 'Team bookings' }).click();
  await expect.poll(() => calendar.calendarId).toBe('team');

  // Nothing to book yet.
  await next(page);
  await expect(bookings.getByRole('alert')).toHaveText(
    'Add at least one thing callers can book, with how long it takes.',
  );
  await bookings
    .getByRole('button', { name: /Start with Haircut \(45 min\), Color \(2 h\), Manicure \(45 min\)/ })
    .click();
  await expect(bookings.getByRole('alert')).toBeHidden();
  const services = bookings.getByRole('list', { name: 'What callers can book' });
  await services.getByRole('listitem').nth(2).getByRole('button', { name: 'Remove' }).click();
  await expect(services.getByRole('listitem')).toHaveCount(2);

  // Saturday mornings too.
  await bookings.getByRole('checkbox', { name: 'Saturday' }).check();
  await bookings.getByLabel('Saturday from').fill('09:00');
  await bookings.getByLabel('Saturday to').fill('13:00');
  await bookings.getByRole('checkbox', { name: 'Monday' }).uncheck();
  await next(page);
  await next(page);

  await expect(page.getByText('Book appointments in your calendar: Haircut, Color')).toBeVisible();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL('/plan');

  const { rows } = await pool.query('SELECT features, booking_settings FROM businesses WHERE owner_id = $1', [user.id]);
  expect(rows[0].features).toEqual(['messages', 'bookings']);
  expect(rows[0].booking_settings).toMatchObject({
    services: [
      { name: 'Haircut', minutes: 45 },
      { name: 'Color', minutes: 120 },
    ],
    hours: {
      tue: [{ from: '09:00', to: '17:00' }],
      fri: [{ from: '09:00', to: '17:00' }],
      sat: [{ from: '09:00', to: '13:00' }],
    },
    bufferMinutes: 0,
    noticeHours: 2,
    horizonDays: 30,
  });
  expect(rows[0].booking_settings.hours.mon).toBeUndefined();
});

test('until the calendar is connected, the dashboard says so', async ({ page, context, signIn }) => {
  await fakeCalendar(context);
  const { user } = await signIn();
  await saveOwnerBusiness(user.id, {
    name: 'Bella Hair',
    description: 'a salon',
    languages: ['en'],
    features: ['bookings'],
    booking_settings: {
      services: [{ name: 'Haircut', minutes: 45 }],
      hours: { mon: [{ from: '09:00', to: '17:00' }] },
    },
  });
  await page.goto('/');
  await expect(page.getByText('→ Haircut')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Connect your calendar to start booking' })).toBeVisible();
});

test('a call where an appointment was booked shows it in the call history', async ({ page, signIn }) => {
  const { user } = await signIn();
  const business = await saveOwnerBusiness(user.id, {
    name: 'Bella Hair',
    description: 'a salon',
    languages: ['en'],
    features: [],
  });
  const startedAt = new Date(Date.now() - 600_000);
  await recordCall({
    businessId: business.id,
    callSid: 'CAbooked',
    caller: '+15125550100',
    startedAt,
    endedAt: new Date(),
  });
  const startsAt = new Date(2026, 10, 12, 10, 0);
  await pool.query(
    `INSERT INTO bookings (business_id, call_sid, service, starts_at, ends_at, caller_name, caller_number, notes, provider, event_id)
     VALUES ($1, 'CAbooked', 'Haircut', $2, $3, 'Jane Doe', '+15125550111', 'Short layers', 'google', 'event-1')`,
    [business.id, startsAt, new Date(startsAt.getTime() + 45 * 60_000)],
  );
  await page.setViewportSize(PHONE);
  await page.goto('/calls');

  const row = page.getByRole('button', { name: /Jane Doe/ });
  await expect(row.getByText('Booked')).toBeVisible();
  await expect(row.getByText(/Haircut, Thursday, November 12 at 10:00 AM/)).toBeVisible();
  await row.click();
  await expect(page.getByRole('link', { name: '+1 512 555 0111' })).toHaveAttribute('href', 'tel:+15125550111');
  await expect(page.getByText('Short layers')).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test('the bookings settings fit a phone', async ({ page, context, signIn }) => {
  await fakeCalendar(context);
  const { user } = await signIn();
  await saveOwnerBusiness(user.id, {
    name: 'Bella Hair',
    description: 'a salon',
    business_type: 'salon',
    languages: ['en'],
    features: ['bookings'],
  });
  await page.setViewportSize(PHONE);
  await page.goto('/setup');
  await next(page);
  await next(page);
  await expect(page.getByRole('button', { name: 'Connect Google Calendar' })).toBeVisible();
  await expectNoSidewaysScroll(page);
});
