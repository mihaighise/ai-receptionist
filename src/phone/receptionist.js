// The conversation brain for one call: sends the caller's words to Claude, streams the reply
// to the voice sentence by sentence, and runs the receptionist's tools.
//
// Each caller turn works like this:
//   1. The caller's words are added to the conversation history as a "user" message.
//   2. Claude gets the system prompt (from prompt.js), the whole history and the tools.
//   3. Claude's reply streams back; each finished sentence is sent to the voice right away.
//   4. If Claude asked to use a tool (e.g. take_message), we run it, add the result to the
//      history and ask Claude again, so it can tell the caller what happened.
// The Claude API is stateless: the full conversation is sent with every request.
//
// The tools come from the business's skills (src/skills): each skill offers its own, runs them,
// and is told when the call ends (e.g. the messages skill only sends the final message then).

import Anthropic from '@anthropic-ai/sdk';
import { LANGUAGES } from '../shared/languages.js';
import { buildSystemPrompt } from '../shared/prompt.js';
import { liveSkills } from '../skills/index.js';

// Reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-5-5';
// The tools offered to Claude: each skill's on this call (see src/skills), then end_call, which
// every receptionist has. Claude never runs anything itself: it asks for a tool, and #runTool
// below has it done.
function buildTools(business) {
  return [
    ...liveSkills(business).flatMap((skill) => skill.tools(business)),
    {
      name: 'end_call',
      description: 'Hang up after the caller is done and you have said goodbye.',
      eager_input_streaming: true,
      input_schema: { type: 'object', properties: {}, required: [] },
    },
  ];
}

// Index just past the last sentence end in text, or 0 if there isn't one yet.
// Used to send the voice whole sentences, which sound more natural than word fragments.
function sentenceEnd(text) {
  let end = 0;
  for (const match of text.matchAll(/[.!?](?=\s)/g)) end = match.index + 1;
  return end;
}

// For tests: the tools offered to Claude for a business.
export { buildTools as toolsFor };

export class Receptionist {
  // The conversation so far, in Claude API format: alternating "user" (caller words, tool results)
  // and "assistant" (Claude's replies and tool requests) messages. Only ever appended to.
  #messages = [];
  #system;
  // The tools this business has turned on. Built once per call and identical on every request,
  // which also keeps Claude's prompt cache valid (see cache_control in #generate).
  #tools;
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
  // Each skill's part in this call (see src/skills): runs its tools, and is closed when the call ends.
  #skills;
  // Set once close() has run.
  #closed = false;

  // business: the business that was called (businesses.js)
  // speech: { begin() -> { say(text), end() } }  plays a reply on the call
  // call: { callSid, from, to, waitForPlayback(), transfer(), hangup() }
  // costs: a CallCosts (costs.js) that adds up the tokens used
  constructor({ business, speech, call, costs }) {
    this.business = business;
    this.speech = speech;
    this.call = call;
    this.costs = costs;
    this.#language = business.languages[0];
    // Built once per call; it includes this caller's number.
    this.#system = buildSystemPrompt(business, { callerNumber: call.from });
    this.#tools = buildTools(business);
    this.#skills = liveSkills(business).map((skill) =>
      skill.startCall({ business, call, endConversation: () => (this.#ended = true) }),
    );
  }

  get busy() {
    return this.#stream !== null;
  }

  // What happened on the call, for its call history (e.g. transferred, and the message taken),
  // from each skill, once the call is over.
  get outcome() {
    return Object.assign({ transferred: false, message: null, bookings: [] }, ...this.#skills.map((skill) => skill.outcome()));
  }

  // The caller finished a turn. Any reply still in progress is cancelled first.
  // The new turn is chained after the previous one, so a tool that is still running finishes
  // and records its result before the caller's new words are added. Claude requires every
  // tool request to be answered before the conversation continues.
  // language is the code ('en' or 'es') the caller is speaking, chosen in mediaStream.js.
  respond(text, language = this.business.languages[0]) {
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
  // later turns, and tell each skill (the messages skill then sends the final message).
  // Can be called more than once; only the first call does anything.
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#ended = true;
    this.cancel();
    for (const skill of this.#skills) skill.close();
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
      tools: this.#tools,
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

    if (block.name === 'end_call') {
      // Let the goodbye finish playing before hanging up.
      await this.call.waitForPlayback();
      this.#ended = true;
      await this.call.hangup();
      return result('Call ended.');
    }
    // The skill that offers this tool runs it.
    for (const skill of this.#skills) {
      const handled = await skill.run(block, result);
      if (handled) return handled;
    }
    return result(`Unknown tool ${block.name}. Available tools: ${this.#tools.map((t) => t.name).join(', ')}.`, true);
  }
}
