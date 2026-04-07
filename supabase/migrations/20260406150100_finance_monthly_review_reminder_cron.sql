-- Daily at 20:00 (pg_cron timezone is usually UTC on Supabase — adjust hour if you need 20:00 Asia/Jerusalem).
-- Edge function still filters by Jerusalem calendar (last 3 / first 3 days of month).

CREATE OR REPLACE FUNCTION public.invoke_finance_monthly_review_reminder_edge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  svc_jwt text;
  endpoint constant text := 'https://vqstsrobzbykfivlahxa.supabase.co/functions/v1/finance-monthly-review-reminder';
BEGIN
  svc_jwt := public.vault_service_role_jwt_for_edge();

  IF svc_jwt IS NULL OR svc_jwt = '' THEN
    RAISE WARNING 'invoke_finance_monthly_review_reminder_edge: set vault notification_edge_invoke_jwt or JWT_SECRET (service_role JWT)';
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

COMMENT ON FUNCTION public.invoke_finance_monthly_review_reminder_edge() IS
  'POST finance-monthly-review-reminder. JWT: vault notification_edge_invoke_jwt or JWT_SECRET.';

DO $$
DECLARE
  jid int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    SELECT jobid INTO jid FROM cron.job WHERE jobname = 'finance_monthly_review_reminder_daily' LIMIT 1;
    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
    SELECT jobid INTO jid FROM cron.job WHERE jobname = 'finance_monthly_review_reminder_hourly' LIMIT 1;
    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
    PERFORM cron.schedule(
      'finance_monthly_review_reminder_daily',
      '0 20 * * *',
      'SELECT public.invoke_finance_monthly_review_reminder_edge()'
    );
  END IF;
END;
$$;
