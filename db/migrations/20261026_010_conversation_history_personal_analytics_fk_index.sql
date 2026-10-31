-- CHIST-A01: cover the archive metric fact composite foreign key.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_cm_archive_metric_fact_run_scope_fk
  ON comind.cm_archive_metric_fact(
    archive_derivation_run_id,
    import_id,
    source_conversation_id
  );

COMMENT ON INDEX comind.idx_cm_archive_metric_fact_run_scope_fk IS
  'CHIST-A01 covering index for cm_archive_metric_fact_run_scope_fk.';

COMMIT;
