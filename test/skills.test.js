// Skills (src/skills) and business types (src/shared/business-types.js): what every skill must
// provide, how they shape Claude's instructions and tools, and what they do on a call.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toolsFor } from '../src/phone/receptionist.js';
import { BUSINESS_TYPES, DEFAULT_BUSINESS_TYPE } from '../src/shared/business-types.js';
import { FEATURES, toBusiness } from '../src/shared/businesses.js';
import { buildSystemPrompt } from '../src/shared/prompt.js';
import { InputError, options, parseBusiness, parseSettings } from '../src/api/business-input.js';
import { liveSkills, SKILLS, skillById } from '../src/skills/index.js';

const row = (features, extra = {}) => ({
  id: 'b1',
  name: 'Rapid Flow Plumbing',
  description: 'a plumber',
  address: '1 Main St',
  hours: 'Mon-Fri',
  phone: '+1 512 555 0100',
  faq: [],
  languages: ['en'],
  features,
  transfer_number: '+15125550199',
  notify_sms: '+15125550100',
  notify_whatsapp: null,
  urgent_when: '',
  ...extra,
});
const toolNames = (features, extra) => toolsFor(toBusiness(row(features, extra))).map((tool) => tool.name);
const prompt = (features, extra) => buildSystemPrompt(toBusiness(row(features, extra)), { callerNumber: '+15550100000' });

test('every skill provides what the core needs', () => {
  const ids = SKILLS.map((skill) => skill.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const skill of SKILLS) {
    assert.match(skill.id, /^[a-z_]+$/, skill.id);
    assert.ok(skill.label, `${skill.id}: label`);
    for (const kind of Object.values(skill.settings)) assert.ok(['phone', 'text'].includes(kind), `${skill.id}: ${kind}`);
    for (const fn of ['validate', 'actions', 'live', 'tools', 'startCall']) assert.equal(typeof skill[fn], 'function', `${skill.id}.${fn}`);
    const session = skill.startCall({ business: toBusiness(row(ids)), call: {}, endConversation() {} });
    for (const fn of ['run', 'close', 'outcome']) assert.equal(typeof session[fn], 'function', `${skill.id} call.${fn}`);
  }
  assert.deepEqual(Object.keys(FEATURES), ids);
  assert.deepEqual(options.features.map((f) => f.code), ids);
});

test('no two tools share a name, and end_call is always offered', () => {
  const all = toolNames(SKILLS.map((skill) => skill.id));
  assert.equal(new Set(all).size, all.length);
  assert.deepEqual(toolNames([]), ['end_call']);
  assert.deepEqual(toolNames(['messages']), ['take_message', 'cancel_message', 'end_call']);
  assert.deepEqual(toolNames(['messages', 'transfers']), ['take_message', 'cancel_message', 'transfer_call', 'end_call']);
});

test('a skill that is on but missing what it needs is not offered', () => {
  assert.deepEqual(toolNames(['transfers'], { transfer_number: null }), ['end_call']);
  assert.deepEqual(liveSkills(toBusiness(row(['transfers'], { transfer_number: null }))), []);
  assert.doesNotMatch(prompt(['transfers'], { transfer_number: null }), /use transfer_call\./);
});

test("Claude's instructions follow the skills that are on", () => {
  const both = prompt(['messages', 'transfers'], { urgent_when: 'there is flooding' });
  assert.match(both, /offer to take a message rather than guessing/);
  assert.match(both, /take_message tool.*Mark it urgent if there is flooding\./);
  assert.match(both, /Always write take_message fields in English/);
  assert.match(both, /If the caller asks for a person.*use transfer_call\./);

  const messagesOnly = prompt(['messages']);
  assert.match(messagesOnly, /if the caller asks for a person, offer to take a message/);
  assert.doesNotMatch(messagesOnly, /Mark it urgent/);

  const none = prompt([]);
  assert.match(none, /say so rather than guessing\./);
  assert.match(none, /You can't book appointments or take messages\./);
  assert.match(none, /suggest they call back during opening hours\.\n- When the caller is done/);
  assert.doesNotMatch(none, /take_message/);
});

test('the messages skill keeps one message per call, sent when the call ends', async () => {
  const business = toBusiness(row(['messages'], { notify_sms: null }));
  const session = skillById('messages').startCall({ business, call: { callSid: 'CA1', from: '+1555', to: '+1666' } });
  const result = (content, isError = false) => ({ content, isError });
  const message = { caller_name: 'Jane', callback_number: '+15125550111', message: 'Leaking tap', urgent: false };

  assert.equal((await session.run({ name: 'cancel_message', input: {} }, result)).isError, true);
  assert.equal((await session.run({ name: 'take_message', input: { caller_name: 'Jane' } }, result)).content, 'Missing fields: callback_number, message');
  await session.run({ name: 'take_message', input: message }, result);
  assert.match((await session.run({ name: 'take_message', input: { ...message, urgent: true } }, result)).content, /updated/);
  assert.equal(await session.run({ name: 'transfer_call', input: {} }, result), null, 'not its tool');
  // Nothing is final until the call ends.
  assert.deepEqual(session.outcome(), { message: null });
  session.close();
  assert.deepEqual(session.outcome(), { message: { ...message, urgent: true } });
});

test('the transfers skill ends the conversation and puts the caller through', async () => {
  const steps = [];
  const call = { waitForPlayback: async () => steps.push('waited'), transfer: async () => steps.push('transferred') };
  const session = skillById('transfers').startCall({
    business: toBusiness(row(['transfers'])),
    call,
    endConversation: () => steps.push('ended'),
  });
  const done = await session.run({ name: 'transfer_call', input: { reason: 'wants a person' } }, (content) => content);
  assert.equal(done, 'Call transferred.');
  assert.deepEqual(steps, ['waited', 'ended', 'transferred']);
  assert.deepEqual(session.outcome(), { transferred: true });
});

test('skills check their own settings when on', () => {
  const body = { name: 'X', description: 'y', languages: ['en'], notify_sms: '', transfer_number: '' };
  const fieldsOf = (fn, extra) => {
    try {
      fn({ ...body, ...extra });
      return {};
    } catch (err) {
      assert.ok(err instanceof InputError);
      return err.fields;
    }
  };
  assert.deepEqual(fieldsOf(parseSettings, { features: ['transfers'] }), { transfer_number: 'Transfers need a number to transfer callers to.' });
  assert.deepEqual(fieldsOf(parseSettings, { features: ['messages'] }), { notify_sms: 'Enter a number to send messages to, by SMS or WhatsApp.' });
  // The admin site may leave the message numbers empty; a badly written number gets the format message.
  assert.deepEqual(fieldsOf(parseBusiness, { slug: 'x', features: ['messages'] }), {});
  assert.deepEqual(fieldsOf(parseSettings, { features: ['transfers'], transfer_number: '12' }), {
    transfer_number: 'Use international format, e.g. +18005550100.',
  });
  assert.deepEqual(fieldsOf(parseSettings, { features: [] }), {});
});

test('every business type has a template made of real skills', () => {
  assert.ok(DEFAULT_BUSINESS_TYPE in BUSINESS_TYPES);
  for (const [code, type] of Object.entries(BUSINESS_TYPES)) {
    assert.ok(type.label && type.examples, code);
    for (const skill of type.skills) assert.ok(skillById(skill), `${code}: unknown skill ${skill}`);
    for (const field of ['description', 'hours', 'urgent_when']) assert.ok(type.placeholders[field], `${code}: ${field}`);
    assert.ok(Array.isArray(type.faq));
  }
  assert.deepEqual(options.businessTypes.map((t) => t.code), Object.keys(BUSINESS_TYPES));
});

test('the business type is saved, and an unknown one becomes "other"', () => {
  const body = { name: 'X', description: 'y', languages: ['en'], features: [] };
  assert.equal(parseSettings({ ...body, business_type: 'restaurant' }).business_type, 'restaurant');
  assert.equal(parseSettings({ ...body, business_type: 'casino' }).business_type, 'other');
  assert.equal(parseSettings(body).business_type, 'other');
});
