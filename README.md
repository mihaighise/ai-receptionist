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

Claude's reply is spoken while it's still being written, sentence by sentence, which keeps the pause before each answer short.

## How a call goes

### 1. Greeting
As soon as the call connects, the receptionist says "Thanks for calling Sunrise Dental. How can I help you today?", then in Spanish "Si prefiere español, puede hablar en español." The greeting is fixed text, so it plays without waiting for Claude.

The greeting can't be interrupted, because many callers say "Hello?" the moment the call connects. Anything the caller says during it is still heard and answered once it ends.

### 2. Conversation
- **What it knows:** only the business details in `src/business.js` (address, hours, phone, FAQ). If it doesn't know something, it says so and offers to take a message instead of guessing.
- **How it speaks:** one or two short spoken sentences at a time, one question at a time, and numbers read out the way a person would.
- **English and Spanish:** it replies in whichever language the caller is speaking, and switches back and forth mid-call. It only switches when a turn has at least two words and most of them are in the other language, so a lone "ok", "no" or "sí" doesn't flip it. The whole conversation stays in Claude's history, so nothing is forgotten when the caller switches.
- **Interruptions:** if the caller talks over the receptionist, its audio stops right away and it listens. What it had already said is kept, so Claude knows where it left off.
  - It takes at least two real words to interrupt ("wait, actually", "no, Tuesday"), so background noise transcribed as a single word doesn't cut it off.
  - Listening sounds ("mhm", "uh-huh", "ajá") and short answers ("okay", "yeah", "sí") don't interrupt. Sounds alone are ignored, and the receptionist carries on.
  - A short answer or a one-word turn like "Stop." is still answered once the caller finishes saying it, so a quick "Yes" to "Is that right?" is never lost.

### 3. Taking a message
Appointment requests, callbacks and anything the receptionist can't handle become a message for the staff. It works as one message per call:

1. The receptionist collects the caller's name, callback number (offering the number they're calling from) and what they need, then reads it back.
2. Once the caller confirms, Claude uses `take_message`. The message is kept as a draft for now.
3. If the caller then changes or adds something ("make it Wednesday instead"), the receptionist reads back the change and calls `take_message` again, which replaces the draft. If they change their mind, `cancel_message` deletes it.
4. **When the call ends**, the final version is saved to `data/messages.jsonl` and sent to the owner by SMS and/or WhatsApp. A cancelled message is not sent.

Messages are always written in English, translated if the caller spoke Spanish. A message is marked **URGENT** when it matches the business's urgency rule (for the dental clinic: severe pain, swelling, bleeding or a knocked-out tooth).

### 4. Ending the call
- **The receptionist ends it:** after saying goodbye, Claude uses `end_call`. The goodbye finishes playing before the line hangs up.
- **Transfer to a person:** if the caller asks for a person, Claude uses `transfer_call` after saying "One moment, I'll put you through." It's only offered when `TRANSFER_NUMBER` is set; otherwise the receptionist offers to take a message.
- **The caller hangs up:** nothing more is sent to Claude, so no reply is generated and no new message is taken for a call nobody is on. A message the caller already confirmed is still sent.

### 5. Afterwards
The server log shows what the call cost: Claude from the tokens used, Deepgram from the billed minutes its API reports, and Twilio from the call's price. The summary appears up to about 2 minutes after the call, once Twilio and Deepgram have billed it.

## Files

| File | What it does |
|---|---|
| `src/server.js` | Express webhook for Twilio and the WebSocket server |
| `src/mediaStream.js` | Runs one call: routes audio between Twilio, Deepgram and Cartesia, and handles interruptions |
| `src/receptionist.js` | The conversation with Claude, and the tools |
| `src/business.js` | **Business details, the actions turned on for it, and the system prompt. Edit this for your business** |
| `src/twilio.js` | Shared Twilio REST client, used for transfers, hangups and alerts |
| `src/costs.js` | Adds up what each call used and prints its cost per service when the call ends |
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
| `CARTESIA_VOICE_ID_ES` | no | A different voice for Spanish replies. Without it the same voice speaks both languages |
| `DEEPGRAM_LANGUAGE` | no | `multi` (default) hears English and Spanish; `en` for English only |
| `TRANSFER_NUMBER` | no | Number to forward callers to when they ask for a person. Leave empty to disable transfers |
| `OWNER_SMS_NUMBER` | no | Owner's mobile; each message is texted here. Texts to US numbers need [A2P 10DLC registration](https://console.twilio.com/us1/develop/sms/regulatory-compliance), otherwise they fail with error 30034 |
| `OWNER_WHATSAPP_NUMBER` | no | Owner's WhatsApp number; each message is also sent here |
| `TWILIO_WHATSAPP_FROM` | no | Your Twilio WhatsApp sender. Defaults to the Twilio Sandbox number (`+14155238886`), which the owner must join first and message every 24 hours |
| `ECHO` | no | `true` plays the caller's own voice back, to test the audio stream without the AI services |
| `RECORD_CALLS` | no | `true` has Twilio record calls, for checking audio quality. Recordings are billed by Twilio |
| `DEEPGRAM_PROJECT_ID` | no | Deepgram project used to look up each call's cost. Found from the API key if not set |
| `DEEPGRAM_PRICE_PER_MIN` | no | Price of Deepgram's billed minutes in the cost summary. Defaults to `0.0077` (Nova-3 pay as you go) |
| `CLAUDE_MODEL`, `DEEPGRAM_MODEL`, `CARTESIA_MODEL` | no | Override the default models (`claude-sonnet-5-5`, `nova-3`, `sonic-latest`) |
| `PORT` | no | Defaults to `3000` |

## Troubleshooting

- **Call fails immediately and the caller hears "not available":** on a Twilio trial account, only verified numbers can call in (error 21264). Add your number under Phone Numbers → Manage → Verified Caller IDs, or upgrade the account.
- **"An application error has occurred":** the webhook isn't reachable or rejected the request. Check the ngrok inspector at http://localhost:4040 and the server log. If the log says `invalid Twilio signature`, `PUBLIC_URL` or `TWILIO_AUTH_TOKEN` doesn't match.
- **The receptionist apologizes and says it's having trouble:** usually a Claude API error, such as no credit balance. The server log shows the exact error.
- **To find the exact error for any call:** Twilio Console → Monitor → Logs → Calls (or Errors).

## Known issues

- Messages are kept in memory until the call ends. If the server stops or restarts during a call (including `npm run dev` restarting after a file is edited), that call's message is lost.
- The voice can sound choppy at the start of a call. Cartesia streams audio much faster than real time, so the likely cause is the network path at the start of the call (laptop → ngrok → Twilio) or the greeting being sent while connections are still opening.
- Appointments aren't booked directly yet. They're saved as messages for staff to follow up on.
