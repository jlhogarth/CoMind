-- Test-only Data API surface for the Activity HUD browser.
-- Exposes synthetic fixture rows through public while keeping other HUD records
-- unavailable to anon. Apply only to the CoMind Test project or disposable PG 17.

BEGIN;

DROP POLICY IF EXISTS activity_runs_read_synthetic_anon
  ON comind_hud_test.activity_runs;
CREATE POLICY activity_runs_read_synthetic_anon
  ON comind_hud_test.activity_runs
  FOR SELECT TO anon
  USING (is_synthetic);

DROP POLICY IF EXISTS activity_observations_read_synthetic_anon
  ON comind_hud_test.activity_observations;
CREATE POLICY activity_observations_read_synthetic_anon
  ON comind_hud_test.activity_observations
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM comind_hud_test.activity_runs AS activity_run
      WHERE activity_run.activity_id = activity_observations.activity_id
        AND activity_run.is_synthetic
    )
  );

GRANT USAGE ON SCHEMA comind_hud_test TO anon;
GRANT SELECT ON TABLE
  comind_hud_test.activity_runs,
  comind_hud_test.activity_observations
TO anon;
GRANT SELECT ON comind_hud_test.v_activity_hud TO anon;

CREATE OR REPLACE VIEW public.v_activity_hud_test
WITH (security_invoker = true)
AS
SELECT
  activity_id,
  activity_key,
  source_system,
  source_ref,
  title,
  owner_label,
  started_at,
  expected_deadline_at,
  stale_after_seconds,
  latest_observation_id,
  latest_event_type,
  last_reported_status,
  last_source_event_ref,
  last_source_occurred_at,
  last_observed_at,
  last_observation_summary,
  last_evidence,
  hud_state,
  evidence_based_resolution,
  has_terminal_source_evidence,
  is_synthetic,
  coverage_limit
FROM comind_hud_test.v_activity_hud
WHERE is_synthetic;

REVOKE ALL ON public.v_activity_hud_test FROM PUBLIC, authenticated;
GRANT SELECT ON public.v_activity_hud_test TO anon;

COMMENT ON VIEW public.v_activity_hud_test IS
  'Test-only browser projection of synthetic Activity HUD fixture rows. It excludes non-synthetic runs.';

COMMIT;
