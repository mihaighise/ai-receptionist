// Plans and billing in the owner app. Paying happens on Stripe's own pages, which these tests don't
// visit; the plan states are set in the test database, as Stripe's webhooks would set them.

import { saveOwnerBusiness } from '../../src/shared/businesses.js';
import { pool } from '../../src/shared/db/pool.js';
import { addTopUp, recordCall } from '../../src/shared/usage.js';
import { expect, expectNoSidewaysScroll, PHONE, test } from './fixtures';

const settings = { name: 'Rapid Flow Plumbing', description: 'a plumber', languages: ['en'], features: [] };

// A signed-in owner with a set-up business, its Twilio number and (optionally) a subscription.
async function ownerWithBusiness(
  signIn: () => Promise<{ user: { id: string } }>,
  subscription: Record<string, unknown> = {},
): Promise<string> {
  const { user } = await signIn();
  const { id } = await saveOwnerBusiness(user.id, settings);
  const values = { twilio_number: '+18312490526', ...subscription };
  const columns = Object.keys(values);
  await pool.query(`UPDATE businesses SET ${columns.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`, [
    id,
    ...Object.values(values),
  ]);
  return id;
}

// On Starter (200 minutes a month), in a billing month that started yesterday.
const starter = () => {
  const start = new Date(Date.now() - 86_400_000);
  return {
    plan: 'starter',
    subscription_status: 'active',
    stripe_customer_id: 'cus_test',
    subscription_period_start: start,
    subscription_period_end: new Date(start.getTime() + 30 * 86_400_000),
  };
};

// A call of this many minutes, an hour ago.
let calls = 0;
const callOf = (businessId: string, minutes: number) => {
  const startedAt = new Date(Date.now() - 3_600_000);
  return recordCall({
    businessId,
    callSid: `CAtest${++calls}`,
    caller: null,
    startedAt,
    endedAt: new Date(startedAt.getTime() + minutes * 60_000),
  });
};

test('a business without a plan asks for one, and the plan page lists them', async ({ page, signIn }) => {
  await ownerWithBusiness(signIn);
  await page.goto('/');
  await expect(page.getByText('Choose a plan to go live')).toBeVisible();
  // The checklist's button (the plan card has one too).
  await page.getByRole('link', { name: 'See plans' }).first().click();
  await expect(page).toHaveURL('/plan');
  for (const [name, price, minutes] of [
    ['Starter', '$79', '200 call minutes a month'],
    ['Pro', '$179', '600 call minutes a month'],
    ['Business', '$349', '1,500 call minutes a month'],
  ]) {
    const option = page.locator('label').filter({ has: page.getByRole('radio', { name: new RegExp(`^${name}`) }) });
    await expect(option.getByText(price)).toBeVisible();
    await expect(option.getByText(minutes)).toBeVisible();
  }
  await expect(page.getByText('Most popular')).toBeVisible();
});

test('clicking a plan selects it, and the button pays for the selected plan', async ({ page, signIn }) => {
  await ownerWithBusiness(signIn);
  await page.goto('/plan');
  // Pro is selected to start with.
  await expect(page.getByRole('radio', { name: /^Pro/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Continue with Pro' })).toBeVisible();

  await page.getByText('1,500 call minutes a month').click();
  await expect(page.getByRole('radio', { name: /^Business/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Pro/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Continue with Business' })).toBeVisible();
  await expect(page.getByText('$349 a month, paid on the next page')).toBeVisible();

  // The arrow keys move between plans, like any radio buttons.
  await page.getByRole('radio', { name: /^Business/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: /^Pro/ })).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: /^Starter/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Continue with Starter' })).toBeVisible();
});

test('choosing a plan explains when billing is not set up', async ({ page, signIn }) => {
  // The test servers have no Stripe keys.
  await ownerWithBusiness(signIn);
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Continue with Pro' }).click();
  await expect(page.getByText('Billing is not set up yet.')).toBeVisible();
  await expect(page).toHaveURL('/plan');
});

test('a paid plan shows when it renews, and the receptionist answers calls', async ({ page, signIn }) => {
  await ownerWithBusiness(signIn, {
    plan: 'pro',
    subscription_status: 'active',
    stripe_customer_id: 'cus_test',
    subscription_period_end: '2026-12-06T12:00:00Z',
  });
  await page.goto('/');
  await expect(page.getByText('Answering calls', { exact: true })).toBeVisible();
  await expect(page.getByText('Renews on December 6, 2026')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage billing' })).toBeVisible();
  // Paying owners see their plan and minutes instead of the plans to choose from.
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Plan & billing' })).toBeVisible();
  await expect(page.getByText('Current plan')).toBeVisible();
  await expect(page.getByText('600 call minutes a month')).toBeVisible();
});

test('a failed payment and a cancelled plan are explained', async ({ page, signIn }) => {
  await ownerWithBusiness(signIn, {
    plan: 'starter',
    subscription_status: 'past_due',
    stripe_customer_id: 'cus_test',
    subscription_period_end: '2026-12-06T12:00:00Z',
  });
  await page.goto('/');
  await expect(page.getByText("Your last payment didn't go through.")).toBeVisible();
  // Still answering while Stripe retries the payment.
  await expect(page.getByText('Answering calls', { exact: true })).toBeVisible();

  await pool.query("UPDATE businesses SET subscription_status = 'canceled'");
  await page.reload();
  await expect(page.getByText('Your plan has ended', { exact: true })).toBeVisible();
  await expect(page.getByText('Choose a plan to go live')).toBeVisible();
});

test('a plan set to cancel shows when it ends', async ({ page, signIn }) => {
  await ownerWithBusiness(signIn, {
    plan: 'business',
    subscription_status: 'active',
    stripe_customer_id: 'cus_test',
    subscription_period_end: '2026-12-06T12:00:00Z',
    subscription_cancels: true,
  });
  await page.goto('/');
  await expect(page.getByText('Ends on December 6, 2026')).toBeVisible();
});

test('the plan page fits a phone', async ({ page, signIn }) => {
  await ownerWithBusiness(signIn);
  await page.setViewportSize(PHONE);
  await page.goto('/plan');
  await expect(page.getByRole('button', { name: 'Continue with Pro' })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("the dashboard and plan page show this month's minutes", async ({ page, signIn }) => {
  const id = await ownerWithBusiness(signIn, starter());
  await callOf(id, 42);
  await addTopUp(id, 100, 'cs_e2e');
  await page.goto('/');
  const minutes = page.getByRole('heading', { name: 'Minutes this month' }).locator('..').locator('..');
  await expect(minutes.getByText('of 200 minutes used')).toBeVisible();
  await expect(minutes.getByText('158 minutes left this month')).toBeVisible();
  await expect(minutes.getByText('+ 100 minutes extra')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Plan minutes used this month' })).toBeVisible();
  await page.goto('/plan');
  await expect(page.getByText('of 200 minutes used')).toBeVisible();
});

test('the dashboard warns when most minutes are used', async ({ page, signIn }) => {
  const id = await ownerWithBusiness(signIn, starter());
  await callOf(id, 170);
  await page.goto('/');
  await expect(page.getByText("You've used most of this month's minutes.")).toBeVisible();
});

test('out of minutes: the dashboard says calls are not answered and offers more', async ({ page, signIn }) => {
  const id = await ownerWithBusiness(signIn, starter());
  await callOf(id, 200);
  await page.goto('/');
  await expect(page.getByText('Out of minutes')).toBeVisible();
  await page.getByRole('link', { name: 'Buy extra minutes' }).click();
  await expect(page).toHaveURL('/plan');
  await expect(page.getByText("You've used all your minutes, so new calls aren't being answered.")).toBeVisible();
});

test('the extra minutes slider sets how many to buy and what it costs', async ({ page, signIn }) => {
  await ownerWithBusiness(signIn, starter());
  await page.goto('/plan');
  const buy = (label: string) => page.getByRole('button', { name: label });
  await expect(buy('Buy 200 minutes for $90')).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Extra minutes' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(buy('Buy 250 minutes for $112.50')).toBeVisible();
  await page.keyboard.press('End');
  await expect(buy('Buy 2,000 minutes for $900')).toBeVisible();
  await page.keyboard.press('Home');
  await expect(buy('Buy 50 minutes for $22.50')).toBeVisible();
  // The test servers have no Stripe keys.
  await buy('Buy 50 minutes for $22.50').click();
  await expect(page.getByText('Billing is not set up yet.')).toBeVisible();
});

test('the plan page fits a phone for paying owners too', async ({ page, signIn }) => {
  await ownerWithBusiness(signIn, starter());
  await page.setViewportSize(PHONE);
  await page.goto('/plan');
  await expect(page.getByRole('slider', { name: 'Extra minutes' })).toBeVisible();
  await expectNoSidewaysScroll(page);
});
