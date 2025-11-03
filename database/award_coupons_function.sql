-- Function that awards coupons to clients based on past completed bookings

CREATE OR REPLACE FUNCTION public.award_coupons_for_past_appointments()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  WITH eligible AS (
    SELECT
      c.business_id,
      c.worker_id,
      u.id AS client_id,
      c.id AS coupon_id,
      COUNT(*) AS completed_count
    FROM public.coupons c
    JOIN public.appointments a
      ON a.business_id = c.business_id
     AND a.user_id = c.worker_id
     AND a.is_available = FALSE
     AND (
          a.slot_date < CURRENT_DATE
          OR (a.slot_date = CURRENT_DATE AND a.slot_time < LOCALTIME)
         )
     AND COALESCE(a.status, 'confirmed') IN ('confirmed', 'completed')
     AND a.client_phone IS NOT NULL
    JOIN public.users u
      ON u.user_type = 'client'
     AND u.business_id = c.business_id
     AND u.phone = a.client_phone
    GROUP BY c.business_id, c.worker_id, u.id, c.id
    HAVING COUNT(*) >= c.counts_booking
  ), to_award AS (
    SELECT e.*
    FROM eligible e
    LEFT JOIN public.customer_coupons cc
      ON cc.business_id = e.business_id
     AND cc.worker_id = e.worker_id
     AND cc.client_id = e.client_id
     AND cc.coupon_id = e.coupon_id
    WHERE cc.id IS NULL
  ), ins AS (
    INSERT INTO public.customer_coupons (business_id, worker_id, client_id, coupon_id, redeemed)
    SELECT business_id, worker_id, client_id, coupon_id, FALSE
    FROM to_award
    RETURNING id, business_id, worker_id, client_id, coupon_id
  )
  INSERT INTO public.notifications (title, content, type, recipient_name, recipient_phone, business_id)
  SELECT 
    'New coupon' AS title,
    'You have earned a coupon: ' || c.name AS content,
    'promotion' AS type,
    u.name AS recipient_name,
    u.phone AS recipient_phone,
    i.business_id AS business_id
  FROM ins i
  JOIN public.users u ON u.id = i.client_id
  JOIN public.coupons c ON c.id = i.coupon_id;
END;
$$;

-- Create/replace cron job (every 30 minutes) to award coupons
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_job_id INT;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'award_coupons_periodic';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'award_coupons_periodic',
    '*/30 * * * *', -- every 30 minutes
    $cron$SELECT public.award_coupons_for_past_appointments();$cron$
  );
END;
$$;


