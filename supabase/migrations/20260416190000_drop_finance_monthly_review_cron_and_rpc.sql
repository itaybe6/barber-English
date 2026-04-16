-- Edge function finance-monthly-review-reminder removed from repo; stop pg_cron + drop invoke RPC.

DO $$
DECLARE
  jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'finance_monthly_review_reminder_daily' LIMIT 1;
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;

  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'finance_monthly_review_reminder_hourly' LIMIT 1;
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.invoke_finance_monthly_review_reminder_edge();
