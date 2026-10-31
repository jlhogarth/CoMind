-- TK-006 / Issue #256: extend the governed Conversation History reader to
-- accepted differential checkpoint membership for ThreadKeeper C3 integration.
--
-- This migration is read-only capability expansion. It grants no archive
-- ingestion, certification, checkpoint creation, mutation, or deletion
-- authority to the history reader.
BEGIN;

GRANT SELECT ON TABLE
  comind.cm_archive_checkpoint,
  comind.cm_archive_snapshot_conversation
TO comind_conversation_history_reader;

DROP POLICY IF EXISTS cm_conversation_history_reader_select
  ON comind.cm_archive_checkpoint;
CREATE POLICY cm_conversation_history_reader_select
  ON comind.cm_archive_checkpoint
  FOR SELECT TO comind_conversation_history_reader
  USING (
    EXISTS (
      SELECT 1
      FROM comind.cm_conversation_history_baseline b
      WHERE b.baseline_id = cm_archive_checkpoint.baseline_id
    )
  );

DROP POLICY IF EXISTS cm_conversation_history_reader_select
  ON comind.cm_archive_snapshot_conversation;
CREATE POLICY cm_conversation_history_reader_select
  ON comind.cm_archive_snapshot_conversation
  FOR SELECT TO comind_conversation_history_reader
  USING (
    EXISTS (
      SELECT 1
      FROM comind.cm_archive_checkpoint c
      WHERE c.import_id = cm_archive_snapshot_conversation.import_id
    )
  );

-- Defense in depth: the C3 reader contract remains SELECT-only even if a
-- future role grant changes elsewhere.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE comind.cm_archive_checkpoint,
           comind.cm_archive_snapshot_conversation
  FROM comind_conversation_history_reader;

COMMENT ON POLICY cm_conversation_history_reader_select
  ON comind.cm_archive_checkpoint IS
  'TK-006: reader may inspect only accepted archive checkpoints anchored to an explicit Conversation History baseline.';
COMMENT ON POLICY cm_conversation_history_reader_select
  ON comind.cm_archive_snapshot_conversation IS
  'TK-006: reader may inspect per-export conversation membership only for an accepted archive checkpoint visible through the governed baseline chain.';

COMMIT;
