-- Optional flag for עוסק פטור (VAT-exempt) — used by local receipt (320) and future tax UI.
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS vat_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.business_profile.vat_exempt IS
  'When true, business is VAT-exempt (עוסק פטור); local receipts omit VAT split.';
