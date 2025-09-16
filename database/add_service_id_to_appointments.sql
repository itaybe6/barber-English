-- Add service_id column to appointments table
-- Run this in your Supabase SQL editor

-- Add service_id column to appointments table
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON appointments(service_id);

-- Add service_id column to recurring_appointments table as well
ALTER TABLE recurring_appointments 
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL;

-- Add index for recurring_appointments service_id
CREATE INDEX IF NOT EXISTS idx_recurring_appointments_service_id ON recurring_appointments(service_id);
