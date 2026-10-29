-- CHIST-A03 least-privilege hardening.
-- Keep the Conversation History deriver out of the shared extensions schema.
-- Expose only a fixed SHA-256 helper, then use it inside A03 runtime writers.

BEGIN;
SET search_path TO comind, public, extensions;

CREATE OR REPLACE FUNCTION comind.cm_archive_analysis_sha256(p_value text)
RETURNS char(64)
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path=pg_catalog,extensions
AS $$
  SELECT encode(extensions.digest(p_value,'sha256'),'hex')::char(64)
$$;

REVOKE ALL ON FUNCTION comind.cm_archive_analysis_sha256(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_archive_analysis_sha256(text)
TO comind_conversation_history_deriver;

CREATE OR REPLACE FUNCTION comind.cm_begin_archive_analysis_run(
  p_import_id uuid,
  p_policy_key text DEFAULT 'corpus_analytical_baseline',
  p_policy_version text DEFAULT 'a03-v1',
  p_sessionization_run_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_baseline comind.cm_conversation_history_baseline%ROWTYPE;
  v_import comind.cm_archive_import%ROWTYPE;
  v_session_import uuid;
  v_attachment_refs bigint;
  v_identity char(64);
  v_existing uuid;
  v_run_id uuid;
BEGIN
  SELECT * INTO v_baseline
  FROM comind.cm_conversation_history_baseline
  WHERE import_id=p_import_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CHIST-A03 requires a certified Conversation History baseline';
  END IF;

  SELECT * INTO v_import
  FROM comind.cm_archive_import
  WHERE import_id=p_import_id;
  IF NOT FOUND OR v_import.status <> 'PASS' THEN
    RAISE EXCEPTION 'CHIST-A03 requires a PASS archive import';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM comind.cm_archive_analysis_policy
    WHERE policy_key=p_policy_key AND policy_version=p_policy_version
  ) THEN
    RAISE EXCEPTION 'unknown CHIST-A03 analysis policy %.%',p_policy_key,p_policy_version;
  END IF;

  IF p_sessionization_run_id IS NOT NULL THEN
    SELECT import_id INTO v_session_import
    FROM comind.cm_archive_sessionization_run
    WHERE sessionization_run_id=p_sessionization_run_id
      AND result_state='completed';
    IF NOT FOUND OR v_session_import <> p_import_id THEN
      RAISE EXCEPTION 'sessionization run must be completed and belong to the same archive import';
    END IF;
  END IF;

  SELECT count(*) INTO v_attachment_refs
  FROM comind.cm_archive_attachment_reference
  WHERE import_id=p_import_id;

  v_identity := comind.cm_archive_analysis_sha256(concat_ws('|',
    p_import_id::text,
    v_baseline.baseline_id::text,
    v_baseline.source_archive_sha256::text,
    v_baseline.certification_sha256::text,
    p_policy_key,
    p_policy_version,
    coalesce(p_sessionization_run_id::text,'none')
  ));

  SELECT analysis_run_id INTO v_existing
  FROM comind.cm_archive_analysis_run
  WHERE analysis_identity_sha256=v_identity;
  IF FOUND THEN RETURN v_existing; END IF;

  INSERT INTO comind.cm_archive_analysis_run(
    import_id,baseline_id,sessionization_run_id,policy_key,policy_version,
    source_archive_sha256,certification_sha256,source_conversation_count,source_node_count,
    source_message_count,source_attachment_reference_count,source_stats,engine_metadata,analysis_identity_sha256
  ) VALUES (
    p_import_id,v_baseline.baseline_id,p_sessionization_run_id,p_policy_key,p_policy_version,
    v_baseline.source_archive_sha256,v_baseline.certification_sha256,
    v_import.source_conversation_count,v_import.source_node_count,v_import.source_message_count,v_attachment_refs,
    jsonb_build_object(
      'parser_version',v_import.parser_version,
      'schema_version',v_import.schema_version,
      'parser_error_count',v_import.parser_error_count,
      'parser_warning_count',v_import.parser_warning_count,
      'attachment_reference_count',v_attachment_refs
    ),
    jsonb_build_object(
      'engine_kind','deterministic',
      'paid_provider_call',false,
      'promotion_performed',false
    ),
    v_identity
  ) RETURNING analysis_run_id INTO v_run_id;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_populate_archive_branch_membership(p_analysis_run_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_import_id uuid;
  v_state text;
  v_conversations bigint;
  v_resolved bigint;
  v_missing_parents bigint;
  v_cycle_count bigint;
  v_inserted bigint;
BEGIN
  SELECT import_id,result_state INTO v_import_id,v_state
  FROM comind.cm_archive_analysis_run WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND OR v_state <> 'building' THEN
    RAISE EXCEPTION 'analysis run must exist in building state';
  END IF;

  IF EXISTS (
    SELECT 1 FROM comind.cm_archive_branch_membership
    WHERE analysis_run_id=p_analysis_run_id
  ) THEN
    SELECT count(*) INTO v_inserted
    FROM comind.cm_archive_branch_membership
    WHERE analysis_run_id=p_analysis_run_id;
    RETURN v_inserted;
  END IF;

  SELECT count(*) INTO v_conversations
  FROM comind.cm_archive_conversation_observation
  WHERE import_id=v_import_id;

  SELECT count(*) INTO v_resolved
  FROM comind.cm_archive_conversation_observation c
  JOIN comind.cm_archive_node_observation n
    ON n.import_id=c.import_id
   AND n.source_conversation_id=c.source_conversation_id
   AND n.source_node_id=c.raw_conversation->>'current_node'
  WHERE c.import_id=v_import_id;

  IF v_resolved <> v_conversations THEN
    RAISE EXCEPTION 'cannot classify branches: resolved current_node % of % conversations',v_resolved,v_conversations;
  END IF;

  SELECT count(*) INTO v_missing_parents
  FROM comind.cm_archive_node_observation n
  WHERE n.import_id=v_import_id
    AND n.parent_source_node_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM comind.cm_archive_node_observation p
      WHERE p.import_id=n.import_id
        AND p.source_conversation_id=n.source_conversation_id
        AND p.source_node_id=n.parent_source_node_id
    );

  IF v_missing_parents > 0 THEN
    RAISE EXCEPTION 'cannot classify branches: % source nodes reference missing parent nodes',v_missing_parents;
  END IF;

  WITH RECURSIVE roots AS MATERIALIZED (
    SELECT c.import_id,c.source_conversation_id,c.raw_conversation->>'current_node' AS current_node
    FROM comind.cm_archive_conversation_observation c
    WHERE c.import_id=v_import_id
  ), resolved AS MATERIALIZED (
    SELECT r.import_id,r.source_conversation_id,n.source_node_id,n.parent_source_node_id
    FROM roots r
    JOIN comind.cm_archive_node_observation n
      ON n.import_id=r.import_id
     AND n.source_conversation_id=r.source_conversation_id
     AND n.source_node_id=r.current_node
  ), walk(import_id,source_conversation_id,source_node_id,parent_source_node_id,path,cycle) AS (
    SELECT import_id,source_conversation_id,source_node_id,parent_source_node_id,
           ARRAY[source_node_id]::text[],false
    FROM resolved
    UNION ALL
    SELECT w.import_id,w.source_conversation_id,p.source_node_id,p.parent_source_node_id,
           w.path || p.source_node_id,
           p.source_node_id=ANY(w.path)
    FROM walk w
    JOIN comind.cm_archive_node_observation p
      ON p.import_id=w.import_id
     AND p.source_conversation_id=w.source_conversation_id
     AND p.source_node_id=w.parent_source_node_id
    WHERE NOT w.cycle
  )
  SELECT count(*) INTO v_cycle_count FROM walk WHERE cycle;

  IF v_cycle_count > 0 THEN
    RAISE EXCEPTION 'cannot classify branches: % active ancestry paths contain a parent cycle',v_cycle_count;
  END IF;

  WITH RECURSIVE roots AS MATERIALIZED (
    SELECT c.import_id,c.source_conversation_id,c.raw_conversation->>'current_node' AS current_node
    FROM comind.cm_archive_conversation_observation c
    WHERE c.import_id=v_import_id
  ), resolved AS MATERIALIZED (
    SELECT r.import_id,r.source_conversation_id,n.source_node_id,n.parent_source_node_id
    FROM roots r
    JOIN comind.cm_archive_node_observation n
      ON n.import_id=r.import_id
     AND n.source_conversation_id=r.source_conversation_id
     AND n.source_node_id=r.current_node
  ), active(import_id,source_conversation_id,source_node_id,parent_source_node_id,path) AS (
    SELECT import_id,source_conversation_id,source_node_id,parent_source_node_id,
           ARRAY[source_node_id]::text[]
    FROM resolved
    UNION ALL
    SELECT a.import_id,a.source_conversation_id,p.source_node_id,p.parent_source_node_id,
           a.path || p.source_node_id
    FROM active a
    JOIN comind.cm_archive_node_observation p
      ON p.import_id=a.import_id
     AND p.source_conversation_id=a.source_conversation_id
     AND p.source_node_id=a.parent_source_node_id
    WHERE NOT p.source_node_id=ANY(a.path)
  ), active_distinct AS MATERIALIZED (
    SELECT DISTINCT import_id,source_conversation_id,source_node_id FROM active
  )
  INSERT INTO comind.cm_archive_branch_membership(
    analysis_run_id,import_id,source_conversation_id,source_node_id,source_message_id,source_role,
    source_created_at,branch_state,membership_sha256
  )
  SELECT p_analysis_run_id,n.import_id,n.source_conversation_id,n.source_node_id,n.source_message_id,n.role,n.created_at,
         CASE WHEN a.source_node_id IS NULL THEN 'alternate' ELSE 'active' END,
         comind.cm_archive_analysis_sha256(concat_ws('|',
           p_analysis_run_id::text,n.import_id::text,n.source_conversation_id,n.source_node_id,
           CASE WHEN a.source_node_id IS NULL THEN 'alternate' ELSE 'active' END
         ))
  FROM comind.cm_archive_node_observation n
  LEFT JOIN active_distinct a
    ON a.import_id=n.import_id
   AND a.source_conversation_id=n.source_conversation_id
   AND a.source_node_id=n.source_node_id
  WHERE n.import_id=v_import_id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_populate_archive_concept_observations(p_analysis_run_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_import_id uuid;
  v_state text;
  v_node_count bigint;
  v_membership_count bigint;
  v_inserted bigint;
BEGIN
  SELECT import_id,result_state INTO v_import_id,v_state
  FROM comind.cm_archive_analysis_run WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND OR v_state <> 'building' THEN
    RAISE EXCEPTION 'analysis run must exist in building state';
  END IF;

  IF EXISTS (
    SELECT 1 FROM comind.cm_archive_concept_observation
    WHERE analysis_run_id=p_analysis_run_id
  ) THEN
    SELECT count(*) INTO v_inserted
    FROM comind.cm_archive_concept_observation
    WHERE analysis_run_id=p_analysis_run_id;
    RETURN v_inserted;
  END IF;

  SELECT count(*) INTO v_node_count
  FROM comind.cm_archive_node_observation
  WHERE import_id=v_import_id;

  SELECT count(*) INTO v_membership_count
  FROM comind.cm_archive_branch_membership
  WHERE analysis_run_id=p_analysis_run_id;

  IF v_membership_count <> v_node_count THEN
    RAISE EXCEPTION 'branch membership must cover every source node before concept analysis: % of %',v_membership_count,v_node_count;
  END IF;

  WITH base AS MATERIALIZED (
    SELECT m.analysis_run_id,m.import_id,m.source_conversation_id,m.source_node_id,m.source_message_id,
           m.source_role,m.source_created_at,m.branch_state,n.raw_node,n.raw_node #> '{message,content}' AS content
    FROM comind.cm_archive_branch_membership m
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
               WHEN jsonb_typeof(part)='object' AND jsonb_typeof(part->'text')='string' THEN part->>'text'
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
             ELSE e.message_text ~* d.match_pattern END;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_finalize_archive_analysis_run(p_analysis_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_run comind.cm_archive_analysis_run%ROWTYPE;
  v_membership_count bigint;
  v_source_node_count bigint;
  v_observation_count bigint;
  v_summary_count bigint;
  v_bridge_count bigint;
  v_active_message_count bigint;
  v_alternate_message_count bigint;
  v_counts jsonb;
BEGIN
  SELECT * INTO v_run
  FROM comind.cm_archive_analysis_run
  WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'analysis run does not exist'; END IF;
  IF v_run.result_state <> 'building' THEN RETURN v_run.result_counts; END IF;

  SELECT count(*) INTO v_membership_count
  FROM comind.cm_archive_branch_membership
  WHERE analysis_run_id=p_analysis_run_id;

  v_source_node_count := v_run.source_node_count;
  IF v_membership_count <> v_source_node_count THEN
    RAISE EXCEPTION 'cannot finalize: branch membership % does not match source node count %',v_membership_count,v_source_node_count;
  END IF;

  INSERT INTO comind.cm_archive_concept_summary(
    analysis_run_id,import_id,concept_key,concept_version,message_hit_count,conversation_count,
    user_message_hit_count,assistant_message_hit_count,active_message_hit_count,alternate_message_hit_count,
    first_message_at,last_message_at,first_user_message_at,first_assistant_message_at,summary_sha256
  )
  SELECT p_analysis_run_id,v_run.import_id,o.concept_key,o.concept_version,
         count(*),count(DISTINCT o.source_conversation_id),
         count(*) FILTER (WHERE o.source_role='user'),
         count(*) FILTER (WHERE o.source_role='assistant'),
         count(*) FILTER (WHERE o.branch_state='active'),
         count(*) FILTER (WHERE o.branch_state='alternate'),
         min(o.observed_at),max(o.observed_at),
         min(o.observed_at) FILTER (WHERE o.source_role='user'),
         min(o.observed_at) FILTER (WHERE o.source_role='assistant'),
         comind.cm_archive_analysis_sha256(concat_ws('|',
           p_analysis_run_id::text,o.concept_key,o.concept_version,
           count(*)::text,count(DISTINCT o.source_conversation_id)::text,
           coalesce(min(o.observed_at)::text,'none'),
           coalesce(max(o.observed_at)::text,'none')
         ))
  FROM comind.cm_archive_concept_observation o
  WHERE o.analysis_run_id=p_analysis_run_id
  GROUP BY o.concept_key,o.concept_version
  ON CONFLICT (analysis_run_id,concept_key,concept_version) DO NOTHING;

  WITH concept_conv AS MATERIALIZED (
    SELECT concept_key,concept_version,source_conversation_id,
           min(observed_at) AS first_at,max(observed_at) AS last_at
    FROM comind.cm_archive_concept_observation
    WHERE analysis_run_id=p_analysis_run_id
    GROUP BY concept_key,concept_version,source_conversation_id
  ), pairs AS (
    SELECT a.concept_key AS key_a,a.concept_version AS version_a,
           b.concept_key AS key_b,b.concept_version AS version_b,
           a.source_conversation_id,
           least(a.first_at,b.first_at) AS conversation_first_at,
           greatest(a.last_at,b.last_at) AS conversation_last_at
    FROM concept_conv a
    JOIN concept_conv b
      ON b.source_conversation_id=a.source_conversation_id
     AND a.concept_key < b.concept_key
  )
  INSERT INTO comind.cm_archive_concept_bridge(
    analysis_run_id,import_id,concept_key_a,concept_version_a,concept_key_b,concept_version_b,
    conversation_count,first_shared_conversation_at,last_shared_conversation_at,bridge_sha256
  )
  SELECT p_analysis_run_id,v_run.import_id,key_a,version_a,key_b,version_b,
         count(*),min(conversation_first_at),max(conversation_last_at),
         comind.cm_archive_analysis_sha256(concat_ws('|',
           p_analysis_run_id::text,key_a,version_a,key_b,version_b,
           count(*)::text,coalesce(min(conversation_first_at)::text,'none'),
           coalesce(max(conversation_last_at)::text,'none')
         ))
  FROM pairs
  GROUP BY key_a,version_a,key_b,version_b
  ON CONFLICT (
    analysis_run_id,concept_key_a,concept_version_a,concept_key_b,concept_version_b,cooccurrence_scope
  ) DO NOTHING;

  SELECT count(*) INTO v_observation_count
  FROM comind.cm_archive_concept_observation
  WHERE analysis_run_id=p_analysis_run_id;

  SELECT count(*) INTO v_summary_count
  FROM comind.cm_archive_concept_summary
  WHERE analysis_run_id=p_analysis_run_id;

  SELECT count(*) INTO v_bridge_count
  FROM comind.cm_archive_concept_bridge
  WHERE analysis_run_id=p_analysis_run_id;

  SELECT count(*) FILTER (WHERE source_message_id IS NOT NULL AND branch_state='active'),
         count(*) FILTER (WHERE source_message_id IS NOT NULL AND branch_state='alternate')
    INTO v_active_message_count,v_alternate_message_count
  FROM comind.cm_archive_branch_membership
  WHERE analysis_run_id=p_analysis_run_id;

  v_counts := jsonb_build_object(
    'branch_membership_count',v_membership_count,
    'active_message_node_count',v_active_message_count,
    'alternate_message_node_count',v_alternate_message_count,
    'concept_observation_count',v_observation_count,
    'concept_summary_count',v_summary_count,
    'concept_bridge_count',v_bridge_count
  );

  UPDATE comind.cm_archive_analysis_run
  SET result_state='completed',result_counts=v_counts,completed_at=now()
  WHERE analysis_run_id=p_analysis_run_id;

  RETURN v_counts;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_begin_archive_analysis_run(uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_populate_archive_branch_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_populate_archive_concept_observations(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_finalize_archive_analysis_run(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION comind.cm_begin_archive_analysis_run(uuid,text,text,uuid),
  comind.cm_populate_archive_branch_membership(uuid),
  comind.cm_populate_archive_concept_observations(uuid),
  comind.cm_finalize_archive_analysis_run(uuid)
TO comind_conversation_history_deriver;

COMMIT;
