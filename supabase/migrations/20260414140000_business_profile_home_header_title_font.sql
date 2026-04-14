-- Font preset for home header text when `home_header_show_logo` is false.
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS home_header_title_font text;

COMMENT ON COLUMN public.business_profile.home_header_title_font IS
  'When home header shows text (no logo): optional preset id (modern/serif/mono/classic/display). NULL = system default.';
