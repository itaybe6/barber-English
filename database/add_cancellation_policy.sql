-- Add cancellation policy column to business_profile table
-- This column stores the minimum hours before an appointment that cancellation is allowed

ALTER TABLE business_profile 
  ADD COLUMN IF NOT EXISTS min_cancellation_hours INT DEFAULT 24 CHECK (min_cancellation_hours >= 0 AND min_cancellation_hours <= 168);

-- Add comment to explain the column
COMMENT ON COLUMN business_profile.min_cancellation_hours IS 'Minimum hours before appointment that cancellation is allowed (0-168 hours = 0-7 days)';
