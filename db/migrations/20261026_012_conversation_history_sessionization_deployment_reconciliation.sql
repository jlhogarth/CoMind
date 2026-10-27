-- CHIST-A02 deployment reconciliation.
--
-- Supabase Test migration chist_a02_sessionization_temporal_rollups was applied
-- from an execution rendering that was semantically equivalent to migration 011
-- but not byte-identical to the reviewed repository source. The deployed
-- rendering made two benign normalizations explicit:
--   1. normalized_message_hash is cast to text before COALESCE in event hashes.
--   2. the local-hour projection orders by output column position 2.
--
-- This forward-only migration makes those deployed function definitions the
-- reviewed canonical end state. It does not alter source evidence, session
-- policy semantics, table data, or previously derived A02 rows.
BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_compute_archive_sessions(
  p_import_id uuid,
  p_policy_key text DEFAULT 'session_gap',
  p_policy_version text DEFAULT '30m-v1'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_baseline_id uuid;
  v_source_archive_sha256 char(64);
  v_import_receipt_sha256 char(64);
  v_certification_sha256 char(64);
  v_policy_definition_sha256 char(64);
  v_gap_seconds integer;
  v_exact_boundary boolean;
  v_source_message_count bigint;
  v_source_event_count bigint;
  v_excluded_count bigint;
  v_run_identity char(64);
  v_run_id uuid;
  v_result_state text;
BEGIN
  SELECT b.baseline_id,b.source_archive_sha256,i.receipt_sha256,b.certification_sha256,
         p.definition_sha256,p.inactivity_gap_seconds,p.exact_boundary_starts_new
  INTO v_baseline_id,v_source_archive_sha256,v_import_receipt_sha256,v_certification_sha256,
       v_policy_definition_sha256,v_gap_seconds,v_exact_boundary
  FROM comind.cm_conversation_history_baseline b
  JOIN comind.cm_archive_import i ON i.import_id=b.import_id
  JOIN comind.cm_archive_session_policy p ON p.policy_key=p_policy_key AND p.policy_version=p_policy_version
  WHERE b.import_id=p_import_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive sessionization requires a certified Conversation History baseline and known policy';
  END IF;

  SELECT count(*) FILTER (WHERE source_message_id IS NOT NULL),
         count(*) FILTER (WHERE source_message_id IS NOT NULL AND created_at IS NOT NULL),
         count(*) FILTER (WHERE source_message_id IS NOT NULL AND created_at IS NULL)
  INTO v_source_message_count,v_source_event_count,v_excluded_count
  FROM comind.cm_archive_node_observation WHERE import_id=p_import_id;

  v_result_state := CASE WHEN v_source_event_count=0 THEN 'no_timestamped_events' ELSE 'completed' END;
  v_run_identity := encode(extensions.digest(concat_ws('|',v_source_archive_sha256,v_import_receipt_sha256,
    v_certification_sha256,v_policy_definition_sha256),'sha256'),'hex');

  SELECT sessionization_run_id INTO v_run_id
  FROM comind.cm_archive_sessionization_run WHERE run_identity_sha256=v_run_identity;
  IF FOUND THEN RETURN v_run_id; END IF;

  INSERT INTO comind.cm_archive_sessionization_run(
    baseline_id,import_id,source_archive_sha256,import_receipt_sha256,certification_sha256,
    policy_key,policy_version,policy_definition_sha256,inactivity_gap_seconds,exact_boundary_starts_new,
    source_message_count,source_event_count,excluded_untimestamped_message_count,result_state,run_identity_sha256
  ) VALUES (
    v_baseline_id,p_import_id,v_source_archive_sha256,v_import_receipt_sha256,v_certification_sha256,
    p_policy_key,p_policy_version,v_policy_definition_sha256,v_gap_seconds,v_exact_boundary,
    v_source_message_count,v_source_event_count,v_excluded_count,v_result_state,v_run_identity
  ) ON CONFLICT (run_identity_sha256) DO NOTHING RETURNING sessionization_run_id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT sessionization_run_id INTO v_run_id FROM comind.cm_archive_sessionization_run WHERE run_identity_sha256=v_run_identity;
    RETURN v_run_id;
  END IF;
  IF v_source_event_count=0 THEN RETURN v_run_id; END IF;

  WITH projected AS (
    SELECT p.*,
      encode(extensions.digest(concat_ws('|',v_run_identity,p.event_ordinal::text,p.source_conversation_id,
        p.source_node_id,p.source_message_id,coalesce(p.normalized_message_hash::text,''),
        extract(epoch FROM p.event_at)::numeric::text,coalesce(p.role,'')),'sha256'),'hex')::char(64) AS event_identity_sha256
    FROM comind.cm_archive_session_event_projection(p_import_id,v_gap_seconds,v_exact_boundary) p
  ), session_aggregates AS (
    SELECT session_ordinal,min(event_at) AS started_at,max(event_at) AS ended_at,
      extract(epoch FROM (max(event_at)-min(event_at)))::numeric AS span_seconds,
      (array_agg(gap_from_previous_seconds ORDER BY event_ordinal))[1] AS opening_gap_seconds,
      count(*)::bigint AS event_count,count(DISTINCT source_conversation_id)::bigint AS conversation_count,
      count(*) FILTER (WHERE role='user')::bigint AS user_message_count,
      count(*) FILTER (WHERE role='assistant')::bigint AS assistant_message_count,
      count(*) FILTER (WHERE role='system')::bigint AS system_message_count,
      count(*) FILTER (WHERE role='tool')::bigint AS tool_message_count,
      (array_agg(source_conversation_id ORDER BY event_ordinal))[1] AS first_source_conversation_id,
      (array_agg(source_node_id ORDER BY event_ordinal))[1] AS first_source_node_id,
      (array_agg(source_message_id ORDER BY event_ordinal))[1] AS first_source_message_id,
      (array_agg(source_conversation_id ORDER BY event_ordinal DESC))[1] AS last_source_conversation_id,
      (array_agg(source_node_id ORDER BY event_ordinal DESC))[1] AS last_source_node_id,
      (array_agg(source_message_id ORDER BY event_ordinal DESC))[1] AS last_source_message_id,
      string_agg(event_identity_sha256,'|' ORDER BY event_ordinal) AS event_identity_sequence
    FROM projected GROUP BY session_ordinal
  )
  INSERT INTO comind.cm_archive_session_observation(
    sessionization_run_id,import_id,session_ordinal,session_identity_sha256,started_at,ended_at,span_seconds,
    opening_gap_seconds,event_count,conversation_count,user_message_count,assistant_message_count,
    system_message_count,tool_message_count,first_source_conversation_id,first_source_node_id,first_source_message_id,
    last_source_conversation_id,last_source_node_id,last_source_message_id
  )
  SELECT v_run_id,p_import_id,session_ordinal,
    encode(extensions.digest(concat_ws('|',v_run_identity,session_ordinal::text,event_identity_sequence),'sha256'),'hex'),
    started_at,ended_at,span_seconds,opening_gap_seconds,event_count,conversation_count,user_message_count,
    assistant_message_count,system_message_count,tool_message_count,first_source_conversation_id,first_source_node_id,
    first_source_message_id,last_source_conversation_id,last_source_node_id,last_source_message_id
  FROM session_aggregates ORDER BY session_ordinal;

  WITH projected AS (
    SELECT p.*,
      encode(extensions.digest(concat_ws('|',v_run_identity,p.event_ordinal::text,p.source_conversation_id,
        p.source_node_id,p.source_message_id,coalesce(p.normalized_message_hash::text,''),
        extract(epoch FROM p.event_at)::numeric::text,coalesce(p.role,'')),'sha256'),'hex')::char(64) AS event_identity_sha256
    FROM comind.cm_archive_session_event_projection(p_import_id,v_gap_seconds,v_exact_boundary) p
  )
  INSERT INTO comind.cm_archive_session_event(
    sessionization_run_id,import_id,session_ordinal,event_ordinal,source_conversation_id,source_node_id,
    source_message_id,event_at,role,gap_from_previous_seconds,event_identity_sha256
  )
  SELECT v_run_id,p_import_id,session_ordinal,event_ordinal,source_conversation_id,source_node_id,
    source_message_id,event_at,role,gap_from_previous_seconds,event_identity_sha256
  FROM projected ORDER BY event_ordinal;

  WITH buckets AS (
    SELECT 'hour_utc'::text AS grain,(date_trunc('hour',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS bucket_start_utc,
      session_ordinal,source_conversation_id,role FROM comind.cm_archive_session_event WHERE sessionization_run_id=v_run_id
    UNION ALL
    SELECT 'day_utc',(date_trunc('day',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),session_ordinal,source_conversation_id,role
      FROM comind.cm_archive_session_event WHERE sessionization_run_id=v_run_id
    UNION ALL
    SELECT 'month_utc',(date_trunc('month',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),session_ordinal,source_conversation_id,role
      FROM comind.cm_archive_session_event WHERE sessionization_run_id=v_run_id
    UNION ALL
    SELECT 'year_utc',(date_trunc('year',event_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),session_ordinal,source_conversation_id,role
      FROM comind.cm_archive_session_event WHERE sessionization_run_id=v_run_id
  ), aggregates AS (
    SELECT grain,bucket_start_utc,count(*)::bigint AS event_count,count(DISTINCT session_ordinal)::bigint AS session_count,
      count(DISTINCT source_conversation_id)::bigint AS conversation_count,
      count(*) FILTER (WHERE role='user')::bigint AS user_message_count,
      count(*) FILTER (WHERE role='assistant')::bigint AS assistant_message_count,
      count(*) FILTER (WHERE role='system')::bigint AS system_message_count,
      count(*) FILTER (WHERE role='tool')::bigint AS tool_message_count
    FROM buckets GROUP BY grain,bucket_start_utc
  )
  INSERT INTO comind.cm_archive_temporal_rollup(
    sessionization_run_id,import_id,grain,bucket_start_utc,event_count,session_count,conversation_count,
    user_message_count,assistant_message_count,system_message_count,tool_message_count,rollup_identity_sha256
  )
  SELECT v_run_id,p_import_id,grain,bucket_start_utc,event_count,session_count,conversation_count,
    user_message_count,assistant_message_count,system_message_count,tool_message_count,
    encode(extensions.digest(concat_ws('|',v_run_identity,grain,extract(epoch FROM bucket_start_utc)::numeric::text,
      event_count::text,session_count::text,conversation_count::text,user_message_count::text,assistant_message_count::text,
      system_message_count::text,tool_message_count::text),'sha256'),'hex')
  FROM aggregates ORDER BY grain,bucket_start_utc;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_archive_local_hour_distribution(
  p_sessionization_run_id uuid,
  p_timezone text
)
RETURNS TABLE(
  timezone_name text,
  local_hour integer,
  event_count bigint,
  session_count bigint,
  conversation_count bigint,
  user_message_count bigint,
  assistant_message_count bigint,
  system_message_count bigint,
  tool_message_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,comind
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=p_timezone) THEN
    RAISE EXCEPTION 'Unknown IANA timezone: %',p_timezone;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM comind.cm_archive_sessionization_run
    WHERE sessionization_run_id=p_sessionization_run_id
  ) THEN
    RAISE EXCEPTION 'Archive sessionization run does not exist';
  END IF;

  RETURN QUERY
  SELECT p_timezone,extract(hour FROM e.event_at AT TIME ZONE p_timezone)::integer,
    count(*)::bigint,count(DISTINCT e.session_ordinal)::bigint,count(DISTINCT e.source_conversation_id)::bigint,
    count(*) FILTER (WHERE e.role='user')::bigint,count(*) FILTER (WHERE e.role='assistant')::bigint,
    count(*) FILTER (WHERE e.role='system')::bigint,count(*) FILTER (WHERE e.role='tool')::bigint
  FROM comind.cm_archive_session_event e
  WHERE e.sessionization_run_id=p_sessionization_run_id
  GROUP BY extract(hour FROM e.event_at AT TIME ZONE p_timezone)
  ORDER BY 2;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_compute_archive_sessions(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_archive_local_hour_distribution(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_compute_archive_sessions(uuid,text,text)
  TO comind_conversation_history_deriver;
GRANT EXECUTE ON FUNCTION comind.cm_archive_local_hour_distribution(uuid,text)
  TO comind_conversation_history_deriver,comind_conversation_history_reader;

COMMENT ON FUNCTION comind.cm_compute_archive_sessions(uuid,text,text) IS
  'CHIST-A02 deterministic session calculator. Migration 012 reconciles reviewed repository provenance with the equivalent function form first deployed to Supabase Test.';
COMMENT ON FUNCTION comind.cm_archive_local_hour_distribution(uuid,text) IS
  'CHIST-A02 explicit-IANA-timezone hour-of-day projection. Migration 012 canonicalizes positional output ordering used in the initial Test deployment.';

COMMIT;
