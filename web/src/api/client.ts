// fetch() wrapper for the API (src/api in the repo root). In development Vite forwards /api to it
// (vite.config.ts); in Docker nginx does (nginx.conf).

// An error response from the API. `fields` maps a field name to what's wrong with it, so forms
// can show the message next to the right input.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.fields);
  return data as T;
}
