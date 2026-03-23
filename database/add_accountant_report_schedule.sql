-- Schedule for automated monthly accountant email (Asia/Jerusalem in Edge Function send-monthly-report)
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS accountant_report_day_of_month integer;

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS accountant_report_time text;

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS accountant_report_last_sent_period text;

UPDATE business_profile
SET accountant_report_day_of_month = 1
WHERE accountant_report_day_of_month IS NULL;

UPDATE business_profile
SET accountant_report_time = COALESCE(NULLIF(trim(accountant_report_time), ''), '09:00');

ALTER TABLE business_profile
  ALTER COLUMN accountant_report_day_of_month SET DEFAULT 1;

ALTER TABLE business_profile
  ALTER COLUMN accountant_report_time SET DEFAULT '09:00';

ALTER TABLE business_profile
  ALTER COLUMN accountant_report_day_of_month SET NOT NULL;

ALTER TABLE business_profile
  ALTER COLUMN accountant_report_time SET NOT NULL;

ALTER TABLE business_profile DROP CONSTRAINT IF EXISTS accountant_report_day_of_month_check;

ALTER TABLE business_profile
  ADD CONSTRAINT accountant_report_day_of_month_check
  CHECK (accountant_report_day_of_month >= 1 AND accountant_report_day_of_month <= 28);

COMMENT ON COLUMN business_profile.accountant_report_day_of_month IS 'Day of month (1–28) when previous month''s report is emailed';
COMMENT ON COLUMN business_profile.accountant_report_time IS 'Local time HH:mm (24h), Asia/Jerusalem';
COMMENT ON COLUMN business_profile.accountant_report_last_sent_period IS 'YYYY-MM of report month already sent (dedup)';

-- Schedule hourly HTTP invoke (replace placeholders): see cron_invoke_send_monthly_report.sql
-- The Edge Function uses a 60-minute window after the scheduled Asia/Jerusalem time, with DB dedup.
