-- CHIST-K01: preserve immutability only for generic RAG rows linked to
-- Conversation History retrieval evidence. Unlinked generic rows must retain
-- their pre-K01 update/delete behavior.
BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_guard_linked_retrieval_doc_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM comind.cm_retrieval_document r WHERE r.doc_id=OLD.doc_id) THEN
    RAISE EXCEPTION 'Document is immutable because it is linked to Conversation History retrieval evidence';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_guard_linked_retrieval_chunk_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM comind.cm_retrieval_chunk r WHERE r.chunk_id=OLD.chunk_id) THEN
    RAISE EXCEPTION 'Chunk is immutable because it is linked to Conversation History retrieval evidence';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_guard_linked_retrieval_embedding_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM comind.cm_retrieval_embedding r WHERE r.emb_id=OLD.emb_id) THEN
    RAISE EXCEPTION 'Embedding is immutable because it is linked to Conversation History retrieval evidence';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_guard_linked_retrieval_doc_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_linked_retrieval_chunk_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_linked_retrieval_embedding_mutation() FROM PUBLIC;

COMMENT ON FUNCTION comind.cm_guard_linked_retrieval_doc_mutation() IS
  'CHIST-K01 blocks mutation only when a generic document is linked to immutable Conversation History retrieval evidence; unlinked rows retain normal UPDATE/DELETE semantics.';
COMMENT ON FUNCTION comind.cm_guard_linked_retrieval_chunk_mutation() IS
  'CHIST-K01 blocks mutation only when a generic chunk is linked to immutable Conversation History retrieval evidence; unlinked rows retain normal UPDATE/DELETE semantics.';
COMMENT ON FUNCTION comind.cm_guard_linked_retrieval_embedding_mutation() IS
  'CHIST-K01 blocks mutation only when a generic embedding is linked to immutable Conversation History retrieval evidence; unlinked rows retain normal UPDATE/DELETE semantics.';

COMMIT;
