// The owner's setup wizard (/setup).

import type { Page } from '@playwright/test';
import { pool } from '../../src/shared/db/pool.js';
import { expect, expectNoSidewaysScroll, PHONE, test } from './fixtures';

const next = (page: Page) => page.getByRole('button', { name: 'Next' }).click();
const businessesOf = async (ownerId: string) =>
  (await pool.query('SELECT * FROM businesses WHERE owner_id = $1', [ownerId])).rows;

// Fills in the first step and moves on.
async function fillBusinessStep(page: Page) {
  await page.getByLabel('Business name').fill('Rapid Flow Plumbing');
  await page.getByLabel('What does your business do?').fill('a family-owned plumbing company in Austin');
  await page.getByLabel('Opening hours').fill('Monday to Friday 8am to 6pm');
  await next(page);
}

test('a new owner sets up their receptionist', async ({ page, signIn }) => {
  const { user } = await signIn();
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Set up your receptionist' })).toBeVisible();

  await fillBusinessStep(page);
  await page.getByLabel('Spanish').check();
  await next(page);

  await page.getByLabel('Text messages to').fill('+1 (512) 555-0100');
  await page.getByLabel('Transfer callers to a person').check();
  await page.getByLabel('Transfer callers to', { exact: true }).fill('+15125550199');
  await page.getByLabel('Mark a message urgent if…').fill('there is flooding');
  await next(page);

  await page.getByLabel('What do callers often ask?').fill('We serve all of Austin.\n\nA call-out costs $89.\n');
  await next(page);

  // Review: the greeting comes from the same code as a real call.
  await expect(page.getByText('“Thanks for calling Rapid Flow Plumbing. How can I help you today?”')).toBeVisible();
  await expect(page.getByText('“Si prefiere español, puede hablar en español.”')).toBeVisible();
  await expect(page.getByText('Take messages for the staff, sent to +15125550100 by text')).toBeVisible();
  await expect(page.getByText('Transfer callers to a person at +15125550199')).toBeVisible();
  await expect(page.getByText('A call-out costs $89.')).toBeVisible();

  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL('/plan');
  await expect(page.getByText('Your receptionist is set up. Choose a plan to go live.')).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Choose a plan to go live')).toBeVisible();

  const [business, ...others] = await businessesOf(user.id);
  expect(others).toEqual([]);
  expect(business).toMatchObject({
    name: 'Rapid Flow Plumbing',
    slug: 'rapid-flow-plumbing',
    hours: 'Monday to Friday 8am to 6pm',
    languages: ['en', 'es'],
    features: ['messages', 'transfers'],
    notify_sms: '+15125550100',
    transfer_number: '+15125550199',
    urgent_when: 'there is flooding',
    faq: ['We serve all of Austin.', 'A call-out costs $89.'],
    twilio_number: null,
    requires_subscription: true,
  });
});

test('each step says what is missing, and the message goes once it is fixed', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/setup');
  await next(page);
  await expect(page.getByText('Enter the business name.')).toBeVisible();
  await expect(page.getByText('Describe the business in a few words.')).toBeVisible();
  await page.getByLabel('Business name').fill('Rapid Flow Plumbing');
  await expect(page.getByText('Enter the business name.')).toBeHidden();

  await page.getByLabel('What does your business do?').fill('a plumber');
  await next(page);
  await next(page);
  await next(page);
  await expect(page.getByText('Enter a number to send messages to, by SMS or WhatsApp.')).toBeVisible();
  await page.getByLabel('WhatsApp messages to').fill('+40700000000');
  await expect(page.getByText('Enter a number to send messages to, by SMS or WhatsApp.')).toBeHidden();

  await page.getByLabel('Transfer callers to a person').check();
  await page.getByLabel('Transfer callers to', { exact: true }).fill('12345');
  await next(page);
  await expect(page.getByText('Use international format, e.g. +18005550100.')).toBeVisible();
  await page.getByLabel('Transfer callers to', { exact: true }).fill('+15125550199');
  await expect(page.getByText('Use international format, e.g. +18005550100.')).toBeHidden();
  await next(page);
  await expect(page.getByLabel('What do callers often ask?')).toBeVisible();
});

test('the step bar and Edit buttons move between steps', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/setup');
  // Steps not reached yet can't be opened.
  await expect(page.getByRole('button', { name: 'Review' })).toBeDisabled();
  await fillBusinessStep(page);
  await next(page);
  await page.getByLabel('WhatsApp messages to').fill('+40700000000');
  await page.getByRole('button', { name: 'Your business' }).click();
  await expect(page.getByLabel('Business name')).toHaveValue('Rapid Flow Plumbing');
  await next(page);
  await next(page);
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Edit' }).nth(1).click();
  await expect(page.getByText('Main language')).toBeVisible();
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Callers will hear')).toBeVisible();
});

test('Edit settings changes the same business', async ({ page, signIn }) => {
  const { user } = await signIn();
  await page.goto('/setup');
  await fillBusinessStep(page);
  await next(page);
  await page.getByLabel('Text messages to').fill('+15125550100');
  await next(page);
  await next(page);
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL('/plan');

  await page.goto('/');
  await page.getByRole('link', { name: 'Edit settings' }).click();
  await expect(page.getByRole('heading', { name: 'Your receptionist' })).toBeVisible();
  await expect(page.getByLabel('Business name')).toHaveValue('Rapid Flow Plumbing');
  await page.getByLabel('Opening hours').fill('Every day 7am to 9pm');
  // Every step can be opened straight away when editing.
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your changes are saved.')).toBeVisible();

  const businesses = await businessesOf(user.id);
  expect(businesses).toHaveLength(1);
  expect(businesses[0]).toMatchObject({ slug: 'rapid-flow-plumbing', hours: 'Every day 7am to 9pm' });
});

test('leaving with unsaved answers asks first', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/');
  await page.getByRole('link', { name: 'Get started' }).click();
  await page.getByLabel('Business name').fill('Rapid Flow Plumbing');
  const asked = new Promise<string>((resolve) =>
    page.once('dialog', (dialog) => {
      resolve(dialog.message());
      return dialog.dismiss();
    }),
  );
  await page.goBack();
  expect(await asked).toBe('Discard your changes?');
  await expect(page).toHaveURL('/setup');
  await expect(page.getByLabel('Business name')).toHaveValue('Rapid Flow Plumbing');
});

test('the wizard fits a phone', async ({ page, signIn }) => {
  await signIn();
  await page.setViewportSize(PHONE);
  await page.goto('/setup');
  await expect(page.getByText('Step 1 of 5: Your business')).toBeVisible();
  await expectNoSidewaysScroll(page);
});
