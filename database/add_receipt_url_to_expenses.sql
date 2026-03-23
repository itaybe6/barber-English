-- Add receipt_url to business_expenses for storing receipt/proof image URLs
ALTER TABLE business_expenses
  ADD COLUMN IF NOT EXISTS receipt_url text;
