// Skill: book appointments into the owner's calendar (src/integrations/calendars). The
// receptionist finds open times with check_availability (the business's bookable hours, minus
// what's busy in the calendar) and books one with book_appointment, after reading the details back.
// The event goes straight into the calendar; the call history shows it too (the bookings table).
//
// It's only offered on calls once the owner has connected a calendar and listed what can be
// booked. The parts every skill has are described in ../index.js.

import { calendarOf } from '../../integrations/calendars/index.js';
import { APP_NAME } from '../../shared/brand.js';
import { pool } from '../../shared/db/pool.js';
import {
  addDays,
  bookingSettingsProblem,
  isDate,
  localDate,
  localTime,
  openSlots,
  readBookingSettings,
  spokenTime,
  zonedTime,
} from './slots.js';

// Times offered per answer, so the receptionist can read a few out instead of a long list.
const MAX_TIMES = 8;
// Days looked at after a full day, for "the next open times".
const LOOK_AHEAD_DAYS = 7;

const minutesText = (minutes) =>
  minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : minutes > 60 ? `${Math.floor(minutes / 60)} hour${minutes >= 120 ? 's' : ''} ${minutes % 60} minutes` : `${minutes} minutes`;

export default {
  id: 'bookings',
  label: 'Book appointments in your calendar',

  // The settings are one JSON column, read by readBookingSettings (a function rather than a kind).
  settings: { booking_settings: readBookingSettings },

  // Only checked when they're being saved (the admin site doesn't send them).
  validate(values) {
    if (values.booking_settings === undefined) return {};
    const problem = bookingSettingsProblem(values.booking_settings);
    return problem ? { booking_settings: problem } : {};
  },

  // Offered once it's on, the owner has connected a calendar, and something can be booked.
  actions: (row, on) => {
    const settings = readBookingSettings(row.booking_settings ?? {});
    const ready = on && row.calendar_connected && !bookingSettingsProblem(settings);
    return { bookings: ready ? { ...settings, ownerId: row.owner_id } : null };
  },
  live: (business) => Boolean(business.actions.bookings),
  // Lets the core and the messages skill leave booking to this skill.
  books: true,

  prompt: {
    capabilities: ({ actions }, { now = new Date() } = {}) => {
      const { services, timeZone } = actions.bookings;
      const list = services.map((service) => `${service.name} (${minutesText(service.minutes)})`).join(', ');
      const today = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
      return [
        `- You can book appointments in the business's calendar: ${list}. When a caller wants one, make sure you know which, then use check_availability for the day they'd like and offer two or three of the times it returns. Only offer times check_availability returned. Before booking, read back the appointment, the day and time, and the caller's name and callback number, then use book_appointment.`,
        `- Today is ${today} (${timeZone}). Work out dates like "tomorrow" or "next Tuesday" from that, and use the format YYYY-MM-DD in the tools.`,
      ];
    },
  },

  tools: ({ actions }) => {
    const names = actions.bookings.services.map((service) => service.name);
    return [
      {
        name: 'check_availability',
        description: 'Find open times for an appointment on a day. If that day is full, it also says the next open times.',
        eager_input_streaming: true,
        input_schema: {
          type: 'object',
          properties: {
            appointment: { type: 'string', enum: names, description: 'What the caller wants to book' },
            date: { type: 'string', description: 'The day, YYYY-MM-DD' },
          },
          required: ['appointment', 'date'],
        },
      },
      {
        name: 'book_appointment',
        description: 'Book an appointment at a time check_availability offered, after reading the details back to the caller.',
        eager_input_streaming: true,
        input_schema: {
          type: 'object',
          properties: {
            appointment: { type: 'string', enum: names },
            date: { type: 'string', description: 'YYYY-MM-DD' },
            time: { type: 'string', description: '24-hour time, HH:MM, as check_availability gave it' },
            caller_name: { type: 'string' },
            callback_number: { type: 'string' },
            notes: { type: 'string', description: 'Anything the staff should know, e.g. the address or the problem' },
          },
          required: ['appointment', 'date', 'time', 'caller_name', 'callback_number'],
        },
      },
    ];
  },

  startCall({ business, call }) {
    const settings = business.actions.bookings;
    const booked = [];
    const serviceNamed = (name) => settings.services.find((service) => service.name === name);

    // Open start times on a date, read from the calendar.
    async function timesOn(calendar, date, minutes) {
      const from = zonedTime(date, '00:00', settings.timeZone);
      const to = zonedTime(addDays(date, 1), '00:00', settings.timeZone);
      return openSlots({ date, minutes, settings, busy: await calendar.busy(from, to) });
    }

    async function checkAvailability(calendar, { appointment, date }, result) {
      const service = serviceNamed(appointment);
      if (!service) return result(`Unknown appointment "${appointment}". Choose one of: ${settings.services.map((s) => s.name).join(', ')}.`, true);
      if (!isDate(date)) return result('Give the date as YYYY-MM-DD.', true);
      if (date < localDate(new Date(), settings.timeZone)) return result('That day is in the past; ask which day they mean.', true);
      const times = await timesOn(calendar, date, service.minutes);
      const list = (slots) => slots.slice(0, MAX_TIMES).map((slot) => `${localTime(slot, settings.timeZone)} (${spokenTime(slot, settings.timeZone)})`).join(', ');
      if (times.length) return result(`Open times for ${service.name} on ${date}: ${list(times)}.`);
      for (let n = 1; n <= LOOK_AHEAD_DAYS; n++) {
        const next = addDays(date, n);
        const later = await timesOn(calendar, next, service.minutes);
        if (later.length) return result(`Nothing open on ${date}. The next open times are on ${next}: ${list(later)}.`);
      }
      return result(`Nothing open in the ${LOOK_AHEAD_DAYS + 1} days from ${date}. Offer to take a message so the team can call back.`);
    }

    async function bookAppointment(calendar, input, result) {
      const service = serviceNamed(input.appointment);
      if (!service) return result(`Unknown appointment "${input.appointment}".`, true);
      if (!isDate(input.date) || !/^\d{2}:\d{2}$/.test(input.time ?? '')) return result('Give the date as YYYY-MM-DD and the time as HH:MM.', true);
      if (!input.caller_name?.trim() || !input.callback_number?.trim()) return result("Ask for the caller's name and callback number first.", true);
      const start = zonedTime(input.date, input.time, settings.timeZone);
      // Checked again just before booking: the time may have been taken since it was offered.
      const open = await timesOn(calendar, input.date, service.minutes);
      if (!open.some((slot) => slot.getTime() === start.getTime())) {
        return result('That time is no longer open. Use check_availability again and offer other times.', true);
      }
      const end = new Date(start.getTime() + service.minutes * 60_000);
      const notes = input.notes?.trim() ?? '';
      const eventId = await calendar.createEvent({
        title: `${service.name}: ${input.caller_name.trim()}`,
        description: [
          `Name: ${input.caller_name.trim()}`,
          `Phone: ${input.callback_number.trim()}`,
          ...(notes ? [`Notes: ${notes}`] : []),
          '',
          `Booked by ${APP_NAME} on a call from ${call.from || 'an unknown number'}.`,
        ].join('\n'),
        start,
        end,
        timeZone: settings.timeZone,
      });
      await pool.query(
        `INSERT INTO bookings (business_id, call_sid, service, starts_at, ends_at, caller_name, caller_number, notes, provider, event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [business.id, call.callSid, service.name, start, end, input.caller_name.trim(), input.callback_number.trim(), notes, calendar.provider, eventId],
      );
      booked.push({ service: service.name, starts_at: start.toISOString() });
      console.log(`Booked ${service.name} on ${start.toISOString()} for ${business.name}`);
      return result(`Booked: ${service.name} on ${spokenTime(start, settings.timeZone)}. Tell the caller it's confirmed.`);
    }

    return {
      async run(block, result) {
        if (block.name !== 'check_availability' && block.name !== 'book_appointment') return null;
        try {
          const calendar = await calendarOf(settings.ownerId);
          if (!calendar) return result("The calendar isn't connected right now. Offer to take a message instead.", true);
          return block.name === 'check_availability'
            ? await checkAvailability(calendar, block.input ?? {}, result)
            : await bookAppointment(calendar, block.input ?? {}, result);
        } catch (err) {
          console.error(`${block.name} failed for ${business.name}:`, err.message);
          return result("The calendar couldn't be reached. Apologize, and offer to take a message so the team can book it.", true);
        }
      },
      close() {},
      outcome: () => ({ bookings: booked }),
    };
  },
};
