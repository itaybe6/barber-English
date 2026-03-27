-- When false, new self-registered clients are created as approved and can book immediately.
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS require_client_approval boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.business_profile.require_client_approval IS 'When true, new clients register with client_approved=false until an admin approves. When false, new clients are approved immediately.';
