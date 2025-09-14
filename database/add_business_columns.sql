-- Add business_id and barber_id columns to appointments table
-- Run this in your Supabase SQL editor

-- Add business_id column to appointments table
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS business_id UUID;

-- Add barber_id column to appointments table  
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS barber_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add duration_minutes column to appointments table
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;

-- Add status column to appointments table
ALTER TABLE appointments 
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending', 'cancelled', 'completed', 'no_show'));

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_appointments_business_id ON appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_appointments_barber_id ON appointments(barber_id);
CREATE INDEX IF NOT EXISTS idx_appointments_duration ON appointments(duration_minutes);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Add business_id column to other tables that need it
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE services 
  ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE business_hours 
  ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE business_constraints 
  ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE waitlist_entries 
  ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE notifications 
  ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE designs 
  ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE recurring_appointments 
  ADD COLUMN IF NOT EXISTS business_id UUID;

ALTER TABLE business_profile 
  ADD COLUMN IF NOT EXISTS business_id UUID;

-- Add indexes for business_id columns
CREATE INDEX IF NOT EXISTS idx_users_business_id ON users(business_id);
CREATE INDEX IF NOT EXISTS idx_services_business_id ON services(business_id);
CREATE INDEX IF NOT EXISTS idx_business_hours_business_id ON business_hours(business_id);
CREATE INDEX IF NOT EXISTS idx_business_constraints_business_id ON business_constraints(business_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_entries_business_id ON waitlist_entries(business_id);
CREATE INDEX IF NOT EXISTS idx_notifications_business_id ON notifications(business_id);
CREATE INDEX IF NOT EXISTS idx_designs_business_id ON designs(business_id);
CREATE INDEX IF NOT EXISTS idx_recurring_appointments_business_id ON recurring_appointments(business_id);
CREATE INDEX IF NOT EXISTS idx_business_profile_business_id ON business_profile(business_id);


