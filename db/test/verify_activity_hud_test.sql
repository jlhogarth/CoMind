-- Read-only verification for db/test/activity_hud_test.sql.
-- Run only against the CoMind Test project or a disposable PostgreSQL 17 database.

DO $verify$
DECLARE
  v_total integer;
  v_synthetic integer;
  v_completed integer;
  v_failed integer;
  v_stale_unknown integer;
  v_deadline_exceeded integer;
  v_unresolved_with_false_resolution integer;
  v_runbook_count integer;
  v_source_count integer;
  v_public_view_rows integer;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE is_synthetic)
  INTO v_total, v_synthetic
  FROM comind_hud_test.v_activity_hud;

  IF v_total <> 5 OR v_synthetic <> 5 THEN
    RAISE EXCEPTION 'Expected five synthetic activity rows, got total %, synthetic %', v_total, v_synthetic;
  END IF;

  SELECT count(*) FILTER (WHERE hud_state = 'completed'),
         count(*) FILTER (WHERE hud_state = 'failed'),
         count(*) FILTER (WHERE hud_state = 'stale_unknown'),
         count(*) FILTER (WHERE hud_state = 'deadline_exceeded'),
         count(*) FILTER (WHERE hud_state IN ('stale_unknown', 'deadline_exceeded')
                            AND evidence_based_resolution IS NOT NULL)
  INTO v_completed, v_failed, v_stale_unknown, v_deadline_exceeded, v_unresolved_with_false_resolution
  FROM comind_hud_test.v_activity_hud;

  IF v_completed <> 1 OR v_failed <> 1 OR v_stale_unknown <> 2 OR v_deadline_exceeded <> 1 THEN
    RAISE EXCEPTION 'Unexpected HUD states: completed %, failed %, stale %, deadline %',
      v_completed, v_failed, v_stale_unknown, v_deadline_exceeded;
  END IF;
  IF v_unresolved_with_false_resolution <> 0 THEN
    RAISE EXCEPTION 'An unconfirmed activity was assigned an evidence-based resolution';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_synthetic)
  INTO v_public_view_rows, v_synthetic
  FROM public.v_activity_hud_test;
  IF v_public_view_rows <> 5 OR v_synthetic <> 5 THEN
    RAISE EXCEPTION 'Public Test view must expose exactly five synthetic rows, got total %, synthetic %',
      v_public_view_rows, v_synthetic;
  END IF;

  SELECT count(*) INTO v_runbook_count FROM comind_hud_test.v_runbook_timeline;
  SELECT count(*) INTO v_source_count FROM comind_pm.v_runbook_timeline;
  IF v_runbook_count <> v_source_count THEN
    RAISE EXCEPTION 'RunBook projection row count differs from source: HUD %, source %', v_runbook_count, v_source_count;
  END IF;

  IF NOT has_schema_privilege('anon', 'comind_hud_test', 'USAGE')
     OR NOT has_table_privilege('anon', 'public.v_activity_hud_test', 'SELECT')
     OR NOT has_table_privilege('anon', 'comind_hud_test.v_activity_hud', 'SELECT')
     OR NOT has_table_privilege('anon', 'comind_hud_test.activity_runs', 'SELECT')
     OR NOT has_table_privilege('anon', 'comind_hud_test.activity_observations', 'SELECT')
     OR has_table_privilege('anon', 'public.v_activity_hud_test', 'INSERT')
     OR has_table_privilege('anon', 'public.v_activity_hud_test', 'UPDATE')
     OR has_table_privilege('anon', 'public.v_activity_hud_test', 'DELETE')
     OR has_table_privilege('anon', 'comind_hud_test.activity_runs', 'INSERT')
     OR has_table_privilege('anon', 'comind_hud_test.activity_runs', 'UPDATE')
     OR has_table_privilege('anon', 'comind_hud_test.activity_runs', 'DELETE')
     OR has_table_privilege('anon', 'comind_hud_test.activity_observations', 'INSERT')
     OR has_table_privilege('anon', 'comind_hud_test.activity_observations', 'UPDATE')
     OR has_table_privilege('anon', 'comind_hud_test.activity_observations', 'DELETE')
     OR has_schema_privilege('authenticated', 'comind_hud_test', 'USAGE')
     OR has_table_privilege('authenticated', 'public.v_activity_hud_test', 'SELECT')
     OR has_table_privilege('authenticated', 'comind_hud_test.v_activity_hud', 'SELECT') THEN
    RAISE EXCEPTION 'HUD Test Data API privileges do not match the synthetic read-only contract';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'comind_hud_test'
      AND tablename = 'activity_runs'
      AND policyname = 'activity_runs_read_synthetic_anon'
      AND roles @> ARRAY['anon']::name[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'comind_hud_test'
      AND tablename = 'activity_observations'
      AND policyname = 'activity_observations_read_synthetic_anon'
      AND roles @> ARRAY['anon']::name[]
  ) THEN
    RAISE EXCEPTION 'Expected synthetic-only anon read policies were not found';
  END IF;

  IF position('is_synthetic' in lower(pg_get_viewdef('public.v_activity_hud_test'::regclass, true))) = 0 THEN
    RAISE EXCEPTION 'Public Test view does not filter to synthetic rows';
  END IF;

  BEGIN
    UPDATE comind_hud_test.activity_runs SET title = 'mutation attempt'
    WHERE activity_key = 'synthetic-stale';
    RAISE EXCEPTION 'Activity run mutation unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Activity run mutation unexpectedly succeeded' THEN RAISE; END IF;
    IF SQLERRM <> 'Activity HUD evidence is append-only' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM comind_hud_test.activity_observations
    WHERE source_event_ref = 'synthetic-event-4';
    RAISE EXCEPTION 'Activity observation deletion unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'Activity observation deletion unexpectedly succeeded' THEN RAISE; END IF;
    IF SQLERRM <> 'Activity HUD evidence is append-only' THEN RAISE; END IF;
  END;
END;
$verify$;

SELECT activity_key, source_system, title, hud_state, last_reported_status,
       evidence_based_resolution, has_terminal_source_evidence, last_observed_at,
       coverage_limit
FROM comind_hud_test.v_activity_hud
ORDER BY activity_key;

SELECT event_id, occurred_at, project_key, work_key, event_type, actor,
       outcome, action_summary, result_summary, next_action, source_ref
FROM comind_hud_test.v_runbook_timeline
ORDER BY occurred_at DESC, event_id DESC
LIMIT 25;

