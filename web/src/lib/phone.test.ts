import { COUNTRIES, formatPhone, joinPhone, splitPhone } from './phone';

test('numbers are shown as the country code, then the number with spaces', () => {
  expect(formatPhone('+18312490526')).toBe('+1 831 249 0526');
  expect(formatPhone('+1 (831) 249-0526')).toBe('+1 831 249 0526');
  expect(formatPhone('+40700000000')).toBe('+40 700 000 000');
  expect(formatPhone('+442079460958')).toBe('+44 20 7946 0958');
  expect(formatPhone('')).toBe('');
  expect(formatPhone(null)).toBe('');
  expect(formatPhone('call the front desk')).toBe('call the front desk');
});

test('typing adds the spaces as it goes', () => {
  expect(joinPhone('US', '512')).toEqual({ country: 'US', national: '512', value: '+1 512' });
  expect(joinPhone('US', '5125550')).toEqual({ country: 'US', national: '512 555 0', value: '+1 512 555 0' });
  expect(joinPhone('US', '(512) 555-0100')).toEqual({
    country: 'US',
    national: '512 555 0100',
    value: '+1 512 555 0100',
  });
  expect(joinPhone('US', '')).toEqual({ country: 'US', national: '', value: '' });
});

test('pasting a full number switches to its country', () => {
  expect(joinPhone('US', '+44 20 7946 0958')).toEqual({
    country: 'GB',
    national: '20 7946 0958',
    value: '+44 20 7946 0958',
  });
  expect(joinPhone('US', '+40700000000')).toEqual({ country: 'RO', national: '700 000 000', value: '+40 700 000 000' });
});

test('numbers from the server open in the right country', () => {
  expect(splitPhone('+18312490526')).toEqual({ country: 'US', national: '831 249 0526', value: '+1 831 249 0526' });
  expect(splitPhone('+40700000000').country).toBe('RO');
  // A made-up US number has no real country; its calling code decides.
  expect(splitPhone('+1 555 010 0000')).toMatchObject({ country: 'US', national: '555 010 0000' });
  expect(splitPhone('')).toEqual({ country: 'US', national: '' });
});

test('every country is listed once, the United States first', () => {
  expect(COUNTRIES[0]).toMatchObject({ code: 'US', dial: '1', flag: '🇺🇸', name: 'United States' });
  expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
  expect(COUNTRIES.find((c) => c.code === 'RO')).toMatchObject({ dial: '40', name: 'Romania' });
});

test("a national number's leading 0 is dropped where the country drops it", () => {
  expect(joinPhone('RO', '0700 000 000')).toEqual({ country: 'RO', national: '700 000 000', value: '+40 700 000 000' });
  expect(joinPhone('GB', '020 7946 0958').value).toBe('+44 20 7946 0958');
  expect(joinPhone('IT', '06 1234 5678').value).toBe('+39 06 1234 5678');
});
