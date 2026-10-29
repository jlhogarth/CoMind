-- CE-001 Continuous Excellence foundation
-- Scope: Test-first durable improvement, continuity, recovery, and evidence control plane.
-- This migration is additive and does not activate Production behavior.

CREATE SCHEMA IF NOT EXISTS comind;

CREATE OR REPLACE FUNCTION comind.reject_ce_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION 'Continuous Excellence history is append-only; % on %.% is not permitted',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_ce_signal (
  signal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind.cm_project(project_id),
  task_id uuid NULL REFERENCES comind.cm_task(task_id),
  actor_id uuid NULL REFERENCES comind.cm_actor(actor_id),
  signal_type text NOT NULL CHECK (signal_type IN (
    'friction',
    'failure',
    'recovery_interrupt',
    'missingness',
    'regression',
    'opportunity',
    'completion_gap',
    'continuity_risk'
  )),
  severity text NOT NULL CHECK (severity IN ('info', 'low', 'moderate', 'high', 'critical')),
  requires_action boolean NOT NULL DEFAULT true,
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  source_system text NOT NULL CHECK (length(btrim(source_system)) > 0),
  source_ref text NULL,
  idempotency_key text NULL CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) > 0),
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cm_ce_signal_idempotency_uq
  ON comind.cm_ce_signal (project_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_ce_signal_project_observed_idx
  ON comind.cm_ce_signal (project_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS cm_ce_signal_task_idx
  ON comind.cm_ce_signal (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_ce_signal_actor_idx
  ON comind.cm_ce_signal (actor_id) WHERE actor_id IS NOT NULL;

DROP TRIGGER IF EXISTS cm_ce_signal_immutable ON comind.cm_ce_signal;
CREATE TRIGGER cm_ce_signal_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_signal
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE TABLE IF NOT EXISTS comind.cm_ce_signal_evidence (
  signal_id uuid NOT NULL REFERENCES comind.cm_ce_signal(signal_id),
  evidence_id uuid NOT NULL REFERENCES comind.cm_evidence(evidence_id),
  relationship text NOT NULL DEFAULT 'supports' CHECK (relationship IN ('supports', 'contradicts', 'context', 'validation', 'failure')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (signal_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS cm_ce_signal_evidence_evidence_idx
  ON comind.cm_ce_signal_evidence (evidence_id);

DROP TRIGGER IF EXISTS cm_ce_signal_evidence_immutable ON comind.cm_ce_signal_evidence;
CREATE TRIGGER cm_ce_signal_evidence_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_signal_evidence
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE TABLE IF NOT EXISTS comind.cm_ce_improvement (
  improvement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind.cm_project(project_id),
  task_id uuid NULL REFERENCES comind.cm_task(task_id),
  owner_actor_id uuid NULL REFERENCES comind.cm_actor(actor_id),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  category text NOT NULL CHECK (category IN (
    'prompt',
    'runbook',
    'schema',
    'tool',
    'agent',
    'test',
    'eval',
    'automation',
    'ui',
    'monitoring',
    'documentation',
    'governance',
    'architecture'
  )),
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cm_ce_improvement_project_idx
  ON comind.cm_ce_improvement (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cm_ce_improvement_task_idx
  ON comind.cm_ce_improvement (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_ce_improvement_owner_idx
  ON comind.cm_ce_improvement (owner_actor_id) WHERE owner_actor_id IS NOT NULL;

DROP TRIGGER IF EXISTS cm_ce_improvement_immutable ON comind.cm_ce_improvement;
CREATE TRIGGER cm_ce_improvement_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_improvement
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE TABLE IF NOT EXISTS comind.cm_ce_improvement_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id uuid NOT NULL REFERENCES comind.cm_ce_improvement(improvement_id),
  actor_id uuid NULL REFERENCES comind.cm_actor(actor_id),
  event_type text NOT NULL CHECK (event_type IN (
    'proposed',
    'approved',
    'implemented',
    'validated',
    'measured',
    'blocked',
    'rejected',
    'reverted',
    'superseded',
    'retained'
  )),
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'success', 'partial', 'blocked', 'failed', 'rejected')),
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  source_system text NOT NULL CHECK (length(btrim(source_system)) > 0),
  source_ref text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cm_ce_improvement_event_latest_idx
  ON comind.cm_ce_improvement_event (improvement_id, created_at DESC, event_id DESC);
CREATE INDEX IF NOT EXISTS cm_ce_improvement_event_actor_idx
  ON comind.cm_ce_improvement_event (actor_id) WHERE actor_id IS NOT NULL;

DROP TRIGGER IF EXISTS cm_ce_improvement_event_immutable ON comind.cm_ce_improvement_event;
CREATE TRIGGER cm_ce_improvement_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_improvement_event
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE TABLE IF NOT EXISTS comind.cm_ce_improvement_signal (
  improvement_id uuid NOT NULL REFERENCES comind.cm_ce_improvement(improvement_id),
  signal_id uuid NOT NULL REFERENCES comind.cm_ce_signal(signal_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (improvement_id, signal_id)
);

CREATE INDEX IF NOT EXISTS cm_ce_improvement_signal_signal_idx
  ON comind.cm_ce_improvement_signal (signal_id);

DROP TRIGGER IF EXISTS cm_ce_improvement_signal_immutable ON comind.cm_ce_improvement_signal;
CREATE TRIGGER cm_ce_improvement_signal_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_improvement_signal
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE TABLE IF NOT EXISTS comind.cm_ce_improvement_evidence (
  improvement_id uuid NOT NULL REFERENCES comind.cm_ce_improvement(improvement_id),
  evidence_id uuid NOT NULL REFERENCES comind.cm_evidence(evidence_id),
  relationship text NOT NULL DEFAULT 'supports' CHECK (relationship IN ('supports', 'contradicts', 'context', 'validation', 'failure')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (improvement_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS cm_ce_improvement_evidence_evidence_idx
  ON comind.cm_ce_improvement_evidence (evidence_id);

DROP TRIGGER IF EXISTS cm_ce_improvement_evidence_immutable ON comind.cm_ce_improvement_evidence;
CREATE TRIGGER cm_ce_improvement_evidence_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_improvement_evidence
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE TABLE IF NOT EXISTS comind.cm_ce_continuity_capsule (
  capsule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES comind.cm_project(project_id),
  task_id uuid NULL REFERENCES comind.cm_task(task_id),
  capsule_key text NOT NULL CHECK (length(btrim(capsule_key)) > 0),
  version integer NOT NULL CHECK (version > 0),
  predecessor_capsule_id uuid NULL REFERENCES comind.cm_ce_continuity_capsule(capsule_id),
  objective text NOT NULL CHECK (length(btrim(objective)) > 0),
  completion_criteria jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(completion_criteria) = 'array'),
  verification_method jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(verification_method) = 'array'),
  acceptance_authority jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(acceptance_authority) = 'object'),
  accepted_baseline jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(accepted_baseline) = 'object'),
  authoritative_sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(authoritative_sources) = 'array'),
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(decisions) = 'array'),
  constraints jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraints) = 'array'),
  last_verified_action text NULL,
  active_work jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(active_work) = 'array'),
  unresolved jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(unresolved) = 'array'),
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blockers) = 'array'),
  pending_approvals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pending_approvals) = 'array'),
  next_safe_action text NULL,
  rollback_point text NULL,
  recovery_state text NOT NULL DEFAULT 'ready' CHECK (recovery_state IN ('ready', 'partial', 'blocked', 'uncertain', 'complete')),
  confidence text NOT NULL DEFAULT 'verified' CHECK (confidence IN ('verified', 'mixed', 'uncertain')),
  source_system text NOT NULL CHECK (length(btrim(source_system)) > 0),
  source_ref text NULL,
  captured_by_actor_id uuid NULL REFERENCES comind.cm_actor(actor_id),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((version = 1 AND predecessor_capsule_id IS NULL) OR (version > 1 AND predecessor_capsule_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS cm_ce_capsule_version_uq
  ON comind.cm_ce_continuity_capsule (project_id, task_id, capsule_key, version) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX IF NOT EXISTS cm_ce_capsule_predecessor_uq
  ON comind.cm_ce_continuity_capsule (predecessor_capsule_id)
  WHERE predecessor_capsule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_ce_capsule_project_latest_idx
  ON comind.cm_ce_continuity_capsule (project_id, capsule_key, version DESC);
CREATE INDEX IF NOT EXISTS cm_ce_capsule_task_idx
  ON comind.cm_ce_continuity_capsule (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cm_ce_capsule_captured_by_idx
  ON comind.cm_ce_continuity_capsule (captured_by_actor_id) WHERE captured_by_actor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION comind.validate_ce_capsule_lineage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_predecessor comind.cm_ce_continuity_capsule%ROWTYPE;
BEGIN
  IF NEW.version = 1 THEN
    IF NEW.predecessor_capsule_id IS NOT NULL THEN
      RAISE EXCEPTION 'CE capsule version 1 cannot have a predecessor';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.predecessor_capsule_id IS NULL THEN
    RAISE EXCEPTION 'CE capsule version % requires a predecessor', NEW.version;
  END IF;

  SELECT * INTO v_predecessor
  FROM comind.cm_ce_continuity_capsule
  WHERE capsule_id = NEW.predecessor_capsule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CE capsule predecessor % does not exist', NEW.predecessor_capsule_id;
  END IF;

  IF v_predecessor.project_id <> NEW.project_id
     OR v_predecessor.task_id IS DISTINCT FROM NEW.task_id
     OR v_predecessor.capsule_key <> NEW.capsule_key THEN
    RAISE EXCEPTION 'CE capsule predecessor must belong to the same project, task, and capsule key';
  END IF;

  IF NEW.version <> v_predecessor.version + 1 THEN
    RAISE EXCEPTION 'CE capsule version % must directly follow predecessor version %', NEW.version, v_predecessor.version;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cm_ce_capsule_validate_lineage ON comind.cm_ce_continuity_capsule;
CREATE TRIGGER cm_ce_capsule_validate_lineage
BEFORE INSERT ON comind.cm_ce_continuity_capsule
FOR EACH ROW EXECUTE FUNCTION comind.validate_ce_capsule_lineage();

DROP TRIGGER IF EXISTS cm_ce_capsule_immutable ON comind.cm_ce_continuity_capsule;
CREATE TRIGGER cm_ce_capsule_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_continuity_capsule
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE TABLE IF NOT EXISTS comind.cm_ce_capsule_evidence (
  capsule_id uuid NOT NULL REFERENCES comind.cm_ce_continuity_capsule(capsule_id),
  evidence_id uuid NOT NULL REFERENCES comind.cm_evidence(evidence_id),
  relationship text NOT NULL DEFAULT 'supports' CHECK (relationship IN ('supports', 'contradicts', 'context', 'validation', 'failure')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (capsule_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS cm_ce_capsule_evidence_evidence_idx
  ON comind.cm_ce_capsule_evidence (evidence_id);

DROP TRIGGER IF EXISTS cm_ce_capsule_evidence_immutable ON comind.cm_ce_capsule_evidence;
CREATE TRIGGER cm_ce_capsule_evidence_immutable
BEFORE UPDATE OR DELETE ON comind.cm_ce_capsule_evidence
FOR EACH ROW EXECUTE FUNCTION comind.reject_ce_history_mutation();

CREATE OR REPLACE VIEW comind.v_ce_current_continuity_capsule
WITH (security_invoker = true)
AS
SELECT c.*
FROM comind.cm_ce_continuity_capsule c
WHERE NOT EXISTS (
  SELECT 1
  FROM comind.cm_ce_continuity_capsule successor
  WHERE successor.predecessor_capsule_id = c.capsule_id
);

CREATE OR REPLACE VIEW comind.v_ce_signal_backlog
WITH (security_invoker = true)
AS
SELECT
  s.*,
  COALESCE(linked.improvement_count, 0::bigint) AS linked_improvement_count
FROM comind.cm_ce_signal s
LEFT JOIN LATERAL (
  SELECT count(*) AS improvement_count
  FROM comind.cm_ce_improvement_signal rel
  WHERE rel.signal_id = s.signal_id
) linked ON true
WHERE s.requires_action
  AND COALESCE(linked.improvement_count, 0::bigint) = 0;

CREATE OR REPLACE VIEW comind.v_ce_improvement_state
WITH (security_invoker = true)
AS
SELECT
  i.improvement_id,
  i.project_id,
  i.task_id,
  i.owner_actor_id,
  i.title,
  i.category,
  i.rationale,
  i.created_at,
  latest.event_id AS latest_event_id,
  latest.event_type AS current_state,
  latest.outcome AS current_outcome,
  latest.summary AS latest_summary,
  latest.created_at AS latest_event_at
FROM comind.cm_ce_improvement i
LEFT JOIN LATERAL (
  SELECT e.event_id, e.event_type, e.outcome, e.summary, e.created_at
  FROM comind.cm_ce_improvement_event e
  WHERE e.improvement_id = i.improvement_id
  ORDER BY e.created_at DESC, e.event_id DESC
  LIMIT 1
) latest ON true;

CREATE OR REPLACE FUNCTION comind.record_ce_signal(
  p_project_id uuid,
  p_task_id uuid,
  p_actor_id uuid,
  p_signal_type text,
  p_severity text,
  p_requires_action boolean,
  p_summary text,
  p_details jsonb,
  p_source_system text,
  p_source_ref text,
  p_idempotency_key text,
  p_observed_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_signal_id uuid;
BEGIN
  INSERT INTO comind.cm_ce_signal (
    project_id, task_id, actor_id, signal_type, severity, requires_action,
    summary, details, source_system, source_ref, idempotency_key, observed_at
  ) VALUES (
    p_project_id,
    p_task_id,
    p_actor_id,
    p_signal_type,
    p_severity,
    COALESCE(p_requires_action, true),
    p_summary,
    COALESCE(p_details, '{}'::jsonb),
    p_source_system,
    p_source_ref,
    p_idempotency_key,
    COALESCE(p_observed_at, now())
  )
  ON CONFLICT (project_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING signal_id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.capture_ce_continuity_capsule(
  p_project_id uuid,
  p_task_id uuid,
  p_capsule_key text,
  p_objective text,
  p_completion_criteria jsonb,
  p_verification_method jsonb,
  p_acceptance_authority jsonb,
  p_accepted_baseline jsonb,
  p_authoritative_sources jsonb,
  p_decisions jsonb,
  p_constraints jsonb,
  p_last_verified_action text,
  p_active_work jsonb,
  p_unresolved jsonb,
  p_blockers jsonb,
  p_pending_approvals jsonb,
  p_next_safe_action text,
  p_rollback_point text,
  p_recovery_state text,
  p_confidence text,
  p_source_system text,
  p_source_ref text,
  p_captured_by_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_predecessor_id uuid;
  v_previous_version integer;
  v_version integer;
  v_capsule_id uuid;
  v_hash text;
  v_capsule_key text := btrim(p_capsule_key);
BEGIN
  IF v_capsule_key IS NULL OR v_capsule_key = '' THEN
    RAISE EXCEPTION 'CE capsule key is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_project_id::text || '|' || COALESCE(p_task_id::text, '') || '|' || v_capsule_key,
    0
  ));

  SELECT capsule_id, version
  INTO v_predecessor_id, v_previous_version
  FROM comind.cm_ce_continuity_capsule
  WHERE project_id = p_project_id
    AND task_id IS NOT DISTINCT FROM p_task_id
    AND capsule_key = v_capsule_key
  ORDER BY version DESC
  LIMIT 1;

  v_version := COALESCE(v_previous_version, 0) + 1;

  v_hash := encode(extensions.digest(
    jsonb_build_object(
      'project_id', p_project_id,
      'task_id', p_task_id,
      'capsule_key', v_capsule_key,
      'version', v_version,
      'predecessor_capsule_id', v_predecessor_id,
      'objective', p_objective,
      'completion_criteria', COALESCE(p_completion_criteria, '[]'::jsonb),
      'verification_method', COALESCE(p_verification_method, '[]'::jsonb),
      'acceptance_authority', COALESCE(p_acceptance_authority, '{}'::jsonb),
      'accepted_baseline', COALESCE(p_accepted_baseline, '{}'::jsonb),
      'authoritative_sources', COALESCE(p_authoritative_sources, '[]'::jsonb),
      'decisions', COALESCE(p_decisions, '[]'::jsonb),
      'constraints', COALESCE(p_constraints, '[]'::jsonb),
      'last_verified_action', p_last_verified_action,
      'active_work', COALESCE(p_active_work, '[]'::jsonb),
      'unresolved', COALESCE(p_unresolved, '[]'::jsonb),
      'blockers', COALESCE(p_blockers, '[]'::jsonb),
      'pending_approvals', COALESCE(p_pending_approvals, '[]'::jsonb),
      'next_safe_action', p_next_safe_action,
      'rollback_point', p_rollback_point,
      'recovery_state', COALESCE(p_recovery_state, 'ready'),
      'confidence', COALESCE(p_confidence, 'verified'),
      'source_system', p_source_system,
      'source_ref', p_source_ref,
      'captured_by_actor_id', p_captured_by_actor_id
    )::text,
    'sha256'
  ), 'hex');

  INSERT INTO comind.cm_ce_continuity_capsule (
    project_id, task_id, capsule_key, version, predecessor_capsule_id,
    objective, completion_criteria, verification_method, acceptance_authority,
    accepted_baseline, authoritative_sources, decisions, constraints,
    last_verified_action, active_work, unresolved, blockers, pending_approvals,
    next_safe_action, rollback_point, recovery_state, confidence,
    source_system, source_ref, captured_by_actor_id, content_hash
  ) VALUES (
    p_project_id,
    p_task_id,
    v_capsule_key,
    v_version,
    v_predecessor_id,
    p_objective,
    COALESCE(p_completion_criteria, '[]'::jsonb),
    COALESCE(p_verification_method, '[]'::jsonb),
    COALESCE(p_acceptance_authority, '{}'::jsonb),
    COALESCE(p_accepted_baseline, '{}'::jsonb),
    COALESCE(p_authoritative_sources, '[]'::jsonb),
    COALESCE(p_decisions, '[]'::jsonb),
    COALESCE(p_constraints, '[]'::jsonb),
    p_last_verified_action,
    COALESCE(p_active_work, '[]'::jsonb),
    COALESCE(p_unresolved, '[]'::jsonb),
    COALESCE(p_blockers, '[]'::jsonb),
    COALESCE(p_pending_approvals, '[]'::jsonb),
    p_next_safe_action,
    p_rollback_point,
    COALESCE(p_recovery_state, 'ready'),
    COALESCE(p_confidence, 'verified'),
    p_source_system,
    p_source_ref,
    p_captured_by_actor_id,
    v_hash
  ) RETURNING capsule_id INTO v_capsule_id;

  RETURN v_capsule_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.open_ce_improvement(
  p_project_id uuid,
  p_task_id uuid,
  p_owner_actor_id uuid,
  p_title text,
  p_category text,
  p_rationale text,
  p_signal_ids uuid[],
  p_actor_id uuid,
  p_source_system text,
  p_source_ref text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_improvement_id uuid;
  v_signal_id uuid;
BEGIN
  INSERT INTO comind.cm_ce_improvement (
    project_id, task_id, owner_actor_id, title, category, rationale
  ) VALUES (
    p_project_id, p_task_id, p_owner_actor_id, p_title, p_category, p_rationale
  ) RETURNING improvement_id INTO v_improvement_id;

  INSERT INTO comind.cm_ce_improvement_event (
    improvement_id, actor_id, event_type, outcome, summary, details, source_system, source_ref
  ) VALUES (
    v_improvement_id,
    p_actor_id,
    'proposed',
    'pending',
    'Improvement proposed',
    '{}'::jsonb,
    p_source_system,
    p_source_ref
  );

  FOREACH v_signal_id IN ARRAY COALESCE(p_signal_ids, ARRAY[]::uuid[]) LOOP
    INSERT INTO comind.cm_ce_improvement_signal (improvement_id, signal_id)
    VALUES (v_improvement_id, v_signal_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN v_improvement_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.record_ce_improvement_event(
  p_improvement_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_outcome text,
  p_summary text,
  p_details jsonb,
  p_source_system text,
  p_source_ref text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO comind.cm_ce_improvement_event (
    improvement_id, actor_id, event_type, outcome, summary, details, source_system, source_ref
  ) VALUES (
    p_improvement_id,
    p_actor_id,
    p_event_type,
    COALESCE(p_outcome, 'pending'),
    p_summary,
    COALESCE(p_details, '{}'::jsonb),
    p_source_system,
    p_source_ref
  ) RETURNING event_id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

ALTER TABLE comind.cm_ce_signal ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ce_signal_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ce_improvement ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ce_improvement_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ce_improvement_signal ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ce_improvement_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ce_continuity_capsule ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_ce_capsule_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  comind.cm_ce_signal,
  comind.cm_ce_signal_evidence,
  comind.cm_ce_improvement,
  comind.cm_ce_improvement_event,
  comind.cm_ce_improvement_signal,
  comind.cm_ce_improvement_evidence,
  comind.cm_ce_continuity_capsule,
  comind.cm_ce_capsule_evidence,
  comind.v_ce_current_continuity_capsule,
  comind.v_ce_signal_backlog,
  comind.v_ce_improvement_state
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  comind.record_ce_signal(uuid, uuid, uuid, text, text, boolean, text, jsonb, text, text, text, timestamptz),
  comind.capture_ce_continuity_capsule(uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb, text, text, text, text, text, text, uuid),
  comind.open_ce_improvement(uuid, uuid, uuid, text, text, text, uuid[], uuid, text, text),
  comind.record_ce_improvement_event(uuid, uuid, text, text, text, jsonb, text, text)
FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA comind TO service_role;
GRANT SELECT ON TABLE
  comind.cm_ce_signal,
  comind.cm_ce_signal_evidence,
  comind.cm_ce_improvement,
  comind.cm_ce_improvement_event,
  comind.cm_ce_improvement_signal,
  comind.cm_ce_improvement_evidence,
  comind.cm_ce_continuity_capsule,
  comind.cm_ce_capsule_evidence,
  comind.v_ce_current_continuity_capsule,
  comind.v_ce_signal_backlog,
  comind.v_ce_improvement_state
TO service_role;

GRANT EXECUTE ON FUNCTION
  comind.record_ce_signal(uuid, uuid, uuid, text, text, boolean, text, jsonb, text, text, text, timestamptz),
  comind.capture_ce_continuity_capsule(uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb, jsonb, text, text, text, text, text, text, uuid),
  comind.open_ce_improvement(uuid, uuid, uuid, text, text, text, uuid[], uuid, text, text),
  comind.record_ce_improvement_event(uuid, uuid, text, text, text, jsonb, text, text)
TO service_role;

CREATE OR REPLACE VIEW public.v_ce_operator_summary
WITH (security_invoker = true)
AS
SELECT
  now() AS generated_at,
  (SELECT count(*) FROM comind.cm_ce_signal) AS signal_count,
  (SELECT count(*) FROM comind.v_ce_signal_backlog) AS actionable_backlog_count,
  (SELECT count(*) FROM comind.cm_ce_signal WHERE signal_type = 'recovery_interrupt') AS recovery_interrupt_count,
  (SELECT count(*) FROM comind.v_ce_current_continuity_capsule) AS current_capsule_count,
  (SELECT count(*) FROM comind.v_ce_current_continuity_capsule WHERE recovery_state = 'ready') AS recovery_ready_count,
  (SELECT count(*) FROM comind.v_ce_current_continuity_capsule WHERE recovery_state IN ('partial', 'blocked', 'uncertain')) AS recovery_attention_count,
  (SELECT count(*) FROM comind.cm_ce_improvement) AS improvement_count,
  (SELECT count(*) FROM comind.v_ce_improvement_state WHERE current_state IN ('validated', 'measured', 'retained')) AS validated_improvement_count,
  (SELECT max(observed_at) FROM comind.cm_ce_signal) AS latest_signal_at,
  (SELECT max(captured_at) FROM comind.cm_ce_continuity_capsule) AS latest_capsule_at;

CREATE OR REPLACE VIEW public.v_ce_operator_state_counts
WITH (security_invoker = true)
AS
SELECT 'signal_type'::text AS dimension, signal_type AS state, count(*) AS item_count
FROM comind.cm_ce_signal
GROUP BY signal_type
UNION ALL
SELECT 'severity'::text, severity, count(*)
FROM comind.cm_ce_signal
GROUP BY severity
UNION ALL
SELECT 'recovery_state'::text, recovery_state, count(*)
FROM comind.v_ce_current_continuity_capsule
GROUP BY recovery_state
UNION ALL
SELECT 'improvement_state'::text, COALESCE(current_state, 'proposed_without_event'), count(*)
FROM comind.v_ce_improvement_state
GROUP BY COALESCE(current_state, 'proposed_without_event');

REVOKE ALL ON TABLE public.v_ce_operator_summary, public.v_ce_operator_state_counts
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.v_ce_operator_summary, public.v_ce_operator_state_counts
TO service_role;

COMMENT ON TABLE comind.cm_ce_signal IS 'Immutable Continuous Excellence observations including friction, failure, recovery interrupts, missingness, regressions, opportunities, completion gaps, and continuity risks.';
COMMENT ON TABLE comind.cm_ce_continuity_capsule IS 'Immutable, versioned recovery package. Each successor names exactly one predecessor and preserves a deterministic SHA-256 content hash.';
COMMENT ON TABLE comind.cm_ce_improvement IS 'Stable identity for a Continuous Excellence improvement. Lifecycle changes are recorded in append-only cm_ce_improvement_event rows.';
COMMENT ON VIEW public.v_ce_operator_summary IS 'Service-role-only aggregate projection for the trusted Operator Console. No CE narrative content is exposed.';
