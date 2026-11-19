-- Rollback-only Test verification against real recorded AGCOL evidence.
BEGIN;
DO $$
DECLARE
  v_secret text := 'synthetic-agcol-evidence-verifier-20261119';
  v_payload jsonb;
  v_item jsonb;
BEGIN
  IF NOT has_function_privilege('anon', 'public.operator_console_agcol_work(text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.operator_console_agcol_work(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Evidence projection grants invalid';
  END IF;
  BEGIN
    PERFORM public.operator_console_agcol_work('synthetic-wrong-agent-work-capability-20261119');
    RAISE EXCEPTION 'Wrong capability accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE comind.cm_operator_console_read_capability SET
    capability_sha256 = encode(extensions.digest(v_secret, 'sha256'), 'hex'),
    enabled = true, expires_at = NULL
  WHERE capability_name = 'l4a_management_v1';
  IF NOT FOUND THEN RAISE EXCEPTION 'Existing Test capability binding absent'; END IF;
  v_payload := public.operator_console_agcol_work(v_secret);
  IF v_payload ->> 'schema_version' <> 'comind.agcol-003.operator-work.v2'
    OR v_payload ->> 'always_running' <> 'false'
    OR jsonb_array_length(v_payload -> 'work') < 3
    OR v_payload::text LIKE '%lease_token%'
    OR v_payload::text LIKE '%inputFingerprint%'
    OR v_payload::text LIKE '%resultPayload%' THEN
    RAISE EXCEPTION 'Evidence projection version, bound, or privacy invalid';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_payload -> 'work') LOOP
    IF jsonb_typeof(v_item -> 'progress_events') <> 'array'
      OR jsonb_array_length(v_item -> 'progress_events') > 16 THEN
      RAISE EXCEPTION 'Unbounded or missing progress history';
    END IF;
    IF v_item -> 'result_proof' <> 'null'::jsonb AND
      (v_item -> 'result_proof' ->> 'resource' IS DISTINCT FROM v_item ->> 'target_ref'
       OR v_item -> 'result_proof' ->> 'source' <> 'isolated_fixture'
       OR v_item -> 'result_proof' ->> 'status' <> 'succeeded') THEN
      RAISE EXCEPTION 'Tool proof mismatched canonical task';
    END IF;
  END LOOP;
END;
$$;
ROLLBACK;
