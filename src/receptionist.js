// The conversation brain for one call: sends the caller's words to Claude, streams the reply
// to the voice sentence by sentence, and runs the receptionist's tools.
//
// Each caller turn works like this:
//   1. The caller's words are added to the conversation history as a "user" message.
//   2. Claude gets the system prompt (from business.js), the whole history and the tools.
//   3. Claude's reply streams back; each finished sentence is sent to the voice right away.
//   4. If Claude asked to use a tool (e.g. take_message), we run it, add the result to the
//      history and ask Claude again, so it can tell the caller what happened.
// The Claude API is stateless: the full conversation is sent with every request.
//
// Messages are drafts until the call ends: the caller can still change or cancel their request,
// so only the final version is saved and sent to the owner, once per call (see close()).

import Anthropic from '@anthropic-ai/sdk';
import { appendFile, mkdir } from 'node:fs/promises';
import { BUSINESS, LANGUAGES, buildSystemPrompt } from './business.js';
import { getTwilioClient } from './twilio.js';

// Reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5';
// One JSON object per line ("JSON Lines"), so new messages are simply appended.
const MESSAGES_FILE = new URL('../data/messages.jsonl', import.meta.url);

// Only offer Claude the tools this business has turned on.
// Each tool has a name, a description (Claude reads it to decide when to use the tool) and
// an input schema (the fields Claude must fill in). Claude never runs anything itself: it asks
// for a tool, and #runTool below does the actual work.
function buildTools({ actions }) {
  const tools = [
    {
      name: 'take_message',
      description: 'Save a message for the staff to follow up on: appointment requests, callbacks, or anything you cannot handle on the call. Read the details back to the caller before calling this. There is one message per call: calling this again replaces the earlier message, so always include every request the caller still wants, with any changes.',
      // Stream tool input as it's generated instead of buffering it. The API then no longer
      // validates the input for us, so #runTool checks the fields itself.
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
    {
      name: 'end_call',
      description: 'Hang up after the caller is done and you have said goodbye.',
      eager_input_streaming: true,
      input_schema: { type: 'object', properties: {}, required: [] },
    },
  ];
  // Don't offer a tool that can't work: with no transfer number, Claude isn't told transfers exist.
  if (actions.transfer.number) {
    tools.push({
      name: 'transfer_call',
      description: 'Transfer the caller to a member of staff, when they ask for a person or the request needs one right away.',
      eager_input_streaming: true,
      input_schema: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Why the caller is being transferred' } },
        required: ['reason'],
      },
    });
  }
  return tools;
}

// Built once at startup. Keeping the tool list identical on every request also keeps
// Claude's prompt cache valid (see cache_control in #generate).
const TOOLS = buildTools(BUSINESS);

// Send a saved message to the business owner on each configured channel.
// Failures are logged; the message is still in the file.
async function notifyOwner(entry, smsFrom) {
  const { sms, whatsapp } = BUSINESS.actions.notify;
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

// Index just past the last sentence end in text, or 0 if there isn't one yet.
// Used to send the voice whole sentences, which sound more natural than word fragments.
function sentenceEnd(text) {
  let end = 0;
  for (const match of text.matchAll(/[.!?](?=\s)/g)) end = match.index + 1;
  return end;
}

// Names of the fields that are missing or empty strings in a tool's input.
function missingFields(input, fields) {
  return fields.filter((f) => typeof input?.[f] !== 'string' || !input[f].trim());
}

export class Receptionist {
  // The conversation so far, in Claude API format: alternating "user" (caller words, tool results)
  // and "assistant" (Claude's replies and tool requests) messages. Only ever appended to.
  #messages = [];
  #system;
  // Incremented whenever the current reply is abandoned (caller interrupted or spoke again).
  // Async work started for an older turn checks this and stops quietly.
  #turn = 0;
  // The Claude response currently streaming, if any; kept so it can be aborted.
  #stream = null;
  // Turns are processed one at a time, in order (see respond()).
  #running = Promise.resolve();
  // Set once the call has been transferred or hung up; nothing more is said after that.
  #ended = false;
  // The language of the current turn ('en' or 'es'); replies are spoken in it.
  #language = 'en';
  // The message taken on this call, not yet saved or sent; replaced or cleared if the caller changes their mind.
  #draft = null;
  // Set once close() has run; the call is over and the draft has been handled.
  #closed = false;

  // speech: { begin() -> { say(text), end() } }  plays a reply on the call
  // call: { callSid, from, to, waitForPlayback(), transfer(), hangup() }
  // costs: a CallCosts (costs.js) that adds up the tokens used
  constructor({ speech, call, costs }) {
    this.speech = speech;
    this.call = call;
    this.costs = costs;
    // Built once per call; it includes this caller's number.
    this.#system = buildSystemPrompt({ callerNumber: call.from });
  }

  get busy() {
    return this.#stream !== null;
  }

  // The caller finished a turn. Any reply still in progress is cancelled first.
  // The new turn is chained after the previous one, so a tool that is still running finishes
  // and records its result before the caller's new words are added. Claude requires every
  // tool request to be answered before the conversation continues.
  // language is the code ('en' or 'es') the caller is speaking, chosen in mediaStream.js.
  respond(text, language = 'en') {
    this.cancel();
    const turn = this.#turn;
    this.#running = this.#running.then(() => this.#run(turn, text, language));
    return this.#running;
  }

  // Stop the current reply, e.g. because the caller started talking over it.
  cancel() {
    this.#turn++;
    this.#stream?.abort();
  }

  // The call is over (hung up, transferred or ended by us): stop the current reply, ignore any
  // later turns, and save and send the final version of the message, if there is one.
  // Can be called more than once; only the first call does anything.
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#ended = true;
    this.cancel();
    if (this.#draft) this.#sendMessage(this.#draft);
  }

  // Save the message to the file, then send it to the owner. Save first, so the message is kept
  // even if sending it fails.
  async #sendMessage(entry) {
    try {
      await mkdir(new URL('.', MESSAGES_FILE), { recursive: true });
      await appendFile(MESSAGES_FILE, JSON.stringify(entry) + '\n');
      console.log('Message saved');
    } catch (err) {
      console.error('Could not save the message:', err.message);
    }
    await notifyOwner(entry, this.call.to);
  }

  // Handles one caller turn: ask Claude, run any tools it asks for, and repeat until Claude
  // has given a plain spoken answer (or the turn was cancelled, or the call ended).
  async #run(turn, text, language) {
    if (this.#ended) return;
    this.#language = language;
    console.log(`Caller (${language}): ${text}`);
    // The tag tells Claude which language to reply in (see the system prompt), so the words it
    // writes always match the language the voice speaks them in. Earlier turns stay in the
    // history in whatever language they were said, so nothing is forgotten when the caller switches.
    this.#messages.push({ role: 'user', content: `[${LANGUAGES[language]}] ${text}` });

    try {
      while (turn === this.#turn && !this.#ended) {
        const message = await this.#generate(turn);
        if (!message) return; // interrupted

        // Claude's safety checks declined to answer. Its partial reply isn't kept in the history.
        if (message.stop_reason === 'refusal') {
          this.#say({
            en: "Sorry, I can't help with that. Is there anything else I can do for you?",
            es: 'Lo siento, no puedo ayudarle con eso. ¿Hay algo más en lo que pueda ayudarle?',
          });
          return;
        }
        // Keep the full content (text and tool requests) exactly as Claude returned it.
        this.#messages.push({ role: 'assistant', content: message.content });

        const toolUses = message.content.filter((b) => b.type === 'tool_use');
        // A tool call cut off at max_tokens may have incomplete input; don't run it.
        if (message.stop_reason === 'max_tokens' && toolUses.length) throw new Error('Tool call cut off at max_tokens');
        // No tools requested: Claude's spoken reply was the whole answer for this turn.
        if (message.stop_reason !== 'tool_use' || toolUses.length === 0) return;
        // The caller hung up while Claude was replying: don't save a message they never confirmed.
        if (this.#ended) return;

        const results = [];
        for (const block of toolUses) results.push(await this.#runTool(block));
        // Always answer every tool_use, even if the caller interrupted meanwhile.
        // The loop then asks Claude again, now with the tool results.
        this.#messages.push({ role: 'user', content: results });
      }
    } catch (err) {
      console.error('Receptionist error:', err);
      this.#say({
        en: "Sorry, I'm having trouble right now. Please call back in a few minutes.",
        es: 'Lo siento, tengo problemas en este momento. Por favor, vuelva a llamar en unos minutos.',
      });
    }
  }

  // Streams one Claude reply into the voice. Returns null if it was interrupted.
  async #generate(turn) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 1024, // phone replies are a sentence or two
      system: this.#system,
      // Caches the system prompt, tools and history between turns, so each request is
      // faster and cheaper (only the new part of the conversation is processed fresh).
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'between_tools' }, // no thinking pause before speaking
      output_config: { effort: 'low' }, // short, quick answers suit a phone call
      // If Claude's safety checks wrongly decline a request, retry it on a fallback model
      // chosen by Anthropic, inside the same request.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: TOOLS,
      messages: this.#messages,
    });
    this.#stream = stream;
    // The stream's running snapshot includes token usage, so interrupted replies are counted too.
    let usage = null;
    stream.on('streamEvent', (_event, snapshot) => (usage = snapshot.usage));

    const reply = this.speech.begin(this.#language);
    let spoken = ''; // everything Claude has written for this reply
    let buffer = ''; // text not yet sent to the voice (an unfinished sentence)
    stream.on('text', (delta) => {
      if (turn !== this.#turn) return; // this reply was cancelled
      spoken += delta;
      buffer += delta;
      // Send every complete sentence to the voice as soon as it's written.
      const cut = sentenceEnd(buffer);
      if (cut > 0) {
        reply.say(buffer.slice(0, cut));
        buffer = buffer.slice(cut);
      }
    });

    try {
      // Waits for the end of the response and returns the complete message.
      const message = await stream.finalMessage();
      // Speak whatever is left after the last full stop, then close the reply.
      if (message.stop_reason !== 'refusal' && buffer.trim()) reply.say(buffer);
      reply.end();
      if (spoken.trim()) console.log(`Receptionist: ${spoken.trim()}`);
      return message;
    } catch (err) {
      // cancel() aborts the stream, which shows up here as APIUserAbortError. Anything else is a real error.
      if (!(err instanceof Anthropic.APIUserAbortError)) throw err;
      // Interrupted: keep what was said so far so Claude knows where it left off.
      if (spoken.trim()) this.#messages.push({ role: 'assistant', content: spoken.trim() });
      console.log(`Receptionist (interrupted): ${spoken.trim()}`);
      return null;
    } finally {
      if (this.#stream === stream) this.#stream = null;
      this.costs?.addClaude(MODEL, usage);
    }
  }

  // Speak a fixed sentence without asking Claude (used for error and refusal messages),
  // given as { en, es } so it's said in the caller's language.
  #say(texts) {
    const reply = this.speech.begin(this.#language);
    reply.say(texts[this.#language] ?? texts.en);
    reply.end();
  }

  // Run one tool Claude asked for and return the tool_result block to send back to Claude.
  // The result text tells Claude what happened, so it can tell the caller.
  async #runTool(block) {
    const result = (content, isError = false) => ({
      type: 'tool_result',
      tool_use_id: block.id, // links this result to Claude's request
      content,
      ...(isError && { is_error: true }), // Claude sees the problem and can fix it or apologize
    });
    console.log(`Tool ${block.name}`, block.input);

    switch (block.name) {
      case 'take_message': {
        const missing = missingFields(block.input, ['caller_name', 'callback_number', 'message']);
        if (missing.length) return result(`Missing fields: ${missing.join(', ')}`, true);
        // Kept as a draft until the call ends, replacing any earlier one (see close()).
        const updated = this.#draft !== null;
        this.#draft = {
          time: new Date().toISOString(),
          callSid: this.call.callSid,
          from: this.call.from,
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

      case 'cancel_message':
        if (!this.#draft) return result('There is no message to cancel.', true);
        this.#draft = null;
        console.log('Message cancelled');
        return result('Message deleted; nothing will be sent. Tell the caller it has been cancelled.');

      case 'transfer_call':
        if (!BUSINESS.actions.transfer.number) {
          return result('Transfers are not available right now. Offer to take a message instead.', true);
        }
        // Let the caller hear "One moment, I'll put you through" before the line changes.
        await this.call.waitForPlayback();
        this.#ended = true;
        await this.call.transfer();
        return result('Call transferred.');

      case 'end_call':
        // Let the goodbye finish playing before hanging up.
        await this.call.waitForPlayback();
        this.#ended = true;
        await this.call.hangup();
        return result('Call ended.');

      default:
        return result(`Unknown tool ${block.name}. Available tools: take_message, cancel_message, transfer_call, end_call.`, true);
    }
  }
}
