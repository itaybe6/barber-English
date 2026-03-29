-- Fix 401 from birthday-notifications: normalize vault JWT (trim / optional "Bearer " prefix),
-- and send apikey header (Supabase Edge expects it alongside Authorization for service_role).

CREATE OR REPLACE FUNCTION public.invoke_birthday_notifications_edge()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  svc_jwt text;
  endpoint constant text := 'https://vqstsrobzbykfivlahxa.supabase.co/functions/v1/birthday-notifications';
BEGIN
  SELECT ds.decrypted_secret
  INTO svc_jwt
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'notification_edge_invoke_jwt'
  LIMIT 1;

  IF svc_jwt IS NULL OR btrim(svc_jwt) = '' THEN
    RAISE WARNING 'invoke_birthday_notifications_edge: add vault secret notification_edge_invoke_jwt';
    RETURN;
  END IF;

  svc_jwt := btrim(svc_jwt);
  IF lower(left(svc_jwt, 7)) = 'bearer ' THEN
    svc_jwt := btrim(substr(svc_jwt, 8));
  END IF;

  PERFORM net.http_post(
    endpoint,
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_jwt,
      'apikey', svc_jwt
    ),
    30000
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_birthday_notifications_edge() IS
  'POST birthday-notifications with Authorization + apikey (service_role JWT from vault notification_edge_invoke_jwt).';
