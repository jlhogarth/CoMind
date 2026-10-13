-- Issue #108: governed ChatGPT archive ingestion and integrity handshake.
-- Repository implementation only until separately authorized for live deployment.
BEGIN;

CREATE SCHEMA IF NOT EXISTS comind;

CREATE OR REPLACE FUNCTION comind.cm_reject_archive_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION 'archive evidence is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_guard_archive_import_finalization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'archive import attempts are immutable';
  END IF;

  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'finalized archive import attempts are immutable';
  END IF;

  IF NEW.source_archive_id <> OLD.source_archive_id
     OR NEW.parser_version <> OLD.parser_version
     OR NEW.schema_version <> OLD.schema_version
     OR NEW.started_at <> OLD.started_at THEN
    RAISE EXCEPTION 'archive import identity fields are immutable';
  END IF;

  IF NEW.status = 'PENDING' THEN
    RAISE EXCEPTION 'archive import update must finalize the attempt';
  END IF;

  IF NEW.completed_at IS NULL OR NEW.receipt IS NULL OR NEW.receipt_sha256 IS NULL THEN
    RAISE EXCEPTION 'archive import finalization requires completion time and integrity receipt';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_archive_source (
  source_archive_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system text NOT NULL DEFAULT 'chatgpt',
  source_archive_name text NOT NULL,
  source_archive_sha256 char(64) NOT NULL CHECK (source_archive_sha256 ~ '^[a-f0-9]{64}$'),
  source_archive_bytes bigint NOT NULL CHECK (source_archive_bytes >= 0),
  source_uri text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_metadata) = 'object'),
  CONSTRAINT cm_archive_source_identity UNIQUE (source_system, source_archive_sha256)
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_source_file (
  source_archive_id uuid NOT NULL REFERENCES comind.cm_archive_source(source_archive_id) ON DELETE RESTRICT,
  source_path text NOT NULL,
  file_role text NOT NULL CHECK (file_role IN ('conversation_json', 'metadata_json', 'html', 'asset', 'other')),
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  media_type text,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_metadata) = 'object'),
  PRIMARY KEY (source_archive_id, source_path)
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_import (
  import_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_archive_id uuid NOT NULL REFERENCES comind.cm_archive_source(source_archive_id) ON DELETE RESTRICT,
  parser_version text NOT NULL,
  schema_version text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PASS', 'WARN', 'FAIL')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  source_conversation_count bigint,
  source_message_count bigint,
  source_node_count bigint,
  source_attachment_count bigint,
  imported_conversation_count bigint,
  imported_message_count bigint,
  imported_node_count bigint,
  imported_attachment_count bigint,
  parser_error_count bigint NOT NULL DEFAULT 0 CHECK (parser_error_count >= 0),
  parser_warning_count bigint NOT NULL DEFAULT 0 CHECK (parser_warning_count >= 0),
  reconciliation jsonb,
  receipt jsonb,
  receipt_sha256 char(64) CHECK (receipt_sha256 IS NULL OR receipt_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT cm_archive_import_attempt_identity UNIQUE (source_archive_id, parser_version, schema_version),
  CONSTRAINT cm_archive_import_completion_consistency CHECK (
    (status = 'PENDING' AND completed_at IS NULL AND receipt IS NULL AND receipt_sha256 IS NULL)
    OR
    (status <> 'PENDING' AND completed_at IS NOT NULL AND receipt IS NOT NULL AND receipt_sha256 IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_conversation_observation (
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  source_conversation_id text NOT NULL,
  title text,
  source_created_at jsonb,
  source_updated_at jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  raw_source_hash char(64) NOT NULL CHECK (raw_source_hash ~ '^[a-f0-9]{64}$'),
  normalized_hash char(64) NOT NULL CHECK (normalized_hash ~ '^[a-f0-9]{64}$'),
  topology_hash char(64) NOT NULL CHECK (topology_hash ~ '^[a-f0-9]{64}$'),
  node_count bigint NOT NULL CHECK (node_count >= 0),
  message_count bigint NOT NULL CHECK (message_count >= 0),
  attachment_reference_count bigint NOT NULL DEFAULT 0 CHECK (attachment_reference_count >= 0),
  raw_conversation jsonb NOT NULL CHECK (jsonb_typeof(raw_conversation) = 'object'),
  PRIMARY KEY (import_id, source_conversation_id)
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_node_observation (
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  source_node_id text NOT NULL,
  parent_source_node_id text,
  child_source_node_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(child_source_node_ids) = 'array'),
  source_message_id text,
  role text,
  source_created_at jsonb,
  source_updated_at jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  content_type text,
  raw_node_hash char(64) NOT NULL CHECK (raw_node_hash ~ '^[a-f0-9]{64}$'),
  normalized_message_hash char(64) CHECK (normalized_message_hash IS NULL OR normalized_message_hash ~ '^[a-f0-9]{64}$'),
  raw_node jsonb NOT NULL CHECK (jsonb_typeof(raw_node) = 'object'),
  PRIMARY KEY (import_id, source_conversation_id, source_node_id),
  FOREIGN KEY (import_id, source_conversation_id)
    REFERENCES comind.cm_archive_conversation_observation(import_id, source_conversation_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_archive_message_identity
  ON comind.cm_archive_node_observation(import_id, source_conversation_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_archive_node_parent
  ON comind.cm_archive_node_observation(import_id, source_conversation_id, parent_source_node_id);

CREATE TABLE IF NOT EXISTS comind.cm_archive_attachment_reference (
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  source_node_id text NOT NULL,
  source_message_id text,
  reference_kind text NOT NULL,
  source_reference text NOT NULL,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_metadata) = 'object'),
  reference_hash char(64) NOT NULL CHECK (reference_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (import_id, source_conversation_id, source_node_id, reference_hash),
  FOREIGN KEY (import_id, source_conversation_id, source_node_id)
    REFERENCES comind.cm_archive_node_observation(import_id, source_conversation_id, source_node_id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS comind.cm_archive_parser_event (
  parser_event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  severity text NOT NULL CHECK (severity IN ('WARNING', 'ERROR')),
  event_code text NOT NULL,
  source_path text,
  source_conversation_id text,
  source_node_id text,
  source_message_id text,
  detail text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  evidence_sha256 char(64) NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cm_archive_parser_event_import
  ON comind.cm_archive_parser_event(import_id, severity, parser_event_id);

CREATE TABLE IF NOT EXISTS comind.cm_archive_diff_receipt (
  diff_receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  comparison_import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  diff_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('PASS', 'WARN', 'FAIL')),
  created_at timestamptz NOT NULL DEFAULT now(),
  classification_counts jsonb NOT NULL CHECK (jsonb_typeof(classification_counts) = 'object'),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object'),
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT cm_archive_diff_direction CHECK (baseline_import_id <> comparison_import_id),
  CONSTRAINT cm_archive_diff_identity UNIQUE (baseline_import_id, comparison_import_id, diff_version)
);

DROP TRIGGER IF EXISTS trg_cm_archive_source_immutable ON comind.cm_archive_source;
CREATE TRIGGER trg_cm_archive_source_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_source
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_source_file_immutable ON comind.cm_archive_source_file;
CREATE TRIGGER trg_cm_archive_source_file_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_source_file
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_conversation_immutable ON comind.cm_archive_conversation_observation;
CREATE TRIGGER trg_cm_archive_conversation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_conversation_observation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_node_immutable ON comind.cm_archive_node_observation;
CREATE TRIGGER trg_cm_archive_node_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_node_observation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_attachment_immutable ON comind.cm_archive_attachment_reference;
CREATE TRIGGER trg_cm_archive_attachment_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_attachment_reference
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_parser_event_immutable ON comind.cm_archive_parser_event;
CREATE TRIGGER trg_cm_archive_parser_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_parser_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_diff_receipt_immutable ON comind.cm_archive_diff_receipt;
CREATE TRIGGER trg_cm_archive_diff_receipt_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_diff_receipt
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_import_finalize ON comind.cm_archive_import;
CREATE TRIGGER trg_cm_archive_import_finalize
BEFORE UPDATE OR DELETE ON comind.cm_archive_import
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_archive_import_finalization();

COMMENT ON TABLE comind.cm_archive_source IS
  'Immutable identity for one observed external archive. Hash identity is independent of parser attempts.';
COMMENT ON TABLE comind.cm_archive_import IS
  'One parser/schema attempt against an immutable archive source. PASS/WARN/FAIL is computed from reconciliation evidence.';
COMMENT ON TABLE comind.cm_archive_conversation_observation IS
  'Lossless per-import ChatGPT conversation evidence with deterministic raw, normalized, and topology hashes.';
COMMENT ON TABLE comind.cm_archive_node_observation IS
  'Lossless ChatGPT mapping-node evidence. Nodes without messages are retained so branch topology is not flattened.';
COMMENT ON TABLE comind.cm_archive_diff_receipt IS
  'Reserved durable receipt for point-in-time comparison after two independently verified baseline imports exist.';

COMMIT;
