-- CE-004 acceptance proof for Friction and Failure Register workflows.
-- Synthetic, transaction-bounded, and intended for PostgreSQL 17 exact-head CI.

BEGIN;

DO $$
DECLARE
  v_project uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_friction_1 uuid;
  v_failure_1 uuid;
  v_failure_2 uuid;
  v_similar_without_pattern uuid;
  v_non_register uuid;
  v_triage_event uuid;
  v_replay_event uuid;
  v_count bigint;
  v_state text;
  v_pattern_count bigint;
  v_recommend boolean;
  v_improvement uuid;
BEGIN
  SELECT comind.record_ce_signal(
    v_project,NULL,NULL,'friction','moderate',true,
    'Synthetic repeated workflow friction','{"fixture":"ce-004","case":1}'::jsonb,
    'continuous_excellence','ce004://friction/1','ce004-friction-1','2026-10-30T10:00:00Z'
  ) INTO v_friction_1;

  SELECT comind.record_ce_signal(
    v_project,NULL,NULL,'failure','high',true,
    'Synthetic repeated workflow failure','{"fixture":"ce-004","case":2}'::jsonb,
    'continuous_excellence','ce004://failure/1','ce004-failure-1','2026-10-30T10:01:00Z'
  ) INTO v_failure_1;

  SELECT comind.record_ce_signal(
    v_project,NULL,NULL,'failure','moderate',true,
    'Synthetic second failure in explicit pattern','{"fixture":"ce-004","case":3}'::jsonb,
    'continuous_excellence','ce004://failure/2','ce004-failure-2','2026-10-30T10:02:00Z'
  ) INTO v_failure_2;

  SELECT comind.record_ce_signal(
    v_project,NULL,NULL,'failure','moderate',true,
    'Synthetic repeated workflow failure','{"fixture":"ce-004","case":4}'::jsonb,
    'continuous_excellence','ce004://failure/no-pattern','ce004-failure-no-pattern','2026-10-30T10:03:00Z'
  ) INTO v_similar_without_pattern;

  SELECT comind.record_ce_signal(
    v_project,NULL,NULL,'missingness','moderate',true,
    'Synthetic non-register signal','{"fixture":"ce-004","case":5}'::jsonb,
    'continuous_excellence','ce004://missingness','ce004-missingness','2026-10-30T10:04:00Z'
  ) INTO v_non_register;

  SELECT current_state INTO v_state
  FROM comind.v_ce_friction_failure_register
  WHERE signal_id=v_friction_1;
  IF v_state IS DISTINCT FROM 'untriaged' THEN
    RAISE EXCEPTION 'Historical friction/failure signal must project as untriaged, got %',v_state;
  END IF;

  BEGIN
    PERFORM comind.record_ce_signal_event(
      v_non_register,NULL,NULL,'triaged','moderate','pattern-x',
      'Must reject non-register signal','{}'::jsonb,
      'continuous_excellence','ce004://reject/non-register','reject-non-register'
    );
    RAISE EXCEPTION 'Non-friction/failure signal unexpectedly accepted CE-004 lifecycle event';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM comind.record_ce_signal_event(
      v_friction_1,NULL,NULL,'diagnosed','moderate','pattern-explicit',
      'Diagnosis before triage must fail','{}'::jsonb,
      'continuous_excellence','ce004://reject/pre-triage','reject-pre-triage'
    );
    RAISE EXCEPTION 'Diagnosis before triage unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM comind.record_ce_signal_event(
      v_friction_1,NULL,NULL,'triaged',NULL,'pattern-explicit',
      'Triage without recurrence risk must fail','{}'::jsonb,
      'continuous_excellence','ce004://reject/no-risk','reject-no-risk'
    );
    RAISE EXCEPTION 'Triage without recurrence risk unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT comind.record_ce_signal_event(
    v_friction_1,NULL,NULL,'triaged','moderate','pattern-explicit',
    'Triaged explicit recurring friction','{"basis":"synthetic acceptance"}'::jsonb,
    'continuous_excellence','ce004://triage/friction-1','triage-friction-1'
  ) INTO v_triage_event;

  SELECT comind.record_ce_signal_event(
    v_friction_1,NULL,NULL,'triaged','moderate','pattern-explicit',
    'Triaged explicit recurring friction','{"basis":"synthetic acceptance"}'::jsonb,
    'continuous_excellence','ce004://triage/friction-1','triage-friction-1'
  ) INTO v_replay_event;
  IF v_triage_event <> v_replay_event THEN
    RAISE EXCEPTION 'Lifecycle idempotent replay returned a different event';
  END IF;

  BEGIN
    PERFORM comind.record_ce_signal_event(
      v_friction_1,NULL,NULL,'triaged','high','pattern-explicit',
      'Conflicting replay','{}'::jsonb,
      'continuous_excellence','ce004://triage/friction-1','triage-friction-1'
    );
    RAISE EXCEPTION 'Conflicting lifecycle replay unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  PERFORM comind.record_ce_signal_event(
    v_friction_1,NULL,NULL,'diagnosed','moderate','pattern-explicit',
    'Diagnosed recurring workflow boundary','{"diagnosis":"explicit synthetic pattern"}'::jsonb,
    'continuous_excellence','ce004://diagnosis/friction-1','diagnose-friction-1'
  );

  PERFORM comind.record_ce_signal_event(
    v_failure_1,NULL,NULL,'triaged','high','pattern-explicit',
    'Triaged first explicit-pattern failure','{}'::jsonb,
    'continuous_excellence','ce004://triage/failure-1','triage-failure-1'
  );

  PERFORM comind.record_ce_signal_event(
    v_failure_2,NULL,NULL,'triaged','moderate','pattern-explicit',
    'Triaged second explicit-pattern failure','{}'::jsonb,
    'continuous_excellence','ce004://triage/failure-2','triage-failure-2'
  );

  PERFORM comind.record_ce_signal_event(
    v_similar_without_pattern,NULL,NULL,'triaged','moderate',NULL,
    'Similar prose intentionally has no explicit pattern identity','{}'::jsonb,
    'continuous_excellence','ce004://triage/no-pattern','triage-no-pattern'
  );

  SELECT pattern_occurrence_count, improvement_review_recommended
  INTO v_pattern_count,v_recommend
  FROM comind.v_ce_friction_failure_register
  WHERE signal_id=v_failure_1;
  IF v_pattern_count <> 3 OR NOT v_recommend THEN
    RAISE EXCEPTION 'Explicit recurrence expected count=3 and recommendation=true, got count=% recommend=%',v_pattern_count,v_recommend;
  END IF;

  SELECT pattern_occurrence_count INTO v_pattern_count
  FROM comind.v_ce_friction_failure_register
  WHERE signal_id=v_similar_without_pattern;
  IF v_pattern_count <> 0 THEN
    RAISE EXCEPTION 'Similar prose without pattern key was incorrectly grouped';
  END IF;

  INSERT INTO comind.cm_ce_improvement(project_id,title,category,rationale)
  VALUES (v_project,'Synthetic CE-004 linked improvement','test','Proves existing improvement linkage suppresses duplicate recommendation.')
  RETURNING improvement_id INTO v_improvement;
  INSERT INTO comind.cm_ce_improvement_signal(improvement_id,signal_id)
  VALUES (v_improvement,v_failure_1);

  SELECT improvement_review_recommended INTO v_recommend
  FROM comind.v_ce_friction_failure_register
  WHERE signal_id=v_failure_1;
  IF v_recommend THEN
    RAISE EXCEPTION 'Linked improvement did not suppress duplicate improvement recommendation';
  END IF;

  BEGIN
    PERFORM comind.record_ce_signal_event(
      v_failure_2,NULL,NULL,'closed_no_action','moderate','pattern-explicit',
      'No-action closure without provenance must fail','{"disposition_reason":"synthetic"}'::jsonb,
      'continuous_excellence',NULL,'close-no-source'
    );
    RAISE EXCEPTION 'No-action closure without source_ref unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM comind.record_ce_signal_event(
    v_failure_2,NULL,NULL,'closed_no_action','moderate','pattern-explicit',
    'No durable control warranted after bounded review','{"disposition_reason":"isolated bounded fixture"}'::jsonb,
    'continuous_excellence','ce004://disposition/failure-2','close-failure-2'
  );

  SELECT current_state,open_action INTO v_state,v_recommend
  FROM comind.v_ce_friction_failure_register
  WHERE signal_id=v_failure_2;
  IF v_state <> 'closed_no_action' OR v_recommend THEN
    RAISE EXCEPTION 'Terminal no-action state projection is incorrect';
  END IF;

  BEGIN
    PERFORM comind.record_ce_signal_event(
      v_failure_2,NULL,NULL,'diagnosed','moderate','pattern-explicit',
      'Terminal state cannot diagnose without reopen','{}'::jsonb,
      'continuous_excellence','ce004://reject/terminal-diagnosis','terminal-diagnosis'
    );
    RAISE EXCEPTION 'Terminal signal unexpectedly resumed without reopen';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM comind.record_ce_signal_event(
    v_failure_2,NULL,NULL,'reopened','moderate','pattern-explicit',
    'Reopened after new reviewed evidence','{}'::jsonb,
    'continuous_excellence','ce004://reopen/failure-2','reopen-failure-2'
  );
  SELECT current_state INTO v_state FROM comind.v_ce_friction_failure_register WHERE signal_id=v_failure_2;
  IF v_state <> 'reopened' THEN RAISE EXCEPTION 'Reopen state was not projected'; END IF;

  -- Existing CE-001 backlog semantics intentionally remain independent of CE-004 lifecycle.
  SELECT count(*) INTO v_count FROM comind.v_ce_signal_backlog WHERE signal_id=v_similar_without_pattern;
  IF v_count <> 1 THEN RAISE EXCEPTION 'CE-004 changed legacy v_ce_signal_backlog behavior'; END IF;

  BEGIN
    UPDATE comind.cm_ce_signal_event SET summary='forbidden' WHERE event_id=v_triage_event;
    RAISE EXCEPTION 'CE-004 event UPDATE unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Continuous Excellence history is append-only%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM comind.cm_ce_signal_event WHERE event_id=v_triage_event;
    RAISE EXCEPTION 'CE-004 event DELETE unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Continuous Excellence history is append-only%' THEN RAISE; END IF;
  END;

  IF has_table_privilege('anon','comind.cm_ce_signal_event','INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated','comind.cm_ce_signal_event','INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role','comind.cm_ce_signal_event','INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Direct CE-004 signal-event mutation privilege leaked to ordinary roles';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'comind.record_ce_signal_event(uuid,uuid,uuid,text,text,text,text,jsonb,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role lacks constrained CE-004 lifecycle function execution';
  END IF;
END
$$;

ROLLBACK;
