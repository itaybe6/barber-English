-- Update the generate_time_slots_for_date function to include barber_id
-- Run this in your Supabase SQL editor

-- Update the function to include barber_id in recurring appointments
CREATE OR REPLACE FUNCTION public.generate_time_slots_for_date(target_date DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  dow INT;
  bh RECORD;
  dur INT;
  global_break_minutes INT;
  t TIME;
  within_break BOOLEAN;
BEGIN
  dow := EXTRACT(DOW FROM target_date);

  SELECT * INTO bh FROM business_hours 
  WHERE day_of_week = dow AND is_active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    DELETE FROM appointments 
    WHERE slot_date = target_date AND is_available = TRUE;
    RETURN;
  END IF;

  dur := COALESCE(bh.slot_duration_minutes, 60);

  -- Fetch global break (minutes) from latest business_profile row; default 0
  SELECT COALESCE(bp.break, 0)
  INTO global_break_minutes
  FROM business_profile bp
  ORDER BY bp.created_at DESC
  LIMIT 1;

  -- Remove only available slots to keep booked ones
  DELETE FROM appointments 
  WHERE slot_date = target_date AND is_available = TRUE;

  t := bh.start_time;
  WHILE t < bh.end_time LOOP
    within_break := FALSE;

    -- legacy single break window
    IF bh.break_start_time IS NOT NULL AND bh.break_end_time IS NOT NULL THEN
      IF t >= bh.break_start_time AND t < bh.break_end_time THEN
        within_break := TRUE;
      END IF;
    END IF;

    -- check JSONB breaks
    IF NOT within_break AND bh.breaks IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(bh.breaks) AS b
        WHERE t >= (b->>'start_time')::time
          AND t <  (b->>'end_time')::time
      ) INTO within_break;
    END IF;

    -- check date-specific business constraints (t inside any constraint window)
    IF NOT within_break THEN
      SELECT EXISTS (
        SELECT 1
        FROM business_constraints bc
        WHERE bc.date = target_date
          AND t >= bc.start_time
          AND t < bc.end_time
      ) INTO within_break;
    END IF;

    IF NOT within_break THEN
      INSERT INTO appointments (slot_date, slot_time, is_available)
      SELECT target_date, t, TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM appointments 
        WHERE slot_date = target_date AND slot_time = t
      );
    END IF;

    t := (t + make_interval(mins => dur + COALESCE(global_break_minutes, 0)))::time;
  END LOOP;

  -- Assign recurring appointments for this date
  -- 1) Update existing available slots to be booked for the recurring client
  UPDATE appointments s
  SET is_available = FALSE,
      client_name = r.client_name,
      client_phone = r.client_phone,
      service_name = r.service_name,
      service_id = r.service_id,  -- Add service_id
      user_id = r.user_id,
      barber_id = r.user_id,  -- Add barber_id
      updated_at = NOW()
  FROM recurring_appointments r
  WHERE s.slot_date = target_date
    AND s.slot_time = r.slot_time
    AND s.is_available = TRUE
    AND r.day_of_week = dow
    AND (r.start_date IS NULL OR r.start_date <= target_date)
    AND (r.end_date IS NULL OR r.end_date >= target_date);

  -- 2) Insert booked slots for recurring clients that don't have a slot yet (e.g., outside generated windows is skipped)
  INSERT INTO appointments (slot_date, slot_time, is_available, client_name, client_phone, service_name, service_id, user_id, barber_id)
  SELECT target_date, r.slot_time, FALSE, r.client_name, r.client_phone, r.service_name, r.service_id, r.user_id, r.user_id
  FROM recurring_appointments r
  WHERE r.day_of_week = dow
    AND (r.start_date IS NULL OR r.start_date <= target_date)
    AND (r.end_date IS NULL OR r.end_date >= target_date)
    AND NOT EXISTS (
      SELECT 1 FROM appointments s
      WHERE s.slot_date = target_date
        AND s.slot_time = r.slot_time
    );
END;
$$;
