-- PostgREST PGRST203 when two candidates exist:
-- set_booking_open_days_for_user(uuid, text, int) vs (uuid, uuid, int)

DROP FUNCTION IF EXISTS public.set_booking_open_days_for_user(uuid, text, integer);
