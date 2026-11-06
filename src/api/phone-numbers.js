// Buys a Twilio number for a business once its plan is paid for, and points it at the phone
// server, so a new owner's receptionist starts answering without anyone setting it up by hand.
// billing.js calls ensureNumberFor() whenever a subscription is refreshed from Stripe.
//
// TWILIO_BUY_NUMBERS picks what happens:
//   dry-run  (the default) records what would be bought, without calling Twilio; the business
//            keeps waiting for a number. For trying the flow without spending credit.
//   live     buys the number: about $1.15 a month for a US local number, from the Twilio balance.
//   off      does nothing; numbers are added in the admin site.
//
// The number is local to the business: in the area code of its own phone number, or anywhere in
// the US if that area has none. Each attempt is a row in phone_number_orders; at most one can be
// buying or bought per business, so two events arriving together can't buy two numbers.

import { pool } from '../shared/db/pool.js';
import { getBusinessRow } from '../shared/businesses.js';
import { isPaid } from '../shared/plans.js';
import { getTwilioClient } from '../shared/twilio.js';

export const MODES = ['dry-run', 'live', 'off'];

// "+1 (512) 555-0100" -> "512". Only US and Canadian numbers have an area code we can search by.
export function areaCodeOf(phone) {
  const digits = (phone ?? '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return national.length === 10 && /^[2-9]/.test(national) ? national.slice(0, 3) : null;
}

// True when a business should get a number now: it pays for a plan and has none yet. Businesses
// that don't need a plan (added in the admin site) get theirs there.
const needsNumber = (row) => row.requires_subscription && isPaid(row.subscription_status) && !row.twilio_number;

// mode: one of MODES (TWILIO_BUY_NUMBERS by default); twilio: the Twilio client (the shared one
// by default, only used in live mode); publicUrl: where Twilio reaches the phone server.
export function createPhoneNumbers({
  mode = process.env.TWILIO_BUY_NUMBERS || 'dry-run',
  twilio,
  publicUrl = process.env.PUBLIC_URL,
} = {}) {
  if (!MODES.includes(mode)) throw new Error(`TWILIO_BUY_NUMBERS must be one of ${MODES.join(', ')}, not "${mode}"`);
  const client = () => twilio ?? getTwilioClient();
  const voiceUrl = `${publicUrl?.replace(/\/$/, '')}/incoming-call`;

  // The first local number with voice and SMS (owners' message texts are sent from it): in this
  // area code if there is one, else anywhere in the US.
  async function findNumber(areaCode) {
    const search = (filter) =>
      client().availablePhoneNumbers('US').local.list({ ...filter, voiceEnabled: true, smsEnabled: true, limit: 1 });
    const [local] = areaCode ? await search({ areaCode: Number(areaCode) }) : [];
    const [found] = local ? [local] : await search({});
    if (!found) throw new Error('Twilio has no US local numbers available');
    return found.phoneNumber;
  }

  async function dryRun(row, areaCode) {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM phone_number_orders WHERE business_id = $1 AND status = 'dry_run'",
      [row.id],
    );
    if (rowCount) return null;
    await pool.query(
      "INSERT INTO phone_number_orders (business_id, status, area_code) VALUES ($1, 'dry_run', $2)",
      [row.id, areaCode],
    );
    console.log(`Dry run: would buy a Twilio number for ${row.name} (area code ${areaCode ?? 'any'}), pointed at ${voiceUrl}`);
    return null;
  }

  async function buy(row, areaCode) {
    // Claims the business's one live order; if another is buying or has bought, there's nothing to do.
    const { rows } = await pool.query(
      `INSERT INTO phone_number_orders (business_id, status, area_code) VALUES ($1, 'buying', $2)
       ON CONFLICT (business_id) WHERE status IN ('buying', 'bought') DO NOTHING RETURNING id`,
      [row.id, areaCode],
    );
    const order = rows[0]?.id;
    if (!order) return null;
    try {
      const phoneNumber = await findNumber(areaCode);
      const bought = await client().incomingPhoneNumbers.create({
        phoneNumber,
        voiceUrl,
        voiceMethod: 'POST',
        friendlyName: `Bivoz: ${row.name}`.slice(0, 64),
      });
      await pool.query(
        "UPDATE phone_number_orders SET status = 'bought', phone_number = $2, twilio_sid = $3, updated_at = now() WHERE id = $1",
        [order, bought.phoneNumber, bought.sid],
      );
      // Only if nobody added a number in the admin site meanwhile.
      const { rowCount } = await pool.query(
        'UPDATE businesses SET twilio_number = $2, twilio_number_sid = $3 WHERE id = $1 AND twilio_number IS NULL',
        [row.id, bought.phoneNumber, bought.sid],
      );
      if (!rowCount) console.warn(`Bought ${bought.phoneNumber} for ${row.name}, but it already had a number; release one in Twilio`);
      console.log(`Bought ${bought.phoneNumber} for ${row.name}`);
      return getBusinessRow(row.id);
    } catch (err) {
      // Frees the claim, so the next payment event tries again.
      await pool.query(
        "UPDATE phone_number_orders SET status = 'failed', error = $2, updated_at = now() WHERE id = $1",
        [order, err.message],
      );
      console.error(`Could not buy a Twilio number for ${row.name}:`, err.message);
      return null;
    }
  }

  return {
    mode,
    // Buys a number for this business row if it pays and has none (or records the dry run).
    // Returns the updated row when a number was bought, otherwise null. Never throws: a failed
    // purchase is recorded and doesn't stop the payment from being processed.
    async ensureNumberFor(row) {
      if (mode === 'off' || !row || !needsNumber(row)) return null;
      const areaCode = areaCodeOf(row.phone);
      try {
        return mode === 'live' ? await buy(row, areaCode) : await dryRun(row, areaCode);
      } catch (err) {
        console.error(`Phone number for ${row.name}:`, err.message);
        return null;
      }
    },
  };
}

// A business's latest number order, for the admin site, or null.
export async function latestNumberOrder(businessId) {
  const { rows } = await pool.query(
    `SELECT status, area_code, phone_number, error, created_at FROM phone_number_orders
     WHERE business_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [businessId],
  );
  return rows[0] ?? null;
}
