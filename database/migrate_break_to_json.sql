-- Migrate business_profile.break (INT) to per-barber JSONB map break_by_user
-- Run this in the Supabase SQL editor for your project

-- 1) Add JSONB column for per-user break minutes
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS break_by_user JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN business_profile.break_by_user IS 'Map of { "<user_id>": <break_minutes:int> } for each admin/barber in the business';

-- 1.1) Ensure legacy break column exists for data backfill (some databases may not have it)
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS break INT DEFAULT 0 CHECK (break >= 0 AND break <= 180);

-- 2) Initialize JSON map for each business based on existing break value
--    We use all admin users of the same business (users.business_id = business_profile.id)
UPDATE business_profile bp
SET break_by_user = COALESCE(
  (
    SELECT jsonb_object_agg(u.id::text, COALESCE(bp.break, 0))
    FROM users u
    WHERE u.user_type = 'admin'
      AND u.business_id = bp.id
  ),
  '{}'::jsonb
)
WHERE (bp.break_by_user IS NULL OR bp.break_by_user = '{}'::jsonb);

-- 3) Keep legacy column for backward compatibility but ensure non-null default
ALTER TABLE business_profile
  ALTER COLUMN break SET DEFAULT 0;

-- 4) Optional: GIN index for faster key existence queries on break_by_user
CREATE INDEX IF NOT EXISTS idx_business_profile_break_by_user_gin
  ON business_profile USING GIN (break_by_user);

-- 5) Optional helper view to inspect per-user break minutes
CREATE OR REPLACE VIEW v_business_profile_breaks AS
SELECT 
  bp.id              AS business_id,
  u.id               AS user_id,
  u.name             AS user_name,
  COALESCE((bp.break_by_user ->> u.id::text)::int, bp.break, 0) AS break_minutes
FROM business_profile bp
LEFT JOIN users u ON u.business_id = bp.id AND u.user_type = 'admin';


