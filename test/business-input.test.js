// The checks on business settings sent by the admin site and the owner app (src/api/business-input.js).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InputError, parseBusiness, parseSettings, preview } from '../src/api/business-input.js';

const settings = {
  name: '  Rapid Flow Plumbing ',
  description: 'a plumber',
  languages: ['en'],
  features: ['messages'],
  notify_sms: '+1 (512) 555-0100',
};

// The field names the InputError thrown for this body points at.
function invalidFields(parse, body) {
  try {
    parse(body);
  } catch (err) {
    assert.ok(err instanceof InputError, err);
    return Object.keys(err.fields).sort();
  }
  assert.fail('expected an InputError');
}

test('settings are trimmed and phone numbers stored in Twilio format', () => {
  const values = parseSettings({ ...settings, faq: [' We fix leaks. ', '', 'We are insured.'] });
  assert.equal(values.name, 'Rapid Flow Plumbing');
  assert.equal(values.notify_sms, '+15125550100');
  assert.equal(values.notify_whatsapp, null);
  assert.deepEqual(values.faq, ['We fix leaks.', 'We are insured.']);
});

test('owners can only set what the receptionist knows and does', () => {
  const values = parseSettings({
    ...settings,
    twilio_number: '+18312490526',
    active: false,
    slug: 'taken',
    owner_id: 'someone-else',
  });
  for (const column of ['twilio_number', 'active', 'slug', 'owner_id']) assert.equal(column in values, false, column);
});

test('unknown languages and features are dropped, duplicates removed, order kept', () => {
  const values = parseSettings({ ...settings, languages: ['es', 'fr', 'en', 'es'], features: ['messages', 'robots'] });
  assert.deepEqual(values.languages, ['es', 'en']);
  assert.deepEqual(values.features, ['messages']);
});

test('missing name, description and languages are reported together', () => {
  assert.deepEqual(invalidFields(parseSettings, { ...settings, name: ' ', description: '', languages: ['fr'] }), [
    'description',
    'languages',
    'name',
  ]);
});

test('phone numbers must be in international format', () => {
  assert.deepEqual(invalidFields(parseSettings, { ...settings, notify_sms: '555-0100', notify_whatsapp: '+0123' }), [
    'notify_sms',
    'notify_whatsapp',
  ]);
});

test('transfers need a number to transfer to', () => {
  assert.deepEqual(invalidFields(parseSettings, { ...settings, features: ['messages', 'transfers'] }), [
    'transfer_number',
  ]);
});

test('owners taking messages need an SMS or WhatsApp number; the admin site does not', () => {
  const body = { ...settings, notify_sms: '' };
  assert.deepEqual(invalidFields(parseSettings, body), ['notify_sms']);
  assert.doesNotThrow(() => parseSettings({ ...body, notify_whatsapp: '+40700000000' }));
  assert.doesNotThrow(() => parseSettings({ ...body, features: [] }));
  assert.doesNotThrow(() => parseBusiness({ ...body, slug: 'rapid-flow' }));
});

test('the admin site also sets the slug, Twilio number and active', () => {
  const values = parseBusiness({ ...settings, slug: 'Rapid-Flow', twilio_number: '+1 831 249 0526', active: false });
  assert.equal(values.slug, 'rapid-flow');
  assert.equal(values.twilio_number, '+18312490526');
  assert.equal(values.active, false);
  assert.deepEqual(invalidFields(parseBusiness, { ...settings, slug: 'no spaces' }), ['slug']);
});

test('the preview greets in the main language, then offers the others', () => {
  const { greeting, prompt } = preview(parseSettings({ ...settings, languages: ['es', 'en'] }));
  assert.deepEqual(greeting, [
    {
      language: 'es',
      languageName: 'Spanish',
      text: 'Gracias por llamar a Rapid Flow Plumbing. ¿En qué le puedo ayudar?',
    },
    { language: 'en', languageName: 'English', text: 'If you prefer English, you can speak English.' },
  ]);
  assert.match(prompt, /^You are the phone receptionist for Rapid Flow Plumbing, a plumber\./);
});
