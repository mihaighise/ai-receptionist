// Deepgram streaming speech-to-text for one call.
// Emits "speech" (any recognized words, used to detect barge-in) and "turn" (the caller finished speaking).

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export class DeepgramSTT extends EventEmitter {
  #ws;
  #pending = [];
  #finals = [];

  constructor() {
    super();
    const params = new URLSearchParams({
      model: process.env.DEEPGRAM_MODEL ?? 'nova-3',
      encoding: 'mulaw', // Twilio sends 8kHz mono mu-law, which Deepgram accepts as-is
      sample_rate: '8000',
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      endpointing: '300', // ms of silence before a result is marked speech_final
      utterance_end_ms: '1000', // backup end-of-turn signal when endpointing misses it
      vad_events: 'true',
    });
    this.#ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, {
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
    });

    this.#ws.on('open', () => {
      for (const chunk of this.#pending) this.#ws.send(chunk);
      this.#pending = [];
    });
    this.#ws.on('message', (data) => this.#onMessage(JSON.parse(data)));
    this.#ws.on('error', (err) => console.error('Deepgram error:', err.message));
    this.#ws.on('close', (code, reason) => {
      if (code !== 1000) console.warn(`Deepgram closed (${code}) ${reason}`);
    });
  }

  #onMessage(msg) {
    if (msg.type === 'Results') {
      const text = msg.channel?.alternatives?.[0]?.transcript?.trim();
      if (text) this.emit('speech', text);
      if (msg.is_final && text) this.#finals.push(text);
      if (msg.speech_final) this.#endTurn();
    } else if (msg.type === 'UtteranceEnd') {
      this.#endTurn();
    } else if (msg.type === 'Error') {
      console.error('Deepgram error message:', msg);
    }
  }

  #endTurn() {
    if (this.#finals.length === 0) return;
    this.emit('turn', this.#finals.join(' '));
    this.#finals = [];
  }

  // Raw mu-law audio from Twilio.
  send(audio) {
    if (this.#ws.readyState === WebSocket.OPEN) this.#ws.send(audio);
    else if (this.#ws.readyState === WebSocket.CONNECTING) this.#pending.push(audio);
  }

  close() {
    if (this.#ws.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify({ type: 'CloseStream' }));
    else this.#ws.terminate();
  }
}
