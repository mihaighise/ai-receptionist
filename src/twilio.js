import twilio from 'twilio';

let client;

// Twilio REST client, shared by everything that acts on a live call or sends texts.
// Use nullish coalescing, if client is null or undefined set it, otherwise leave it
export const getTwilioClient = () =>
  (client ??= twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN));
