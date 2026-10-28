// Deepgram streaming speech-to-text for one call.
// Emits "speech" (any recognized words, used to detect barge-in) and "turn" (the caller finished speaking).
//
// We stream raw call audio to Deepgram over a WebSocket and it sends back "Results" messages:
//   - interim results: a quick guess at the words so far, which may still change
//   - is_final: this stretch of audio is settled and won't change any more
//   - speech_final: the caller paused long enough (endpointing) that they've probably finished talking
// One turn ("I'd like to book... a cleaning next week") can arrive as several final pieces,
// so they're collected until speech_final and then joined into one "turn".

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';

export class DeepgramSTT extends EventEmitter {
  #ws;
  #pending = []; // audio received before the socket finished connecting
  #finals = []; // final pieces of the turn the caller is still speaking
  // Deepgram's ID for this stream, used after the call to look up what it cost (see costs.js).
  requestId = null;

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

    // Deepgram returns the request ID as a header when the WebSocket connects.
    this.#ws.on('upgrade', (res) => (this.requestId = res.headers['dg-request-id'] ?? null));
    // Send the audio that arrived while connecting, so the start of the call isn't lost.
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
      this.requestId ??= msg.metadata?.request_id ?? null;
      // alternatives[0] is Deepgram's best guess. Empty transcripts are silence or noise.
      const text = msg.channel?.alternatives?.[0]?.transcript?.trim();
      if (text) this.emit('speech', text);
      if (msg.is_final && text) this.#finals.push(text);
      if (msg.speech_final) this.#endTurn();
    } else if (msg.type === 'UtteranceEnd') {
      // Backup signal: sent after utterance_end_ms of no words, e.g. when background
      // noise kept speech_final from firing.
      this.#endTurn();
    } else if (msg.type === 'Error') {
      console.error('Deepgram error message:', msg);
    }
  }

  // Both speech_final and UtteranceEnd can fire for the same turn; the second one finds
  // nothing collected and does nothing.
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

  // CloseStream asks Deepgram to finish processing and close cleanly (it stops billing too).
  close() {
    if (this.#ws.readyState === WebSocket.OPEN) this.#ws.send(JSON.stringify({ type: 'CloseStream' }));
    else this.#ws.terminate();
  }
}
