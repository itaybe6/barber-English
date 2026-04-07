-- Cover foreign-key columns missing a suitable btree index (Supabase performance linter).
-- Composite indexes that do not lead with the FK column (e.g. (day_of_week, user_id)) do not
-- satisfy FK maintenance lookups on user_id alone.

CREATE INDEX IF NOT EXISTS idx_appointments_service_id
  ON public.appointments (service_id);

CREATE INDEX IF NOT EXISTS idx_auth_register_profile_tokens_user_id
  ON public.auth_register_profile_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_business_hours_user_id
  ON public.business_hours (user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_id
  ON public.calendar_reminders (user_id);

CREATE INDEX IF NOT EXISTS idx_messages_user_id
  ON public.messages (user_id);

CREATE INDEX IF NOT EXISTS idx_recurring_appointments_client_id
  ON public.recurring_appointments (client_id);

-- Constraint name is recurring_appointments_user_id_fkey but column is admin_id → users(id).
CREATE INDEX IF NOT EXISTS idx_recurring_appointments_admin_id
  ON public.recurring_appointments (admin_id);

-- Mutable search_path on SECURITY DEFINER / trigger helpers (Supabase security linter).
ALTER FUNCTION public._recurring_slot_fits_hours(time without time zone, integer, time without time zone, time without time zone, jsonb, time without time zone, time without time zone) SET search_path = public;
ALTER FUNCTION public.generate_time_slots_for_date(date) SET search_path = public;
ALTER FUNCTION public.generate_time_slots_for_date(uuid, date) SET search_path = public;
ALTER FUNCTION public.generate_time_slots_for_open_window_for(uuid) SET search_path = public;
ALTER FUNCTION public.generate_time_slots_for_open_window() SET search_path = public;
ALTER FUNCTION public.generate_time_slots_roll_forward_for(uuid) SET search_path = public;
ALTER FUNCTION public.generate_time_slots_roll_forward() SET search_path = public;
ALTER FUNCTION public.get_booking_open_days_for_user(uuid, text) SET search_path = public;
ALTER FUNCTION public.get_break_minutes_for_user(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.get_reminder_minutes_for_user(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.make_appointment_timestamptz(date, time without time zone, text) SET search_path = public;
ALTER FUNCTION public.on_booking_window_changed() SET search_path = public;
ALTER FUNCTION public.set_break_minutes_for_user(uuid, uuid, integer) SET search_path = public;
ALTER FUNCTION public.set_calendar_reminders_updated_at() SET search_path = public;
ALTER FUNCTION public.set_messages_expires_at() SET search_path = public;
ALTER FUNCTION public.set_reminder_minutes_for_user(uuid, uuid, integer) SET search_path = public;
ALTER FUNCTION public.update_products_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
