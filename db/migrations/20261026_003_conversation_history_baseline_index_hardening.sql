-- CHIST-001: forward-only performance hardening for certified Conversation History baselines.
-- Covers the source_archive_id foreign key reported by the Supabase database advisor.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_cm_conversation_history_baseline_source_archive
  ON comind.cm_conversation_history_baseline (source_archive_id);

COMMIT;
