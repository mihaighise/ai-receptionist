// Phone numbers: a country picker plus a number box that adds spaces as you type, and every number
// shown as "+<country code> <number with spaces>".

import type { Page } from '@playwright/test';
import { pool } from '../../src/shared/db/pool.js';
import { expect, test } from './fixtures';

// Goes to the "What it does" step of a new setup, with messages on.
async function openActionsStep(page: Page) {
  await page.goto('/setup');
  await page.getByText('Something else', { exact: true }).click();
  await page.getByLabel('Business name').fill('Rapid Flow Plumbing');
  await page.getByLabel('What does your business do?').fill('a plumber');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('Text messages to')).toBeVisible();
}

test('typing a number adds spaces, after the country code', async ({ page, signIn }) => {
  await signIn();
  await openActionsStep(page);
  const sms = page.getByLabel('Text messages to');
  const country = page.getByRole('combobox', { name: 'Country' }).first();
  await expect(country).toHaveValue('US');
  await expect(sms).toHaveAttribute('placeholder', '201 555 0123');
  await sms.pressSequentially('5125550100');
  await expect(sms).toHaveValue('512 555 0100');

  // Another country: the same digits are formatted its way, and its example changes.
  await country.selectOption('RO');
  await expect(sms).toHaveAttribute('placeholder', '712 034 567');
  await sms.fill('0712 345 678');
  await expect(sms).toHaveValue('712 345 678');
});

test('pasting a full international number picks its country', async ({ page, signIn }) => {
  await signIn();
  await openActionsStep(page);
  await page.getByLabel('Text messages to').fill('+44 20 7946 0958');
  await expect(page.getByRole('combobox', { name: 'Country' }).first()).toHaveValue('GB');
  await expect(page.getByLabel('Text messages to')).toHaveValue('20 7946 0958');
});

test('numbers are saved in compact form and shown with spaces everywhere', async ({ page, signIn }) => {
  const { user } = await signIn();
  await openActionsStep(page);
  await page.getByLabel('Text messages to').fill('512 555 0100');
  await page.getByLabel('WhatsApp messages to').fill('+40 712 345 678');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('sent to +1 512 555 0100 by text and +40 712 345 678 on WhatsApp')).toBeVisible();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL('/plan');

  const { rows } = await pool.query('SELECT notify_sms, notify_whatsapp FROM businesses WHERE owner_id = $1', [
    user.id,
  ]);
  expect(rows).toEqual([{ notify_sms: '+15125550100', notify_whatsapp: '+40712345678' }]);

  // Editing: the saved numbers open in their country, with spaces.
  await page.goto('/setup');
  await page.getByRole('button', { name: 'What it does' }).click();
  await expect(page.getByLabel('Text messages to')).toHaveValue('512 555 0100');
  await expect(page.getByLabel('WhatsApp messages to')).toHaveValue('712 345 678');
  await expect(page.getByRole('combobox', { name: 'Country' }).nth(1)).toHaveValue('RO');

  await page.goto('/');
  await expect(page.getByText('+1 512 555 0100 by text, +40 712 345 678 on WhatsApp')).toBeVisible();
});
