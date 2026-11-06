-- One row per business that uses the receptionist. Each call is matched to a business by the
-- Twilio number that was dialed (twilio_number).

CREATE TABLE businesses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short, stable name for the business, e.g. 'sunrise-dental'.
  slug            text NOT NULL UNIQUE,

  -- What the receptionist knows. Claude only knows what's written here, so the more questions
  -- the FAQ covers, the more it can answer without taking a message.
  name            text NOT NULL,
  -- Finishes the sentence "You are the phone receptionist for <name>, <description>."
  description     text NOT NULL,
  address         text NOT NULL DEFAULT '',
  hours           text NOT NULL DEFAULT '',
  -- The business's own public phone number (not the Twilio number).
  phone           text NOT NULL DEFAULT '',
  -- Facts the receptionist can answer from, written as plain sentences.
  faq             text[] NOT NULL DEFAULT '{}',

  -- The Twilio number callers dial, in E.164 format (+18005550100). Empty until one is assigned;
  -- a business without one gets no calls.
  twilio_number   text UNIQUE CHECK (twilio_number ~ '^\+[1-9][0-9]{6,14}$'),

  -- Languages the receptionist speaks for this business, main language first: the greeting is
  -- spoken in it. Must be languages listed in src/shared/languages.js.
  languages       text[] NOT NULL DEFAULT '{en}'
                  CHECK (cardinality(languages) > 0 AND languages <@ ARRAY['en', 'es']),

  -- What the receptionist can do for this business:
  --   messages   take messages for the staff (sent to notify_sms / notify_whatsapp)
  --   transfers  transfer callers to transfer_number when they ask for a person
  features        text[] NOT NULL DEFAULT '{messages}'
                  CHECK (features <@ ARRAY['messages', 'transfers']),
  transfer_number text,
  -- Where each message is sent. Empty turns that channel off.
  notify_sms      text,
  notify_whatsapp text,
  -- When a message should be marked urgent, finishing "Mark it urgent if ...".
  urgent_when     text NOT NULL DEFAULT '',

  -- Inactive businesses (e.g. cancelled subscriptions) get no calls.
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
