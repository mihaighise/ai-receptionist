// The setup wizard's form: its values, the checks run in the browser, and conversion to and from
// what the API sends. The API runs the same checks again (parseSettings in src/api/business-input.js).

import { z } from 'zod';
import type { Business } from '@/api/businesses';
import type { BusinessSettings } from '@/api/owner';
import { optionalPhone, phoneField } from '@/features/businesses/business-schema';

export const setupSchema = z
  .object({
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
    // One question and answer per line.
    faq: z.string(),
  })
  .refine((values) => !values.features.includes('transfers') || values.transfer_number.trim(), {
    message: 'Enter the number to transfer callers to.',
    path: ['transfer_number'],
  })
  .refine(
    (values) => !values.features.includes('messages') || values.notify_sms.trim() || values.notify_whatsapp.trim(),
    { message: 'Enter a number to send messages to, by SMS or WhatsApp.', path: ['notify_sms'] },
  );

export type SetupValues = z.infer<typeof setupSchema>;

// The wizard's steps, in order, with the fields each one asks for.
export const STEPS = [
  { id: 'business', title: 'Your business', fields: ['name', 'description', 'address', 'phone', 'hours'] },
  { id: 'languages', title: 'Languages', fields: ['mainLanguage', 'otherLanguages'] },
  {
    id: 'actions',
    title: 'What it does',
    fields: ['features', 'transfer_number', 'urgent_when', 'notify_sms', 'notify_whatsapp'],
  },
  { id: 'faq', title: 'Common questions', fields: ['faq'] },
  { id: 'review', title: 'Review', fields: [] },
] as const satisfies readonly { id: string; title: string; fields: readonly (keyof SetupValues)[] }[];

// The step that asks for this field (for showing an error from the API), or -1.
export const stepOfField = (field: string) =>
  STEPS.findIndex((step) => (step.fields as readonly string[]).includes(field));

export const emptySetup: SetupValues = {
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
  faq: '',
};

export function toSetupValues(business: Business): SetupValues {
  const [mainLanguage = 'en', ...otherLanguages] = business.languages;
  return {
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
    faq: business.faq.join('\n'),
  };
}

export function toSettings(values: SetupValues): BusinessSettings {
  return {
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
    faq: values.faq
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

// The API names fields after database columns; languages is split in two in the form.
export const setupFieldForApiField = (field: string): keyof SetupValues | null =>
  field === 'languages' ? 'mainLanguage' : field in emptySetup ? (field as keyof SetupValues) : null;
