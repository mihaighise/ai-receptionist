// Runs the API (src/api/app.js) on a free port for a test file, and sends it requests.

import { once } from 'node:events';
import { createApp } from '../../src/api/app.js';

// options: passed to createApp, e.g. a fake Stripe client.
export async function startApi(options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;

  // Returns { status, body }. body is sent as JSON, or raw (a string) as is; cookie is a signed-in
  // owner's Cookie header.
  const request = async (method, path, { body, raw, cookie, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...((body !== undefined || raw !== undefined) && { 'Content-Type': 'application/json' }),
        ...(cookie && { Cookie: cookie }),
        ...headers,
      },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) };
  };
  // The response itself, for redirects and pages: fetch options as given.
  const raw = (path, options) => fetch(base + path, options);
  return { request, raw, close: () => new Promise((resolve) => server.close(resolve)) };
}
