-- Remove per-service images and business_profile.show_service_images (feature retired)
ALTER TABLE public.services DROP COLUMN IF EXISTS image_url;
ALTER TABLE public.business_profile DROP COLUMN IF EXISTS show_service_images;
