-- Pulseem secrets in business_profile: stored as AES-GCM ciphertext with prefix enc:v1: (see pulseemFieldCrypto.ts next to auth-phone-otp / pulseem-admin-credentials).
-- Legacy rows may still hold plaintext until re-saved via Super Admin or recreated.
--
-- Required Supabase secrets (same value on both functions):
--   PULSEEM_FIELD_ENCRYPTION_KEY = output of: openssl rand -base64 32
-- Deploy:
--   supabase functions deploy pulseem-admin-credentials
--   supabase functions deploy auth-phone-otp
--   supabase secrets set PULSEEM_FIELD_ENCRYPTION_KEY='<paste base64>'

COMMENT ON COLUMN public.business_profile.pulseem_password IS
  'Pulseem WS password: ciphertext enc:v1:... (AES-256-GCM) or legacy plaintext';

COMMENT ON COLUMN public.business_profile.pulseem_api_key IS
  'Pulseem REST API key: ciphertext enc:v1:... (AES-256-GCM) or legacy plaintext';
