-- Create coupons table
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID,
  worker_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  counts_booking INT NOT NULL CHECK (counts_booking >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coupons_business_id ON public.coupons(business_id);
CREATE INDEX IF NOT EXISTS idx_coupons_worker_id ON public.coupons(worker_id);
CREATE INDEX IF NOT EXISTS idx_coupons_name ON public.coupons(name);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_coupons_updated_at ON public.coupons;
CREATE TRIGGER update_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Disable RLS to match application tables
ALTER TABLE public.coupons DISABLE ROW LEVEL SECURITY;


