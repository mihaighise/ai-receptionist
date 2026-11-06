// Call history (recordCall and listCalls in src/shared/usage.js, and GET /api/owner/calls),
// against the test database.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { saveOwnerBusiness } from '../src/shared/businesses.js';
import { pool } from '../src/shared/db/pool.js';
import { listCalls, recordCall } from '../src/shared/usage.js';
import { startApi } from './support/api.js';
import { emptyTestDatabase, setUpTestDatabase } from './support/database.js';
import { signedInOwner } from './support/owners.js';

const settings = { name: 'Rapid Flow Plumbing', description: 'a plumber', languages: ['en'], features: [] };
const MESSAGE = { caller_name: 'Jane Doe', callback_number: '+15125550111', message: 'Leaking tap', urgent: true };
let api;
let calls = 0;

before(async () => {
  await setUpTestDatabase();
  api = await startApi();
});
beforeEach(emptyTestDatabase);
after(async () => {
  await api.close();
  await pool.end();
});

async function ownerWithBusiness(email = 'owner@example.com') {
  const owner = await signedInOwner({ email });
  const business = await saveOwnerBusiness(owner.user.id, settings);
  return { ...owner, business };
}

// A call that started `at` and lasted `seconds`.
const call = (businessId, at, extra = {}, seconds = 90) =>
  recordCall({
    businessId,
    callSid: `CA${++calls}`,
    caller: '+15125550100',
    startedAt: new Date(at),
    endedAt: new Date(new Date(at).getTime() + seconds * 1000),
    ...extra,
  });

test('a call keeps whether it was transferred and the message taken', async () => {
  const { business } = await ownerWithBusiness();
  await call(business.id, '2026-11-06T10:00:00Z', { message: MESSAGE });
  await call(business.id, '2026-11-06T11:00:00Z', { transferred: true }, 30);
  const { calls: list } = await listCalls(business.id);
  assert.deepEqual(
    list.map(({ caller, seconds, minutes, transferred, message }) => ({ caller, seconds, minutes, transferred, message })),
    [
      { caller: '+15125550100', seconds: 30, minutes: 1, transferred: true, message: null },
      { caller: '+15125550100', seconds: 90, minutes: 2, transferred: false, message: MESSAGE },
    ],
  );
});

test('calls come newest first, a page at a time, without skipping calls that started together', async () => {
  const { business } = await ownerWithBusiness();
  // Five calls, three of them at the very same moment.
  for (const at of ['2026-11-01T09:00:00Z', '2026-11-02T09:00:00Z', '2026-11-03T09:00:00Z', '2026-11-03T09:00:00Z', '2026-11-03T09:00:00Z']) {
    await call(business.id, at);
  }
  const seen = [];
  let after = null;
  do {
    const page = await listCalls(business.id, { after, limit: 2 });
    seen.push(...page.calls);
    after = page.next;
  } while (after);
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen.map((c) => c.id)).size, 5);
  const times = seen.map((c) => c.started_at.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
});

test('owners see their own business’s calls through the API', async () => {
  const alice = await ownerWithBusiness('alice@example.com');
  const bob = await ownerWithBusiness('bob@example.com');
  await call(alice.business.id, '2026-11-06T10:00:00Z', { message: MESSAGE });
  await call(bob.business.id, '2026-11-06T10:00:00Z');

  const { status, body } = await api.request('GET', '/owner/calls', { cookie: alice.cookie });
  assert.equal(status, 200);
  assert.equal(body.calls.length, 1);
  assert.deepEqual(body.calls[0].message, MESSAGE);
  assert.equal(body.next, null);
});

test('the calls API pages, checks its cursor, and needs a signed-in owner', async () => {
  const { business, cookie } = await ownerWithBusiness();
  for (let i = 0; i < 3; i++) await call(business.id, `2026-11-0${i + 1}T10:00:00Z`);
  const first = await api.request('GET', '/owner/calls?limit=2', { cookie });
  assert.equal(first.body.calls.length, 2);
  const second = await api.request('GET', `/owner/calls?limit=2&after=${encodeURIComponent(first.body.next)}`, { cookie });
  assert.equal(second.body.calls.length, 1);
  assert.equal(second.body.next, null);

  assert.equal((await api.request('GET', '/owner/calls?after=yesterday', { cookie })).status, 400);
  assert.equal((await api.request('GET', '/owner/calls')).status, 401);
  const newOwner = await signedInOwner({ email: 'new@example.com' });
  assert.deepEqual((await api.request('GET', '/owner/calls', { cookie: newOwner.cookie })).body, { calls: [], next: null });
});
