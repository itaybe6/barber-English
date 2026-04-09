-- When true, show logo on admin/client home header; when false, show display_name text.
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS home_header_show_logo boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.business_profile.home_header_show_logo IS 'True: show logo on home header; false: show business display_name instead.';
