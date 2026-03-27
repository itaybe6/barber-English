-- Client appointment reminders (Edge Function appointment-reminders + pg_cron).
-- Quiet hours (Asia/Jerusalem) are enforced in application code.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS client_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.appointments.client_reminder_sent_at IS
  'Set when a scheduled client reminder notification was created for this booking.';

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  (type)::text = ANY (
    ARRAY[
      'appointment_reminder'::character varying,
      'client_reminder'::character varying,
      'promotion'::character varying,
      'general'::character varying,
      'system'::character varying
    ]::text[]
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_one_client_reminder_per_appointment
  ON public.notifications (appointment_id)
  WHERE type = 'client_reminder' AND appointment_id IS NOT NULL;

-- Optional: schedule with pg_cron (requires extension + service_role JWT in vault or inline).
-- Example (run in SQL Editor after deploy; adjust cron expression):
--   SELECT cron.schedule(
--     'appointment_reminders_every_10m',
--     '*/10 * * * *',
--     $cmd$
--     SELECT net.http_post(
--       url := 'https://vqstsrobzbykfivlahxa.supabase.co/functions/v1/appointment-reminders',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_edge_invoke_jwt' LIMIT 1)
--       ),
--       body := '{}'::jsonb
--     );
--     $cmd$
--   );
