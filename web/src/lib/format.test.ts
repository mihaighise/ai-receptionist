import { formatDay, formatDuration } from './format';

test('durations are in minutes and seconds', () => {
  expect([0, 45, 60, 151, 3600].map(formatDuration)).toEqual(['0 s', '45 s', '1 min', '2 min 31 s', '60 min']);
});

test('days are relative when recent', () => {
  const now = new Date(2026, 10, 6, 15, 0);
  expect(formatDay(new Date(2026, 10, 6, 9, 0).toISOString(), now)).toBe('Today');
  expect(formatDay(new Date(2026, 10, 5, 23, 59).toISOString(), now)).toBe('Yesterday');
  expect(formatDay(new Date(2026, 10, 4, 12, 0).toISOString(), now)).toBe('Wednesday, November 4');
  expect(formatDay(new Date(2025, 11, 24, 12, 0).toISOString(), now)).toBe('Wednesday, December 24, 2025');
});
