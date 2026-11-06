// A stand-in for the Twilio client in tests: number searches answer from `available` (area code
// -> numbers, '' for anywhere), purchases succeed unless `failWith` is set, and every call is
// recorded in `calls`. Nothing reaches Twilio.

export function fakeTwilio({ available = { '': ['+12025550123'] }, failWith = null } = {}) {
  const calls = [];
  let bought = 0;
  const twilio = {
    availablePhoneNumbers: (country) => ({
      local: {
        list: async (filter) => {
          calls.push(['search', country, filter]);
          const numbers = available[filter.areaCode ? String(filter.areaCode) : ''] ?? [];
          return numbers.slice(0, filter.limit).map((phoneNumber) => ({ phoneNumber }));
        },
      },
    }),
    incomingPhoneNumbers: {
      create: async (params) => {
        calls.push(['buy', params]);
        // Twilio is slow to answer, so purchases at the same time really overlap.
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (failWith) throw new Error(failWith);
        return { sid: `PN${String(++bought).padStart(32, '0')}`, phoneNumber: params.phoneNumber };
      },
    },
  };
  return { twilio, calls, fail: (message) => (failWith = message) };
}

// A Twilio client that fails the test if anything uses it (for dry runs and 'off').
export const untouchableTwilio = new Proxy({}, {
  get: (_target, name) => {
    throw new Error(`Twilio was used (${String(name)}), but this test must not reach Twilio`);
  },
});
