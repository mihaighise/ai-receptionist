# ai-receptionist

An AI voice receptionist that answers phone calls. Callers talk to it in natural speech. It answers questions about the business, takes messages, transfers callers to a person and hangs up when the call is done.

One server answers for many businesses. Each business has its own Twilio number, and its details, languages and enabled actions are stored in Postgres.

## How it works

```
Caller ⇄ Twilio phone number
            │  webhook: POST /incoming-call → looks up the business that owns the dialed number
            │                                → TwiML <Connect><Stream>
            ▼
      WebSocket /media-stream (8kHz mu-law audio, both directions)
            │
            ├─► Deepgram  speech-to-text, detects when the caller stops talking
            ├─► Claude    writes the reply and decides on actions (tools)
            └─► Cartesia  text-to-speech, streamed back to the caller sentence by sentence
```

Claude's reply is spoken while it's still being written, sentence by sentence, which keeps the pause before each answer short.

## How a call goes

### 0. Which business?
Twilio tells the server which number was dialed. The server finds the active business that owns that number and loads its settings for the call. If no active business owns it, the caller hears "Sorry, this number is not in service." and the call ends.

### 1. Greeting
As soon as the call connects, the receptionist greets the caller in the business's main language, then offers each of its other languages. For the demo business: "Thanks for calling Sunrise Dental. How can I help you today?", then in Spanish "Si prefiere español, puede hablar en español." The greeting is fixed text, so it plays without waiting for Claude.

The greeting can't be interrupted, because many callers say "Hello?" the moment the call connects. Anything the caller says during it is still heard and answered once it ends.

### 2. Conversation
- **What it knows:** only the business's details in the database (address, hours, phone, FAQ). If it doesn't know something, it says so and offers to take a message instead of guessing.
- **How it speaks:** one or two short spoken sentences at a time, one question at a time, and numbers read out the way a person would.
- **English and Spanish:** for a business that speaks both, it replies in whichever language the caller is speaking, and switches back and forth mid-call. It only switches when a turn has at least two words and most of them are in the other language, so a lone "ok", "no" or "sí" doesn't flip it. The whole conversation stays in Claude's history, so nothing is forgotten when the caller switches.
- **Interruptions:** if the caller talks over the receptionist, its audio stops right away and it listens. What it had already said is kept, so Claude knows where it left off.
  - It takes at least two real words to interrupt ("wait, actually", "no, Tuesday"), so background noise transcribed as a single word doesn't cut it off.
  - Listening sounds ("mhm", "uh-huh", "ajá") and short answers ("okay", "yeah", "sí") don't interrupt. Sounds alone are ignored, and the receptionist carries on.
  - A short answer or a one-word turn like "Stop." is still answered once the caller finishes saying it, so a quick "Yes" to "Is that right?" is never lost.

### 3. Taking a message
For businesses with the `messages` feature on, appointment requests, callbacks and anything the receptionist can't handle become a message for the staff. It works as one message per call:

1. The receptionist collects the caller's name, callback number (offering the number they're calling from) and what they need, then reads it back.
2. Once the caller confirms, Claude uses `take_message`. The message is kept as a draft for now.
3. If the caller then changes or adds something ("make it Wednesday instead"), the receptionist reads back the change and calls `take_message` again, which replaces the draft. If they change their mind, `cancel_message` deletes it.
4. **When the call ends**, the final version is saved to `data/messages.jsonl` and sent to the business's owner by SMS and/or WhatsApp (`notify_sms`, `notify_whatsapp`). A cancelled message is not sent.

Messages are always written in English, translated if the caller spoke Spanish. A message is marked **URGENT** when it matches the business's urgency rule (`urgent_when`; for the dental clinic: severe pain, swelling, bleeding or a knocked-out tooth).

### 4. Ending the call
- **The receptionist ends it:** after saying goodbye, Claude uses `end_call`. The goodbye finishes playing before the line hangs up.
- **Transfer to a person:** if the caller asks for a person, Claude uses `transfer_call` after saying "One moment, I'll put you through." It's only offered when the business has the `transfers` feature on and a `transfer_number`; otherwise the receptionist offers to take a message.
- **The caller hangs up:** nothing more is sent to Claude, so no reply is generated and no new message is taken for a call nobody is on. A message the caller already confirmed is still sent.

### 5. Afterwards
The server log shows what the call cost: Claude from the tokens used, Deepgram from the billed minutes its API reports, and Twilio from the call's price. The summary appears up to about 2 minutes after the call, once Twilio and Deepgram have billed it.

## Files

The backend in `src/` is split by job. Code in `shared/` is used by both the phone server and the API, so a change there can affect live calls.

**`src/phone/`: answering calls** (`npm run dev`)

| File | What it does |
|---|---|
| `server.js` | Express webhook for Twilio (picks the business by the dialed number) and the WebSocket server |
| `mediaStream.js` | Runs one call: loads its business, routes audio between Twilio, Deepgram and Cartesia, and handles interruptions |
| `receptionist.js` | The conversation with Claude, and the tools the business has turned on |
| `stt.js` / `tts.js` | Deepgram and Cartesia WebSocket clients |
| `costs.js` | Adds up what each call used and prints its cost per service when the call ends |

**`src/api/`: the backend for the web apps** (`npm run api`)

| File | What it does |
|---|---|
| `server.js` | Starts the API: checks its settings, migrates the database and listens |
| `app.js` | The API's routes: each app's under `/api`, and the admin password |
| `admin/routes.js` | `/api/admin/...`: list, create, edit and delete businesses, link their owners, and preview them |
| `owner/routes.js` | `/api/owner/...`: the signed-in owner, and setting up and changing their business |
| `business-input.js` | Checks the business settings both sites send, and what each may change |
| `billing.js` | Subscriptions with Stripe: Checkout, the billing page, and keeping each business's copy of its subscription up to date |
| `stripe-webhook.js` | `/api/stripe/webhook`: Stripe's notifications about subscriptions |
| `stripe-setup.js` | Creates the plans and billing page settings in Stripe (`npm run stripe:setup`) |
| `menu-import.js` | Reads a menu or price list from photos with Claude, as lines for the common questions |
| `phone-numbers.js` | Buys a paying business its Twilio number and points it at the phone server (dry run by default) |
| `auth.js` | Owner sign-in with Better Auth (`/api/auth/...`): Google now, Microsoft and Apple later |
| `auth-sql.js` | Prints the SQL Better Auth needs after an upgrade (`npm run db:auth-sql`) |

**`src/shared/`: used by both**

| File | What it does |
|---|---|
| `businesses.js` | Reads and writes businesses in the database |
| `users.js` | Looks up people who have signed in (the table belongs to Better Auth) |
| `plans.js` | The plans, their prices and minutes, extra minutes, and which subscription statuses count as paid |
| `twilio.js` | Shared Twilio REST client: transfers, hangups, alerts and buying numbers |
| `usage.js` | Counts call minutes: records each call, uses extra minutes past the plan's, and decides whether a new call is answered |
| `prompt.js` | Builds the greeting and Claude's instructions from a business |
| `languages.js` | The languages the receptionist can speak, with the greeting lines in each |
| `db/pool.js` | Postgres connection pool |
| `db/migrate.js` | Runs the SQL files in `db/migrations` that haven't run yet (on startup, or `npm run db:migrate`) |
| `db/seed.js` | Demo businesses, added with `npm run db:seed` |

**Everything else**

| Path | What it holds |
|---|---|
| `web/` | **Web app** (owner app and admin site): a React app with its own `package.json`, Dockerfile and README |
| `db/migrations/` | The database schema, one numbered SQL file per change |
| `test/` | Backend tests (`npm test`), and the helpers the browser tests in `web/e2e` share |
| `Dockerfile`, `docker-compose.yml` | Containers for Postgres, the phone server, the API, the admin site and the ngrok tunnel |

## Setup

Requirements: Node.js 20.12 or newer, Docker Desktop, plus accounts with [Twilio](https://console.twilio.com), [Anthropic](https://console.anthropic.com), [Deepgram](https://console.deepgram.com), [Cartesia](https://play.cartesia.ai) and [ngrok](https://ngrok.com) for local development.

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure**
   ```bash
   cp .env.example .env
   ```
   Fill in the keys in `.env`. Real keys go only in `.env`, which git ignores. Never put them in `.env.example`.
3. **Start the database and add the demo businesses**
   ```bash
   docker compose up -d db
   npm run db:seed
   ```
   Postgres runs in Docker on port 5433 and keeps its data between restarts. The seed puts your Twilio number on Sunrise Dental. To use another number, change `twilio_number` in `src/shared/db/seed.js` and run the seed again.
4. **Start a tunnel** so Twilio can reach your machine. Set `PUBLIC_URL` in `.env` to this URL.
   ```bash
   ngrok http 3000 --url=<your-ngrok-domain>
   ```
5. **Start the server**
   ```bash
   npm run dev
   ```
   You can check the tunnel at `https://<your-ngrok-domain>/health`, which should show `ok`.
6. **Point your Twilio number at the server.** In the Twilio Console, go to Phone Numbers → Manage → Active numbers, open your number, then the **Configure** tab. Set **A call comes in** to **Webhook**, `https://<your-ngrok-domain>/incoming-call`, **HTTP POST**, then click **Save configuration**.
7. **Call your Twilio number.**

### Running everything in Docker

Instead of steps 4 and 5, the server and the tunnel can run in containers too:

```bash
docker compose up --build                     # database + server + admin site (http://localhost:3001)
docker compose --profile tunnel up --build    # database + server + ngrok (needs NGROK_AUTHTOKEN in .env)
```

Run the seed inside Docker with `docker compose exec app npm run db:seed`. Code changes need `--build` again, so `npm run dev` is quicker while developing.

### Businesses

The easiest way to add and edit businesses is the admin site, part of the React app in `web/`. It needs the API running too, so use two terminals:
```bash
npm run api:dev                 # API on :3001 (restarts on code changes)
cd web && npm run dev           # admin site on http://localhost:5173/admin
```
(The first time, run `npm install` in `web/`.) In Docker, `docker compose up --build` serves the built site at http://localhost:3001/admin instead.

The site lists every business and edits all of its settings, including its owner (see below). **Preview** shows the greeting and Claude's instructions for what's in the form, before saving. It only accepts connections from this computer, and the ngrok tunnel doesn't expose it. Set `ADMIN_PASSWORD` in `.env` to also require a password.

Each row in the `businesses` table is one business. See `db/migrations/001_create_businesses.sql` for every column. The main ones:

| Column | What it does |
|---|---|
| `twilio_number` | The number callers dial (E.164, e.g. `+18005550100`). Empty means no calls reach it |
| `languages` | e.g. `{en,es}`. The first is the main language, used for the greeting |
| `features` | `messages` (take messages) and/or `transfers` (transfer to `transfer_number`) |
| `notify_sms`, `notify_whatsapp` | Where messages are sent |
| `urgent_when` | When a message is marked urgent |
| `active` | `false` stops calls reaching it |

| `owner_id` | The owner who manages it in the owner app |

To look at or change businesses directly:
```bash
docker compose exec db psql -U receptionist -c "SELECT name, twilio_number, languages, features FROM businesses"
```
Changes apply from the next call. No restart is needed.

### Owner app

Business owners sign in at http://localhost:5173 (Docker: http://localhost:3001) with Google; signing in for the first time creates their account. New owners go through a five-step setup (their business, languages, what the receptionist does, common questions, and a review with the greeting callers will hear), which creates their business. **Edit settings** on the dashboard reopens it to change anything. Owners can't set the Twilio number, whether the business is active, its slug or who owns it; the slug is made from the business name. Taking messages needs an SMS or WhatsApp number to send them to. After setup, owners choose a plan (see Billing below). Call history comes next.

**Call history** (`/calls`): every call the receptionist answers is kept in the `calls` table with its caller, length, minutes, whether it was transferred, and the message taken, if any. Owners see them grouped by day on the Calls page (a message opens to show who to call back, with a tap-to-call link) and the latest 5 on the dashboard. The page loads 50 at a time and refreshes every minute.

**Menus and price lists from photos** (`src/api/menu-import.js`): on the setup's "Common questions" step, owners can add up to 5 photos of a menu or price list instead of typing it. The browser shrinks each photo to a JPEG of a few hundred KB; the API records the upload and has Claude (`claude-opus-5-5`, structured output) transcribe the sections, items, descriptions and prices exactly as printed, in the background. Each item becomes one line, like `Menu (Pizzas): Margherita, tomato, mozzarella, basil, $14.`, added to the common questions for the owner to check before saving. Photos aren't stored, and text in them is treated as content, never instructions. One upload is read at a time per owner, at most 20 a day; a photo costs about a cent or two to read. It uses the same `ANTHROPIC_API_KEY` as the phone server.

A new owner's business has no Twilio number until its plan is paid for; then one is bought automatically (see Phone numbers below), or you add one in the admin site. You can also link an existing business to an owner: the owner signs in once, then you enter their Google email in the business's **Owner's email** field.

**Setting up Google sign-in** (once):
1. In [Google Cloud Console](https://console.cloud.google.com), create a project (or pick one), then go to **APIs & Services → OAuth consent screen** and set it up: app name, support email, and **External** users. While the app is in **Testing**, only the test users you add there can sign in.
2. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
3. Under **Authorized redirect URIs**, add `http://localhost:5173/api/auth/callback/google`, and `http://localhost:3001/api/auth/callback/google` for Docker.
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, and restart the API.

When the app goes online, add its real address as another redirect URI and set `BETTER_AUTH_URL` to it.

Owners stay signed in for 7 days. Signing in is protected by Better Auth's rate limits, and sign-ins can only return to this app, never to another site.

### Billing

Owners pay with Stripe. Businesses they set up themselves only answer calls while their plan is paid for (`active`, `trialing`, or `past_due` while Stripe retries a failed payment). Businesses added in the admin site, like the demo businesses, don't need a plan.

- **Plans** (`src/shared/plans.js`): Starter $79 (200 minutes), Pro $179 (600) and Business $349 (1,500) a month.
- **Choosing a plan** (`/plan`): owners pay on Stripe's own Checkout page, so card details never reach this app, and come back to the dashboard.
- **Manage billing** on the dashboard opens Stripe's billing page: switch plans, update the card, see invoices, or cancel at the end of the month. An upgrade is charged straight away for the rest of the month; a downgrade starts when the month already paid for ends.
- Stripe tells the API about every change (payments, failed payments, plan changes, cancellations) with webhooks to `/api/stripe/webhook`, and each business keeps a copy of its subscription in the `businesses` table. Webhooks are required: without them, renewals, failures and cancellations are never seen.

**Minutes** (`src/shared/usage.js`): every answered call is recorded in the `calls` table when it ends, rounded up to whole minutes like Twilio bills them. Each billing month (as Stripe reports it) starts from zero. Owners see "123 of 600 minutes used" on the dashboard, with a warning at 80%.
- **Extra minutes**: the slider on the plan page buys 50–2,000 minutes at $0.45 each (more per minute than any plan, so upgrading is the better deal for steady use), as a one-time payment on Stripe Checkout. They don't expire, and are only used once a month's plan minutes run out (kept in the `extra_minutes` table).
- **Plan changes**: an upgrade's minutes apply straight away (Stripe charges the difference for the rest of the month); after a downgrade the current plan and its minutes last until the month ends.
- **Out of minutes**: a call in progress is never cut off. New calls go straight to the business's transfer number if transfers are on; otherwise callers hear "Sorry, we can't take your call right now. Please call back later."
- Businesses that don't need a plan (the demo businesses) have no limit.

**Phone numbers** (`src/api/phone-numbers.js`): once a business's plan is paid for and it has no number, the API buys it a local Twilio number (with voice and SMS) in the area code of its own business phone, or anywhere in the US if that area has none, and points the number's voice webhook at `PUBLIC_URL/incoming-call`. At most one number is bought per business, however many payment events arrive; a failed purchase (no numbers, not enough credit) is recorded and tried again on the next event. The admin site shows each business's latest order under its Twilio number. `TWILIO_BUY_NUMBERS` sets what happens:
- `dry-run` (the default): records what would be bought, without calling Twilio. The business keeps waiting for a number.
- `live`: buys it, from your Twilio balance (about $1.15 a month per US local number). Texts from US numbers also need [A2P 10DLC registration](https://console.twilio.com/us1/develop/sms/regulatory-compliance). A trial account can only have one number.
- `off`: numbers are only added in the admin site.

**Releasing numbers**: when a plan ends (Stripe's `canceled`), the business keeps its number for 7 days, in case the owner comes back, and the dashboard says until when. Then the API gives it back to Twilio, so it stops costing money: it checks on startup and every hour. Only numbers the app bought are released, never ones added in the admin site (like Sunrise Dental's). In `dry-run` the release is only logged; a failed release is recorded and tried again an hour later. An owner who subscribes again after that gets a new number.

**Setting up Stripe** (once, in test mode):
1. In the [Stripe Dashboard](https://dashboard.stripe.com), switch to test mode (or a sandbox), open **Developers → API keys** and put the secret key (`sk_test_...`) in `STRIPE_SECRET_KEY` in `.env`.
2. Run `npm run stripe:setup`. It creates a product and monthly price for each plan, the extra-minutes price, and the billing page settings. It's safe to run again, and only runs with a test key.
3. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) (`brew install stripe/stripe-cli/stripe`), run `stripe login`, and put the output of `stripe listen --print-secret` in `STRIPE_WEBHOOK_SECRET` in `.env`. Restart the API.

**While testing payments**, keep the CLI forwarding webhooks to the API (use port 5173 instead of 3001 with the dev servers):

```bash
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,invoice.paid,invoice.payment_failed --forward-to localhost:3001/api/stripe/webhook
```

Pay with the card `4242 4242 4242 4242`, any future date and any CVC; nothing is charged in test mode.

**Before taking real payments**: use a [restricted key](https://docs.stripe.com/keys.md#manage-your-api-keys) with only the permissions billing needs instead of the secret key, add a webhook endpoint for the real address in the Stripe Dashboard (with its own signing secret), turn on [Stripe Tax](https://docs.stripe.com/billing/taxes/collect-taxes.md) if you need to collect sales tax (it needs an active tax registration), and handle disputes and refunds.

## Tests

```bash
docker compose up -d db     # the tests need Postgres
npm test                    # backend: checks, saving businesses, the API routes
cd web
npm test                    # web: form checks (Vitest)
npm run test:e2e            # browser tests in Chrome (Playwright): owner app, setup wizard, admin site
```

Tests never use your data or accounts. They use their own database, `receptionist_test`, which is created on the first run and emptied before each test, and made-up keys instead of `.env` (`test/support/env.js`). Signed-in owners are created with Better Auth's test plugin, so nothing goes to Google.

The browser tests start their own API (port 3101) and web app (port 5199), so they can run while the dev servers or Docker are up. They use the Google Chrome installed on this computer. `npx playwright test --ui` shows them step by step, and a failed test saves a trace to open with `npx playwright show-trace`.

## Configuration (`.env`)

| Variable | Required | Description |
|---|---|---|
| `PUBLIC_URL` | yes | Public https URL Twilio uses to reach the server (your ngrok URL) |
| `DATABASE_URL` | yes | Postgres connection. The default in `.env.example` matches `docker-compose.yml` |
| `TWILIO_ACCOUNT_SID` | yes | Needed to transfer calls and hang up |
| `TWILIO_AUTH_TOKEN` | recommended | Checks that webhook requests really come from Twilio |
| `ANTHROPIC_API_KEY` | yes | Claude API key. The API is billed separately from Claude.ai subscriptions |
| `DEEPGRAM_API_KEY` | yes | Speech-to-text |
| `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID` | yes | Text-to-speech key, and a voice ID from the Cartesia voice library |
| `CARTESIA_VOICE_ID_ES` | no | A different voice for Spanish replies. Without it the same voice speaks both languages |
| `DEEPGRAM_LANGUAGE` | no | `multi` (default) hears English and Spanish; `en` for English only |
| `TRANSFER_NUMBER` | no | Seed only: the demo business's transfer number. Leave empty to disable transfers |
| `OWNER_SMS_NUMBER` | no | Seed only: the demo business owner's mobile; each message is texted here. Texts to US numbers need [A2P 10DLC registration](https://console.twilio.com/us1/develop/sms/regulatory-compliance), otherwise they fail with error 30034 |
| `OWNER_WHATSAPP_NUMBER` | no | Seed only: the demo business owner's WhatsApp number; each message is also sent here |
| `NGROK_AUTHTOKEN` | no | Only for running ngrok in Docker (`--profile tunnel`) |
| `API_PORT` | no | API port when running outside Docker. Defaults to `3001` |
| `WEB_PORT` | no | Admin site port in Docker. Defaults to `3001` |
| `ADMIN_PASSWORD` | no | Password for the admin site. Without it, anyone on this computer can open it |
| `BETTER_AUTH_URL` | yes | The address owners open the web app on (`http://localhost:5173` in development; Docker sets its own) |
| `BETTER_AUTH_SECRET` | yes | Signs owners' session cookies. Make one with `openssl rand -base64 32`. Changing it signs everyone out |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for sign-in | Google sign-in keys (see Owner app above). Without them nobody can sign in |
| `TWILIO_BUY_NUMBERS` | no | `dry-run` (default), `live` or `off`: whether paying businesses get a Twilio number bought for them (see Phone numbers above) |
| `STRIPE_SECRET_KEY` | for billing | Stripe API key (see Billing above). Without it, owners can't choose a plan |
| `STRIPE_WEBHOOK_SECRET` | for billing | Checks that webhooks come from Stripe: from `stripe listen --print-secret` locally, or the endpoint's signing secret in the Stripe Dashboard |
| `TWILIO_WHATSAPP_FROM` | no | Your Twilio WhatsApp sender. Defaults to the Twilio Sandbox number (`+14155238886`), which the owner must join first and message every 24 hours |
| `ECHO` | no | `true` plays the caller's own voice back, to test the audio stream without the AI services |
| `RECORD_CALLS` | no | `true` has Twilio record calls, for checking audio quality. Recordings are billed by Twilio |
| `DEEPGRAM_PROJECT_ID` | no | Deepgram project used to look up each call's cost. Found from the API key if not set |
| `DEEPGRAM_PRICE_PER_MIN` | no | Price of Deepgram's billed minutes in the cost summary. Defaults to `0.0077` (Nova-3 pay as you go) |
| `CLAUDE_MODEL`, `DEEPGRAM_MODEL`, `CARTESIA_MODEL` | no | Override the default models (`claude-sonnet-5-5`, `nova-3`, `sonic-latest`) |
| `PORT` | no | Defaults to `3000` |

## Troubleshooting

- **Server exits with "Could not set up the database":** Postgres isn't running. Start it with `docker compose up -d db`.
- **Caller hears "Sorry, this number is not in service":** no active business has that number as `twilio_number`. Check the `businesses` table, or run `npm run db:seed`.
- **Changed `OWNER_*` or `TRANSFER_NUMBER` in `.env` but nothing changed:** those are only read by the seed. Run `npm run db:seed` again.
- **Call fails immediately and the caller hears "not available":** on a Twilio trial account, only verified numbers can call in (error 21264). Add your number under Phone Numbers → Manage → Verified Caller IDs, or upgrade the account.
- **"An application error has occurred":** the webhook isn't reachable or rejected the request. Check the ngrok inspector at http://localhost:4040 and the server log. If the log says `invalid Twilio signature`, `PUBLIC_URL` or `TWILIO_AUTH_TOKEN` doesn't match.
- **The receptionist apologizes and says it's having trouble:** usually a Claude API error, such as no credit balance. The server log shows the exact error.
- **To find the exact error for any call:** Twilio Console → Monitor → Logs → Calls (or Errors).

## Known issues

- Messages are kept in memory until the call ends. If the server stops or restarts during a call (including `npm run dev` restarting after a file is edited), that call's message is lost.
- The voice can sound choppy at the start of a call. Cartesia streams audio much faster than real time, so the likely cause is the network path at the start of the call (laptop → ngrok → Twilio) or the greeting being sent while connections are still opening.
- Appointments aren't booked directly yet. They're saved as messages for staff to follow up on.
