-- jsonb_build_object(key, NULL) omits the key, so the old || merge never removed
-- a user's reminder minutes when disabling. Use jsonb - key to clear the entry.
CREATE OR REPLACE FUNCTION public.set_reminder_minutes_for_user(p_business_id uuid, p_user_id uuid, p_minutes integer)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.business_profile
  SET reminder_minutes_by_user =
    CASE
      WHEN p_minutes IS NULL THEN
        COALESCE(reminder_minutes_by_user, '{}'::jsonb) - p_user_id::text
      ELSE
        COALESCE(reminder_minutes_by_user, '{}'::jsonb)
          || jsonb_build_object(
            p_user_id::text,
            GREATEST(0, LEAST(1440, p_minutes))
          )
    END
  WHERE id = p_business_id;
$$;
