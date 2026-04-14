-- Sequential local receipt (kabala 320) numbers per business; incremented atomically for PDF receipts.

ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS local_kabala_last_serial integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.business_profile.local_kabala_last_serial IS
  'Last issued local PDF receipt serial for this tenant; incremented via next_local_kabala_receipt_serial().';

CREATE OR REPLACE FUNCTION public.next_local_kabala_receipt_serial()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid uuid;
  ut text;
  v_serial integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'next_local_kabala_not_authenticated';
  END IF;

  SELECT u.business_id, u.user_type
  INTO bid, ut
  FROM public.users u
  WHERE u.id = auth.uid();

  IF bid IS NULL THEN
    RAISE EXCEPTION 'next_local_kabala_user_not_found';
  END IF;

  IF ut IS NULL OR ut NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'next_local_kabala_forbidden';
  END IF;

  UPDATE public.business_profile bp
  SET local_kabala_last_serial = COALESCE(bp.local_kabala_last_serial, 0) + 1
  WHERE bp.id = bid
  RETURNING bp.local_kabala_last_serial INTO v_serial;

  IF v_serial IS NULL THEN
    RAISE EXCEPTION 'next_local_kabala_business_not_found';
  END IF;

  RETURN v_serial;
END;
$$;

REVOKE ALL ON FUNCTION public.next_local_kabala_receipt_serial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_local_kabala_receipt_serial() TO authenticated;
