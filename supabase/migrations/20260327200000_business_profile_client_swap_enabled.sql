-- Allow business owners to disable client-to-client appointment swapping
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS client_swap_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.business_profile.client_swap_enabled IS 'When false, clients cannot create swap requests or execute swaps for this business.';
