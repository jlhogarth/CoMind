-- CFR-001F: native ChatGPT archive and live CFR reconciliation substrate.
-- Additive, non-destructive, Test-first. This migration does not reconcile,
-- overwrite, promote, or delete source evidence.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_cm_archive_diff_receipt_comparison_import
  ON comind.cm_archive_diff_receipt (comparison_import_id);

CREATE OR REPLACE FUNCTION comind.cm_reject_reconciliation_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
BEGIN
  RAISE EXCEPTION 'conversation reconciliation evidence is immutable';
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_conversation_reconciliation_receipt (
  reconciliation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  reconciliation_version text NOT NULL,
  archive_normalized_hash char(64) NOT NULL CHECK (archive_normalized_hash ~ '^[a-f0-9]{64}$'),
  archive_topology_hash char(64) NOT NULL CHECK (archive_topology_hash ~ '^[a-f0-9]{64}$'),
  live_snapshot_cutoff timestamptz NOT NULL,
  live_candidate_set_sha256 char(64) NOT NULL CHECK (live_candidate_set_sha256 ~ '^[a-f0-9]{64}$'),
  result text NOT NULL CHECK (result IN (
    'exact_match',
    'compatible_extension',
    'conflicting_observation',
    'ambiguous_match',
    'unmatched_archive'
  )),
  selected_conv_id uuid REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  match_method text NOT NULL CHECK (match_method IN (
    'explicit_source_id',
    'ordered_message_fingerprint',
    'weak_correlation',
    'none'
  )),
  classification_counts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(classification_counts) = 'object'),
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conflicts) = 'array'),
  unresolved jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(unresolved) = 'array'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  receipt_sha256 char(64) NOT NULL CHECK (receipt_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (import_id, source_conversation_id)
    REFERENCES comind.cm_archive_conversation_observation(import_id, source_conversation_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_conversation_reconciliation_selection_consistency CHECK (
    (result IN ('exact_match', 'compatible_extension', 'conflicting_observation') AND selected_conv_id IS NOT NULL)
    OR
    (result IN ('ambiguous_match', 'unmatched_archive') AND selected_conv_id IS NULL)
  ),
  CONSTRAINT cm_conversation_reconciliation_method_consistency CHECK (
    (result = 'unmatched_archive' AND match_method = 'none')
    OR
    (result <> 'unmatched_archive' AND match_method <> 'none')
  ),
  CONSTRAINT cm_conversation_reconciliation_identity UNIQUE (
    import_id,
    source_conversation_id,
    reconciliation_version,
    live_candidate_set_sha256
  )
);

CREATE TABLE IF NOT EXISTS comind.cm_conversation_reconciliation_candidate (
  reconciliation_id uuid NOT NULL
    REFERENCES comind.cm_conversation_reconciliation_receipt(reconciliation_id) ON DELETE RESTRICT,
  conv_id uuid NOT NULL REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
  candidate_rank integer NOT NULL CHECK (candidate_rank > 0),
  match_method text NOT NULL CHECK (match_method IN (
    'explicit_source_id',
    'ordered_message_fingerprint',
    'weak_correlation'
  )),
  match_strength text NOT NULL CHECK (match_strength IN ('strong', 'medium', 'weak')),
  classification text NOT NULL CHECK (classification IN (
    'exact_candidate',
    'extension_candidate',
    'conflict_candidate',
    'partial_candidate',
    'weak_candidate'
  )),
  selected boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  candidate_sha256 char(64) NOT NULL CHECK (candidate_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reconciliation_id, conv_id),
  CONSTRAINT cm_conversation_reconciliation_candidate_rank UNIQUE (reconciliation_id, candidate_rank)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_conversation_reconciliation_selected
  ON comind.cm_conversation_reconciliation_candidate (reconciliation_id)
  WHERE selected;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_reconciliation_receipt_selected_conv
  ON comind.cm_conversation_reconciliation_receipt (selected_conv_id)
  WHERE selected_conv_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_reconciliation_receipt_archive
  ON comind.cm_conversation_reconciliation_receipt (import_id, source_conversation_id);

CREATE INDEX IF NOT EXISTS idx_cm_conversation_reconciliation_candidate_conv
  ON comind.cm_conversation_reconciliation_candidate (conv_id);

DROP TRIGGER IF EXISTS trg_cm_conversation_reconciliation_receipt_immutable
  ON comind.cm_conversation_reconciliation_receipt;
CREATE TRIGGER trg_cm_conversation_reconciliation_receipt_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_reconciliation_receipt
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_reconciliation_evidence_mutation();

DROP TRIGGER IF EXISTS trg_cm_conversation_reconciliation_candidate_immutable
  ON comind.cm_conversation_reconciliation_candidate;
CREATE TRIGGER trg_cm_conversation_reconciliation_candidate_immutable
BEFORE UPDATE OR DELETE ON comind.cm_conversation_reconciliation_candidate
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_reconciliation_evidence_mutation();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_conversation_reconciler') THEN
    CREATE ROLE comind_conversation_reconciler
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_conversation_reconciler
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA comind TO comind_conversation_reconciler;
GRANT comind_conversation_reconciler TO CURRENT_USER;

GRANT SELECT ON TABLE
  comind.cm_conversation,
  comind.cm_message,
  comind.cm_conversation_capture_event,
  comind.cm_assistant_generation,
  comind.cm_conversation_recovery_checkpoint,
  comind.cm_archive_source,
  comind.cm_archive_import,
  comind.cm_archive_conversation_observation,
  comind.cm_archive_node_observation,
  comind.cm_archive_attachment_reference,
  comind.cm_archive_parser_event,
  comind.cm_archive_quarantine
TO comind_conversation_reconciler;

GRANT SELECT, INSERT ON TABLE
  comind.cm_conversation_reconciliation_receipt,
  comind.cm_conversation_reconciliation_candidate
TO comind_conversation_reconciler;

ALTER TABLE comind.cm_conversation_reconciliation_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_reconciliation_receipt FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_reconciliation_candidate ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_conversation_reconciliation_candidate FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table text;
  v_role text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_conversation_reconciliation_receipt',
    'cm_conversation_reconciliation_candidate'
  ]
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE comind.%I FROM PUBLIC', v_table);
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'comind_archive_ingestor']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE comind.%I FROM %I', v_table, v_role);
      END IF;
    END LOOP;

    EXECUTE format('DROP POLICY IF EXISTS cm_conversation_reconciler_select ON comind.%I', v_table);
    EXECUTE format(
      'CREATE POLICY cm_conversation_reconciler_select ON comind.%I FOR SELECT TO comind_conversation_reconciler USING (true)',
      v_table
    );
    EXECUTE format('DROP POLICY IF EXISTS cm_conversation_reconciler_insert ON comind.%I', v_table);
    EXECUTE format(
      'CREATE POLICY cm_conversation_reconciler_insert ON comind.%I FOR INSERT TO comind_conversation_reconciler WITH CHECK (true)',
      v_table
    );
  END LOOP;
END;
$$;

-- Archive evidence is forced-RLS. Give the dedicated reconciler read-only policies
-- without widening the archive ingestor or any Supabase Data API role.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_source',
    'cm_archive_import',
    'cm_archive_conversation_observation',
    'cm_archive_node_observation',
    'cm_archive_attachment_reference',
    'cm_archive_parser_event',
    'cm_archive_quarantine'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS cm_conversation_reconciler_select ON comind.%I', v_table);
    EXECUTE format(
      'CREATE POLICY cm_conversation_reconciler_select ON comind.%I FOR SELECT TO comind_conversation_reconciler USING (true)',
      v_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_reject_reconciliation_evidence_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_reject_reconciliation_evidence_mutation() FROM comind_conversation_reconciler;
REVOKE ALL ON FUNCTION comind.cm_reject_reconciliation_evidence_mutation() FROM comind_archive_ingestor;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION comind.cm_reject_reconciliation_evidence_mutation() FROM %I',
        v_role
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON TABLE comind.cm_conversation_reconciliation_receipt IS
  'Immutable CFR-001F receipt reconciling one ChatGPT archive conversation observation against a deterministic snapshot of live CFR candidates. It never overwrites either source.';
COMMENT ON TABLE comind.cm_conversation_reconciliation_candidate IS
  'Immutable per-live-conversation candidate evidence used by one CFR-001F reconciliation receipt. Weak correlation may create a candidate but cannot by itself establish identity.';
COMMENT ON ROLE comind_conversation_reconciler IS
  'NOLOGIN least-privilege role for read-only live/archive comparison and append-only reconciliation evidence. Not a Supabase Data API role.';

COMMIT;
