// A stand-in for the Twilio client in tests: number searches answer from `available` (area code
// -> numbers, '' for anywhere), purchases succeed unless fail() set an error, releases succeed
// unless failRelease() did, and every call is recorded in `calls`. Nothing reaches Twilio.

export function fakeTwilio({ available = { '': ['+12025550123'] }, failWith = null } = {}) {
  const calls = [];
  let bought = 0;
  let releaseError = null;
  // Like Twilio, a number that's been bought isn't offered again.
  const taken = new Set();
  // incomingPhoneNumbers(sid).remove() releases a number; incomingPhoneNumbers.create() buys one.
  const incomingPhoneNumbers = (sid) => ({
    remove: async () => {
      calls.push(['release', sid]);
      if (releaseError) throw releaseError;
      return true;
    },
  });
  incomingPhoneNumbers.create = async (params) => {
    calls.push(['buy', params]);
    // Twilio is slow to answer, so purchases at the same time really overlap.
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (failWith) throw new Error(failWith);
    taken.add(params.phoneNumber);
    return { sid: `PN${String(++bought).padStart(32, '0')}`, phoneNumber: params.phoneNumber };
  };
  const twilio = {
    availablePhoneNumbers: (country) => ({
      local: {
        list: async (filter) => {
          calls.push(['search', country, filter]);
          const numbers = (available[filter.areaCode ? String(filter.areaCode) : ''] ?? []).filter((n) => !taken.has(n));
          return numbers.slice(0, filter.limit).map((phoneNumber) => ({ phoneNumber }));
        },
      },
    }),
    incomingPhoneNumbers,
  };
  return {
    twilio,
    calls,
    fail: (message) => (failWith = message),
    // error: what remove() throws, e.g. Object.assign(new Error('...'), { status: 404 }); null to succeed.
    failRelease: (error) => (releaseError = error),
  };
}

// A Twilio client that fails the test if anything uses it (for dry runs and 'off').
export const untouchableTwilio = new Proxy({}, {
  get: (_target, name) => {
    throw new Error(`Twilio was used (${String(name)}), but this test must not reach Twilio`);
  },
});
