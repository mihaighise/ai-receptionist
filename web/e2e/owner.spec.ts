// Owner sign-in and the dashboard.

import { createBusiness } from '../../src/shared/businesses.js';
import { expect, expectNoSidewaysScroll, PHONE, test } from './fixtures';

test('signed-out visitors are sent to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/sign-in');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
});

test('Continue with Google goes to Google, which sends the owner back to this app', async ({ page }) => {
  // Stopped on the way, so nothing reaches Google.
  const google = new Promise<URL>((resolve) =>
    page.route('https://accounts.google.com/**', (route) => {
      resolve(new URL(route.request().url()));
      return route.abort();
    }),
  );
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  const url = await google;
  expect(url.searchParams.get('client_id')).toBe('test-google-client-id');
  expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5199/api/auth/callback/google');
});

test('a cancelled sign-in is explained', async ({ page }) => {
  await page.goto('/sign-in?error=access_denied');
  await expect(page.getByText('Sign-in was cancelled.')).toBeVisible();
});

test('a signed-in owner without a business is offered setup', async ({ page, signIn }) => {
  await signIn({ name: 'Maria Lopez' });
  await page.goto('/sign-in');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening), Maria$/ })).toBeVisible();
  // Who's signed in is in the account menu.
  await page.getByRole('button', { name: 'Account' }).locator('visible=true').click();
  await expect(page.getByRole('menu').getByText('owner@example.com')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL('/setup');
});

test('the dashboard shows the owner’s receptionist', async ({ page, signIn }) => {
  const { user } = await signIn();
  await createBusiness({
    slug: 'rapid-flow',
    name: 'Rapid Flow Plumbing',
    description: 'a plumber',
    twilio_number: '+18312490526',
    languages: ['en', 'es'],
    owner_id: user.id,
  });
  await page.goto('/');
  await expect(page.getByText('Rapid Flow Plumbing')).toBeVisible();
  await expect(page.getByText('Answering calls')).toBeVisible();
  await expect(page.getByText('+1 (831) 249-0526', { exact: true })).toBeVisible();
  await expect(page.getByText('English and Spanish')).toBeVisible();
});

test('signing out closes the dashboard', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/');
  await page.getByRole('button', { name: 'Account' }).locator('visible=true').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/sign-in');
  await page.goto('/');
  await expect(page).toHaveURL('/sign-in');
});

test('the sign-in page fits a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expectNoSidewaysScroll(page);
});
