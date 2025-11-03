-- Add coupon_id to customer_coupons and uniqueness

ALTER TABLE public.customer_coupons
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE CASCADE;

-- Ensure fast lookups and deduplicate grants
CREATE INDEX IF NOT EXISTS idx_customer_coupons_coupon_id ON public.customer_coupons(coupon_id);

-- Prevent duplicate grants of the same coupon to the same client/worker/business
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uniq_customer_coupon_grant'
  ) THEN
    CREATE UNIQUE INDEX uniq_customer_coupon_grant
      ON public.customer_coupons(business_id, worker_id, client_id, coupon_id);
  END IF;
END$$;


