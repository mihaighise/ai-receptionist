import http from 'node:http';
import express from 'express';
import twilio from 'twilio';
import { WebSocketServer } from 'ws';
import { handleMediaStream } from './mediaStream.js';

const PORT = Number(process.env.PORT ?? 3000);
// Public base URL Twilio reaches us on, e.g. https://abc123.ngrok-free.app
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '');
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

if (!PUBLIC_URL) {
  console.error('PUBLIC_URL is required (the https URL Twilio uses to reach this server)');
  process.exit(1);
}

if (process.env.ECHO !== 'true') {
  const missing = ['DEEPGRAM_API_KEY', 'CARTESIA_API_KEY', 'CARTESIA_VOICE_ID'].filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing ${missing.join(', ')} (or set ECHO=true to test the audio stream only)`);
    process.exit(1);
  }
  if (!process.env.TWILIO_ACCOUNT_SID) console.warn('TWILIO_ACCOUNT_SID not set: transfer_call and end_call will fail');
}

const app = express();
app.use(express.urlencoded({ extended: false }));

// Reject webhook requests that weren't signed by Twilio. Skipped when no auth token is set (local dev).
function validateTwilio(req, res, next) {
  if (!TWILIO_AUTH_TOKEN) return next();
  const signature = req.header('X-Twilio-Signature') ?? '';
  const url = PUBLIC_URL + req.originalUrl;
  if (twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body)) return next();
  console.warn('Rejected webhook with invalid Twilio signature');
  res.status(403).send('Invalid signature');
}

app.get('/health', (_req, res) => res.send('ok'));

// Twilio "A call comes in" webhook. <Connect><Stream> opens a bidirectional media stream
// and holds the call open for as long as the WebSocket stays connected.
app.post('/incoming-call', validateTwilio, (req, res) => {
  const { CallSid, From, To } = req.body;
  console.log(`Incoming call ${CallSid} from ${From} to ${To}`);

  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  const stream = connect.stream({ url: `${PUBLIC_URL.replace(/^http/, 'ws')}/media-stream` });
  // Custom parameters arrive in the stream's "start" message (query strings on the url are not supported).
  stream.parameter({ name: 'from', value: From ?? '' });
  stream.parameter({ name: 'to', value: To ?? '' });

  res.type('text/xml').send(twiml.toString());
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/media-stream' });
wss.on('connection', handleMediaStream);

server.listen(PORT, () => {
  console.log(`Listening on :${PORT}`);
  console.log(`Twilio voice webhook: POST ${PUBLIC_URL}/incoming-call`);
});
