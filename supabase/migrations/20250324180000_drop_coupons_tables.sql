-- Remove coupon feature: function, optional pg_cron job, then tables (FK order).

DROP FUNCTION IF EXISTS public.award_coupons_for_past_appointments();

DO $$
DECLARE
  jid integer;
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      SELECT jobid INTO jid FROM cron.job WHERE jobname = 'award_coupons_periodic' LIMIT 1;
      IF jid IS NOT NULL THEN
        PERFORM cron.unschedule(jid);
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
END $$;

DROP TABLE IF EXISTS public.customer_coupons;
DROP TABLE IF EXISTS public.coupons;
