-- Optional birth date on users; one-time token to finish registration profile after OTP (Edge: auth-phone-otp)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS birth_date date;

COMMENT ON COLUMN public.users.birth_date IS 'Optional client birth date; set during registration or profile.';

CREATE TABLE IF NOT EXISTS public.auth_register_profile_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_profile (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_reg_profile_tokens_lookup
  ON public.auth_register_profile_tokens (business_id, token_hash)
  WHERE used_at IS NULL;

COMMENT ON TABLE public.auth_register_profile_tokens IS
  'Single-use token after register OTP; allows client to set name/birth_date/image before admin notification. Service role / Edge only.';
