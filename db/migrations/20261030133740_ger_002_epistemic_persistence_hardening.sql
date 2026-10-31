BEGIN;

ALTER TABLE comind.cm_epistemic_object
  DROP CONSTRAINT IF EXISTS cm_epistemic_object_connection_initial;

ALTER TABLE comind.cm_epistemic_event
  DROP CONSTRAINT IF EXISTS cm_epistemic_event_target_shape;
ALTER TABLE comind.cm_epistemic_event
  ADD CONSTRAINT cm_epistemic_event_target_shape CHECK (
    (event_type = 'object_recorded' AND target_object_id IS NOT NULL AND target_relationship_id IS NULL)
    OR (event_type = 'relationship_recorded' AND target_object_id IS NULL AND target_relationship_id IS NOT NULL)
    OR (event_type = 'state_transition' AND target_object_id IS NOT NULL AND target_relationship_id IS NULL)
    OR (event_type IN ('review_recorded','monitoring_recorded','source_status_changed') AND target_relationship_id IS NULL)
    OR (event_type IN ('case_opened','case_concluded','case_reopened','case_closed','authority_changed')
        AND target_object_id IS NULL AND target_relationship_id IS NULL)
  );

CREATE OR REPLACE FUNCTION comind.cm_validate_epistemic_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  prior_row comind.cm_epistemic_event%ROWTYPE;
  current_state text;
  target_type text;
  lifecycle_type text;
BEGIN
  IF NEW.prior_event_id IS NULL THEN
    IF NEW.event_type <> 'case_opened' THEN
      RAISE EXCEPTION 'GER case event lineage must begin with case_opened';
    END IF;
  ELSE
    SELECT * INTO prior_row
      FROM comind.cm_epistemic_event
     WHERE case_id = NEW.case_id
       AND event_id = NEW.prior_event_id;
    IF prior_row.event_id IS NULL THEN
      RAISE EXCEPTION 'GER prior event is unavailable';
    END IF;
    IF NEW.event_type = 'case_opened' THEN
      RAISE EXCEPTION 'GER case_opened event is root-only';
    END IF;
    IF NEW.recorded_at < prior_row.recorded_at THEN
      RAISE EXCEPTION 'GER event cannot precede its prior event';
    END IF;
  END IF;

  IF NEW.event_type = 'state_transition' THEN
    SELECT o.object_type,
           COALESCE(
             (
               SELECT e.to_state
                 FROM comind.cm_epistemic_event e
                WHERE e.case_id = NEW.case_id
                  AND e.target_object_id = NEW.target_object_id
                  AND e.event_type = 'state_transition'
                ORDER BY e.persistence_seq DESC
                LIMIT 1
             ),
             o.initial_state
           )
      INTO target_type, current_state
      FROM comind.cm_epistemic_object o
     WHERE o.case_id = NEW.case_id
       AND o.object_id = NEW.target_object_id;

    IF target_type IS NULL THEN
      RAISE EXCEPTION 'GER transition target object is unavailable';
    END IF;
    IF NEW.from_state IS DISTINCT FROM current_state THEN
      RAISE EXCEPTION 'GER transition from_state is stale; expected %, received %', current_state, NEW.from_state;
    END IF;
    IF NOT comind.cm_ger_transition_allowed(NEW.from_state, NEW.to_state) THEN
      RAISE EXCEPTION 'Illegal GER state transition from % to %', NEW.from_state, NEW.to_state;
    END IF;
    IF target_type = 'connection_candidate' AND NEW.to_state = 'concluded' THEN
      RAISE EXCEPTION 'GER connection candidate cannot be concluded directly';
    END IF;
    IF jsonb_array_length(NEW.evidence_refs) = 0 AND NEW.to_state <> 'suspected' THEN
      RAISE EXCEPTION 'GER material state transition requires evidence references';
    END IF;
  END IF;

  IF NEW.event_type IN ('case_concluded','case_closed')
     AND jsonb_array_length(NEW.evidence_refs) = 0 THEN
    RAISE EXCEPTION 'GER case conclusion or closure requires evidence references';
  END IF;

  IF NEW.event_type = 'source_status_changed'
     AND jsonb_array_length(NEW.evidence_refs) = 0
     AND jsonb_array_length(NEW.source_refs) = 0 THEN
    RAISE EXCEPTION 'GER source-status change requires evidence or source references';
  END IF;

  IF NEW.event_type = 'authority_changed' AND NEW.authority_ref IS NULL THEN
    RAISE EXCEPTION 'GER authority_changed event requires authority_ref';
  END IF;

  IF NEW.event_type = 'case_reopened' THEN
    SELECT e.event_type
      INTO lifecycle_type
      FROM comind.cm_epistemic_event e
     WHERE e.case_id = NEW.case_id
       AND e.event_type IN ('case_opened','case_concluded','case_reopened','case_closed')
     ORDER BY e.persistence_seq DESC
     LIMIT 1;
    IF lifecycle_type NOT IN ('case_concluded','case_closed') THEN
      RAISE EXCEPTION 'GER case can reopen only after conclusion or closure';
    END IF;
    IF jsonb_array_length(NEW.evidence_refs) = 0 THEN
      RAISE EXCEPTION 'GER case reopening requires material evidence references';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_validate_epistemic_event() FROM PUBLIC;

COMMIT;
