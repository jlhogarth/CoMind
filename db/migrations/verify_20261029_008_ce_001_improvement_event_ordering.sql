\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_project_id uuid;
  v_improvement_id uuid;
  v_event_1 uuid;
  v_event_2 uuid;
  v_ordinal_1 bigint;
  v_ordinal_2 bigint;
  v_current_event uuid;
  v_current_state text;
BEGIN
  SELECT project_id INTO v_project_id
  FROM comind.cm_project
  ORDER BY created_at, project_id
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'CE-001 event-ordering verification requires at least one canonical project';
  END IF;

  v_improvement_id := comind.open_ce_improvement(
    v_project_id,
    NULL,
    NULL,
    'Event ordering regression verification',
    'test',
    'Prove latest improvement state follows insertion order within one transaction',
    ARRAY[]::uuid[],
    NULL,
    'ce-001-verification',
    'verify_20261029_008'
  );

  SELECT event_id, event_ordinal
  INTO v_event_1, v_ordinal_1
  FROM comind.cm_ce_improvement_event
  WHERE improvement_id = v_improvement_id
    AND event_type = 'proposed';

  v_event_2 := comind.record_ce_improvement_event(
    v_improvement_id,
    NULL,
    'validated',
    'success',
    'Ordering regression test validated',
    '{}'::jsonb,
    'ce-001-verification',
    'verify_20261029_008'
  );

  SELECT event_ordinal INTO v_ordinal_2
  FROM comind.cm_ce_improvement_event
  WHERE event_id = v_event_2;

  IF v_ordinal_1 IS NULL OR v_ordinal_2 IS NULL OR v_ordinal_2 <= v_ordinal_1 THEN
    RAISE EXCEPTION 'CE-001 event-ordering verification failed: ordinals did not increase';
  END IF;

  SELECT latest_event_id, current_state
  INTO v_current_event, v_current_state
  FROM comind.v_ce_improvement_state
  WHERE improvement_id = v_improvement_id;

  IF v_current_event IS DISTINCT FROM v_event_2 OR v_current_state IS DISTINCT FROM 'validated' THEN
    RAISE EXCEPTION 'CE-001 event-ordering verification failed: current state did not resolve to the latest inserted event';
  END IF;

  RAISE NOTICE 'CE-001 event ordering regression verification passed';
END;
$$;

ROLLBACK;
