-- Nightly materialization: recurring_appointments -> concrete rows in appointments.
-- Uses Asia/Jerusalem calendar date for "today" and booking horizon.
-- Idempotent: updates available slots; skips if another client already booked; inserts if no row exists.
-- Cron: 22:00 UTC ≈ midnight Israel (UTC+2 standard). During daylight saving (UTC+3) adjust to 21:00 UTC if needed.

CREATE OR REPLACE FUNCTION public._recurring_slot_fits_hours(
  p_slot time without time zone,
  p_duration_mins integer,
  p_start time without time zone,
  p_end time without time zone,
  p_breaks jsonb,
  p_legacy_break_start time without time zone,
  p_legacy_break_end time without time zone
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_base date := DATE '2000-01-01';
  v_st timestamp without time zone;
  v_en timestamp without time zone;
  v_ss timestamp without time zone;
  v_ee timestamp without time zone;
  elem jsonb;
  b_st time without time zone;
  b_en time without time zone;
  br_s timestamp without time zone;
  br_e timestamp without time zone;
BEGIN
  IF p_slot IS NULL OR p_duration_mins IS NULL OR p_duration_mins <= 0 THEN
    RETURN false;
  END IF;

  v_st := v_base + p_slot;
  v_en := v_st + make_interval(mins => p_duration_mins);
  v_ss := v_base + p_start;
  v_ee := v_base + p_end;

  IF v_st < v_ss OR v_en > v_ee THEN
    RETURN false;
  END IF;

  IF p_legacy_break_start IS NOT NULL
     AND p_legacy_break_end IS NOT NULL
     AND p_legacy_break_start < p_legacy_break_end THEN
    br_s := v_base + p_legacy_break_start;
    br_e := v_base + p_legacy_break_end;
    IF NOT (v_en <= br_s OR v_st >= br_e) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_breaks IS NOT NULL AND jsonb_typeof(p_breaks) = 'array' THEN
    FOR elem IN SELECT value FROM jsonb_array_elements(p_breaks) AS t(value)
    LOOP
      BEGIN
        b_st := (elem->>'start_time')::time;
        b_en := (elem->>'end_time')::time;
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;
      END;
      IF b_st IS NOT NULL AND b_en IS NOT NULL AND b_st < b_en THEN
        br_s := v_base + b_st;
        br_e := v_base + b_en;
        IF NOT (v_en <= br_s OR v_st >= br_e) THEN
          RETURN false;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public._recurring_slot_fits_hours(
  time without time zone,
  integer,
  time without time zone,
  time without time zone,
  jsonb,
  time without time zone,
  time without time zone
) IS 'Internal: recurring slot start + duration fits inside business hours minus breaks.';

CREATE OR REPLACE FUNCTION public.materialize_recurring_appointments_forward(p_horizon_days integer DEFAULT 42)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
  r record;
  d date;
  i int;
  v_has_bh boolean;
  v_delta int;
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
  IF p_horizon_days IS NULL OR p_horizon_days < 1 THEN
    p_horizon_days := 42;
  END IF;

  v_today := (timezone('Asia/Jerusalem', now()))::date;

  FOR r IN
    SELECT *
    FROM public.recurring_appointments
    WHERE business_id IS NOT NULL
      AND day_of_week IS NOT NULL
      AND slot_time IS NOT NULL
  LOOP
    v_interval := GREATEST(1, COALESCE(r.repeat_interval, 1));
    -- EXTRACT(DOW): Sunday=0 .. Saturday=6 (same as JavaScript getDay)
    v_delta := (r.day_of_week - EXTRACT(DOW FROM v_today)::int + 7) % 7;
    v_first := v_today + v_delta;
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
            duration_minutes = COALESCE(v_duration, duration_minutes)
          WHERE id = apt.id
            AND COALESCE(is_available, true) = true;
          GET DIAGNOSTICS v_upd = ROW_COUNT;
          v_rows := v_rows + v_upd;
        END IF;
        -- If already booked by someone else, do not overwrite
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
  END LOOP;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.materialize_recurring_appointments_forward(integer) IS
  'Books concrete appointments from recurring_appointments for the next p_horizon_days (default 42). Calendar: Asia/Jerusalem.';

REVOKE ALL ON FUNCTION public._recurring_slot_fits_hours(
  time without time zone,
  integer,
  time without time zone,
  time without time zone,
  jsonb,
  time without time zone,
  time without time zone
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.materialize_recurring_appointments_forward(integer) FROM PUBLIC;

DO $$
DECLARE
  jid int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO jid FROM cron.job WHERE jobname = 'materialize_recurring_appointments_nightly' LIMIT 1;
    IF jid IS NOT NULL THEN
      PERFORM cron.unschedule(jid);
    END IF;
    PERFORM cron.schedule(
      'materialize_recurring_appointments_nightly',
      '0 22 * * *',
      'SELECT public.materialize_recurring_appointments_forward(42)'
    );
  END IF;
END;
$$;
