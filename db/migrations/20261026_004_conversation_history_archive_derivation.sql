-- CHIST-001: archive-native analytics for certified Conversation History.
-- Reuses CFR-001G deterministic semantics without fabricating live cm_conversation rows.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_history_deriver') THEN
    CREATE ROLE comind_conversation_history_deriver
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_conversation_history_deriver
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS comind.cm_archive_derivation_run (
  archive_derivation_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  policy_version text NOT NULL CHECK (length(btrim(policy_version)) > 0),
  engine_kind text NOT NULL CHECK (engine_kind IN ('deterministic','model_assisted')),
  provider text,
  model text,
  prompt_template_sha256 char(64) CHECK (prompt_template_sha256 IS NULL OR prompt_template_sha256 ~ '^[a-f0-9]{64}$'),
  archive_normalized_hash char(64) NOT NULL CHECK (archive_normalized_hash ~ '^[a-f0-9]{64}$'),
  archive_topology_hash char(64) NOT NULL CHECK (archive_topology_hash ~ '^[a-f0-9]{64}$'),
  source_snapshot_sha256 char(64) NOT NULL CHECK (source_snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  run_identity_sha256 char(64) NOT NULL UNIQUE CHECK (run_identity_sha256 ~ '^[a-f0-9]{64}$'),
  source_node_count integer NOT NULL CHECK (source_node_count >= 0),
  source_message_count integer NOT NULL CHECK (source_message_count >= 0),
  active_branch_node_count integer NOT NULL CHECK (active_branch_node_count >= 0),
  result_state text NOT NULL CHECK (result_state IN ('completed','partial','ambiguous_topology')),
  source_stats jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_stats)='object'),
  engine_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(engine_metadata)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_archive_derivation_run_conversation_fk
    FOREIGN KEY (import_id, source_conversation_id)
    REFERENCES comind.cm_archive_conversation_observation(import_id, source_conversation_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_derivation_engine_boundary CHECK (
    (engine_kind='deterministic' AND provider IS NULL AND model IS NULL AND prompt_template_sha256 IS NULL)
    OR
    (engine_kind='model_assisted' AND provider IS NOT NULL AND model IS NOT NULL)
  ),
  CONSTRAINT cm_archive_derivation_run_scope_unique
    UNIQUE (archive_derivation_run_id, import_id, source_conversation_id)
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_derivation (
  archive_derivation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_derivation_run_id uuid NOT NULL,
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  source_node_id text,
  source_message_id text,
  derivation_kind text NOT NULL CHECK (derivation_kind IN (
    'intent','topic','entity','decision_candidate','assumption','requirement',
    'open_question','commitment','unresolved_thread','architecture_relationship',
    'action_candidate','conflict_signal','salience_signal'
  )),
  source_kind text NOT NULL CHECK (source_kind IN ('archive_message','conversation_aggregate')),
  source_role text CHECK (source_role IS NULL OR source_role IN ('user','assistant','system','tool')),
  evidence_start_char integer CHECK (evidence_start_char IS NULL OR evidence_start_char >= 0),
  evidence_end_char integer CHECK (evidence_end_char IS NULL OR evidence_end_char >= 0),
  value_text text NOT NULL CHECK (length(btrim(value_text)) > 0),
  normalized_key text,
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  salience numeric(5,4) NOT NULL CHECK (salience >= 0 AND salience <= 1),
  uncertainty text,
  conflict_state text NOT NULL DEFAULT 'none' CHECK (conflict_state IN ('none','ambiguous','conflicting')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  derivation_sha256 char(64) NOT NULL CHECK (derivation_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_archive_derivation_run_scope_fk
    FOREIGN KEY (archive_derivation_run_id, import_id, source_conversation_id)
    REFERENCES comind.cm_archive_derivation_run(archive_derivation_run_id, import_id, source_conversation_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_derivation_node_fk
    FOREIGN KEY (import_id, source_conversation_id, source_node_id)
    REFERENCES comind.cm_archive_node_observation(import_id, source_conversation_id, source_node_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_derivation_span_order CHECK (
    evidence_start_char IS NULL OR evidence_end_char IS NULL OR evidence_end_char >= evidence_start_char
  ),
  CONSTRAINT cm_archive_derivation_source_reference CHECK (
    (source_kind='archive_message' AND source_node_id IS NOT NULL)
    OR
    (source_kind='conversation_aggregate' AND source_node_id IS NULL)
  ),
  CONSTRAINT cm_archive_derivation_run_hash_unique UNIQUE (archive_derivation_run_id, derivation_sha256)
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_promotion_candidate (
  archive_candidate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_derivation_run_id uuid NOT NULL,
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  archive_derivation_id uuid NOT NULL REFERENCES comind.cm_archive_derivation(archive_derivation_id) ON DELETE RESTRICT,
  target_type text NOT NULL CHECK (target_type IN ('memory','rule','decision','assumption','open_question','task','architecture')),
  proposed_title text NOT NULL CHECK (length(btrim(proposed_title)) > 0),
  proposed_content text NOT NULL CHECK (length(btrim(proposed_content)) > 0),
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  salience numeric(5,4) NOT NULL CHECK (salience >= 0 AND salience <= 1),
  uncertainty text,
  conflict_state text NOT NULL DEFAULT 'none' CHECK (conflict_state IN ('none','ambiguous','conflicting')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  candidate_sha256 char(64) NOT NULL CHECK (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_archive_candidate_run_scope_fk
    FOREIGN KEY (archive_derivation_run_id, import_id, source_conversation_id)
    REFERENCES comind.cm_archive_derivation_run(archive_derivation_run_id, import_id, source_conversation_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_candidate_run_hash_unique UNIQUE (archive_derivation_run_id, candidate_sha256)
);

CREATE INDEX IF NOT EXISTS idx_cm_archive_derivation_run_conversation
  ON comind.cm_archive_derivation_run(import_id, source_conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_archive_derivation_run_import
  ON comind.cm_archive_derivation_run(import_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_derivation_run_source_conversation
  ON comind.cm_archive_derivation_run(source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_derivation_run_scope
  ON comind.cm_archive_derivation(archive_derivation_run_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_derivation_conversation_kind
  ON comind.cm_archive_derivation(import_id, source_conversation_id, derivation_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_archive_derivation_node
  ON comind.cm_archive_derivation(import_id, source_conversation_id, source_node_id)
  WHERE source_node_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_archive_candidate_run
  ON comind.cm_archive_promotion_candidate(archive_derivation_run_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_candidate_derivation
  ON comind.cm_archive_promotion_candidate(archive_derivation_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_candidate_conversation
  ON comind.cm_archive_promotion_candidate(import_id, source_conversation_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_cm_archive_derivation_run_immutable ON comind.cm_archive_derivation_run;
CREATE TRIGGER trg_cm_archive_derivation_run_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_derivation_run
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();
DROP TRIGGER IF EXISTS trg_cm_archive_derivation_immutable ON comind.cm_archive_derivation;
CREATE TRIGGER trg_cm_archive_derivation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_derivation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();
DROP TRIGGER IF EXISTS trg_cm_archive_promotion_candidate_immutable ON comind.cm_archive_promotion_candidate;
CREATE TRIGGER trg_cm_archive_promotion_candidate_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_promotion_candidate
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();

CREATE OR REPLACE FUNCTION comind.cm_guard_archive_derivation_run_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_normalized char(64);
  v_topology char(64);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM comind.cm_conversation_history_baseline b
    WHERE b.import_id=NEW.import_id
  ) THEN
    RAISE EXCEPTION 'Archive derivation requires a certified Conversation History baseline';
  END IF;

  SELECT normalized_hash, topology_hash
    INTO v_normalized, v_topology
    FROM comind.cm_archive_conversation_observation
   WHERE import_id=NEW.import_id AND source_conversation_id=NEW.source_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Archive derivation conversation does not exist'; END IF;
  IF NEW.archive_normalized_hash<>v_normalized OR NEW.archive_topology_hash<>v_topology THEN
    RAISE EXCEPTION 'Archive derivation hashes do not match preserved source evidence';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_archive_derivation_run_guard ON comind.cm_archive_derivation_run;
CREATE TRIGGER trg_cm_archive_derivation_run_guard
BEFORE INSERT ON comind.cm_archive_derivation_run
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_archive_derivation_run_insert();

ALTER TABLE comind.cm_archive_derivation_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_derivation_run FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_derivation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_derivation FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_promotion_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_promotion_candidate FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA comind TO comind_conversation_history_deriver;
GRANT comind_conversation_history_deriver TO CURRENT_USER;
GRANT SELECT ON TABLE
  comind.cm_conversation_history_baseline,
  comind.cm_archive_import,
  comind.cm_archive_conversation_observation,
  comind.cm_archive_node_observation
TO comind_conversation_history_deriver;
GRANT SELECT,INSERT ON TABLE
  comind.cm_archive_derivation_run,
  comind.cm_archive_derivation,
  comind.cm_archive_promotion_candidate
TO comind_conversation_history_deriver;

GRANT SELECT ON TABLE
  comind.cm_archive_derivation_run,
  comind.cm_archive_derivation,
  comind.cm_archive_promotion_candidate
TO comind_conversation_history_reader;

DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_conversation_history_baseline;
CREATE POLICY cm_history_deriver_select ON comind.cm_conversation_history_baseline
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_deriver_archive_import_select ON comind.cm_archive_import;
CREATE POLICY cm_history_deriver_archive_import_select ON comind.cm_archive_import
FOR SELECT TO comind_conversation_history_deriver
USING (EXISTS (SELECT 1 FROM comind.cm_conversation_history_baseline b WHERE b.import_id=cm_archive_import.import_id));
DROP POLICY IF EXISTS cm_history_deriver_archive_conversation_select ON comind.cm_archive_conversation_observation;
CREATE POLICY cm_history_deriver_archive_conversation_select ON comind.cm_archive_conversation_observation
FOR SELECT TO comind_conversation_history_deriver
USING (EXISTS (SELECT 1 FROM comind.cm_conversation_history_baseline b WHERE b.import_id=cm_archive_conversation_observation.import_id));
DROP POLICY IF EXISTS cm_history_deriver_archive_node_select ON comind.cm_archive_node_observation;
CREATE POLICY cm_history_deriver_archive_node_select ON comind.cm_archive_node_observation
FOR SELECT TO comind_conversation_history_deriver
USING (EXISTS (SELECT 1 FROM comind.cm_conversation_history_baseline b WHERE b.import_id=cm_archive_node_observation.import_id));

DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_derivation_run;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_derivation_run
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_deriver_insert ON comind.cm_archive_derivation_run;
CREATE POLICY cm_history_deriver_insert ON comind.cm_archive_derivation_run
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);
DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_derivation;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_derivation
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_deriver_insert ON comind.cm_archive_derivation;
CREATE POLICY cm_history_deriver_insert ON comind.cm_archive_derivation
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);
DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_promotion_candidate;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_promotion_candidate
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_deriver_insert ON comind.cm_archive_promotion_candidate;
CREATE POLICY cm_history_deriver_insert ON comind.cm_archive_promotion_candidate
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);

DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_derivation_run;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_derivation_run
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (SELECT 1 FROM comind.cm_conversation_history_baseline b WHERE b.import_id=cm_archive_derivation_run.import_id));
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_derivation;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_derivation
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (SELECT 1 FROM comind.cm_conversation_history_baseline b WHERE b.import_id=cm_archive_derivation.import_id));
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_promotion_candidate;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_promotion_candidate
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (SELECT 1 FROM comind.cm_conversation_history_baseline b WHERE b.import_id=cm_archive_promotion_candidate.import_id));

REVOKE ALL ON TABLE comind.cm_archive_derivation_run,comind.cm_archive_derivation,comind.cm_archive_promotion_candidate FROM PUBLIC;
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','comind_archive_ingestor','comind_conversation_reconciler','comind_conversation_deriver','comind_conversation_history_certifier'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_derivation_run FROM %I',v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_derivation FROM %I',v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_promotion_candidate FROM %I',v_role);
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION comind.cm_guard_archive_derivation_run_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_guard_archive_derivation_run_insert() TO comind_conversation_history_deriver;

COMMENT ON TABLE comind.cm_archive_derivation_run IS
  'CHIST-001 immutable archive-native derivation run over a certified ChatGPT source conversation; does not fabricate a live conv_id.';
COMMENT ON TABLE comind.cm_archive_derivation IS
  'CHIST-001 immutable typed analytics derived directly from certified archive nodes using CFR-001G semantics.';
COMMENT ON TABLE comind.cm_archive_promotion_candidate IS
  'CHIST-001 review-only promotion suggestions from archive-native derivations; never performs canonical promotion.';

COMMIT;
