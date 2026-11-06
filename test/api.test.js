// The API's routes (src/api/app.js), over HTTP, against the test database.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createBusiness } from '../src/shared/businesses.js';
import { pool } from '../src/shared/db/pool.js';
import { startApi } from './support/api.js';
import { emptyTestDatabase, setUpTestDatabase } from './support/database.js';
import { signedInOwner } from './support/owners.js';

const settings = {
  name: 'Rapid Flow Plumbing',
  description: 'a plumber',
  languages: ['en', 'es'],
  features: ['messages'],
  notify_sms: '+15125550100',
};
let api;

before(async () => {
  await setUpTestDatabase();
  api = await startApi();
});
beforeEach(emptyTestDatabase);
after(async () => {
  await api.close();
  await pool.end();
});

test('the sign-in providers are public', async () => {
  assert.deepEqual(await api.request('GET', '/owner/providers'), { status: 200, body: { providers: ['google'] } });
});

test('everything else in the owner app needs a signed-in owner', async () => {
  for (const [method, path] of [
    ['GET', '/owner/me'],
    ['GET', '/owner/options'],
    ['PUT', '/owner/business'],
    ['POST', '/owner/preview'],
  ]) {
    assert.equal((await api.request(method, path, { body: method === 'GET' ? undefined : settings })).status, 401, path);
  }
  const forged = await api.request('GET', '/owner/me', { cookie: 'better-auth.session_token=made-up.c2lnbmF0dXJl' });
  assert.equal(forged.status, 401);
});

test('a new owner has no business until they save one', async () => {
  const { user, cookie } = await signedInOwner();
  const { status, body } = await api.request('GET', '/owner/me', { cookie });
  assert.equal(status, 200);
  assert.deepEqual(body, { user: { id: user.id, name: 'Test Owner', email: 'owner@example.com', image: null }, business: null });
});

test('saving creates the business, and /me then returns it', async () => {
  const { cookie } = await signedInOwner();
  const saved = await api.request('PUT', '/owner/business', { cookie, body: settings });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.slug, 'rapid-flow-plumbing');
  assert.deepEqual((await api.request('GET', '/owner/me', { cookie })).body.business, saved.body);
});

test("owners can't set the number, active, slug or owner, even for their own business", async () => {
  const other = await signedInOwner({ email: 'other@example.com' });
  const { user, cookie } = await signedInOwner();
  const { body } = await api.request('PUT', '/owner/business', {
    cookie,
    body: { ...settings, twilio_number: '+18312490526', active: false, slug: 'mine', owner_id: other.user.id },
  });
  assert.equal(body.twilio_number, null);
  assert.equal(body.active, true);
  assert.equal(body.slug, 'rapid-flow-plumbing');
  assert.equal(body.owner_id, user.id);
});

test('invalid settings get field messages', async () => {
  const { cookie } = await signedInOwner();
  const { status, body } = await api.request('PUT', '/owner/business', {
    cookie,
    body: { ...settings, name: '', notify_sms: '' },
  });
  assert.equal(status, 400);
  assert.deepEqual(Object.keys(body.fields).sort(), ['name', 'notify_sms']);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM businesses')).rows[0].n, 0);
});

test("the owner preview shows the greeting, not Claude's instructions", async () => {
  const { cookie } = await signedInOwner();
  const { body } = await api.request('POST', '/owner/preview', { cookie, body: settings });
  assert.deepEqual(Object.keys(body), ['greeting']);
  assert.equal(body.greeting[0].text, 'Thanks for calling Rapid Flow Plumbing. How can I help you today?');
  assert.equal(body.greeting[1].languageName, 'Spanish');
});

test('the admin site links a business to an owner by email, once they have signed in', async () => {
  const business = { ...settings, slug: 'rapid-flow' };
  const unknown = await api.request('POST', '/admin/businesses', { body: { ...business, owner_email: 'nobody@example.com' } });
  assert.deepEqual(unknown.body.fields, { owner_email: 'No one has signed in with this email yet.' });

  const { user, cookie } = await signedInOwner();
  const linked = await api.request('POST', '/admin/businesses', { body: { ...business, owner_email: 'OWNER@example.com' } });
  assert.equal(linked.status, 201);
  assert.equal(linked.body.owner_id, user.id);
  assert.equal((await api.request('GET', '/owner/me', { cookie })).body.business.id, linked.body.id);
});

test('the admin site points at a Twilio number or slug already in use', async () => {
  await createBusiness({ ...settings, slug: 'sunrise-dental', twilio_number: '+18312490526' });
  const { status, body } = await api.request('POST', '/admin/businesses', {
    body: { ...settings, slug: 'other', twilio_number: '+1 (831) 249-0526' },
  });
  assert.equal(status, 400);
  assert.deepEqual(body.fields, { twilio_number: 'Another business already uses this Twilio number.' });
  const again = await api.request('POST', '/admin/businesses', { body: { ...settings, slug: 'sunrise-dental' } });
  assert.deepEqual(again.body.fields, { slug: 'Another business already uses this slug.' });
});
