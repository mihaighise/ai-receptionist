// Settings for every test, loaded before anything else (node --import, and web/playwright.config.ts).
// Tests use their own database and made-up keys, and never read .env, so they can't touch real
// data or accounts. TEST_DATABASE_URL picks another test database.

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://receptionist:receptionist@localhost:5433/receptionist_test';

Object.assign(process.env, {
  DATABASE_URL: TEST_DATABASE_URL,
  // The address of the web app the browser tests start (web/playwright.config.ts).
  BETTER_AUTH_URL: 'http://localhost:5199',
  BETTER_AUTH_SECRET: 'test-only-secret-never-used-for-real-sessions',
  // Turns on the Google button. Nothing is ever sent to Google with them.
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  // Where bought Twilio numbers would point. Numbers are only ever bought by a fake Twilio client.
  PUBLIC_URL: 'https://phone.test',
  TWILIO_BUY_NUMBERS: 'dry-run',
  // Nothing listens here, so a request to Claude that a test didn't fake fails at once instead of
  // reaching the real API (tests fake Claude with test/support/fake-claude.js).
  ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
});
// Billing is off unless a test turns it on with a fake Stripe client (test/support/fake-stripe.js), and
// there are no Twilio keys, so nothing can reach Twilio (tests use test/support/fake-twilio.js).
const REAL_KEYS = ['ADMIN_PASSWORD', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'];
for (const name of [...REAL_KEYS, 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_PROFILE']) {
  delete process.env[name];
}
