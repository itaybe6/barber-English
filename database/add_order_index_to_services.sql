-- Add order_index column to services table
-- Run this in your Supabase SQL editor

-- Add order_index column to services table
ALTER TABLE services 
  ADD COLUMN IF NOT EXISTS order_index INTEGER DEFAULT 0;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_services_order_index ON services(order_index);

-- Update existing services to have order_index based on their current order
-- This will set order_index to 0, 1, 2, etc. based on the current order
UPDATE services 
SET order_index = subquery.row_number - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) as row_number
  FROM services
) AS subquery
WHERE services.id = subquery.id;
