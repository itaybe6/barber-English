-- Add finance-related columns to business_profile
ALTER TABLE business_profile
  ADD COLUMN IF NOT EXISTS business_number text,
  ADD COLUMN IF NOT EXISTS accountant_email text;

-- Create business_expenses table
CREATE TABLE IF NOT EXISTS business_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('rent', 'supplies', 'equipment', 'marketing', 'other')),
  expense_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_expenses_business_month
  ON business_expenses (business_id, expense_date);
