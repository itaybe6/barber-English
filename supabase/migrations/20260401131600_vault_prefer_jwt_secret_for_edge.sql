-- Prefer JWT_SECRET over notification_edge_invoke_jwt when both exist.
-- Stale/wrong notification_edge_invoke_jwt was winning via COALESCE and caused 401
-- even after users stored the correct service_role JWT under JWT_SECRET.

CREATE OR REPLACE FUNCTION public.vault_service_role_jwt_for_edge()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  raw text;
BEGIN
  SELECT COALESCE(
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'JWT_SECRET' LIMIT 1),
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_edge_invoke_jwt' LIMIT 1)
  )
  INTO raw;

  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  raw := btrim(raw);
  IF raw = '' THEN
    RETURN NULL;
  END IF;

  IF lower(left(raw, 7)) = 'bearer ' THEN
    raw := btrim(substr(raw, 8));
  END IF;

  RETURN NULLIF(raw, '');
END;
$$;

COMMENT ON FUNCTION public.vault_service_role_jwt_for_edge() IS
  'Service role JWT for Authorization Bearer to Edge (pg_net). Vault: JWT_SECRET preferred, else notification_edge_invoke_jwt.';
