-- TK-007 / Issue #272: ThreadKeeper C4 operational evidence substrate.
-- Test-first runtime evidence. Production activation remains outside this migration.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_threadkeeper_runtime') THEN
    CREATE ROLE comind_threadkeeper_runtime
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_threadkeeper_runtime
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS comind.cm_threadkeeper_operation_event (
  operation_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persistence_seq bigint GENERATED ALWAYS AS IDENTITY,
  event_key text NOT NULL UNIQUE
    CHECK (event_key <> '' AND btrim(event_key) = event_key AND char_length(event_key) <= 512),
  operation_id uuid NOT NULL,
  prior_event_id uuid NULL,
  recovery_of_event_id uuid NULL,
  scope_id uuid NULL REFERENCES comind.cm_threadkeeper_scope(scope_id) ON DELETE RESTRICT,
  operation_kind text NOT NULL CHECK (operation_kind IN (
    'continuity_cycle',
    'observation',
    'assessment',
    'routing',
    'checkpoint_proposal',
    'checkpoint_acceptance',
    'context_retrieval',
    'recovery'
  )),
  event_type text NOT NULL CHECK (event_type IN ('STARTED','SUCCEEDED','FAILED','BLOCKED')),
  actor_ref text NOT NULL
    CHECK (actor_ref <> '' AND btrim(actor_ref) = actor_ref AND char_length(actor_ref) <= 512),
  authority_evidence_ref text NULL
    CHECK (authority_evidence_ref IS NULL OR (
      authority_evidence_ref <> '' AND btrim(authority_evidence_ref) = authority_evidence_ref
      AND char_length(authority_evidence_ref) <= 4096
    )),
  policy_ref text NULL
    CHECK (policy_ref IS NULL OR (policy_ref <> '' AND btrim(policy_ref) = policy_ref AND char_length(policy_ref) <= 512)),
  correlation_id text NULL
    CHECK (correlation_id IS NULL OR (correlation_id <> '' AND btrim(correlation_id) = correlation_id AND char_length(correlation_id) <= 512)),
  trace_id text NULL
    CHECK (trace_id IS NULL OR (trace_id <> '' AND btrim(trace_id) = trace_id AND char_length(trace_id) <= 256)),
  span_id text NULL
    CHECK (span_id IS NULL OR (span_id <> '' AND btrim(span_id) = span_id AND char_length(span_id) <= 256)),
  service_name text NOT NULL DEFAULT 'threadkeeper'
    CHECK (service_name <> '' AND btrim(service_name) = service_name AND char_length(service_name) <= 256),
  service_instance_id text NULL
    CHECK (service_instance_id IS NULL OR (
      service_instance_id <> '' AND btrim(service_instance_id) = service_instance_id
      AND char_length(service_instance_id) <= 512
    )),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  result_ref text NULL
    CHECK (result_ref IS NULL OR (result_ref <> '' AND btrim(result_ref) = result_ref AND char_length(result_ref) <= 4096)),
  error_type text NULL
    CHECK (error_type IS NULL OR (error_type <> '' AND btrim(error_type) = error_type AND char_length(error_type) <= 256)),
  error_code text NULL
    CHECK (error_code IS NULL OR (error_code <> '' AND btrim(error_code) = error_code AND char_length(error_code) <= 256)),
  duration_ms bigint NULL CHECK (duration_ms IS NULL OR duration_ms >= 0),
  recorded_at timestamptz NOT NULL,
  event_digest char(64) NOT NULL CHECK (event_digest ~ '^[a-f0-9]{64}$'),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_threadkeeper_operation_event_operation_event UNIQUE (operation_id, operation_event_id),
  CONSTRAINT cm_threadkeeper_operation_event_prior_same_operation
    FOREIGN KEY (operation_id, prior_event_id)
    REFERENCES comind.cm_threadkeeper_operation_event(operation_id, operation_event_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_threadkeeper_operation_event_recovery_ref
    FOREIGN KEY (recovery_of_event_id)
    REFERENCES comind.cm_threadkeeper_operation_event(operation_event_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_threadkeeper_operation_event_root
  ON comind.cm_threadkeeper_operation_event(operation_id)
  WHERE prior_event_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_threadkeeper_operation_event_successor
  ON comind.cm_threadkeeper_operation_event(operation_id, prior_event_id)
  WHERE prior_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_threadkeeper_operation_event_scope_recent
  ON comind.cm_threadkeeper_operation_event(scope_id, persistence_seq DESC)
  WHERE scope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_threadkeeper_operation_event_recovery
  ON comind.cm_threadkeeper_operation_event(recovery_of_event_id)
  WHERE recovery_of_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION comind.cm_validate_threadkeeper_operation_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  prior_row comind.cm_threadkeeper_operation_event%ROWTYPE;
  recovery_row comind.cm_threadkeeper_operation_event%ROWTYPE;
BEGIN
  IF NEW.prior_event_id IS NULL THEN
    IF NEW.event_type <> 'STARTED' THEN
      RAISE EXCEPTION 'ThreadKeeper operation must begin with STARTED';
    END IF;
    IF NEW.duration_ms IS NOT NULL OR NEW.result_ref IS NOT NULL
       OR NEW.error_type IS NOT NULL OR NEW.error_code IS NOT NULL THEN
      RAISE EXCEPTION 'ThreadKeeper STARTED event cannot contain terminal fields';
    END IF;

    IF NEW.recovery_of_event_id IS NOT NULL THEN
      SELECT * INTO recovery_row
        FROM comind.cm_threadkeeper_operation_event
       WHERE operation_event_id = NEW.recovery_of_event_id;
      IF recovery_row.operation_event_id IS NULL THEN
        RAISE EXCEPTION 'ThreadKeeper recovery target is unavailable';
      END IF;
      IF recovery_row.event_type NOT IN ('FAILED','BLOCKED') THEN
        RAISE EXCEPTION 'ThreadKeeper recovery target must be FAILED or BLOCKED';
      END IF;
      IF recovery_row.operation_id = NEW.operation_id THEN
        RAISE EXCEPTION 'ThreadKeeper operation cannot recover itself';
      END IF;
    END IF;
  ELSE
    SELECT * INTO prior_row
      FROM comind.cm_threadkeeper_operation_event
     WHERE operation_id = NEW.operation_id
       AND operation_event_id = NEW.prior_event_id;

    IF prior_row.operation_event_id IS NULL THEN
      RAISE EXCEPTION 'ThreadKeeper prior operation event is unavailable';
    END IF;
    IF prior_row.event_type <> 'STARTED' THEN
      RAISE EXCEPTION 'ThreadKeeper terminal event must follow STARTED';
    END IF;
    IF NEW.event_type NOT IN ('SUCCEEDED','FAILED','BLOCKED') THEN
      RAISE EXCEPTION 'ThreadKeeper successor event must be terminal';
    END IF;
    IF NEW.recovery_of_event_id IS NOT NULL THEN
      RAISE EXCEPTION 'ThreadKeeper recovery reference belongs only on STARTED';
    END IF;
    IF NEW.operation_kind <> prior_row.operation_kind
       OR NEW.scope_id IS DISTINCT FROM prior_row.scope_id
       OR NEW.actor_ref <> prior_row.actor_ref
       OR NEW.authority_evidence_ref IS DISTINCT FROM prior_row.authority_evidence_ref
       OR NEW.policy_ref IS DISTINCT FROM prior_row.policy_ref
       OR NEW.correlation_id IS DISTINCT FROM prior_row.correlation_id
       OR NEW.trace_id IS DISTINCT FROM prior_row.trace_id
       OR NEW.span_id IS DISTINCT FROM prior_row.span_id
       OR NEW.service_name <> prior_row.service_name
       OR NEW.service_instance_id IS DISTINCT FROM prior_row.service_instance_id THEN
      RAISE EXCEPTION 'ThreadKeeper terminal event identity does not match STARTED event';
    END IF;
    IF NEW.recorded_at < prior_row.recorded_at THEN
      RAISE EXCEPTION 'ThreadKeeper terminal event cannot precede STARTED';
    END IF;
    IF NEW.duration_ms IS NULL THEN
      RAISE EXCEPTION 'ThreadKeeper terminal event requires duration_ms';
    END IF;
    IF NEW.event_type = 'SUCCEEDED' AND (NEW.error_type IS NOT NULL OR NEW.error_code IS NOT NULL) THEN
      RAISE EXCEPTION 'ThreadKeeper SUCCEEDED event cannot contain error fields';
    END IF;
    IF NEW.event_type IN ('FAILED','BLOCKED') AND NEW.error_type IS NULL THEN
      RAISE EXCEPTION 'ThreadKeeper FAILED or BLOCKED event requires error_type';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_threadkeeper_operation_event_validate
  ON comind.cm_threadkeeper_operation_event;
CREATE TRIGGER trg_cm_threadkeeper_operation_event_validate
BEFORE INSERT ON comind.cm_threadkeeper_operation_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_threadkeeper_operation_event();

DROP TRIGGER IF EXISTS trg_cm_threadkeeper_operation_event_immutable
  ON comind.cm_threadkeeper_operation_event;
CREATE TRIGGER trg_cm_threadkeeper_operation_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_threadkeeper_operation_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_threadkeeper_mutation();

ALTER TABLE comind.cm_threadkeeper_operation_event ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW comind.v_threadkeeper_operation_status
WITH (security_invoker = true)
AS
WITH roots AS (
  SELECT e.*
  FROM comind.cm_threadkeeper_operation_event e
  WHERE e.prior_event_id IS NULL
), latest AS (
  SELECT DISTINCT ON (e.operation_id)
         e.operation_id,
         e.operation_event_id,
         e.event_type,
         e.recorded_at,
         e.duration_ms,
         e.result_ref,
         e.error_type,
         e.error_code,
         e.evidence_refs
    FROM comind.cm_threadkeeper_operation_event e
   ORDER BY e.operation_id, e.persistence_seq DESC
)
SELECT r.operation_id,
       r.operation_event_id AS started_event_id,
       r.recovery_of_event_id,
       r.scope_id,
       r.operation_kind,
       r.actor_ref,
       r.authority_evidence_ref,
       r.policy_ref,
       r.correlation_id,
       r.trace_id,
       r.span_id,
       r.service_name,
       r.service_instance_id,
       r.recorded_at AS started_at,
       l.operation_event_id AS latest_event_id,
       l.event_type AS status,
       CASE WHEN l.event_type = 'STARTED' THEN NULL ELSE l.recorded_at END AS terminal_at,
       l.duration_ms,
       l.result_ref,
       l.error_type,
       l.error_code,
       l.evidence_refs AS terminal_evidence_refs
  FROM roots r
  JOIN latest l USING (operation_id);

COMMENT ON TABLE comind.cm_threadkeeper_operation_event IS
  'Append-only ThreadKeeper operational events for C4 observability, failure, recovery, and operator reconstruction evidence. Raw source payloads remain outside ThreadKeeper.';
COMMENT ON VIEW comind.v_threadkeeper_operation_status IS
  'Security-invoker projection of current status for each ThreadKeeper operation attempt.';

REVOKE ALL ON TABLE comind.cm_threadkeeper_operation_event FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE comind.cm_threadkeeper_scope FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_threadkeeper_checkpoint FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_threadkeeper_assessment FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_threadkeeper_case FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_threadkeeper_case_transition FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.v_threadkeeper_operation_status FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA comind TO comind_threadkeeper_runtime;
GRANT SELECT, INSERT ON TABLE
  comind.cm_threadkeeper_scope,
  comind.cm_threadkeeper_checkpoint,
  comind.cm_threadkeeper_assessment,
  comind.cm_threadkeeper_case,
  comind.cm_threadkeeper_case_transition,
  comind.cm_threadkeeper_operation_event
TO comind_threadkeeper_runtime;
GRANT SELECT ON TABLE comind.v_threadkeeper_operation_status TO comind_threadkeeper_runtime;

GRANT USAGE ON SEQUENCE
  comind.cm_threadkeeper_checkpoint_persistence_seq_seq,
  comind.cm_threadkeeper_assessment_persistence_seq_seq,
  comind.cm_threadkeeper_case_transition_persistence_seq_seq,
  comind.cm_threadkeeper_operation_event_persistence_seq_seq
TO comind_threadkeeper_runtime;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cm_threadkeeper_scope',
    'cm_threadkeeper_checkpoint',
    'cm_threadkeeper_assessment',
    'cm_threadkeeper_case',
    'cm_threadkeeper_case_transition',
    'cm_threadkeeper_operation_event'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS threadkeeper_runtime_select ON comind.%I', table_name);
    EXECUTE format(
      'CREATE POLICY threadkeeper_runtime_select ON comind.%I FOR SELECT TO comind_threadkeeper_runtime USING (true)',
      table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS threadkeeper_runtime_insert ON comind.%I', table_name);
    EXECUTE format(
      'CREATE POLICY threadkeeper_runtime_insert ON comind.%I FOR INSERT TO comind_threadkeeper_runtime WITH CHECK (true)',
      table_name
    );
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT comind_threadkeeper_runtime TO service_role
      WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
  END IF;
END
$$;

COMMIT;
