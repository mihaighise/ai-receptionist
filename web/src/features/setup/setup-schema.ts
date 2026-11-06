// The setup wizard's form: its values, the checks run in the browser, and conversion to and from
// what the API sends. The API runs the same checks again (parseSettings in src/api/business-input.js).

import { z } from 'zod';
import type { BookingSettings, Business, Weekday } from '@/api/businesses';
import type { BusinessSettings } from '@/api/owner';
import { optionalPhone, phoneField } from '@/features/businesses/business-schema';
import { skillUi } from '@/features/skills';

export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// The bookings skill's settings, as the form holds them: one range of hours per day, with a switch.
const bookingSchema = z.object({
  services: z.array(z.object({ name: z.string(), minutes: z.number() })),
  days: z.record(z.enum(WEEKDAYS), z.object({ open: z.boolean(), from: z.string(), to: z.string() })),
  timeZone: z.string(),
  bufferMinutes: z.number(),
  noticeHours: z.number(),
  horizonDays: z.number(),
});
export type BookingValues = z.infer<typeof bookingSchema>;

export const setupSchema = z
  .object({
    business_type: z.string().min(1, 'Pick the kind of business.'),
    name: z.string().trim().min(1, 'Enter the business name.'),
    description: z.string().trim().min(1, 'Describe the business in a few words.'),
    address: z.string(),
    phone: z.string(),
    hours: z.string(),
    mainLanguage: z.string().min(1, 'Pick the main language.'),
    otherLanguages: z.array(z.string()),
    features: z.array(z.string()),
    transfer_number: phoneField,
    urgent_when: z.string(),
    notify_sms: phoneField,
    notify_whatsapp: phoneField,
    booking_settings: bookingSchema,
    // One question and answer per line.
    faq: z.string(),
  })
  // Each skill that's switched on checks its own settings (src/features/skills).
  .superRefine((values, ctx) => {
    for (const id of values.features) {
      for (const [field, message] of Object.entries(skillUi(id).check?.(values) ?? {})) {
        ctx.addIssue({ code: 'custom', path: [field], message });
      }
    }
  });

export type SetupValues = z.infer<typeof setupSchema>;

// The wizard's steps, in order, with the fields each one asks for.
export const STEPS = [
  {
    id: 'business',
    title: 'Your business',
    fields: ['business_type', 'name', 'description', 'address', 'phone', 'hours'],
  },
  { id: 'languages', title: 'Languages', fields: ['mainLanguage', 'otherLanguages'] },
  {
    id: 'actions',
    title: 'What it does',
    fields: ['features', 'transfer_number', 'urgent_when', 'notify_sms', 'notify_whatsapp', 'booking_settings'],
  },
  { id: 'faq', title: 'Common questions', fields: ['faq'] },
  { id: 'review', title: 'Review', fields: [] },
] as const satisfies readonly { id: string; title: string; fields: readonly (keyof SetupValues)[] }[];

// The step that asks for this field (for showing an error from the API), or -1.
export const stepOfField = (field: string) =>
  STEPS.findIndex((step) => (step.fields as readonly string[]).includes(field));

// The owner's own time zone, e.g. "America/New_York".
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

// Booking settings from the API ({} until saved) -> the form's. Weekdays 9 to 5 to start with.
export function toBookingValues(settings: Partial<BookingSettings>): BookingValues {
  const saved = Boolean(settings.hours);
  return {
    services: settings.services ?? [],
    days: Object.fromEntries(
      WEEKDAYS.map((day) => {
        const range = settings.hours?.[day]?.[0];
        return [
          day,
          {
            open: saved ? Boolean(range) : !['sat', 'sun'].includes(day),
            from: range?.from ?? '09:00',
            to: range?.to ?? '17:00',
          },
        ];
      }),
    ) as BookingValues['days'],
    timeZone: settings.timeZone ?? browserTimeZone(),
    bufferMinutes: settings.bufferMinutes ?? 0,
    noticeHours: settings.noticeHours ?? 2,
    horizonDays: settings.horizonDays ?? 30,
  };
}

export function toBookingSettings(values: BookingValues): BookingSettings {
  return {
    services: values.services.map((s) => ({ name: s.name.trim(), minutes: s.minutes })).filter((s) => s.name),
    hours: Object.fromEntries(
      WEEKDAYS.filter((day) => values.days[day].open).map((day) => [
        day,
        [{ from: values.days[day].from, to: values.days[day].to }],
      ]),
    ),
    timeZone: values.timeZone,
    bufferMinutes: values.bufferMinutes,
    noticeHours: values.noticeHours,
    horizonDays: values.horizonDays,
  };
}

export const emptySetup: SetupValues = {
  business_type: '',
  name: '',
  description: '',
  address: '',
  phone: '',
  hours: '',
  mainLanguage: 'en',
  otherLanguages: [],
  features: ['messages'],
  transfer_number: '',
  urgent_when: '',
  notify_sms: '',
  notify_whatsapp: '',
  booking_settings: toBookingValues({}),
  faq: '',
};

export function toSetupValues(business: Business): SetupValues {
  const [mainLanguage = 'en', ...otherLanguages] = business.languages;
  return {
    business_type: business.business_type,
    name: business.name,
    description: business.description,
    address: business.address,
    phone: business.phone,
    hours: business.hours,
    mainLanguage,
    otherLanguages,
    features: business.features,
    transfer_number: business.transfer_number ?? '',
    urgent_when: business.urgent_when,
    notify_sms: business.notify_sms ?? '',
    notify_whatsapp: business.notify_whatsapp ?? '',
    booking_settings: toBookingValues(business.booking_settings ?? {}),
    faq: business.faq.join('\n'),
  };
}

export function toSettings(values: SetupValues): BusinessSettings {
  return {
    business_type: values.business_type,
    name: values.name.trim(),
    description: values.description.trim(),
    address: values.address.trim(),
    phone: values.phone.trim(),
    hours: values.hours.trim(),
    // The main language first; it can't also be one of the others.
    languages: [values.mainLanguage, ...values.otherLanguages.filter((code) => code !== values.mainLanguage)],
    features: values.features,
    transfer_number: optionalPhone(values.transfer_number),
    urgent_when: values.urgent_when.trim(),
    notify_sms: optionalPhone(values.notify_sms),
    notify_whatsapp: optionalPhone(values.notify_whatsapp),
    booking_settings: toBookingSettings(values.booking_settings),
    faq: values.faq
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

// The API names fields after database columns; languages is split in two in the form.
export const setupFieldForApiField = (field: string): keyof SetupValues | null =>
  field === 'languages' ? 'mainLanguage' : field in emptySetup ? (field as keyof SetupValues) : null;
