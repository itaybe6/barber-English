-- Add user_id to notifications to target a specific admin/manager
-- Run this in your Supabase SQL editor

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Optional: appointment_id reference for richer linking (safe if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'appointments'
  ) THEN
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS appointment_id UUID;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_appointment_id ON notifications(appointment_id);


