// Runs the API (src/api/app.js) on a free port for a test file, and sends it requests.

import { once } from 'node:events';
import { createApp } from '../../src/api/app.js';

export async function startApi() {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;

  // Returns { status, body }. cookie: a signed-in owner's Cookie header.
  const request = async (method, path, { body, cookie } = {}) => {
    const headers = { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) };
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
  };
  return { request, close: () => new Promise((resolve) => server.close(resolve)) };
}
