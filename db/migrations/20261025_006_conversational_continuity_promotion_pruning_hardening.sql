-- CFR-001E hardening v0.1.1
-- Issue #181
--
-- Forward-only hardening after the Supabase Test advisor identified the
-- evaluation_id foreign key as the only CFR-001E foreign key without a
-- covering index. No retention, eligibility, or destructive-pruning behavior
-- changes in this migration.

CREATE INDEX IF NOT EXISTS idx_cm_conversation_prune_manifest_evaluation
  ON comind.cm_conversation_prune_manifest (evaluation_id);
