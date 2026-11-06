-- Subscriptions. Businesses owners set up themselves need a paid plan to answer calls; businesses
-- added in the admin site (the demo businesses) don't. The subscription itself lives in Stripe;
-- these columns are a copy, kept up to date by its webhooks (src/api/billing.js).

ALTER TABLE businesses
  ADD COLUMN requires_subscription boolean NOT NULL DEFAULT false,
  -- The Stripe Customer that pays for this business. Stripe events are matched to the business by it.
  ADD COLUMN stripe_customer_id text UNIQUE,
  ADD COLUMN stripe_subscription_id text UNIQUE,
  -- Codes in src/shared/plans.js.
  ADD COLUMN plan text CHECK (plan IN ('starter', 'pro', 'business')),
  -- Stripe's subscription status: active, past_due, canceled, ...
  ADD COLUMN subscription_status text,
  -- When the current month ends: the next payment, or the end of the subscription if it cancels.
  ADD COLUMN subscription_period_end timestamptz,
  ADD COLUMN subscription_cancels boolean NOT NULL DEFAULT false;
