-- Menus and price lists read from photos (src/api/menu-import.js). One row per upload: Claude reads
-- the photos in the background and the owner app polls for the lines it writes, which the owner
-- checks and adds to the business's common questions. The photos themselves are never stored.

CREATE TABLE menu_imports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The owner who uploaded them (their business may not exist yet, during setup).
  user_id     text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  -- reading -> done, or failed (see error).
  status      text NOT NULL CHECK (status IN ('reading', 'done', 'failed')),
  photos      integer NOT NULL CHECK (photos > 0),
  -- One line per dish or note, in the same form as the common questions.
  lines       text[] NOT NULL DEFAULT '{}',
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX menu_imports_user_idx ON menu_imports (user_id, created_at);
