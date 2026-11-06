// The admin site (/admin): adding, editing, previewing and deleting businesses, and linking owners.

import { createBusiness } from '../../src/shared/businesses.js';
import { pool } from '../../src/shared/db/pool.js';
import { expect, expectNoSidewaysScroll, PHONE, test } from './fixtures';

const sunriseDental = {
  slug: 'sunrise-dental',
  name: 'Sunrise Dental',
  description: 'a family dental clinic',
  twilio_number: '+18312490526',
};

test('adding a business: field errors, a number already in use, preview and save', async ({ page }) => {
  await createBusiness(sunriseDental);
  await page.goto('/admin');
  await page.getByRole('link', { name: 'New' }).click();
  await page.getByLabel('Name').fill('Test Electric & Co');
  await expect(page.getByLabel('Slug')).toHaveValue('test-electric-co');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Describe the business in a few words.')).toBeVisible();

  await page.getByLabel('Description').fill('an electrician fixing wiring and panels');
  await page.getByLabel('Twilio number').fill('+1 (831) 249-0526');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Another business already uses this Twilio number.')).toBeVisible();

  await page.getByLabel('Twilio number').fill('');
  await page.getByRole('combobox', { name: 'Main language' }).click();
  await page.getByRole('option', { name: 'Spanish' }).click();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Gracias por llamar a Test Electric & Co' })).toBeVisible();
  await expect(page.getByText(/^You are the phone receptionist for Test Electric & Co/)).toBeVisible();

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/admin\/businesses\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Saved Test Electric & Co')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Businesses' }).getByText('Test Electric & Co')).toBeVisible();
});

test('unsaved changes are guarded, then saved', async ({ page }) => {
  const { id } = await createBusiness(sunriseDental);
  await createBusiness({ slug: 'bella-hair', name: 'Bella Hair Studio', description: 'a hair salon' });
  await page.goto(`/admin/businesses/${id}`);
  await page.getByLabel('Hours').fill('Monday to Friday');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  const asked = new Promise<string>((resolve) =>
    page.once('dialog', (dialog) => {
      resolve(dialog.message());
      return dialog.dismiss();
    }),
  );
  await page.getByRole('navigation', { name: 'Businesses' }).getByText('Bella Hair Studio').click();
  expect(await asked).toBe('Discard unsaved changes?');
  await expect(page).toHaveURL(`/admin/businesses/${id}`);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved Sunrise Dental')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toBeHidden();
});

test('deleting asks first, then returns to the list', async ({ page }) => {
  const { id } = await createBusiness(sunriseDental);
  await page.goto(`/admin/businesses/${id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL('/admin');
  await expect(page.getByText('Deleted Sunrise Dental')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Businesses' }).getByText('Sunrise Dental')).toHaveCount(0);
});

test('a business is linked to an owner by email, once they have signed in', async ({ page, signIn }) => {
  const { id } = await createBusiness(sunriseDental);
  await page.goto(`/admin/businesses/${id}`);
  await page.getByLabel("Owner's email").fill('owner@example.com');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('No one has signed in with this email yet.')).toBeVisible();

  await signIn();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved Sunrise Dental')).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Sunrise Dental')).toBeVisible();
  await expect(page.getByText('Answering calls')).toBeVisible();
});

test('the admin site fits a phone', async ({ page }) => {
  await createBusiness(sunriseDental);
  await page.setViewportSize(PHONE);
  await page.goto('/admin');
  await page.getByRole('link', { name: /Sunrise Dental/ }).click();
  await expect(page.getByRole('link', { name: 'All businesses' })).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test('a business shows its latest automatic number order', async ({ page }) => {
  const { id } = await createBusiness({ ...sunriseDental, twilio_number: null });
  await page.goto(`/admin/businesses/${id}`);
  await expect(page.getByText('Automatic number')).toBeHidden();

  await pool.query("INSERT INTO phone_number_orders (business_id, status, area_code) VALUES ($1, 'dry_run', '512')", [
    id,
  ]);
  await page.reload();
  await expect(
    page.getByText('Dry run: would have bought a number in area code 512. Nothing was bought.'),
  ).toBeVisible();

  await pool.query(
    "INSERT INTO phone_number_orders (business_id, status, error, created_at) VALUES ($1, 'failed', 'Insufficient funds', now() + interval '1 minute')",
    [id],
  );
  await page.reload();
  await expect(page.getByText('Could not buy a number: Insufficient funds.')).toBeVisible();
});
