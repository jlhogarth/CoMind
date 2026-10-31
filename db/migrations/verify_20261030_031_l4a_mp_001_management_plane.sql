BEGIN;

DO $$
DECLARE
  v_snapshot jsonb;
  v_proc record;
BEGIN
  IF has_function_privilege('public', 'public.operator_console_l4a_management_plane()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC must not execute management-plane RPC';
  END IF;
  IF has_function_privilege('anon', 'public.operator_console_l4a_management_plane()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute management-plane RPC';
  END IF;
  IF has_function_privilege('authenticated', 'public.operator_console_l4a_management_plane()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute management-plane RPC';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.operator_console_l4a_management_plane()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute management-plane RPC';
  END IF;
  IF has_schema_privilege('anon', 'comind_pm', 'USAGE') THEN
    RAISE EXCEPTION 'anon must not receive comind_pm schema usage';
  END IF;

  SELECT p.prosecdef, p.proconfig
  INTO v_proc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='operator_console_l4a_management_plane';

  IF NOT v_proc.prosecdef THEN
    RAISE EXCEPTION 'management-plane RPC must be SECURITY DEFINER';
  END IF;
  IF v_proc.proconfig IS NULL OR NOT ('search_path=pg_catalog, public' = ANY(v_proc.proconfig)) THEN
    RAISE EXCEPTION 'management-plane RPC must pin search_path';
  END IF;

  SELECT public.operator_console_l4a_management_plane() INTO v_snapshot;
  IF jsonb_typeof(v_snapshot -> 'lanes') <> 'array' THEN RAISE EXCEPTION 'lanes must be array'; END IF;
  IF jsonb_typeof(v_snapshot -> 'blockers') <> 'array' THEN RAISE EXCEPTION 'blockers must be array'; END IF;
  IF jsonb_typeof(v_snapshot -> 'controllers') <> 'array' THEN RAISE EXCEPTION 'controllers must be array'; END IF;
  IF jsonb_array_length(v_snapshot -> 'lanes') > 200 THEN RAISE EXCEPTION 'lane bound exceeded'; END IF;
  IF jsonb_array_length(v_snapshot -> 'blockers') > 200 THEN RAISE EXCEPTION 'blocker bound exceeded'; END IF;
  IF jsonb_array_length(v_snapshot -> 'controllers') > 10 THEN RAISE EXCEPTION 'controller bound exceeded'; END IF;
  IF (v_snapshot::text) ~* '"(access_token|refresh_token|password|api_key|client_secret|service_role_key|authorization_header)"[[:space:]]*:' THEN
    RAISE EXCEPTION 'credential-like key leaked into management-plane snapshot';
  END IF;
END;
$$;

ROLLBACK;
