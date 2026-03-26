-- Defer creating public.users until complete_register_profile (after name step).
-- Pending OTP-verified registrations store phone on the token row; user_id is NULL until completion.

ALTER TABLE public.auth_register_profile_tokens
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.auth_register_profile_tokens
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.auth_register_profile_tokens.user_id IS
  'NULL until profile completion; then set only for legacy rows or optional audit.';

COMMENT ON COLUMN public.auth_register_profile_tokens.phone IS
  'Registration phone while user_id is NULL; used to create users row on complete_register_profile.';
