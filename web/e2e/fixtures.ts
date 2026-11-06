// What every browser test starts with: an empty test database, a way to sign in as an owner, and
// a check that the page logged no errors.

import { test as base, expect, type Page } from '@playwright/test';
import { pool } from '../../src/shared/db/pool.js';
import { emptyTestDatabase } from '../../test/support/database.js';
import { signedInOwner } from '../../test/support/owners.js';

type Owner = Awaited<ReturnType<typeof signedInOwner>>;

export const test = base.extend<
  { signIn: (owner?: { email?: string; name?: string }) => Promise<Owner> },
  { database: undefined }
>({
  // Closes the database connections when the worker finishes.
  database: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern, so it must be an object.
    async ({}, use) => {
      await use(undefined);
      await pool.end();
    },
    { scope: 'worker', auto: true },
  ],
  page: async ({ page }, use) => {
    await emptyTestDatabase();
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    // Error responses the tests ask for (a 400 for a duplicate number) are checked by the tests.
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) errors.push(msg.text());
    });
    await use(page);
    expect(errors, 'errors logged by the page').toEqual([]);
  },
  // Creates an owner and gives the browser their session, as if they had signed in with Google.
  signIn: async ({ context }, use) => {
    await use(async (owner) => {
      const signedIn = await signedInOwner(owner);
      await context.addCookies(signedIn.cookies);
      return signedIn;
    });
  },
});

export { expect };

// Fails if the page scrolls sideways, e.g. at phone width.
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'pixels the page is wider than the window').toBeLessThanOrEqual(0);
}

export const PHONE = { width: 390, height: 844 };
