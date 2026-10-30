BEGIN;

CREATE SCHEMA IF NOT EXISTS comind;

CREATE OR REPLACE FUNCTION comind.cm_ger_payload_has_forbidden_key(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  k text;
  v jsonb;
BEGIN
  IF p_value IS NULL THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    FOR k, v IN SELECT key, value FROM jsonb_each(p_value)
    LOOP
      IF lower(k) = ANY(ARRAY[
        'prompt','raw_prompt','chain_of_thought','reasoning_trace','private_reasoning',
        'secret','password','api_key','apikey','access_token','refresh_token',
        'authorization_header','credential','credentials','raw_evidence',
        'raw_source_payload','raw_message_content','raw_conversation'
      ]) THEN
        RETURN true;
      END IF;
      IF comind.cm_ger_payload_has_forbidden_key(v) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    FOR v IN SELECT value FROM jsonb_array_elements(p_value)
    LOOP
      IF comind.cm_ger_payload_has_forbidden_key(v) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_ger_transition_allowed(p_from text, p_to text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE p_from
    WHEN 'unknown' THEN p_to IN ('observed','suspected')
    WHEN 'observed' THEN p_to IN ('investigated','corroborated','challenged','rejected')
    WHEN 'suspected' THEN p_to IN ('investigated','challenged','rejected')
    WHEN 'investigated' THEN p_to IN ('corroborated','challenged','tested','supported','rejected','inconclusive')
    WHEN 'corroborated' THEN p_to IN ('challenged','tested','supported','rejected')
    WHEN 'challenged' THEN p_to IN ('investigated','tested','supported','rejected','inconclusive')
    WHEN 'tested' THEN p_to IN ('supported','rejected','inconclusive','challenged')
    WHEN 'supported' THEN p_to IN ('challenged','concluded','rejected','inconclusive')
    WHEN 'rejected' THEN p_to IN ('reopened')
    WHEN 'inconclusive' THEN p_to IN ('investigated','reopened','rejected')
    WHEN 'concluded' THEN p_to IN ('acted_upon','monitored','challenged','reopened')
    WHEN 'acted_upon' THEN p_to IN ('monitored','reopened')
    WHEN 'monitored' THEN p_to IN ('challenged','reopened')
    WHEN 'reopened' THEN p_to IN ('investigated','challenged','tested','supported','rejected','inconclusive')
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_reject_ger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION 'GER control-plane rows are append-only and immutable';
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_epistemic_case (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persistence_seq bigint GENERATED ALWAYS AS IDENTITY,
  case_key text NOT NULL UNIQUE CHECK (case_key <> '' AND btrim(case_key) = case_key AND char_length(case_key) <= 512),
  subject_ref text NOT NULL CHECK (subject_ref <> '' AND btrim(subject_ref) = subject_ref AND char_length(subject_ref) <= 2048),
  purpose text NOT NULL CHECK (purpose <> '' AND btrim(purpose) = purpose AND char_length(purpose) <= 4096),
  environment text NOT NULL CHECK (environment IN ('development','test','production','shared')),
  initial_rigor_class smallint NOT NULL CHECK (initial_rigor_class BETWEEN 0 AND 4),
  policy_version text NOT NULL CHECK (policy_version <> '' AND btrim(policy_version) = policy_version AND char_length(policy_version) <= 256),
  data_classification text NOT NULL CHECK (data_classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','SECRET')),
  retention_profile_key text NOT NULL CHECK (retention_profile_key <> '' AND btrim(retention_profile_key) = retention_profile_key AND char_length(retention_profile_key) <= 128),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  opened_at timestamptz NOT NULL,
  opened_by_ref text NOT NULL CHECK (opened_by_ref <> '' AND btrim(opened_by_ref) = opened_by_ref AND char_length(opened_by_ref) <= 512),
  authority_ref text NULL CHECK (authority_ref IS NULL OR (authority_ref <> '' AND btrim(authority_ref) = authority_ref AND char_length(authority_ref) <= 4096)),
  case_digest char(64) NOT NULL CHECK (case_digest ~ '^[a-f0-9]{64}$'),
  case_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(case_payload) = 'object') CHECK (octet_length(case_payload::text) <= 32768) CHECK (NOT comind.cm_ger_payload_has_forbidden_key(case_payload)),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_epistemic_case_case_id UNIQUE (case_id)
);

CREATE TABLE IF NOT EXISTS comind.cm_epistemic_object (
  object_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persistence_seq bigint GENERATED ALWAYS AS IDENTITY,
  case_id uuid NOT NULL REFERENCES comind.cm_epistemic_case(case_id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE CHECK (object_key <> '' AND btrim(object_key) = object_key AND char_length(object_key) <= 512),
  object_type text NOT NULL CHECK (object_type IN (
    'observation','claim','fact','evidence','source','testimony','inference','assumption','hypothesis',
    'competing_hypothesis','connection_candidate','contradiction','uncertainty','confidence_assessment',
    'test','test_result','falsifier','unresolved_question','conclusion','decision','action','review','challenge',
    'exception','edge_case','reopening_trigger'
  )),
  initial_state text NOT NULL CHECK (initial_state IN ('unknown','observed','suspected')),
  summary text NOT NULL CHECK (summary <> '' AND btrim(summary) = summary AND char_length(summary) <= 4096),
  canonical_ref text NULL CHECK (canonical_ref IS NULL OR (canonical_ref <> '' AND btrim(canonical_ref) = canonical_ref AND char_length(canonical_ref) <= 4096)),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  valid_from timestamptz NULL,
  valid_to timestamptz NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(content) = 'object') CHECK (octet_length(content::text) <= 65536) CHECK (NOT comind.cm_ger_payload_has_forbidden_key(content)),
  content_digest char(64) NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  created_by_ref text NOT NULL CHECK (created_by_ref <> '' AND btrim(created_by_ref) = created_by_ref AND char_length(created_by_ref) <= 512),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_epistemic_object_case_object UNIQUE (case_id, object_id),
  CONSTRAINT cm_epistemic_object_validity CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from),
  CONSTRAINT cm_epistemic_object_evidence_ref CHECK (object_type <> 'evidence' OR canonical_ref IS NOT NULL),
  CONSTRAINT cm_epistemic_object_connection_initial CHECK (NOT (object_type = 'connection_candidate' AND initial_state = 'suspected' AND canonical_ref IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS comind.cm_epistemic_relationship (
  relationship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persistence_seq bigint GENERATED ALWAYS AS IDENTITY,
  relationship_key text NOT NULL UNIQUE CHECK (relationship_key <> '' AND btrim(relationship_key) = relationship_key AND char_length(relationship_key) <= 512),
  case_id uuid NOT NULL REFERENCES comind.cm_epistemic_case(case_id) ON DELETE RESTRICT,
  subject_object_id uuid NOT NULL,
  predicate text NOT NULL CHECK (predicate IN (
    'supports','contradicts','assumes','derived_from','competes_with','tests','falsifies','weakens','explains',
    'supersedes','reopens','decided_by','authorized_by','acted_by','challenges','reviews','monitors','references'
  )),
  object_object_id uuid NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz NULL,
  relationship_digest char(64) NOT NULL CHECK (relationship_digest ~ '^[a-f0-9]{64}$'),
  relationship_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(relationship_payload) = 'object') CHECK (octet_length(relationship_payload::text) <= 32768) CHECK (NOT comind.cm_ger_payload_has_forbidden_key(relationship_payload)),
  created_at timestamptz NOT NULL,
  created_by_ref text NOT NULL CHECK (created_by_ref <> '' AND btrim(created_by_ref) = created_by_ref AND char_length(created_by_ref) <= 512),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_epistemic_relationship_case_relationship UNIQUE (case_id, relationship_id),
  CONSTRAINT cm_epistemic_relationship_subject_same_case FOREIGN KEY (case_id, subject_object_id) REFERENCES comind.cm_epistemic_object(case_id, object_id) ON DELETE RESTRICT,
  CONSTRAINT cm_epistemic_relationship_object_same_case FOREIGN KEY (case_id, object_object_id) REFERENCES comind.cm_epistemic_object(case_id, object_id) ON DELETE RESTRICT,
  CONSTRAINT cm_epistemic_relationship_no_self CHECK (subject_object_id <> object_object_id),
  CONSTRAINT cm_epistemic_relationship_validity CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE TABLE IF NOT EXISTS comind.cm_epistemic_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  persistence_seq bigint GENERATED ALWAYS AS IDENTITY,
  event_key text NOT NULL UNIQUE CHECK (event_key <> '' AND btrim(event_key) = event_key AND char_length(event_key) <= 512),
  case_id uuid NOT NULL REFERENCES comind.cm_epistemic_case(case_id) ON DELETE RESTRICT,
  prior_event_id uuid NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'case_opened','object_recorded','relationship_recorded','state_transition','case_concluded','case_reopened',
    'case_closed','source_status_changed','authority_changed','review_recorded','monitoring_recorded'
  )),
  target_object_id uuid NULL,
  target_relationship_id uuid NULL,
  from_state text NULL CHECK (from_state IS NULL OR from_state IN ('unknown','observed','suspected','investigated','corroborated','challenged','tested','supported','rejected','inconclusive','concluded','acted_upon','monitored','reopened')),
  to_state text NULL CHECK (to_state IS NULL OR to_state IN ('unknown','observed','suspected','investigated','corroborated','challenged','tested','supported','rejected','inconclusive','concluded','acted_upon','monitored','reopened')),
  actor_ref text NOT NULL CHECK (actor_ref <> '' AND btrim(actor_ref) = actor_ref AND char_length(actor_ref) <= 512),
  authority_ref text NULL CHECK (authority_ref IS NULL OR (authority_ref <> '' AND btrim(authority_ref) = authority_ref AND char_length(authority_ref) <= 4096)),
  rationale text NOT NULL CHECK (rationale <> '' AND btrim(rationale) = rationale AND char_length(rationale) <= 8192),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
  policy_version text NOT NULL CHECK (policy_version <> '' AND btrim(policy_version) = policy_version AND char_length(policy_version) <= 256),
  recorded_at timestamptz NOT NULL,
  event_digest char(64) NOT NULL CHECK (event_digest ~ '^[a-f0-9]{64}$'),
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_payload) = 'object') CHECK (octet_length(event_payload::text) <= 32768) CHECK (NOT comind.cm_ger_payload_has_forbidden_key(event_payload)),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_epistemic_event_case_event UNIQUE (case_id, event_id),
  CONSTRAINT cm_epistemic_event_prior_same_case FOREIGN KEY (case_id, prior_event_id) REFERENCES comind.cm_epistemic_event(case_id, event_id) ON DELETE RESTRICT,
  CONSTRAINT cm_epistemic_event_object_same_case FOREIGN KEY (case_id, target_object_id) REFERENCES comind.cm_epistemic_object(case_id, object_id) ON DELETE RESTRICT,
  CONSTRAINT cm_epistemic_event_relationship_same_case FOREIGN KEY (case_id, target_relationship_id) REFERENCES comind.cm_epistemic_relationship(case_id, relationship_id) ON DELETE RESTRICT,
  CONSTRAINT cm_epistemic_event_state_shape CHECK ((event_type = 'state_transition' AND from_state IS NOT NULL AND to_state IS NOT NULL AND target_object_id IS NOT NULL) OR (event_type <> 'state_transition' AND from_state IS NULL AND to_state IS NULL)),
  CONSTRAINT cm_epistemic_event_object_recorded_target CHECK (event_type <> 'object_recorded' OR target_object_id IS NOT NULL),
  CONSTRAINT cm_epistemic_event_relationship_recorded_target CHECK (event_type <> 'relationship_recorded' OR target_relationship_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cm_epistemic_case_recent ON comind.cm_epistemic_case (persistence_seq DESC);
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_object_case_recent ON comind.cm_epistemic_object (case_id, persistence_seq DESC);
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_relationship_case_recent ON comind.cm_epistemic_relationship (case_id, persistence_seq DESC);
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_relationship_subject ON comind.cm_epistemic_relationship (subject_object_id);
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_relationship_object ON comind.cm_epistemic_relationship (object_object_id);
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_event_case_recent ON comind.cm_epistemic_event (case_id, persistence_seq DESC);
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_event_target_object ON comind.cm_epistemic_event (case_id, target_object_id, persistence_seq DESC) WHERE target_object_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_epistemic_event_target_relationship ON comind.cm_epistemic_event (case_id, target_relationship_id, persistence_seq DESC) WHERE target_relationship_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_epistemic_event_root ON comind.cm_epistemic_event(case_id) WHERE prior_event_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_epistemic_event_successor ON comind.cm_epistemic_event(case_id, prior_event_id) WHERE prior_event_id IS NOT NULL;

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
    IF NEW.event_type <> 'case_opened' THEN RAISE EXCEPTION 'GER case event lineage must begin with case_opened'; END IF;
    IF NEW.target_object_id IS NOT NULL OR NEW.target_relationship_id IS NOT NULL THEN RAISE EXCEPTION 'GER case_opened event cannot target an object or relationship'; END IF;
  ELSE
    SELECT * INTO prior_row FROM comind.cm_epistemic_event WHERE case_id = NEW.case_id AND event_id = NEW.prior_event_id;
    IF prior_row.event_id IS NULL THEN RAISE EXCEPTION 'GER prior event is unavailable'; END IF;
    IF NEW.event_type = 'case_opened' THEN RAISE EXCEPTION 'GER case_opened event is root-only'; END IF;
    IF NEW.recorded_at < prior_row.recorded_at THEN RAISE EXCEPTION 'GER event cannot precede its prior event'; END IF;
  END IF;

  IF NEW.event_type = 'state_transition' THEN
    SELECT o.object_type,
           COALESCE((SELECT e.to_state FROM comind.cm_epistemic_event e WHERE e.case_id = NEW.case_id AND e.target_object_id = NEW.target_object_id AND e.event_type = 'state_transition' ORDER BY e.persistence_seq DESC LIMIT 1), o.initial_state)
      INTO target_type, current_state
      FROM comind.cm_epistemic_object o WHERE o.case_id = NEW.case_id AND o.object_id = NEW.target_object_id;
    IF target_type IS NULL THEN RAISE EXCEPTION 'GER transition target object is unavailable'; END IF;
    IF NEW.from_state IS DISTINCT FROM current_state THEN RAISE EXCEPTION 'GER transition from_state is stale; expected %, received %', current_state, NEW.from_state; END IF;
    IF NOT comind.cm_ger_transition_allowed(NEW.from_state, NEW.to_state) THEN RAISE EXCEPTION 'Illegal GER state transition from % to %', NEW.from_state, NEW.to_state; END IF;
    IF target_type = 'connection_candidate' AND NEW.to_state = 'concluded' THEN RAISE EXCEPTION 'GER connection candidate cannot be concluded directly'; END IF;
    IF jsonb_array_length(NEW.evidence_refs) = 0 AND NEW.to_state <> 'suspected' THEN RAISE EXCEPTION 'GER material state transition requires evidence references'; END IF;
  END IF;

  IF NEW.event_type = 'authority_changed' AND NEW.authority_ref IS NULL THEN RAISE EXCEPTION 'GER authority_changed event requires authority_ref'; END IF;
  IF NEW.event_type = 'case_reopened' THEN
    SELECT e.event_type INTO lifecycle_type FROM comind.cm_epistemic_event e WHERE e.case_id = NEW.case_id AND e.event_type IN ('case_opened','case_concluded','case_reopened','case_closed') ORDER BY e.persistence_seq DESC LIMIT 1;
    IF lifecycle_type NOT IN ('case_concluded','case_closed') THEN RAISE EXCEPTION 'GER case can reopen only after conclusion or closure'; END IF;
    IF jsonb_array_length(NEW.evidence_refs) = 0 THEN RAISE EXCEPTION 'GER case reopening requires material evidence references'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_epistemic_event_validate ON comind.cm_epistemic_event;
CREATE TRIGGER trg_cm_epistemic_event_validate BEFORE INSERT ON comind.cm_epistemic_event FOR EACH ROW EXECUTE FUNCTION comind.cm_validate_epistemic_event();

DROP TRIGGER IF EXISTS trg_cm_epistemic_case_immutable ON comind.cm_epistemic_case;
CREATE TRIGGER trg_cm_epistemic_case_immutable BEFORE UPDATE OR DELETE ON comind.cm_epistemic_case FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_ger_mutation();
DROP TRIGGER IF EXISTS trg_cm_epistemic_object_immutable ON comind.cm_epistemic_object;
CREATE TRIGGER trg_cm_epistemic_object_immutable BEFORE UPDATE OR DELETE ON comind.cm_epistemic_object FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_ger_mutation();
DROP TRIGGER IF EXISTS trg_cm_epistemic_relationship_immutable ON comind.cm_epistemic_relationship;
CREATE TRIGGER trg_cm_epistemic_relationship_immutable BEFORE UPDATE OR DELETE ON comind.cm_epistemic_relationship FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_ger_mutation();
DROP TRIGGER IF EXISTS trg_cm_epistemic_event_immutable ON comind.cm_epistemic_event;
CREATE TRIGGER trg_cm_epistemic_event_immutable BEFORE UPDATE OR DELETE ON comind.cm_epistemic_event FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_ger_mutation();

CREATE OR REPLACE VIEW comind.v_epistemic_object_state WITH (security_invoker = true) AS
WITH latest_transition AS (
  SELECT DISTINCT ON (e.case_id, e.target_object_id) e.case_id,e.target_object_id AS object_id,e.event_id AS latest_transition_event_id,e.to_state AS current_state,e.recorded_at AS state_recorded_at
  FROM comind.cm_epistemic_event e WHERE e.event_type = 'state_transition'
  ORDER BY e.case_id,e.target_object_id,e.persistence_seq DESC
)
SELECT o.object_id,o.case_id,o.object_key,o.object_type,o.summary,o.canonical_ref,COALESCE(t.current_state,o.initial_state) AS current_state,t.latest_transition_event_id,t.state_recorded_at,o.valid_from,o.valid_to,o.content_digest,o.created_at,o.created_by_ref
FROM comind.cm_epistemic_object o LEFT JOIN latest_transition t ON t.case_id=o.case_id AND t.object_id=o.object_id;

CREATE OR REPLACE VIEW comind.v_epistemic_case_status WITH (security_invoker = true) AS
WITH latest_event AS (
  SELECT DISTINCT ON (e.case_id) e.case_id,e.event_id AS latest_event_id,e.event_type AS latest_event_type,e.recorded_at AS latest_event_at FROM comind.cm_epistemic_event e ORDER BY e.case_id,e.persistence_seq DESC
), latest_lifecycle AS (
  SELECT DISTINCT ON (e.case_id) e.case_id,e.event_type AS lifecycle_event_type,e.recorded_at AS lifecycle_recorded_at FROM comind.cm_epistemic_event e WHERE e.event_type IN ('case_opened','case_concluded','case_reopened','case_closed') ORDER BY e.case_id,e.persistence_seq DESC
), object_counts AS (
  SELECT case_id,count(*)::bigint AS object_count FROM comind.cm_epistemic_object GROUP BY case_id
), relationship_counts AS (
  SELECT case_id,count(*)::bigint AS relationship_count FROM comind.cm_epistemic_relationship GROUP BY case_id
)
SELECT c.case_id,c.case_key,c.subject_ref,c.environment,c.initial_rigor_class,c.policy_version,c.data_classification,c.retention_profile_key,
       CASE l.lifecycle_event_type WHEN 'case_concluded' THEN 'concluded' WHEN 'case_reopened' THEN 'reopened' WHEN 'case_closed' THEN 'closed' ELSE 'open' END AS case_status,
       l.lifecycle_recorded_at AS status_recorded_at,e.latest_event_id,e.latest_event_type,e.latest_event_at,COALESCE(o.object_count,0::bigint) AS object_count,COALESCE(r.relationship_count,0::bigint) AS relationship_count,c.opened_at,c.opened_by_ref,c.inserted_at
FROM comind.cm_epistemic_case c
LEFT JOIN latest_lifecycle l USING (case_id)
LEFT JOIN latest_event e USING (case_id)
LEFT JOIN object_counts o USING (case_id)
LEFT JOIN relationship_counts r USING (case_id);

COMMENT ON TABLE comind.cm_epistemic_case IS 'Immutable GER case identity and opening context. Current status is derived from append-only event lineage.';
COMMENT ON TABLE comind.cm_epistemic_object IS 'Immutable typed GER objects. Evidence objects reference canonical evidence rather than duplicating source payloads.';
COMMENT ON TABLE comind.cm_epistemic_relationship IS 'Immutable typed GER relationships preserving support, contradiction, competition, supersession, authority, and other epistemic edges.';
COMMENT ON TABLE comind.cm_epistemic_event IS 'Append-only, idempotent GER case chronology. State transitions, reopening, authority changes, monitoring, and source availability remain reconstructable.';
COMMENT ON VIEW comind.v_epistemic_object_state IS 'Security-invoker projection of current epistemic object state from immutable object identity plus append-only transition events.';
COMMENT ON VIEW comind.v_epistemic_case_status IS 'Security-invoker projection of current GER case lifecycle and durable object/relationship counts.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_ger_runtime') THEN
    CREATE ROLE comind_ger_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_ger_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

ALTER TABLE comind.cm_epistemic_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_epistemic_object ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_epistemic_relationship ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_epistemic_event ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE comind.cm_epistemic_case FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_epistemic_object FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_epistemic_relationship FROM PUBLIC;
REVOKE ALL ON TABLE comind.cm_epistemic_event FROM PUBLIC;
REVOKE ALL ON TABLE comind.v_epistemic_object_state FROM PUBLIC;
REVOKE ALL ON TABLE comind.v_epistemic_case_status FROM PUBLIC;

DO $$
DECLARE role_name text; object_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF to_regrole(role_name) IS NOT NULL THEN
      FOREACH object_name IN ARRAY ARRAY['cm_epistemic_case','cm_epistemic_object','cm_epistemic_relationship','cm_epistemic_event','v_epistemic_object_state','v_epistemic_case_status'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM %I', object_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA comind TO comind_ger_runtime;
GRANT SELECT, INSERT ON TABLE comind.cm_epistemic_case,comind.cm_epistemic_object,comind.cm_epistemic_relationship,comind.cm_epistemic_event TO comind_ger_runtime;
GRANT SELECT ON TABLE comind.v_epistemic_object_state,comind.v_epistemic_case_status TO comind_ger_runtime;
GRANT USAGE ON SEQUENCE comind.cm_epistemic_case_persistence_seq_seq,comind.cm_epistemic_object_persistence_seq_seq,comind.cm_epistemic_relationship_persistence_seq_seq,comind.cm_epistemic_event_persistence_seq_seq TO comind_ger_runtime;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['cm_epistemic_case','cm_epistemic_object','cm_epistemic_relationship','cm_epistemic_event'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS ger_runtime_select ON comind.%I', table_name);
    EXECUTE format('CREATE POLICY ger_runtime_select ON comind.%I FOR SELECT TO comind_ger_runtime USING (true)', table_name);
    EXECUTE format('DROP POLICY IF EXISTS ger_runtime_insert ON comind.%I', table_name);
    EXECUTE format('CREATE POLICY ger_runtime_insert ON comind.%I FOR INSERT TO comind_ger_runtime WITH CHECK (true)', table_name);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION comind.cm_ger_payload_has_forbidden_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_ger_transition_allowed(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_reject_ger_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_validate_epistemic_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_ger_transition_allowed(text,text) TO comind_ger_runtime;

DO $$
BEGIN
  IF to_regrole('service_role') IS NOT NULL THEN
    GRANT comind_ger_runtime TO service_role WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
  END IF;
END
$$;

DO $$
DECLARE v_project_id uuid; v_classification_id uuid; v_retention_id uuid;
BEGIN
  IF to_regclass('comind_pm.pm_projects') IS NOT NULL AND to_regclass('comind_pm.pm_data_classification_levels') IS NOT NULL AND to_regclass('comind_pm.pm_retention_profiles') IS NOT NULL AND to_regclass('comind_pm.pm_data_asset_governance') IS NOT NULL THEN
    SELECT id INTO v_project_id FROM comind_pm.pm_projects WHERE project_key='COMIND' LIMIT 1;
    SELECT id INTO v_classification_id FROM comind_pm.pm_data_classification_levels WHERE project_id=v_project_id AND classification_key='INTERNAL' AND active LIMIT 1;
    SELECT id INTO v_retention_id FROM comind_pm.pm_retention_profiles WHERE project_id=v_project_id AND profile_key='DURABLE-EVIDENCE' AND active LIMIT 1;
    IF v_project_id IS NULL OR v_classification_id IS NULL OR v_retention_id IS NULL THEN RAISE EXCEPTION 'GER data-governance registration prerequisites are incomplete'; END IF;
    INSERT INTO comind_pm.pm_data_asset_governance (project_id,asset_key,asset_type,classification_id,retention_profile_id,project_scope_key,allowed_purposes,legal_hold,evidence_hold,disposition_status,source_ref,metadata)
    SELECT v_project_id,v.asset_key,'epistemic_control_plane',v_classification_id,v_retention_id,'COMIND',ARRAY['governed-epistemic-reasoning','audit','recovery']::text[],false,false,'active',v.source_ref,jsonb_build_object('owner','GER','lane','GER-002','production_activated',false)
    FROM (VALUES
      ('GER-CM-EPISTEMIC-CASE','comind.cm_epistemic_case'),
      ('GER-CM-EPISTEMIC-OBJECT','comind.cm_epistemic_object'),
      ('GER-CM-EPISTEMIC-RELATIONSHIP','comind.cm_epistemic_relationship'),
      ('GER-CM-EPISTEMIC-EVENT','comind.cm_epistemic_event')
    ) AS v(asset_key,source_ref)
    ON CONFLICT (project_id,asset_key) DO NOTHING;
  END IF;
END
$$;

COMMIT;
