import type { Business } from '@/api/businesses';
import { businessFormSchema, emptyBusiness, slugify, toFormValues, toInput } from './business-schema';

const business: Business = {
  id: '6a080970-e7cb-48ad-afe0-1a95e84c9593',
  slug: 'sunrise-dental',
  name: 'Sunrise Dental',
  description: 'a family dental clinic',
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
  active: true,
  created_at: '2026-11-05T00:00:00Z',
};

test('a business survives the round trip through the form unchanged', () => {
  const { id, created_at, ...input } = business;
  expect(toInput(toFormValues(business))).toEqual(input);
});

test('phone numbers are saved in Twilio format, and empty ones as null', () => {
  const input = toInput({ ...emptyBusiness, twilio_number: ' +1 (831) 249-0526 ', notify_sms: '  ' });
  expect(input.twilio_number).toBe('+18312490526');
  expect(input.notify_sms).toBeNull();
});

test('FAQ lines are trimmed and blank lines dropped', () => {
  expect(toInput({ ...emptyBusiness, faq: ' One. \n\n  \nTwo.' }).faq).toEqual(['One.', 'Two.']);
});

test('the main language comes first and is never repeated', () => {
  expect(toInput({ ...emptyBusiness, mainLanguage: 'es', otherLanguages: ['es', 'en'] }).languages).toEqual([
    'es',
    'en',
  ]);
});

test('slugify makes a URL-safe slug from a name', () => {
  expect(slugify('Northside Heating & Air')).toBe('northside-heating-air');
  expect(slugify('  Café Olé! ')).toBe('cafe-ole');
});

test('the form explains what is missing or wrong', () => {
  const result = businessFormSchema.safeParse({
    ...emptyBusiness,
    slug: 'Bad Slug',
    twilio_number: '12345',
    features: ['transfers'],
  });
  expect(result.success).toBe(false);
  const fields = Object.fromEntries(result.error?.issues.map((issue) => [issue.path[0], issue.message]) ?? []);
  expect(Object.keys(fields).sort()).toEqual(['description', 'name', 'slug', 'transfer_number', 'twilio_number']);
});

test('a filled-in form passes', () => {
  expect(businessFormSchema.safeParse(toFormValues(business)).success).toBe(true);
});
