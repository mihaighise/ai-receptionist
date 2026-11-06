-- Call history and releasing numbers.
--
-- Calls now keep what happened on them, for the owner app's call history: whether the caller was
-- transferred, and the message taken (caller_name, callback_number, message, urgent), if any.
ALTER TABLE calls
  ADD COLUMN transferred boolean NOT NULL DEFAULT false,
  ADD COLUMN message jsonb;
CREATE INDEX calls_business_recent_idx ON calls (business_id, started_at DESC, id DESC);

-- When the subscription ended (Stripe's ended_at). A number the app bought is released a few days
-- after that (src/api/phone-numbers.js), unless the owner subscribes again.
ALTER TABLE businesses ADD COLUMN subscription_ended_at timestamptz;

-- A bought number that has been released: status 'released'. release_error: why the last try
-- failed (it's tried again later).
ALTER TABLE phone_number_orders DROP CONSTRAINT phone_number_orders_status_check;
ALTER TABLE phone_number_orders ADD CONSTRAINT phone_number_orders_status_check
  CHECK (status IN ('dry_run', 'buying', 'bought', 'failed', 'released'));
ALTER TABLE phone_number_orders
  ADD COLUMN released_at timestamptz,
  ADD COLUMN release_error text;
