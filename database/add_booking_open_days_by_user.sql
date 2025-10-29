-- Add booking_open_days_by_user column to business_profile table
-- This allows each barber/admin to have their own booking window (in days)
-- Stored as JSON object: { "user_id": days, ... }

-- Add the new column if it doesn't exist
ALTER TABLE business_profile 
  ADD COLUMN IF NOT EXISTS booking_open_days_by_user JSONB DEFAULT '{}'::jsonb;

-- Create RPC functions for getting/setting per-user booking_open_days

-- Function to get booking_open_days for a specific user
CREATE OR REPLACE FUNCTION public.get_booking_open_days_for_user(
  p_business_id UUID,
  p_user_id TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days INT;
  v_default INT := 7;
BEGIN
  -- Try to get the per-user value from the JSON column
  SELECT COALESCE(
    (booking_open_days_by_user->>p_user_id)::INT,
    booking_open_days,
    v_default
  )
  INTO v_days
  FROM business_profile
  WHERE id = p_business_id
  LIMIT 1;

  RETURN COALESCE(v_days, v_default);
END;
$$;

-- Function to set booking_open_days for a specific user
CREATE OR REPLACE FUNCTION public.set_booking_open_days_for_user(
  p_business_id UUID,
  p_user_id TEXT,
  p_days INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate the days value (1-60)
  IF p_days < 1 OR p_days > 60 THEN
    RAISE EXCEPTION 'booking_open_days must be between 1 and 60';
  END IF;

  -- Update the JSON column with the new value
  UPDATE business_profile
  SET booking_open_days_by_user = COALESCE(booking_open_days_by_user, '{}'::jsonb) || 
                                   jsonb_build_object(p_user_id, p_days)
  WHERE id = p_business_id;
END;
$$;

-- Comment on the new column
COMMENT ON COLUMN business_profile.booking_open_days_by_user IS 'Per-user booking window in days. Format: {"user_id": days, ...}';

