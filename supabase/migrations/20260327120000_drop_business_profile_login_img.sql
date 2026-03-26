-- Remove unused login page background column (feature removed from app settings)
ALTER TABLE public.business_profile DROP COLUMN IF EXISTS login_img;
