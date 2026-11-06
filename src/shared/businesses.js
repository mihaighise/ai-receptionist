// Reads and writes businesses in the database. The phone server only reads them, as the object
// the rest of the code uses (the business details, the languages it speaks and the actions turned
// on for it); the API (src/api) also creates, edits and deletes them, and finds an owner's business.

import { pool } from './db/pool.js';
import { PAID_STATUSES } from './plans.js';

// What the receptionist can do for a business, with a label for the admin site. The features
// CHECK in db/migrations must list the same codes.
export const FEATURES = {
  messages: 'Take messages for the staff',
  transfers: 'Transfer callers to a person',
};

// The columns the admin site can set.
const EDITABLE_COLUMNS = [
  'slug', 'name', 'description', 'address', 'hours', 'phone', 'faq', 'twilio_number',
  'languages', 'features', 'transfer_number', 'notify_sms', 'notify_whatsapp', 'urgent_when', 'active', 'owner_id',
  'requires_subscription',
];

// The businesses that answer calls: active ones, and if they need a subscription, only while it's
// paid for. $1 is PAID_STATUSES.
const ANSWERS_CALLS = 'active AND (NOT requires_subscription OR subscription_status = ANY($1))';

// Business rows with their owner's email (owner_email), which the admin site shows instead of the ID.
const ROWS_WITH_OWNER = `SELECT b.*, u.email AS owner_email FROM businesses b LEFT JOIN "user" u ON u.id = b.owner_id`;

// Database row -> business. An action that is turned off, or is missing the number it needs,
// comes out empty, so the receptionist is never offered a tool that can't work.
export function toBusiness(row) {
  const has = (feature) => row.features.includes(feature);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    hours: row.hours,
    phone: row.phone,
    faq: row.faq,
    twilioNumber: row.twilio_number,
    languages: row.languages,
    actions: {
      messages: has('messages'),
      notify: { sms: row.notify_sms, whatsapp: row.notify_whatsapp },
      transfer: { number: has('transfers') ? row.transfer_number : null },
      urgentWhen: row.urgent_when,
    },
  };
}

// The business that answers calls to this Twilio number (E.164, as Twilio sends it), or null.
export async function findBusinessByNumber(twilioNumber) {
  const { rows } = await pool.query(`SELECT * FROM businesses WHERE twilio_number = $2 AND ${ANSWERS_CALLS}`, [
    PAID_STATUSES,
    twilioNumber,
  ]);
  return rows[0] ? toBusiness(rows[0]) : null;
}

// The business with this ID, if it answers calls, or null.
export async function findBusinessById(id) {
  const { rows } = await pool.query(`SELECT * FROM businesses WHERE id = $2 AND ${ANSWERS_CALLS}`, [PAID_STATUSES, id]);
  return rows[0] ? toBusiness(rows[0]) : null;
}

// --- API: raw rows, including inactive businesses ---

export async function listBusinessRows() {
  const { rows } = await pool.query(`${ROWS_WITH_OWNER} ORDER BY b.name`);
  return rows;
}

export async function getBusinessRow(id) {
  const { rows } = await pool.query(`${ROWS_WITH_OWNER} WHERE b.id = $1`, [id]);
  return rows[0] ?? null;
}

// The business this user owns, or null. (One business per owner for now.)
export async function findBusinessRowByOwner(userId) {
  const { rows } = await pool.query(`${ROWS_WITH_OWNER} WHERE b.owner_id = $1 ORDER BY b.created_at LIMIT 1`, [userId]);
  return rows[0] ?? null;
}

// db is the pool or a client in a transaction. Both return the business's ID.
async function insertRow(db, values) {
  const columns = EDITABLE_COLUMNS.filter((c) => c in values);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await db.query(
    `INSERT INTO businesses (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`,
    columns.map((c) => values[c]),
  );
  return rows[0].id;
}

async function updateRow(db, id, values) {
  const columns = EDITABLE_COLUMNS.filter((c) => c in values);
  const sets = columns.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const { rows } = await db.query(
    `UPDATE businesses SET ${sets} WHERE id = $1 RETURNING id`,
    [id, ...columns.map((c) => values[c])],
  );
  return rows[0]?.id ?? null;
}

// values: { column: value } for the EDITABLE_COLUMNS. Returns the new row.
export async function createBusiness(values) {
  return getBusinessRow(await insertRow(pool, values));
}

// Returns the updated row, or null if there's no business with this ID.
export async function updateBusiness(id, values) {
  return (await updateRow(pool, id, values)) ? getBusinessRow(id) : null;
}

// "Northside Heating & Air" -> "northside-heating-air"
const slugify = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'business';

// A slug for this name that no business uses yet: "sunrise-dental", else "sunrise-dental-2", …
async function unusedSlug(db, name) {
  const base = slugify(name);
  const { rows } = await db.query(`SELECT slug FROM businesses WHERE slug = $1 OR slug ~ ('^' || $1 || '-[0-9]+$')`, [
    base,
  ]);
  const taken = new Set(rows.map((row) => row.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

// Saves an owner's settings to their business, creating it (with a slug made from its name, and
// needing a subscription to answer calls) the first time. Returns the row. Saves for the same owner wait for each other, so two at once (a
// double click) can't create two businesses.
export async function saveOwnerBusiness(ownerId, values) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`owner-business:${ownerId}`]);
    const { rows } = await client.query(
      'SELECT id FROM businesses WHERE owner_id = $1 ORDER BY created_at LIMIT 1',
      [ownerId],
    );
    const id = rows[0]
      ? await updateRow(client, rows[0].id, values)
      : await insertRow(client, {
          ...values,
          slug: await unusedSlug(client, values.name),
          owner_id: ownerId,
          requires_subscription: true,
        });
    await client.query('COMMIT');
    return getBusinessRow(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- Billing (src/api/billing.js) ---

export async function findBusinessRowByStripeCustomer(customerId) {
  const { rows } = await pool.query(`${ROWS_WITH_OWNER} WHERE b.stripe_customer_id = $1`, [customerId]);
  return rows[0] ?? null;
}

// Records the Stripe Customer that pays for this business, unless it already has one. Returns the
// business's customer ID either way.
export async function setStripeCustomer(businessId, customerId) {
  const { rows } = await pool.query(
    `UPDATE businesses SET stripe_customer_id = COALESCE(stripe_customer_id, $2) WHERE id = $1
     RETURNING stripe_customer_id`,
    [businessId, customerId],
  );
  return rows[0]?.stripe_customer_id ?? null;
}

// subscription: { id, plan, status, periodStart, periodEnd, endedAt (Dates), cancels }, the business's copy of its Stripe
// subscription. Returns the row, or null if no business has this customer.
export async function saveSubscription(customerId, subscription) {
  const { rows } = await pool.query(
    `UPDATE businesses SET stripe_subscription_id = $2, plan = $3, subscription_status = $4,
       subscription_period_start = $5, subscription_period_end = $6, subscription_cancels = $7,
       subscription_ended_at = $8
     WHERE stripe_customer_id = $1 RETURNING id`,
    [
      customerId,
      subscription.id,
      subscription.plan,
      subscription.status,
      subscription.periodStart,
      subscription.periodEnd,
      subscription.cancels,
      subscription.endedAt,
    ],
  );
  return rows[0] ? getBusinessRow(rows[0].id) : null;
}

// Returns true if a business was deleted.
export async function deleteBusiness(id) {
  const { rowCount } = await pool.query('DELETE FROM businesses WHERE id = $1', [id]);
  return rowCount > 0;
}
