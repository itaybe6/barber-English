-- Client appointment reminders: one value per business (all barbers, all clients).
-- Replaces per-barber JSON map client_reminder_minutes_by_user.

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS client_reminder_minutes integer;

COMMENT ON COLUMN public.business_profile.client_reminder_minutes IS
  'Minutes before appointment to notify clients (entire business). NULL = off.';

-- Migrate: minimum positive lead among barbers (avoid a single global value that reminds earlier than every barber had configured).
UPDATE public.business_profile bp
SET client_reminder_minutes = sub.m
FROM (
  SELECT
    p.id,
    (
      SELECT MIN(
        LEAST(1440, GREATEST(1, floor(abs((e.value)::text::numeric))::int))
      )
      FROM jsonb_each(p.client_reminder_minutes_by_user) AS e
      WHERE jsonb_typeof(e.value) = 'number'
        AND (e.value)::text::numeric > 0
    ) AS m
  FROM public.business_profile p
) sub
WHERE bp.id = sub.id
  AND sub.m IS NOT NULL;

ALTER TABLE public.business_profile
  DROP COLUMN IF EXISTS client_reminder_minutes_by_user;
