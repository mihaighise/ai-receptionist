# Phase 0: Business decisions

Working decisions for the first version of the product. The numbers are estimates close to reality, to be replaced with real data once the first customers are on it.

## 1. First type of customer: home-service trades

**Plumbers, HVAC and electricians** in the US, starting with owner-operated shops of 1–10 people.

Why them first:

- **Missed calls cost them real money.** The owner is usually on a job, under a sink or on a roof, and can't answer. A missed call goes to the next plumber on Google, and one job is often worth $200–$2,000.
- **They need what the receptionist already does.** Taking a message with name, number and problem, flagging urgent calls (a burst pipe, no heat, a gas smell) and transferring to the owner all work today. They don't need calendar booking on day one.
- **English and Spanish help.** Many customers, and many crews, speak Spanish.
- **No HIPAA.** Unlike dental and medical clinics, no patient health data is involved.

Next in line: **salons and barbers** (once calendar booking exists in Phase 5), then **auto repair shops**. Dental and medical clinics come later, once the HIPAA agreements are in place.

## 2. Name: Bivoz

**Bivoz LLC**: "bi" (two languages) + "voz" (voice in Spanish). Short, easy to say on a call and to spell.

| Check | Result (2026-11-05) |
|---|---|
| `bivoz.ai` | ✅ Not registered |
| `getbivoz.com` | ✅ Not registered |
| `bivoz.co` | ✅ Not registered |
| `bivoz.com` | ❌ Taken (use `getbivoz.com` until it can be bought) |
| LLC name in your state | ⬜ To check on your state's business entity search |
| US trademark | ⬜ To check on the USPTO trademark search (tmsearch.uspto.gov), classes 9 and 42 (software) |

Domain availability was checked with `whois` and can change at any time. Register the domains as soon as the name is final.

Backup name: **Vocalis Labs** (`vocalislabs.ai` was also free).

## 3. Pricing

### What one minute of a call costs us

| Service | Est. cost per call minute | Source |
|---|---|---|
| Twilio, incoming call on a local number | $0.0085 | Twilio US price |
| Twilio, media stream to our server | ~$0.004 | Twilio US price, to confirm |
| Deepgram, speech-to-text (Nova-3) | $0.0077 | Rate used in `src/costs.js` |
| Claude Sonnet 5.5 | ~$0.010 | About 5 turns a minute, mostly from the cache, at the prices in `src/costs.js` |
| Cartesia, text-to-speech | ~$0.012 | About 300 characters spoken per call minute on a mid-tier plan |
| **Total** | **≈ $0.042 / minute** | |

Fixed costs per customer each month: phone number ~$1.15 and SMS registration ~$2 later on. Stripe takes 2.9% + $0.30 of each payment.

To get real numbers, compare these against the cost summary the server prints after each test call, and update this table.

### Plans

A typical shop gets 100–300 calls a month at about 2.5 minutes each, so 250–750 minutes.

| Plan | Price / month | Minutes included | Cost to us at full use | Margin at full use |
|---|---|---|---|---|
| **Starter** | $79 | 200 | ~$12 | ~82% |
| **Pro** | $179 | 600 | ~$29 | ~82% |
| **Business** | $349 | 1,500 | ~$67 | ~78% |
| Extra minutes | $0.45 / minute | | ~$0.042 | ~88% |

Margins include the phone number and Stripe fees. Most customers won't use every included minute, so real margins will be higher.

Extra minutes cost more per minute than any plan (Starter works out at $0.395), so they cover the odd busy month while upgrading stays the better deal for steady use. At $0.20 they were cheaper than the plans: Starter plus 400 extra minutes would have cost less than Pro.

- **What every plan includes:** English and Spanish, message taking, urgent flags, transfers, and alerts by SMS, WhatsApp and email.
- **Pro and above:** calendar booking (Phase 5), and more languages (Phase 6).
- **Free trial:** 14 days or 50 minutes, whichever comes first, with a card required at signup.
- **Annual billing:** 2 months free.

For comparison, a human answering service usually charges $1–$2.50 per minute, and a part-time receptionist costs over $1,500 a month.
