// Handles one Twilio bidirectional media stream (one WebSocket per call).
// Inbound audio: 8kHz mono G.711 mu-law, base64-encoded, ~20ms per "media" frame.
// Outbound audio must be in the same format, sent as "media" messages with our streamSid.

const ECHO = process.env.ECHO === 'true';

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
        break;

      case 'media':
        frames++;
        // TODO: forward msg.media.payload to speech-to-text / a realtime voice model.
        if (ECHO) call.sendAudio(msg.media.payload);
        break;

      case 'mark':
        console.log(`Mark played: ${msg.mark.name}`);
        break;

      case 'dtmf':
        console.log(`DTMF digit: ${msg.dtmf.digit}`);
        break;

      case 'stop':
        console.log(`Stream ${streamSid} stopped after ${frames} frames (~${(frames * 0.02).toFixed(1)}s)`);
        break;
    }
  });

  ws.on('close', () => console.log(`WebSocket closed for call ${callSid}`));
  ws.on('error', (err) => console.error('Media stream error:', err));
}
