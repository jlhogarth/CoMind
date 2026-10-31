BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_corpus_analytical_run (
  analytical_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES comind.cm_conversation_history_baseline(baseline_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  analysis_mode text NOT NULL CHECK (analysis_mode IN ('deterministic','model_assisted_candidate')),
  engine_kind text NOT NULL,
  engine_version text NOT NULL,
  run_identity_sha256 char(64) NOT NULL UNIQUE CHECK (run_identity_sha256 ~ '^[0-9a-f]{64}$'),
  actor text NOT NULL,
  source_branch text NOT NULL,
  source_head_sha char(40) NOT NULL CHECK (source_head_sha ~ '^[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (analytical_run_id, import_id)
);

CREATE TABLE IF NOT EXISTS comind.cm_corpus_analytical_observation (
  analytical_observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analytical_run_id uuid NOT NULL,
  import_id uuid NOT NULL,
  source_conversation_id text,
  source_node_id text,
  observation_kind text NOT NULL CHECK (observation_kind IN ('branch_provenance','concept_census','concept_occurrence','concept_bridge','digital_twin_signal_candidate')),
  analysis_mode text NOT NULL CHECK (analysis_mode IN ('deterministic','model_assisted_candidate')),
  actor_role text,
  branch_class text CHECK (branch_class IS NULL OR branch_class IN ('active_path','alternate_branch','unknown')),
  concept_key text,
  related_concept_key text,
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  occurrence_count bigint CHECK (occurrence_count IS NULL OR occurrence_count >= 0),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  observation_sha256 char(64) NOT NULL CHECK (observation_sha256 ~ '^[0-9a-f]{64}$'),
  source_lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_corpus_analytical_observation_run_fk FOREIGN KEY (analytical_run_id,import_id)
    REFERENCES comind.cm_corpus_analytical_run(analytical_run_id,import_id) ON DELETE RESTRICT,
  CONSTRAINT cm_corpus_analytical_observation_unique UNIQUE (analytical_run_id,observation_sha256)
);

CREATE INDEX IF NOT EXISTS ix_cm_corpus_analytical_observation_run_kind ON comind.cm_corpus_analytical_observation(analytical_run_id,observation_kind);
CREATE INDEX IF NOT EXISTS ix_cm_corpus_analytical_observation_concept ON comind.cm_corpus_analytical_observation(concept_key,related_concept_key) WHERE concept_key IS NOT NULL;

CREATE OR REPLACE FUNCTION comind.cm_reject_corpus_analytical_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'CHIST-A03 analytical evidence is append-only'; END $$;

DROP TRIGGER IF EXISTS trg_cm_corpus_analytical_run_immutable ON comind.cm_corpus_analytical_run;
CREATE TRIGGER trg_cm_corpus_analytical_run_immutable BEFORE UPDATE OR DELETE ON comind.cm_corpus_analytical_run FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_corpus_analytical_mutation();
DROP TRIGGER IF EXISTS trg_cm_corpus_analytical_observation_immutable ON comind.cm_corpus_analytical_observation;
CREATE TRIGGER trg_cm_corpus_analytical_observation_immutable BEFORE UPDATE OR DELETE ON comind.cm_corpus_analytical_observation FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_corpus_analytical_mutation();

CREATE OR REPLACE FUNCTION comind.cm_guard_corpus_analytical_run_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM comind.cm_conversation_history_baseline b WHERE b.baseline_id=NEW.baseline_id AND b.import_id=NEW.import_id) THEN
    RAISE EXCEPTION 'Corpus analytics requires an exact certified Conversation History baseline/import pair';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cm_corpus_analytical_run_certified ON comind.cm_corpus_analytical_run;
CREATE TRIGGER trg_cm_corpus_analytical_run_certified BEFORE INSERT ON comind.cm_corpus_analytical_run FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_corpus_analytical_run_insert();

ALTER TABLE comind.cm_corpus_analytical_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_corpus_analytical_run FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_corpus_analytical_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_corpus_analytical_observation FORCE ROW LEVEL SECURITY;

CREATE POLICY cm_corpus_analytical_deriver_run ON comind.cm_corpus_analytical_run FOR ALL TO comind_conversation_history_deriver USING (true) WITH CHECK (true);
CREATE POLICY cm_corpus_analytical_reader_run ON comind.cm_corpus_analytical_run FOR SELECT TO comind_conversation_history_reader USING (true);
CREATE POLICY cm_corpus_analytical_deriver_observation ON comind.cm_corpus_analytical_observation FOR ALL TO comind_conversation_history_deriver USING (true) WITH CHECK (true);
CREATE POLICY cm_corpus_analytical_reader_observation ON comind.cm_corpus_analytical_observation FOR SELECT TO comind_conversation_history_reader USING (true);

REVOKE ALL ON TABLE comind.cm_corpus_analytical_run, comind.cm_corpus_analytical_observation FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON TABLE comind.cm_corpus_analytical_run, comind.cm_corpus_analytical_observation TO comind_conversation_history_deriver;
GRANT SELECT ON TABLE comind.cm_corpus_analytical_run, comind.cm_corpus_analytical_observation TO comind_conversation_history_reader;
REVOKE ALL ON FUNCTION comind.cm_reject_corpus_analytical_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_guard_corpus_analytical_run_insert() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE comind.cm_corpus_analytical_run IS 'CHIST-A03 immutable corpus analytical run identity. Derived evidence only; never a promotion authority.';
COMMENT ON TABLE comind.cm_corpus_analytical_observation IS 'CHIST-A03 append-only derived analytical observations. Candidate signals cannot promote themselves into canonical CoMind truth.';

COMMIT;
