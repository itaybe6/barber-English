-- Restores admin calendar sticky reminders (used by app calendar UI + lib/api/calendarReminders).
-- Safe if the table already exists or was never dropped.

CREATE TABLE IF NOT EXISTS public.calendar_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_profile (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  event_date date NOT NULL,
  start_time time NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  title text NOT NULL DEFAULT '',
  notes text,
  color_key text NOT NULL DEFAULT 'blue',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_reminders_business_user_date
  ON public.calendar_reminders (business_id, user_id, event_date);
