-- Add home_hero_images column to business_profile
-- Run this in your Supabase SQL editor

ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS home_hero_images JSONB DEFAULT '[]'::jsonb;

