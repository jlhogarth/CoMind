-- CFR-001E local PostgreSQL hardening parity
-- Covers the prune-manifest evaluation_id foreign key in isolated CI.

CREATE INDEX IF NOT EXISTS idx_cm_conversation_prune_manifest_evaluation
  ON comind.cm_conversation_prune_manifest (evaluation_id);
