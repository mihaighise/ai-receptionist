// Buying Twilio numbers for paying businesses (src/api/phone-numbers.js), with a fake Twilio
// client, against the test database. Nothing reaches Twilio.

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { areaCodeOf, createPhoneNumbers, latestNumberOrder } from '../src/api/phone-numbers.js';
import { createBusiness, saveOwnerBusiness } from '../src/shared/businesses.js';
import { pool } from '../src/shared/db/pool.js';
import { emptyTestDatabase, setUpTestDatabase } from './support/database.js';
import { fakeTwilio, untouchableTwilio } from './support/fake-twilio.js';
import { signedInOwner } from './support/owners.js';

let owners = 0;

before(setUpTestDatabase);
beforeEach(emptyTestDatabase);
after(() => pool.end());

// An owner's business with this business phone, paying for a plan unless `paid` is false.
async function business({ phone = '+1 (512) 555-0100', paid = true } = {}) {
  const { user } = await signedInOwner({ email: `owner${++owners}@example.com` });
  const { id } = await saveOwnerBusiness(user.id, {
    name: 'Rapid Flow Plumbing',
    description: 'a plumber',
    phone,
    languages: ['en'],
    features: [],
  });
  if (paid) await pool.query("UPDATE businesses SET plan = 'pro', subscription_status = 'active' WHERE id = $1", [id]);
  return (await pool.query('SELECT * FROM businesses WHERE id = $1', [id])).rows[0];
}

const orders = async () => (await pool.query('SELECT * FROM phone_number_orders ORDER BY id')).rows;
const numberOf = async (id) => (await pool.query('SELECT twilio_number, twilio_number_sid FROM businesses WHERE id = $1', [id])).rows[0];
const live = (twilio) => createPhoneNumbers({ mode: 'live', twilio, publicUrl: 'https://phone.test/' });

test('the area code comes from US and Canadian business phone numbers', () => {
  assert.equal(areaCodeOf('+1 (512) 555-0100'), '512');
  assert.equal(areaCodeOf('512-555-0100'), '512');
  assert.equal(areaCodeOf('15125550100'), '512');
  assert.equal(areaCodeOf('+40 700 000 000'), null);
  assert.equal(areaCodeOf('555-0100'), null);
  assert.equal(areaCodeOf(''), null);
  assert.equal(areaCodeOf(null), null);
});

test('a dry run records what would be bought, without touching Twilio or the business', async () => {
  const row = await business();
  const numbers = createPhoneNumbers({ mode: 'dry-run', twilio: untouchableTwilio, publicUrl: 'https://phone.test' });
  assert.equal(await numbers.ensureNumberFor(row), null);
  assert.equal(await numbers.ensureNumberFor(row), null);
  const recorded = await orders();
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].status, 'dry_run');
  assert.equal(recorded[0].area_code, '512');
  assert.equal((await numberOf(row.id)).twilio_number, null);
  assert.equal((await latestNumberOrder(row.id)).status, 'dry_run');
});

test('dry run is the default', () => {
  assert.equal(createPhoneNumbers({ twilio: untouchableTwilio }).mode, 'dry-run');
  assert.throws(() => createPhoneNumbers({ mode: 'buy-everything' }), /TWILIO_BUY_NUMBERS must be one of/);
});

test("'off' does nothing at all", async () => {
  const row = await business();
  await createPhoneNumbers({ mode: 'off', twilio: untouchableTwilio }).ensureNumberFor(row);
  assert.deepEqual(await orders(), []);
});

test('live: buys a local number in the business’s area code and points it at the phone server', async () => {
  const row = await business();
  const fake = fakeTwilio({ available: { 512: ['+15125550199'], '': ['+12025550123'] } });
  const updated = await live(fake.twilio).ensureNumberFor(row);

  assert.deepEqual(fake.calls[0], ['search', 'US', { areaCode: 512, voiceEnabled: true, smsEnabled: true, limit: 1 }]);
  const [, params] = fake.calls.find(([name]) => name === 'buy');
  assert.deepEqual(params, {
    phoneNumber: '+15125550199',
    voiceUrl: 'https://phone.test/incoming-call',
    voiceMethod: 'POST',
    friendlyName: 'Bivoz: Rapid Flow Plumbing',
  });
  assert.equal(updated.twilio_number, '+15125550199');
  assert.match(updated.twilio_number_sid, /^PN\d{32}$/);
  const [order] = await orders();
  assert.equal(order.status, 'bought');
  assert.equal(order.phone_number, '+15125550199');
});

test('live: anywhere in the US when the area code has no numbers, or the phone has none', async () => {
  const fake = fakeTwilio({ available: { '': ['+12025550123'] } });
  const noneLeft = await business();
  assert.equal((await live(fake.twilio).ensureNumberFor(noneLeft)).twilio_number, '+12025550123');
  assert.deepEqual(
    fake.calls.filter(([name]) => name === 'search').map(([, , filter]) => filter.areaCode),
    [512, undefined],
  );

  const abroad = await business({ phone: '+40 700 000 000' });
  fake.calls.length = 0;
  await live(fake.twilio).ensureNumberFor(abroad);
  assert.deepEqual(fake.calls[0][2].areaCode, undefined);
});

test('live: many events at once still buy one number', async () => {
  const row = await business();
  const fake = fakeTwilio();
  const numbers = live(fake.twilio);
  await Promise.all(Array.from({ length: 10 }, () => numbers.ensureNumberFor(row)));
  assert.equal(fake.calls.filter(([name]) => name === 'buy').length, 1);
  assert.equal((await orders()).length, 1);
});

test('live: a failed purchase is recorded and tried again on the next event', async () => {
  const row = await business();
  const fake = fakeTwilio();
  fake.fail('Insufficient funds');
  assert.equal(await live(fake.twilio).ensureNumberFor(row), null);
  let [order] = await orders();
  assert.equal(order.status, 'failed');
  assert.equal(order.error, 'Insufficient funds');
  assert.equal((await numberOf(row.id)).twilio_number, null);
  assert.equal((await latestNumberOrder(row.id)).error, 'Insufficient funds');

  fake.fail(null);
  assert.equal((await live(fake.twilio).ensureNumberFor(row)).twilio_number, '+12025550123');
  [, order] = await orders();
  assert.equal(order.status, 'bought');
});

test('no number for businesses that don’t pay, already have one, or don’t need a plan', async () => {
  const fake = fakeTwilio();
  const numbers = live(fake.twilio);
  await numbers.ensureNumberFor(await business({ paid: false }));

  const withNumber = await business();
  await pool.query("UPDATE businesses SET twilio_number = '+18312490526' WHERE id = $1", [withNumber.id]);
  await numbers.ensureNumberFor((await pool.query('SELECT * FROM businesses WHERE id = $1', [withNumber.id])).rows[0]);

  const demo = await createBusiness({ slug: 'demo', name: 'Demo', description: 'a demo' });
  await numbers.ensureNumberFor({ ...demo, subscription_status: 'active' });

  for (const status of ['canceled', 'unpaid', 'incomplete']) {
    const row = await business();
    await pool.query('UPDATE businesses SET subscription_status = $2 WHERE id = $1', [row.id, status]);
    await numbers.ensureNumberFor({ ...row, subscription_status: status });
  }
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(await orders(), []);
});
