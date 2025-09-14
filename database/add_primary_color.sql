-- Add primary_color column to business_profile table
-- This will allow each business to have their own primary color for buttons and UI elements

ALTER TABLE business_profile 
ADD COLUMN primary_color VARCHAR(7) DEFAULT '#000000';

-- Add comment to explain the column
COMMENT ON COLUMN business_profile.primary_color IS 'Primary color for the business UI (hex color code, e.g., #FF5733)';

-- Update existing records to have a default black color if they don't have one
UPDATE business_profile 
SET primary_color = '#000000' 
WHERE primary_color IS NULL;
