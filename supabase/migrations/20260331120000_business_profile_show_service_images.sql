-- Service thumbnails in admin settings + client booking; default true for existing rows
ALTER TABLE public.business_profile
ADD COLUMN IF NOT EXISTS show_service_images boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.business_profile.show_service_images IS 'When false, service lists hide thumbnails (admin settings + client booking).';
