// Adding a menu from photos on the setup wizard's "Common questions" step. The API's menu routes
// are answered in the browser (page.route), so nothing reaches Claude; the API side is tested in
// test/menu-import.test.js.

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// A real 1x1 PNG, for the browser to open and shrink.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const photo = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });
const LINES = ['Menu (Pizzas): Margherita, tomato, mozzarella, basil, $14.', 'Menu note: Gluten-free bases available.'];

// Goes to the Common questions step of a new setup.
async function openFaqStep(page: Page) {
  await page.goto('/setup');
  await page.getByLabel('Business name').fill('Luigi’s Pizzeria');
  await page.getByLabel('What does your business do?').fill('a family pizzeria in Austin');
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Transfer callers to a person').uncheck();
  await page.getByLabel('Take messages for the staff').uncheck();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByLabel('What do callers often ask?')).toBeVisible();
}

// Answers the menu routes: the upload is "read" after `polls` checks, with this result.
async function fakeMenuApi(
  page: Page,
  result: { status: 'done' | 'failed'; lines?: string[]; error?: string },
  polls = 1,
) {
  const uploads: { photos: { mediaType: string; data: string }[] }[] = [];
  let checks = 0;
  await page.route('**/api/owner/menu-imports', async (route) => {
    uploads.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, json: { id: '00000000-0000-4000-8000-000000000001' } });
  });
  await page.route('**/api/owner/menu-imports/*', async (route) => {
    const status = ++checks > polls ? result.status : 'reading';
    await route.fulfill({
      json: { id: '00000000-0000-4000-8000-000000000001', photos: 1, lines: [], error: null, ...result, status },
    });
  });
  return uploads;
}

test('photos of a menu become lines in the common questions, after what was already written', async ({
  page,
  signIn,
}) => {
  await signIn();
  await openFaqStep(page);
  const uploads = await fakeMenuApi(page, { status: 'done', lines: LINES });
  await page.getByLabel('What do callers often ask?').fill('We deliver within 3 miles.');

  await page.getByLabel('Menu photos to add').setInputFiles([photo('front.png'), photo('back.png')]);
  await expect(page.getByRole('list', { name: 'Menu photos' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove back.png' }).click();
  await expect(page.getByRole('list', { name: 'Menu photos' }).getByRole('listitem')).toHaveCount(1);

  await page.getByRole('button', { name: 'Read photo' }).click();
  await expect(page.getByText('This usually takes under a minute.')).toBeVisible();
  await expect(page.getByText('Added 2 lines from your menu.')).toBeVisible();
  await expect(page.getByLabel('What do callers often ask?')).toHaveValue(
    ['We deliver within 3 miles.', ...LINES].join('\n'),
  );
  await expect(page.getByRole('list', { name: 'Menu photos' })).toBeHidden();

  // The photo was shrunk and turned into a JPEG in the browser before uploading.
  expect(uploads).toHaveLength(1);
  expect(uploads[0].photos).toHaveLength(1);
  expect(uploads[0].photos[0].mediaType).toBe('image/jpeg');
  expect(Buffer.from(uploads[0].photos[0].data, 'base64').subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

  // The lines are saved with the rest of the setup.
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('Margherita, tomato, mozzarella, basil, $14.')).toBeVisible();
});

test('when the photos cannot be read, the owner is told why and can try again', async ({ page, signIn }) => {
  await signIn();
  await openFaqStep(page);
  await fakeMenuApi(page, { status: 'failed', error: 'These photos could not be read. Try other photos.' });
  await page.getByLabel('Menu photos to add').setInputFiles([photo('blurry.png')]);
  await page.getByRole('button', { name: 'Read photo' }).click();
  await expect(page.getByText('These photos could not be read. Try other photos.')).toBeVisible();
  await expect(page.getByLabel('What do callers often ask?')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Read photo' })).toBeEnabled();
});

test('at most five photos at a time', async ({ page, signIn }) => {
  await signIn();
  await openFaqStep(page);
  await page.getByLabel('Menu photos to add').setInputFiles(Array.from({ length: 7 }, (_, i) => photo(`page${i}.png`)));
  await expect(page.getByText('Add up to 5 photos at a time.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Menu photos' }).getByRole('listitem')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Add more photos' })).toBeDisabled();
});

test("a file the browser can't open as an image is refused before uploading", async ({ page, signIn }) => {
  await signIn();
  await openFaqStep(page);
  const uploads = await fakeMenuApi(page, { status: 'done', lines: LINES });
  await page
    .getByLabel('Menu photos to add')
    .setInputFiles([{ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') }]);
  await page.getByRole('button', { name: 'Read photo' }).click();
  await expect(page.getByText("broken.png couldn't be opened. Try a JPEG or PNG photo.")).toBeVisible();
  expect(uploads).toHaveLength(0);
});
