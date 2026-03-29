-- Optional: hourly ping to Edge Function birthday-notifications (function itself only acts 12:00–13:00 Asia/Jerusalem).
-- Reuses vault secret notification_edge_invoke_jwt (same service_role JWT as notification-push-sms).
-- Requires extensions: pg_cron, pg_net. If pg_cron is missing, this block is skipped.

CREATE OR REPLACE FUNCTION public.invoke_birthday_notifications_edge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  svc_jwt text;
  endpoint constant text := 'https://vqstsrobzbykfivlahxa.supabase.co/functions/v1/birthday-notifications';
BEGIN
  SELECT ds.decrypted_secret
  INTO svc_jwt
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'notification_edge_invoke_jwt'
  LIMIT 1;

  IF svc_jwt IS NULL OR btrim(svc_jwt) = '' THEN
    RAISE WARNING 'invoke_birthday_notifications_edge: add vault secret notification_edge_invoke_jwt';
    RETURN;
  END IF;

  PERFORM net.http_post(
    endpoint,
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_jwt
    ),
    30000
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_birthday_notifications_edge() IS
  'Queues POST to Edge birthday-notifications (pg_net). JWT from vault notification_edge_invoke_jwt.';

DO $$
DECLARE
  jid int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO jid FROM cron.job WHERE jobname = 'birthday_notifications_hourly' LIMIT 1;
    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
    PERFORM cron.schedule(
      'birthday_notifications_hourly',
      '5 * * * *',
      'SELECT public.invoke_birthday_notifications_edge()'
    );
  END IF;
END;
$$;
