-- =============================================================================
-- Hourly invoke Edge Function send-monthly-report (Asia/Jerusalem logic inside fn)
-- =============================================================================
-- Prerequisites:
-- 1) Dashboard → Database → Extensions: enable "pg_cron" and "pg_net".
-- 2) Deploy function: npm run deploy:edge:send-monthly-report (after supabase login + link)
-- 3) Dashboard → Edge Functions → send-monthly-report → Secrets:
--    RESEND_API_KEY, MONTHLY_REPORT_FROM_EMAIL (optional; SUPABASE_* injected automatically)
-- 4) Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY below (Settings → API → Project URL ref / service_role secret)
-- =============================================================================

-- Optional: remove old job before re-scheduling (safe if job missing)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'send-monthly-report-hourly'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'send-monthly-report-hourly',
  '0 * * * *',  -- every hour at :00 UTC — function checks Israel local day+time + 60m window
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-monthly-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'apikey', 'YOUR_SERVICE_ROLE_KEY'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) AS request_id;
  $$
);

-- Verify: SELECT * FROM cron.job;
-- Logs:   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
