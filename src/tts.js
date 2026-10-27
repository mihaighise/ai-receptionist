// Cartesia streaming text-to-speech for one call.
// Each reply is one "context": text is sent in pieces as Claude writes it, and Cartesia keeps the
// intonation continuous across pieces. Audio comes back as 8kHz mu-law, the format Twilio plays.
// Emits "audio" (contextId, base64 audio) and "done" (contextId).

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export class CartesiaTTS extends EventEmitter {
  #ws;
  #pending = [];

  constructor() {
    super();
    this.#ws = new WebSocket('wss://api.cartesia.ai/tts/websocket', {
      headers: {
        'X-API-Key': process.env.CARTESIA_API_KEY,
        'Cartesia-Version': process.env.CARTESIA_VERSION ?? '2026-08-14',
      },
    });

    this.#ws.on('open', () => {
      for (const msg of this.#pending) this.#ws.send(msg);
      this.#pending = [];
    });
    this.#ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'chunk' && msg.data) this.emit('audio', msg.context_id, msg.data);
      else if (msg.type === 'done') this.emit('done', msg.context_id);
      else if (msg.type === 'error') console.error('Cartesia error:', msg.title, msg.message);
    });
    this.#ws.on('error', (err) => console.error('Cartesia error:', err.message));
  }

  #send(msg) {
    const data = JSON.stringify(msg);
    if (this.#ws.readyState === WebSocket.OPEN) this.#ws.send(data);
    else if (this.#ws.readyState === WebSocket.CONNECTING) this.#pending.push(data);
  }

  newContext() {
    return randomUUID();
  }

  // Send the next piece of text for a context; final=true marks the end of the reply.
  speak(contextId, transcript, final = false) {
    this.#send({
      model_id: process.env.CARTESIA_MODEL ?? 'sonic-latest',
      voice: process.env.CARTESIA_VOICE_ID,
      language: process.env.CARTESIA_LANGUAGE ?? 'en',
      output_format: { container: 'raw', encoding: 'pcm_mulaw', sample_rate: 8000 },
      context_id: contextId,
      transcript,
      continue: !final,
    });
  }

  cancel(contextId) {
    this.#send({ context_id: contextId, cancel: true });
  }

  close() {
    this.#ws.close();
  }
}
