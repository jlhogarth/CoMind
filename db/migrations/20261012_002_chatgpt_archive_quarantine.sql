-- Issue #108: lossless quarantine for source fragments that cannot enter normalized observations.
BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_archive_quarantine (
  quarantine_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  fragment_kind text NOT NULL CHECK (fragment_kind IN ('conversation', 'mapping_node', 'file_record', 'other')),
  source_path text,
  source_conversation_id text,
  source_node_id text,
  raw_fragment jsonb NOT NULL,
  raw_fragment_sha256 char(64) NOT NULL CHECK (raw_fragment_sha256 ~ '^[a-f0-9]{64}$'),
  reason_code text NOT NULL,
  detail text NOT NULL,
  quarantined_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_archive_quarantine_identity UNIQUE (
    import_id,
    fragment_kind,
    raw_fragment_sha256,
    reason_code
  )
);

DROP TRIGGER IF EXISTS trg_cm_archive_quarantine_immutable ON comind.cm_archive_quarantine;
CREATE TRIGGER trg_cm_archive_quarantine_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_quarantine
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_evidence_mutation();

COMMENT ON TABLE comind.cm_archive_quarantine IS
  'Lossless raw evidence that could not be normalized. Quarantined evidence prevents silent source-record disappearance.';

COMMIT;
