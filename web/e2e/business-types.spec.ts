// Business types: picking one in the setup's first step starts the owner from that type's template.

import { pool } from '../../src/shared/db/pool.js';
import { expect, test } from './fixtures';

test('a restaurant starts with messages on, restaurant examples, and restaurant ideas', async ({ page, signIn }) => {
  const { user } = await signIn();
  await page.goto('/setup');
  await page.getByText('Restaurant or café', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Restaurant or café/ })).toBeChecked();
  await expect(page.getByLabel('What does your business do?')).toHaveAttribute(
    'placeholder',
    /Italian restaurant in Miami/,
  );
  await page.getByLabel('Business name').fill('Luigi’s Pizzeria');
  await page.getByLabel('What does your business do?').fill('a family pizzeria in Miami');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  // Messages on, transfers off, with a restaurant's example for urgent messages.
  await expect(page.getByLabel('Take messages for the staff')).toBeChecked();
  await expect(page.getByLabel('Transfer callers to a person')).not.toBeChecked();
  await expect(page.getByLabel('Mark a message urgent if…')).toHaveAttribute('placeholder', /large group/);
  await page.getByLabel('Text messages to').fill('+13055550100');
  await page.getByRole('button', { name: 'Next' }).click();

  // Ideas: tapping one adds it, and it's no longer offered.
  const idea = 'We have vegetarian, vegan and gluten-free options.';
  await page.getByRole('list', { name: 'Ideas' }).getByRole('button', { name: idea }).click();
  await expect(page.getByLabel('What do callers often ask?')).toHaveValue(idea);
  await expect(page.getByRole('list', { name: 'Ideas' }).getByRole('button', { name: idea })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Restaurant or café')).toBeVisible();
  await expect(page.getByText('Take messages for the staff, sent to +1 305 555 0100 by text')).toBeVisible();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL('/plan');
  const { rows } = await pool.query('SELECT business_type, features, faq FROM businesses WHERE owner_id = $1', [
    user.id,
  ]);
  expect(rows).toEqual([{ business_type: 'restaurant', features: ['messages'], faq: [idea] }]);
});

test('home services start with transfers on too', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/setup');
  await page.getByText('Home services', { exact: true }).click();
  await page.getByLabel('Business name').fill('Rapid Flow Plumbing');
  await page.getByLabel('What does your business do?').fill('a plumber');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('Transfer callers to a person')).toBeChecked();
  await expect(page.getByLabel('Transfer callers to', { exact: true })).toBeVisible();
});

test("changing the type while editing keeps the owner's skills", async ({ page, signIn }) => {
  const { user } = await signIn();
  await page.goto('/setup');
  await page.getByText('Home services', { exact: true }).click();
  await page.getByLabel('Business name').fill('Rapid Flow Plumbing');
  await page.getByLabel('What does your business do?').fill('a plumber');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Transfer callers to a person').uncheck();
  await page.getByLabel('Text messages to').fill('+15125550100');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish setup' }).click();
  await expect(page).toHaveURL('/plan');

  await page.goto('/setup');
  await page.getByText('Dental or medical office', { exact: true }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Your changes are saved.')).toBeVisible();
  const { rows } = await pool.query('SELECT business_type, features FROM businesses WHERE owner_id = $1', [user.id]);
  expect(rows).toEqual([{ business_type: 'clinic', features: ['messages'] }]);
});
