-- Per-user pre-appointment reminders configuration and processor
-- Run this in your Supabase SQL editor

-- 1) Add JSONB map for per-admin reminder minutes
--    Structure: { "<user_id>": <minutes:int> }
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS reminder_minutes_by_user JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.business_profile.reminder_minutes_by_user IS
  'Map of { "<user_id>": <minutes:int|null> } controlling how many minutes before an appointment to remind a specific admin/barber. Null/absent means no reminder.';

-- 1.1) Helper functions to set/get reminder minutes per user
CREATE OR REPLACE FUNCTION public.set_reminder_minutes_for_user(p_business_id uuid, p_user_id uuid, p_minutes int)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE public.business_profile
  SET reminder_minutes_by_user = COALESCE(reminder_minutes_by_user, '{}'::jsonb)
      || jsonb_build_object(p_user_id::text, CASE WHEN p_minutes IS NULL THEN NULL ELSE GREATEST(0, LEAST(1440, p_minutes)) END)
  WHERE id = p_business_id;
$$;

-- 1.2) Ensure notifications table has columns used below (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'appointment_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN appointment_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Optional indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_appointment_id ON public.notifications(appointment_id);

CREATE OR REPLACE FUNCTION public.get_reminder_minutes_for_user(p_business_id uuid, p_user_id uuid)
RETURNS int
LANGUAGE sql
AS $$
  SELECT NULLIF((reminder_minutes_by_user ->> p_user_id::text)::int, NULL)
  FROM public.business_profile
  WHERE id = p_business_id;
$$;

-- 2) Ensure helper exists to make timestamptz from date+time (used below)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'make_appointment_timestamptz') THEN
    CREATE FUNCTION public.make_appointment_timestamptz(p_date DATE, p_time TIME, p_tz TEXT DEFAULT 'Asia/Jerusalem')
    RETURNS TIMESTAMP WITH TIME ZONE
    LANGUAGE SQL
    IMMUTABLE
    AS $fn$
      SELECT (p_date::timestamp + p_time) AT TIME ZONE p_tz;
    $fn$;
  END IF;
END $$;

-- 3) Create or replace the admin reminders processor to honor per-user settings
--    Sends a notification to the assigned admin only, at (appointment_time - minutes) when minutes is set > 0
CREATE OR REPLACE FUNCTION public.process_due_admin_reminders_by_user()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH appts AS (
    SELECT 
      a.id                         AS appointment_id,
      a.business_id,
      a.client_name,
      a.client_phone,
      a.service_name,
      a.slot_date,
      a.slot_time,
      COALESCE(a.user_id, a.barber_id) AS admin_id,
      public.make_appointment_timestamptz(a.slot_date, a.slot_time) AS appt_at
    FROM public.appointments a
    WHERE a.is_available = FALSE
      AND public.make_appointment_timestamptz(a.slot_date, a.slot_time) > NOW()
  ), cfg AS (
    SELECT 
      ap.*,
      u.name         AS admin_name,
      TRIM(u.phone)  AS admin_phone,
      -- Minutes from business profile JSON map; null/absent disables
      NULLIF((bp.reminder_minutes_by_user ->> ap.admin_id::text)::int, NULL) AS minutes
    FROM appts ap
    JOIN public.users u
      ON u.id = ap.admin_id
     AND u.user_type = 'admin'
     AND u.phone IS NOT NULL AND TRIM(u.phone) <> ''
    JOIN public.business_profile bp
      ON bp.id = ap.business_id
  ), due AS (
    SELECT c.*
    FROM cfg c
    WHERE c.minutes IS NOT NULL
      AND c.minutes > 0
      AND c.appt_at - make_interval(mins => c.minutes) <= NOW()
      AND c.appt_at > NOW()
  )
  INSERT INTO public.notifications (title, content, type, recipient_name, recipient_phone, appointment_id, business_id, user_id)
  SELECT
    'Upcoming appointment',
    format('Reminder: %s (%s) has an appointment for %s today at %s',
           COALESCE(NULLIF(d.client_name, ''), 'Client'),
           COALESCE(TRIM(d.client_phone), ''),
           COALESCE(NULLIF(d.service_name, ''), 'the service'),
           to_char(d.slot_time, 'HH24:MI')
    )::text,
    'system',
    COALESCE(NULLIF(d.admin_name, ''), 'Manager'),
    d.admin_phone,
    d.appointment_id,
    d.business_id,
    d.admin_id
  FROM due d
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.appointment_id = d.appointment_id
      AND n.type = 'system'
      AND n.recipient_phone = d.admin_phone
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4) Schedule the processor to run frequently (every 5 minutes)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4.1) Unschedule legacy fixed-30m admin reminders job if it exists
DO $$
DECLARE
  v_job_id INT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'admin_reminders_processor_30m';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

DO $$
DECLARE
  v_job_id INT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'admin_reminders_processor_by_user_minutes';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'admin_reminders_processor_by_user_minutes',
    '*/5 * * * *',
    $cron$SELECT public.process_due_admin_reminders_by_user();$cron$
  );
END $$;


