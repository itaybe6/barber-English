-- Home hero: animated marquee (home_hero_images) vs one full-bleed image/video (home_hero_single_*).
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS home_hero_mode text NOT NULL DEFAULT 'marquee';

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS home_hero_single_url text;

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS home_hero_single_kind text;

ALTER TABLE public.business_profile
  DROP CONSTRAINT IF EXISTS business_profile_home_hero_mode_check;

ALTER TABLE public.business_profile
  ADD CONSTRAINT business_profile_home_hero_mode_check
  CHECK (home_hero_mode IN ('marquee', 'single_fullbleed'));

ALTER TABLE public.business_profile
  DROP CONSTRAINT IF EXISTS business_profile_home_hero_single_kind_check;

ALTER TABLE public.business_profile
  ADD CONSTRAINT business_profile_home_hero_single_kind_check
  CHECK (home_hero_single_kind IS NULL OR home_hero_single_kind IN ('image', 'video'));
