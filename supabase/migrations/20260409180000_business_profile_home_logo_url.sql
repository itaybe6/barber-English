-- Public URL for home header logo (Supabase Storage). Empty/null = use bundled branding logo.
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS home_logo_url text;

COMMENT ON COLUMN public.business_profile.home_logo_url IS 'Public URL for admin/client home header logo; null = use app bundle branding logo.';
