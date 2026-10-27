-- Issue #250: one full certified baseline followed by differential-only ChatGPT ingestion.
BEGIN;

ALTER TABLE comind.cm_archive_import
  ADD COLUMN IF NOT EXISTS import_mode text NOT NULL DEFAULT 'full_snapshot';

ALTER TABLE comind.cm_archive_import
  DROP CONSTRAINT IF EXISTS cm_archive_import_mode_check;
ALTER TABLE comind.cm_archive_import
  ADD CONSTRAINT cm_archive_import_mode_check
  CHECK (import_mode IN ('full_snapshot','differential'));

CREATE TABLE IF NOT EXISTS comind.cm_archive_stream (
  archive_stream_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'chatgpt',
  source_identity_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata)='object'),
  CONSTRAINT cm_archive_stream_identity UNIQUE (source_system, source_identity_key),
  CONSTRAINT cm_archive_stream_identity_key_nonempty CHECK (btrim(source_identity_key) <> '')
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_checkpoint (
  checkpoint_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_stream_id uuid NOT NULL REFERENCES comind.cm_archive_stream(archive_stream_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL UNIQUE REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  baseline_id uuid NOT NULL REFERENCES comind.cm_conversation_history_baseline(baseline_id) ON DELETE RESTRICT,
  checkpoint_kind text NOT NULL CHECK (checkpoint_kind IN ('baseline','differential')),
  sequence_no bigint NOT NULL CHECK (sequence_no > 0),
  predecessor_checkpoint_id uuid REFERENCES comind.cm_archive_checkpoint(checkpoint_id) ON DELETE RESTRICT,
  parser_version text NOT NULL,
  schema_version text NOT NULL,
  hash_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt)='object'),
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT cm_archive_checkpoint_sequence UNIQUE (archive_stream_id, sequence_no),
  CONSTRAINT cm_archive_checkpoint_shape CHECK (
    (sequence_no=1 AND checkpoint_kind='baseline' AND predecessor_checkpoint_id IS NULL)
    OR
    (sequence_no>1 AND checkpoint_kind='differential' AND predecessor_checkpoint_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cm_archive_checkpoint_latest
  ON comind.cm_archive_checkpoint(archive_stream_id, sequence_no DESC);

CREATE TABLE IF NOT EXISTS comind.cm_archive_snapshot_conversation (
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  source_conversation_id text NOT NULL,
  classification text NOT NULL CHECK (classification IN (
    'baseline','unchanged','new','content_changed','structurally_changed','raw_changed','attachment_changed','absent'
  )),
  present boolean NOT NULL,
  prior_observation_import_id uuid,
  observation_import_id uuid,
  raw_source_hash char(64),
  normalized_hash char(64),
  topology_hash char(64),
  attachment_set_hash char(64),
  source_path text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  PRIMARY KEY (import_id, source_conversation_id),
  FOREIGN KEY (prior_observation_import_id, source_conversation_id)
    REFERENCES comind.cm_archive_conversation_observation(import_id, source_conversation_id) ON DELETE RESTRICT,
  FOREIGN KEY (observation_import_id, source_conversation_id)
    REFERENCES comind.cm_archive_conversation_observation(import_id, source_conversation_id) ON DELETE RESTRICT,
  CONSTRAINT cm_archive_snapshot_conversation_presence CHECK (
    (present AND observation_import_id IS NOT NULL AND raw_source_hash IS NOT NULL AND normalized_hash IS NOT NULL AND topology_hash IS NOT NULL)
    OR
    (NOT present AND observation_import_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cm_archive_snapshot_conversation_origin
  ON comind.cm_archive_snapshot_conversation(observation_import_id, source_conversation_id)
  WHERE present;

CREATE TABLE IF NOT EXISTS comind.cm_archive_snapshot_node (
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  source_conversation_id text NOT NULL,
  source_node_id text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('baseline','unchanged','new','changed','attachment_changed','absent')),
  present boolean NOT NULL,
  prior_observation_import_id uuid,
  observation_import_id uuid,
  raw_node_hash char(64),
  normalized_message_hash char(64),
  attachment_set_hash char(64),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  PRIMARY KEY (import_id, source_conversation_id, source_node_id),
  FOREIGN KEY (prior_observation_import_id, source_conversation_id, source_node_id)
    REFERENCES comind.cm_archive_node_observation(import_id, source_conversation_id, source_node_id) ON DELETE RESTRICT,
  FOREIGN KEY (observation_import_id, source_conversation_id, source_node_id)
    REFERENCES comind.cm_archive_node_observation(import_id, source_conversation_id, source_node_id) ON DELETE RESTRICT,
  CONSTRAINT cm_archive_snapshot_node_presence CHECK (
    (present AND observation_import_id IS NOT NULL AND raw_node_hash IS NOT NULL)
    OR
    (NOT present AND observation_import_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cm_archive_snapshot_node_origin
  ON comind.cm_archive_snapshot_node(observation_import_id, source_conversation_id, source_node_id)
  WHERE present;

CREATE OR REPLACE FUNCTION comind.cm_guard_archive_checkpoint_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_import comind.cm_archive_import%ROWTYPE;
  v_baseline_import uuid;
  v_previous comind.cm_archive_checkpoint%ROWTYPE;
BEGIN
  SELECT * INTO v_import FROM comind.cm_archive_import WHERE import_id=NEW.import_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkpoint import does not exist'; END IF;
  IF v_import.status NOT IN ('PASS','WARN') THEN
    RAISE EXCEPTION 'checkpoint requires finalized PASS/WARN import, found %', v_import.status;
  END IF;
  IF NEW.parser_version <> v_import.parser_version OR NEW.schema_version <> v_import.schema_version THEN
    RAISE EXCEPTION 'checkpoint parser/schema identity must match import';
  END IF;

  SELECT import_id INTO v_baseline_import
  FROM comind.cm_conversation_history_baseline
  WHERE baseline_id=NEW.baseline_id;
  IF v_baseline_import IS NULL THEN RAISE EXCEPTION 'checkpoint baseline does not exist'; END IF;

  IF NEW.sequence_no=1 THEN
    IF v_import.import_mode <> 'full_snapshot' THEN RAISE EXCEPTION 'baseline checkpoint requires full_snapshot import'; END IF;
    IF v_baseline_import <> NEW.import_id THEN RAISE EXCEPTION 'baseline checkpoint must reference certification for the same import'; END IF;
    IF EXISTS (SELECT 1 FROM comind.cm_archive_checkpoint WHERE archive_stream_id=NEW.archive_stream_id) THEN
      RAISE EXCEPTION 'archive stream already has a baseline checkpoint';
    END IF;
  ELSE
    IF v_import.import_mode <> 'differential' THEN RAISE EXCEPTION 'later checkpoint requires differential import'; END IF;
    SELECT * INTO v_previous
    FROM comind.cm_archive_checkpoint
    WHERE archive_stream_id=NEW.archive_stream_id
    ORDER BY sequence_no DESC
    LIMIT 1
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'differential checkpoint requires an accepted predecessor'; END IF;
    IF NEW.sequence_no <> v_previous.sequence_no + 1 OR NEW.predecessor_checkpoint_id <> v_previous.checkpoint_id THEN
      RAISE EXCEPTION 'checkpoint must extend the latest accepted predecessor';
    END IF;
    IF NEW.baseline_id <> v_previous.baseline_id THEN RAISE EXCEPTION 'differential checkpoint must preserve the original baseline anchor'; END IF;
    IF NEW.parser_version <> v_previous.parser_version OR NEW.schema_version <> v_previous.schema_version OR NEW.hash_version <> v_previous.hash_version THEN
      RAISE EXCEPTION 'parser/schema/hash version mismatch requires reviewed reprocessing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_archive_checkpoint_guard ON comind.cm_archive_checkpoint;
CREATE TRIGGER trg_cm_archive_checkpoint_guard
BEFORE INSERT ON comind.cm_archive_checkpoint
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_archive_checkpoint_insert();

DROP TRIGGER IF EXISTS trg_cm_archive_stream_immutable ON comind.cm_archive_stream;
CREATE TRIGGER trg_cm_archive_stream_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_stream
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_checkpoint_immutable ON comind.cm_archive_checkpoint;
CREATE TRIGGER trg_cm_archive_checkpoint_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_checkpoint
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_snapshot_conversation_immutable ON comind.cm_archive_snapshot_conversation;
CREATE TRIGGER trg_cm_archive_snapshot_conversation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_snapshot_conversation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_snapshot_node_immutable ON comind.cm_archive_snapshot_node;
CREATE TRIGGER trg_cm_archive_snapshot_node_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_snapshot_node
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

CREATE OR REPLACE FUNCTION comind.cm_guard_archive_import_finalization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'archive import attempts are immutable'; END IF;
  IF OLD.status <> 'PENDING' THEN RAISE EXCEPTION 'finalized archive import attempts are immutable'; END IF;
  IF NEW.source_archive_id <> OLD.source_archive_id
     OR NEW.parser_version <> OLD.parser_version
     OR NEW.schema_version <> OLD.schema_version
     OR NEW.started_at <> OLD.started_at
     OR NEW.attempt_number <> OLD.attempt_number
     OR NEW.import_mode <> OLD.import_mode
     OR NEW.predecessor_import_id IS DISTINCT FROM OLD.predecessor_import_id
     OR NEW.root_import_id IS DISTINCT FROM OLD.root_import_id
     OR NEW.recovery_reason IS DISTINCT FROM OLD.recovery_reason THEN
    RAISE EXCEPTION 'archive import identity and lineage fields are immutable';
  END IF;
  IF NEW.status = 'PENDING' THEN RAISE EXCEPTION 'archive import update must finalize the attempt'; END IF;
  IF NEW.completed_at IS NULL OR NEW.receipt IS NULL OR NEW.receipt_sha256 IS NULL THEN
    RAISE EXCEPTION 'archive import finalization requires completion time and integrity receipt';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE v_table text; v_role text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['cm_archive_stream','cm_archive_checkpoint','cm_archive_snapshot_conversation','cm_archive_snapshot_node'] LOOP
    EXECUTE format('ALTER TABLE comind.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE comind.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE comind.%I FROM PUBLIC',v_table);
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE comind.%I FROM %I',v_table,v_role);
      END IF;
    END LOOP;
    EXECUTE format('GRANT SELECT, INSERT ON TABLE comind.%I TO comind_archive_ingestor',v_table);
    EXECUTE format('DROP POLICY IF EXISTS cm_archive_ingestor_select ON comind.%I',v_table);
    EXECUTE format('CREATE POLICY cm_archive_ingestor_select ON comind.%I FOR SELECT TO comind_archive_ingestor USING (true)',v_table);
    EXECUTE format('DROP POLICY IF EXISTS cm_archive_ingestor_insert ON comind.%I',v_table);
    EXECUTE format('CREATE POLICY cm_archive_ingestor_insert ON comind.%I FOR INSERT TO comind_archive_ingestor WITH CHECK (true)',v_table);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_guard_archive_checkpoint_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_checkpoint_insert() FROM comind_archive_ingestor;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_finalization() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_finalization() FROM comind_archive_ingestor;

COMMENT ON TABLE comind.cm_archive_stream IS 'Stable governed identity for one sequence of full ChatGPT exports from the same source/account scope.';
COMMENT ON TABLE comind.cm_archive_checkpoint IS 'Append-only accepted snapshot chain. Only PASS/WARN imports can advance it; the first checkpoint is an explicitly certified full baseline.';
COMMENT ON TABLE comind.cm_archive_snapshot_conversation IS 'Per-export conversation membership. Unchanged rows reuse prior immutable observation content; absent rows are observations, never deletion authority.';
COMMENT ON TABLE comind.cm_archive_snapshot_node IS 'Per-export node membership. Unchanged nodes reuse prior immutable observation content while changed/new nodes point to new evidence.';
COMMENT ON COLUMN comind.cm_archive_import.import_mode IS 'full_snapshot for complete baseline-style persistence; differential for later full exports that persist only changed content plus membership.';

COMMIT;
