// Fills the database with demo businesses for development (npm run db:seed). Safe to run again:
// each business is matched by its slug and overwritten with the values below.
//
// Sunrise Dental owns the real Twilio number and is set up exactly like the receptionist was
// before businesses moved to the database. Its owner alert and transfer numbers come from .env
// (OWNER_SMS_NUMBER, OWNER_WHATSAPP_NUMBER, TRANSFER_NUMBER), so they stay out of git.
// The other businesses are the kind of customer we're starting with (docs/phase-0-decisions.md).
// They have no Twilio number yet, so no calls reach them.

import { migrate } from './migrate.js';
import { pool } from './pool.js';

const env = (name) => process.env[name] || null;

const BUSINESSES = [
  {
    slug: 'sunrise-dental',
    name: 'Sunrise Dental',
    description: 'a family dental clinic offering checkups, cleanings, fillings, whitening and emergency appointments',
    address: '123 Main Street, Springfield',
    hours: 'Monday to Friday 8am to 6pm, Saturday 9am to 1pm, closed Sunday',
    phone: '+1 555 010 0000',
    faq: [
      'New patients are welcome; the first visit includes an exam and X-rays.',
      'Most major dental insurance plans are accepted.',
      'For a dental emergency outside opening hours, callers should leave a message and the on-call dentist will call back.',
    ],
    twilio_number: '+18312490526',
    languages: ['en', 'es'],
    features: ['messages', 'transfers'],
    transfer_number: env('TRANSFER_NUMBER'),
    notify_sms: env('OWNER_SMS_NUMBER'),
    notify_whatsapp: env('OWNER_WHATSAPP_NUMBER'),
    urgent_when: 'the caller is in severe pain, has swelling, bleeding or a knocked-out tooth',
  },
  {
    slug: 'rapid-flow-plumbing',
    name: 'Rapid Flow Plumbing',
    description: 'a family-owned plumbing company fixing leaks, clogged drains, water heaters and burst pipes',
    address: '48 Oak Avenue, Springfield',
    hours: 'Monday to Saturday 7am to 7pm, with emergency service 24 hours a day',
    phone: '+1 555 010 0101',
    faq: [
      'The service area is Springfield and towns within 25 miles.',
      'A standard service call is 89 dollars, which is waived if the customer goes ahead with the repair.',
      'Free estimates are given for water heater replacements and repiping.',
      'All work comes with a one-year labor warranty.',
    ],
    twilio_number: null,
    languages: ['en', 'es'],
    features: ['messages'],
    transfer_number: null,
    notify_sms: null,
    notify_whatsapp: null,
    urgent_when: 'there is a burst pipe, flooding, a sewage backup or no water at all',
  },
  {
    slug: 'northside-heating-air',
    name: 'Northside Heating & Air',
    description: 'a heating and air conditioning company that installs, repairs and services furnaces, AC units and heat pumps',
    address: '910 Industrial Parkway, Springfield',
    hours: 'Monday to Friday 7:30am to 5:30pm, Saturday 8am to noon',
    phone: '+1 555 010 0202',
    faq: [
      'A diagnostic visit is 99 dollars.',
      'Maintenance plans cost 15 dollars a month and include two tune-ups a year.',
      'Financing is available for new system installations.',
      'If a caller smells gas, they should leave the building right away and call the gas company before anything else.',
    ],
    twilio_number: null,
    languages: ['en'],
    features: ['messages'],
    transfer_number: null,
    notify_sms: null,
    notify_whatsapp: null,
    urgent_when: 'the caller has no heat in freezing weather, no cooling in extreme heat, or smells gas',
  },
  {
    slug: 'bella-hair-studio',
    name: 'Bella Hair Studio',
    description: 'a hair salon offering cuts, color, highlights, blowouts and bridal styling',
    address: '22 Elm Street, Springfield',
    hours: 'Tuesday to Saturday 9am to 7pm, closed Sunday and Monday',
    phone: '+1 555 010 0303',
    faq: [
      "Women's cuts start at 55 dollars and men's cuts at 30 dollars.",
      'Color appointments take two to three hours.',
      'Walk-ins are welcome when a stylist is free, but appointments are recommended.',
      'Cancellations need at least 24 hours notice.',
    ],
    twilio_number: null,
    languages: ['en'],
    features: ['messages'],
    transfer_number: null,
    notify_sms: null,
    notify_whatsapp: null,
    urgent_when: '',
  },
];

// Insert each business, or overwrite it if one with the same slug already exists.
async function seed() {
  const columns = Object.keys(BUSINESSES[0]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const updates = columns.filter((c) => c !== 'slug').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const sql = `INSERT INTO businesses (${columns.join(', ')}) VALUES (${placeholders})
               ON CONFLICT (slug) DO UPDATE SET ${updates}`;
  for (const business of BUSINESSES) {
    await pool.query(sql, columns.map((c) => business[c]));
    console.log(`Seeded ${business.name}${business.twilio_number ? ` (${business.twilio_number})` : ''}`);
  }
}

try {
  await migrate();
  await seed();
} finally {
  await pool.end();
}
