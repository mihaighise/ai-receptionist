// Checks business settings sent to the API, for both the admin site (every column) and the owner
// app (only what an owner may change). Invalid input throws an InputError naming each invalid field,
// which the routes send as a 400 with { error, fields: { column: message } }, so the page can point
// at the field to fix.

import { FEATURES, toBusiness } from '../shared/businesses.js';
import { BUSINESS_TYPES, DEFAULT_BUSINESS_TYPE } from '../shared/business-types.js';
import { SKILLS } from '../skills/index.js';
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

// The languages, skills ("features") and business types to choose from, for the forms.
export const options = {
  languages: Object.entries(LANGUAGES).map(([code, name]) => ({ code, name })),
  features: Object.entries(FEATURES).map(([code, label]) => ({ code, label })),
  businessTypes: Object.entries(BUSINESS_TYPES).map(([code, type]) => ({ code, ...type })),
};

// How each kind of skill setting is read from a request body.
const READ_SETTING = { phone: phoneNumber, text };
// Every skill's settings: { column: kind }.
const SKILL_SETTINGS = Object.assign({}, ...SKILLS.map((skill) => skill.settings));

// The settings an owner sets for their own business: what the receptionist knows and does.
function readSettings(body) {
  return {
    name: text(body.name),
    description: text(body.description),
    business_type: text(body.business_type) in BUSINESS_TYPES ? text(body.business_type) : DEFAULT_BUSINESS_TYPE,
    address: text(body.address),
    hours: text(body.hours),
    phone: text(body.phone),
    faq: (Array.isArray(body.faq) ? body.faq : []).map(text).filter(Boolean),
    languages: codes(body.languages, LANGUAGES),
    features: codes(body.features, FEATURES),
    ...Object.fromEntries(Object.entries(SKILL_SETTINGS).map(([column, kind]) => [column, READ_SETTING[kind](body[column])])),
  };
}

// values -> { column: message } for each invalid one. Each skill that's on checks its own
// settings (owner: the owner app is saving, rather than the admin site).
function settingsErrors(values, { owner = false } = {}) {
  const fields = {};
  if (!values.name) fields.name = 'Enter the business name.';
  if (!values.description) fields.description = 'Describe the business in a few words.';
  if (values.languages.length === 0) fields.languages = 'Pick at least one language.';
  const phones = ['twilio_number', ...Object.keys(SKILL_SETTINGS).filter((column) => SKILL_SETTINGS[column] === 'phone')];
  for (const column of phones) {
    if (values[column] && !E164.test(values[column])) fields[column] = 'Enter a complete phone number, e.g. +1 800 555 0100.';
  }
  for (const skill of SKILLS) {
    if (!values.features.includes(skill.id)) continue;
    // A badly written number already has its message; the skill's own check comes second.
    for (const [column, message] of Object.entries(skill.validate(values, { owner }))) fields[column] ??= message;
  }
  return fields;
}

function throwIfAny(fields) {
  if (Object.keys(fields).length) throw new InputError(fields);
}

// Owner app request body -> column values an owner may set.
export function parseSettings(body) {
  const values = readSettings(body);
  throwIfAny(settingsErrors(values, { owner: true }));
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
