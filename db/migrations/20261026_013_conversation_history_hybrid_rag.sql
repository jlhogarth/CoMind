-- CHIST-K01: governed hybrid Conversation History retrieval foundation.
-- Reuses CoMind's existing cm_doc, cm_doc_chunk and cm_embedding substrate.
-- Raw Conversation History remains authoritative source evidence.
BEGIN;

-- K01 intentionally migrates the empty legacy embedding store from a fixed
-- 1536-dimension IVFFlat shape to provider-neutral variable-dimension storage.
-- Fail closed if any environment already contains embeddings so no vector is
-- silently coerced or invalidated.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM comind.cm_embedding LIMIT 1) THEN
    RAISE EXCEPTION 'CHIST-K01 requires an empty cm_embedding table before provider-neutral vector migration';
  END IF;
END
$$;

DROP INDEX IF EXISTS comind.idx_embedding_vec;
ALTER TABLE comind.cm_embedding
  ALTER COLUMN vec TYPE extensions.vector USING vec::extensions.vector,
  ALTER COLUMN dims DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='comind.cm_embedding'::regclass
      AND conname='cm_embedding_dims_positive'
  ) THEN
    ALTER TABLE comind.cm_embedding
      ADD CONSTRAINT cm_embedding_dims_positive CHECK (dims > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='comind.cm_embedding'::regclass
      AND conname='cm_embedding_dims_match_vector'
  ) THEN
    ALTER TABLE comind.cm_embedding
      ADD CONSTRAINT cm_embedding_dims_match_vector CHECK (dims=extensions.vector_dims(vec));
  END IF;
END
$$;

ALTER TABLE comind.cm_doc_chunk
  ADD COLUMN IF NOT EXISTS fts_simple tsvector
  GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, content)) STORED;

CREATE INDEX IF NOT EXISTS idx_cm_doc_chunk_fts_simple
  ON comind.cm_doc_chunk USING gin (fts_simple);

CREATE TABLE IF NOT EXISTS comind.cm_retrieval_policy (
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  extraction_kind text NOT NULL CHECK (extraction_kind IN ('message_text')),
  fts_config regconfig NOT NULL DEFAULT 'simple'::regconfig,
  definition text NOT NULL CHECK (length(btrim(definition)) > 0),
  definition_sha256 char(64) NOT NULL UNIQUE CHECK (definition_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_key,policy_version)
);

WITH p(policy_key,policy_version,extraction_kind,fts_config,definition) AS (
  VALUES (
    'conversation_history_chunk','message-text-v1','message_text','simple'::regconfig,
    'One retrieval chunk per archived message node with deterministic text extraction matching the Conversation History reader contract. Empty extracted text is excluded. Source archive evidence is never modified.'
  )
)
INSERT INTO comind.cm_retrieval_policy(
  policy_key,policy_version,extraction_kind,fts_config,definition,definition_sha256
)
SELECT policy_key,policy_version,extraction_kind,fts_config,definition,
  encode(extensions.digest(concat_ws('|',policy_key,policy_version,extraction_kind,fts_config::text,definition),'sha256'),'hex')
FROM p
ON CONFLICT (policy_key,policy_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS comind.cm_retrieval_rank_policy (
  rank_policy_key text NOT NULL,
  rank_policy_version text NOT NULL,
  rrf_k integer NOT NULL CHECK (rrf_k >= 1),
  lexical_weight numeric(12,6) NOT NULL CHECK (lexical_weight >= 0),
  semantic_weight numeric(12,6) NOT NULL CHECK (semantic_weight >= 0),
  definition text NOT NULL CHECK (length(btrim(definition)) > 0),
  definition_sha256 char(64) NOT NULL UNIQUE CHECK (definition_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rank_policy_key,rank_policy_version),
  CHECK (lexical_weight > 0 OR semantic_weight > 0)
);

WITH p(rank_policy_key,rank_policy_version,rrf_k,lexical_weight,semantic_weight,definition) AS (
  VALUES (
    'hybrid_rrf','rrf-v1',50,1.0::numeric,1.0::numeric,
    'Reciprocal Rank Fusion over lexical and exact cosine semantic ranks. Fused score is lexical_weight/(rrf_k+lexical_rank) plus semantic_weight/(rrf_k+semantic_rank), omitting absent components.'
  )
)
INSERT INTO comind.cm_retrieval_rank_policy(
  rank_policy_key,rank_policy_version,rrf_k,lexical_weight,semantic_weight,definition,definition_sha256
)
SELECT rank_policy_key,rank_policy_version,rrf_k,lexical_weight,semantic_weight,definition,
  encode(extensions.digest(concat_ws('|',rank_policy_key,rank_policy_version,rrf_k::text,lexical_weight::text,semantic_weight::text,definition),'sha256'),'hex')
FROM p
ON CONFLICT (rank_policy_key,rank_policy_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS comind.cm_embedding_profile (
  embedding_profile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL,
  profile_version text NOT NULL,
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model text NOT NULL CHECK (length(btrim(model)) > 0),
  model_revision text,
  dims integer NOT NULL CHECK (dims > 0),
  distance_metric text NOT NULL DEFAULT 'cosine' CHECK (distance_metric='cosine'),
  purpose text NOT NULL DEFAULT 'retrieval' CHECK (purpose='retrieval'),
  definition text NOT NULL CHECK (length(btrim(definition)) > 0),
  definition_sha256 char(64) NOT NULL UNIQUE CHECK (definition_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_key,profile_version)
);

CREATE TABLE IF NOT EXISTS comind.cm_retrieval_corpus (
  corpus_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_id uuid NOT NULL REFERENCES comind.cm_conversation_history_baseline(baseline_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  source_archive_sha256 char(64) NOT NULL CHECK (source_archive_sha256 ~ '^[a-f0-9]{64}$'),
  certification_sha256 char(64) NOT NULL CHECK (certification_sha256 ~ '^[a-f0-9]{64}$'),
  policy_key text NOT NULL,
  policy_version text NOT NULL,
  policy_definition_sha256 char(64) NOT NULL CHECK (policy_definition_sha256 ~ '^[a-f0-9]{64}$'),
  document_count bigint NOT NULL CHECK (document_count >= 0),
  chunk_count bigint NOT NULL CHECK (chunk_count >= 0),
  result_state text NOT NULL CHECK (result_state IN ('completed','no_text_chunks')),
  corpus_identity_sha256 char(64) NOT NULL UNIQUE CHECK (corpus_identity_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_retrieval_corpus_policy_fk
    FOREIGN KEY (policy_key,policy_version)
    REFERENCES comind.cm_retrieval_policy(policy_key,policy_version)
    ON DELETE RESTRICT,
  CONSTRAINT cm_retrieval_corpus_scope_unique UNIQUE (corpus_id,import_id),
  CONSTRAINT cm_retrieval_corpus_baseline_policy_unique UNIQUE (baseline_id,policy_key,policy_version),
  CONSTRAINT cm_retrieval_corpus_state CHECK (
    (chunk_count=0 AND document_count=0 AND result_state='no_text_chunks')
    OR (chunk_count>0 AND document_count>0 AND result_state='completed')
  )
);

CREATE TABLE IF NOT EXISTS comind.cm_retrieval_document (
  corpus_id uuid NOT NULL,
  import_id uuid NOT NULL,
  doc_id uuid NOT NULL REFERENCES comind.cm_doc(doc_id) ON DELETE RESTRICT,
  source_conversation_id text NOT NULL,
  raw_source_hash char(64) NOT NULL CHECK (raw_source_hash ~ '^[a-f0-9]{64}$'),
  normalized_hash char(64) NOT NULL CHECK (normalized_hash ~ '^[a-f0-9]{64}$'),
  topology_hash char(64) NOT NULL CHECK (topology_hash ~ '^[a-f0-9]{64}$'),
  document_identity_sha256 char(64) NOT NULL CHECK (document_identity_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corpus_id,doc_id),
  CONSTRAINT cm_retrieval_document_corpus_fk
    FOREIGN KEY (corpus_id,import_id)
    REFERENCES comind.cm_retrieval_corpus(corpus_id,import_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_retrieval_document_source_fk
    FOREIGN KEY (import_id,source_conversation_id)
    REFERENCES comind.cm_archive_conversation_observation(import_id,source_conversation_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_retrieval_document_conversation_unique UNIQUE (corpus_id,source_conversation_id),
  CONSTRAINT cm_retrieval_document_identity_unique UNIQUE (corpus_id,document_identity_sha256),
  CONSTRAINT cm_retrieval_document_scope_unique UNIQUE (corpus_id,doc_id,import_id,source_conversation_id)
);

CREATE TABLE IF NOT EXISTS comind.cm_retrieval_chunk (
  corpus_id uuid NOT NULL,
  import_id uuid NOT NULL,
  doc_id uuid NOT NULL,
  chunk_id uuid NOT NULL REFERENCES comind.cm_doc_chunk(chunk_id) ON DELETE RESTRICT,
  source_conversation_id text NOT NULL,
  source_node_id text NOT NULL,
  source_message_id text NOT NULL,
  source_role text,
  source_message_hash char(64) CHECK (source_message_hash IS NULL OR source_message_hash ~ '^[a-f0-9]{64}$'),
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  chunk_identity_sha256 char(64) NOT NULL CHECK (chunk_identity_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (corpus_id,chunk_id),
  CONSTRAINT cm_retrieval_chunk_document_fk
    FOREIGN KEY (corpus_id,doc_id,import_id,source_conversation_id)
    REFERENCES comind.cm_retrieval_document(corpus_id,doc_id,import_id,source_conversation_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_retrieval_chunk_source_fk
    FOREIGN KEY (import_id,source_conversation_id,source_node_id)
    REFERENCES comind.cm_archive_node_observation(import_id,source_conversation_id,source_node_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_retrieval_chunk_source_unique UNIQUE (corpus_id,source_conversation_id,source_node_id),
  CONSTRAINT cm_retrieval_chunk_identity_unique UNIQUE (corpus_id,chunk_identity_sha256),
  CONSTRAINT cm_retrieval_chunk_scope_unique UNIQUE (corpus_id,chunk_id,doc_id)
);

CREATE TABLE IF NOT EXISTS comind.cm_retrieval_embedding (
  emb_id uuid PRIMARY KEY REFERENCES comind.cm_embedding(emb_id) ON DELETE RESTRICT,
  corpus_id uuid NOT NULL,
  chunk_id uuid NOT NULL,
  doc_id uuid NOT NULL,
  embedding_profile_id uuid NOT NULL REFERENCES comind.cm_embedding_profile(embedding_profile_id) ON DELETE RESTRICT,
  embedding_sha256 char(64) NOT NULL CHECK (embedding_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_retrieval_embedding_chunk_fk
    FOREIGN KEY (corpus_id,chunk_id,doc_id)
    REFERENCES comind.cm_retrieval_chunk(corpus_id,chunk_id,doc_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_retrieval_embedding_profile_chunk_unique UNIQUE (embedding_profile_id,corpus_id,chunk_id),
  CONSTRAINT cm_retrieval_embedding_hash_unique UNIQUE (embedding_profile_id,embedding_sha256,chunk_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_retrieval_corpus_import
  ON comind.cm_retrieval_corpus(import_id);
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_corpus_policy
  ON comind.cm_retrieval_corpus(policy_key,policy_version);
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_document_source_fk
  ON comind.cm_retrieval_document(import_id,source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_chunk_document_fk
  ON comind.cm_retrieval_chunk(corpus_id,doc_id,import_id,source_conversation_id);
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_chunk_source_fk
  ON comind.cm_retrieval_chunk(import_id,source_conversation_id,source_node_id);
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_embedding_chunk_fk
  ON comind.cm_retrieval_embedding(corpus_id,chunk_id,doc_id);
CREATE INDEX IF NOT EXISTS idx_cm_retrieval_embedding_profile
  ON comind.cm_retrieval_embedding(embedding_profile_id,corpus_id,chunk_id);

CREATE OR REPLACE FUNCTION comind.cm_reject_retrieval_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  RAISE EXCEPTION 'Conversation History retrieval evidence is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_archive_node_text(p_raw_node jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path=pg_catalog
AS $$
DECLARE
  v_message jsonb;
  v_content jsonb;
  v_parts jsonb;
  v_text text;
BEGIN
  IF p_raw_node IS NULL OR jsonb_typeof(p_raw_node)<>'object' THEN RETURN ''; END IF;
  v_message := p_raw_node->'message';
  IF v_message IS NULL OR jsonb_typeof(v_message)<>'object' THEN RETURN ''; END IF;
  v_content := v_message->'content';

  IF v_content IS NOT NULL AND jsonb_typeof(v_content)='string' THEN
    RETURN v_content #>> '{}';
  END IF;

  IF v_content IS NOT NULL AND jsonb_typeof(v_content)='object' THEN
    v_parts := v_content->'parts';
    IF v_parts IS NOT NULL AND jsonb_typeof(v_parts)='array' THEN
      SELECT string_agg(piece,E'\n' ORDER BY ord)
        INTO v_text
      FROM (
        SELECT ord,
          CASE
            WHEN jsonb_typeof(part)='string' THEN part #>> '{}'
            WHEN jsonb_typeof(part)='object' AND jsonb_typeof(part->'text')='string' THEN part->>'text'
            ELSE NULL
          END AS piece
        FROM jsonb_array_elements(v_parts) WITH ORDINALITY AS x(part,ord)
      ) s
      WHERE piece IS NOT NULL;
      IF coalesce(v_text,'')<>'' THEN RETURN v_text; END IF;
    END IF;
    IF jsonb_typeof(v_content->'text')='string' THEN RETURN v_content->>'text'; END IF;
  END IF;

  IF jsonb_typeof(v_message->'text')='string' THEN RETURN v_message->>'text'; END IF;
  RETURN '';
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_guard_retrieval_corpus_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_import_id uuid;
  v_archive_sha char(64);
  v_cert_sha char(64);
  v_policy_sha char(64);
  v_docs bigint;
  v_chunks bigint;
  v_identity char(64);
BEGIN
  SELECT b.import_id,b.source_archive_sha256,b.certification_sha256,p.definition_sha256
    INTO v_import_id,v_archive_sha,v_cert_sha,v_policy_sha
  FROM comind.cm_conversation_history_baseline b
  JOIN comind.cm_retrieval_policy p
    ON p.policy_key=NEW.policy_key AND p.policy_version=NEW.policy_version
  WHERE b.baseline_id=NEW.baseline_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retrieval corpus requires certified Conversation History baseline and known policy'; END IF;

  SELECT count(DISTINCT n.source_conversation_id),count(*)
    INTO v_docs,v_chunks
  FROM comind.cm_archive_node_observation n
  WHERE n.import_id=v_import_id
    AND n.source_message_id IS NOT NULL
    AND length(btrim(comind.cm_archive_node_text(n.raw_node)))>0;

  v_identity := encode(extensions.digest(concat_ws('|',v_archive_sha,v_cert_sha,v_policy_sha),'sha256'),'hex');

  IF NEW.import_id<>v_import_id OR NEW.source_archive_sha256<>v_archive_sha
     OR NEW.certification_sha256<>v_cert_sha OR NEW.policy_definition_sha256<>v_policy_sha
     OR NEW.document_count<>v_docs OR NEW.chunk_count<>v_chunks
     OR NEW.corpus_identity_sha256<>v_identity THEN
    RAISE EXCEPTION 'Retrieval corpus identity/counts do not match certified source evidence';
  END IF;
  IF (v_chunks=0 AND NEW.result_state<>'no_text_chunks') OR (v_chunks>0 AND NEW.result_state<>'completed') THEN
    RAISE EXCEPTION 'Retrieval corpus result state does not match source text coverage';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_retrieval_corpus_guard ON comind.cm_retrieval_corpus;
CREATE TRIGGER trg_cm_retrieval_corpus_guard
BEFORE INSERT ON comind.cm_retrieval_corpus
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_retrieval_corpus_insert();

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_retrieval_policy','cm_retrieval_rank_policy','cm_embedding_profile','cm_retrieval_corpus',
    'cm_retrieval_document','cm_retrieval_chunk','cm_retrieval_embedding'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_immutable ON comind.%I',v_table,v_table);
    EXECUTE format('CREATE TRIGGER trg_%I_immutable BEFORE UPDATE OR DELETE ON comind.%I FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_retrieval_evidence_mutation()',v_table,v_table);
  END LOOP;
END
$$;

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
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_cm_doc_retrieval_immutable ON comind.cm_doc;
CREATE TRIGGER trg_cm_doc_retrieval_immutable
BEFORE UPDATE OR DELETE ON comind.cm_doc
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_linked_retrieval_doc_mutation();

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
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_cm_doc_chunk_retrieval_immutable ON comind.cm_doc_chunk;
CREATE TRIGGER trg_cm_doc_chunk_retrieval_immutable
BEFORE UPDATE OR DELETE ON comind.cm_doc_chunk
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_linked_retrieval_chunk_mutation();

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
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_cm_embedding_retrieval_immutable ON comind.cm_embedding;
CREATE TRIGGER trg_cm_embedding_retrieval_immutable
BEFORE UPDATE OR DELETE ON comind.cm_embedding
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_linked_retrieval_embedding_mutation();

CREATE OR REPLACE FUNCTION comind.cm_build_conversation_history_retrieval_corpus(
  p_import_id uuid,
  p_policy_key text DEFAULT 'conversation_history_chunk',
  p_policy_version text DEFAULT 'message-text-v1'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_baseline_id uuid;
  v_archive_sha char(64);
  v_cert_sha char(64);
  v_policy_sha char(64);
  v_docs bigint;
  v_chunks bigint;
  v_state text;
  v_identity char(64);
  v_corpus_id uuid;
  v_doc_id uuid;
  v_chunk_id uuid;
  v_idx integer;
  v_content text;
  v_content_sha char(64);
  v_doc_identity char(64);
  v_chunk_identity char(64);
  r_conv record;
  r_node record;
BEGIN
  SELECT b.baseline_id,b.source_archive_sha256,b.certification_sha256,p.definition_sha256
    INTO v_baseline_id,v_archive_sha,v_cert_sha,v_policy_sha
  FROM comind.cm_conversation_history_baseline b
  JOIN comind.cm_retrieval_policy p
    ON p.policy_key=p_policy_key AND p.policy_version=p_policy_version
  WHERE b.import_id=p_import_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retrieval corpus requires a certified Conversation History baseline and known policy'; END IF;

  SELECT count(DISTINCT n.source_conversation_id),count(*)
    INTO v_docs,v_chunks
  FROM comind.cm_archive_node_observation n
  WHERE n.import_id=p_import_id AND n.source_message_id IS NOT NULL
    AND length(btrim(comind.cm_archive_node_text(n.raw_node)))>0;
  v_state := CASE WHEN v_chunks=0 THEN 'no_text_chunks' ELSE 'completed' END;
  v_identity := encode(extensions.digest(concat_ws('|',v_archive_sha,v_cert_sha,v_policy_sha),'sha256'),'hex');

  SELECT corpus_id INTO v_corpus_id FROM comind.cm_retrieval_corpus WHERE corpus_identity_sha256=v_identity;
  IF FOUND THEN RETURN v_corpus_id; END IF;

  INSERT INTO comind.cm_retrieval_corpus(
    baseline_id,import_id,source_archive_sha256,certification_sha256,
    policy_key,policy_version,policy_definition_sha256,document_count,chunk_count,result_state,corpus_identity_sha256
  ) VALUES (
    v_baseline_id,p_import_id,v_archive_sha,v_cert_sha,
    p_policy_key,p_policy_version,v_policy_sha,v_docs,v_chunks,v_state,v_identity
  ) ON CONFLICT (corpus_identity_sha256) DO NOTHING RETURNING corpus_id INTO v_corpus_id;
  IF v_corpus_id IS NULL THEN
    SELECT corpus_id INTO v_corpus_id FROM comind.cm_retrieval_corpus WHERE corpus_identity_sha256=v_identity;
    RETURN v_corpus_id;
  END IF;
  IF v_chunks=0 THEN RETURN v_corpus_id; END IF;

  FOR r_conv IN
    SELECT c.import_id,c.source_conversation_id,c.title,c.raw_source_hash,c.normalized_hash,c.topology_hash
    FROM comind.cm_archive_conversation_observation c
    WHERE c.import_id=p_import_id AND EXISTS (
      SELECT 1 FROM comind.cm_archive_node_observation n
      WHERE n.import_id=c.import_id AND n.source_conversation_id=c.source_conversation_id
        AND n.source_message_id IS NOT NULL
        AND length(btrim(comind.cm_archive_node_text(n.raw_node)))>0
    )
    ORDER BY c.source_conversation_id
  LOOP
    v_doc_id := gen_random_uuid();
    v_doc_identity := encode(extensions.digest(concat_ws('|',v_identity,r_conv.source_conversation_id,
      r_conv.raw_source_hash,r_conv.normalized_hash,r_conv.topology_hash),'sha256'),'hex');
    INSERT INTO comind.cm_doc(doc_id,title,source,source_ref,metadata)
    VALUES (v_doc_id,r_conv.title,'chatgpt_export',concat(p_import_id::text,':',r_conv.source_conversation_id),
      jsonb_build_object('retrieval_corpus_id',v_corpus_id,'source_conversation_id',r_conv.source_conversation_id));
    INSERT INTO comind.cm_retrieval_document(
      corpus_id,import_id,doc_id,source_conversation_id,raw_source_hash,normalized_hash,topology_hash,document_identity_sha256
    ) VALUES (
      v_corpus_id,p_import_id,v_doc_id,r_conv.source_conversation_id,r_conv.raw_source_hash,
      r_conv.normalized_hash,r_conv.topology_hash,v_doc_identity
    );

    v_idx := 0;
    FOR r_node IN
      SELECT n.source_node_id,n.source_message_id,n.role,n.normalized_message_hash,n.created_at,n.raw_node
      FROM comind.cm_archive_node_observation n
      WHERE n.import_id=p_import_id AND n.source_conversation_id=r_conv.source_conversation_id
        AND n.source_message_id IS NOT NULL
        AND length(btrim(comind.cm_archive_node_text(n.raw_node)))>0
      ORDER BY n.created_at NULLS LAST,n.source_node_id,n.source_message_id
    LOOP
      v_content := comind.cm_archive_node_text(r_node.raw_node);
      v_content_sha := encode(extensions.digest(v_content,'sha256'),'hex');
      v_chunk_identity := encode(extensions.digest(concat_ws('|',v_doc_identity,r_node.source_node_id,
        r_node.source_message_id,coalesce(r_node.normalized_message_hash::text,''),v_content_sha),'sha256'),'hex');
      v_chunk_id := gen_random_uuid();
      INSERT INTO comind.cm_doc_chunk(chunk_id,doc_id,idx,content,metadata)
      VALUES (v_chunk_id,v_doc_id,v_idx,v_content,
        jsonb_build_object('retrieval_corpus_id',v_corpus_id,'source_node_id',r_node.source_node_id,
          'source_message_id',r_node.source_message_id,'source_role',r_node.role));
      INSERT INTO comind.cm_retrieval_chunk(
        corpus_id,import_id,doc_id,chunk_id,source_conversation_id,source_node_id,source_message_id,
        source_role,source_message_hash,content_sha256,chunk_identity_sha256
      ) VALUES (
        v_corpus_id,p_import_id,v_doc_id,v_chunk_id,r_conv.source_conversation_id,r_node.source_node_id,
        r_node.source_message_id,r_node.role,r_node.normalized_message_hash,v_content_sha,v_chunk_identity
      );
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;
  RETURN v_corpus_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_record_retrieval_embedding(
  p_corpus_id uuid,
  p_chunk_id uuid,
  p_embedding_profile_id uuid,
  p_vec extensions.vector
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_dims integer;
  v_model text;
  v_doc_id uuid;
  v_existing uuid;
  v_existing_hash char(64);
  v_hash char(64);
  v_emb_id uuid;
BEGIN
  IF p_vec IS NULL THEN RAISE EXCEPTION 'Embedding vector is required'; END IF;
  SELECT dims,model INTO v_dims,v_model
  FROM comind.cm_embedding_profile WHERE embedding_profile_id=p_embedding_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Embedding profile does not exist'; END IF;
  IF extensions.vector_dims(p_vec)<>v_dims THEN
    RAISE EXCEPTION 'Embedding dimension mismatch: profile %, vector %',v_dims,extensions.vector_dims(p_vec);
  END IF;
  SELECT doc_id INTO v_doc_id FROM comind.cm_retrieval_chunk
  WHERE corpus_id=p_corpus_id AND chunk_id=p_chunk_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retrieval chunk does not belong to corpus'; END IF;
  v_hash := encode(extensions.digest(p_vec::text,'sha256'),'hex');

  SELECT e.emb_id,r.embedding_sha256 INTO v_existing,v_existing_hash
  FROM comind.cm_retrieval_embedding r JOIN comind.cm_embedding e USING (emb_id)
  WHERE r.embedding_profile_id=p_embedding_profile_id AND r.corpus_id=p_corpus_id AND r.chunk_id=p_chunk_id;
  IF FOUND THEN
    IF v_existing_hash<>v_hash THEN
      RAISE EXCEPTION 'Embedding already exists for this profile/chunk with different vector evidence';
    END IF;
    RETURN v_existing;
  END IF;

  v_emb_id := gen_random_uuid();
  INSERT INTO comind.cm_embedding(emb_id,doc_id,chunk_id,model,dims,vec)
  VALUES (v_emb_id,v_doc_id,p_chunk_id,v_model,v_dims,p_vec);
  INSERT INTO comind.cm_retrieval_embedding(
    emb_id,corpus_id,chunk_id,doc_id,embedding_profile_id,embedding_sha256
  ) VALUES (v_emb_id,p_corpus_id,p_chunk_id,v_doc_id,p_embedding_profile_id,v_hash);
  RETURN v_emb_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_search_conversation_history_lexical(
  p_corpus_id uuid,
  p_query text,
  p_match_count integer DEFAULT 10
)
RETURNS TABLE(
  chunk_id uuid, lexical_rank bigint, lexical_score real, content text,
  source_conversation_id text, source_node_id text, source_message_id text, source_role text,
  content_sha256 char(64)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  IF p_match_count<1 OR p_match_count>100 THEN RAISE EXCEPTION 'match_count must be 1..100'; END IF;
  IF length(btrim(coalesce(p_query,'')))=0 THEN RAISE EXCEPTION 'lexical query must not be empty'; END IF;
  IF NOT EXISTS (SELECT 1 FROM comind.cm_retrieval_corpus WHERE corpus_id=p_corpus_id) THEN RAISE EXCEPTION 'Retrieval corpus does not exist'; END IF;
  RETURN QUERY
  WITH q AS (SELECT websearch_to_tsquery('simple'::regconfig,p_query) AS tsq), ranked AS (
    SELECT c.chunk_id,ts_rank_cd(d.fts_simple,q.tsq)::real AS score,d.content,
      c.source_conversation_id,c.source_node_id,c.source_message_id,c.source_role,c.content_sha256
    FROM comind.cm_retrieval_chunk c JOIN comind.cm_doc_chunk d USING (chunk_id) CROSS JOIN q
    WHERE c.corpus_id=p_corpus_id AND d.fts_simple @@ q.tsq
  ), numbered AS (
    SELECT r.*,row_number() OVER (ORDER BY score DESC,chunk_id)::bigint AS rank_no FROM ranked r
  )
  SELECT n.chunk_id,n.rank_no,n.score,n.content,n.source_conversation_id,n.source_node_id,
    n.source_message_id,n.source_role,n.content_sha256
  FROM numbered n ORDER BY n.rank_no LIMIT p_match_count;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_search_conversation_history_semantic(
  p_corpus_id uuid,
  p_embedding_profile_id uuid,
  p_query_embedding extensions.vector,
  p_match_count integer DEFAULT 10
)
RETURNS TABLE(
  chunk_id uuid, semantic_rank bigint, semantic_distance double precision, semantic_similarity double precision,
  content text, source_conversation_id text, source_node_id text, source_message_id text, source_role text,
  content_sha256 char(64)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE v_dims integer;
BEGIN
  IF p_match_count<1 OR p_match_count>100 THEN RAISE EXCEPTION 'match_count must be 1..100'; END IF;
  IF p_query_embedding IS NULL THEN RAISE EXCEPTION 'query embedding is required'; END IF;
  SELECT dims INTO v_dims FROM comind.cm_embedding_profile WHERE embedding_profile_id=p_embedding_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Embedding profile does not exist'; END IF;
  IF extensions.vector_dims(p_query_embedding)<>v_dims THEN RAISE EXCEPTION 'Query embedding dimension mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM comind.cm_retrieval_corpus WHERE corpus_id=p_corpus_id) THEN RAISE EXCEPTION 'Retrieval corpus does not exist'; END IF;
  RETURN QUERY
  WITH ranked AS (
    SELECT r.chunk_id,(e.vec <=> p_query_embedding)::double precision AS distance,d.content,
      c.source_conversation_id,c.source_node_id,c.source_message_id,c.source_role,c.content_sha256
    FROM comind.cm_retrieval_embedding r
    JOIN comind.cm_embedding e USING (emb_id)
    JOIN comind.cm_retrieval_chunk c ON c.corpus_id=r.corpus_id AND c.chunk_id=r.chunk_id
    JOIN comind.cm_doc_chunk d ON d.chunk_id=r.chunk_id
    WHERE r.corpus_id=p_corpus_id AND r.embedding_profile_id=p_embedding_profile_id
  ), numbered AS (
    SELECT r.*,row_number() OVER (ORDER BY distance,chunk_id)::bigint AS rank_no FROM ranked r
  )
  SELECT n.chunk_id,n.rank_no,n.distance,(1.0-n.distance)::double precision,n.content,
    n.source_conversation_id,n.source_node_id,n.source_message_id,n.source_role,n.content_sha256
  FROM numbered n ORDER BY n.rank_no LIMIT p_match_count;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_search_conversation_history_hybrid(
  p_corpus_id uuid,
  p_embedding_profile_id uuid,
  p_query text,
  p_query_embedding extensions.vector,
  p_match_count integer DEFAULT 10,
  p_candidate_count integer DEFAULT 50,
  p_rank_policy_key text DEFAULT 'hybrid_rrf',
  p_rank_policy_version text DEFAULT 'rrf-v1'
)
RETURNS TABLE(
  chunk_id uuid, lexical_rank bigint, semantic_rank bigint, lexical_score real,
  semantic_distance double precision, semantic_similarity double precision, fused_score numeric,
  content text, source_conversation_id text, source_node_id text, source_message_id text,
  source_role text, content_sha256 char(64)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_dims integer;
  v_rrf_k integer;
  v_lex_w numeric;
  v_sem_w numeric;
BEGIN
  IF p_match_count<1 OR p_match_count>100 THEN RAISE EXCEPTION 'match_count must be 1..100'; END IF;
  IF p_candidate_count<p_match_count OR p_candidate_count>500 THEN RAISE EXCEPTION 'candidate_count must be >= match_count and <=500'; END IF;
  IF length(btrim(coalesce(p_query,'')))=0 THEN RAISE EXCEPTION 'hybrid lexical query must not be empty'; END IF;
  IF p_query_embedding IS NULL THEN RAISE EXCEPTION 'query embedding is required'; END IF;
  SELECT dims INTO v_dims FROM comind.cm_embedding_profile WHERE embedding_profile_id=p_embedding_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Embedding profile does not exist'; END IF;
  IF extensions.vector_dims(p_query_embedding)<>v_dims THEN RAISE EXCEPTION 'Query embedding dimension mismatch'; END IF;
  SELECT rrf_k,lexical_weight,semantic_weight INTO v_rrf_k,v_lex_w,v_sem_w
  FROM comind.cm_retrieval_rank_policy
  WHERE rank_policy_key=p_rank_policy_key AND rank_policy_version=p_rank_policy_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hybrid rank policy does not exist'; END IF;

  RETURN QUERY
  WITH q AS (SELECT websearch_to_tsquery('simple'::regconfig,p_query) AS tsq),
  lex_base AS (
    SELECT c.chunk_id,ts_rank_cd(d.fts_simple,q.tsq)::real AS lexical_score
    FROM comind.cm_retrieval_chunk c JOIN comind.cm_doc_chunk d USING (chunk_id) CROSS JOIN q
    WHERE c.corpus_id=p_corpus_id AND d.fts_simple @@ q.tsq
  ), lex AS (
    SELECT l.*,row_number() OVER (ORDER BY lexical_score DESC,chunk_id)::bigint AS lexical_rank
    FROM lex_base l ORDER BY lexical_score DESC,chunk_id LIMIT p_candidate_count
  ), sem_base AS (
    SELECT r.chunk_id,(e.vec <=> p_query_embedding)::double precision AS semantic_distance
    FROM comind.cm_retrieval_embedding r JOIN comind.cm_embedding e USING (emb_id)
    WHERE r.corpus_id=p_corpus_id AND r.embedding_profile_id=p_embedding_profile_id
  ), sem AS (
    SELECT s.*,row_number() OVER (ORDER BY semantic_distance,chunk_id)::bigint AS semantic_rank
    FROM sem_base s ORDER BY semantic_distance,chunk_id LIMIT p_candidate_count
  ), fused AS (
    SELECT coalesce(l.chunk_id,s.chunk_id) AS chunk_id,l.lexical_rank,s.semantic_rank,l.lexical_score,
      s.semantic_distance,CASE WHEN s.semantic_distance IS NULL THEN NULL ELSE (1.0-s.semantic_distance)::double precision END AS semantic_similarity,
      (CASE WHEN l.lexical_rank IS NULL THEN 0 ELSE v_lex_w/(v_rrf_k+l.lexical_rank) END
       + CASE WHEN s.semantic_rank IS NULL THEN 0 ELSE v_sem_w/(v_rrf_k+s.semantic_rank) END)::numeric AS fused_score
    FROM lex l FULL OUTER JOIN sem s USING (chunk_id)
  )
  SELECT f.chunk_id,f.lexical_rank,f.semantic_rank,f.lexical_score,f.semantic_distance,f.semantic_similarity,f.fused_score,
    d.content,c.source_conversation_id,c.source_node_id,c.source_message_id,c.source_role,c.content_sha256
  FROM fused f JOIN comind.cm_retrieval_chunk c ON c.corpus_id=p_corpus_id AND c.chunk_id=f.chunk_id
  JOIN comind.cm_doc_chunk d USING (chunk_id)
  ORDER BY f.fused_score DESC,f.lexical_rank NULLS LAST,f.semantic_rank NULLS LAST,f.chunk_id
  LIMIT p_match_count;
END;
$$;

ALTER TABLE comind.cm_retrieval_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_rank_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_rank_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_embedding_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_embedding_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_corpus FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_document FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_chunk FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_retrieval_embedding FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_embedding ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_embedding FORCE ROW LEVEL SECURITY;

DO $$
DECLARE v_table text; v_role text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_retrieval_policy','cm_retrieval_rank_policy','cm_embedding_profile','cm_retrieval_corpus',
    'cm_retrieval_document','cm_retrieval_chunk','cm_retrieval_embedding'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM PUBLIC',v_table);
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','comind_archive_ingestor','comind_conversation_reconciler','comind_conversation_deriver','comind_conversation_history_certifier'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE comind.%I FROM %I',v_table,v_role);
      END IF;
    END LOOP;
  END LOOP;
  REVOKE ALL ON TABLE comind.cm_embedding FROM PUBLIC;
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_embedding FROM %I',v_role);
    END IF;
  END LOOP;
END
$$;

GRANT SELECT ON TABLE comind.cm_retrieval_policy,comind.cm_retrieval_rank_policy,comind.cm_embedding_profile,
  comind.cm_retrieval_corpus,comind.cm_retrieval_document,comind.cm_retrieval_chunk,comind.cm_retrieval_embedding
TO comind_conversation_history_deriver,comind_conversation_history_reader;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_retrieval_policy','cm_retrieval_rank_policy','cm_embedding_profile','cm_retrieval_corpus',
    'cm_retrieval_document','cm_retrieval_chunk','cm_retrieval_embedding'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS cm_history_deriver_select ON comind.%I',v_table);
    EXECUTE format('CREATE POLICY cm_history_deriver_select ON comind.%I FOR SELECT TO comind_conversation_history_deriver USING (true)',v_table);
    EXECUTE format('DROP POLICY IF EXISTS cm_history_reader_select ON comind.%I',v_table);
    EXECUTE format('CREATE POLICY cm_history_reader_select ON comind.%I FOR SELECT TO comind_conversation_history_reader USING (true)',v_table);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION comind.cm_archive_node_text(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_retrieval_corpus_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_linked_retrieval_doc_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_linked_retrieval_chunk_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_linked_retrieval_embedding_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_build_conversation_history_retrieval_corpus(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_record_retrieval_embedding(uuid,uuid,uuid,extensions.vector) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_search_conversation_history_lexical(uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_search_conversation_history_semantic(uuid,uuid,extensions.vector,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_search_conversation_history_hybrid(uuid,uuid,text,extensions.vector,integer,integer,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION comind.cm_archive_node_text(jsonb)
  TO comind_conversation_history_deriver,comind_conversation_history_reader;
GRANT EXECUTE ON FUNCTION comind.cm_build_conversation_history_retrieval_corpus(uuid,text,text)
  TO comind_conversation_history_deriver;
GRANT EXECUTE ON FUNCTION comind.cm_record_retrieval_embedding(uuid,uuid,uuid,extensions.vector)
  TO comind_conversation_history_deriver;
GRANT EXECUTE ON FUNCTION comind.cm_search_conversation_history_lexical(uuid,text,integer),
  comind.cm_search_conversation_history_semantic(uuid,uuid,extensions.vector,integer),
  comind.cm_search_conversation_history_hybrid(uuid,uuid,text,extensions.vector,integer,integer,text,text)
  TO comind_conversation_history_deriver,comind_conversation_history_reader;

COMMENT ON TABLE comind.cm_retrieval_corpus IS
  'CHIST-K01 immutable retrieval corpus identity bound to one certified Conversation History baseline and one versioned chunk policy.';
COMMENT ON TABLE comind.cm_retrieval_chunk IS
  'CHIST-K01 citation-ready mapping from generic document chunks back to exact archived conversation/node/message evidence.';
COMMENT ON TABLE comind.cm_embedding_profile IS
  'CHIST-K01 governed embedding profile identity. Provider/model/dimension are explicit; no model is canonical source truth.';
COMMENT ON FUNCTION comind.cm_search_conversation_history_hybrid(uuid,uuid,text,extensions.vector,integer,integer,text,text) IS
  'CHIST-K01 inspectable hybrid retrieval using versioned Reciprocal Rank Fusion over lexical and exact cosine semantic ranks.';

COMMIT;
