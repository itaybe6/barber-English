-- Custom title on home when `home_header_show_logo` is false; blank falls back to `display_name`.
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS home_header_text_without_logo text;

COMMENT ON COLUMN public.business_profile.home_header_text_without_logo IS
  'When home_header_show_logo is false, home header shows this text; NULL/empty uses display_name.';
