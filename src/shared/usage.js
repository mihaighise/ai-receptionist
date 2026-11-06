// Call minutes. Each billing month a business's plan includes some minutes (plans.js); calls past
// them use the business's extra minutes, which owners buy and which don't expire. The phone server
// records each call when it ends (recordCall) and checks for minutes before answering
// (answerFor); the API shows the usage and adds bought minutes (addTopUp).
//
// Businesses that don't need a subscription (the demo businesses) have no limit.
// A call that runs out of minutes is never cut off; the next call is the one that's turned away.

import { pool } from './db/pool.js';
import { PLANS } from './plans.js';

// Twilio bills each call in whole minutes, rounded up.
export const minutesFor = (seconds) => Math.ceil(seconds / 60);

// The billing month a business's minutes count in. Before the first webhook says when it
// started, it's taken to be the month before it ends.
function periodOf(row) {
  const end = row.subscription_period_end ? new Date(row.subscription_period_end) : null;
  if (!end) return null;
  const start = row.subscription_period_start ? new Date(row.subscription_period_start) : null;
  if (start) return { start, end };
  const monthBefore = new Date(end);
  monthBefore.setUTCMonth(monthBefore.getUTCMonth() - 1);
  return { start: monthBefore, end };
}

// db: the pool or a client in a transaction. Minutes of calls started since `since`.
async function minutesUsedSince(db, businessId, since) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(minutes), 0)::int AS used FROM calls WHERE business_id = $1 AND started_at >= $2',
    [businessId, since],
  );
  return rows[0].used;
}

async function extraBalance(db, businessId) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(minutes), 0)::int AS balance FROM extra_minutes WHERE business_id = $1',
    [businessId],
  );
  return rows[0].balance;
}

// A business row -> its minutes this billing month:
//   { limited, planMinutes, used, extra, remaining, periodStart, periodEnd }
// limited is false for businesses without a subscription; the other numbers are then 0.
export async function usageFor(row, db = pool) {
  if (!row.requires_subscription) {
    return { limited: false, planMinutes: 0, used: 0, extra: 0, remaining: 0, periodStart: null, periodEnd: null };
  }
  const period = periodOf(row);
  const planMinutes = PLANS[row.plan]?.minutes ?? 0;
  const used = period ? await minutesUsedSince(db, row.id, period.start) : 0;
  // Calls can take the balance slightly below zero (a call is never cut off); that isn't owed.
  const extra = Math.max(0, await extraBalance(db, row.id));
  return {
    limited: true,
    planMinutes,
    used,
    extra,
    remaining: Math.max(0, planMinutes - used) + extra,
    periodStart: period?.start ?? null,
    periodEnd: period?.end ?? null,
  };
}

// Records a call the receptionist answered, once it has ended. If it goes past the plan's minutes
// for the month, the rest comes off the extra minutes. Recording the same call twice does nothing.
export async function recordCall({ businessId, callSid, caller, startedAt, endedAt }) {
  const seconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));
  const minutes = minutesFor(seconds);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Calls for one business are counted one at a time, so two ending together count right.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`business-minutes:${businessId}`]);
    const { rowCount } = await client.query(
      `INSERT INTO calls (business_id, call_sid, caller, started_at, ended_at, seconds, minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (call_sid) DO NOTHING`,
      [businessId, callSid, caller || null, startedAt, endedAt, seconds, minutes],
    );
    const { rows } = await client.query('SELECT * FROM businesses WHERE id = $1', [businessId]);
    const row = rows[0];
    const period = row && periodOf(row);
    if (rowCount && row?.requires_subscription && period && startedAt >= period.start) {
      const planMinutes = PLANS[row.plan]?.minutes ?? 0;
      const usedAfter = await minutesUsedSince(client, businessId, period.start);
      const pastPlan = (used) => Math.max(0, used - planMinutes);
      // Only the part of this call past the plan's minutes, not what earlier calls already took.
      const fromExtra = pastPlan(usedAfter) - pastPlan(usedAfter - minutes);
      if (fromExtra > 0) {
        await client.query(
          "INSERT INTO extra_minutes (business_id, minutes, kind, call_sid) VALUES ($1, $2, 'used', $3)",
          [businessId, -fromExtra, callSid],
        );
      }
    }
    await client.query('COMMIT');
    return { seconds, minutes };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Adds bought minutes, once per Stripe Checkout Session. Returns true if they were added now,
// false if this payment had already added them.
export async function addTopUp(businessId, minutes, checkoutSessionId) {
  const { rowCount } = await pool.query(
    `INSERT INTO extra_minutes (business_id, minutes, kind, stripe_checkout_session_id)
     VALUES ($1, $2, 'top_up', $3) ON CONFLICT (stripe_checkout_session_id) DO NOTHING`,
    [businessId, minutes, checkoutSessionId],
  );
  return rowCount > 0;
}

// What the phone server does with a new call to this business (the object from toBusiness):
//   'answer'   the receptionist answers
//   'transfer' out of minutes, and transfers are on: straight to the business's transfer number
//   'decline'  out of minutes: a short message, then hang up
export async function answerFor(business) {
  const { rows } = await pool.query('SELECT * FROM businesses WHERE id = $1', [business.id]);
  if (!rows[0]) return 'decline';
  const usage = await usageFor(rows[0]);
  if (!usage.limited || usage.remaining > 0) return 'answer';
  return business.actions.transfer.number ? 'transfer' : 'decline';
}
