-- CHIST-A03 concept-analysis completeness and scalability hardening.
-- Record every scanned conversation, including zero-match scans, and process
-- message-level lexical observations in bounded idempotent batches.

BEGIN;
SET search_path TO comind, public;

CREATE TABLE IF NOT EXISTS comind.cm_archive_concept_scan (
  analysis_run_id uuid NOT NULL
    REFERENCES comind.cm_archive_analysis_run(analysis_run_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  source_message_count bigint NOT NULL CHECK (source_message_count >= 0),
  concept_observation_count bigint NOT NULL CHECK (concept_observation_count >= 0),
  evidence_layer text NOT NULL DEFAULT 'derived_analytical_evidence'
    CHECK (evidence_layer='derived_analytical_evidence'),
  epistemic_class text NOT NULL DEFAULT 'observed_fact'
    CHECK (epistemic_class='observed_fact'),
  scan_sha256 char(64) NOT NULL CHECK (scan_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (analysis_run_id,source_conversation_id),
  UNIQUE (analysis_run_id,scan_sha256),
  CONSTRAINT cm_archive_concept_scan_source_fk
    FOREIGN KEY (import_id,source_conversation_id)
    REFERENCES comind.cm_archive_conversation_observation(import_id,source_conversation_id)
    ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS trg_cm_archive_concept_scan_immutable
ON comind.cm_archive_concept_scan;
CREATE TRIGGER trg_cm_archive_concept_scan_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_concept_scan
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_analysis_evidence_mutation();

ALTER TABLE comind.cm_archive_concept_scan ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_concept_scan FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chist_a03_reader_select ON comind.cm_archive_concept_scan;
CREATE POLICY chist_a03_reader_select ON comind.cm_archive_concept_scan
FOR SELECT TO comind_conversation_history_reader USING (true);

DROP POLICY IF EXISTS chist_a03_deriver_select ON comind.cm_archive_concept_scan;
CREATE POLICY chist_a03_deriver_select ON comind.cm_archive_concept_scan
FOR SELECT TO comind_conversation_history_deriver USING (true);

DROP POLICY IF EXISTS chist_a03_deriver_insert_scan ON comind.cm_archive_concept_scan;
CREATE POLICY chist_a03_deriver_insert_scan ON comind.cm_archive_concept_scan
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);

REVOKE ALL ON comind.cm_archive_concept_scan FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON comind.cm_archive_concept_scan FROM %I',role_name);
    END IF;
  END LOOP;
END
$$;

GRANT SELECT ON comind.cm_archive_concept_scan
TO comind_conversation_history_reader,comind_conversation_history_deriver;
GRANT INSERT ON comind.cm_archive_concept_scan
TO comind_conversation_history_deriver;

CREATE INDEX IF NOT EXISTS idx_cm_archive_concept_scan_import_conversation
ON comind.cm_archive_concept_scan(import_id,source_conversation_id);

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
  ), scan_counts AS (
    SELECT b.source_conversation_id,
           count(m.source_message_id) AS source_message_count,
           count(o.concept_observation_id) AS observation_count
    FROM batch b
    LEFT JOIN comind.cm_archive_branch_membership m
      ON m.analysis_run_id=p_analysis_run_id
     AND m.source_conversation_id=b.source_conversation_id
     AND m.source_message_id IS NOT NULL
    LEFT JOIN comind.cm_archive_concept_observation o
      ON o.analysis_run_id=p_analysis_run_id
     AND o.source_conversation_id=b.source_conversation_id
    GROUP BY b.source_conversation_id
  )
  INSERT INTO comind.cm_archive_concept_scan(
    analysis_run_id,import_id,source_conversation_id,source_message_count,
    concept_observation_count,scan_sha256
  )
  SELECT p_analysis_run_id,v_import_id,source_conversation_id,source_message_count,
         observation_count,
         comind.cm_archive_analysis_sha256(concat_ws('|',
           p_analysis_run_id::text,v_import_id::text,source_conversation_id,
           source_message_count::text,observation_count::text
         ))
  FROM scan_counts;

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

CREATE OR REPLACE FUNCTION comind.cm_finalize_archive_analysis_run(p_analysis_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind
AS $$
DECLARE
  v_run comind.cm_archive_analysis_run%ROWTYPE;
  v_membership_count bigint;
  v_scan_count bigint;
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
  IF v_membership_count <> v_run.source_node_count THEN
    RAISE EXCEPTION 'cannot finalize: branch membership % does not match source node count %',
      v_membership_count,v_run.source_node_count;
  END IF;

  SELECT count(*) INTO v_scan_count
  FROM comind.cm_archive_concept_scan
  WHERE analysis_run_id=p_analysis_run_id;
  IF v_scan_count <> v_run.source_conversation_count THEN
    RAISE EXCEPTION 'cannot finalize: concept scans % do not match source conversation count %',
      v_scan_count,v_run.source_conversation_count;
  END IF;

  INSERT INTO comind.cm_archive_concept_summary(
    analysis_run_id,import_id,concept_key,concept_version,message_hit_count,conversation_count,
    user_message_hit_count,assistant_message_hit_count,active_message_hit_count,alternate_message_hit_count,
    first_message_at,last_message_at,first_user_message_at,first_assistant_message_at,summary_sha256
  )
  SELECT p_analysis_run_id,v_run.import_id,d.concept_key,d.concept_version,
         count(o.concept_observation_id),count(DISTINCT o.source_conversation_id),
         count(o.concept_observation_id) FILTER (WHERE o.source_role='user'),
         count(o.concept_observation_id) FILTER (WHERE o.source_role='assistant'),
         count(o.concept_observation_id) FILTER (WHERE o.branch_state='active'),
         count(o.concept_observation_id) FILTER (WHERE o.branch_state='alternate'),
         min(o.observed_at),max(o.observed_at),
         min(o.observed_at) FILTER (WHERE o.source_role='user'),
         min(o.observed_at) FILTER (WHERE o.source_role='assistant'),
         comind.cm_archive_analysis_sha256(concat_ws('|',
           p_analysis_run_id::text,d.concept_key,d.concept_version,
           count(o.concept_observation_id)::text,
           count(DISTINCT o.source_conversation_id)::text,
           coalesce(min(o.observed_at)::text,'none'),coalesce(max(o.observed_at)::text,'none')
         ))
  FROM comind.cm_archive_concept_definition d
  LEFT JOIN comind.cm_archive_concept_observation o
    ON o.analysis_run_id=p_analysis_run_id
   AND o.concept_key=d.concept_key
   AND o.concept_version=d.concept_version
  WHERE d.concept_version='v1'
  GROUP BY d.concept_key,d.concept_version
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
           p_analysis_run_id::text,key_a,version_a,key_b,version_b,count(*)::text,
           coalesce(min(conversation_first_at)::text,'none'),
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
    'concept_scan_count',v_scan_count,
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

REVOKE EXECUTE ON FUNCTION comind.cm_populate_archive_concept_observations(uuid)
FROM comind_conversation_history_deriver;
REVOKE ALL ON FUNCTION comind.cm_populate_archive_concept_observations_batch(uuid,integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_populate_archive_concept_observations_batch(uuid,integer)
TO comind_conversation_history_deriver;

COMMENT ON TABLE comind.cm_archive_concept_scan IS
  'CHIST-A03 immutable proof that one source conversation was scanned for the versioned lexical concept set, including zero-match scans.';
COMMENT ON FUNCTION comind.cm_populate_archive_concept_observations_batch(uuid,integer) IS
  'CHIST-A03 idempotent bounded lexical concept scanner over conversations not yet represented in cm_archive_concept_scan.';

COMMIT;
