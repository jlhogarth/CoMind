BEGIN;

CREATE SCHEMA IF NOT EXISTS comind_pm;

CREATE TABLE IF NOT EXISTS comind_pm.pm_aed_monitor_execution (
  execution_id text PRIMARY KEY,
  lane_id text,
  workflow_run_url text,
  first_at timestamptz NOT NULL,
  last_at timestamptz NOT NULL,
  event_count integer NOT NULL CHECK (event_count > 0),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_sha256 text CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comind_pm.pm_aed_monitor_event (
  execution_id text NOT NULL REFERENCES comind_pm.pm_aed_monitor_execution(execution_id),
  sequence integer NOT NULL CHECK (sequence > 0),
  event_at timestamptz NOT NULL,
  elapsed_ms bigint NOT NULL CHECK (elapsed_ms >= 0),
  kind text NOT NULL,
  case_id text,
  state text,
  outcome text,
  wake_source text,
  provider text,
  actual_cost_usd numeric(18,8),
  payload jsonb NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (execution_id, sequence),
  CHECK (actual_cost_usd IS NULL OR actual_cost_usd >= 0)
);

CREATE INDEX IF NOT EXISTS pm_aed_monitor_event_case_idx
  ON comind_pm.pm_aed_monitor_event (case_id, event_at DESC);
CREATE INDEX IF NOT EXISTS pm_aed_monitor_event_state_idx
  ON comind_pm.pm_aed_monitor_event (state, event_at DESC);

ALTER TABLE comind_pm.pm_aed_monitor_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind_pm.pm_aed_monitor_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comind_pm.pm_aed_monitor_execution, comind_pm.pm_aed_monitor_event FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON comind_pm.pm_aed_monitor_execution, comind_pm.pm_aed_monitor_event FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON comind_pm.pm_aed_monitor_execution, comind_pm.pm_aed_monitor_event FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT ON comind_pm.pm_aed_monitor_execution, comind_pm.pm_aed_monitor_event TO service_role;
  END IF;
END $$;

COMMIT;
