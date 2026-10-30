BEGIN;

DO $$
DECLARE
  v_zero record;
  v_cap record;
BEGIN
  IF has_function_privilege('anon', 'public.operator_console_l4a_management_plane()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute zero-argument management-plane RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.operator_console_l4a_management_plane()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute zero-argument management-plane RPC';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.operator_console_l4a_management_plane()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain zero-argument management-plane execution';
  END IF;
  IF has_function_privilege('public', 'public.operator_console_l4a_management_plane(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute capability management-plane RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.operator_console_l4a_management_plane(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute capability management-plane RPC';
  END IF;
  IF NOT has_function_privilege('anon', 'public.operator_console_l4a_management_plane(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must execute capability wrapper so the server can use the publishable-key channel';
  END IF;

  SELECT p.prosecdef, p.proconfig INTO v_zero
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='operator_console_l4a_management_plane' AND p.pronargs=0;
  SELECT p.prosecdef, p.proconfig INTO v_cap
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='operator_console_l4a_management_plane' AND p.pronargs=1;

  IF NOT v_zero.prosecdef OR v_zero.proconfig IS NULL OR NOT ('search_path=pg_catalog, public' = ANY(v_zero.proconfig)) THEN
    RAISE EXCEPTION 'zero-argument management RPC security contract changed';
  END IF;
  IF NOT v_cap.prosecdef OR v_cap.proconfig IS NULL OR NOT ('search_path=pg_catalog, public, extensions' = ANY(v_cap.proconfig)) THEN
    RAISE EXCEPTION 'capability management RPC must be SECURITY DEFINER with pinned search_path';
  END IF;
END;
$$;

INSERT INTO comind.cm_operator_console_read_capability(capability_name, capability_sha256, enabled, expires_at, rotated_at)
VALUES (
  'l4a_management_v1',
  encode(extensions.digest('synthetic-l4a-management-verifier-capability-20261030', 'sha256'), 'hex'),
  true,
  NULL,
  now()
)
ON CONFLICT (capability_name) DO UPDATE SET
  capability_sha256=excluded.capability_sha256,
  enabled=true,
  expires_at=NULL,
  rotated_at=now();

SET LOCAL ROLE anon;
SELECT jsonb_typeof(public.operator_console_l4a_management_plane('synthetic-l4a-management-verifier-capability-20261030')) AS payload_type;
RESET ROLE;

DO $$
BEGIN
  BEGIN
    PERFORM public.operator_console_l4a_management_plane('synthetic-wrong-management-capability-20261030');
    RAISE EXCEPTION 'wrong capability unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

ROLLBACK;
