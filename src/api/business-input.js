// Checks business settings sent to the API, for both the admin site (every column) and the owner
// app (only what an owner may change). Invalid input throws an InputError naming each invalid field,
// which the routes send as a 400 with { error, fields: { column: message } }, so the page can point
// at the field to fix.

import { FEATURES, toBusiness } from '../shared/businesses.js';
import { LANGUAGES } from '../shared/languages.js';
import { buildGreeting, buildSystemPrompt } from '../shared/prompt.js';

const E164 = /^\+[1-9]\d{6,14}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const text = (value) => (typeof value === 'string' ? value.trim() : '');
// Phone numbers are stored as Twilio uses them: "+1 (831) 249-0526" -> "+18312490526". Empty -> null.
const phoneNumber = (value) => text(value).replace(/[\s().-]/g, '') || null;
// Keeps only known codes, without duplicates, in the order given.
const codes = (value, known) => [...new Set(Array.isArray(value) ? value : [])].filter((code) => code in known);

export class InputError extends Error {
  constructor(fields) {
    super('Please fix the highlighted fields.');
    this.fields = fields;
  }
}

// The languages and features to choose from, for the forms.
export const options = {
  languages: Object.entries(LANGUAGES).map(([code, name]) => ({ code, name })),
  features: Object.entries(FEATURES).map(([code, label]) => ({ code, label })),
};

// The settings an owner sets for their own business: what the receptionist knows and does.
function readSettings(body) {
  return {
    name: text(body.name),
    description: text(body.description),
    address: text(body.address),
    hours: text(body.hours),
    phone: text(body.phone),
    faq: (Array.isArray(body.faq) ? body.faq : []).map(text).filter(Boolean),
    languages: codes(body.languages, LANGUAGES),
    features: codes(body.features, FEATURES),
    transfer_number: phoneNumber(body.transfer_number),
    notify_sms: phoneNumber(body.notify_sms),
    notify_whatsapp: phoneNumber(body.notify_whatsapp),
    urgent_when: text(body.urgent_when),
  };
}

// values -> { column: message } for each invalid one.
function settingsErrors(values) {
  const fields = {};
  if (!values.name) fields.name = 'Enter the business name.';
  if (!values.description) fields.description = 'Describe the business in a few words.';
  if (values.languages.length === 0) fields.languages = 'Pick at least one language.';
  for (const column of ['twilio_number', 'transfer_number', 'notify_sms', 'notify_whatsapp']) {
    if (values[column] && !E164.test(values[column])) fields[column] = 'Use international format, e.g. +18005550100.';
  }
  if (values.features.includes('transfers') && !values.transfer_number && !fields.transfer_number) {
    fields.transfer_number = 'Transfers need a number to transfer callers to.';
  }
  return fields;
}

function throwIfAny(fields) {
  if (Object.keys(fields).length) throw new InputError(fields);
}

// Owner app request body -> column values an owner may set. Owners can't read messages anywhere
// else yet, so taking messages needs a number to send them to.
export function parseSettings(body) {
  const values = readSettings(body);
  const fields = settingsErrors(values);
  if (values.features.includes('messages') && !values.notify_sms && !values.notify_whatsapp && !fields.notify_sms) {
    fields.notify_sms = 'Enter a number to send messages to, by SMS or WhatsApp.';
  }
  throwIfAny(fields);
  return values;
}

// Admin site request body -> column values, including the ones only the admin sets.
export function parseBusiness(body) {
  const values = {
    slug: text(body.slug).toLowerCase(),
    ...readSettings(body),
    twilio_number: phoneNumber(body.twilio_number),
    active: body.active !== false,
  };
  const fields = settingsErrors(values);
  if (!SLUG.test(values.slug)) fields.slug = 'Use lowercase letters, numbers and dashes, e.g. rapid-flow-plumbing.';
  throwIfAny(fields);
  return values;
}

// The greeting and Claude's instructions for these column values, built by the same code as a
// real call.
export function preview(values) {
  const business = toBusiness(values);
  return {
    greeting: buildGreeting(business).map((part) => ({ ...part, languageName: LANGUAGES[part.language] })),
    prompt: buildSystemPrompt(business, { callerNumber: '+15550100000' }),
  };
}

// Database errors the user can fix, as field messages: a slug or Twilio number already in use.
export function fieldsForDatabaseError(err) {
  if (err.code !== '23505') return null; // unique_violation
  if (err.constraint === 'businesses_slug_key') return { slug: 'Another business already uses this slug.' };
  if (err.constraint === 'businesses_twilio_number_key') {
    return { twilio_number: 'Another business already uses this Twilio number.' };
  }
  return null;
}
