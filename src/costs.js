// Prints what one call cost once it has ended, per service.
//   Claude:   exact token counts from the API, priced at the model's list prices. Anthropic has
//             no API that gives the cost of a single request, but these are the numbers it bills from.
//   Deepgram: the billed audio duration, fetched from Deepgram's API by the stream's request ID,
//             times the price per minute. (Deepgram's API doesn't return a dollar amount for
//             streaming requests; if it ever does, that's used instead.)
//   Twilio:   the actual price, fetched from Twilio's API by the call SID.
// Deepgram and Twilio take a little while to work out the cost, so the summary is printed
// once both are available (or after about 2 minutes).

import { getTwilioClient } from './twilio.js';

// US dollars per million tokens. Top-level cache_control uses the 5-minute cache, written at 1.25x input.
const CLAUDE_PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
};
// Nova-3 streaming, pay as you go. Override in .env if your plan differs.
const DEEPGRAM_PER_MIN = Number(process.env.DEEPGRAM_PRICE_PER_MIN ?? 0.0077);

const POLL_MS = 15_000;
const POLL_TRIES = 8; // give up after about 2 minutes

const usd = (n) => `$${n.toFixed(4)}`;

// Calls fetchOnce every POLL_MS until it returns something other than null (the cost isn't ready yet).
async function poll(fetchOnce) {
  for (let attempt = 0; attempt < POLL_TRIES; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const result = await fetchOnce();
    if (result !== null) return result;
  }
  return null;
}

// Collects usage during a call. mediaStream.js creates one per call and calls report() when it ends.
export class CallCosts {
  claude = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, model: null };
  audioSeconds = 0; // caller audio sent to Deepgram, for the fallback estimate
  deepgramRequestId = null;

  // Add one Claude response's usage (the API's `usage` object).
  addClaude(model, usage) {
    if (!usage) return;
    this.claude.model = model;
    this.claude.input += usage.input_tokens ?? 0;
    this.claude.output += usage.output_tokens ?? 0;
    this.claude.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    this.claude.cacheRead += usage.cache_read_input_tokens ?? 0;
  }

  async report(callSid) {
    const lines = [];
    let total = 0;

    const c = this.claude;
    const prices = CLAUDE_PRICES[c.model];
    const tokens = `${c.input} in, ${c.cacheWrite} cache write, ${c.cacheRead} cache read, ${c.output} out`;
    if (prices) {
      const cost = (c.input * prices.input + c.output * prices.output + c.cacheWrite * prices.cacheWrite + c.cacheRead * prices.cacheRead) / 1e6;
      total += cost;
      lines.push(`Claude    ${usd(cost)}  (${tokens} tokens)`);
    } else {
      lines.push(`Claude    ?         (${tokens} tokens; no prices for ${c.model ?? 'unknown model'})`);
    }

    // Both lookups wait for the service to finish billing, so run them at the same time.
    const [deepgram, twilio] = await Promise.all([
      fetchDeepgramCost(this.deepgramRequestId),
      fetchTwilioCost(callSid),
    ]);

    if (deepgram) {
      const cost = deepgram.usd ?? (deepgram.seconds / 60) * DEEPGRAM_PER_MIN;
      total += cost;
      lines.push(`Deepgram  ${usd(cost)}  (${(deepgram.seconds / 60).toFixed(2)} min billed, from Deepgram's API)`);
    } else {
      // Deepgram's API couldn't be reached: count the audio we streamed instead.
      const cost = (this.audioSeconds / 60) * DEEPGRAM_PER_MIN;
      total += cost;
      lines.push(`Deepgram  ${usd(cost)}  (estimate: ${(this.audioSeconds / 60).toFixed(2)} min of audio streamed)`);
    }

    if (twilio) {
      total += twilio.cost;
      lines.push(`Twilio    ${usd(twilio.cost)}  (${twilio.detail})`);
    } else {
      lines.push('Twilio    ?         (price not available yet; see Twilio console > Monitor > Logs > Calls)');
    }

    console.log(`Cost of call ${callSid}:\n  ${lines.join('\n  ')}\n  Total     ${usd(total)}`);
  }
}

// Deepgram API: every request belongs to a project. DEEPGRAM_PROJECT_ID can be set in .env;
// otherwise the first project the API key has access to is used.
const deepgramApi = (path) =>
  fetch(`https://api.deepgram.com/v1${path}`, {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });

let projectId = process.env.DEEPGRAM_PROJECT_ID;
async function deepgramProjectId() {
  if (projectId) return projectId;
  const res = await deepgramApi('/projects');
  if (!res.ok) throw new Error(`listing projects failed (${res.status})`);
  projectId = (await res.json()).projects?.[0]?.project_id;
  return projectId;
}

// What Deepgram recorded for one streaming request: { seconds, usd } (usd may be undefined),
// or null if it isn't available. The request only shows up a little while after the stream has closed.
async function fetchDeepgramCost(requestId) {
  if (!requestId) return null;
  try {
    const project = await deepgramProjectId();
    if (!project) return null;
    return await poll(async () => {
      const res = await deepgramApi(`/projects/${project}/requests/${requestId}`);
      if (res.status === 404) return null; // not recorded yet
      if (!res.ok) throw new Error(`request lookup failed (${res.status})`);
      const body = await res.json();
      const details = (body.request ?? body).response?.details;
      if (typeof details?.duration !== 'number') return null; // still being processed
      return { seconds: details.duration, usd: typeof details.usd === 'number' ? details.usd : undefined };
    });
  } catch (err) {
    // A 403 usually means the API key isn't allowed to read usage; create one with usage access.
    console.error('Could not fetch the Deepgram cost:', err.message);
    return null;
  }
}

// What Twilio charged for the call: the call itself, any transferred leg (a child call) and recordings.
// Twilio reports prices as negative strings like "-0.0085", and leaves them null until they're ready.
async function fetchTwilioCost(callSid) {
  if (!callSid || !process.env.TWILIO_ACCOUNT_SID) return null;
  const client = getTwilioClient();
  try {
    return await poll(async () => {
      const [call, children, recordings] = await Promise.all([
        client.calls(callSid).fetch(),
        client.calls.list({ parentCallSid: callSid }),
        client.recordings.list({ callSid }),
      ]);
      const items = [call, ...children, ...recordings];
      if (items.some((item) => item.price == null)) return null; // not ready yet
      const cost = items.reduce((sum, item) => sum + Math.abs(Number(item.price)), 0);
      const parts = [`call ${call.duration}s`];
      if (children.length) parts.push(`${children.length} transfer leg(s)`);
      if (recordings.length) parts.push(`${recordings.length} recording(s)`);
      return { cost, detail: parts.join(', ') };
    });
  } catch (err) {
    console.error('Could not fetch the Twilio price:', err.message);
    return null;
  }
}
