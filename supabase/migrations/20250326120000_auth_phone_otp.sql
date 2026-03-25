-- OTP challenges for phone login / register (Edge Function auth-phone-otp, service role only)

CREATE TABLE IF NOT EXISTS public.auth_phone_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_profile (id) ON DELETE CASCADE,
  phone_digits text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('login', 'register')),
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  verify_attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenges_lookup
  ON public.auth_phone_otp_challenges (business_id, phone_digits, purpose);

COMMENT ON TABLE public.auth_phone_otp_challenges IS
  'Short-lived SMS OTP hashes; no client access — use service role from Edge Functions only.';

-- Rate limiting: log each send (separate from challenge row lifecycle)
CREATE TABLE IF NOT EXISTS public.auth_otp_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  phone_digits text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_send_log_rate
  ON public.auth_otp_send_log (business_id, phone_digits, created_at DESC);

COMMENT ON TABLE public.auth_otp_send_log IS
  'SMS OTP send audit for per-hour rate limits; service role only.';

-- No GRANT to anon/authenticated — Edge uses service role.
