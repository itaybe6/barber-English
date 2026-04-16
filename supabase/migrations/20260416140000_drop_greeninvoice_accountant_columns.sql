-- Green Invoice + accountant fields removed from app; income analytics use appointments only.
-- receipt_issued was only used for Green Invoice receipt issuance.

ALTER TABLE public.business_profile
  DROP COLUMN IF EXISTS greeninvoice_api_key_id,
  DROP COLUMN IF EXISTS greeninvoice_api_secret,
  DROP COLUMN IF EXISTS greeninvoice_has_credentials,
  DROP COLUMN IF EXISTS accountant_email,
  DROP COLUMN IF EXISTS accountant_report_day_of_month,
  DROP COLUMN IF EXISTS accountant_report_time,
  DROP COLUMN IF EXISTS accountant_report_last_sent_period,
  DROP COLUMN IF EXISTS finance_monthly_review_reminder_period;

ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS receipt_issued;

ALTER TABLE public.business_profile
  DROP COLUMN IF EXISTS local_kabala_last_serial;

DROP FUNCTION IF EXISTS public.next_local_kabala_receipt_serial();
DROP FUNCTION IF EXISTS public.next_local_kabala_receipt_serial(uuid, uuid);
