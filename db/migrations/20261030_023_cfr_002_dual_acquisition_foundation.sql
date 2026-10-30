-- CFR-002: CoMind Native Conversation Interface
-- First implementation slice: source-neutral dual acquisition evidence.
-- Issue #387 / PR #388.
-- Production activation is not authorized by this repository migration.

BEGIN;

CREATE SCHEMA IF NOT EXISTS comind;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'comind_conversation_acquisition_writer'
  ) THEN
    CREATE ROLE comind_conversation_acquisition_writer
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_conversation_acquisition_writer
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS comind.cm_conversation_acquisition_observation (
  acquisition_observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  generation_id uuid REFERENCES comind.cm_assistant_generation(generation_id) ON DELETE RESTRICT,
  source_family text NOT NULL CHECK (
    source_family IN ('openai_api', 'chatgpt_browser_observed')
  ),
  source_stream_ref text NOT NULL CHECK (length(btrim(source_stream_ref)) > 0),
  source_event_family text NOT NULL CHECK (length(btrim(source_event_family)) > 0),
  source_event_ref text NOT NULL CHECK (length(btrim(source_event_ref)) > 0),
  source_sequence_no bigint CHECK (source_sequence_no IS NULL OR source_sequence_no >= 0),
  source_endpoint_family text,
  source_observed_at timestamptz,
  raw_envelope_sha256 char(64) NOT NULL CHECK (raw_envelope_sha256 ~ '^[a-f0-9]{64}$'),
  raw_envelope_bytes bigint NOT NULL CHECK (raw_envelope_bytes >= 0),
  raw_object_ref text,
  acquisition_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(acquisition_metadata) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_acquisition_source_identity
    UNIQUE (source_family, source_stream_ref, source_event_ref)
);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_acquisition_conv
  ON comind.cm_conversation_acquisition_observation (conv_id, captured_at, acquisition_observation_id);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_acquisition_generation
  ON comind.cm_conversation_acquisition_observation (generation_id, captured_at)
  WHERE generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_acquisition_source_sequence
  ON comind.cm_conversation_acquisition_observation (
    source_family, source_stream_ref, source_sequence_no
  )
  WHERE source_sequence_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_acquisition_raw_digest
  ON comind.cm_conversation_acquisition_observation (raw_envelope_sha256);

CREATE TABLE IF NOT EXISTS comind.cm_conversation_acquisition_normalization (
  normalization_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acquisition_observation_id uuid NOT NULL
    REFERENCES comind.cm_conversation_acquisition_observation(acquisition_observation_id)
    ON DELETE RESTRICT,
  normalizer_version text NOT NULL CHECK (length(btrim(normalizer_version)) > 0),
  status text NOT NULL CHECK (
    status IN (
      'normalized',
      'normalization_failed',
      'schema_drift',
      'duplicate',
      'out_of_order',
      'unknown'
    )
  ),
  normalization_class text CHECK (
    normalization_class IS NULL OR normalization_class IN (
      'assistant_text_delta',
      'assistant_text_completed',
      'reasoning_summary_delta',
      'reasoning_summary_completed',
      'tool_call_started',
      'tool_call_completed',
      'response_started',
      'response_completed',
      'response_incomplete',
      'response_failed'
    )
  ),
  normalized_capture_event_id uuid
    REFERENCES comind.cm_conversation_capture_event(capture_event_id)
    ON DELETE RESTRICT,
  detail text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object'),
  normalized_sha256 char(64) NOT NULL CHECK (normalized_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_acquisition_normalization_identity
    UNIQUE (acquisition_observation_id, normalizer_version),
  CONSTRAINT cm_conversation_acquisition_normalized_class_required CHECK (
    status <> 'normalized' OR normalization_class IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_acquisition_normalization_state
  ON comind.cm_conversation_acquisition_normalization (status, created_at);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_acquisition_normalized_capture
  ON comind.cm_conversation_acquisition_normalization (normalized_capture_event_id)
  WHERE normalized_capture_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comind.cm_conversation_acquisition_reconciliation (
  acquisition_reconciliation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conv_id uuid NOT NULL REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  left_source_family text NOT NULL CHECK (
    left_source_family IN ('openai_api', 'chatgpt_browser_observed')
  ),
  left_source_stream_ref text NOT NULL CHECK (length(btrim(left_source_stream_ref)) > 0),
  right_source_family text NOT NULL CHECK (
    right_source_family IN ('openai_api', 'chatgpt_browser_observed')
  ),
  right_source_stream_ref text NOT NULL CHECK (length(btrim(right_source_stream_ref)) > 0),
  comparison_version text NOT NULL CHECK (length(btrim(comparison_version)) > 0),
  result text NOT NULL CHECK (
    result IN ('exact', 'compatible_extension', 'conflict', 'ambiguous', 'unmatched')
  ),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(evidence) = 'object'),
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_conversation_acquisition_reconciliation_distinct_sources CHECK (
    (left_source_family, left_source_stream_ref)
      <> (right_source_family, right_source_stream_ref)
  ),
  CONSTRAINT cm_conversation_acquisition_reconciliation_identity UNIQUE (
    conv_id,
    left_source_family,
    left_source_stream_ref,
    right_source_family,
    right_source_stream_ref,
    comparison_version
  )
);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_acquisition_reconciliation_conv
  ON comind.cm_conversation_acquisition_reconciliation (conv_id, created_at DESC);

CREATE OR REPLACE FUNCTION comind.cm_reject_cfr_002_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable CFR-002 acquisition evidence', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_conversation_acquisition_observation_immutable
  ON comind.cm_conversation_acquisition_observation;
CREATE TRIGGER trg_cm_conversation_acquisition_observation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_acquisition_observation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_cfr_002_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_acquisition_normalization_immutable
  ON comind.cm_conversation_acquisition_normalization;
CREATE TRIGGER trg_cm_conversation_acquisition_normalization_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_acquisition_normalization
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_cfr_002_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_acquisition_reconciliation_immutable
  ON comind.cm_conversation_acquisition_reconciliation;
CREATE TRIGGER trg_cm_conversation_acquisition_reconciliation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_acquisition_reconciliation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_cfr_002_evidence_mutation();

ALTER TABLE comind.cm_conversation_acquisition_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_acquisition_observation FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_acquisition_normalization ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_acquisition_normalization FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_acquisition_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_acquisition_reconciliation FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_conversation_acquisition_observation_writer_select
  ON comind.cm_conversation_acquisition_observation;
CREATE POLICY cm_conversation_acquisition_observation_writer_select
  ON comind.cm_conversation_acquisition_observation
  FOR SELECT
  TO comind_conversation_acquisition_writer
  USING (true);

DROP POLICY IF EXISTS cm_conversation_acquisition_observation_writer_insert
  ON comind.cm_conversation_acquisition_observation;
CREATE POLICY cm_conversation_acquisition_observation_writer_insert
  ON comind.cm_conversation_acquisition_observation
  FOR INSERT
  TO comind_conversation_acquisition_writer
  WITH CHECK (true);

DROP POLICY IF EXISTS cm_conversation_acquisition_normalization_writer_select
  ON comind.cm_conversation_acquisition_normalization;
CREATE POLICY cm_conversation_acquisition_normalization_writer_select
  ON comind.cm_conversation_acquisition_normalization
  FOR SELECT
  TO comind_conversation_acquisition_writer
  USING (true);

DROP POLICY IF EXISTS cm_conversation_acquisition_normalization_writer_insert
  ON comind.cm_conversation_acquisition_normalization;
CREATE POLICY cm_conversation_acquisition_normalization_writer_insert
  ON comind.cm_conversation_acquisition_normalization
  FOR INSERT
  TO comind_conversation_acquisition_writer
  WITH CHECK (true);

DROP POLICY IF EXISTS cm_conversation_acquisition_reconciliation_writer_select
  ON comind.cm_conversation_acquisition_reconciliation;
CREATE POLICY cm_conversation_acquisition_reconciliation_writer_select
  ON comind.cm_conversation_acquisition_reconciliation
  FOR SELECT
  TO comind_conversation_acquisition_writer
  USING (true);

DROP POLICY IF EXISTS cm_conversation_acquisition_reconciliation_writer_insert
  ON comind.cm_conversation_acquisition_reconciliation;
CREATE POLICY cm_conversation_acquisition_reconciliation_writer_insert
  ON comind.cm_conversation_acquisition_reconciliation
  FOR INSERT
  TO comind_conversation_acquisition_writer
  WITH CHECK (true);

REVOKE ALL ON TABLE
  comind.cm_conversation_acquisition_observation,
  comind.cm_conversation_acquisition_normalization,
  comind.cm_conversation_acquisition_reconciliation
FROM PUBLIC;

GRANT USAGE ON SCHEMA comind TO comind_conversation_acquisition_writer;
GRANT SELECT, INSERT ON TABLE
  comind.cm_conversation_acquisition_observation,
  comind.cm_conversation_acquisition_normalization,
  comind.cm_conversation_acquisition_reconciliation
TO comind_conversation_acquisition_writer;

COMMENT ON TABLE comind.cm_conversation_acquisition_observation IS
  'Immutable CFR-002 source observation identity and raw-envelope lineage. Large raw payloads may be retained out of row and referenced by raw_object_ref.';

COMMENT ON TABLE comind.cm_conversation_acquisition_normalization IS
  'Immutable versioned normalization outcome. Drift and unknown source shapes remain explicit rather than guessed.';

COMMENT ON TABLE comind.cm_conversation_acquisition_reconciliation IS
  'Immutable deterministic comparison receipt for independently observed live acquisition streams. Source evidence is never overwritten.';

COMMIT;
