-- Pulseem new API (מפתח API מ-ui-api.pulseem.com), separate from legacy Web Service user/password

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS pulseem_api_key TEXT;

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS pulseem_has_api_key BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.business_profile.pulseem_api_key IS 'Pulseem REST/API key (הגדרות API בחשבון המשנה)';
COMMENT ON COLUMN public.business_profile.pulseem_has_api_key IS 'True when API key is set (do not SELECT key in list endpoints)';

UPDATE public.business_profile
SET pulseem_has_api_key = TRUE
WHERE pulseem_api_key IS NOT NULL AND trim(pulseem_api_key) <> '';
