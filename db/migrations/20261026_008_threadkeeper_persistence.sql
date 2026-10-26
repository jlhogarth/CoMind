-- TK-004 minimum ThreadKeeper persistence substrate.
-- Compact control-plane state only. Raw observations, conversations, and telemetry remain in their source systems.
BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_reject_threadkeeper_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION 'ThreadKeeper control-plane rows are append-only and immutable';
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_threadkeeper_scope (
  scope_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN (
    'conversation', 'plan', 'decision_lineage', 'commitment', 'handoff', 'workstream', 'governed_workflow'
  )),
  namespace text NOT NULL CHECK (namespace <> '' AND btrim(namespace) = namespace AND char_length(namespace) <= 256),
  subject_ref text NOT NULL CHECK (subject_ref <> '' AND btrim(subject_ref) = subject_ref AND char_length(subject_ref) <= 2048),
  semantic_key text NOT NULL UNIQUE CHECK (semantic_key ~ '^tk-scope:[a-f0-9]{64}$'),
  sensitivity_class text NOT NULL CHECK (sensitivity_class <> '' AND btrim(sensitivity_class) = sensitivity_class AND char_length(sensitivity_class) <= 128),
  retention_class text NOT NULL CHECK (retention_class <> '' AND btrim(retention_class) = retention_class AND char_length(retention_class) <= 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_ref text NOT NULL CHECK (created_by_ref <> '' AND btrim(created_by_ref) = created_by_ref AND char_length(created_by_ref) <= 512),
  CONSTRAINT cm_threadkeeper_scope_semantic_identity UNIQUE (scope_type, namespace, subject_ref)
);

COMMENT ON TABLE comind.cm_threadkeeper_scope IS
  'Immutable ThreadKeeper semantic continuity-scope identities. Source payload ownership remains outside ThreadKeeper. Scope closure is not part of the C2 persistence proof.';

CREATE TABLE IF NOT EXISTS comind.cm_threadkeeper_checkpoint (
  checkpoint_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persistence_seq bigint GENERATED ALWAYS AS IDENTITY,
  scope_id uuid NOT NULL REFERENCES comind.cm_threadkeeper_scope(scope_id) ON DELETE RESTRICT,
  parent_checkpoint_id uuid NULL,
  proposal_id text NOT NULL CHECK (proposal_id <> '' AND btrim(proposal_id) = proposal_id AND char_length(proposal_id) <= 512),
  checkpoint_version smallint NOT NULL DEFAULT 1 CHECK (checkpoint_version = 1),
  scope_semantic_key text NOT NULL CHECK (scope_semantic_key ~ '^tk-scope:[a-f0-9]{64}$'),
  proposed_at timestamptz NOT NULL,
  proposed_by_ref text NOT NULL CHECK (proposed_by_ref <> '' AND btrim(proposed_by_ref) = proposed_by_ref AND char_length(proposed_by_ref) <= 512),
  accepted_at timestamptz NOT NULL,
  accepted_by_ref text NOT NULL CHECK (accepted_by_ref <> '' AND btrim(accepted_by_ref) = accepted_by_ref AND char_length(accepted_by_ref) <= 512),
  authority_evidence_ref text NOT NULL CHECK (authority_evidence_ref <> '' AND btrim(authority_evidence_ref) = authority_evidence_ref AND char_length(authority_evidence_ref) <= 4096),
  policy_ref text NULL CHECK (policy_ref IS NULL OR (policy_ref <> '' AND btrim(policy_ref) = policy_ref AND char_length(policy_ref) <= 512)),
  state_digest char(64) NOT NULL CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  digest char(64) NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  proposal jsonb NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_threadkeeper_checkpoint_scope_checkpoint UNIQUE (scope_id, checkpoint_id),
  CONSTRAINT cm_threadkeeper_checkpoint_proposal_identity UNIQUE (scope_id, proposal_id),
  CONSTRAINT cm_threadkeeper_checkpoint_parent_same_scope
    FOREIGN KEY (scope_id, parent_checkpoint_id)
    REFERENCES comind.cm_threadkeeper_checkpoint(scope_id, checkpoint_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_threadkeeper_checkpoint_acceptance_time CHECK (accepted_at >= proposed_at),
  CONSTRAINT cm_threadkeeper_checkpoint_json_object CHECK (jsonb_typeof(proposal) = 'object'),
  CONSTRAINT cm_threadkeeper_checkpoint_json_version CHECK ((proposal->>'version') = '1'),
  CONSTRAINT cm_threadkeeper_checkpoint_json_proposal CHECK ((proposal->>'proposalId') = proposal_id),
  CONSTRAINT cm_threadkeeper_checkpoint_json_scope CHECK ((proposal->>'scopeSemanticKey') = scope_semantic_key),
  CONSTRAINT cm_threadkeeper_checkpoint_json_parent CHECK ((proposal->>'parentCheckpointId') IS NOT DISTINCT FROM parent_checkpoint_id::text),
  CONSTRAINT cm_threadkeeper_checkpoint_json_current_head CHECK ((proposal->>'currentAcceptedCheckpointId') IS NOT DISTINCT FROM parent_checkpoint_id::text),
  CONSTRAINT cm_threadkeeper_checkpoint_json_proposer CHECK ((proposal->>'proposedByRef') = proposed_by_ref),
  CONSTRAINT cm_threadkeeper_checkpoint_json_state_digest CHECK ((proposal->>'stateDigest') = state_digest),
  CONSTRAINT cm_threadkeeper_checkpoint_json_digest CHECK ((proposal->>'digest') = digest),
  CONSTRAINT cm_threadkeeper_checkpoint_json_state CHECK (jsonb_typeof(proposal->'state') = 'object')
);

CREATE INDEX IF NOT EXISTS idx_cm_threadkeeper_checkpoint_scope_recent
  ON comind.cm_threadkeeper_checkpoint (scope_id, persistence_seq DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_threadkeeper_checkpoint_root
  ON comind.cm_threadkeeper_checkpoint (scope_id)
  WHERE parent_checkpoint_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_threadkeeper_checkpoint_successor
  ON comind.cm_threadkeeper_checkpoint (scope_id, parent_checkpoint_id)
  WHERE parent_checkpoint_id IS NOT NULL;

COMMENT ON TABLE comind.cm_threadkeeper_checkpoint IS
  'Immutable externally authorized ThreadKeeper checkpoints. One root and at most one accepted successor per predecessor preserve linear accepted lineage without a mutable head row.';

CREATE TABLE IF NOT EXISTS comind.cm_threadkeeper_assessment (
  assessment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persistence_seq bigint GENERATED ALWAYS AS IDENTITY,
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key <> '' AND btrim(idempotency_key) = idempotency_key AND char_length(idempotency_key) <= 512),
  scope_id uuid NOT NULL REFERENCES comind.cm_threadkeeper_scope(scope_id) ON DELETE RESTRICT,
  checkpoint_id uuid NULL,
  observation_id text NOT NULL CHECK (observation_id <> '' AND btrim(observation_id) = observation_id AND char_length(observation_id) <= 512),
  classification text NOT NULL CHECK (classification IN (
    'INTACT', 'CHANGED_WITH_LINEAGE', 'SUSPECTED_BREAK', 'CONFIRMED_BREAK', 'UNRESOLVED_CONFLICT', 'BLOCKED'
  )),
  reason_codes jsonb NOT NULL CHECK (jsonb_typeof(reason_codes) = 'array'),
  break_types jsonb NOT NULL CHECK (jsonb_typeof(break_types) = 'array'),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  uncertainty numeric NOT NULL CHECK (uncertainty >= 0 AND uncertainty <= 1),
  evidence_refs jsonb NOT NULL CHECK (jsonb_typeof(evidence_refs) = 'array'),
  trace_id text NULL CHECK (trace_id IS NULL OR (trace_id <> '' AND btrim(trace_id) = trace_id AND char_length(trace_id) <= 256)),
  assessor_version text NOT NULL CHECK (assessor_version <> '' AND btrim(assessor_version) = assessor_version AND char_length(assessor_version) <= 256),
  assessment_digest char(64) NOT NULL CHECK (assessment_digest ~ '^[a-f0-9]{64}$'),
  assessment jsonb NOT NULL CHECK (jsonb_typeof(assessment) = 'object'),
  created_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_threadkeeper_assessment_scope_assessment UNIQUE (scope_id, assessment_id),
  CONSTRAINT cm_threadkeeper_assessment_checkpoint_same_scope
    FOREIGN KEY (scope_id, checkpoint_id)
    REFERENCES comind.cm_threadkeeper_checkpoint(scope_id, checkpoint_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_threadkeeper_assessment_json_classification CHECK ((assessment->>'classification') = classification),
  CONSTRAINT cm_threadkeeper_assessment_json_observation CHECK ((assessment->>'observationId') = observation_id),
  CONSTRAINT cm_threadkeeper_assessment_json_checkpoint CHECK ((assessment->>'checkpointId') IS NOT DISTINCT FROM checkpoint_id::text),
  CONSTRAINT cm_threadkeeper_assessment_json_reasons CHECK ((assessment->'reasonCodes') = reason_codes),
  CONSTRAINT cm_threadkeeper_assessment_json_breaks CHECK ((assessment->'breakTypes') = break_types),
  CONSTRAINT cm_threadkeeper_assessment_json_evidence CHECK ((assessment->'evidenceRefs') = evidence_refs),
  CONSTRAINT cm_threadkeeper_assessment_json_version CHECK ((assessment->>'assessorVersion') = assessor_version)
);

CREATE INDEX IF NOT EXISTS idx_cm_threadkeeper_assessment_scope_recent
  ON comind.cm_threadkeeper_assessment (scope_id, persistence_seq DESC);

COMMENT ON TABLE comind.cm_threadkeeper_assessment IS
  'Immutable deterministic ThreadKeeper assessment evidence. Reassessment uses a new row and idempotency key rather than rewriting prior evidence.';

CREATE TABLE IF NOT EXISTS comind.cm_threadkeeper_case (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_key text NOT NULL UNIQUE CHECK (case_key <> '' AND btrim(case_key) = case_key AND char_length(case_key) <= 512),
  scope_id uuid NOT NULL REFERENCES comind.cm_threadkeeper_scope(scope_id) ON DELETE RESTRICT,
  opened_from_assessment_id uuid NOT NULL,
  opened_at timestamptz NOT NULL,
  opened_by_ref text NOT NULL CHECK (opened_by_ref <> '' AND btrim(opened_by_ref) = opened_by_ref AND char_length(opened_by_ref) <= 512),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_threadkeeper_case_scope_assessment
    FOREIGN KEY (scope_id, opened_from_assessment_id)
    REFERENCES comind.cm_threadkeeper_assessment(scope_id, assessment_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_threadkeeper_case_open_assessment_unique UNIQUE (opened_from_assessment_id)
);

COMMENT ON TABLE comind.cm_threadkeeper_case IS
  'Immutable continuity-case identity. Current case state is derived only from append-only transitions.';

CREATE TABLE IF NOT EXISTS comind.cm_threadkeeper_case_transition (
  transition_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persistence_seq bigint GENERATED ALWAYS AS IDENTITY,
  transition_key text NOT NULL UNIQUE CHECK (transition_key <> '' AND btrim(transition_key) = transition_key AND char_length(transition_key) <= 512),
  case_id uuid NOT NULL REFERENCES comind.cm_threadkeeper_case(case_id) ON DELETE RESTRICT,
  prior_transition_id uuid NULL,
  from_state text NULL CHECK (from_state IS NULL OR from_state IN (
    'OBSERVED', 'ASSESSED', 'ROUTED', 'RESOLVED', 'ACCEPTED_DIVERGENCE', 'BLOCKED', 'UNRESOLVED'
  )),
  to_state text NOT NULL CHECK (to_state IN (
    'OBSERVED', 'ASSESSED', 'ROUTED', 'RESOLVED', 'ACCEPTED_DIVERGENCE', 'BLOCKED', 'UNRESOLVED'
  )),
  route_code text NULL CHECK (route_code IS NULL OR route_code IN (
    'REQUEST_EVIDENCE', 'REQUEST_HELPER_ANALYSIS', 'REQUEST_EPISTEMIC_REVIEW', 'REQUEST_SEAL_REVIEW',
    'REQUEST_GOVERNANCE_REVIEW', 'REQUEST_HUMAN_REVIEW', 'PROPOSE_AUTHORIZED_DIVERGENCE',
    'RETAIN_UNRESOLVED', 'PAUSE_DEPENDENT_ACTION'
  )),
  actor_ref text NOT NULL CHECK (actor_ref <> '' AND btrim(actor_ref) = actor_ref AND char_length(actor_ref) <= 512),
  authority_evidence_ref text NULL CHECK (authority_evidence_ref IS NULL OR (authority_evidence_ref <> '' AND btrim(authority_evidence_ref) = authority_evidence_ref AND char_length(authority_evidence_ref) <= 4096)),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  resolution_ref text NULL CHECK (resolution_ref IS NULL OR (resolution_ref <> '' AND btrim(resolution_ref) = resolution_ref AND char_length(resolution_ref) <= 4096)),
  successor_checkpoint_id uuid NULL REFERENCES comind.cm_threadkeeper_checkpoint(checkpoint_id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL,
  transition_digest char(64) NOT NULL CHECK (transition_digest ~ '^[a-f0-9]{64}$'),
  transition jsonb NOT NULL CHECK (jsonb_typeof(transition) = 'object'),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_threadkeeper_transition_case_transition UNIQUE (case_id, transition_id),
  CONSTRAINT cm_threadkeeper_transition_prior_same_case
    FOREIGN KEY (case_id, prior_transition_id)
    REFERENCES comind.cm_threadkeeper_case_transition(case_id, transition_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_threadkeeper_transition_json_from CHECK ((transition->>'fromState') IS NOT DISTINCT FROM from_state),
  CONSTRAINT cm_threadkeeper_transition_json_to CHECK ((transition->>'toState') = to_state),
  CONSTRAINT cm_threadkeeper_transition_json_route CHECK ((transition->>'routeCode') IS NOT DISTINCT FROM route_code),
  CONSTRAINT cm_threadkeeper_transition_json_actor CHECK ((transition->>'actorRef') = actor_ref),
  CONSTRAINT cm_threadkeeper_transition_json_authority CHECK ((transition->>'authorityEvidenceRef') IS NOT DISTINCT FROM authority_evidence_ref),
  CONSTRAINT cm_threadkeeper_transition_json_resolution CHECK ((transition->>'resolutionRef') IS NOT DISTINCT FROM resolution_ref),
  CONSTRAINT cm_threadkeeper_transition_json_successor CHECK ((transition->>'successorCheckpointId') IS NOT DISTINCT FROM successor_checkpoint_id::text)
);

CREATE INDEX IF NOT EXISTS idx_cm_threadkeeper_transition_case_recent
  ON comind.cm_threadkeeper_case_transition (case_id, persistence_seq DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_threadkeeper_transition_root
  ON comind.cm_threadkeeper_case_transition (case_id)
  WHERE prior_transition_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_threadkeeper_transition_successor
  ON comind.cm_threadkeeper_case_transition (case_id, prior_transition_id)
  WHERE prior_transition_id IS NOT NULL;

CREATE OR REPLACE FUNCTION comind.cm_validate_threadkeeper_case_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  prior_state text;
BEGIN
  IF NEW.prior_transition_id IS NULL THEN
    IF NEW.from_state IS NOT NULL OR NEW.to_state <> 'OBSERVED' THEN
      RAISE EXCEPTION 'ThreadKeeper case must begin with OBSERVED';
    END IF;
  ELSE
    SELECT t.to_state
      INTO prior_state
      FROM comind.cm_threadkeeper_case_transition t
     WHERE t.case_id = NEW.case_id
       AND t.transition_id = NEW.prior_transition_id;

    IF prior_state IS NULL THEN
      RAISE EXCEPTION 'ThreadKeeper prior case transition is unavailable';
    END IF;
    IF NEW.from_state IS DISTINCT FROM prior_state THEN
      RAISE EXCEPTION 'ThreadKeeper case transition from_state does not match prior state';
    END IF;

    IF NOT (
      (prior_state = 'OBSERVED' AND NEW.to_state IN ('ASSESSED', 'BLOCKED', 'UNRESOLVED')) OR
      (prior_state = 'ASSESSED' AND NEW.to_state IN ('ASSESSED', 'ROUTED', 'BLOCKED', 'UNRESOLVED')) OR
      (prior_state = 'ROUTED' AND NEW.to_state IN ('ASSESSED', 'RESOLVED', 'ACCEPTED_DIVERGENCE', 'BLOCKED', 'UNRESOLVED')) OR
      (prior_state = 'BLOCKED' AND NEW.to_state = 'ASSESSED') OR
      (prior_state = 'UNRESOLVED' AND NEW.to_state = 'ASSESSED')
    ) THEN
      RAISE EXCEPTION 'Illegal ThreadKeeper case transition from % to %', prior_state, NEW.to_state;
    END IF;
  END IF;

  IF NEW.to_state = 'ROUTED' AND NEW.route_code IS NULL THEN
    RAISE EXCEPTION 'ROUTED ThreadKeeper case transition requires route_code';
  END IF;
  IF NEW.to_state = 'RESOLVED' AND NEW.resolution_ref IS NULL THEN
    RAISE EXCEPTION 'RESOLVED ThreadKeeper case transition requires resolution_ref';
  END IF;
  IF NEW.to_state = 'ACCEPTED_DIVERGENCE'
     AND (NEW.authority_evidence_ref IS NULL OR NEW.successor_checkpoint_id IS NULL) THEN
    RAISE EXCEPTION 'ACCEPTED_DIVERGENCE requires authority evidence and successor checkpoint';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_threadkeeper_transition_validate
  ON comind.cm_threadkeeper_case_transition;
CREATE TRIGGER trg_cm_threadkeeper_transition_validate
BEFORE INSERT ON comind.cm_threadkeeper_case_transition
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_threadkeeper_case_transition();

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'cm_threadkeeper_scope',
    'cm_threadkeeper_checkpoint',
    'cm_threadkeeper_assessment',
    'cm_threadkeeper_case',
    'cm_threadkeeper_case_transition'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON comind.%I', 'trg_' || target_table || '_immutable', target_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON comind.%I FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_threadkeeper_mutation()',
      'trg_' || target_table || '_immutable', target_table
    );
    EXECUTE format('ALTER TABLE comind.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM PUBLIC, anon, authenticated', target_table);
    EXECUTE format('GRANT SELECT, INSERT ON TABLE comind.%I TO service_role', target_table);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_reject_threadkeeper_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_validate_threadkeeper_case_transition() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_reject_threadkeeper_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_validate_threadkeeper_case_transition() TO service_role;

GRANT USAGE, SELECT ON SEQUENCE comind.cm_threadkeeper_checkpoint_persistence_seq_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE comind.cm_threadkeeper_assessment_persistence_seq_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE comind.cm_threadkeeper_case_transition_persistence_seq_seq TO service_role;

COMMENT ON TABLE comind.cm_threadkeeper_case_transition IS
  'Append-only continuity-case history. Reassessment is an explicit transition to ASSESSED; RESOLVED and ACCEPTED_DIVERGENCE are terminal in C2.';

COMMIT;
