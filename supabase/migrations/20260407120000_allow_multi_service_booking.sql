-- Clients may select multiple services in one booking only when admin enables this.
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS allow_multi_service_booking boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.business_profile.allow_multi_service_booking IS 'When true, clients can book multiple services in one appointment; otherwise single service only.';
