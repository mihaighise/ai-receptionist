// Entry point. Runs one HTTP server that does two jobs:
//   1. POST /incoming-call: the webhook Twilio calls when someone dials one of our numbers. We look
//      up the business that owns the number and answer with TwiML (Twilio's XML instructions)
//      telling Twilio to stream the call audio to us.
//   2. WebSocket /media-stream: Twilio connects here and sends the live call audio; we send the
//      receptionist's voice back on the same socket (see mediaStream.js).
// Settings come from .env, loaded by the npm scripts (node --env-file-if-exists=.env).
// Businesses come from the database (Postgres), whose schema is brought up to date on startup.

import http from 'node:http';
import express from 'express';
import twilio from 'twilio';
import { WebSocketServer } from 'ws';
import { handleMediaStream } from './mediaStream.js';
import { findBusinessByNumber } from '../shared/businesses.js';
import { migrate } from '../shared/db/migrate.js';
import { answerFor } from '../shared/usage.js';

const PORT = Number(process.env.PORT ?? 3000);
// Public base URL Twilio reaches us on, e.g. https://abc123.ngrok-free.app
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '');
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

// Fail fast on startup instead of mid-call if required settings are missing.
if (!PUBLIC_URL) {
  console.error('PUBLIC_URL is required (the https URL Twilio uses to reach this server)');
  process.exit(1);
}

if (process.env.ECHO !== 'true') {
  // The Anthropic key isn't checked here because the SDK can also find credentials elsewhere.
  const missing = ['DEEPGRAM_API_KEY', 'CARTESIA_API_KEY', 'CARTESIA_VOICE_ID'].filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} (or set ECHO=true to test the audio stream only)`);
    process.exit(1);
  }
  if (!process.env.TWILIO_ACCOUNT_SID) console.warn('TWILIO_ACCOUNT_SID not set: transfer_call and end_call will fail');
}

try {
  await migrate();
} catch (err) {
  console.error(`Could not set up the database: ${err.message}`);
  console.error('Is Postgres running? Start it with: docker compose up -d db');
  process.exit(1);
}

const app = express();
// Twilio posts webhook data as a URL-encoded form (CallSid=...&From=...&To=...).
app.use(express.urlencoded({ extended: false }));

// Reject webhook requests that weren't signed by Twilio. Skipped when no auth token is set (local dev).
// Twilio signs each request with your auth token over the full URL it called plus the form fields,
// so the URL we rebuild here must match the webhook URL in the Twilio console exactly.
function validateTwilio(req, res, next) {
  if (!TWILIO_AUTH_TOKEN) return next();
  const signature = req.header('X-Twilio-Signature') ?? '';
  const url = PUBLIC_URL + req.originalUrl;
  if (twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body)) return next();
  console.warn('Rejected webhook with invalid Twilio signature');
  res.status(403).send('Invalid signature');
}

// Quick check that the server (and the ngrok tunnel) is reachable from a browser.
app.get('/health', (_req, res) => res.send('ok'));

// Twilio "A call comes in" webhook. <Connect><Stream> opens a bidirectional media stream
// and holds the call open for as long as the WebSocket stays connected.
// (<Start><Stream> would only fork the audio one way; <Connect> lets us talk back.)
app.post('/incoming-call', validateTwilio, async (req, res) => {
  const { CallSid, From, To } = req.body;
  console.log(`Incoming call ${CallSid} from ${From} to ${To}`);

  const twiml = new twilio.twiml.VoiceResponse();
  // To is the number that was dialed, so it tells us which business the call is for.
  const business = await findBusinessByNumber(To);
  if (!business) {
    // No active business owns this number (not assigned yet, or the subscription ended).
    console.warn(`No active business for ${To}; rejecting call ${CallSid}`);
    twiml.say('Sorry, this number is not in service.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  // A business whose plan has run out of minutes (and has no extra minutes left) doesn't get the
  // receptionist; usage.js decides.
  const answer = await answerFor(business);
  if (answer !== 'answer') {
    console.warn(`${business.name} is out of minutes; ${answer === 'transfer' ? 'transferring' : 'declining'} call ${CallSid}`);
    if (answer === 'transfer') twiml.dial(business.actions.transfer.number);
    else {
      twiml.say("Sorry, we can't take your call right now. Please call back later.");
      twiml.hangup();
    }
    return res.type('text/xml').send(twiml.toString());
  }

  const connect = twiml.connect();
  // https://host -> wss://host: the stream must use a secure WebSocket URL.
  const stream = connect.stream({ url: `${PUBLIC_URL.replace(/^http/, 'ws')}/media-stream` });
  // Custom parameters arrive in the stream's "start" message (query strings on the url are not supported).
  // "from" is the caller's number; "to" is our Twilio number, which owner texts are sent from;
  // "businessId" is the business the call is for, loaded again when the stream starts.
  stream.parameter({ name: 'from', value: From ?? '' });
  stream.parameter({ name: 'to', value: To ?? '' });
  stream.parameter({ name: 'businessId', value: business.id });

  res.type('text/xml').send(twiml.toString());
});

// Express and the WebSocket server share one port: plain HTTP requests go to Express, and
// WebSocket upgrade requests to /media-stream go to the WebSocket server.
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/media-stream' });
// One WebSocket connection = one phone call.
wss.on('connection', handleMediaStream);

server.listen(PORT, () => {
  console.log(`Listening on :${PORT}`);
  console.log(`Twilio voice webhook: POST ${PUBLIC_URL}/incoming-call`);
});
