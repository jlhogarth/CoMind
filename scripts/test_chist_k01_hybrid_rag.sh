#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CHIST-K01 verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing CHIST-K01 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

# Establish the accepted Conversation History, A01 and A02 schema/security chain.
bash "${root}/scripts/test_chist_a02_deployment_reconciliation.sh"

# Reproduce the legacy generic RAG shape currently observed in Supabase Test.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS comind.cm_doc (
  doc_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  project_id uuid,
  title text,
  source text,
  source_ref text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comind.cm_doc_chunk (
  chunk_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid REFERENCES comind.cm_doc(doc_id) ON DELETE CASCADE,
  idx integer NOT NULL,
  content text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comind.cm_embedding (
  emb_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid REFERENCES comind.cm_doc(doc_id) ON DELETE CASCADE,
  chunk_id uuid REFERENCES comind.cm_doc_chunk(chunk_id) ON DELETE CASCADE,
  model text NOT NULL,
  dims integer NOT NULL DEFAULT 1536,
  vec extensions.vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_embedding_doc ON comind.cm_embedding(doc_id);
CREATE INDEX IF NOT EXISTS idx_embedding_chunk ON comind.cm_embedding(chunk_id);
CREATE INDEX IF NOT EXISTS idx_embedding_vec
  ON comind.cm_embedding USING ivfflat (vec extensions.vector_cosine_ops) WITH (lists=100);
SQL

# Prove fail-closed behavior if a legacy environment already contains embeddings.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
WITH d AS (
  INSERT INTO comind.cm_doc(title,source,source_ref) VALUES ('legacy guard','synthetic','guard') RETURNING doc_id
), c AS (
  INSERT INTO comind.cm_doc_chunk(doc_id,idx,content)
  SELECT doc_id,0,'legacy vector guard' FROM d RETURNING chunk_id,doc_id
)
INSERT INTO comind.cm_embedding(doc_id,chunk_id,model,dims,vec)
SELECT doc_id,chunk_id,'legacy-1536',1536,
  ('[' || array_to_string(array_fill(0::integer,ARRAY[1536]),',') || ']')::extensions.vector(1536)
FROM c;
SQL

set +e
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261026_013_conversation_history_hybrid_rag.sql" >/tmp/chist_k01_guard.out 2>/tmp/chist_k01_guard.err
guard_status=$?
set -e
if [[ $guard_status -eq 0 ]]; then
  echo 'K01 migration unexpectedly accepted a non-empty legacy embedding store' >&2
  exit 1
fi
grep -q 'requires an empty cm_embedding table' /tmp/chist_k01_guard.err || {
  echo 'K01 non-empty legacy guard failed for an unexpected reason' >&2
  cat /tmp/chist_k01_guard.err >&2
  exit 1
}

# Remove only the synthetic guard rows, then apply K01 to the empty legacy shape.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM comind.cm_embedding WHERE model='legacy-1536';
DELETE FROM comind.cm_doc WHERE source_ref='guard';
SQL
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261026_013_conversation_history_hybrid_rag.sql"

# Verify provider-neutral migration shape before any K01 fixture data is added.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE v_type text; v_default text; v_count bigint;
BEGIN
  SELECT format_type(a.atttypid,a.atttypmod),pg_get_expr(d.adbin,d.adrelid)
    INTO v_type,v_default
  FROM pg_attribute a
  JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname='comind' AND c.relname='cm_embedding' AND a.attname='vec';
  IF v_type <> 'vector' THEN RAISE EXCEPTION 'expected variable-dimension vector, got %',v_type; END IF;
  IF v_default IS NOT NULL THEN RAISE EXCEPTION 'embedding vector unexpectedly has default'; END IF;
  SELECT count(*) INTO v_count FROM pg_indexes
  WHERE schemaname='comind' AND tablename='cm_embedding' AND indexdef ILIKE '%ivfflat%';
  IF v_count<>0 THEN RAISE EXCEPTION 'legacy IVFFlat index still exists'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_doc_chunk' AND a.attname='fts_simple' AND a.attgenerated='s') THEN
    RAISE EXCEPTION 'generated FTS column missing';
  END IF;
END
$$;
SQL

# Dedicated synthetic certified import with three messages using three supported
# text shapes. It intentionally separates lexical and semantic relevance.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_source_id uuid := 'a2440001-0000-4000-8000-000000000001';
  v_import_id uuid := 'a2440001-0000-4000-8000-000000000002';
  v_baseline_id uuid := 'a2440001-0000-4000-8000-000000000003';
  v_source_sha char(64) := encode(extensions.digest('chist-k01-source','sha256'),'hex');
  v_receipt jsonb := '{"synthetic":"chist-k01","purpose":"hybrid-rag-acceptance"}'::jsonb;
  v_receipt_sha char(64);
BEGIN
  v_receipt_sha := encode(extensions.digest(v_receipt::text,'sha256'),'hex');
  INSERT INTO comind.cm_archive_source(source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes,source_uri,source_metadata)
  VALUES (v_source_id,'chatgpt','chist-k01-synthetic.zip',v_source_sha,1,'synthetic://chist-k01','{"fixture":true}'::jsonb);
  INSERT INTO comind.cm_archive_import(import_id,source_archive_id,parser_version,schema_version,status,started_at)
  VALUES (v_import_id,v_source_id,'chist-k01-fixture-v1','chatgpt-export-fixture-v1','PENDING','2026-10-26T13:00:00Z');

  INSERT INTO comind.cm_archive_conversation_observation(
    import_id,source_conversation_id,title,created_at,updated_at,raw_source_hash,normalized_hash,topology_hash,
    node_count,message_count,attachment_reference_count,raw_conversation
  ) VALUES
  (v_import_id,'rag-a','Fencing','2026-10-26T13:00:00Z','2026-10-26T13:00:00Z',
    encode(extensions.digest('rag-a-raw','sha256'),'hex'),encode(extensions.digest('rag-a-norm','sha256'),'hex'),encode(extensions.digest('rag-a-top','sha256'),'hex'),1,1,0,'{"id":"rag-a"}'::jsonb),
  (v_import_id,'rag-b','River','2026-10-26T13:01:00Z','2026-10-26T13:01:00Z',
    encode(extensions.digest('rag-b-raw','sha256'),'hex'),encode(extensions.digest('rag-b-norm','sha256'),'hex'),encode(extensions.digest('rag-b-top','sha256'),'hex'),1,1,0,'{"id":"rag-b"}'::jsonb),
  (v_import_id,'rag-c','Neighbors','2026-10-26T13:02:00Z','2026-10-26T13:02:00Z',
    encode(extensions.digest('rag-c-raw','sha256'),'hex'),encode(extensions.digest('rag-c-norm','sha256'),'hex'),encode(extensions.digest('rag-c-top','sha256'),'hex'),1,1,0,'{"id":"rag-c"}'::jsonb);

  INSERT INTO comind.cm_archive_node_observation(
    import_id,source_conversation_id,source_node_id,parent_source_node_id,child_source_node_ids,
    source_message_id,role,created_at,content_type,raw_node_hash,normalized_message_hash,raw_node
  ) VALUES
  (v_import_id,'rag-a','a1',NULL,'[]','ma','user','2026-10-26T13:00:00Z','text',
    encode(extensions.digest('a1-raw','sha256'),'hex'),encode(extensions.digest('ma-norm','sha256'),'hex'),
    '{"message":{"content":{"parts":["PostgreSQL fencing epoch",{"text":"lease reconciliation"}]}}}'::jsonb),
  (v_import_id,'rag-b','b1',NULL,'[]','mb','assistant','2026-10-26T13:01:00Z','text',
    encode(extensions.digest('b1-raw','sha256'),'hex'),encode(extensions.digest('mb-norm','sha256'),'hex'),
    '{"message":{"content":{"text":"A quiet river remembers the shape of distant mountains"}}}'::jsonb),
  (v_import_id,'rag-c','c1',NULL,'[]','mc','assistant','2026-10-26T13:02:00Z','text',
    encode(extensions.digest('c1-raw','sha256'),'hex'),encode(extensions.digest('mc-norm','sha256'),'hex'),
    '{"message":{"text":"Vector retrieval finds conceptual neighbors without shared keywords"}}'::jsonb);

  UPDATE comind.cm_archive_import SET status='PASS',completed_at='2026-10-26T13:03:00Z',
    source_conversation_count=3,source_message_count=3,source_node_count=3,source_attachment_count=0,
    imported_conversation_count=3,imported_message_count=3,imported_node_count=3,imported_attachment_count=0,
    reconciliation='{"synthetic":true}'::jsonb,receipt=v_receipt,receipt_sha256=v_receipt_sha
  WHERE import_id=v_import_id;

  INSERT INTO comind.cm_conversation_history_baseline(
    baseline_id,import_id,source_archive_id,source_archive_sha256,certification_version,source_kind,
    certified_by,certification_reason,evidence,certification_sha256,certified_at
  ) VALUES (
    v_baseline_id,v_import_id,v_source_id,v_source_sha,'chist-k01-cert-v1','native_openai_export','chist-k01-test',
    'Synthetic K01 certified retrieval fixture.','{"synthetic":true}'::jsonb,
    encode(extensions.digest(concat_ws('|',v_import_id::text,v_source_sha,'chist-k01-cert-v1'),'sha256'),'hex'),
    '2026-10-26T13:04:00Z'
  );
END
$$;

-- A PASS import without certification must remain ineligible.
DO $$
DECLARE v_source uuid := 'a2440002-0000-4000-8000-000000000001'; v_import uuid := 'a2440002-0000-4000-8000-000000000002';
  v_sha char(64):=encode(extensions.digest('uncertified-k01','sha256'),'hex');
  v_receipt jsonb:='{"synthetic":"uncertified-k01"}'::jsonb;
BEGIN
  INSERT INTO comind.cm_archive_source(source_archive_id,source_system,source_archive_name,source_archive_sha256,source_archive_bytes)
  VALUES(v_source,'chatgpt','uncertified-k01.zip',v_sha,1);
  INSERT INTO comind.cm_archive_import(import_id,source_archive_id,parser_version,schema_version,status,started_at)
  VALUES(v_import,v_source,'k01','k01','PENDING',now());
  UPDATE comind.cm_archive_import SET status='PASS',completed_at=now(),source_conversation_count=0,source_message_count=0,source_node_count=0,
    source_attachment_count=0,imported_conversation_count=0,imported_message_count=0,imported_node_count=0,imported_attachment_count=0,
    reconciliation='{}'::jsonb,receipt=v_receipt,receipt_sha256=encode(extensions.digest(v_receipt::text,'sha256'),'hex')
  WHERE import_id=v_import;
END
$$;
SQL

certified_import='a2440001-0000-4000-8000-000000000002'
uncertified_import='a2440002-0000-4000-8000-000000000002'

set +e
PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -v ON_ERROR_STOP=1 <<SQL >/tmp/k01_uncertified.out 2>/tmp/k01_uncertified.err
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_build_conversation_history_retrieval_corpus('${uncertified_import}'::uuid);
SQL
uncertified_status=$?
set -e
[[ $uncertified_status -ne 0 ]] || { echo 'uncertified PASS import unexpectedly built retrieval corpus' >&2; exit 1; }
grep -q 'requires a certified Conversation History baseline' /tmp/k01_uncertified.err || {
  echo 'uncertified corpus rejection failed for unexpected reason' >&2; cat /tmp/k01_uncertified.err >&2; exit 1;
}

corpus_id="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_build_conversation_history_retrieval_corpus('${certified_import}'::uuid);
SQL
)"
[[ -n "$corpus_id" ]] || { echo 'K01 corpus builder returned no corpus id' >&2; exit 1; }

corpus_again="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_build_conversation_history_retrieval_corpus('${certified_import}'::uuid);
SQL
)"
[[ "$corpus_again" == "$corpus_id" ]] || { echo 'K01 corpus build was not idempotent' >&2; exit 1; }

# Register one synthetic 3D embedding profile as the database owner. Profile
# selection is governed configuration, not delegated to the history reader.
profile_id="$(psql "$DATABASE_URL" -X -At -v ON_ERROR_STOP=1 <<'SQL' | tail -n1
INSERT INTO comind.cm_embedding_profile(
  profile_key,profile_version,provider,model,model_revision,dims,distance_metric,purpose,definition,definition_sha256
) VALUES (
  'synthetic-3d','v1','synthetic','unit-test-3d','fixture',3,'cosine','retrieval',
  'Synthetic three-dimensional vectors used only for deterministic K01 acceptance.',
  encode(extensions.digest('synthetic-3d|v1|3|cosine','sha256'),'hex')
) RETURNING embedding_profile_id;
SQL
)"
[[ -n "$profile_id" ]] || { echo 'K01 embedding profile creation failed' >&2; exit 1; }

# Resolve chunks by source node and record deterministic synthetic embeddings.
chunk_a="$(psql "$DATABASE_URL" -X -At -c "SELECT chunk_id FROM comind.cm_retrieval_chunk WHERE corpus_id='${corpus_id}'::uuid AND source_node_id='a1'" | tail -n1)"
chunk_b="$(psql "$DATABASE_URL" -X -At -c "SELECT chunk_id FROM comind.cm_retrieval_chunk WHERE corpus_id='${corpus_id}'::uuid AND source_node_id='b1'" | tail -n1)"
chunk_c="$(psql "$DATABASE_URL" -X -At -c "SELECT chunk_id FROM comind.cm_retrieval_chunk WHERE corpus_id='${corpus_id}'::uuid AND source_node_id='c1'" | tail -n1)"

for item in "${chunk_a}|[1,0,0]" "${chunk_b}|[0,1,0]" "${chunk_c}|[0,0.9,0.1]"; do
  chunk="${item%%|*}"; vec="${item#*|}"
  PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL >/dev/null
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_record_retrieval_embedding('${corpus_id}'::uuid,'${chunk}'::uuid,'${profile_id}'::uuid,'${vec}'::extensions.vector);
SQL
done

# Idempotent embedding insert must return the existing id; different vector for
# the same profile/chunk must fail closed.
emb_first="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_record_retrieval_embedding('${corpus_id}'::uuid,'${chunk_a}'::uuid,'${profile_id}'::uuid,'[1,0,0]'::extensions.vector);
SQL
)"
emb_again="$(PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -At -v ON_ERROR_STOP=1 <<SQL | tail -n1
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_record_retrieval_embedding('${corpus_id}'::uuid,'${chunk_a}'::uuid,'${profile_id}'::uuid,'[1,0,0]'::extensions.vector);
SQL
)"
[[ "$emb_first" == "$emb_again" ]] || { echo 'embedding recording was not idempotent' >&2; exit 1; }

set +e
PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -v ON_ERROR_STOP=1 <<SQL >/tmp/k01_embedding_conflict.out 2>/tmp/k01_embedding_conflict.err
SET ROLE comind_conversation_history_deriver;
SELECT comind.cm_record_retrieval_embedding('${corpus_id}'::uuid,'${chunk_a}'::uuid,'${profile_id}'::uuid,'[0,0,1]'::extensions.vector);
SQL
embedding_conflict_status=$?
set -e
[[ $embedding_conflict_status -ne 0 ]] || { echo 'conflicting embedding unexpectedly overwrote evidence' >&2; exit 1; }

# Core exact assertions for extraction, lineage, lexical and semantic ranking.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE v_count bigint; v_text text;
BEGIN
  IF (SELECT document_count FROM comind.cm_retrieval_corpus WHERE corpus_id='${corpus_id}'::uuid)<>3 THEN RAISE EXCEPTION 'expected 3 retrieval documents'; END IF;
  IF (SELECT chunk_count FROM comind.cm_retrieval_corpus WHERE corpus_id='${corpus_id}'::uuid)<>3 THEN RAISE EXCEPTION 'expected 3 retrieval chunks'; END IF;
  SELECT count(*) INTO v_count FROM comind.cm_doc WHERE metadata->>'retrieval_corpus_id'='${corpus_id}';
  IF v_count<>3 THEN RAISE EXCEPTION 'generic document reuse count mismatch'; END IF;
  SELECT count(*) INTO v_count FROM comind.cm_doc_chunk WHERE metadata->>'retrieval_corpus_id'='${corpus_id}';
  IF v_count<>3 THEN RAISE EXCEPTION 'generic chunk reuse count mismatch'; END IF;
  SELECT d.content INTO v_text FROM comind.cm_retrieval_chunk r JOIN comind.cm_doc_chunk d USING(chunk_id)
    WHERE r.corpus_id='${corpus_id}'::uuid AND r.source_node_id='a1';
  IF v_text<>E'PostgreSQL fencing epoch\nlease reconciliation' THEN RAISE EXCEPTION 'parts/object text extraction mismatch: %',v_text; END IF;
  SELECT d.content INTO v_text FROM comind.cm_retrieval_chunk r JOIN comind.cm_doc_chunk d USING(chunk_id)
    WHERE r.corpus_id='${corpus_id}'::uuid AND r.source_node_id='b1';
  IF v_text<>'A quiet river remembers the shape of distant mountains' THEN RAISE EXCEPTION 'content.text extraction mismatch'; END IF;
  SELECT d.content INTO v_text FROM comind.cm_retrieval_chunk r JOIN comind.cm_doc_chunk d USING(chunk_id)
    WHERE r.corpus_id='${corpus_id}'::uuid AND r.source_node_id='c1';
  IF v_text<>'Vector retrieval finds conceptual neighbors without shared keywords' THEN RAISE EXCEPTION 'message.text extraction mismatch'; END IF;
  IF (SELECT source_node_id FROM comind.cm_search_conversation_history_lexical('${corpus_id}'::uuid,'fencing epoch',10) ORDER BY lexical_rank LIMIT 1)<>'a1' THEN
    RAISE EXCEPTION 'lexical ranking did not preserve exact technical identifier relevance';
  END IF;
  IF (SELECT source_node_id FROM comind.cm_search_conversation_history_semantic('${corpus_id}'::uuid,'${profile_id}'::uuid,'[0,1,0]'::extensions.vector,10) ORDER BY semantic_rank LIMIT 1)<>'b1' THEN
    RAISE EXCEPTION 'semantic ranking mismatch';
  END IF;
END
\$\$;
SQL

# Hybrid result must expose both independent signals and deterministic RRF order.
hybrid="$(PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -At -F '|' -v ON_ERROR_STOP=1 <<SQL
SET ROLE comind_conversation_history_reader;
SELECT source_node_id,coalesce(lexical_rank::text,''),coalesce(semantic_rank::text,''),round(fused_score,10)::text
FROM comind.cm_search_conversation_history_hybrid(
  '${corpus_id}'::uuid,'${profile_id}'::uuid,'fencing epoch','[0,1,0]'::extensions.vector,3,2,'hybrid_rrf','rrf-v1'
);
SQL
)"
[[ "$(printf '%s\n' "$hybrid" | head -n1 | cut -d'|' -f1)" == 'a1' ]] || {
  echo "unexpected hybrid top result: $hybrid" >&2; exit 1;
}
printf '%s\n' "$hybrid" | grep -q '^a1|1|' || { echo "hybrid output lacks lexical rank for a1: $hybrid" >&2; exit 1; }
printf '%s\n' "$hybrid" | grep -q '^b1||1|' || { echo "hybrid output lacks semantic-only rank for b1: $hybrid" >&2; exit 1; }

# Dimension mismatch must fail before vector comparison.
set +e
PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -v ON_ERROR_STOP=1 <<SQL >/tmp/k01_dim.out 2>/tmp/k01_dim.err
SET ROLE comind_conversation_history_reader;
SELECT * FROM comind.cm_search_conversation_history_semantic('${corpus_id}'::uuid,'${profile_id}'::uuid,'[1,0]'::extensions.vector,5);
SQL
dim_status=$?
set -e
[[ $dim_status -ne 0 ]] || { echo 'semantic dimension mismatch unexpectedly succeeded' >&2; exit 1; }
grep -q 'dimension mismatch' /tmp/k01_dim.err || { echo 'dimension mismatch failed for unexpected reason' >&2; cat /tmp/k01_dim.err >&2; exit 1; }

# Direct mutation stays denied even though governed search functions work.
set +e
PGPASSWORD=history-test-password psql -h localhost -U chist_history_login -d comind_ci -X -v ON_ERROR_STOP=1 <<SQL >/tmp/k01_reader_write.out 2>/tmp/k01_reader_write.err
SET ROLE comind_conversation_history_reader;
INSERT INTO comind.cm_retrieval_corpus(
 baseline_id,import_id,source_archive_sha256,certification_sha256,policy_key,policy_version,policy_definition_sha256,
 document_count,chunk_count,result_state,corpus_identity_sha256
) SELECT baseline_id,import_id,source_archive_sha256,certification_sha256,policy_key,policy_version,policy_definition_sha256,
 0,0,'no_text_chunks',repeat('f',64) FROM comind.cm_retrieval_corpus LIMIT 1;
SQL
reader_write_status=$?
set -e
[[ $reader_write_status -ne 0 ]] || { echo 'history reader unexpectedly mutated retrieval corpus' >&2; exit 1; }

set +e
PGPASSWORD=archive-deriver-test-password psql -h localhost -U chist_archive_deriver_login -d comind_ci -X -v ON_ERROR_STOP=1 <<SQL >/tmp/k01_deriver_write.out 2>/tmp/k01_deriver_write.err
SET ROLE comind_conversation_history_deriver;
UPDATE comind.cm_retrieval_chunk SET source_role='tool' WHERE corpus_id='${corpus_id}'::uuid;
SQL
deriver_write_status=$?
set -e
[[ $deriver_write_status -ne 0 ]] || { echo 'history deriver unexpectedly mutated retrieval chunks directly' >&2; exit 1; }

# Data API roles must have neither table access nor search execution when present.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      IF has_table_privilege(v_role,'comind.cm_retrieval_chunk','SELECT') THEN
        RAISE EXCEPTION '% unexpectedly has retrieval chunk SELECT',v_role;
      END IF;
      IF has_function_privilege(v_role,'comind.cm_search_conversation_history_lexical(uuid,text,integer)','EXECUTE') THEN
        RAISE EXCEPTION '% unexpectedly has lexical retrieval execution',v_role;
      END IF;
    END IF;
  END LOOP;
END
$$;
SQL

# Reader can search but has no raw generic vector/document privileges.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT has_function_privilege('comind_conversation_history_reader','comind.cm_search_conversation_history_hybrid(uuid,uuid,text,extensions.vector,integer,integer,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'history reader lacks hybrid retrieval execute';
  END IF;
  IF has_table_privilege('comind_conversation_history_reader','comind.cm_embedding','SELECT') THEN
    RAISE EXCEPTION 'history reader unexpectedly has raw embedding SELECT';
  END IF;
  IF has_table_privilege('comind_conversation_history_reader','comind.cm_doc_chunk','SELECT') THEN
    RAISE EXCEPTION 'history reader unexpectedly has raw generic chunk SELECT';
  END IF;
END
$$;
SQL

echo 'CHIST-K01 governed hybrid retrieval acceptance: PASS'
