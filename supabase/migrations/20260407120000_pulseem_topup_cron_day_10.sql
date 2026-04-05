-- Reschedule Pulseem monthly top-up from day-of-month 1 → 10 (for DBs that already ran 20260405130000).

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
    PERFORM cron.schedule(
      'pulseem_monthly_credit_topup',
      '15 4 10 * *',
      'SELECT public.invoke_pulseem_monthly_credit_topup_edge()'
    );
  END IF;
END;
$$;
