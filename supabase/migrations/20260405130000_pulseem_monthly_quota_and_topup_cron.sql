-- Pulseem: per-tenant monthly SMS quota (calendar month in Asia/Jerusalem) + pg_cron monthly CreditTransfer top-up.
-- Edge functions auth-phone-otp / notification-push-sms call consume_pulseem_monthly_sms_quota before each billable SMS.
-- pulseem-credit-transfer accepts { "monthlyTopupAll": true } (service role) to DirectSms CreditTransfer for every business with API key.

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS pulseem_monthly_sms_period text,
  ADD COLUMN IF NOT EXISTS pulseem_monthly_sms_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pulseem_monthly_sms_cap integer NOT NULL DEFAULT 100;

COMMENT ON COLUMN public.business_profile.pulseem_monthly_sms_period IS
  'YYYY-MM (Asia/Jerusalem) for pulseem_monthly_sms_used';
COMMENT ON COLUMN public.business_profile.pulseem_monthly_sms_used IS
  'SMS count this period (OTP, notification SMS, etc.)';
COMMENT ON COLUMN public.business_profile.pulseem_monthly_sms_cap IS
  'Max SMS per calendar month (Jerusalem); NULL = unlimited (no consume/refund in RPC)';

CREATE OR REPLACE FUNCTION public.consume_pulseem_monthly_sms_quota(p_business_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char((timezone('Asia/Jerusalem', now()))::date, 'YYYY-MM');
  v_cap integer;
  v_updated integer;
BEGIN
  SELECT bp.pulseem_monthly_sms_cap
  INTO v_cap
  FROM public.business_profile bp
  WHERE bp.id = p_business_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_cap IS NULL THEN
    RETURN true;
  END IF;

  UPDATE public.business_profile bp
  SET
    pulseem_monthly_sms_used = CASE
      WHEN bp.pulseem_monthly_sms_period IS DISTINCT FROM v_period THEN 1
      ELSE bp.pulseem_monthly_sms_used + 1
    END,
    pulseem_monthly_sms_period = v_period
  WHERE bp.id = p_business_id
    AND (
      bp.pulseem_monthly_sms_period IS DISTINCT FROM v_period
      OR bp.pulseem_monthly_sms_used < v_cap
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.consume_pulseem_monthly_sms_quota(uuid) IS
  'Atomically increments monthly SMS usage if under cap; month boundary uses Asia/Jerusalem.';

CREATE OR REPLACE FUNCTION public.refund_pulseem_monthly_sms_quota(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period text := to_char((timezone('Asia/Jerusalem', now()))::date, 'YYYY-MM');
BEGIN
  UPDATE public.business_profile bp
  SET pulseem_monthly_sms_used = greatest(0, bp.pulseem_monthly_sms_used - 1)
  WHERE bp.id = p_business_id
    AND bp.pulseem_monthly_sms_cap IS NOT NULL
    AND bp.pulseem_monthly_sms_period = v_period
    AND bp.pulseem_monthly_sms_used > 0;
END;
$$;

COMMENT ON FUNCTION public.refund_pulseem_monthly_sms_quota(uuid) IS
  'Best-effort decrement after a failed SMS send (same Jerusalem month only).';

REVOKE ALL ON FUNCTION public.consume_pulseem_monthly_sms_quota(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_pulseem_monthly_sms_quota(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_pulseem_monthly_sms_quota(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_pulseem_monthly_sms_quota(uuid) TO service_role;

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
    -- 1st of month 04:15 UTC (~06:15 Asia/Jerusalem standard time)
    PERFORM cron.schedule(
      'pulseem_monthly_credit_topup',
      '15 4 1 * *',
      'SELECT public.invoke_pulseem_monthly_credit_topup_edge()'
    );
  END IF;
END;
$$;
