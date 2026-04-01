-- Edge invokes (pg_cron + triggers) used only vault secret "notification_edge_invoke_jwt".
-- If you store the service_role JWT under "JWT_SECRET" instead, they got Bearer '' → 401.
-- Fallback: notification_edge_invoke_jwt, else JWT_SECRET (Postgres Vault names).
-- Value must be the service_role eyJ… token from Project Settings → API, not the signing "JWT Secret" string.

CREATE OR REPLACE FUNCTION public.vault_service_role_jwt_for_edge()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  raw text;
BEGIN
  SELECT COALESCE(
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_edge_invoke_jwt' LIMIT 1),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'JWT_SECRET' LIMIT 1)
  )
  INTO raw;

  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  raw := btrim(raw);
  IF raw = '' THEN
    RETURN NULL;
  END IF;

  IF lower(left(raw, 7)) = 'bearer ' THEN
    raw := btrim(substr(raw, 8));
  END IF;

  RETURN NULLIF(raw, '');
END;
$$;

COMMENT ON FUNCTION public.vault_service_role_jwt_for_edge() IS
  'Service role JWT for Authorization Bearer to Edge (pg_net). Vault: notification_edge_invoke_jwt or JWT_SECRET.';

-- notification-push-sms trigger
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
  svc_jwt := public.vault_service_role_jwt_for_edge();

  IF svc_jwt IS NULL OR svc_jwt = '' THEN
    RAISE WARNING 'trg_notifications_push_sms: set vault secret notification_edge_invoke_jwt or JWT_SECRET (service_role JWT)';
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

COMMENT ON FUNCTION public.trg_notifications_push_sms() IS
  'POST notification-push-sms (pg_net). JWT: vault notification_edge_invoke_jwt or JWT_SECRET.';

-- birthday-notifications
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
  svc_jwt := public.vault_service_role_jwt_for_edge();

  IF svc_jwt IS NULL OR svc_jwt = '' THEN
    RAISE WARNING 'invoke_birthday_notifications_edge: set vault notification_edge_invoke_jwt or JWT_SECRET (service_role JWT)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    endpoint,
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_jwt,
      'apikey', svc_jwt
    ),
    30000
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_birthday_notifications_edge() IS
  'POST birthday-notifications. JWT: vault notification_edge_invoke_jwt or JWT_SECRET.';

-- Reschedule appointment-reminders cron to use helper
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
          'Authorization', 'Bearer ' || coalesce(public.vault_service_role_jwt_for_edge(), '')
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END $$;
