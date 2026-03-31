-- Allow per-user booking window of 0 days (same-day-only / closed horizon in UI).
-- Previous CHECK raised: booking_open_days must be between 1 and 60
--
-- Legacy overload (p_user_id text) duplicates the uuid signature for PostgREST → PGRST203.

DROP FUNCTION IF EXISTS public.set_booking_open_days_for_user(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.set_booking_open_days_for_user(
  p_business_id uuid,
  p_user_id uuid,
  p_days integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_days IS NULL OR p_days < 0 OR p_days > 60 THEN
    RAISE EXCEPTION 'booking_open_days must be between 0 and 60';
  END IF;

  UPDATE public.business_profile
  SET booking_open_days_by_user =
    COALESCE(booking_open_days_by_user, '{}'::jsonb)
      || jsonb_build_object(
        p_user_id::text,
        GREATEST(0, LEAST(60, p_days))
      )
  WHERE id = p_business_id;
END;
$fn$;
