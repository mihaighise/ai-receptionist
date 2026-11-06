-- Booking appointments into the owner's calendar (src/skills/bookings.js and
-- src/integrations/calendars).

-- The calendar an owner connected. One per owner: their business books into it. The refresh token
-- (Google's long-lived key to the calendar) is encrypted (src/shared/secrets.js); access tokens
-- are short-lived and only kept in memory.
CREATE TABLE calendar_connections (
  user_id        text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  -- Which integration it is: 'google' (others plug in later).
  provider       text NOT NULL,
  account_email  text,
  -- The calendar bookings go into; 'primary' is the account's main calendar.
  calendar_id    text NOT NULL DEFAULT 'primary',
  refresh_token  text NOT NULL,
  connected_at   timestamptz NOT NULL DEFAULT now()
);

-- The bookings skill's settings: { services: [{ name, minutes }], hours: { mon: [{ from, to }], ... },
-- timeZone, bufferMinutes, noticeHours, horizonDays }.
ALTER TABLE businesses ADD COLUMN booking_settings jsonb NOT NULL DEFAULT '{}';

-- Appointments the receptionist booked, for the call history.
CREATE TABLE bookings (
  id              bigserial PRIMARY KEY,
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  call_sid        text,
  service         text NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  caller_name     text NOT NULL,
  caller_number   text,
  notes           text NOT NULL DEFAULT '',
  -- The event in the calendar.
  provider        text NOT NULL,
  event_id        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_business_idx ON bookings (business_id, starts_at);
CREATE INDEX bookings_call_idx ON bookings (call_sid);
