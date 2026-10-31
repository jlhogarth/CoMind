-- CHIST-A01: make metric-fact identity independent of session timezone.
BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_insert_archive_metric_fact(
  p_archive_derivation_run_id uuid,
  p_metric_key text,
  p_metric_version text,
  p_dimension jsonb,
  p_fact_state text,
  p_value_integer bigint DEFAULT NULL,
  p_value_numeric numeric DEFAULT NULL,
  p_value_timestamp timestamptz DEFAULT NULL,
  p_unsupported_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_run record;
  v_definition_sha256 char(64);
  v_dimension jsonb := coalesce(p_dimension,'{}'::jsonb);
  v_dimension_sha256 char(64);
  v_timestamp_identity text;
  v_fact_sha256 char(64);
BEGIN
  SELECT import_id,source_conversation_id,policy_version,source_snapshot_sha256,
         archive_normalized_hash,archive_topology_hash,engine_kind
    INTO v_run
    FROM comind.cm_archive_derivation_run
   WHERE archive_derivation_run_id=p_archive_derivation_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive metric fact requires an existing archive derivation run';
  END IF;
  IF v_run.engine_kind <> 'deterministic' THEN
    RAISE EXCEPTION 'CHIST-A01 v1 accepts deterministic archive derivation runs only';
  END IF;

  SELECT definition_sha256 INTO v_definition_sha256
    FROM comind.cm_archive_metric_definition
   WHERE metric_key=p_metric_key AND metric_version=p_metric_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown archive metric definition %.%',p_metric_key,p_metric_version;
  END IF;

  v_dimension_sha256 := encode(extensions.digest(v_dimension::text,'sha256'),'hex');
  v_timestamp_identity := CASE
    WHEN p_value_timestamp IS NULL THEN ''
    ELSE extract(epoch FROM p_value_timestamp)::numeric::text
  END;

  v_fact_sha256 := encode(extensions.digest(concat_ws('|',
    v_run.source_snapshot_sha256,
    v_run.archive_normalized_hash,
    v_run.archive_topology_hash,
    v_definition_sha256,
    v_run.policy_version,
    v_dimension::text,
    p_fact_state,
    coalesce(p_value_integer::text,''),
    coalesce(p_value_numeric::text,''),
    v_timestamp_identity,
    coalesce(p_unsupported_reason,'')
  ),'sha256'),'hex');

  INSERT INTO comind.cm_archive_metric_fact (
    archive_derivation_run_id,import_id,source_conversation_id,
    metric_key,metric_version,calculation_policy_version,
    dimension,dimension_sha256,fact_state,
    value_integer,value_numeric,value_timestamp,unsupported_reason,metric_fact_sha256
  ) VALUES (
    p_archive_derivation_run_id,v_run.import_id,v_run.source_conversation_id,
    p_metric_key,p_metric_version,v_run.policy_version,
    v_dimension,v_dimension_sha256,p_fact_state,
    p_value_integer,p_value_numeric,p_value_timestamp,p_unsupported_reason,v_fact_sha256
  )
  ON CONFLICT (archive_derivation_run_id,metric_key,metric_version,dimension_sha256) DO NOTHING;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_insert_archive_metric_fact(uuid,text,text,jsonb,text,bigint,numeric,timestamptz,text) FROM PUBLIC;

COMMENT ON FUNCTION comind.cm_insert_archive_metric_fact(uuid,text,text,jsonb,text,bigint,numeric,timestamptz,text) IS
  'CHIST-A01 internal deterministic metric-fact writer. Timestamp identity is normalized to epoch seconds so hashes do not depend on session timezone.';

COMMIT;
