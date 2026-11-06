// Saving an owner's business (saveOwnerBusiness in src/shared/businesses.js), against the test database.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createBusiness, findBusinessRowByOwner, saveOwnerBusiness } from '../src/shared/businesses.js';
import { pool } from '../src/shared/db/pool.js';
import { emptyTestDatabase, setUpTestDatabase } from './support/database.js';
import { signedInOwner } from './support/owners.js';

const settings = { name: 'Rapid Flow Plumbing', description: 'a plumber', languages: ['en'], features: ['messages'] };
const businessesOf = async (ownerId) =>
  (await pool.query('SELECT * FROM businesses WHERE owner_id = $1', [ownerId])).rows;

before(setUpTestDatabase);
beforeEach(emptyTestDatabase);
after(() => pool.end());

test('the first save creates the business, with no number, answering calls once it has one', async () => {
  const { user } = await signedInOwner();
  const row = await saveOwnerBusiness(user.id, settings);
  assert.equal(row.name, 'Rapid Flow Plumbing');
  assert.equal(row.slug, 'rapid-flow-plumbing');
  assert.equal(row.owner_id, user.id);
  assert.equal(row.owner_email, 'owner@example.com');
  assert.equal(row.twilio_number, null);
  assert.equal(row.active, true);
  assert.deepEqual(await findBusinessRowByOwner(user.id), row);
});

test('later saves change the same business and keep its slug', async () => {
  const { user } = await signedInOwner();
  const first = await saveOwnerBusiness(user.id, settings);
  const second = await saveOwnerBusiness(user.id, { ...settings, name: 'Rapid Flow Plumbing & Heating', hours: 'Daily' });
  assert.equal(second.id, first.id);
  assert.equal(second.slug, 'rapid-flow-plumbing');
  assert.equal(second.hours, 'Daily');
  assert.equal((await businessesOf(user.id)).length, 1);
});

test('saves keep what only the admin site sets', async () => {
  const { user } = await signedInOwner();
  const { id } = await saveOwnerBusiness(user.id, settings);
  await pool.query("UPDATE businesses SET twilio_number = '+18312490526', active = false WHERE id = $1", [id]);
  const row = await saveOwnerBusiness(user.id, { ...settings, hours: 'Daily' });
  assert.equal(row.twilio_number, '+18312490526');
  assert.equal(row.active, false);
});

test('ten saves at once still create one business', async () => {
  const { user } = await signedInOwner();
  const rows = await Promise.all(Array.from({ length: 10 }, () => saveOwnerBusiness(user.id, settings)));
  assert.equal(new Set(rows.map((row) => row.id)).size, 1);
  assert.equal((await businessesOf(user.id)).length, 1);
});

test('businesses with the same name get the next free slug', async () => {
  await createBusiness({ ...settings, slug: 'rapid-flow-plumbing' });
  await createBusiness({ ...settings, slug: 'rapid-flow-plumbing-2' });
  await createBusiness({ ...settings, slug: 'rapid-flow-plumbing-co' }); // only looks like a match
  const { user } = await signedInOwner();
  assert.equal((await saveOwnerBusiness(user.id, settings)).slug, 'rapid-flow-plumbing-3');
});

test('slugs are made from any name', async () => {
  const slugFor = async (name, email) =>
    (await saveOwnerBusiness((await signedInOwner({ email })).user.id, { ...settings, name })).slug;
  assert.equal(await slugFor('Café Olé & Co.', 'a@example.com'), 'cafe-ole-co');
  assert.equal(await slugFor('東京スシ', 'b@example.com'), 'business');
});

test('each owner only gets their own business', async () => {
  const alice = await signedInOwner({ email: 'alice@example.com' });
  const bob = await signedInOwner({ email: 'bob@example.com' });
  const a = await saveOwnerBusiness(alice.user.id, { ...settings, name: 'Alice Plumbing' });
  const b = await saveOwnerBusiness(bob.user.id, { ...settings, name: 'Bob Electric' });
  assert.notEqual(a.id, b.id);
  assert.equal((await findBusinessRowByOwner(alice.user.id)).name, 'Alice Plumbing');
  assert.equal((await findBusinessRowByOwner(bob.user.id)).name, 'Bob Electric');
});
