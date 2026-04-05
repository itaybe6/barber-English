-- Remove app-side monthly SMS counter/cap (if a DB already ran the earlier quota migration).
-- Quota is only Pulseem balance; monthly job adds credits that accumulate.

DROP FUNCTION IF EXISTS public.consume_pulseem_monthly_sms_quota(uuid);
DROP FUNCTION IF EXISTS public.refund_pulseem_monthly_sms_quota(uuid);

ALTER TABLE public.business_profile
  DROP COLUMN IF EXISTS pulseem_monthly_sms_period,
  DROP COLUMN IF EXISTS pulseem_monthly_sms_used,
  DROP COLUMN IF EXISTS pulseem_monthly_sms_cap;
