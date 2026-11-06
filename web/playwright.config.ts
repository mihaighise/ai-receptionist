// Browser tests (npm run test:e2e). They start their own API and web app on test ports, using the
// test database and made-up keys (../test/support/env.js), so they run next to the dev servers and
// Docker without touching real data. They use the Google Chrome installed on this computer.

import { defineConfig } from '@playwright/test';
import '../test/support/env.js';

const API_PORT = 3101;
const WEB_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:5199';

export default defineConfig({
  testDir: 'e2e',
  // The tests share one database, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Sets up the test database first; the API then migrates it like the real one.
      command: `node --import ./test/support/env.js test/support/database.js && node --import ./test/support/env.js src/api/server.js`,
      cwd: '..',
      env: { API_PORT: String(API_PORT), API_HOST: '127.0.0.1' },
      url: `http://localhost:${API_PORT}/api/owner/providers`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${new URL(WEB_URL).port} --strictPort`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      url: WEB_URL,
      reuseExistingServer: false,
    },
  ],
});
