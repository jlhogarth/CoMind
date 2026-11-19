-- Rollback-only verification. A synthetic capability hash is visible only in this transaction.
BEGIN;
DO $$
DECLARE
  v_secret text := 'synthetic-agcol-work-verifier-20261112';
  v_payload jsonb;
BEGIN
  IF to_regprocedure('public.operator_console_agcol_work(text)') IS NULL THEN
    RAISE EXCEPTION 'AGCOL work RPC missing';
  END IF;
  IF NOT has_function_privilege('anon', 'public.operator_console_agcol_work(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.operator_console_agcol_work(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'AGCOL work RPC grants invalid';
  END IF;
  BEGIN
    PERFORM public.operator_console_agcol_work('synthetic-wrong-agent-work-capability-20261112');
    RAISE EXCEPTION 'Wrong capability accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM comind.cm_operator_console_read_capability
             WHERE capability_name = 'l4a_management_v1') THEN
    UPDATE comind.cm_operator_console_read_capability
       SET capability_sha256 = encode(extensions.digest(v_secret, 'sha256'), 'hex'), enabled = true,
           expires_at = NULL
     WHERE capability_name = 'l4a_management_v1';
    v_payload := public.operator_console_agcol_work(v_secret);
    IF v_payload ->> 'schema_version' <> 'comind.agcol-003.operator-work.v1'
       OR v_payload ->> 'activation_mode' <> 'bounded_test_invocation'
       OR v_payload ->> 'always_running' <> 'false'
       OR jsonb_typeof(v_payload -> 'work') <> 'array'
       OR v_payload::text LIKE '%lease_token%'
       OR v_payload::text LIKE '%inputFingerprint%' THEN
      RAISE EXCEPTION 'AGCOL work projection invalid or leaks private data';
    END IF;
  END IF;
END;
$$;
ROLLBACK;
