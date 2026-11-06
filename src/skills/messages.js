// Skill: take messages for the staff. The receptionist takes the caller's name, callback number
// and request with the take_message tool; the message is a draft until the call ends (the caller
// can still change or cancel it), then it's saved and sent to the owner by SMS and/or WhatsApp.
//
// The parts every skill has are described in index.js.

import { appendFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { getTwilioClient } from '../shared/twilio.js';

// One JSON object per line ("JSON Lines"), so new messages are simply appended. The call history
// (the calls table) also keeps each message. MESSAGES_FILE puts it elsewhere (the tests do).
const MESSAGES_FILE = process.env.MESSAGES_FILE
  ? pathToFileURL(process.env.MESSAGES_FILE)
  : new URL('../../data/messages.jsonl', import.meta.url);

// Send a saved message to the business owner on each of the business's channels.
// Failures are logged; the message is still in the file and the call history.
async function notifyOwner(entry, smsFrom, { sms, whatsapp }) {
  const body = [
    `${entry.urgent ? 'URGENT ' : ''}New message from ${entry.caller_name} (${entry.callback_number}):`,
    entry.message,
  ].join('\n');

  // [channel name, Twilio message parameters] for each channel that's turned on.
  const sends = [];
  // SMS goes out from the Twilio number the customer called.
  if (sms) sends.push(['SMS', { to: sms, from: smsFrom }]);
  if (whatsapp) {
    // Defaults to the Twilio WhatsApp Sandbox number, for testing.
    // Twilio uses the same messages API for WhatsApp; the "whatsapp:" prefix picks the channel.
    const from = process.env.TWILIO_WHATSAPP_FROM ?? '+14155238886';
    sends.push(['WhatsApp', { to: `whatsapp:${whatsapp}`, from: `whatsapp:${from}` }]);
  }

  // Send on all channels at once; one failing doesn't stop the others.
  await Promise.all(
    sends.map(async ([channel, params]) => {
      try {
        await getTwilioClient().messages.create({ ...params, body });
        console.log(`Sent message to the owner by ${channel}`);
      } catch (err) {
        console.error(`Could not send ${channel} to the owner (Twilio error ${err.code}): ${err.message}`);
      }
    }),
  );
}

// Names of the fields that are missing or empty strings in a tool's input.
const missingFields = (input, fields) => fields.filter((f) => typeof input?.[f] !== 'string' || !input[f].trim());

export default {
  id: 'messages',
  label: 'Take messages for the staff',

  // Columns of the businesses table this skill's settings are kept in, and what kind of value each is.
  settings: { notify_sms: 'phone', notify_whatsapp: 'phone', urgent_when: 'text' },

  // Owners can't read messages anywhere but their phone yet, so one taking them needs a number
  // to send them to. The admin site may leave both empty (demo businesses).
  validate(values, { owner }) {
    if (owner && !values.notify_sms && !values.notify_whatsapp) {
      return { notify_sms: 'Enter a number to send messages to, by SMS or WhatsApp.' };
    }
    return {};
  },

  // The part of a business's `actions` (see toBusiness) this skill decides.
  actions: (row, on) => ({
    messages: on,
    notify: { sms: row.notify_sms, whatsapp: row.notify_whatsapp },
    urgentWhen: row.urgent_when,
  }),
  live: (business) => business.actions.messages,
  // The receptionist can always offer a callback instead of guessing (see prompt.js).
  followUp: true,

  prompt: {
    language: () => [
      '- Always write take_message fields in English, translating what the caller said, so the staff can read every message.',
    ],
    capabilities: ({ actions }) => [
      // With the bookings skill on, the receptionist books itself; changes still come as messages.
      `- To ${actions.bookings ? 'change or cancel an appointment' : 'book, change or cancel an appointment'}, or for anything you can't handle yourself, take a message with the take_message tool: get the caller's name, the best callback number (offer to use the number they're calling from) and what they need, then read the details back before saving.${actions.urgentWhen ? ` Mark it urgent if ${actions.urgentWhen}.` : ''}`,
      "- There is one message per call, and the staff only receive it after the call ends. If the caller changes or adds to their request after you've saved it, read back the changes and call take_message again with the complete updated message. If they want to cancel it, use cancel_message.",
    ],
  },

  tools: () => [
    {
      name: 'take_message',
      description: 'Save a message for the staff to follow up on: appointment requests, callbacks, or anything you cannot handle on the call. Read the details back to the caller before calling this. There is one message per call: calling this again replaces the earlier message, so always include every request the caller still wants, with any changes.',
      // Stream tool input as it's generated instead of buffering it. The API then no longer
      // validates the input for us, so run() checks the fields itself.
      eager_input_streaming: true,
      input_schema: {
        type: 'object',
        properties: {
          caller_name: { type: 'string', description: "The caller's name" },
          callback_number: { type: 'string', description: 'Best number to call the caller back on' },
          message: { type: 'string', description: 'What the caller needs, with any dates, times or addresses they mentioned' },
          urgent: { type: 'boolean', description: 'True if the staff should act on this right away' },
        },
        required: ['caller_name', 'callback_number', 'message', 'urgent'],
      },
    },
    {
      name: 'cancel_message',
      description: 'Delete the message saved earlier in this call, when the caller no longer wants it. Nothing is sent to the staff.',
      eager_input_streaming: true,
      input_schema: { type: 'object', properties: {}, required: [] },
    },
  ],

  // One call's use of the skill. The message is kept as a draft until close().
  startCall({ business, call }) {
    let draft = null;
    let closed = false;
    return {
      async run(block, result) {
        if (block.name === 'take_message') {
          const missing = missingFields(block.input, ['caller_name', 'callback_number', 'message']);
          if (missing.length) return result(`Missing fields: ${missing.join(', ')}`, true);
          // Replaces any earlier draft (see close()).
          const updated = draft !== null;
          draft = {
            time: new Date().toISOString(),
            callSid: call.callSid,
            from: call.from,
            ...block.input,
            urgent: block.input.urgent === true,
          };
          console.log(updated ? 'Message updated (sent when the call ends)' : 'Message taken (sent when the call ends)');
          return result(
            updated
              ? 'Message updated. Tell the caller the change has been noted.'
              : 'Message saved. Tell the caller the team will get back to them.',
          );
        }
        if (block.name === 'cancel_message') {
          if (!draft) return result('There is no message to cancel.', true);
          draft = null;
          console.log('Message cancelled');
          return result('Message deleted; nothing will be sent. Tell the caller it has been cancelled.');
        }
        return null;
      },

      // The call is over: save the final message and send it to the owner. Saved first, so the
      // message is kept even if sending it fails.
      close() {
        if (closed) return;
        closed = true;
        if (!draft) return;
        const entry = draft;
        (async () => {
          try {
            await mkdir(new URL('.', MESSAGES_FILE), { recursive: true });
            await appendFile(MESSAGES_FILE, `${JSON.stringify(entry)}\n`);
            console.log('Message saved');
          } catch (err) {
            console.error('Could not save the message:', err.message);
          }
          await notifyOwner(entry, call.to, business.actions.notify);
        })();
      },

      // For the call history, once the call is over.
      outcome: () => ({
        message:
          closed && draft
            ? {
                caller_name: draft.caller_name,
                callback_number: draft.callback_number,
                message: draft.message,
                urgent: draft.urgent,
              }
            : null,
      }),
    };
  },
};
