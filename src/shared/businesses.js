// Reads and writes businesses in the database. The phone server only reads them, as the object
// the rest of the code uses (the business details, the languages it speaks and the actions turned
// on for it); the API (src/api) also creates, edits and deletes them, and finds an owner's business.

import { pool } from './db/pool.js';

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
];

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

// The active business that owns this Twilio number (E.164, as Twilio sends it), or null.
export async function findBusinessByNumber(twilioNumber) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE twilio_number = $1 AND active', [twilioNumber]);
  return rows[0] ? toBusiness(rows[0]) : null;
}

// The active business with this ID, or null.
export async function findBusinessById(id) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1 AND active', [id]);
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

// Saves an owner's settings to their business, creating it (with a slug made from its name) the
// first time. Returns the row. Saves for the same owner wait for each other, so two at once (a
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
      : await insertRow(client, { ...values, slug: await unusedSlug(client, values.name), owner_id: ownerId });
    await client.query('COMMIT');
    return getBusinessRow(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Returns true if a business was deleted.
export async function deleteBusiness(id) {
  const { rowCount } = await pool.query('DELETE FROM businesses WHERE id = $1', [id]);
  return rowCount > 0;
}
