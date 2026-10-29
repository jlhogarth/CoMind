-- CHIST-A03 concept scan grain repair.
-- Count source messages and concept observations in independent aggregates so
-- many-to-many joins cannot multiply either metric.

BEGIN;
SET search_path TO comind, public;

CREATE OR REPLACE FUNCTION comind.cm_populate_archive_concept_observations_batch(
  p_analysis_run_id uuid,
  p_batch_conversations integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_import_id uuid;
  v_state text;
  v_source_node_count bigint;
  v_membership_count bigint;
  v_batch_count bigint;
  v_inserted bigint;
  v_remaining bigint;
BEGIN
  IF p_batch_conversations < 1 OR p_batch_conversations > 500 THEN
    RAISE EXCEPTION 'concept batch size must be between 1 and 500 conversations';
  END IF;

  SELECT import_id,result_state,source_node_count
    INTO v_import_id,v_state,v_source_node_count
  FROM comind.cm_archive_analysis_run
  WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND OR v_state <> 'building' THEN
    RAISE EXCEPTION 'analysis run must exist in building state';
  END IF;

  SELECT count(*) INTO v_membership_count
  FROM comind.cm_archive_branch_membership
  WHERE analysis_run_id=p_analysis_run_id;
  IF v_membership_count <> v_source_node_count THEN
    RAISE EXCEPTION 'complete branch membership is required before concept scanning: % of %',
      v_membership_count,v_source_node_count;
  END IF;

  WITH batch AS MATERIALIZED (
    SELECT c.source_conversation_id
    FROM comind.cm_archive_conversation_observation c
    WHERE c.import_id=v_import_id
      AND NOT EXISTS (
        SELECT 1 FROM comind.cm_archive_concept_scan s
        WHERE s.analysis_run_id=p_analysis_run_id
          AND s.source_conversation_id=c.source_conversation_id
      )
    ORDER BY c.source_conversation_id
    LIMIT p_batch_conversations
  )
  SELECT count(*) INTO v_batch_count FROM batch;

  IF v_batch_count=0 THEN
    RETURN jsonb_build_object(
      'inserted_observations',0,
      'processed_conversations',0,
      'remaining_conversations',0,
      'done',true
    );
  END IF;

  WITH batch AS MATERIALIZED (
    SELECT c.source_conversation_id
    FROM comind.cm_archive_conversation_observation c
    WHERE c.import_id=v_import_id
      AND NOT EXISTS (
        SELECT 1 FROM comind.cm_archive_concept_scan s
        WHERE s.analysis_run_id=p_analysis_run_id
          AND s.source_conversation_id=c.source_conversation_id
      )
    ORDER BY c.source_conversation_id
    LIMIT p_batch_conversations
  ), base AS MATERIALIZED (
    SELECT m.import_id,m.source_conversation_id,m.source_node_id,m.source_message_id,
           m.source_role,m.source_created_at,m.branch_state,n.raw_node,
           n.raw_node #> '{message,content}' AS content
    FROM comind.cm_archive_branch_membership m
    JOIN batch b USING (source_conversation_id)
    JOIN comind.cm_archive_node_observation n
      ON n.import_id=m.import_id
     AND n.source_conversation_id=m.source_conversation_id
     AND n.source_node_id=m.source_node_id
    WHERE m.analysis_run_id=p_analysis_run_id
      AND m.source_message_id IS NOT NULL
  ), extracted AS MATERIALIZED (
    SELECT b.*,
      CASE
        WHEN jsonb_typeof(b.content)='string' THEN b.content #>> '{}'
        WHEN jsonb_typeof(b.content)='object' THEN coalesce(
          (SELECT string_agg(piece,E'\n' ORDER BY ord) FROM (
             SELECT ord,CASE
               WHEN jsonb_typeof(part)='string' THEN part #>> '{}'
               WHEN jsonb_typeof(part)='object' AND jsonb_typeof(part->'text')='string'
                 THEN part->>'text'
               ELSE NULL END AS piece
             FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(b.content->'parts')='array'
                    THEN b.content->'parts' ELSE '[]'::jsonb END
             ) WITH ORDINALITY x(part,ord)
          ) p WHERE piece IS NOT NULL),
          CASE WHEN jsonb_typeof(b.content->'text')='string' THEN b.content->>'text' END,
          CASE WHEN jsonb_typeof(b.raw_node #> '{message,text}')='string'
               THEN b.raw_node #>> '{message,text}' END,
          '')
        ELSE coalesce(
          CASE WHEN jsonb_typeof(b.raw_node #> '{message,text}')='string'
               THEN b.raw_node #>> '{message,text}' END,
          ''
        )
      END AS message_text
    FROM base b
  )
  INSERT INTO comind.cm_archive_concept_observation(
    analysis_run_id,import_id,concept_key,concept_version,source_conversation_id,source_node_id,
    source_message_id,source_role,branch_state,observed_at,ambiguity_class,observation_sha256
  )
  SELECT p_analysis_run_id,e.import_id,d.concept_key,d.concept_version,
         e.source_conversation_id,e.source_node_id,e.source_message_id,e.source_role,
         e.branch_state,e.source_created_at,d.ambiguity_class,
         comind.cm_archive_analysis_sha256(concat_ws('|',
           p_analysis_run_id::text,d.concept_key,d.concept_version,
           e.source_conversation_id,e.source_node_id
         ))
  FROM extracted e
  CROSS JOIN comind.cm_archive_concept_definition d
  WHERE d.concept_version='v1'
    AND CASE WHEN d.case_sensitive
             THEN e.message_text ~ d.match_pattern
             ELSE e.message_text ~* d.match_pattern END
  ON CONFLICT (analysis_run_id,concept_key,concept_version,source_conversation_id,source_node_id)
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  WITH batch AS MATERIALIZED (
    SELECT c.source_conversation_id
    FROM comind.cm_archive_conversation_observation c
    WHERE c.import_id=v_import_id
      AND NOT EXISTS (
        SELECT 1 FROM comind.cm_archive_concept_scan s
        WHERE s.analysis_run_id=p_analysis_run_id
          AND s.source_conversation_id=c.source_conversation_id
      )
    ORDER BY c.source_conversation_id
    LIMIT p_batch_conversations
  ), message_counts AS (
    SELECT b.source_conversation_id,count(m.source_message_id) AS source_message_count
    FROM batch b
    LEFT JOIN comind.cm_archive_branch_membership m
      ON m.analysis_run_id=p_analysis_run_id
     AND m.source_conversation_id=b.source_conversation_id
     AND m.source_message_id IS NOT NULL
    GROUP BY b.source_conversation_id
  ), observation_counts AS (
    SELECT b.source_conversation_id,count(o.concept_observation_id) AS observation_count
    FROM batch b
    LEFT JOIN comind.cm_archive_concept_observation o
      ON o.analysis_run_id=p_analysis_run_id
     AND o.source_conversation_id=b.source_conversation_id
    GROUP BY b.source_conversation_id
  )
  INSERT INTO comind.cm_archive_concept_scan(
    analysis_run_id,import_id,source_conversation_id,source_message_count,
    concept_observation_count,scan_sha256
  )
  SELECT p_analysis_run_id,v_import_id,m.source_conversation_id,m.source_message_count,
         o.observation_count,
         comind.cm_archive_analysis_sha256(concat_ws('|',
           p_analysis_run_id::text,v_import_id::text,m.source_conversation_id,
           m.source_message_count::text,o.observation_count::text
         ))
  FROM message_counts m
  JOIN observation_counts o USING (source_conversation_id);

  SELECT count(*) INTO v_remaining
  FROM comind.cm_archive_conversation_observation c
  WHERE c.import_id=v_import_id
    AND NOT EXISTS (
      SELECT 1 FROM comind.cm_archive_concept_scan s
      WHERE s.analysis_run_id=p_analysis_run_id
        AND s.source_conversation_id=c.source_conversation_id
    );

  RETURN jsonb_build_object(
    'inserted_observations',v_inserted,
    'processed_conversations',v_batch_count,
    'remaining_conversations',v_remaining,
    'done',v_remaining=0
  );
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_populate_archive_concept_observations_batch(uuid,integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_populate_archive_concept_observations_batch(uuid,integer)
TO comind_conversation_history_deriver;

COMMIT;
