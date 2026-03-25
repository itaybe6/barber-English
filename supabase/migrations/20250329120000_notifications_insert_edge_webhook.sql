-- pg_net trigger: after INSERT on notifications → Edge Function notification-push-sms
-- (Same idea as Supabase "Database Webhooks" — they wrap pg_net.)
--
-- One-time setup (SQL Editor, after this migration):
--   SELECT vault.create_secret(
--     '<paste service_role JWT from Project Settings → API>',
--     'notification_edge_invoke_jwt',
--     'Authorization Bearer for Edge Function notification-push-sms'
--   );
-- Until that secret exists, inserts still work; the trigger only logs a WARNING and skips HTTP.
--
-- Project URL is tied to ref vqstsrobzbykfivlahxa; change if you point DB elsewhere.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trg_notifications_push_sms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  svc_jwt text;
  endpoint constant text := 'https://vqstsrobzbykfivlahxa.supabase.co/functions/v1/notification-push-sms';
  payload jsonb;
BEGIN
  SELECT ds.decrypted_secret
  INTO svc_jwt
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'notification_edge_invoke_jwt'
  LIMIT 1;

  IF svc_jwt IS NULL OR btrim(svc_jwt) = '' THEN
    RAISE WARNING 'trg_notifications_push_sms: add vault secret notification_edge_invoke_jwt (service_role JWT)';
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'type', 'INSERT',
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', to_jsonb(NEW),
    'old_record', NULL
  );

  PERFORM net.http_post(
    endpoint,
    payload,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_jwt
    ),
    10000
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_push_sms_after_insert ON public.notifications;

CREATE TRIGGER notifications_push_sms_after_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_notifications_push_sms();

COMMENT ON FUNCTION public.trg_notifications_push_sms() IS
  'Queues HTTP POST to Edge Function notification-push-sms (pg_net). JWT from vault secret notification_edge_invoke_jwt.';
