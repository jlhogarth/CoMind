-- CHIST-K01: canonical Supabase Test advisor hardening.
-- Production change: false.
BEGIN;

-- Supabase flags user-table reg* columns as pg_upgrade incompatible.
-- K01 currently supports only the deterministic simple FTS configuration, so
-- persist its stable policy identifier as text rather than a regconfig OID.
ALTER TABLE comind.cm_retrieval_policy
  ALTER COLUMN fts_config DROP DEFAULT,
  ALTER COLUMN fts_config TYPE text USING fts_config::text,
  ALTER COLUMN fts_config SET DEFAULT 'simple';

ALTER TABLE comind.cm_retrieval_policy
  DROP CONSTRAINT IF EXISTS cm_retrieval_policy_fts_config_supported;
ALTER TABLE comind.cm_retrieval_policy
  ADD CONSTRAINT cm_retrieval_policy_fts_config_supported
  CHECK (fts_config = 'simple');

-- Cover K01 foreign keys identified by the Supabase performance advisor.
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_document_corpus_fk
  ON comind.cm_retrieval_document(corpus_id, import_id);
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_document_doc_fk
  ON comind.cm_retrieval_document(doc_id);
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_chunk_chunk_fk
  ON comind.cm_retrieval_chunk(chunk_id);

COMMIT;
