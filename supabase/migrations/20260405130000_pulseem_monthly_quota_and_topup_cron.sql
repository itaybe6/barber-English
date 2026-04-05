-- Pulseem: pg_cron monthly CreditTransfer — adds DirectSms credits each month (accumulates on Pulseem balance).
-- pulseem-credit-transfer accepts { "monthlyTopupAll": true } (service role).
-- Sending is limited only by Pulseem balance (REST/ASMX errors when depleted), not by a per-calendar-month app cap.

-- Monthly POST pulseem-credit-transfer { "monthlyTopupAll": true } — same JWT as other Edge cron jobs.
CREATE OR REPLACE FUNCTION public.invoke_pulseem_monthly_credit_topup_edge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  svc_jwt text;
  endpoint constant text := 'https://vqstsrobzbykfivlahxa.supabase.co/functions/v1/pulseem-credit-transfer';
BEGIN
  svc_jwt := public.vault_service_role_jwt_for_edge();

  IF svc_jwt IS NULL OR svc_jwt = '' THEN
    RAISE WARNING 'invoke_pulseem_monthly_credit_topup_edge: set vault notification_edge_invoke_jwt or JWT_SECRET (service_role JWT)';
    RETURN;
  END IF;

  PERFORM net.http_post(
    endpoint,
    jsonb_build_object('monthlyTopupAll', true),
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_jwt,
      'apikey', svc_jwt
    ),
    300000
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_pulseem_monthly_credit_topup_edge() IS
  'Queues POST pulseem-credit-transfer monthlyTopupAll (pg_net). JWT: vault_service_role_jwt_for_edge.';

DO $$
DECLARE
  jid int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    SELECT jobid INTO jid FROM cron.job WHERE jobname = 'pulseem_monthly_credit_topup' LIMIT 1;
    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
    -- 10th of month 04:15 UTC (~06:15 Asia/Jerusalem standard time)
    PERFORM cron.schedule(
      'pulseem_monthly_credit_topup',
      '15 4 10 * *',
      'SELECT public.invoke_pulseem_monthly_credit_topup_edge()'
    );
  END IF;
END;
$$;
