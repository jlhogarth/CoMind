BEGIN;

DO $$
DECLARE
  v_project_id uuid;
  v_work_item_id uuid;
  v_rows integer;
  v_state text;
  v_source_ref text;
  v_terminal boolean;
  v_evidence jsonb;
BEGIN
  INSERT INTO comind_pm.pm_projects(project_key, name, owner, source_system, source_ref)
  VALUES ('HUD-REAL-001-CI', 'HUD real activity verification', 'CI', 'github', 'https://github.com/jlhogarth/CoMind/issues/358')
  RETURNING id INTO v_project_id;

  INSERT INTO comind_pm.pm_work_items(
    work_key, project_id, title, status, owner, canonical_source, current_summary
  )
  VALUES (
    'HUD-REAL-001-CI', v_project_id, 'Verify real Activity HUD projection', 'review', 'CI', 'github',
    'Synthetic verifier row inside a rolled-back transaction.'
  )
  RETURNING id INTO v_work_item_id;

  INSERT INTO comind_pm.pm_events(
    project_id, work_item_id, event_type, actor, actor_type, source_system, source_ref,
    summary, status_to, outcome, consequential, occurred_at
  )
  VALUES (
    v_project_id, v_work_item_id, 'verification', 'Operator Console CI', 'system', 'github',
    'https://github.com/jlhogarth/CoMind/issues/358',
    'HUD-REAL-001 verification event.', 'review', 'pending', false, now()
  );

  INSERT INTO comind.cm_operator_console_read_capability(
    capability_name, capability_sha256, enabled
  )
  VALUES (
    'activity_hud_v1',
    encode(extensions.digest('hud-real-001-ci-capability-0000000000000000', 'sha256'), 'hex'),
    true
  );

  BEGIN
    PERFORM * FROM public.operator_console_activity_feed('wrong-capability-000000000000000000000000', 'operational', 10);
    RAISE EXCEPTION 'Wrong Activity HUD capability unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*)
  INTO v_rows
  FROM public.operator_console_activity_feed(
    'hud-real-001-ci-capability-0000000000000000', 'operational', 1000
  )
  WHERE activity_key = 'HUD-REAL-001-CI';

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Expected one operational HUD verification row, got %', v_rows;
  END IF;

  SELECT hud_state, source_ref, has_terminal_source_evidence, last_evidence
  INTO STRICT v_state, v_source_ref, v_terminal, v_evidence
  FROM public.operator_console_activity_feed(
    'hud-real-001-ci-capability-0000000000000000', 'operational', 1000
  )
  WHERE activity_key = 'HUD-REAL-001-CI';

  IF v_state <> 'awaiting_review' THEN
    RAISE EXCEPTION 'Expected review status to map to awaiting_review, got %', v_state;
  END IF;
  IF v_source_ref <> 'https://github.com/jlhogarth/CoMind/issues/358' THEN
    RAISE EXCEPTION 'Canonical source reference was not preserved: %', v_source_ref;
  END IF;
  IF v_terminal THEN
    RAISE EXCEPTION 'Review work must not be projected as terminal';
  END IF;
  IF (v_evidence ->> 'work_key') <> 'HUD-REAL-001-CI'
     OR NOT (v_evidence ? 'event_id')
     OR (v_evidence ? 'details')
     OR (v_evidence ? 'evidence') THEN
    RAISE EXCEPTION 'Safe evidence projection is incomplete or leaked raw event payload: %', v_evidence;
  END IF;

  UPDATE comind_pm.pm_work_items
  SET status = 'done', updated_at = now(), last_event_at = now()
  WHERE id = v_work_item_id;

  INSERT INTO comind_pm.pm_events(
    project_id, work_item_id, event_type, actor, actor_type, source_system, source_ref,
    summary, status_from, status_to, outcome, consequential, occurred_at
  )
  VALUES (
    v_project_id, v_work_item_id, 'status_change', 'Operator Console CI', 'system', 'github',
    'https://github.com/jlhogarth/CoMind/issues/358',
    'HUD-REAL-001 verification reached terminal state.', 'review', 'done', 'complete', false, now()
  );

  SELECT hud_state, has_terminal_source_evidence
  INTO STRICT v_state, v_terminal
  FROM public.operator_console_activity_feed(
    'hud-real-001-ci-capability-0000000000000000', 'operational', 1000
  )
  WHERE activity_key = 'HUD-REAL-001-CI';

  IF v_state <> 'completed' OR NOT v_terminal THEN
    RAISE EXCEPTION 'Done work did not project as completed terminal evidence: %, %', v_state, v_terminal;
  END IF;

  IF has_schema_privilege('anon', 'comind_pm', 'USAGE') THEN
    RAISE EXCEPTION 'anon must not receive comind_pm schema usage';
  END IF;
  IF has_table_privilege('anon', 'comind_pm.v_operator_console_activity', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not select the internal operational projection directly';
  END IF;
  IF has_table_privilege('anon', 'comind.cm_operator_console_read_capability', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not read capability hashes';
  END IF;
  IF NOT has_function_privilege('anon', 'public.operator_console_activity_feed(text,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon requires only the capability-gated Activity HUD RPC execute grant';
  END IF;

  SELECT count(*) INTO v_rows
  FROM public.operator_console_activity_feed(
    'hud-real-001-ci-capability-0000000000000000', 'operational', 1
  );
  IF v_rows > 1 THEN
    RAISE EXCEPTION 'Activity HUD RPC exceeded requested bound: %', v_rows;
  END IF;
END;
$$;

ROLLBACK;
