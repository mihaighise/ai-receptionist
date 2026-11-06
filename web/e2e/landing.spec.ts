// The public landing page (/welcome).

import { expect, expectNoSidewaysScroll, PHONE, test } from './fixtures';

test('the landing page introduces the product and leads to sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Never miss another call.');
  await expect(page.getByText('Oriana Agent answers your phone day and night')).toBeVisible();
  await page.getByRole('link', { name: 'Get started' }).first().click();
  await expect(page).toHaveURL('/sign-in');
});

test('the prices come from the same plans as the app', async ({ page }) => {
  await page.goto('/welcome');
  const pricing = page.locator('#pricing');
  for (const [name, price, minutes] of [
    ['Starter', '$79', '200 call minutes a month'],
    ['Pro', '$179', '600 call minutes a month'],
    ['Business', '$349', '1,500 call minutes a month'],
  ]) {
    await expect(pricing.getByRole('heading', { name })).toBeVisible();
    await expect(pricing.getByText(price, { exact: true })).toBeVisible();
    await expect(pricing.getByText(minutes)).toBeVisible();
  }
  await expect(pricing.getByText('Extra minutes are $0.45 each and never expire.')).toBeVisible();
  await pricing.getByRole('link', { name: 'Choose Pro' }).click();
  await expect(page).toHaveURL('/sign-in');
});

test('the menu jumps to each section, and questions open', async ({ page }) => {
  await page.goto('/welcome');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Questions' }).click();
  await expect(page).toHaveURL('/welcome#faq');
  const question = page.locator('details').filter({ hasText: 'Can I keep my phone number?' });
  await question.locator('summary').click();
  await expect(question.getByText('you forward your existing line to it')).toBeVisible();
});

test('the call sample plays', async ({ page }) => {
  await page.goto('/welcome');
  const sample = page.waitForResponse((res) => res.url().endsWith('/demo-call.wav'));
  await page.getByRole('button', { name: 'Hear a real call' }).click();
  expect((await sample).ok()).toBe(true);
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Hear a real call' })).toBeVisible();
});

test('signed-in owners still get their dashboard at home', async ({ page, signIn }) => {
  await signIn();
  await page.goto('/');
  await expect(page).toHaveURL('/');
  await expect(page.getByText("Let's set up your receptionist")).toBeVisible();
});

test('the landing page fits a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoSidewaysScroll(page);
});
