// Reads and writes businesses in the database. The phone server only reads them, as the object
// the rest of the code uses (the business details, the languages it speaks and the actions turned
// on for it); the API (src/api) also creates, edits and deletes them.

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
  'languages', 'features', 'transfer_number', 'notify_sms', 'notify_whatsapp', 'urgent_when', 'active',
];

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

// --- Admin site: raw rows, including inactive businesses ---

export async function listBusinessRows() {
  const { rows } = await pool.query('SELECT * FROM businesses ORDER BY name');
  return rows;
}

// values: { column: value } for the EDITABLE_COLUMNS. Returns the new row.
export async function createBusiness(values) {
  const columns = EDITABLE_COLUMNS.filter((c) => c in values);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO businesses (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
    columns.map((c) => values[c]),
  );
  return rows[0];
}

// Returns the updated row, or null if there's no business with this ID.
export async function updateBusiness(id, values) {
  const columns = EDITABLE_COLUMNS.filter((c) => c in values);
  const sets = columns.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const { rows } = await pool.query(
    `UPDATE businesses SET ${sets} WHERE id = $1 RETURNING *`,
    [id, ...columns.map((c) => values[c])],
  );
  return rows[0] ?? null;
}

// Returns true if a business was deleted.
export async function deleteBusiness(id) {
  const { rowCount } = await pool.query('DELETE FROM businesses WHERE id = $1', [id]);
  return rowCount > 0;
}
