import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // The API (npm run api in the repo root) answers /api; the browser only talks to Vite.
    // xfwd passes on the visitor's address (X-Forwarded-For), for the API's rate limits.
    proxy: { '/api': { target: process.env.API_URL ?? 'http://localhost:3001', xfwd: true } },
  },
  test: {
    // Unit tests only; the browser tests in e2e/ run with Playwright (npm run test:e2e).
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
