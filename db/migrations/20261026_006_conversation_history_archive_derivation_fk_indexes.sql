-- CHIST-001: forward-only performance hardening for archive-native analytics.
-- Covers the composite child-side foreign keys reported by the Supabase advisor.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_cm_archive_derivation_run_scope_fk
  ON comind.cm_archive_derivation (archive_derivation_run_id, import_id, source_conversation_id);

CREATE INDEX IF NOT EXISTS idx_cm_archive_candidate_run_scope_fk
  ON comind.cm_archive_promotion_candidate (archive_derivation_run_id, import_id, source_conversation_id);

COMMIT;
