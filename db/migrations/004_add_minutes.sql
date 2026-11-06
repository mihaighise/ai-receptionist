-- Call minutes. Every answered call is recorded; a plan includes some minutes each billing month
-- (src/shared/plans.js), and owners can buy extra minutes that don't expire. src/shared/usage.js
-- does the counting.

-- One row per call the receptionist answered, written when the call ends.
CREATE TABLE calls (
  id          bigserial PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_sid    text NOT NULL UNIQUE,
  caller      text,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL,
  seconds     integer NOT NULL CHECK (seconds >= 0),
  -- seconds rounded up to whole minutes, the way Twilio bills calls.
  minutes     integer NOT NULL CHECK (minutes >= 0)
);
CREATE INDEX calls_business_started_idx ON calls (business_id, started_at);

-- Extra minutes: + when bought, - when a call goes past the plan's minutes. The sum is what's left.
CREATE TABLE extra_minutes (
  id          bigserial PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  minutes     integer NOT NULL,
  -- top_up: bought; used: taken by a call; adjustment: changed by hand.
  kind        text NOT NULL CHECK (kind IN ('top_up', 'used', 'adjustment')),
  -- The Stripe Checkout Session a top-up was paid with, so each payment adds minutes only once.
  stripe_checkout_session_id text UNIQUE,
  call_sid    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX extra_minutes_business_idx ON extra_minutes (business_id);

-- When the current billing month started, so minutes are counted from then.
ALTER TABLE businesses ADD COLUMN subscription_period_start timestamptz;
