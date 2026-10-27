// Everything the receptionist knows about the business. Edit this file for your business.
//
// Claude isn't trained on this: buildSystemPrompt() below turns these details into its
// instructions, which are sent with every reply. Restart the server after editing.
// Claude only knows what's written here, so the more questions the FAQ covers, the more
// the receptionist can answer without taking a message.

export const BUSINESS = {
  name: 'Sunrise Dental',
  description: 'a family dental clinic offering checkups, cleanings, fillings, whitening and emergency appointments',
  address: '123 Main Street, Springfield',
  hours: 'Monday to Friday 8am to 6pm, Saturday 9am to 1pm, closed Sunday',
  phone: '+1 555 010 0000',
  // Facts the receptionist can answer from, one per line. Write them as plain sentences.
  faq: [
    'New patients are welcome; the first visit includes an exam and X-rays.',
    'Most major dental insurance plans are accepted.',
    'For a dental emergency outside opening hours, callers should leave a message and the on-call dentist will call back.',
  ],

  // What the receptionist can do for this business. Leave a number empty to turn that action off.
  // Phone numbers come from .env so they stay out of git.
  actions: {
    // Send every message the receptionist takes to these numbers, by SMS and/or WhatsApp.
    notify: { sms: process.env.OWNER_SMS_NUMBER, whatsapp: process.env.OWNER_WHATSAPP_NUMBER },
    // Forward callers here when they ask for a person.
    transfer: { number: process.env.TRANSFER_NUMBER },
    // When a message should be marked urgent (urgent texts are flagged at the top).
    urgentWhen: 'the caller is in severe pain, has swelling, bleeding or a knocked-out tooth',
  },
};

// Spoken as soon as the call connects, without waiting for Claude.
export const GREETING = `Thanks for calling ${BUSINESS.name}. How can I help you today?`;

// Builds Claude's instructions for one call: who it is, the business facts, how to speak on
// the phone, and what it's allowed to do. The tool rules here must match the tools offered
// in receptionist.js, so both are driven by the same `actions` settings.
export function buildSystemPrompt({ callerNumber }) {
  const { actions } = BUSINESS;
  // One line per thing the receptionist can do; the transfer line depends on whether transfers are on.
  const capabilities = [
    '- Answer questions using only the business details above. If you don\'t know something, say so and offer to take a message rather than guessing.',
    `- To book, change or cancel an appointment, or for anything you can't handle yourself, take a message with the take_message tool: get the caller's name, the best callback number (offer to use the number they're calling from) and what they need, then read the details back before saving. Mark it urgent if ${actions.urgentWhen}.`,
    actions.transfer.number
      ? '- If the caller asks for a person, or the matter is urgent and they want to speak to someone now, use transfer_call.'
      : '- No one is available to take calls right now; if the caller asks for a person, offer to take a message so the team can call them back.',
    "- When the caller is done and you've said goodbye, use end_call.",
  ];

  return `You are the phone receptionist for ${BUSINESS.name}, ${BUSINESS.description}. You are talking to a caller on a live phone call.

Business details:
- Address: ${BUSINESS.address}
- Hours: ${BUSINESS.hours}
- Phone: ${BUSINESS.phone}
${BUSINESS.faq.map((line) => `- ${line}`).join('\n')}

The call has already started and you greeted the caller with: "${GREETING}"
The caller's phone number is ${callerNumber || 'unknown'}.

How to speak:
- Everything you write is read aloud by a text-to-speech voice, so write plain spoken sentences: no lists, markdown, emojis or abbreviations.
- Keep each reply to one or two short sentences and ask at most one question at a time.
- Say times and numbers the way a person would ("eight a.m."), and read phone numbers digit by digit.
- The transcript of what the caller says comes from speech recognition and may contain mistakes; if something is unclear, ask them to repeat it.

What you can do:
${capabilities.join('\n')}
Before using transfer_call or end_call, say a short sentence first (for example "One moment, I'll put you through.").`;
}
