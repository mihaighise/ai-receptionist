// Open appointment times: the business's bookable hours on a day, in its time zone, minus what's
// busy in the calendar (with a gap around each appointment), too soon, or too far ahead. Also the
// booking settings themselves: reading and checking them.

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_BOOKING_SETTINGS = {
  services: [],
  hours: { mon: [{ from: '09:00', to: '17:00' }], tue: [{ from: '09:00', to: '17:00' }], wed: [{ from: '09:00', to: '17:00' }], thu: [{ from: '09:00', to: '17:00' }], fri: [{ from: '09:00', to: '17:00' }] },
  timeZone: 'America/New_York',
  bufferMinutes: 0,
  noticeHours: 2,
  horizonDays: 30,
};

export const isTimeZone = (zone) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return typeof zone === 'string' && zone.length > 0;
  } catch {
    return false;
  }
};

const int = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const text = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

// A request body's booking settings -> clean settings (anything unusable is dropped or defaulted).
export function readBookingSettings(raw) {
  if (raw === undefined) return undefined;
  const value = raw && typeof raw === 'object' ? raw : {};
  const services = (Array.isArray(value.services) ? value.services : [])
    .map((service) => ({ name: text(service?.name).slice(0, 60), minutes: int(service?.minutes, 5, 480, 0) }))
    .filter((service) => service.name && service.minutes)
    .slice(0, 20);
  const hours = {};
  for (const day of DAYS) {
    const ranges = (Array.isArray(value.hours?.[day]) ? value.hours[day] : [])
      .filter((range) => TIME.test(range?.from) && TIME.test(range?.to) && range.from < range.to)
      .map(({ from, to }) => ({ from, to }))
      .slice(0, 3);
    if (ranges.length) hours[day] = ranges;
  }
  return {
    services,
    hours,
    timeZone: isTimeZone(value.timeZone) ? value.timeZone : DEFAULT_BOOKING_SETTINGS.timeZone,
    bufferMinutes: int(value.bufferMinutes, 0, 240, 0),
    noticeHours: int(value.noticeHours, 0, 336, 2),
    horizonDays: int(value.horizonDays, 1, 365, 30),
  };
}

// Settings a booking can't work without -> a message, or null.
export function bookingSettingsProblem(settings) {
  if (!settings?.services.length) return 'Add at least one thing callers can book, with how long it takes.';
  if (!Object.keys(settings.hours).length) return 'Choose the days and hours appointments can be booked.';
  return null;
}

// How far ahead of UTC a time zone is at an instant, in minutes.
function offsetMinutes(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asUtc - instant.getTime()) / 60_000;
}

// "2026-11-12" at "10:00" in a time zone -> that instant. Daylight saving is taken into account.
export function zonedTime(date, time, timeZone) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, min);
  const first = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  // Near a daylight-saving change the offset can differ at the result; check once more.
  return new Date(wall - offsetMinutes(new Date(first), timeZone) * 60_000);
}

// An instant -> its date in a time zone, "2026-11-12".
export const localDate = (instant, timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);

// "2026-11-12" -> "thu"
export const weekdayOf = (date) => DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];

// "2026-11-12" + n days
export const addDays = (date, n) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const isDate = (value) => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value));

// An instant -> "10:00" in a time zone (24-hour, what book_appointment takes).
export const localTime = (instant, timeZone) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);

// An instant -> "Thursday, November 12 at 10:00 AM", as the receptionist says it.
export function spokenTime(instant, timeZone) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(instant);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(instant);
  return `${day} at ${time}`;
}

// The open start times on a date for an appointment of `minutes`, as Dates. busy: [{ start, end }]
// (Dates or ISO strings) from the calendar.
export function openSlots({ date, minutes, settings, busy, now = new Date() }) {
  const { hours, timeZone, bufferMinutes, noticeHours, horizonDays } = settings;
  const earliest = now.getTime() + noticeHours * 3_600_000;
  const latest = now.getTime() + horizonDays * 86_400_000;
  const gap = bufferMinutes * 60_000;
  const length = minutes * 60_000;
  // Start times every 30 minutes, or every 15 for short appointments.
  const step = (minutes < 30 ? 15 : 30) * 60_000;
  const taken = busy.map(({ start, end }) => [new Date(start).getTime(), new Date(end).getTime()]);
  const slots = [];
  for (const { from, to } of hours[weekdayOf(date)] ?? []) {
    const close = zonedTime(date, to, timeZone).getTime();
    for (let start = zonedTime(date, from, timeZone).getTime(); start + length <= close; start += step) {
      const end = start + length;
      if (start < earliest || start > latest) continue;
      if (taken.some(([s, e]) => s - gap < end && e + gap > start)) continue;
      slots.push(new Date(start));
    }
  }
  return slots;
}
