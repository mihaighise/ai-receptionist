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
});
delete process.env.ADMIN_PASSWORD;
