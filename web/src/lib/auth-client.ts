// Talks to Better Auth on the server (/api/auth, see src/api/auth.js in the repo root): sends owners
// to Google to sign in, reads the current session and signs out. It uses the page's own address,
// which forwards /api to the API.
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({ basePath: '/api/auth' });
