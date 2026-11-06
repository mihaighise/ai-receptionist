// Turns a business (from the database, see businesses.js) into what the receptionist says and
// knows on a call: the greeting and Claude's instructions.
//
// Claude isn't trained on the business: buildSystemPrompt() writes its details into the
// instructions, which are sent with every reply.

import { LANGUAGES, SWITCH_OFFER, WELCOME } from './languages.js';

// ['a'] -> 'a', ['a', 'b'] -> 'a and b', ['a', 'b', 'c'] -> 'a, b and c'
const list = (items, word) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} ${word} ${items.at(-1)}` : (items[0] ?? '');

// The greeting, spoken as soon as the call connects without waiting for Claude: a welcome in the
// business's main language, then one line in each of its other languages saying the caller can
// switch. Each part is spoken in its own language, in order.
export function buildGreeting({ name, languages }) {
  const [main, ...others] = languages;
  return [
    { language: main, text: WELCOME[main](name) },
    ...others.map((language) => ({ language, text: SWITCH_OFFER[language] })),
  ];
}

// Builds Claude's instructions for one call: who it is, the business facts, how to speak on
// the phone, and what it's allowed to do. The tool rules here must match the tools offered
// in receptionist.js, so both are driven by the same `actions` settings.
export function buildSystemPrompt(business, { callerNumber }) {
  const { actions, languages } = business;
  const greeting = buildGreeting(business).map((part) => part.text).join(' ');
  const names = languages.map((code) => LANGUAGES[code]);
  // The business details are written in English, so they're translated for the other languages.
  const translated = languages.filter((code) => code !== 'en').map((code) => LANGUAGES[code]);

  const languageRules = [
    `- You speak ${list(names, 'and')}. Each caller message starts with a tag such as ${list(names.map((n) => `[${n}]`), 'or')} that says which language to reply in. Always reply only in that language, and never say the tag.`,
    translated.length && `- The business details above are in English; translate them naturally when replying in ${list(translated, 'or')}.`,
    actions.messages && '- Always write take_message fields in English, translating what the caller said, so the staff can read every message.',
  ].filter(Boolean);

  // One line per thing the receptionist can do; the lines depend on which actions are turned on.
  const capabilities = actions.messages
    ? [
        '- Answer questions using only the business details above. If you don\'t know something, say so and offer to take a message rather than guessing.',
        `- To book, change or cancel an appointment, or for anything you can't handle yourself, take a message with the take_message tool: get the caller's name, the best callback number (offer to use the number they're calling from) and what they need, then read the details back before saving.${actions.urgentWhen ? ` Mark it urgent if ${actions.urgentWhen}.` : ''}`,
        "- There is one message per call, and the staff only receive it after the call ends. If the caller changes or adds to their request after you've saved it, read back the changes and call take_message again with the complete updated message. If they want to cancel it, use cancel_message.",
      ]
    : [
        "- Answer questions using only the business details above. If you don't know something, say so rather than guessing.",
        "- You can't book appointments or take messages. If the caller needs something you can't handle, suggest they call back during opening hours.",
      ];
  if (actions.transfer.number) {
    capabilities.push('- If the caller asks for a person, or the matter is urgent and they want to speak to someone now, use transfer_call.');
  } else if (actions.messages) {
    capabilities.push('- No one is available to take calls right now; if the caller asks for a person, offer to take a message so the team can call them back.');
  } else {
    capabilities.push('- No one is available to take calls right now; if the caller asks for a person, suggest they call back during opening hours.');
  }
  capabilities.push("- When the caller is done and you've said goodbye, use end_call.");

  return `You are the phone receptionist for ${business.name}, ${business.description}. You are talking to a caller on a live phone call.

Business details:
- Address: ${business.address}
- Hours: ${business.hours}
- Phone: ${business.phone}
${business.faq.map((line) => `- ${line}`).join('\n')}

The call has already started and you greeted the caller with: "${greeting}"
The caller's phone number is ${callerNumber || 'unknown'}.

Language:
${languageRules.join('\n')}

How to speak:
- Everything you write is read aloud by a text-to-speech voice, so write plain spoken sentences: no lists, markdown, emojis or abbreviations.
- Keep each reply to one or two short sentences and ask at most one question at a time.
- Say times and numbers the way a person would ("eight a.m."), and read phone numbers digit by digit.
- The transcript of what the caller says comes from speech recognition and may contain mistakes; if something is unclear, ask them to repeat it.

What you can do:
${capabilities.join('\n')}
Before using transfer_call or end_call, say a short sentence first (for example "One moment, I'll put you through.").`;
}
