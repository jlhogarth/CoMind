-- CFR-001E isolated-CI cleanup compatibility
--
-- Canonical Supabase/Test prune-manifest foreign keys use ON DELETE RESTRICT.
-- The local integration harness deletes disposable conversations after each
-- test, so only the isolated schema converts these four references to CASCADE.

ALTER TABLE comind.cm_conversation_prune_manifest
  DROP CONSTRAINT IF EXISTS cm_conversation_prune_manifest_conv_id_fkey,
  DROP CONSTRAINT IF EXISTS cm_conversation_prune_manifest_policy_id_fkey,
  DROP CONSTRAINT IF EXISTS cm_conversation_prune_manifest_evaluation_id_fkey,
  DROP CONSTRAINT IF EXISTS cm_conversation_prune_manifest_checkpoint_id_fkey;

ALTER TABLE comind.cm_conversation_prune_manifest
  ADD CONSTRAINT cm_conversation_prune_manifest_conv_id_fkey
    FOREIGN KEY (conv_id) REFERENCES comind.cm_conversation(conv_id) ON DELETE CASCADE,
  ADD CONSTRAINT cm_conversation_prune_manifest_policy_id_fkey
    FOREIGN KEY (policy_id) REFERENCES comind.cm_retention_policy(rp_id) ON DELETE CASCADE,
  ADD CONSTRAINT cm_conversation_prune_manifest_evaluation_id_fkey
    FOREIGN KEY (evaluation_id) REFERENCES comind.cm_conversation_promotion_evaluation(evaluation_id) ON DELETE CASCADE,
  ADD CONSTRAINT cm_conversation_prune_manifest_checkpoint_id_fkey
    FOREIGN KEY (checkpoint_id) REFERENCES comind.cm_conversation_recovery_checkpoint(checkpoint_id) ON DELETE CASCADE;
