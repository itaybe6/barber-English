-- vat_exempt was used for local receipt PDFs; receipt flow removed from app.
ALTER TABLE public.business_profile
  DROP COLUMN IF EXISTS vat_exempt;
