-- Fixed banner message on client home (admin-controlled; app reads when enabled)
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS home_fixed_message_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS home_fixed_message text;

COMMENT ON COLUMN public.business_profile.home_fixed_message_enabled IS 'When true, show home_fixed_message on client home (app-enforced).';
COMMENT ON COLUMN public.business_profile.home_fixed_message IS 'Fixed banner/message text for client home when enabled.';
