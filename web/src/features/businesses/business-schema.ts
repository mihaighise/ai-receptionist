// The business form: its values, the checks run in the browser before saving, and conversion to
// and from what the API sends. The API runs the same checks again (src/api/admin/routes.js), and its
// field messages are shown the same way, so the browser checks only make mistakes show up sooner.

import { z } from 'zod';
import type { Business, BusinessInput } from '@/api/businesses';

const E164 = /^\+[1-9]\d{6,14}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "+1 (831) 249-0526" -> "+18312490526", the format Twilio uses.
export const normalizePhone = (value: string) => value.trim().replace(/[\s().-]/g, '');

// "Northside Heating & Air" -> "northside-heating-air"
export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// An optional phone number in international format.
export const phoneField = z
  .string()
  .refine(
    (value) => !value.trim() || E164.test(normalizePhone(value)),
    'Enter a complete phone number, e.g. +1 800 555 0100.',
  );

export const businessFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the business name.'),
    slug: z.string().trim().regex(SLUG, 'Use lowercase letters, numbers and dashes, e.g. rapid-flow-plumbing.'),
    description: z.string().trim().min(1, 'Describe the business in a few words.'),
    business_type: z.string(),
    address: z.string(),
    phone: z.string(),
    hours: z.string(),
    // One fact per line.
    faq: z.string(),
    twilio_number: phoneField,
    mainLanguage: z.string().min(1, 'Pick the main language.'),
    otherLanguages: z.array(z.string()),
    features: z.array(z.string()),
    transfer_number: phoneField,
    urgent_when: z.string(),
    notify_sms: phoneField,
    notify_whatsapp: phoneField,
    owner_email: z.string().refine((value) => !value.trim() || EMAIL.test(value.trim()), 'Enter an email address.'),
    active: z.boolean(),
  })
  .refine((values) => !values.features.includes('transfers') || values.transfer_number.trim(), {
    message: 'Transfers need a number to transfer callers to.',
    path: ['transfer_number'],
  });

export type BusinessFormValues = z.infer<typeof businessFormSchema>;

export const emptyBusiness: BusinessFormValues = {
  name: '',
  slug: '',
  description: '',
  business_type: 'other',
  address: '',
  phone: '',
  hours: '',
  faq: '',
  twilio_number: '',
  mainLanguage: 'en',
  otherLanguages: [],
  features: ['messages'],
  transfer_number: '',
  urgent_when: '',
  notify_sms: '',
  notify_whatsapp: '',
  owner_email: '',
  active: true,
};

export function toFormValues(business: Business): BusinessFormValues {
  const [mainLanguage = 'en', ...otherLanguages] = business.languages;
  return {
    name: business.name,
    slug: business.slug,
    description: business.description,
    business_type: business.business_type,
    address: business.address,
    phone: business.phone,
    hours: business.hours,
    faq: business.faq.join('\n'),
    twilio_number: business.twilio_number ?? '',
    mainLanguage,
    otherLanguages,
    features: business.features,
    transfer_number: business.transfer_number ?? '',
    urgent_when: business.urgent_when,
    notify_sms: business.notify_sms ?? '',
    notify_whatsapp: business.notify_whatsapp ?? '',
    owner_email: business.owner_email ?? '',
    active: business.active,
  };
}

// "" -> null; anything else -> "+18005550100" form.
export const optionalPhone = (value: string) => normalizePhone(value) || null;

export function toInput(values: BusinessFormValues): BusinessInput {
  return {
    name: values.name.trim(),
    slug: values.slug.trim(),
    description: values.description.trim(),
    business_type: values.business_type,
    address: values.address.trim(),
    phone: values.phone.trim(),
    hours: values.hours.trim(),
    faq: values.faq
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    twilio_number: optionalPhone(values.twilio_number),
    // The main language first; it can't also be one of the others.
    languages: [values.mainLanguage, ...values.otherLanguages.filter((code) => code !== values.mainLanguage)],
    features: values.features,
    transfer_number: optionalPhone(values.transfer_number),
    urgent_when: values.urgent_when.trim(),
    notify_sms: optionalPhone(values.notify_sms),
    notify_whatsapp: optionalPhone(values.notify_whatsapp),
    owner_email: values.owner_email.trim(),
    active: values.active,
  };
}

// The API names fields after database columns; a few are split differently in the form.
export const formFieldForApiField = (field: string): keyof BusinessFormValues | null =>
  field === 'languages' ? 'mainLanguage' : field in emptyBusiness ? (field as keyof BusinessFormValues) : null;
