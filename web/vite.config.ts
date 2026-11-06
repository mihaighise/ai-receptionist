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
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
