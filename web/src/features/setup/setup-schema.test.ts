import type { Business } from '@/api/businesses';
import { emptySetup, STEPS, setupSchema, stepOfField, toSettings, toSetupValues } from './setup-schema';

const business: Business = {
  id: '6a080970-e7cb-48ad-afe0-1a95e84c9593',
  slug: 'sunrise-dental',
  name: 'Sunrise Dental',
  description: 'a family dental clinic',
  business_type: 'clinic',
  address: '123 Main Street',
  hours: 'Monday to Friday',
  phone: '+1 555 010 0000',
  faq: ['New patients are welcome.', 'Most insurance is accepted.'],
  twilio_number: '+18312490526',
  languages: ['en', 'es'],
  features: ['messages', 'transfers'],
  transfer_number: '+15550100001',
  notify_sms: null,
  notify_whatsapp: '+40700000000',
  urgent_when: 'the caller is in severe pain',
  booking_settings: {
    services: [{ name: 'Checkup', minutes: 60 }],
    hours: { mon: [{ from: '08:00', to: '12:00' }], sat: [{ from: '09:00', to: '13:00' }] },
    timeZone: 'America/Chicago',
    bufferMinutes: 15,
    noticeHours: 24,
    horizonDays: 60,
  },
  active: true,
  owner_id: 'user-1',
  owner_email: 'owner@example.com',
  requires_subscription: false,
  plan: null,
  subscription_status: null,
  subscription_period_end: null,
  subscription_cancels: false,
  created_at: '2026-11-05T00:00:00Z',
};

const filled = {
  ...emptySetup,
  business_type: 'home_services',
  name: 'Rapid Flow Plumbing',
  description: 'a plumber',
  notify_sms: '+15125550100',
};
const errorsFor = (values: object) =>
  setupSchema.safeParse(values).error?.issues.map((issue) => issue.path.join('.')) ?? [];

test('the settings an owner can change survive the round trip through the wizard unchanged', () => {
  const { business_type, name, description, address, hours, phone, faq, languages, features } = business;
  const { transfer_number, notify_sms, notify_whatsapp, urgent_when, booking_settings } = business;
  expect(toSettings(toSetupValues(business))).toEqual({
    business_type,
    name,
    description,
    address,
    hours,
    phone,
    faq,
    languages,
    features,
    transfer_number,
    notify_sms,
    notify_whatsapp,
    urgent_when,
    booking_settings,
  });
});

test('a filled-in first step with somewhere to send messages is valid', () => {
  expect(errorsFor(filled)).toEqual([]);
});

test('taking messages needs a number to send them to', () => {
  expect(errorsFor({ ...filled, notify_sms: '' })).toEqual(['notify_sms']);
  expect(errorsFor({ ...filled, notify_sms: '', notify_whatsapp: '+40700000000' })).toEqual([]);
  expect(errorsFor({ ...filled, notify_sms: '', features: [] })).toEqual([]);
});

test('transfers need a number to transfer to', () => {
  expect(errorsFor({ ...filled, features: ['messages', 'transfers'] })).toEqual(['transfer_number']);
});

test('bookings need something to book, and open hours that end after they start', () => {
  const bookings = { ...filled, features: ['messages', 'bookings'] };
  expect(errorsFor(bookings)).toEqual(['booking_settings']);
  const services = [{ name: 'Haircut', minutes: 45 }];
  const withServices = { ...bookings, booking_settings: { ...filled.booking_settings, services } };
  expect(errorsFor(withServices)).toEqual([]);
  const days = { ...filled.booking_settings.days, mon: { open: true, from: '17:00', to: '09:00' } };
  expect(errorsFor({ ...withServices, booking_settings: { ...withServices.booking_settings, days } })).toEqual([
    'booking_settings',
  ]);
});

test("booking hours start as weekdays 9 to 5, in the owner's time zone", () => {
  const { days, timeZone } = emptySetup.booking_settings;
  expect(days.mon).toEqual({ open: true, from: '09:00', to: '17:00' });
  expect(days.sun.open).toBe(false);
  expect(timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('every field is asked for on some step', () => {
  for (const field of Object.keys(emptySetup)) expect(stepOfField(field)).toBeGreaterThanOrEqual(0);
  expect(STEPS.at(-1)?.id).toBe('review');
});

test('the kind of business must be picked', () => {
  expect(errorsFor({ ...filled, business_type: '' })).toEqual(['business_type']);
});
