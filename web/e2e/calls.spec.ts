// Call history: the Calls page and the dashboard's recent calls.

import { createBusiness, saveOwnerBusiness } from '../../src/shared/businesses.js';
import { pool } from '../../src/shared/db/pool.js';
import { recordCall } from '../../src/shared/usage.js';
import { expect, expectNoSidewaysScroll, PHONE, test } from './fixtures';

const settings = { name: 'Rapid Flow Plumbing', description: 'a plumber', languages: ['en'], features: [] };
let calls = 0;

// A call `hoursAgo` hours ago that lasted `seconds`.
const call = (businessId: string, hoursAgo: number, extra: Record<string, unknown> = {}, seconds = 151) => {
  const startedAt = new Date(Date.now() - hoursAgo * 3_600_000);
  return recordCall({
    businessId,
    callSid: `CAe2e${++calls}`,
    caller: '+15125550100',
    startedAt,
    endedAt: new Date(startedAt.getTime() + seconds * 1000),
    ...extra,
  });
};

async function ownerBusiness(signIn: () => Promise<{ user: { id: string } }>) {
  const { user } = await signIn();
  return (await saveOwnerBusiness(user.id, settings)).id as string;
}

test('with no calls yet, the page says so', async ({ page, signIn }) => {
  await ownerBusiness(signIn);
  await page.goto('/calls');
  await expect(page.getByText('No calls yet')).toBeVisible();
});

test('calls are listed by day, and a message opens to show who to call back', async ({ page, signIn }) => {
  const id = await ownerBusiness(signIn);
  await call(id, 50, {}, 45);
  await call(id, 1, { transferred: true });
  await call(id, 0.5, {
    message: {
      caller_name: 'Jane Doe',
      callback_number: '+15125550111',
      message: 'Burst pipe in the kitchen',
      urgent: true,
    },
  });
  await page.goto('/calls');

  const today = page.getByRole('region', { name: 'Today' });
  await expect(today.getByRole('listitem')).toHaveCount(2);
  await expect(today.getByText('Jane Doe')).toBeVisible();
  await expect(today.getByText('Urgent')).toBeVisible();
  await expect(today.getByText('Transferred')).toBeVisible();
  await expect(today.getByText(/· 2 min 31 s/).first()).toBeVisible();
  await expect(page.getByText(/· 45 s/)).toBeVisible();

  const message = today.getByRole('button', { name: /Jane Doe/ });
  await expect(message).toHaveAttribute('aria-expanded', 'false');
  await message.click();
  await expect(message).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('link', { name: '+1 (512) 555-0111' })).toHaveAttribute('href', 'tel:+15125550111');
  await expect(page.getByText('Burst pipe in the kitchen', { exact: true })).toBeVisible();
});

test('older calls load on request', async ({ page, signIn }) => {
  const id = await ownerBusiness(signIn);
  for (let i = 0; i < 55; i++) await call(id, i * 0.1);
  await page.goto('/calls');
  await expect(page.getByRole('listitem')).toHaveCount(50);
  await page.getByRole('button', { name: 'Show older calls' }).click();
  await expect(page.getByRole('listitem')).toHaveCount(55);
  await expect(page.getByRole('button', { name: 'Show older calls' })).toBeHidden();
});

test('the dashboard shows the latest calls, with a link to all of them', async ({ page, signIn }) => {
  const id = await ownerBusiness(signIn);
  await page.goto('/');
  await expect(page.getByText('No calls yet. They show up here once your receptionist answers them.')).toBeVisible();
  for (let i = 0; i < 7; i++) await call(id, i);
  await page.reload();
  const recent = page.getByText('Recent calls').locator('xpath=ancestor::*[@data-slot="card"]');
  await expect(recent.getByRole('listitem')).toHaveCount(5);
  await recent.getByRole('link', { name: 'View all' }).click();
  await expect(page).toHaveURL('/calls');
  await expect(page.getByRole('listitem')).toHaveCount(7);
});

test('the Calls page fits a phone and is in the tab bar', async ({ page, signIn }) => {
  const id = await ownerBusiness(signIn);
  await call(id, 1, {
    message: {
      caller_name: 'A caller with quite a long name',
      callback_number: '+15125550111',
      message: 'x'.repeat(200),
      urgent: false,
    },
  });
  await page.setViewportSize(PHONE);
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Main' })
    .locator('visible=true')
    .getByRole('link', { name: 'Calls' })
    .click();
  await expect(page).toHaveURL('/calls');
  await page.getByRole('button', { name: /A caller with quite a long name/ }).click();
  await expectNoSidewaysScroll(page);
});

test('after a plan ends, the dashboard says until when the number is kept', async ({ page, signIn }) => {
  const id = await ownerBusiness(signIn);
  await pool.query(
    `UPDATE businesses SET plan = 'pro', subscription_status = 'canceled', twilio_number = '+15125550199',
       twilio_number_sid = 'PN0001', subscription_ended_at = '2026-12-06T12:00:00Z' WHERE id = $1`,
    [id],
  );
  await page.goto('/');
  await expect(
    page.getByText(
      'Your number +1 (512) 555-0199 is kept until December 13, 2026; choose a plan before then to keep it.',
    ),
  ).toBeVisible();
});

test('the admin site shows a released number', async ({ page }) => {
  const { id } = await createBusiness({ slug: 'ended', name: 'Ended Plumbing', description: 'a plumber' });
  await pool.query(
    "INSERT INTO phone_number_orders (business_id, status, phone_number, released_at) VALUES ($1, 'released', '+15125550199', now())",
    [id],
  );
  await page.goto(`/admin/businesses/${id}`);
  await expect(page.getByText('Released +15125550199 after the plan ended.')).toBeVisible();
});
