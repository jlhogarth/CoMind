-- TK-004 defense-in-depth cross-table integrity for ThreadKeeper persistence.
BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_validate_threadkeeper_checkpoint_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  expected_semantic_key text;
BEGIN
  SELECT s.semantic_key
    INTO expected_semantic_key
    FROM comind.cm_threadkeeper_scope s
   WHERE s.scope_id = NEW.scope_id;

  IF expected_semantic_key IS NULL THEN
    RAISE EXCEPTION 'ThreadKeeper checkpoint scope is unavailable';
  END IF;
  IF NEW.scope_semantic_key IS DISTINCT FROM expected_semantic_key THEN
    RAISE EXCEPTION 'ThreadKeeper checkpoint semantic scope mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_validate_threadkeeper_assessment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  expected_semantic_key text;
BEGIN
  SELECT s.semantic_key
    INTO expected_semantic_key
    FROM comind.cm_threadkeeper_scope s
   WHERE s.scope_id = NEW.scope_id;

  IF expected_semantic_key IS NULL THEN
    RAISE EXCEPTION 'ThreadKeeper assessment scope is unavailable';
  END IF;
  IF (NEW.assessment->>'scopeSemanticKey') IS DISTINCT FROM expected_semantic_key THEN
    RAISE EXCEPTION 'ThreadKeeper assessment semantic scope mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_validate_threadkeeper_case_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  source_classification text;
BEGIN
  SELECT a.classification
    INTO source_classification
    FROM comind.cm_threadkeeper_assessment a
   WHERE a.assessment_id = NEW.opened_from_assessment_id
     AND a.scope_id = NEW.scope_id;

  IF source_classification IS NULL THEN
    RAISE EXCEPTION 'ThreadKeeper case source assessment is unavailable for this scope';
  END IF;
  IF source_classification NOT IN ('SUSPECTED_BREAK','CONFIRMED_BREAK','UNRESOLVED_CONFLICT','BLOCKED') THEN
    RAISE EXCEPTION 'ThreadKeeper case source assessment is not actionable: %', source_classification;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_validate_threadkeeper_case_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  prior_state text;
  case_scope_id uuid;
  successor_scope_id uuid;
BEGIN
  SELECT c.scope_id
    INTO case_scope_id
    FROM comind.cm_threadkeeper_case c
   WHERE c.case_id = NEW.case_id;

  IF case_scope_id IS NULL THEN
    RAISE EXCEPTION 'ThreadKeeper case is unavailable for transition';
  END IF;

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

  IF NEW.successor_checkpoint_id IS NOT NULL THEN
    SELECT cp.scope_id
      INTO successor_scope_id
      FROM comind.cm_threadkeeper_checkpoint cp
     WHERE cp.checkpoint_id = NEW.successor_checkpoint_id;

    IF successor_scope_id IS NULL THEN
      RAISE EXCEPTION 'ThreadKeeper successor checkpoint is unavailable';
    END IF;
    IF successor_scope_id IS DISTINCT FROM case_scope_id THEN
      RAISE EXCEPTION 'ThreadKeeper successor checkpoint scope mismatch';
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

DROP TRIGGER IF EXISTS trg_cm_threadkeeper_checkpoint_scope_validate
  ON comind.cm_threadkeeper_checkpoint;
CREATE TRIGGER trg_cm_threadkeeper_checkpoint_scope_validate
BEFORE INSERT ON comind.cm_threadkeeper_checkpoint
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_threadkeeper_checkpoint_scope();

DROP TRIGGER IF EXISTS trg_cm_threadkeeper_assessment_scope_validate
  ON comind.cm_threadkeeper_assessment;
CREATE TRIGGER trg_cm_threadkeeper_assessment_scope_validate
BEFORE INSERT ON comind.cm_threadkeeper_assessment
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_threadkeeper_assessment_scope();

DROP TRIGGER IF EXISTS trg_cm_threadkeeper_case_open_validate
  ON comind.cm_threadkeeper_case;
CREATE TRIGGER trg_cm_threadkeeper_case_open_validate
BEFORE INSERT ON comind.cm_threadkeeper_case
FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_threadkeeper_case_open();

REVOKE ALL ON FUNCTION comind.cm_validate_threadkeeper_checkpoint_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_validate_threadkeeper_assessment_scope() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_validate_threadkeeper_case_open() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_validate_threadkeeper_checkpoint_scope() TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_validate_threadkeeper_assessment_scope() TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_validate_threadkeeper_case_open() TO service_role;

COMMIT;
