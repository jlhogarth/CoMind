-- CHIST-001: governed point-in-time comparison anchored to a certified baseline.
BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_archive_diff_conversation_observation (
  diff_observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diff_receipt_id uuid NOT NULL REFERENCES comind.cm_archive_diff_receipt(diff_receipt_id) ON DELETE RESTRICT,
  source_conversation_id text NOT NULL CHECK (length(btrim(source_conversation_id)) > 0),
  classification text NOT NULL CHECK (classification IN (
    'unchanged','content_changed','structurally_changed','new_in_comparison','absent_in_comparison'
  )),
  baseline_normalized_hash char(64) CHECK (baseline_normalized_hash IS NULL OR baseline_normalized_hash ~ '^[a-f0-9]{64}$'),
  baseline_topology_hash char(64) CHECK (baseline_topology_hash IS NULL OR baseline_topology_hash ~ '^[a-f0-9]{64}$'),
  comparison_normalized_hash char(64) CHECK (comparison_normalized_hash IS NULL OR comparison_normalized_hash ~ '^[a-f0-9]{64}$'),
  comparison_topology_hash char(64) CHECK (comparison_topology_hash IS NULL OR comparison_topology_hash ~ '^[a-f0-9]{64}$'),
  baseline_message_count integer CHECK (baseline_message_count IS NULL OR baseline_message_count >= 0),
  comparison_message_count integer CHECK (comparison_message_count IS NULL OR comparison_message_count >= 0),
  baseline_node_count integer CHECK (baseline_node_count IS NULL OR baseline_node_count >= 0),
  comparison_node_count integer CHECK (comparison_node_count IS NULL OR comparison_node_count >= 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  observation_sha256 char(64) NOT NULL CHECK (observation_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_archive_diff_conversation_identity UNIQUE (diff_receipt_id, source_conversation_id),
  CONSTRAINT cm_archive_diff_conversation_hash_unique UNIQUE (diff_receipt_id, observation_sha256),
  CONSTRAINT cm_archive_diff_conversation_presence CHECK (
    (classification='new_in_comparison' AND baseline_normalized_hash IS NULL AND comparison_normalized_hash IS NOT NULL)
    OR (classification='absent_in_comparison' AND baseline_normalized_hash IS NOT NULL AND comparison_normalized_hash IS NULL)
    OR (classification IN ('unchanged','content_changed','structurally_changed') AND baseline_normalized_hash IS NOT NULL AND comparison_normalized_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cm_archive_diff_conversation_receipt_classification
  ON comind.cm_archive_diff_conversation_observation(diff_receipt_id,classification,source_conversation_id);

DROP TRIGGER IF EXISTS trg_cm_archive_diff_conversation_immutable
  ON comind.cm_archive_diff_conversation_observation;
CREATE TRIGGER trg_cm_archive_diff_conversation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_diff_conversation_observation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

CREATE OR REPLACE FUNCTION comind.cm_guard_history_diff_receipt_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_baseline_status text;
  v_comparison_status text;
  v_baseline_system text;
  v_comparison_system text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM comind.cm_conversation_history_baseline b
    WHERE b.import_id=NEW.baseline_import_id
  ) THEN
    RAISE EXCEPTION 'Conversation History PIT diff baseline must be an explicitly certified import';
  END IF;

  SELECT i.status,s.source_system INTO v_baseline_status,v_baseline_system
  FROM comind.cm_archive_import i JOIN comind.cm_archive_source s USING(source_archive_id)
  WHERE i.import_id=NEW.baseline_import_id;
  SELECT i.status,s.source_system INTO v_comparison_status,v_comparison_system
  FROM comind.cm_archive_import i JOIN comind.cm_archive_source s USING(source_archive_id)
  WHERE i.import_id=NEW.comparison_import_id;

  IF v_baseline_status <> 'PASS' OR v_baseline_system <> 'chatgpt' THEN
    RAISE EXCEPTION 'Conversation History PIT diff baseline is not a PASS ChatGPT import';
  END IF;
  IF v_comparison_status NOT IN ('PASS','WARN') OR v_comparison_system <> 'chatgpt' THEN
    RAISE EXCEPTION 'Conversation History PIT comparison must be a completed PASS/WARN ChatGPT import';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_archive_diff_receipt_history_guard ON comind.cm_archive_diff_receipt;
CREATE TRIGGER trg_cm_archive_diff_receipt_history_guard
BEFORE INSERT ON comind.cm_archive_diff_receipt
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_history_diff_receipt_insert();

ALTER TABLE comind.cm_archive_diff_conversation_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_diff_conversation_observation FORCE ROW LEVEL SECURITY;

-- Archive ingestion authority already owns append-only diff receipts. Give it read access
-- to the certificate anchor and append-only access to per-conversation observations.
GRANT SELECT ON TABLE comind.cm_conversation_history_baseline TO comind_archive_ingestor;
DROP POLICY IF EXISTS cm_archive_ingestor_select ON comind.cm_conversation_history_baseline;
CREATE POLICY cm_archive_ingestor_select ON comind.cm_conversation_history_baseline
FOR SELECT TO comind_archive_ingestor USING (true);
GRANT SELECT,INSERT ON TABLE comind.cm_archive_diff_conversation_observation TO comind_archive_ingestor;
DROP POLICY IF EXISTS cm_archive_ingestor_select ON comind.cm_archive_diff_conversation_observation;
CREATE POLICY cm_archive_ingestor_select ON comind.cm_archive_diff_conversation_observation
FOR SELECT TO comind_archive_ingestor USING (true);
DROP POLICY IF EXISTS cm_archive_ingestor_insert ON comind.cm_archive_diff_conversation_observation;
CREATE POLICY cm_archive_ingestor_insert ON comind.cm_archive_diff_conversation_observation
FOR INSERT TO comind_archive_ingestor WITH CHECK (true);

-- Activate read-only PIT evidence only when the receipt is anchored to a certified baseline.
GRANT SELECT ON TABLE comind.cm_archive_diff_receipt,comind.cm_archive_diff_conversation_observation
  TO comind_conversation_history_reader;
DROP POLICY IF EXISTS cm_conversation_history_reader_select ON comind.cm_archive_diff_receipt;
CREATE POLICY cm_conversation_history_reader_select ON comind.cm_archive_diff_receipt
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (
  SELECT 1 FROM comind.cm_conversation_history_baseline b
  WHERE b.import_id=cm_archive_diff_receipt.baseline_import_id
));
DROP POLICY IF EXISTS cm_conversation_history_reader_select ON comind.cm_archive_diff_conversation_observation;
CREATE POLICY cm_conversation_history_reader_select ON comind.cm_archive_diff_conversation_observation
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (
  SELECT 1
  FROM comind.cm_archive_diff_receipt r
  JOIN comind.cm_conversation_history_baseline b ON b.import_id=r.baseline_import_id
  WHERE r.diff_receipt_id=cm_archive_diff_conversation_observation.diff_receipt_id
));

REVOKE ALL ON TABLE comind.cm_archive_diff_conversation_observation FROM PUBLIC;
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','comind_conversation_reconciler','comind_conversation_deriver','comind_conversation_history_certifier','comind_conversation_history_deriver'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_diff_conversation_observation FROM %I',v_role);
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION comind.cm_guard_history_diff_receipt_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_guard_history_diff_receipt_insert() TO comind_archive_ingestor;

COMMENT ON TABLE comind.cm_archive_diff_conversation_observation IS
  'CHIST-001 immutable per-conversation PIT comparison evidence. absent_in_comparison means not observed in the comparison export and never asserts deletion.';

COMMIT;
