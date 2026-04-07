-- Reschedule finance-monthly-review-reminder: once per day at 20:00 (cron TZ is typically UTC on Supabase).
-- For ~20:00 Asia/Jerusalem use e.g. 17 or 18 instead of 20 depending on DST.

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
