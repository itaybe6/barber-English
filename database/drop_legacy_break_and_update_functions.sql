-- Drop legacy break column and update DB functions to avoid referencing it
-- Run after migrate_break_to_json.sql

BEGIN;

-- 1) Update function generate_time_slots_for_date to stop using business_profile.break
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

  -- Legacy global break removed; per-user breaks are handled in app logic.
  global_break_minutes := 0;

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
END;
$$;

-- 2) Safe drop of legacy column now that function no longer references it
ALTER TABLE business_profile
  DROP COLUMN IF EXISTS break;

COMMIT;

-- Optional helpers: set/get per-user break in SQL (can be used from RPC if desired)
-- SELECT public.set_break_minutes_for_user('<business_id>', '<user_id>', 15);
CREATE OR REPLACE FUNCTION public.set_break_minutes_for_user(p_business_id uuid, p_user_id uuid, p_minutes int)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE business_profile
  SET break_by_user = COALESCE(break_by_user, '{}'::jsonb) || jsonb_build_object(p_user_id::text, GREATEST(0, LEAST(180, p_minutes)))
  WHERE id = p_business_id;
$$;

-- SELECT public.get_break_minutes_for_user('<business_id>', '<user_id>');
CREATE OR REPLACE FUNCTION public.get_break_minutes_for_user(p_business_id uuid, p_user_id uuid)
RETURNS int
LANGUAGE sql
AS $$
  SELECT COALESCE((break_by_user ->> p_user_id::text)::int, 0)
  FROM business_profile
  WHERE id = p_business_id;
$$;


