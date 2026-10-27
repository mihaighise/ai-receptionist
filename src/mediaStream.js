// Handles one Twilio bidirectional media stream (one WebSocket per call).
// Inbound audio: 8kHz mono G.711 mu-law, base64-encoded, ~20ms per "media" frame.
// Outbound audio must be in the same format, sent as "media" messages with our streamSid.
//
// Pipeline: caller audio -> Deepgram (speech-to-text) -> Claude -> Cartesia (text-to-speech) -> caller

import twilio from 'twilio';
import { DeepgramSTT } from './stt.js';
import { CartesiaTTS } from './tts.js';
import { Receptionist } from './receptionist.js';
import { GREETING } from './business.js';

const ECHO = process.env.ECHO === 'true';
const PLAYBACK_TIMEOUT_MS = 15_000;

let twilioClient;
const getTwilioClient = () =>
  (twilioClient ??= twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN));

export function handleMediaStream(ws) {
  let streamSid = null;
  let callSid = null;
  let frames = 0;

  const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  const call = {
    // Play mu-law audio (base64) to the caller.
    sendAudio(payload) {
      if (streamSid) send({ event: 'media', streamSid, media: { payload } });
    },
    // Twilio echoes a mark back once all audio queued before it has finished playing.
    sendMark(name) {
      if (streamSid) send({ event: 'mark', streamSid, mark: { name } });
    },
    // Drop any audio still queued on Twilio's side, e.g. when the caller interrupts.
    clearAudio() {
      if (streamSid) send({ event: 'clear', streamSid });
    },
  };

  const stt = ECHO ? null : new DeepgramSTT();
  const tts = ECHO ? null : new CartesiaTTS();
  let receptionist = null;

  // Replies (TTS contexts) that are generating or still playing on the call.
  const playing = new Set();
  let playbackWaiters = [];
  const playbackFinished = () => {
    if (playing.size > 0) return;
    for (const resolve of playbackWaiters) resolve();
    playbackWaiters = [];
  };

  const speech = {
    begin() {
      const contextId = tts.newContext();
      let started = false;
      return {
        say(text) {
          if (!started) playing.add(contextId);
          started = true;
          tts.speak(contextId, text);
        },
        end() {
          if (started && playing.has(contextId)) tts.speak(contextId, '', true);
        },
      };
    },
  };

  tts?.on('audio', (contextId, audio) => playing.has(contextId) && call.sendAudio(audio));
  tts?.on('done', (contextId) => playing.has(contextId) && call.sendMark(contextId));

  // Caller talks over the receptionist: stop the audio and the reply being generated.
  function interrupt() {
    if (playing.size === 0) return;
    console.log('Caller interrupted');
    call.clearAudio();
    for (const contextId of playing) tts.cancel(contextId);
    playing.clear();
    playbackFinished();
    receptionist?.cancel();
  }

  stt?.on('speech', interrupt);
  stt?.on('turn', (text) => receptionist?.respond(text));

  function startReceptionist(from) {
    receptionist = new Receptionist({
      speech,
      call: {
        callSid,
        from,
        waitForPlayback: () =>
          new Promise((resolve) => {
            if (playing.size === 0) return resolve();
            playbackWaiters.push(resolve);
            setTimeout(resolve, PLAYBACK_TIMEOUT_MS);
          }),
        transfer: () => {
          const twiml = new twilio.twiml.VoiceResponse();
          twiml.dial(process.env.TRANSFER_NUMBER);
          return getTwilioClient().calls(callSid).update({ twiml: twiml.toString() });
        },
        hangup: () => getTwilioClient().calls(callSid).update({ status: 'completed' }),
      },
    });

    const greeting = speech.begin();
    greeting.say(GREETING);
    greeting.end();

    // Twilio records what it actually hears on the call; useful for debugging audio quality.
    if (process.env.RECORD_CALLS === 'true') {
      getTwilioClient()
        .calls(callSid)
        .recordings.create({ recordingChannels: 'dual' })
        .then((rec) => console.log(`Recording ${rec.sid} started (Twilio console > Monitor > Logs > Calls)`))
        .catch((err) => console.error('Could not start recording:', err.message));
    }
  }

  function cleanup() {
    receptionist?.cancel();
    stt?.close();
    tts?.close();
  }

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return console.warn('Non-JSON message on media stream');
    }

    switch (msg.event) {
      case 'connected':
        console.log('Media stream connected');
        break;

      case 'start':
        ({ streamSid, callSid } = msg.start);
        console.log(`Stream ${streamSid} started for call ${callSid}`, {
          format: msg.start.mediaFormat,
          params: msg.start.customParameters,
        });
        if (!ECHO) startReceptionist(msg.start.customParameters?.from);
        break;

      case 'media':
        frames++;
        if (ECHO) call.sendAudio(msg.media.payload);
        else stt.send(Buffer.from(msg.media.payload, 'base64'));
        break;

      case 'mark':
        playing.delete(msg.mark.name);
        playbackFinished();
        break;

      case 'dtmf':
        console.log(`DTMF digit: ${msg.dtmf.digit}`);
        break;

      case 'stop':
        console.log(`Stream ${streamSid} stopped after ${frames} frames (~${(frames * 0.02).toFixed(1)}s)`);
        cleanup();
        break;
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket closed for call ${callSid}`);
    cleanup();
  });
  ws.on('error', (err) => console.error('Media stream error:', err));
}
