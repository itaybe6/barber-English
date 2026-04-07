-- Reschedule pulseem_low_balance_reminder_daily → 08:00 UTC (~10:00 Asia/Jerusalem winter).

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
    PERFORM cron.schedule(
      'pulseem_low_balance_reminder_daily',
      '0 8 * * *',
      'SELECT public.invoke_pulseem_low_balance_reminder_edge()'
    );
  END IF;
END;
$$;
