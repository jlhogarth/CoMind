BEGIN;

-- CHIST-K01 forward repair for PostgreSQL PL/pgSQL output-variable ambiguity.
-- RETURNS TABLE output names are PL/pgSQL variables, so every ranking/order
-- expression that shares an output-column name is explicitly qualified.

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
  WITH q AS (
    SELECT websearch_to_tsquery('simple'::regconfig,p_query) AS tsq
  ), ranked AS (
    SELECT c.chunk_id,ts_rank_cd(d.fts_simple,q.tsq)::real AS score,d.content,
      c.source_conversation_id,c.source_node_id,c.source_message_id,c.source_role,c.content_sha256
    FROM comind.cm_retrieval_chunk c
    JOIN comind.cm_doc_chunk d ON d.chunk_id=c.chunk_id
    CROSS JOIN q
    WHERE c.corpus_id=p_corpus_id AND d.fts_simple @@ q.tsq
  ), numbered AS (
    SELECT r.*,row_number() OVER (ORDER BY r.score DESC,r.chunk_id)::bigint AS rank_no
    FROM ranked r
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
    JOIN comind.cm_embedding e ON e.emb_id=r.emb_id
    JOIN comind.cm_retrieval_chunk c ON c.corpus_id=r.corpus_id AND c.chunk_id=r.chunk_id
    JOIN comind.cm_doc_chunk d ON d.chunk_id=r.chunk_id
    WHERE r.corpus_id=p_corpus_id AND r.embedding_profile_id=p_embedding_profile_id
  ), numbered AS (
    SELECT r.*,row_number() OVER (ORDER BY r.distance,r.chunk_id)::bigint AS rank_no
    FROM ranked r
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
  WITH q AS (
    SELECT websearch_to_tsquery('simple'::regconfig,p_query) AS tsq
  ), lex_base AS (
    SELECT c.chunk_id,ts_rank_cd(d.fts_simple,q.tsq)::real AS lexical_score
    FROM comind.cm_retrieval_chunk c
    JOIN comind.cm_doc_chunk d ON d.chunk_id=c.chunk_id
    CROSS JOIN q
    WHERE c.corpus_id=p_corpus_id AND d.fts_simple @@ q.tsq
  ), lex AS (
    SELECT l.*,row_number() OVER (ORDER BY l.lexical_score DESC,l.chunk_id)::bigint AS lexical_rank
    FROM lex_base l ORDER BY l.lexical_score DESC,l.chunk_id LIMIT p_candidate_count
  ), sem_base AS (
    SELECT r.chunk_id,(e.vec <=> p_query_embedding)::double precision AS semantic_distance
    FROM comind.cm_retrieval_embedding r
    JOIN comind.cm_embedding e ON e.emb_id=r.emb_id
    WHERE r.corpus_id=p_corpus_id AND r.embedding_profile_id=p_embedding_profile_id
  ), sem AS (
    SELECT s.*,row_number() OVER (ORDER BY s.semantic_distance,s.chunk_id)::bigint AS semantic_rank
    FROM sem_base s ORDER BY s.semantic_distance,s.chunk_id LIMIT p_candidate_count
  ), fused AS (
    SELECT coalesce(l.chunk_id,s.chunk_id) AS chunk_id,l.lexical_rank,s.semantic_rank,l.lexical_score,
      s.semantic_distance,
      CASE WHEN s.semantic_distance IS NULL THEN NULL ELSE (1.0-s.semantic_distance)::double precision END AS semantic_similarity,
      (CASE WHEN l.lexical_rank IS NULL THEN 0 ELSE v_lex_w/(v_rrf_k+l.lexical_rank) END
       + CASE WHEN s.semantic_rank IS NULL THEN 0 ELSE v_sem_w/(v_rrf_k+s.semantic_rank) END)::numeric AS fused_score
    FROM lex l FULL OUTER JOIN sem s ON s.chunk_id=l.chunk_id
  )
  SELECT f.chunk_id,f.lexical_rank,f.semantic_rank,f.lexical_score,f.semantic_distance,f.semantic_similarity,f.fused_score,
    d.content,c.source_conversation_id,c.source_node_id,c.source_message_id,c.source_role,c.content_sha256
  FROM fused f
  JOIN comind.cm_retrieval_chunk c ON c.corpus_id=p_corpus_id AND c.chunk_id=f.chunk_id
  JOIN comind.cm_doc_chunk d ON d.chunk_id=f.chunk_id
  ORDER BY f.fused_score DESC,f.lexical_rank NULLS LAST,f.semantic_rank NULLS LAST,f.chunk_id
  LIMIT p_match_count;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_search_conversation_history_lexical(uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_search_conversation_history_semantic(uuid,uuid,extensions.vector,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_search_conversation_history_hybrid(uuid,uuid,text,extensions.vector,integer,integer,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION comind.cm_search_conversation_history_lexical(uuid,text,integer),
  comind.cm_search_conversation_history_semantic(uuid,uuid,extensions.vector,integer),
  comind.cm_search_conversation_history_hybrid(uuid,uuid,text,extensions.vector,integer,integer,text,text)
TO comind_conversation_history_deriver,comind_conversation_history_reader;

COMMIT;
