-- Drop legacy home page image columns from business_profile
-- Run this in your Supabase SQL editor

ALTER TABLE business_profile
  DROP COLUMN IF EXISTS image_on_page_1,
  DROP COLUMN IF EXISTS image_on_page_2,
  DROP COLUMN IF EXISTS image_on_page_3;

