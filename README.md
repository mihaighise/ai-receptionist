# ai-receptionist

An AI voice receptionist that answers phone calls. Callers talk to it in natural speech. It answers questions about the business, takes messages, transfers callers to a person and hangs up when the call is done.

## How it works

```
Caller ⇄ Twilio phone number
            │  webhook: POST /incoming-call → TwiML <Connect><Stream>
            ▼
      WebSocket /media-stream (8kHz mu-law audio, both directions)
            │
            ├─► Deepgram  speech-to-text, detects when the caller stops talking
            ├─► Claude    writes the reply and decides on actions (tools)
            └─► Cartesia  text-to-speech, streamed back to the caller sentence by sentence
```

- **Streaming replies:** Claude's reply is spoken while it's still being written, which keeps the pause before each answer short.
- **Interruptions:** if the caller talks over the receptionist, the audio stops right away and it listens.
- **Tools Claude can use:**
  - `take_message` saves the caller's name, callback number and request to `data/messages.jsonl`, and sends it to the owner by SMS and/or WhatsApp, marked **URGENT** when it matches the business's urgency rule.
  - `transfer_call` forwards the call to a person. It's only offered when a transfer number is set.
  - `end_call` hangs up after saying goodbye.

| File | What it does |
|---|---|
| `src/server.js` | Express webhook for Twilio and the WebSocket server |
| `src/mediaStream.js` | Runs one call: routes audio between Twilio, Deepgram and Cartesia, and handles interruptions |
| `src/receptionist.js` | The conversation with Claude, and the tools |
| `src/business.js` | **Business details, the actions turned on for it, and the system prompt. Edit this for your business** |
| `src/twilio.js` | Shared Twilio REST client, used for transfers, hangups and alerts |
| `src/stt.js` / `src/tts.js` | Deepgram and Cartesia WebSocket clients |

## Setup

Requirements: Node.js 20.12 or newer, plus accounts with [Twilio](https://console.twilio.com), [Anthropic](https://console.anthropic.com), [Deepgram](https://console.deepgram.com), [Cartesia](https://play.cartesia.ai) and [ngrok](https://ngrok.com) for local development.

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure**
   ```bash
   cp .env.example .env
   ```
   Fill in the keys in `.env`. Real keys go only in `.env`, which git ignores. Never put them in `.env.example`.
3. **Start a tunnel** so Twilio can reach your machine. Set `PUBLIC_URL` in `.env` to this URL.
   ```bash
   ngrok http 3000 --url=<your-ngrok-domain>
   ```
4. **Start the server**
   ```bash
   npm run dev
   ```
   You can check the tunnel at `https://<your-ngrok-domain>/health`, which should show `ok`.
5. **Point your Twilio number at the server.** In the Twilio Console, go to Phone Numbers → Manage → Active numbers, open your number, then the **Configure** tab. Set **A call comes in** to **Webhook**, `https://<your-ngrok-domain>/incoming-call`, **HTTP POST**, then click **Save configuration**.
6. **Call your Twilio number.**

## Configuration (`.env`)

| Variable | Required | Description |
|---|---|---|
| `PUBLIC_URL` | yes | Public https URL Twilio uses to reach the server (your ngrok URL) |
| `TWILIO_ACCOUNT_SID` | yes | Needed to transfer calls and hang up |
| `TWILIO_AUTH_TOKEN` | recommended | Checks that webhook requests really come from Twilio |
| `ANTHROPIC_API_KEY` | yes | Claude API key. The API is billed separately from Claude.ai subscriptions |
| `DEEPGRAM_API_KEY` | yes | Speech-to-text |
| `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` | yes | Text-to-speech key, and a voice ID from the Cartesia voice library |
| `TRANSFER_NUMBER` | no | Number to forward callers to when they ask for a person. Leave empty to disable transfers |
| `OWNER_SMS_NUMBER` | no | Owner's mobile; each message is texted here. Texts to US numbers need [A2P 10DLC registration](https://console.twilio.com/us1/develop/sms/regulatory-compliance), otherwise they fail with error 30034 |
| `OWNER_WHATSAPP_NUMBER` | no | Owner's WhatsApp number; each message is also sent here |
| `TWILIO_WHATSAPP_FROM` | no | Your Twilio WhatsApp sender. Defaults to the Twilio Sandbox number (`+14155238886`), which the owner must join first and message every 24 hours |
| `ECHO` | no | `true` plays the caller's own voice back, to test the audio stream without the AI services |
| `RECORD_CALLS` | no | `true` has Twilio record calls, for checking audio quality. Recordings are billed by Twilio |
| `CLAUDE_MODEL`, `DEEPGRAM_MODEL`, `CARTESIA_MODEL` | no | Override the default models (`claude-sonnet-5-5`, `nova-3`, `sonic-latest`) |
| `PORT` | no | Defaults to `3000` |

## Troubleshooting

- **Call fails immediately and the caller hears "not available":** on a Twilio trial account, only verified numbers can call in (error 21264). Add your number under Phone Numbers → Manage → Verified Caller IDs, or upgrade the account.
- **"An application error has occurred":** the webhook isn't reachable or rejected the request. Check the ngrok inspector at http://localhost:4040 and the server log. If the log says `invalid Twilio signature`, `PUBLIC_URL` or `TWILIO_AUTH_TOKEN` doesn't match.
- **The receptionist apologizes and says it's having trouble:** usually a Claude API error, such as no credit balance. The server log shows the exact error.
- **To find the exact error for any call:** Twilio Console → Monitor → Logs → Calls (or Errors).

## Known issues

- The voice can sound choppy at the start of a call. Cartesia streams audio much faster than real time, so the likely cause is the network path at the start of the call (laptop → ngrok → Twilio) or the greeting being sent while connections are still opening.
- Appointments aren't booked directly yet. They're saved as messages for staff to follow up on.
