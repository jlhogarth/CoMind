-- CFR-001F point-in-time identity hardening.
-- The live snapshot cutoff is an explicit reconciliation input. Preserve
-- independently reproducible receipts for different cutoffs even when the
-- candidate-set digest happens to be identical.
BEGIN;

ALTER TABLE comind.cm_conversation_reconciliation_receipt
  DROP CONSTRAINT IF EXISTS cm_conversation_reconciliation_identity;

ALTER TABLE comind.cm_conversation_reconciliation_receipt
  ADD CONSTRAINT cm_conversation_reconciliation_identity UNIQUE (
    import_id,
    source_conversation_id,
    reconciliation_version,
    live_candidate_set_sha256,
    live_snapshot_cutoff
  );

COMMIT;
