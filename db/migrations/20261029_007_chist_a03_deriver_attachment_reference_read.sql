-- CHIST-A03 least-privilege repair discovered during real Test run construction.
-- The corpus run records the message-level attachment-reference count, so the
-- existing Conversation History deriver needs bounded read access to that
-- canonical source-evidence relation. No write privilege is added.

BEGIN;
SET search_path TO comind, public;

DO $$
BEGIN
  IF to_regclass('comind.cm_archive_attachment_reference') IS NULL THEN
    RAISE EXCEPTION 'CHIST-A03 requires comind.cm_archive_attachment_reference';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_history_deriver') THEN
    RAISE EXCEPTION 'CHIST-A03 requires comind_conversation_history_deriver';
  END IF;
END
$$;

GRANT SELECT ON comind.cm_archive_attachment_reference
TO comind_conversation_history_deriver;

COMMIT;
