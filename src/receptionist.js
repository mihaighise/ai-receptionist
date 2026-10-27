// The conversation brain for one call: sends the caller's words to Claude, streams the reply
// to the voice sentence by sentence, and runs the receptionist's tools.

import Anthropic from '@anthropic-ai/sdk';
import { appendFile, mkdir } from 'node:fs/promises';
import { buildSystemPrompt } from './business.js';

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5';
const MESSAGES_FILE = new URL('../data/messages.jsonl', import.meta.url);

const TOOLS = [
  {
    name: 'take_message',
    description: 'Save a message for the staff to follow up on: appointment requests, callbacks, or anything you cannot handle on the call. Read the details back to the caller before calling this.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        caller_name: { type: 'string', description: "The caller's name" },
        callback_number: { type: 'string', description: 'Best number to call the caller back on' },
        message: { type: 'string', description: 'What the caller needs, with any dates or times they mentioned' },
      },
      required: ['caller_name', 'callback_number', 'message'],
    },
  },
  {
    name: 'transfer_call',
    description: 'Transfer the caller to a member of staff, when they ask for a person or the request needs one right away.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Why the caller is being transferred' } },
      required: ['reason'],
    },
  },
  {
    name: 'end_call',
    description: 'Hang up after the caller is done and you have said goodbye.',
    eager_input_streaming: true,
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

// Index just past the last sentence end in text, or 0 if there isn't one yet.
function sentenceEnd(text) {
  let end = 0;
  for (const match of text.matchAll(/[.!?](?=\s)/g)) end = match.index + 1;
  return end;
}

function missingFields(input, fields) {
  return fields.filter((f) => typeof input?.[f] !== 'string' || !input[f].trim());
}

export class Receptionist {
  #messages = [];
  #system;
  #turn = 0;
  #stream = null;
  #running = Promise.resolve();
  #ended = false;

  // speech: { begin() -> { say(text), end() } }  plays a reply on the call
  // call: { callSid, from, waitForPlayback(), transfer(), hangup() }
  constructor({ speech, call }) {
    this.speech = speech;
    this.call = call;
    this.#system = buildSystemPrompt({ callerNumber: call.from });
  }

  get busy() {
    return this.#stream !== null;
  }

  // The caller finished a turn. Any reply still in progress is cancelled first.
  respond(text) {
    this.cancel();
    const turn = this.#turn;
    this.#running = this.#running.then(() => this.#run(turn, text));
    return this.#running;
  }

  // Stop the current reply, e.g. because the caller started talking over it.
  cancel() {
    this.#turn++;
    this.#stream?.abort();
  }

  async #run(turn, text) {
    if (this.#ended) return;
    console.log(`Caller: ${text}`);
    this.#messages.push({ role: 'user', content: text });

    try {
      while (turn === this.#turn && !this.#ended) {
        const message = await this.#generate(turn);
        if (!message) return;

        if (message.stop_reason === 'refusal') {
          this.#say("Sorry, I can't help with that. Is there anything else I can do for you?");
          return;
        }
        this.#messages.push({ role: 'assistant', content: message.content });

        const toolUses = message.content.filter((b) => b.type === 'tool_use');
        // A tool call cut off at max_tokens may have incomplete input; don't run it.
        if (message.stop_reason === 'max_tokens' && toolUses.length) throw new Error('Tool call cut off at max_tokens');
        if (message.stop_reason !== 'tool_use' || toolUses.length === 0) return;

        const results = [];
        for (const block of toolUses) results.push(await this.#runTool(block));
        // Always answer every tool_use, even if the caller interrupted meanwhile.
        this.#messages.push({ role: 'user', content: results });
      }
    } catch (err) {
      console.error('Receptionist error:', err);
      this.#say("Sorry, I'm having trouble right now. Please call back in a few minutes.");
    }
  }

  // Streams one Claude reply into the voice. Returns null if it was interrupted.
  async #generate(turn) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 1024, // phone replies are a sentence or two
      system: this.#system,
      cache_control: { type: 'ephemeral' },
      thinking: { type: 'between_tools' }, // no thinking pause before speaking
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: TOOLS,
      messages: this.#messages,
    });
    this.#stream = stream;

    const reply = this.speech.begin();
    let spoken = '';
    let buffer = '';
    stream.on('text', (delta) => {
      if (turn !== this.#turn) return;
      spoken += delta;
      buffer += delta;
      const cut = sentenceEnd(buffer);
      if (cut > 0) {
        reply.say(buffer.slice(0, cut));
        buffer = buffer.slice(cut);
      }
    });

    try {
      const message = await stream.finalMessage();
      if (message.stop_reason !== 'refusal' && buffer.trim()) reply.say(buffer);
      reply.end();
      if (spoken.trim()) console.log(`Receptionist: ${spoken.trim()}`);
      return message;
    } catch (err) {
      if (!(err instanceof Anthropic.APIUserAbortError)) throw err;
      // Interrupted: keep what was said so far so Claude knows where it left off.
      if (spoken.trim()) this.#messages.push({ role: 'assistant', content: spoken.trim() });
      console.log(`Receptionist (interrupted): ${spoken.trim()}`);
      return null;
    } finally {
      if (this.#stream === stream) this.#stream = null;
    }
  }

  #say(text) {
    const reply = this.speech.begin();
    reply.say(text);
    reply.end();
  }

  async #runTool(block) {
    const result = (content, isError = false) => ({
      type: 'tool_result',
      tool_use_id: block.id,
      content,
      ...(isError && { is_error: true }),
    });
    console.log(`Tool ${block.name}`, block.input);

    switch (block.name) {
      case 'take_message': {
        const missing = missingFields(block.input, ['caller_name', 'callback_number', 'message']);
        if (missing.length) return result(`Missing fields: ${missing.join(', ')}`, true);
        const entry = { time: new Date().toISOString(), callSid: this.call.callSid, from: this.call.from, ...block.input };
        await mkdir(new URL('.', MESSAGES_FILE), { recursive: true });
        await appendFile(MESSAGES_FILE, JSON.stringify(entry) + '\n');
        return result('Message saved. Tell the caller the team will get back to them.');
      }

      case 'transfer_call':
        if (!process.env.TRANSFER_NUMBER) {
          return result('Transfers are not available right now. Offer to take a message instead.', true);
        }
        await this.call.waitForPlayback();
        this.#ended = true;
        await this.call.transfer();
        return result('Call transferred.');

      case 'end_call':
        await this.call.waitForPlayback();
        this.#ended = true;
        await this.call.hangup();
        return result('Call ended.');

      default:
        return result(`Unknown tool ${block.name}. Available tools: take_message, transfer_call, end_call.`, true);
    }
  }
}
