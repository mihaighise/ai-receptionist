-- Twilio numbers bought for businesses automatically, once their plan is paid for
-- (src/api/phone-numbers.js). One row per attempt.

CREATE TABLE phone_number_orders (
  id           bigserial PRIMARY KEY,
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  -- dry_run: what would have been bought, without calling Twilio (TWILIO_BUY_NUMBERS=dry-run).
  -- buying:  being bought now. bought: done. failed: see error; the next payment event tries again.
  status       text NOT NULL CHECK (status IN ('dry_run', 'buying', 'bought', 'failed')),
  -- The area code searched first, from the business's own phone number.
  area_code    text,
  phone_number text,
  twilio_sid   text,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- At most one number being bought or bought per business, so two payment events arriving at once
-- (the webhook and the owner coming back from Checkout) can't buy two.
CREATE UNIQUE INDEX phone_number_orders_one_live_idx ON phone_number_orders (business_id)
  WHERE status IN ('buying', 'bought');
CREATE INDEX phone_number_orders_business_idx ON phone_number_orders (business_id, created_at);

-- The bought number's Twilio ID (PN...), to change or release it later.
ALTER TABLE businesses ADD COLUMN twilio_number_sid text;
