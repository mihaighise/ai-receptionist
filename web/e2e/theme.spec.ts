// Light, dark and system themes, and the owner app's navigation on computers and phones.

import { saveOwnerBusiness } from '../../src/shared/businesses.js';
import { expect, PHONE, test } from './fixtures';

const isDark = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'));

test('the theme follows the device until the owner picks one', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/sign-in');
  expect(await isDark(page)).toBe(true);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => isDark(page)).toBe(false);
});

test('a chosen theme is kept after reloading, and System goes back to the device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/sign-in');
  await page.getByRole('radio', { name: 'Dark' }).click();
  expect(await isDark(page)).toBe(true);
  await page.reload();
  expect(await isDark(page)).toBe(true);
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

  // Light stays light even on a dark device.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('radio', { name: 'Light' }).click();
  expect(await isDark(page)).toBe(false);
  await page.getByRole('radio', { name: 'System' }).click();
  expect(await isDark(page)).toBe(true);
});

test('the saved theme applies before the app loads, so dark mode never flashes white', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('radio', { name: 'Dark' }).click();
  // Without the app's code, only index.html's own script can set the theme.
  await page.route('**/src/main.tsx', (route) => route.abort());
  await page.reload();
  expect(await isDark(page)).toBe(true);
});

test('signed-in owners change the theme from their account menu', async ({ page, signIn }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await signIn();
  await page.goto('/');
  await page.getByRole('button', { name: 'Account' }).locator('visible=true').click();
  await page.getByRole('menu').getByRole('radio', { name: 'Dark' }).click();
  expect(await isDark(page)).toBe(true);
});

test('the sidebar moves between pages and shows where you are', async ({ page, signIn }) => {
  const { user } = await signIn();
  await saveOwnerBusiness(user.id, {
    name: 'Rapid Flow Plumbing',
    description: 'a plumber',
    languages: ['en'],
    features: [],
  });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' }).locator('visible=true');
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Plan & billing' }).click();
  await expect(page).toHaveURL('/plan');
  await expect(nav.getByRole('link', { name: 'Plan & billing' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Receptionist' }).click();
  await expect(page).toHaveURL('/setup');
});

test('on a phone, a tab bar replaces the sidebar', async ({ page, signIn }) => {
  await signIn();
  await page.setViewportSize(PHONE);
  await page.goto('/');
  const tabs = page.getByRole('navigation', { name: 'Main' }).locator('visible=true');
  await expect(tabs).toHaveCount(1);
  await expect(tabs.getByRole('link')).toHaveText(['Home', 'Receptionist', 'Billing']);
  await tabs.getByRole('link', { name: 'Billing' }).click();
  await expect(page).toHaveURL('/setup'); // no business yet: the plan page sends you to setup first
  await expect(tabs.getByRole('link', { name: 'Receptionist' })).toHaveAttribute('aria-current', 'page');
});
