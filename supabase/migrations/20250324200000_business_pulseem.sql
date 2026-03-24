-- Pulseem (פולסים) SMS credentials per tenant + branding folder name for storage sync

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS branding_client_name TEXT,
  ADD COLUMN IF NOT EXISTS pulseem_user_id TEXT,
  ADD COLUMN IF NOT EXISTS pulseem_password TEXT,
  ADD COLUMN IF NOT EXISTS pulseem_from_number TEXT;

COMMENT ON COLUMN public.business_profile.branding_client_name IS
  'Folder name under storage branding/<name>/ (matches CLIENT_NAME in .env)';
COMMENT ON COLUMN public.business_profile.pulseem_user_id IS 'Pulseem API user id';
COMMENT ON COLUMN public.business_profile.pulseem_password IS 'Pulseem API password (server-side / Edge Functions)';
COMMENT ON COLUMN public.business_profile.pulseem_from_number IS 'Pulseem sender / from number for SMS';

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS pulseem_has_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.business_profile.pulseem_has_password IS 'True when pulseem_password is set (never expose password in list APIs)';

UPDATE public.business_profile
SET pulseem_has_password = TRUE
WHERE (pulseem_password IS NOT NULL AND trim(pulseem_password) <> '');
