// Handles one Twilio bidirectional media stream (one WebSocket per call).
// Inbound audio: 8kHz mono G.711 mu-law, base64-encoded, ~20ms per "media" frame.
// Outbound audio must be in the same format, sent as "media" messages with our streamSid.
//
// Pipeline: caller audio -> Deepgram (speech-to-text) -> Claude -> Cartesia (text-to-speech) -> caller
//
// This file is the "switchboard" for a call: it owns the connections to Twilio, Deepgram and
// Cartesia, tracks which replies are still playing, and handles the caller interrupting.
// The conversation itself (what to say, which tools to use) lives in receptionist.js.
//
// Twilio sends these events on the socket, in this order:
//   connected -> start (call details) -> media (repeated, ~50 per second) -> stop
// plus "mark" (a marker we sent has finished playing) and "dtmf" (a keypad digit was pressed).

import twilio from 'twilio';
import { DeepgramSTT } from './stt.js';
import { CartesiaTTS } from './tts.js';
import { Receptionist } from './receptionist.js';
import { BUSINESS, GREETING } from './business.js';
import { getTwilioClient } from './twilio.js';
import { CallCosts } from './costs.js';

// ECHO=true skips the AI entirely and plays the caller's audio back, to test the stream itself.
const ECHO = process.env.ECHO === 'true';
// Safety net when waiting for audio to finish (before a transfer or hangup), in case a mark never comes back.
const PLAYBACK_TIMEOUT_MS = 15_000;

export function handleMediaStream(ws) {
  // Both IDs arrive in the "start" event. Twilio ignores outbound messages without the streamSid.
  let streamSid = null;
  let callSid = null;
  let frames = 0;

  const send = (msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

  // The three things we can tell Twilio to do with outbound audio.
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

  // Open the speech services as soon as the socket connects, so they're ready by the time
  // the "start" event arrives and the greeting needs to be spoken.
  const stt = ECHO ? null : new DeepgramSTT();
  const tts = ECHO ? null : new CartesiaTTS();
  let receptionist = null;
  // Adds up what this call uses, printed as a cost summary when the call ends.
  const costs = new CallCosts();

  // Replies (TTS contexts) that are generating or still playing on the call.
  // A reply is added when its first text is sent to Cartesia and removed when Twilio returns its
  // mark, i.e. the caller has heard all of it. While this set is non-empty, the receptionist is talking.
  const playing = new Set();
  // Promises waiting for the receptionist to stop talking (see waitForPlayback below).
  let playbackWaiters = [];
  const playbackFinished = () => {
    if (playing.size > 0) return;
    for (const resolve of playbackWaiters) resolve();
    playbackWaiters = [];
  };

  // How receptionist.js speaks: begin() starts a reply, say() adds text to it as Claude writes it,
  // end() tells Cartesia no more text is coming for that reply.
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
          // Skip replies that never said anything (e.g. a pure tool call) or were interrupted.
          if (started && playing.has(contextId)) tts.speak(contextId, '', true);
        },
      };
    },
  };

  // Forward Cartesia's audio straight to the caller. Audio for a reply that was interrupted
  // (no longer in `playing`) is dropped. When a reply is fully generated, queue a mark named
  // after it; Twilio sends the mark back once the caller has heard everything before it.
  tts?.on('audio', (contextId, audio) => playing.has(contextId) && call.sendAudio(audio));
  tts?.on('done', (contextId) => playing.has(contextId) && call.sendMark(contextId));

  // Caller talks over the receptionist: stop the audio and the reply being generated.
  function interrupt() {
    if (playing.size === 0) return; // not talking, so nothing to interrupt
    console.log('Caller interrupted');
    call.clearAudio(); // stop what Twilio has already queued
    for (const contextId of playing) tts.cancel(contextId); // stop Cartesia generating more
    playing.clear();
    playbackFinished();
    receptionist?.cancel(); // stop Claude writing more
  }

  // "speech" fires as soon as Deepgram recognizes any words (barge-in);
  // "turn" fires once the caller has finished speaking, with the full text.
  stt?.on('speech', interrupt);
  stt?.on('turn', (text) => receptionist?.respond(text));

  // Called on the "start" event, once we know who is calling. `from` is the caller and `to` is
  // our Twilio number, both passed as <Parameter>s by the webhook in server.js.
  function startReceptionist({ from, to }) {
    receptionist = new Receptionist({
      speech,
      costs,
      call: {
        callSid,
        from,
        to,
        // Resolves once the receptionist has finished talking, so a transfer or hangup
        // doesn't cut off its last sentence ("One moment, I'll put you through").
        waitForPlayback: () =>
          new Promise((resolve) => {
            if (playing.size === 0) return resolve();
            playbackWaiters.push(resolve);
            setTimeout(resolve, PLAYBACK_TIMEOUT_MS);
          }),
        // Both use the Twilio REST API to change the live call. Replacing the call's TwiML
        // ends our <Connect><Stream>, which closes this WebSocket.
        transfer: () => {
          const twiml = new twilio.twiml.VoiceResponse();
          twiml.dial(BUSINESS.actions.transfer.number);
          return getTwilioClient().calls(callSid).update({ twiml: twiml.toString() });
        },
        hangup: () => getTwilioClient().calls(callSid).update({ status: 'completed' }),
      },
    });

    // The greeting is fixed text, so it's spoken right away without asking Claude.
    const greeting = speech.begin();
    greeting.say(GREETING);
    greeting.end();

    // Twilio records what it actually hears on the call; useful for debugging audio quality.
    // "dual" keeps the caller and the receptionist on separate channels.
    if (process.env.RECORD_CALLS === 'true') {
      getTwilioClient()
        .calls(callSid)
        .recordings.create({ recordingChannels: 'dual' })
        .then((rec) => console.log(`Recording ${rec.sid} started (Twilio console > Monitor > Logs > Calls)`))
        .catch((err) => console.error('Could not start recording:', err.message));
    }
  }

  // Close everything for this call. Can run twice ("stop" and then "close"), so the cost
  // summary is only started once.
  let reported = false;
  function cleanup() {
    receptionist?.cancel();
    stt?.close();
    tts?.close();
    if (!ECHO && !reported && callSid) {
      reported = true;
      costs.audioSeconds = frames * 0.02;
      costs.deepgramRequestId = stt?.requestId;
      costs.report(callSid).catch((err) => console.error('Could not report call costs:', err.message));
    }
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
        if (!ECHO) startReceptionist(msg.start.customParameters ?? {});
        break;

      case 'media':
        // ~20ms of caller audio. Deepgram accepts Twilio's mu-law as-is, so we only decode the base64.
        frames++;
        if (ECHO) call.sendAudio(msg.media.payload);
        else stt.send(Buffer.from(msg.media.payload, 'base64'));
        break;

      case 'mark':
        // A reply has finished playing to the caller.
        playing.delete(msg.mark.name);
        playbackFinished();
        break;

      case 'dtmf':
        console.log(`DTMF digit: ${msg.dtmf.digit}`);
        break;

      case 'stop':
        // The call ended (caller hung up, or we transferred or hung up).
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
