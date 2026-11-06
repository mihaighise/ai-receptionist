// Reading menus from photos (src/api/menu-import.js and its owner routes), with a fake Claude
// client, against the test database. Nothing reaches Anthropic.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import Anthropic from '@anthropic-ai/sdk';
import { createMenuImports, failInterruptedImports, LIMITS, menuLines } from '../src/api/menu-import.js';
import { pool } from '../src/shared/db/pool.js';
import { startApi } from './support/api.js';
import { emptyTestDatabase, setUpTestDatabase } from './support/database.js';
import { fakeClaude } from './support/fake-claude.js';
import { signedInOwner } from './support/owners.js';

const MENU = {
  sections: [
    {
      name: 'Pizzas',
      items: [
        { name: 'Margherita', description: 'tomato, mozzarella, basil', price: '$14' },
        { name: 'Diavola', description: '', price: 'small $12, large $17' },
      ],
    },
    { name: '', items: [{ name: 'Tiramisu', description: '', price: '' }] },
  ],
  notes: ['Gluten-free bases available for $2'],
};
// A tiny real PNG, base64.
const PHOTO = {
  mediaType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
};
let api;
let claude;

before(async () => {
  await setUpTestDatabase();
  claude = fakeClaude({ reply: MENU });
  api = await startApi({ menuImports: createMenuImports({ anthropic: claude.anthropic }) });
});
beforeEach(async () => {
  await emptyTestDatabase();
  Object.assign(claude.state, { reply: MENU, stopReason: 'end_turn', error: null, gate: null });
  claude.requests.length = 0;
});
after(async () => {
  await api.close();
  await pool.end();
});

const upload = (cookie, photos = [PHOTO]) => api.request('POST', '/owner/menu-imports', { cookie, body: { photos } });
// Polls an upload until it has been read, as the owner app does.
async function result(cookie, id) {
  for (let i = 0; i < 50; i++) {
    const { body } = await api.request('GET', `/owner/menu-imports/${id}`, { cookie });
    if (body.status !== 'reading') return body;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('still reading');
}

test("each item becomes one line in the common questions' form", () => {
  assert.deepEqual(menuLines(MENU), [
    'Menu (Pizzas): Margherita, tomato, mozzarella, basil, $14.',
    'Menu (Pizzas): Diavola, small $12, large $17.',
    'Menu: Tiramisu.',
    'Menu note: Gluten-free bases available for $2.',
  ]);
  // Extra spaces and trailing punctuation are tidied; items without a name are skipped.
  assert.deepEqual(menuLines({ sections: [{ name: ' Drinks ', items: [{ name: 'Cola.', description: '  ', price: '$3 ' }, { name: '', description: 'x', price: '$1' }] }], notes: [' '] }), [
    'Menu (Drinks): Cola, $3.',
  ]);
});

test('an upload is read in the background and returns the lines', async () => {
  const { cookie } = await signedInOwner();
  const started = await upload(cookie);
  assert.equal(started.status, 202);
  const done = await result(cookie, started.body.id);
  assert.equal(done.status, 'done');
  assert.equal(done.photos, 1);
  assert.equal(done.lines.length, 4);
  assert.equal(done.error, null);
});

test('Claude gets the photos as images, with the menu format as structured output', async () => {
  const { cookie } = await signedInOwner();
  await result(cookie, (await upload(cookie, [PHOTO, { ...PHOTO, mediaType: 'image/jpeg' }])).body.id);
  const [request] = claude.requests;
  assert.equal(request.model, 'claude-opus-5-5');
  assert.equal(request.output_config.format.type, 'json_schema');
  assert.deepEqual(request.output_config.format.schema.required, ['sections', 'notes']);
  assert.equal(request.fallbacks, 'default');
  const content = request.messages[0].content;
  assert.deepEqual(
    content.filter((block) => block.type === 'image').map((block) => block.source.media_type),
    ['image/png', 'image/jpeg'],
  );
  assert.equal(content.at(-1).type, 'text');
  assert.match(request.system, /not instructions/);
});

test('uploads are checked before anything is sent to Claude', async () => {
  const { cookie } = await signedInOwner();
  const cases = [
    [[], 'Add at least one photo.'],
    [Array(LIMITS.photosPerUpload + 1).fill(PHOTO), 'Add up to 5 photos at a time.'],
    [[{ ...PHOTO, mediaType: 'image/heic' }], "The photo isn't a JPEG, PNG, WebP or GIF image."],
    [[PHOTO, { ...PHOTO, data: 'not base64!' }], "Photo 2 couldn't be read."],
    [[{ ...PHOTO, data: 'A'.repeat(7 * 1024 * 1024) }], 'The photo is too large.'],
  ];
  for (const [photos, error] of cases) assert.deepEqual(await upload(cookie, photos), { status: 400, body: { error } });
  assert.equal(claude.requests.length, 0);
});

test('one upload is read at a time, and there is a daily limit', async () => {
  const { cookie, user } = await signedInOwner();
  const release = claude.hold();
  const first = await upload(cookie);
  assert.deepEqual(await upload(cookie), { status: 409, body: { error: 'Your last photos are still being read.' } });
  release();
  await result(cookie, first.body.id);

  await pool.query(
    "INSERT INTO menu_imports (user_id, status, photos) SELECT $1, 'done', 1 FROM generate_series(1, $2)",
    [user.id, LIMITS.uploadsPerDay - 1],
  );
  assert.equal((await upload(cookie)).status, 429);
});

test('when the photos cannot be read, the owner is told why', async () => {
  const { cookie } = await signedInOwner();
  const failures = [
    [{ reply: { sections: [], notes: ['This is a photo of a cat'] } }, 'Menu note: This is a photo of a cat.'],
    [{ reply: { sections: [], notes: [] } }, 'No menu items were found in these photos.'],
    [{ stopReason: 'refusal' }, 'These photos could not be read. Try other photos.'],
    [{ stopReason: 'max_tokens' }, 'That menu is too long to read at once. Upload fewer photos at a time.'],
    [{ error: new Error('socket hang up') }, 'The menu could not be read. Please try again.'],
  ];
  for (const [state, expected] of failures) {
    Object.assign(claude.state, { reply: MENU, stopReason: 'end_turn', error: null }, state);
    const job = await result(cookie, (await upload(cookie)).body.id);
    // A photo with only notes is still "done": the owner sees the note.
    if (job.status === 'done') assert.deepEqual(job.lines, [expected]);
    else assert.equal(job.error, expected);
  }
});

test('a Claude API error is reported without its details', async () => {
  const { cookie } = await signedInOwner();
  claude.state.error = new Anthropic.APIError(500, { error: { message: 'internal detail' } }, 'internal detail', new Headers());
  const job = await result(cookie, (await upload(cookie)).body.id);
  assert.equal(job.error, 'The menu could not be read right now. Please try again.');
});

test("owners only see their own uploads, and must be signed in", async () => {
  const alice = await signedInOwner({ email: 'alice@example.com' });
  const bob = await signedInOwner({ email: 'bob@example.com' });
  const { id } = (await upload(alice.cookie)).body;
  await result(alice.cookie, id);
  assert.equal((await api.request('GET', `/owner/menu-imports/${id}`, { cookie: bob.cookie })).status, 404);
  assert.equal((await api.request('GET', '/owner/menu-imports/not-an-id', { cookie: alice.cookie })).status, 404);
  assert.equal((await upload(undefined)).status, 401);
});

test('uploads still being read when the API stopped are marked failed on startup', async () => {
  const { user } = await signedInOwner();
  await pool.query("INSERT INTO menu_imports (user_id, status, photos) VALUES ($1, 'reading', 2)", [user.id]);
  await failInterruptedImports();
  const { rows } = await pool.query('SELECT status, error FROM menu_imports');
  assert.deepEqual(rows, [{ status: 'failed', error: 'Reading was interrupted. Please try again.' }]);
});

test('without a fake, nothing can reach the real Claude API in tests', async () => {
  const { user } = await signedInOwner();
  const { id, finished } = await createMenuImports().start(user.id, [PHOTO]);
  await finished;
  const { rows } = await pool.query('SELECT status FROM menu_imports WHERE id = $1', [id]);
  assert.equal(rows[0].status, 'failed');
});
