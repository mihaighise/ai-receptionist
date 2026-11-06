// Counting call minutes (src/shared/usage.js), against the test database.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createBusiness, saveOwnerBusiness, toBusiness } from '../src/shared/businesses.js';
import { pool } from '../src/shared/db/pool.js';
import { addTopUp, answerFor, minutesFor, recordCall, usageFor } from '../src/shared/usage.js';
import { emptyTestDatabase, setUpTestDatabase } from './support/database.js';
import { signedInOwner } from './support/owners.js';

const settings = { name: 'Rapid Flow Plumbing', description: 'a plumber', languages: ['en'], features: [] };
const PERIOD_START = new Date('2026-11-06T00:00:00Z');
const PERIOD_END = new Date('2026-12-06T00:00:00Z');
let callCount = 0;

before(setUpTestDatabase);
beforeEach(emptyTestDatabase);
after(() => pool.end());

// An owner's business on a paid plan, in the billing month PERIOD_START..PERIOD_END.
async function paidBusiness(plan = 'starter', extra = {}) {
  const { user } = await signedInOwner({ email: `owner${++callCount}@example.com` });
  const { id } = await saveOwnerBusiness(user.id, { ...settings, ...extra });
  await pool.query(
    `UPDATE businesses SET plan = $2, subscription_status = 'active', subscription_period_start = $3,
       subscription_period_end = $4 WHERE id = $1`,
    [id, plan, PERIOD_START, PERIOD_END],
  );
  return id;
}

const row = async (id) => (await pool.query('SELECT * FROM businesses WHERE id = $1', [id])).rows[0];
const usage = async (id) => usageFor(await row(id));

// A call of this many minutes, started `at` (in the billing month by default).
function call(businessId, minutes, at = new Date('2026-11-10T10:00:00Z')) {
  return recordCall({
    businessId,
    callSid: `CA${++callCount}`,
    caller: '+15550100000',
    startedAt: at,
    endedAt: new Date(at.getTime() + minutes * 60_000),
  });
}

test('calls are rounded up to whole minutes, the way Twilio bills them', () => {
  assert.deepEqual([0, 1, 59, 60, 61, 125].map(minutesFor), [0, 1, 1, 1, 2, 3]);
});

test("a month's calls are counted against the plan's minutes", async () => {
  const id = await paidBusiness('starter');
  await call(id, 30);
  await call(id, 20.5);
  assert.deepEqual(await usage(id), {
    limited: true,
    planMinutes: 200,
    used: 51,
    extra: 0,
    remaining: 149,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
  });
});

test('recording the same call twice counts it once', async () => {
  const id = await paidBusiness();
  const at = new Date('2026-11-10T10:00:00Z');
  const sameCall = { businessId: id, callSid: 'CAsame', startedAt: at, endedAt: new Date(at.getTime() + 300_000) };
  await recordCall(sameCall);
  await recordCall(sameCall);
  assert.equal((await usage(id)).used, 5);
});

test('calls from before this billing month are not counted', async () => {
  const id = await paidBusiness();
  await call(id, 100, new Date('2026-11-01T10:00:00Z'));
  await call(id, 10);
  assert.equal((await usage(id)).used, 10);
});

test("calls past the plan's minutes use extra minutes, and the plan's own come first", async () => {
  const id = await paidBusiness('starter');
  await addTopUp(id, 100, 'cs_1');
  await call(id, 150);
  assert.equal((await usage(id)).extra, 100);
  await call(id, 80); // 50 from the plan, 30 from the extra minutes
  let now = await usage(id);
  assert.equal(now.used, 230);
  assert.equal(now.extra, 70);
  assert.equal(now.remaining, 70);
  await call(id, 90); // 70 extra left, so 20 more than there are: the call isn't cut off
  now = await usage(id);
  assert.equal(now.extra, 0);
  assert.equal(now.remaining, 0);
});

test('calls ending at the same time are each counted once against the plan', async () => {
  const id = await paidBusiness('starter');
  await addTopUp(id, 500, 'cs_1');
  await Promise.all(Array.from({ length: 10 }, () => call(id, 30))); // 300 minutes: 100 past the plan
  const now = await usage(id);
  assert.equal(now.used, 300);
  assert.equal(now.extra, 400);
});

test('an upgrade gives the bigger plan’s minutes straight away, in the same month', async () => {
  const id = await paidBusiness('starter');
  await call(id, 200);
  assert.equal((await usage(id)).remaining, 0);
  await pool.query("UPDATE businesses SET plan = 'pro' WHERE id = $1", [id]);
  assert.equal((await usage(id)).remaining, 400);
});

test('a new billing month starts from zero, and extra minutes carry over', async () => {
  const id = await paidBusiness('starter');
  await addTopUp(id, 100, 'cs_1');
  await call(id, 250);
  assert.equal((await usage(id)).extra, 50);
  await pool.query(
    "UPDATE businesses SET subscription_period_start = '2026-12-06', subscription_period_end = '2027-01-06' WHERE id = $1",
    [id],
  );
  const next = await usage(id);
  assert.equal(next.used, 0);
  assert.equal(next.extra, 50);
  assert.equal(next.remaining, 250);
});

test('each extra-minutes payment adds its minutes once', async () => {
  const id = await paidBusiness();
  assert.equal(await addTopUp(id, 100, 'cs_once'), true);
  assert.equal(await addTopUp(id, 100, 'cs_once'), false);
  assert.equal((await usage(id)).extra, 100);
});

test('out of minutes: callers are transferred if transfers are on, otherwise turned away', async () => {
  const plain = await paidBusiness('starter');
  assert.equal(await answerFor(toBusiness(await row(plain))), 'answer');
  await call(plain, 200);
  assert.equal(await answerFor(toBusiness(await row(plain))), 'decline');

  const transfers = await paidBusiness('starter', { features: ['transfers'], transfer_number: '+15125550199' });
  await call(transfers, 200);
  assert.equal(await answerFor(toBusiness(await row(transfers))), 'transfer');
  // Extra minutes put it back to answering.
  await addTopUp(transfers, 50, 'cs_more');
  assert.equal(await answerFor(toBusiness(await row(transfers))), 'answer');
});

test('businesses without a subscription have no limit', async () => {
  const { id } = await createBusiness({ ...settings, slug: 'demo' });
  await call(id, 5000);
  assert.equal((await usage(id)).limited, false);
  assert.equal(await answerFor(toBusiness(await row(id))), 'answer');
});
