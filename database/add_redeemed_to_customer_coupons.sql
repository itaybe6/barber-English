-- Add redeemed boolean column to customer_coupons

ALTER TABLE public.customer_coupons
  ADD COLUMN IF NOT EXISTS redeemed BOOLEAN NOT NULL DEFAULT FALSE;

-- Optional index if you plan to filter by redeemed often
CREATE INDEX IF NOT EXISTS idx_customer_coupons_redeemed ON public.customer_coupons(redeemed);


