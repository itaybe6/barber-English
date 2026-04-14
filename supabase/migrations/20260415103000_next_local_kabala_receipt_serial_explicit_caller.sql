-- App uses custom phone/password auth (no Supabase Auth JWT) → auth.uid() is always NULL on RPC.
-- Replace with explicit business + caller user id; validate against public.users (same model as Edge functions).

DROP FUNCTION IF EXISTS public.next_local_kabala_receipt_serial();
DROP FUNCTION IF EXISTS public.next_local_kabala_receipt_serial(uuid, uuid);

CREATE OR REPLACE FUNCTION public.next_local_kabala_receipt_serial(
  p_business_id uuid,
  p_caller_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_serial integer;
  v_ok boolean;
BEGIN
  IF p_business_id IS NULL OR p_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'next_local_kabala_missing_args';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_caller_user_id
      AND u.business_id = p_business_id
      AND lower(trim(COALESCE(u.user_type::text, ''))) IN ('admin', 'super_admin')
  )
  INTO v_ok;

  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'next_local_kabala_forbidden';
  END IF;

  UPDATE public.business_profile bp
  SET local_kabala_last_serial = COALESCE(bp.local_kabala_last_serial, 0) + 1
  WHERE bp.id = p_business_id
  RETURNING bp.local_kabala_last_serial INTO v_serial;

  IF v_serial IS NULL THEN
    RAISE EXCEPTION 'next_local_kabala_business_not_found';
  END IF;

  RETURN v_serial;
END;
$$;

REVOKE ALL ON FUNCTION public.next_local_kabala_receipt_serial(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_local_kabala_receipt_serial(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.next_local_kabala_receipt_serial(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_local_kabala_receipt_serial(uuid, uuid) TO service_role;
