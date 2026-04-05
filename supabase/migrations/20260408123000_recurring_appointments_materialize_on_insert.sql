-- Immediate materialization: when a recurring_appointments rule is added,
-- create/book the concrete appointment rows in appointments right away.
--
-- This keeps the UI feeling "real" immediately after an admin adds a fixed appointment,
-- while the nightly cron still acts as a safety net.

CREATE OR REPLACE FUNCTION public.materialize_recurring_appointment_for_rule(
  p_rule_id uuid,
  p_horizon_days integer DEFAULT 42
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_today date;
  d date;
  i int;
  v_has_bh boolean;
  v_first date;
  v_anchor date;
  v_interval int;
  v_weeks bigint;
  v_bh record;
  v_duration int;
  apt record;
  v_phone text;
  v_rows int := 0;
  v_upd int;
BEGIN
  IF p_rule_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_horizon_days IS NULL OR p_horizon_days < 1 THEN
    p_horizon_days := 42;
  END IF;

  SELECT *
  INTO r
  FROM public.recurring_appointments
  WHERE id = p_rule_id
    AND business_id IS NOT NULL
    AND day_of_week IS NOT NULL
    AND slot_time IS NOT NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_today := (timezone('Asia/Jerusalem', now()))::date;
  v_interval := GREATEST(1, COALESCE(r.repeat_interval, 1));
  v_first := v_today + ((r.day_of_week - EXTRACT(DOW FROM v_today)::int + 7) % 7);
  v_anchor := COALESCE(r.start_date, v_first);

  FOR i IN 0..p_horizon_days LOOP
    d := v_today + i;

    IF EXTRACT(DOW FROM d)::int <> r.day_of_week THEN
      CONTINUE;
    END IF;

    IF r.start_date IS NOT NULL AND d < r.start_date THEN
      CONTINUE;
    END IF;
    IF r.end_date IS NOT NULL AND d > r.end_date THEN
      CONTINUE;
    END IF;

    v_weeks := FLOOR((d - v_anchor) / 7.0);
    IF v_weeks < 0 THEN
      CONTINUE;
    END IF;
    IF (v_weeks % v_interval) <> 0 THEN
      CONTINUE;
    END IF;

    -- Resolve business hours: per-barber first, then global
    v_has_bh := false;
    IF r.admin_id IS NOT NULL THEN
      SELECT * INTO v_bh
      FROM public.business_hours
      WHERE business_id = r.business_id
        AND day_of_week = r.day_of_week
        AND COALESCE(is_active, true) = true
        AND user_id = r.admin_id
      LIMIT 1;
      IF FOUND THEN
        v_has_bh := true;
      END IF;
    END IF;

    IF NOT v_has_bh THEN
      SELECT * INTO v_bh
      FROM public.business_hours
      WHERE business_id = r.business_id
        AND day_of_week = r.day_of_week
        AND COALESCE(is_active, true) = true
        AND user_id IS NULL
      LIMIT 1;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
    END IF;

    -- Duration from service, fallback to business hours slot duration, fallback 60.
    SELECT s.duration_minutes INTO v_duration
    FROM public.services s
    WHERE s.id = r.service_id
      AND s.business_id = r.business_id
      AND COALESCE(s.is_active, true) = true
    LIMIT 1;

    IF v_duration IS NULL OR v_duration <= 0 THEN
      v_duration := NULLIF(v_bh.slot_duration_minutes, 0);
    END IF;
    IF v_duration IS NULL OR v_duration <= 0 THEN
      v_duration := 60;
    END IF;

    -- Validate that the slot fits inside working hours and doesn't intersect breaks.
    IF NOT public._recurring_slot_fits_hours(
      r.slot_time::time without time zone,
      v_duration,
      v_bh.start_time,
      v_bh.end_time,
      COALESCE(v_bh.breaks, '[]'::jsonb),
      v_bh.break_start_time,
      v_bh.break_end_time
    ) THEN
      CONTINUE;
    END IF;

    v_phone := NULLIF(trim(COALESCE(r.client_phone, '')), '');

    -- Match by business/date/time AND the barber scope if present.
    SELECT a.* INTO apt
    FROM public.appointments a
    WHERE a.business_id = r.business_id
      AND a.slot_date = d
      AND a.slot_time = r.slot_time::time without time zone
      AND (
        (r.admin_id IS NOT NULL AND a.user_id = r.admin_id)
        OR (r.admin_id IS NULL AND a.user_id IS NULL)
      )
    LIMIT 1;

    IF FOUND THEN
      -- Only claim the slot if it's available; never overwrite an already-booked appointment.
      IF COALESCE(apt.is_available, true) = true THEN
        UPDATE public.appointments
        SET
          is_available = false,
          client_name = COALESCE(r.client_name, client_name, 'Client'),
          client_phone = COALESCE(v_phone, client_phone),
          service_name = COALESCE(NULLIF(trim(COALESCE(r.service_name, '')), ''), service_name, 'Service'),
          service_id = COALESCE(r.service_id, service_id),
          user_id = COALESCE(r.admin_id, user_id),
          barber_id = COALESCE(r.admin_id, barber_id),
          duration_minutes = COALESCE(v_duration, duration_minutes),
          status = COALESCE(status, 'confirmed')
        WHERE id = apt.id
          AND COALESCE(is_available, true) = true;
        GET DIAGNOSTICS v_upd = ROW_COUNT;
        v_rows := v_rows + v_upd;
      END IF;
    ELSE
      INSERT INTO public.appointments (
        business_id,
        slot_date,
        slot_time,
        is_available,
        client_name,
        client_phone,
        service_name,
        service_id,
        user_id,
        barber_id,
        duration_minutes,
        status
      ) VALUES (
        r.business_id,
        d,
        r.slot_time::time without time zone,
        false,
        COALESCE(NULLIF(trim(COALESCE(r.client_name, '')), ''), 'Client'),
        v_phone,
        COALESCE(NULLIF(trim(COALESCE(r.service_name, '')), ''), 'Service'),
        r.service_id,
        r.admin_id,
        r.admin_id,
        v_duration,
        'confirmed'
      );
      v_rows := v_rows + 1;
    END IF;
  END LOOP;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.materialize_recurring_appointment_for_rule(uuid, integer) IS
  'Books concrete appointments from a single recurring_appointments rule immediately (horizon default 42 days).';

REVOKE ALL ON FUNCTION public.materialize_recurring_appointment_for_rule(uuid, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_recurring_appointments_materialize_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.materialize_recurring_appointment_for_rule(NEW.id, 42);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_recurring_appointments_materialize_after_insert() IS
  'Trigger: immediately materialize new recurring appointment rule into appointments.';

DROP TRIGGER IF EXISTS recurring_appointments_materialize_after_insert ON public.recurring_appointments;
CREATE TRIGGER recurring_appointments_materialize_after_insert
AFTER INSERT ON public.recurring_appointments
FOR EACH ROW
EXECUTE FUNCTION public.trg_recurring_appointments_materialize_after_insert();

