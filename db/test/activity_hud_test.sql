-- Test-only Activity HUD fixture and projections.
-- Applied to CoMind Supabase Test as migration activity_hud_test_v1
-- (version 20261019214321). Do not add to db/migrations or production runners.
-- Uses only synthetic activity rows and reads the existing RunBook projection.

CREATE SCHEMA IF NOT EXISTS comind_hud_test;
REVOKE ALL ON SCHEMA comind_hud_test FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS comind_hud_test.activity_runs (
  activity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_key text NOT NULL UNIQUE CHECK (length(btrim(activity_key)) > 0),
  source_system text NOT NULL CHECK (source_system IN ('comind', 'github_actions', 'supabase', 'openai_api', 'google_drive', 'synthetic_test')),
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  owner_label text,
  started_at timestamptz NOT NULL,
  expected_deadline_at timestamptz,
  stale_after_seconds integer NOT NULL CHECK (stale_after_seconds BETWEEN 1 AND 604800),
  is_synthetic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_system = 'synthetic_test') = is_synthetic)
);

CREATE TABLE IF NOT EXISTS comind_hud_test.activity_observations (
  observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES comind_hud_test.activity_runs(activity_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('queued', 'started', 'heartbeat', 'waiting', 'status_change', 'terminal_result', 'cancellation_requested', 'note')),
  source_status text NOT NULL CHECK (source_status IN ('queued', 'running', 'waiting_external', 'cancellation_requested', 'completed', 'failed', 'cancelled', 'unknown')),
  source_event_ref text,
  source_occurred_at timestamptz,
  observed_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array')
);

CREATE INDEX IF NOT EXISTS activity_observations_latest_idx
  ON comind_hud_test.activity_observations(activity_id, observed_at DESC, observation_id DESC);
CREATE INDEX IF NOT EXISTS activity_runs_source_idx
  ON comind_hud_test.activity_runs(source_system, started_at DESC);

ALTER TABLE comind_hud_test.activity_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind_hud_test.activity_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA comind_hud_test FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA comind_hud_test FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION comind_hud_test.prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, comind_hud_test
AS $fn$
BEGIN
  RAISE EXCEPTION 'Activity HUD evidence is append-only';
END;
$fn$;
REVOKE ALL ON FUNCTION comind_hud_test.prevent_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS activity_runs_append_only ON comind_hud_test.activity_runs;
CREATE TRIGGER activity_runs_append_only
BEFORE UPDATE OR DELETE ON comind_hud_test.activity_runs
FOR EACH ROW EXECUTE FUNCTION comind_hud_test.prevent_mutation();
DROP TRIGGER IF EXISTS activity_observations_append_only ON comind_hud_test.activity_observations;
CREATE TRIGGER activity_observations_append_only
BEFORE UPDATE OR DELETE ON comind_hud_test.activity_observations
FOR EACH ROW EXECUTE FUNCTION comind_hud_test.prevent_mutation();

CREATE OR REPLACE VIEW comind_hud_test.v_activity_hud
WITH (security_invoker = true)
AS
WITH latest AS (
  SELECT DISTINCT ON (o.activity_id)
    o.activity_id, o.observation_id, o.event_type, o.source_status,
    o.source_event_ref, o.source_occurred_at, o.observed_at, o.summary, o.evidence
  FROM comind_hud_test.activity_observations o
  ORDER BY o.activity_id, o.observed_at DESC, o.observation_id DESC
)
SELECT
  r.activity_id,
  r.activity_key,
  r.source_system,
  r.source_ref,
  r.title,
  r.owner_label,
  r.started_at,
  r.expected_deadline_at,
  r.stale_after_seconds,
  l.observation_id AS latest_observation_id,
  l.event_type AS latest_event_type,
  l.source_status AS last_reported_status,
  l.source_event_ref AS last_source_event_ref,
  l.source_occurred_at AS last_source_occurred_at,
  l.observed_at AS last_observed_at,
  l.summary AS last_observation_summary,
  l.evidence AS last_evidence,
  CASE
    WHEN l.source_status IN ('completed', 'failed', 'cancelled') THEN l.source_status
    WHEN r.expected_deadline_at IS NOT NULL AND now() >= r.expected_deadline_at THEN 'deadline_exceeded'
    WHEN l.observation_id IS NULL THEN 'unknown'
    WHEN now() > l.observed_at + make_interval(secs => r.stale_after_seconds) THEN 'stale_unknown'
    ELSE l.source_status
  END AS hud_state,
  CASE
    WHEN l.source_status IN ('completed', 'failed', 'cancelled') THEN l.source_status
    ELSE NULL
  END AS evidence_based_resolution,
  (l.source_status IN ('completed', 'failed', 'cancelled')) AS has_terminal_source_evidence,
  r.is_synthetic,
  'Bounded observations only; no complete-history, lossless-feed, or snapshot-consistency claim.'::text AS coverage_limit
FROM comind_hud_test.activity_runs r
LEFT JOIN latest l ON l.activity_id = r.activity_id;

CREATE OR REPLACE VIEW comind_hud_test.v_runbook_timeline
WITH (security_invoker = true)
AS
SELECT
  event_id, occurred_at, project_key, project_name, work_key, work_item_title, item_type,
  event_type, actor, actor_type, action_summary, result_summary, outcome, status_from,
  status_to, next_action, consequential, source_system, source_ref, evidence, details, created_at
FROM comind_pm.v_runbook_timeline;

REVOKE ALL ON comind_hud_test.v_activity_hud FROM PUBLIC, anon, authenticated;
REVOKE ALL ON comind_hud_test.v_runbook_timeline FROM PUBLIC, anon, authenticated;

INSERT INTO comind_hud_test.activity_runs
  (activity_key, source_system, source_ref, title, owner_label, started_at, expected_deadline_at, stale_after_seconds, is_synthetic)
VALUES
  ('synthetic-completed', 'synthetic_test', 'synthetic://activity-hud/completed', 'Completed synthetic job', 'Test fixture', now() - interval '8 minutes', NULL, 120, true),
  ('synthetic-failed', 'synthetic_test', 'synthetic://activity-hud/failed', 'Failed synthetic job', 'Test fixture', now() - interval '18 minutes', NULL, 120, true),
  ('synthetic-stale', 'synthetic_test', 'synthetic://activity-hud/stale', 'Job with no terminal return', 'Test fixture', now() - interval '15 minutes', NULL, 60, true),
  ('synthetic-cancel', 'synthetic_test', 'synthetic://activity-hud/cancel', 'Cancellation awaiting source confirmation', 'Test fixture', now() - interval '12 minutes', NULL, 60, true),
  ('synthetic-deadline', 'synthetic_test', 'synthetic://activity-hud/deadline', 'Locally bounded deadline elapsed', 'Test fixture', now() - interval '1 hour', now() - interval '5 minutes', 120, true)
ON CONFLICT (activity_key) DO NOTHING;

INSERT INTO comind_hud_test.activity_observations
  (activity_id, event_type, source_status, source_event_ref, source_occurred_at, observed_at, summary, evidence)
SELECT r.activity_id, v.event_type, v.source_status, v.source_event_ref, v.source_occurred_at, v.observed_at, v.summary, v.evidence
FROM (VALUES
  ('synthetic-completed', 'queued', 'queued', 'synthetic-event-1', now() - interval '8 minutes', now() - interval '8 minutes', 'Synthetic job entered queue.', '[{"type":"fixture","id":"completed"}]'::jsonb),
  ('synthetic-completed', 'terminal_result', 'completed', 'synthetic-event-2', now() - interval '6 minutes', now() - interval '6 minutes', 'Synthetic source returned completion.', '[{"type":"fixture","id":"completed"}]'::jsonb),
  ('synthetic-failed', 'terminal_result', 'failed', 'synthetic-event-3', now() - interval '17 minutes', now() - interval '17 minutes', 'Synthetic source returned failure.', '[{"type":"fixture","id":"failed"}]'::jsonb),
  ('synthetic-stale', 'heartbeat', 'running', 'synthetic-event-4', now() - interval '9 minutes', now() - interval '9 minutes', 'Last synthetic heartbeat; no terminal return observed.', '[{"type":"fixture","id":"stale"}]'::jsonb),
  ('synthetic-cancel', 'cancellation_requested', 'cancellation_requested', 'synthetic-event-5', now() - interval '2 minutes', now() - interval '2 minutes', 'Cancellation requested; source confirmation has not returned.', '[{"type":"fixture","id":"cancel"}]'::jsonb),
  ('synthetic-deadline', 'heartbeat', 'running', 'synthetic-event-6', now() - interval '10 minutes', now() - interval '10 minutes', 'Synthetic source last reported running; local deadline elapsed.', '[{"type":"fixture","id":"deadline"}]'::jsonb)
) AS v(activity_key,event_type,source_status,source_event_ref,source_occurred_at,observed_at,summary,evidence)
JOIN comind_hud_test.activity_runs r USING (activity_key)
WHERE NOT EXISTS (
  SELECT 1 FROM comind_hud_test.activity_observations x
  WHERE x.activity_id = r.activity_id AND x.source_event_ref = v.source_event_ref
);

COMMENT ON SCHEMA comind_hud_test IS 'Test-only CoMind Activity HUD evidence and read-only projections. Synthetic fixtures only; not a production activity authority.';
COMMENT ON VIEW comind_hud_test.v_activity_hud IS 'Bounded source observations with conservative stale and local-deadline states; does not promise completeness or lossless capture.';
COMMENT ON VIEW comind_hud_test.v_runbook_timeline IS 'Read-only, separate RunBook source projection; no inferred PM, Foundry, lane, or evidence crosswalk.';
