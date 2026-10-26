-- CHIST-A01: governed archive-native personal analytics foundation.
-- Deterministic metrics only. Interpretive labels such as creative-hour or
-- brainstorming-streak remain separate, versioned derivations.
BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_archive_metric_definition (
  metric_key text NOT NULL,
  metric_version text NOT NULL,
  metric_scope text NOT NULL CHECK (metric_scope IN ('conversation','conversation_dimension')),
  value_kind text NOT NULL CHECK (value_kind IN ('integer','numeric','timestamp')),
  unit text,
  semantic_class text NOT NULL DEFAULT 'objective' CHECK (semantic_class IN ('objective','interpretive')),
  definition text NOT NULL CHECK (length(btrim(definition)) > 0),
  definition_sha256 char(64) NOT NULL CHECK (definition_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_key, metric_version),
  UNIQUE (definition_sha256)
);

WITH defs(metric_key,metric_version,metric_scope,value_kind,unit,semantic_class,definition) AS (
  VALUES
    ('conversation.node_count','v1','conversation','integer','nodes','objective','Count of preserved mapping nodes in the source conversation observation.'),
    ('conversation.message_count','v1','conversation','integer','messages','objective','Count of preserved source messages in the source conversation observation.'),
    ('conversation.attachment_reference_count','v1','conversation','integer','references','objective','Count of preserved message-level attachment references reported by the source conversation observation.'),
    ('conversation.active_branch_node_count','v1','conversation','integer','nodes','objective','Count of nodes on the selected active branch recorded by the deterministic archive derivation run.'),
    ('conversation.null_message_node_count','v1','conversation','integer','nodes','objective','Count of preserved mapping nodes that do not contain a source message.'),
    ('conversation.branch_point_count','v1','conversation','integer','nodes','objective','Count of preserved mapping nodes with more than one child node.'),
    ('conversation.leaf_node_count','v1','conversation','integer','nodes','objective','Count of preserved mapping nodes with zero child nodes.'),
    ('conversation.edge_count','v1','conversation','integer','edges','objective','Sum of child references across all preserved mapping nodes.'),
    ('conversation.max_graph_depth','v1','conversation','integer','levels','objective','Maximum root-to-node depth in the preserved acyclic mapping graph, with root depth equal to one.'),
    ('conversation.user_message_count','v1','conversation','integer','messages','objective','Count of preserved source messages whose role is user.'),
    ('conversation.assistant_message_count','v1','conversation','integer','messages','objective','Count of preserved source messages whose role is assistant.'),
    ('conversation.system_message_count','v1','conversation','integer','messages','objective','Count of preserved source messages whose role is system.'),
    ('conversation.tool_message_count','v1','conversation','integer','messages','objective','Count of preserved source messages whose role is tool.'),
    ('conversation.user_assistant_message_ratio','v1','conversation','numeric','ratio','objective','User message count divided by assistant message count; unsupported when assistant message count is zero.'),
    ('conversation.text_character_count','v1','conversation','integer','characters','objective','Sum of Unicode character lengths for string-valued message content parts only; non-string parts are excluded.'),
    ('conversation.text_word_count','v1','conversation','integer','words','objective','Count of non-empty whitespace-delimited tokens across string-valued message content parts only.'),
    ('conversation.question_mark_count','v1','conversation','integer','characters','objective','Count of literal question-mark characters across string-valued message content parts only.'),
    ('conversation.first_message_at','v1','conversation','timestamp','timestamp','objective','Earliest preserved created_at timestamp among nodes containing source messages.'),
    ('conversation.last_message_at','v1','conversation','timestamp','timestamp','objective','Latest preserved created_at timestamp among nodes containing source messages.'),
    ('conversation.message_span_seconds','v1','conversation','integer','seconds','objective','Whole seconds between earliest and latest preserved message timestamps; unsupported when either boundary is unavailable.'),
    ('activity.timestamped_message_count','v1','conversation','integer','messages','objective','Count of source messages with a preserved created_at timestamp.'),
    ('activity.untimestamped_message_count','v1','conversation','integer','messages','objective','Count of source messages without a preserved created_at timestamp.'),
    ('activity.message_count_by_hour_utc','v1','conversation_dimension','integer','messages','objective','Count of timestamped source messages grouped by UTC hour 0 through 23.'),
    ('activity.message_count_by_weekday_utc','v1','conversation_dimension','integer','messages','objective','Count of timestamped source messages grouped by PostgreSQL UTC day-of-week, Sunday=0 through Saturday=6.')
)
INSERT INTO comind.cm_archive_metric_definition (
  metric_key,metric_version,metric_scope,value_kind,unit,semantic_class,definition,definition_sha256
)
SELECT
  metric_key,metric_version,metric_scope,value_kind,unit,semantic_class,definition,
  encode(extensions.digest(concat_ws('|',metric_key,metric_version,metric_scope,value_kind,coalesce(unit,''),semantic_class,definition),'sha256'),'hex')
FROM defs
ON CONFLICT (metric_key,metric_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS comind.cm_archive_metric_fact (
  archive_metric_fact_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_derivation_run_id uuid NOT NULL,
  import_id uuid NOT NULL,
  source_conversation_id text NOT NULL,
  metric_key text NOT NULL,
  metric_version text NOT NULL,
  calculation_policy_version text NOT NULL CHECK (length(btrim(calculation_policy_version)) > 0),
  dimension jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dimension)='object'),
  dimension_sha256 char(64) NOT NULL CHECK (dimension_sha256 ~ '^[a-f0-9]{64}$'),
  fact_state text NOT NULL CHECK (fact_state IN ('computed','unsupported')),
  value_integer bigint,
  value_numeric numeric,
  value_timestamp timestamptz,
  unsupported_reason text,
  metric_fact_sha256 char(64) NOT NULL CHECK (metric_fact_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_archive_metric_fact_run_scope_fk
    FOREIGN KEY (archive_derivation_run_id,import_id,source_conversation_id)
    REFERENCES comind.cm_archive_derivation_run(archive_derivation_run_id,import_id,source_conversation_id)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_metric_fact_definition_fk
    FOREIGN KEY (metric_key,metric_version)
    REFERENCES comind.cm_archive_metric_definition(metric_key,metric_version)
    ON DELETE RESTRICT,
  CONSTRAINT cm_archive_metric_fact_value_state CHECK (
    (fact_state='computed' AND num_nonnulls(value_integer,value_numeric,value_timestamp)=1 AND unsupported_reason IS NULL)
    OR
    (fact_state='unsupported' AND num_nonnulls(value_integer,value_numeric,value_timestamp)=0 AND unsupported_reason IS NOT NULL AND length(btrim(unsupported_reason))>0)
  ),
  CONSTRAINT cm_archive_metric_fact_identity UNIQUE (
    archive_derivation_run_id,metric_key,metric_version,dimension_sha256
  ),
  CONSTRAINT cm_archive_metric_fact_hash_unique UNIQUE (archive_derivation_run_id,metric_fact_sha256)
);

CREATE INDEX IF NOT EXISTS idx_cm_archive_metric_fact_conversation
  ON comind.cm_archive_metric_fact(import_id,source_conversation_id,metric_key,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cm_archive_metric_fact_run
  ON comind.cm_archive_metric_fact(archive_derivation_run_id);
CREATE INDEX IF NOT EXISTS idx_cm_archive_metric_fact_definition
  ON comind.cm_archive_metric_fact(metric_key,metric_version);

DROP TRIGGER IF EXISTS trg_cm_archive_metric_definition_immutable ON comind.cm_archive_metric_definition;
CREATE TRIGGER trg_cm_archive_metric_definition_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_metric_definition
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();

DROP TRIGGER IF EXISTS trg_cm_archive_metric_fact_immutable ON comind.cm_archive_metric_fact;
CREATE TRIGGER trg_cm_archive_metric_fact_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_metric_fact
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_conversation_derivation_mutation();

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
    coalesce(p_value_timestamp::text,''),
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

CREATE OR REPLACE FUNCTION comind.cm_compute_archive_conversation_metrics(
  p_archive_derivation_run_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,comind,extensions
AS $$
DECLARE
  v_run record;
  v_conv record;
  v_null_message_count bigint;
  v_branch_point_count bigint;
  v_leaf_count bigint;
  v_edge_count bigint;
  v_max_depth bigint;
  v_user_count bigint;
  v_assistant_count bigint;
  v_system_count bigint;
  v_tool_count bigint;
  v_timestamped_count bigint;
  v_untimestamped_count bigint;
  v_text_character_count bigint;
  v_text_word_count bigint;
  v_question_mark_count bigint;
  v_first_message_at timestamptz;
  v_last_message_at timestamptz;
  v_inserted integer := 0;
  v_bucket integer;
  v_bucket_count bigint;
BEGIN
  SELECT archive_derivation_run_id,import_id,source_conversation_id,policy_version,engine_kind,
         active_branch_node_count
    INTO v_run
    FROM comind.cm_archive_derivation_run
   WHERE archive_derivation_run_id=p_archive_derivation_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive metric computation requires an existing archive derivation run';
  END IF;
  IF v_run.engine_kind <> 'deterministic' THEN
    RAISE EXCEPTION 'CHIST-A01 v1 accepts deterministic archive derivation runs only';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM comind.cm_conversation_history_baseline b WHERE b.import_id=v_run.import_id
  ) THEN
    RAISE EXCEPTION 'Archive metric computation requires a certified Conversation History baseline';
  END IF;

  SELECT node_count,message_count,attachment_reference_count
    INTO v_conv
    FROM comind.cm_archive_conversation_observation
   WHERE import_id=v_run.import_id AND source_conversation_id=v_run.source_conversation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Archive metric source conversation does not exist';
  END IF;

  SELECT
    count(*) FILTER (WHERE source_message_id IS NULL),
    count(*) FILTER (WHERE jsonb_array_length(child_source_node_ids)>1),
    count(*) FILTER (WHERE jsonb_array_length(child_source_node_ids)=0),
    coalesce(sum(jsonb_array_length(child_source_node_ids)),0),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND role='user'),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND role='assistant'),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND role='system'),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND role='tool'),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND created_at IS NOT NULL),
    count(*) FILTER (WHERE source_message_id IS NOT NULL AND created_at IS NULL),
    min(created_at) FILTER (WHERE source_message_id IS NOT NULL),
    max(created_at) FILTER (WHERE source_message_id IS NOT NULL)
  INTO
    v_null_message_count,v_branch_point_count,v_leaf_count,v_edge_count,
    v_user_count,v_assistant_count,v_system_count,v_tool_count,
    v_timestamped_count,v_untimestamped_count,v_first_message_at,v_last_message_at
  FROM comind.cm_archive_node_observation
  WHERE import_id=v_run.import_id AND source_conversation_id=v_run.source_conversation_id;

  WITH RECURSIVE graph AS (
    SELECT source_node_id,1::bigint AS depth
      FROM comind.cm_archive_node_observation
     WHERE import_id=v_run.import_id
       AND source_conversation_id=v_run.source_conversation_id
       AND parent_source_node_id IS NULL
    UNION ALL
    SELECT n.source_node_id,g.depth+1
      FROM comind.cm_archive_node_observation n
      JOIN graph g ON n.parent_source_node_id=g.source_node_id
     WHERE n.import_id=v_run.import_id
       AND n.source_conversation_id=v_run.source_conversation_id
  )
  SELECT max(depth) INTO v_max_depth FROM graph;

  WITH text_parts AS (
    SELECT part.value #>> '{}' AS text_value
      FROM comind.cm_archive_node_observation n
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(n.raw_node #> '{message,content,parts}')='array'
          THEN n.raw_node #> '{message,content,parts}'
          ELSE '[]'::jsonb
        END
      ) AS part(value)
     WHERE n.import_id=v_run.import_id
       AND n.source_conversation_id=v_run.source_conversation_id
       AND n.source_message_id IS NOT NULL
       AND jsonb_typeof(part.value)='string'
  ), text_stats AS (
    SELECT
      coalesce(sum(length(text_value)),0)::bigint AS char_count,
      coalesce(sum((SELECT count(*) FROM regexp_split_to_table(btrim(text_value),E'\\s+') token WHERE token<>'')),0)::bigint AS word_count,
      coalesce(sum(length(text_value)-length(replace(text_value,'?',''))),0)::bigint AS question_count
    FROM text_parts
  )
  SELECT char_count,word_count,question_count
    INTO v_text_character_count,v_text_word_count,v_question_mark_count
    FROM text_stats;

  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.node_count','v1','{}','computed',v_conv.node_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.message_count','v1','{}','computed',v_conv.message_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.attachment_reference_count','v1','{}','computed',v_conv.attachment_reference_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.active_branch_node_count','v1','{}','computed',v_run.active_branch_node_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.null_message_node_count','v1','{}','computed',v_null_message_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.branch_point_count','v1','{}','computed',v_branch_point_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.leaf_node_count','v1','{}','computed',v_leaf_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.edge_count','v1','{}','computed',v_edge_count) THEN v_inserted:=v_inserted+1; END IF;
  IF v_max_depth IS NULL THEN
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.max_graph_depth','v1','{}','unsupported',NULL,NULL,NULL,'No graph root with a computable depth was preserved.') THEN v_inserted:=v_inserted+1; END IF;
  ELSE
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.max_graph_depth','v1','{}','computed',v_max_depth) THEN v_inserted:=v_inserted+1; END IF;
  END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.user_message_count','v1','{}','computed',v_user_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.assistant_message_count','v1','{}','computed',v_assistant_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.system_message_count','v1','{}','computed',v_system_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.tool_message_count','v1','{}','computed',v_tool_count) THEN v_inserted:=v_inserted+1; END IF;
  IF v_assistant_count=0 THEN
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.user_assistant_message_ratio','v1','{}','unsupported',NULL,NULL,NULL,'Assistant message count is zero.') THEN v_inserted:=v_inserted+1; END IF;
  ELSE
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.user_assistant_message_ratio','v1','{}','computed',NULL,v_user_count::numeric/v_assistant_count::numeric) THEN v_inserted:=v_inserted+1; END IF;
  END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.text_character_count','v1','{}','computed',v_text_character_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.text_word_count','v1','{}','computed',v_text_word_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.question_mark_count','v1','{}','computed',v_question_mark_count) THEN v_inserted:=v_inserted+1; END IF;
  IF v_first_message_at IS NULL THEN
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.first_message_at','v1','{}','unsupported',NULL,NULL,NULL,'No preserved message timestamp is available.') THEN v_inserted:=v_inserted+1; END IF;
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.last_message_at','v1','{}','unsupported',NULL,NULL,NULL,'No preserved message timestamp is available.') THEN v_inserted:=v_inserted+1; END IF;
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.message_span_seconds','v1','{}','unsupported',NULL,NULL,NULL,'Message timestamp boundaries are unavailable.') THEN v_inserted:=v_inserted+1; END IF;
  ELSE
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.first_message_at','v1','{}','computed',NULL,NULL,v_first_message_at) THEN v_inserted:=v_inserted+1; END IF;
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.last_message_at','v1','{}','computed',NULL,NULL,v_last_message_at) THEN v_inserted:=v_inserted+1; END IF;
    IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'conversation.message_span_seconds','v1','{}','computed',extract(epoch FROM (v_last_message_at-v_first_message_at))::bigint) THEN v_inserted:=v_inserted+1; END IF;
  END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'activity.timestamped_message_count','v1','{}','computed',v_timestamped_count) THEN v_inserted:=v_inserted+1; END IF;
  IF comind.cm_insert_archive_metric_fact(p_archive_derivation_run_id,'activity.untimestamped_message_count','v1','{}','computed',v_untimestamped_count) THEN v_inserted:=v_inserted+1; END IF;

  FOR v_bucket,v_bucket_count IN
    SELECT extract(hour FROM created_at AT TIME ZONE 'UTC')::integer,count(*)::bigint
      FROM comind.cm_archive_node_observation
     WHERE import_id=v_run.import_id AND source_conversation_id=v_run.source_conversation_id
       AND source_message_id IS NOT NULL AND created_at IS NOT NULL
     GROUP BY 1 ORDER BY 1
  LOOP
    IF comind.cm_insert_archive_metric_fact(
      p_archive_derivation_run_id,'activity.message_count_by_hour_utc','v1',jsonb_build_object('hour_utc',v_bucket),'computed',v_bucket_count
    ) THEN v_inserted:=v_inserted+1; END IF;
  END LOOP;

  FOR v_bucket,v_bucket_count IN
    SELECT extract(dow FROM created_at AT TIME ZONE 'UTC')::integer,count(*)::bigint
      FROM comind.cm_archive_node_observation
     WHERE import_id=v_run.import_id AND source_conversation_id=v_run.source_conversation_id
       AND source_message_id IS NOT NULL AND created_at IS NOT NULL
     GROUP BY 1 ORDER BY 1
  LOOP
    IF comind.cm_insert_archive_metric_fact(
      p_archive_derivation_run_id,'activity.message_count_by_weekday_utc','v1',jsonb_build_object('weekday_utc',v_bucket),'computed',v_bucket_count
    ) THEN v_inserted:=v_inserted+1; END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

ALTER TABLE comind.cm_archive_metric_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_metric_definition FORCE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_metric_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_metric_fact FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_metric_definition;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_metric_definition
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_metric_definition;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_metric_definition
FOR SELECT TO comind_conversation_history_reader USING (true);
DROP POLICY IF EXISTS cm_history_deriver_select ON comind.cm_archive_metric_fact;
CREATE POLICY cm_history_deriver_select ON comind.cm_archive_metric_fact
FOR SELECT TO comind_conversation_history_deriver USING (true);
DROP POLICY IF EXISTS cm_history_reader_select ON comind.cm_archive_metric_fact;
CREATE POLICY cm_history_reader_select ON comind.cm_archive_metric_fact
FOR SELECT TO comind_conversation_history_reader
USING (EXISTS (
  SELECT 1 FROM comind.cm_conversation_history_baseline b
  WHERE b.import_id=cm_archive_metric_fact.import_id
));

REVOKE ALL ON TABLE comind.cm_archive_metric_definition,comind.cm_archive_metric_fact FROM PUBLIC;
DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role','comind_archive_ingestor','comind_conversation_reconciler','comind_conversation_deriver','comind_conversation_history_certifier'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_metric_definition FROM %I',v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_metric_fact FROM %I',v_role);
    END IF;
  END LOOP;
END
$$;

GRANT SELECT ON TABLE comind.cm_archive_metric_definition,comind.cm_archive_metric_fact
  TO comind_conversation_history_deriver,comind_conversation_history_reader;

REVOKE ALL ON FUNCTION comind.cm_insert_archive_metric_fact(uuid,text,text,jsonb,text,bigint,numeric,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_compute_archive_conversation_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_compute_archive_conversation_metrics(uuid)
  TO comind_conversation_history_deriver;

COMMENT ON TABLE comind.cm_archive_metric_definition IS
  'CHIST-A01 immutable versioned metric definitions. Interpretive labels require separate definitions and derivation policy.';
COMMENT ON TABLE comind.cm_archive_metric_fact IS
  'CHIST-A01 immutable deterministic metric facts derived from certified archive evidence and linked to an archive derivation run.';
COMMENT ON FUNCTION comind.cm_compute_archive_conversation_metrics(uuid) IS
  'CHIST-A01 deterministic archive conversation metric calculator. Inputs are read from a certified archive derivation run; callers cannot submit metric values.';

COMMIT;
