\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_project_id uuid;
  v_signal_1 uuid;
  v_signal_2 uuid;
  v_capsule_1 uuid;
  v_capsule_2 uuid;
  v_improvement_id uuid;
  v_event_id uuid;
  v_version integer;
  v_predecessor uuid;
  v_hash_1 text;
  v_hash_2 text;
  v_count bigint;
  v_rls_enabled boolean;
  v_mutation_blocked boolean := false;
BEGIN
  SELECT project_id INTO v_project_id
  FROM comind.cm_project
  ORDER BY created_at, project_id
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'CE-001 verification requires at least one canonical project';
  END IF;

  SELECT c.relrowsecurity INTO v_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'comind' AND c.relname = 'cm_ce_signal';

  IF COALESCE(v_rls_enabled, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'CE-001 verification failed: cm_ce_signal RLS is not enabled';
  END IF;

  IF has_table_privilege('anon', 'comind.cm_ce_signal', 'SELECT')
     OR has_table_privilege('authenticated', 'comind.cm_ce_signal', 'SELECT') THEN
    RAISE EXCEPTION 'CE-001 verification failed: browser role can read private CE signals';
  END IF;

  IF has_table_privilege('anon', 'public.v_ce_operator_summary', 'SELECT')
     OR has_table_privilege('authenticated', 'public.v_ce_operator_summary', 'SELECT') THEN
    RAISE EXCEPTION 'CE-001 verification failed: browser role can read trusted CE operator summary';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.v_ce_operator_summary', 'SELECT') THEN
    RAISE EXCEPTION 'CE-001 verification failed: service role cannot read CE operator summary';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'comind.record_ce_signal(uuid,uuid,uuid,text,text,boolean,text,jsonb,text,text,text,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'CE-001 verification failed: service role cannot execute CE signal function';
  END IF;

  IF has_function_privilege(
    'anon',
    'comind.record_ce_signal(uuid,uuid,uuid,text,text,boolean,text,jsonb,text,text,text,timestamptz)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'comind.record_ce_signal(uuid,uuid,uuid,text,text,boolean,text,jsonb,text,text,text,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'CE-001 verification failed: browser role can execute CE signal function';
  END IF;

  v_signal_1 := comind.record_ce_signal(
    v_project_id,
    NULL,
    NULL,
    'recovery_interrupt',
    'moderate',
    true,
    'Verification recovery interrupt',
    '{"reason":"verification"}'::jsonb,
    'ce-001-verification',
    'verify_20261029_007',
    'ce-001-verification-idempotency',
    now()
  );

  v_signal_2 := comind.record_ce_signal(
    v_project_id,
    NULL,
    NULL,
    'recovery_interrupt',
    'moderate',
    true,
    'Verification recovery interrupt repeated',
    '{"reason":"verification-repeat"}'::jsonb,
    'ce-001-verification',
    'verify_20261029_007',
    'ce-001-verification-idempotency',
    now()
  );

  IF v_signal_1 IS DISTINCT FROM v_signal_2 THEN
    RAISE EXCEPTION 'CE-001 verification failed: idempotent signal capture created a second identity';
  END IF;

  SELECT count(*) INTO v_count
  FROM comind.cm_ce_signal
  WHERE project_id = v_project_id
    AND idempotency_key = 'ce-001-verification-idempotency';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CE-001 verification failed: expected one idempotent signal, found %', v_count;
  END IF;

  BEGIN
    UPDATE comind.cm_ce_signal
    SET summary = 'Mutation should fail'
    WHERE signal_id = v_signal_1;
  EXCEPTION WHEN OTHERS THEN
    v_mutation_blocked := true;
  END;

  IF NOT v_mutation_blocked THEN
    RAISE EXCEPTION 'CE-001 verification failed: signal history was mutable';
  END IF;

  v_capsule_1 := comind.capture_ce_continuity_capsule(
    v_project_id,
    NULL,
    'ce-001-verification',
    'Verify Continuity Capsule lineage and recovery state',
    '["capsule is durable","lineage is immutable"]'::jsonb,
    '["database assertions"]'::jsonb,
    '{"authority":"verification transaction"}'::jsonb,
    '{"baseline":"v1"}'::jsonb,
    '[{"system":"Supabase Test"}]'::jsonb,
    '[]'::jsonb,
    '["no production activation"]'::jsonb,
    'Signal idempotency verified',
    '["capture successor"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'Capture version 2',
    'ROLLBACK verification transaction',
    'ready',
    'verified',
    'ce-001-verification',
    'verify_20261029_007',
    NULL
  );

  v_capsule_2 := comind.capture_ce_continuity_capsule(
    v_project_id,
    NULL,
    'ce-001-verification',
    'Verify Continuity Capsule lineage and recovery state',
    '["capsule is durable","lineage is immutable"]'::jsonb,
    '["database assertions"]'::jsonb,
    '{"authority":"verification transaction"}'::jsonb,
    '{"baseline":"v2"}'::jsonb,
    '[{"system":"Supabase Test"}]'::jsonb,
    '["version 1 accepted as predecessor"]'::jsonb,
    '["no production activation"]'::jsonb,
    'Version 1 captured and verified',
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'Verification complete',
    'ROLLBACK verification transaction',
    'complete',
    'verified',
    'ce-001-verification',
    'verify_20261029_007',
    NULL
  );

  SELECT version, predecessor_capsule_id, content_hash
  INTO v_version, v_predecessor, v_hash_2
  FROM comind.cm_ce_continuity_capsule
  WHERE capsule_id = v_capsule_2;

  SELECT content_hash INTO v_hash_1
  FROM comind.cm_ce_continuity_capsule
  WHERE capsule_id = v_capsule_1;

  IF v_version <> 2 OR v_predecessor IS DISTINCT FROM v_capsule_1 THEN
    RAISE EXCEPTION 'CE-001 verification failed: version 2 lineage is incorrect';
  END IF;

  IF v_hash_1 = v_hash_2 OR length(v_hash_1) <> 64 OR length(v_hash_2) <> 64 THEN
    RAISE EXCEPTION 'CE-001 verification failed: capsule SHA-256 hashes are invalid or not content-sensitive';
  END IF;

  SELECT count(*) INTO v_count
  FROM comind.v_ce_current_continuity_capsule
  WHERE project_id = v_project_id
    AND capsule_key = 'ce-001-verification'
    AND capsule_id = v_capsule_2
    AND recovery_state = 'complete';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'CE-001 verification failed: current capsule projection did not resolve the lineage leaf';
  END IF;

  SELECT count(*) INTO v_count
  FROM comind.v_ce_current_continuity_capsule
  WHERE project_id = v_project_id
    AND capsule_key = 'ce-001-verification'
    AND capsule_id = v_capsule_1;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CE-001 verification failed: predecessor capsule still appears current';
  END IF;

  v_improvement_id := comind.open_ce_improvement(
    v_project_id,
    NULL,
    NULL,
    'Verification improvement',
    'test',
    'Verify signal-to-improvement lifecycle without mutating history',
    ARRAY[v_signal_1],
    NULL,
    'ce-001-verification',
    'verify_20261029_007'
  );

  v_event_id := comind.record_ce_improvement_event(
    v_improvement_id,
    NULL,
    'validated',
    'success',
    'Verification improvement validated',
    '{"transaction":"rollback"}'::jsonb,
    'ce-001-verification',
    'verify_20261029_007'
  );

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'CE-001 verification failed: improvement event did not return an identity';
  END IF;

  SELECT count(*) INTO v_count
  FROM comind.cm_ce_improvement_event
  WHERE improvement_id = v_improvement_id
    AND event_type IN ('proposed', 'validated');

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'CE-001 verification failed: expected proposed and validated lifecycle events, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM comind.v_ce_signal_backlog
  WHERE signal_id = v_signal_1;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'CE-001 verification failed: linked signal remained in the actionable backlog';
  END IF;

  RAISE NOTICE 'CE-001 foundation verification passed: RLS, grants, append-only history, idempotency, capsule lineage, hashes, lifecycle event presence, and signal linkage';
END;
$$;

ROLLBACK;
