BEGIN;

CREATE OR REPLACE FUNCTION public.operator_console_l4a_management_plane(p_capability text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, extensions
AS $$
BEGIN
  IF p_capability IS NULL OR length(p_capability) < 32 THEN
    RAISE EXCEPTION 'Operator Console management capability denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM comind.cm_operator_console_read_capability c
    WHERE c.capability_name = 'l4a_management_v1'
      AND c.enabled
      AND (c.expires_at IS NULL OR c.expires_at > now())
      AND c.capability_sha256 = encode(extensions.digest(p_capability, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'Operator Console management capability denied' USING ERRCODE = '42501';
  END IF;

  RETURN public.operator_console_l4a_management_plane();
END;
$$;

COMMENT ON FUNCTION public.operator_console_l4a_management_plane(text) IS
  'Dedicated capability-gated L4A management-plane snapshot for the server-side Operator Console. Plaintext capability material is never stored in PostgreSQL.';

REVOKE ALL ON FUNCTION public.operator_console_l4a_management_plane(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.operator_console_l4a_management_plane(text) TO anon;

COMMIT;
