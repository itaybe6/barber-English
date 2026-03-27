-- Split reminder maps: reminder_minutes_by_user = admin (self), client_reminder_minutes_by_user = clients.
-- Copy existing per-user minutes to both maps so behavior is preserved after deploy.
-- Drop calendar_reminders (replaced by automated notifications + settings).

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS client_reminder_minutes_by_user jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.business_profile.reminder_minutes_by_user IS
  'Per barber/admin: minutes before a booked appointment to notify that admin (optional; null key = off).';
COMMENT ON COLUMN public.business_profile.client_reminder_minutes_by_user IS
  'Per barber: minutes before a booked appointment to notify the client (optional; null key = off).';

UPDATE public.business_profile bp
SET client_reminder_minutes_by_user = COALESCE(bp.reminder_minutes_by_user, '{}'::jsonb)
WHERE jsonb_typeof(COALESCE(bp.client_reminder_minutes_by_user, '{}'::jsonb)) = 'object'
  AND (bp.client_reminder_minutes_by_user IS NULL OR bp.client_reminder_minutes_by_user = '{}'::jsonb)
  AND bp.reminder_minutes_by_user IS NOT NULL
  AND bp.reminder_minutes_by_user <> '{}'::jsonb;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS admin_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.appointments.admin_reminder_sent_at IS
  'Set when a scheduled admin (barber) reminder notification was created for this booking.';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  (type)::text = ANY (
    ARRAY[
      'appointment_reminder'::character varying,
      'client_reminder'::character varying,
      'admin_reminder'::character varying,
      'promotion'::character varying,
      'general'::character varying,
      'system'::character varying
    ]::text[]
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_one_admin_reminder_per_appointment
  ON public.notifications (appointment_id)
  WHERE type = 'admin_reminder' AND appointment_id IS NOT NULL;

DROP TABLE IF EXISTS public.calendar_reminders;

-- pg_cron: call appointment-reminders every 10 minutes (requires pg_cron + pg_net + vault secret notification_edge_invoke_jwt).
DO $$
DECLARE
  jid int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    SELECT jobid INTO jid FROM cron.job WHERE jobname = 'appointment_reminders_every_10m' LIMIT 1;
    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
    PERFORM cron.schedule(
      'appointment_reminders_every_10m',
      '*/10 * * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://vqstsrobzbykfivlahxa.supabase.co/functions/v1/appointment-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || coalesce(
            (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_edge_invoke_jwt' LIMIT 1),
            ''
          )
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;
