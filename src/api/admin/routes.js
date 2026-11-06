// Admin routes of the API (mounted at /api/admin by src/api/server.js), used by the admin site
// in web/: list, create, edit and delete businesses, and preview what the receptionist would say.
//
//   GET    /api/admin/options             languages and features to choose from
//   GET    /api/admin/businesses          all businesses, including inactive ones
//   POST   /api/admin/businesses          create one
//   PUT    /api/admin/businesses/:id      replace one's settings
//   DELETE /api/admin/businesses/:id      delete one
//   POST   /api/admin/preview             greeting and Claude's instructions for unsaved form values
//
// Invalid input gets a 400 with { error, fields: { column: message } }, so the page can point at
// the field to fix.

import express from 'express';
import {
  FEATURES, createBusiness, deleteBusiness, listBusinessRows, toBusiness, updateBusiness,
} from '../../shared/businesses.js';
import { LANGUAGES } from '../../shared/languages.js';
import { buildGreeting, buildSystemPrompt } from '../../shared/prompt.js';
import { findUserIdByEmail } from '../../shared/users.js';

const E164 = /^\+[1-9]\d{6,14}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value) => (typeof value === 'string' ? value.trim() : '');
// Phone numbers are stored as Twilio uses them: "+1 (831) 249-0526" -> "+18312490526". Empty -> null.
const phoneNumber = (value) => text(value).replace(/[\s().-]/g, '') || null;
// Keeps only known codes, without duplicates, in the order given.
const codes = (value, known) => [...new Set(Array.isArray(value) ? value : [])].filter((code) => code in known);

class InputError extends Error {
  constructor(fields) {
    super('Please fix the highlighted fields.');
    this.fields = fields;
  }
}

// Request body -> column values, or throws an InputError naming each invalid field.
function parseBusiness(body) {
  const values = {
    slug: text(body.slug).toLowerCase(),
    name: text(body.name),
    description: text(body.description),
    address: text(body.address),
    hours: text(body.hours),
    phone: text(body.phone),
    faq: (Array.isArray(body.faq) ? body.faq : []).map(text).filter(Boolean),
    twilio_number: phoneNumber(body.twilio_number),
    languages: codes(body.languages, LANGUAGES),
    features: codes(body.features, FEATURES),
    transfer_number: phoneNumber(body.transfer_number),
    notify_sms: phoneNumber(body.notify_sms),
    notify_whatsapp: phoneNumber(body.notify_whatsapp),
    urgent_when: text(body.urgent_when),
    active: body.active !== false,
  };

  const fields = {};
  if (!values.name) fields.name = 'Enter the business name.';
  if (!SLUG.test(values.slug)) fields.slug = 'Use lowercase letters, numbers and dashes, e.g. rapid-flow-plumbing.';
  if (!values.description) fields.description = 'Describe the business in a few words.';
  if (values.languages.length === 0) fields.languages = 'Pick at least one language.';
  for (const column of ['twilio_number', 'transfer_number', 'notify_sms', 'notify_whatsapp']) {
    if (values[column] && !E164.test(values[column])) fields[column] = 'Use international format, e.g. +18005550100.';
  }
  if (values.features.includes('transfers') && !values.transfer_number && !fields.transfer_number) {
    fields.transfer_number = 'Transfers need a number to transfer callers to.';
  }
  if (Object.keys(fields).length) throw new InputError(fields);
  return values;
}

// owner_email -> the owner's user ID (null when empty). The owner must have signed in once, which
// creates their user.
async function ownerIdFor(body) {
  const email = text(body.owner_email);
  if (!email) return null;
  const id = await findUserIdByEmail(email);
  if (!id) throw new InputError({ owner_email: 'No one has signed in with this email yet.' });
  return id;
}

// Database errors the admin can fix, as field messages: a slug or Twilio number already in use.
function fieldsForDatabaseError(err) {
  if (err.code !== '23505') return null; // unique_violation
  if (err.constraint === 'businesses_slug_key') return { slug: 'Another business already uses this slug.' };
  if (err.constraint === 'businesses_twilio_number_key') {
    return { twilio_number: 'Another business already uses this Twilio number.' };
  }
  return null;
}

export const adminRoutes = express.Router();
adminRoutes.use(express.json());

adminRoutes.get('/options', (_req, res) => {
  res.json({
    languages: Object.entries(LANGUAGES).map(([code, name]) => ({ code, name })),
    features: Object.entries(FEATURES).map(([code, label]) => ({ code, label })),
  });
});

adminRoutes.get('/businesses', async (_req, res) => {
  res.json(await listBusinessRows());
});

adminRoutes.post('/businesses', async (req, res) => {
  const values = { ...parseBusiness(req.body), owner_id: await ownerIdFor(req.body) };
  res.status(201).json(await createBusiness(values));
});

adminRoutes.put('/businesses/:id', async (req, res) => {
  const values = { ...parseBusiness(req.body), owner_id: await ownerIdFor(req.body) };
  const row = UUID.test(req.params.id) ? await updateBusiness(req.params.id, values) : null;
  if (!row) return res.status(404).json({ error: 'That business no longer exists.' });
  res.json(row);
});

adminRoutes.delete('/businesses/:id', async (req, res) => {
  const deleted = UUID.test(req.params.id) && (await deleteBusiness(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'That business no longer exists.' });
  res.status(204).end();
});

// Uses the same code as a real call, on the values in the form (saved or not).
adminRoutes.post('/preview', (req, res) => {
  const business = toBusiness(parseBusiness(req.body));
  res.json({
    greeting: buildGreeting(business).map((part) => ({ ...part, languageName: LANGUAGES[part.language] })),
    prompt: buildSystemPrompt(business, { callerNumber: '+15550100000' }),
  });
});

// Turns errors into JSON the page can show. Express 5 sends errors thrown in async routes here.
adminRoutes.use((err, _req, res, _next) => {
  if (err instanceof InputError) return res.status(400).json({ error: err.message, fields: err.fields });
  const fields = fieldsForDatabaseError(err);
  if (fields) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request was not valid JSON.' });
  console.error('API error (admin):', err);
  res.status(500).json({ error: 'Something went wrong. See the API server log.' });
});
