// The plans owners can subscribe to (docs/phase-0-decisions.md). Each is a Stripe Product with a
// monthly Price, found by its lookup key; npm run stripe:setup creates them. The plan CHECK in
// db/migrations must list the same codes.

export const PLANS = {
  starter: { name: 'Starter', priceCents: 7900, minutes: 200, lookupKey: 'bivoz_starter_monthly' },
  pro: { name: 'Pro', priceCents: 17900, minutes: 600, lookupKey: 'bivoz_pro_monthly' },
  business: { name: 'Business', priceCents: 34900, minutes: 1500, lookupKey: 'bivoz_business_monthly' },
};

// Stripe subscription statuses that keep a business answering calls. past_due is included: Stripe
// is still retrying the payment, and cancels the subscription if every retry fails.
export const PAID_STATUSES = ['active', 'trialing', 'past_due'];

export const isPaid = (status) => PAID_STATUSES.includes(status);

// Stripe Price lookup key -> plan code, or null.
export const planForLookupKey = (lookupKey) =>
  Object.keys(PLANS).find((code) => PLANS[code].lookupKey === lookupKey) ?? null;
