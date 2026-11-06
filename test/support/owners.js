// Signed-in owners for tests, made with Better Auth's test plugin: a real user and session, as if
// they had signed in with Google, without going through Google.

import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { authOptions } from '../../src/api/auth.js';

let helpers;
const testHelpers = async () => (helpers ??= (await betterAuth({ ...authOptions, plugins: [testUtils()] }).$context).test);

// Creates an owner and signs them in. Returns the user, and their session as a Cookie header (for
// fetch) and as cookies (for a browser).
export async function signedInOwner({ email = 'owner@example.com', name = 'Test Owner' } = {}) {
  const test = await testHelpers();
  const user = await test.saveUser(test.createUser({ email, name, emailVerified: true }));
  const { headers, cookies } = await test.login({ userId: user.id });
  return { user, cookie: headers.get('cookie'), cookies };
}
