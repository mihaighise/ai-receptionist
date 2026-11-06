-- Business types and skills.
--
-- The kind of business (src/shared/business-types.js), picked in the first step of the setup. It
-- sets the defaults and examples the owner starts from; it doesn't change what Claude is told.
ALTER TABLE businesses ADD COLUMN business_type text NOT NULL DEFAULT 'other';

-- features holds the ids of the business's skills (src/skills). The skills list there is now the
-- one place that says which exist, and the API only saves known ids, so adding a skill no longer
-- needs a change to the database.
ALTER TABLE businesses DROP CONSTRAINT businesses_features_check;

-- The demo businesses (src/shared/db/seed.js).
UPDATE businesses SET business_type = 'clinic' WHERE slug = 'sunrise-dental';
UPDATE businesses SET business_type = 'home_services' WHERE slug IN ('rapid-flow-plumbing', 'northside-heating-air');
UPDATE businesses SET business_type = 'salon' WHERE slug = 'bella-hair-studio';
