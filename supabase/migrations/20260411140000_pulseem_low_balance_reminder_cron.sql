-- Daily: scan Pulseem Direct SMS balance per tenant; notify admins if below threshold (Edge: pulseem-low-balance-reminder).

CREATE OR REPLACE FUNCTION public.invoke_pulseem_low_balance_reminder_edge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  svc_jwt text;
  endpoint constant text := 'https://vqstsrobzbykfivlahxa.supabase.co/functions/v1/pulseem-low-balance-reminder';
BEGIN
  svc_jwt := public.vault_service_role_jwt_for_edge();

  IF svc_jwt IS NULL OR svc_jwt = '' THEN
    RAISE WARNING 'invoke_pulseem_low_balance_reminder_edge: set vault notification_edge_invoke_jwt or JWT_SECRET (service_role JWT)';
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
    120000
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_pulseem_low_balance_reminder_edge() IS
  'POST pulseem-low-balance-reminder. JWT: vault_service_role_jwt_for_edge.';

DO $$
DECLARE
  jid int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    SELECT jobid INTO jid FROM cron.job WHERE jobname = 'pulseem_low_balance_reminder_daily' LIMIT 1;
    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
    -- 08:00 UTC = 10:00 בוקר Asia/Jerusalem בשעון חורף (UTC+2). בקיץ (UTC+3) ≈ 11:00 מקומי — pg_cron רק ב-UTC.
    PERFORM cron.schedule(
      'pulseem_low_balance_reminder_daily',
      '0 8 * * *',
      'SELECT public.invoke_pulseem_low_balance_reminder_edge()'
    );
  END IF;
END;
$$;
