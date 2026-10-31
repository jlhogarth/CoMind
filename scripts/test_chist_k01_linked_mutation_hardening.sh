#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-K01 hardening verification}"

# psql prints command tags such as "INSERT 0 1" after INSERT ... RETURNING.
# K01 captures selected fixture identifiers from stdout, so make the acceptance
# entrypoint quiet at the client layer while preserving row/query output.
# Exporting the function carries the same deterministic behavior into the
# child acceptance script without changing database semantics.
psql() {
  command psql -q "$@"
}
export -f psql

# Establish the accepted Conversation History roles before applying the
# least-privilege pgvector type-visibility repair. The complete K01 acceptance
# reruns this prerequisite chain idempotently immediately afterward.
bash "${root}/scripts/test_chist_a02_deployment_reconciliation.sh"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261031_002_chist_k01_pgvector_type_visibility.sql"

# Prove the complete K01 behavior first.
bash "${root}/scripts/test_chist_k01_hybrid_rag.sh"

# Then apply the forward hardening that preserves normal behavior for generic
# RAG rows which are not linked to Conversation History retrieval evidence.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261026_014_conversation_history_hybrid_rag_linked_mutation_hardening.sql"

# Unlinked generic RAG rows must remain normally mutable and deletable.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_doc uuid;
  v_chunk uuid;
  v_emb uuid;
  v_text text;
BEGIN
  INSERT INTO comind.cm_doc(title,source,source_ref,metadata)
  VALUES ('unlinked-before','synthetic','k01-unlinked','{}'::jsonb)
  RETURNING doc_id INTO v_doc;

  INSERT INTO comind.cm_doc_chunk(doc_id,idx,content,metadata)
  VALUES (v_doc,0,'unlinked-before','{}'::jsonb)
  RETURNING chunk_id INTO v_chunk;

  INSERT INTO comind.cm_embedding(doc_id,chunk_id,model,dims,vec)
  VALUES (v_doc,v_chunk,'unlinked-before',3,'[1,0,0]'::extensions.vector)
  RETURNING emb_id INTO v_emb;

  UPDATE comind.cm_doc SET title='unlinked-after' WHERE doc_id=v_doc;
  UPDATE comind.cm_doc_chunk SET content='unlinked-after' WHERE chunk_id=v_chunk;
  UPDATE comind.cm_embedding SET model='unlinked-after' WHERE emb_id=v_emb;

  SELECT title INTO v_text FROM comind.cm_doc WHERE doc_id=v_doc;
  IF v_text<>'unlinked-after' THEN RAISE EXCEPTION 'unlinked document update was suppressed'; END IF;
  SELECT content INTO v_text FROM comind.cm_doc_chunk WHERE chunk_id=v_chunk;
  IF v_text<>'unlinked-after' THEN RAISE EXCEPTION 'unlinked chunk update was suppressed'; END IF;
  SELECT model INTO v_text FROM comind.cm_embedding WHERE emb_id=v_emb;
  IF v_text<>'unlinked-after' THEN RAISE EXCEPTION 'unlinked embedding update was suppressed'; END IF;

  DELETE FROM comind.cm_embedding WHERE emb_id=v_emb;
  DELETE FROM comind.cm_doc_chunk WHERE chunk_id=v_chunk;
  DELETE FROM comind.cm_doc WHERE doc_id=v_doc;

  IF EXISTS (SELECT 1 FROM comind.cm_doc WHERE doc_id=v_doc)
     OR EXISTS (SELECT 1 FROM comind.cm_doc_chunk WHERE chunk_id=v_chunk)
     OR EXISTS (SELECT 1 FROM comind.cm_embedding WHERE emb_id=v_emb) THEN
    RAISE EXCEPTION 'unlinked generic RAG rows were not deletable';
  END IF;
END
$$;
SQL

# Owner-level mutation of linked rows must still fail because their source
# lineage is immutable regardless of caller privilege.
set +e
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/tmp/k01_linked_doc.out 2>/tmp/k01_linked_doc.err
UPDATE comind.cm_doc SET title='forbidden-linked-update'
WHERE doc_id=(SELECT doc_id FROM comind.cm_retrieval_document ORDER BY doc_id LIMIT 1);
SQL
linked_doc_status=$?
set -e
[[ $linked_doc_status -ne 0 ]] || { echo 'linked document owner update unexpectedly succeeded' >&2; exit 1; }
grep -q 'linked to Conversation History retrieval evidence' /tmp/k01_linked_doc.err || {
  echo 'linked document update failed for unexpected reason' >&2; cat /tmp/k01_linked_doc.err >&2; exit 1;
}

set +e
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/tmp/k01_linked_chunk.out 2>/tmp/k01_linked_chunk.err
UPDATE comind.cm_doc_chunk SET content='forbidden-linked-update'
WHERE chunk_id=(SELECT chunk_id FROM comind.cm_retrieval_chunk ORDER BY chunk_id LIMIT 1);
SQL
linked_chunk_status=$?
set -e
[[ $linked_chunk_status -ne 0 ]] || { echo 'linked chunk owner update unexpectedly succeeded' >&2; exit 1; }
grep -q 'linked to Conversation History retrieval evidence' /tmp/k01_linked_chunk.err || {
  echo 'linked chunk update failed for unexpected reason' >&2; cat /tmp/k01_linked_chunk.err >&2; exit 1;
}

set +e
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL' >/tmp/k01_linked_embedding.out 2>/tmp/k01_linked_embedding.err
UPDATE comind.cm_embedding SET model='forbidden-linked-update'
WHERE emb_id=(SELECT emb_id FROM comind.cm_retrieval_embedding ORDER BY emb_id LIMIT 1);
SQL
linked_embedding_status=$?
set -e
[[ $linked_embedding_status -ne 0 ]] || { echo 'linked embedding owner update unexpectedly succeeded' >&2; exit 1; }
grep -q 'linked to Conversation History retrieval evidence' /tmp/k01_linked_embedding.err || {
  echo 'linked embedding update failed for unexpected reason' >&2; cat /tmp/k01_linked_embedding.err >&2; exit 1;
}

echo 'CHIST-K01 linked-only immutability hardening acceptance: PASS'
