-- CHIST-A03 scalability repair discovered on the first real 32,305-node corpus run.
-- Validate archive ancestry once, persist that derived validation evidence, then
-- materialize branch membership in bounded idempotent conversation batches.

BEGIN;
SET search_path TO comind, public;

CREATE TABLE IF NOT EXISTS comind.cm_archive_branch_validation (
  analysis_run_id uuid PRIMARY KEY
    REFERENCES comind.cm_archive_analysis_run(analysis_run_id) ON DELETE RESTRICT,
  import_id uuid NOT NULL REFERENCES comind.cm_archive_import(import_id) ON DELETE RESTRICT,
  conversation_count bigint NOT NULL CHECK (conversation_count >= 0),
  resolved_current_node_count bigint NOT NULL CHECK (resolved_current_node_count >= 0),
  missing_parent_count bigint NOT NULL CHECK (missing_parent_count >= 0),
  active_cycle_count bigint NOT NULL CHECK (active_cycle_count >= 0),
  result_state text NOT NULL CHECK (result_state IN ('valid','invalid')),
  evidence_layer text NOT NULL DEFAULT 'derived_analytical_evidence'
    CHECK (evidence_layer='derived_analytical_evidence'),
  epistemic_class text NOT NULL DEFAULT 'observed_fact'
    CHECK (epistemic_class='observed_fact'),
  validation_sha256 char(64) NOT NULL UNIQUE CHECK (validation_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_cm_archive_branch_validation_immutable
ON comind.cm_archive_branch_validation;
CREATE TRIGGER trg_cm_archive_branch_validation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_archive_branch_validation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_archive_analysis_evidence_mutation();

ALTER TABLE comind.cm_archive_branch_validation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_archive_branch_validation FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chist_a03_reader_select ON comind.cm_archive_branch_validation;
CREATE POLICY chist_a03_reader_select ON comind.cm_archive_branch_validation
FOR SELECT TO comind_conversation_history_reader USING (true);

DROP POLICY IF EXISTS chist_a03_deriver_select ON comind.cm_archive_branch_validation;
CREATE POLICY chist_a03_deriver_select ON comind.cm_archive_branch_validation
FOR SELECT TO comind_conversation_history_deriver USING (true);

DROP POLICY IF EXISTS chist_a03_deriver_insert_validation ON comind.cm_archive_branch_validation;
CREATE POLICY chist_a03_deriver_insert_validation ON comind.cm_archive_branch_validation
FOR INSERT TO comind_conversation_history_deriver WITH CHECK (true);

REVOKE ALL ON comind.cm_archive_branch_validation FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON comind.cm_archive_branch_validation FROM %I',role_name);
    END IF;
  END LOOP;
END
$$;

GRANT SELECT ON comind.cm_archive_branch_validation
TO comind_conversation_history_reader,comind_conversation_history_deriver;
GRANT INSERT ON comind.cm_archive_branch_validation
TO comind_conversation_history_deriver;

CREATE OR REPLACE FUNCTION comind.cm_validate_archive_branch_topology(p_analysis_run_id uuid)
RETURNS jsonb
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
  v_result_state text;
  v_validation_sha char(64);
  v_existing comind.cm_archive_branch_validation%ROWTYPE;
BEGIN
  SELECT import_id,result_state INTO v_import_id,v_state
  FROM comind.cm_archive_analysis_run
  WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND OR v_state <> 'building' THEN
    RAISE EXCEPTION 'analysis run must exist in building state';
  END IF;

  SELECT * INTO v_existing
  FROM comind.cm_archive_branch_validation
  WHERE analysis_run_id=p_analysis_run_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'result_state',v_existing.result_state,
      'conversation_count',v_existing.conversation_count,
      'resolved_current_node_count',v_existing.resolved_current_node_count,
      'missing_parent_count',v_existing.missing_parent_count,
      'active_cycle_count',v_existing.active_cycle_count,
      'reused_existing',true
    );
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
  SELECT count(*) INTO v_cycle_count
  FROM walk
  WHERE cycle;

  v_result_state := CASE
    WHEN v_resolved=v_conversations AND v_missing_parents=0 AND v_cycle_count=0
      THEN 'valid'
    ELSE 'invalid'
  END;

  v_validation_sha := comind.cm_archive_analysis_sha256(concat_ws('|',
    p_analysis_run_id::text,v_import_id::text,v_conversations::text,v_resolved::text,
    v_missing_parents::text,v_cycle_count::text,v_result_state
  ));

  INSERT INTO comind.cm_archive_branch_validation(
    analysis_run_id,import_id,conversation_count,resolved_current_node_count,
    missing_parent_count,active_cycle_count,result_state,validation_sha256
  ) VALUES (
    p_analysis_run_id,v_import_id,v_conversations,v_resolved,
    v_missing_parents,v_cycle_count,v_result_state,v_validation_sha
  );

  RETURN jsonb_build_object(
    'result_state',v_result_state,
    'conversation_count',v_conversations,
    'resolved_current_node_count',v_resolved,
    'missing_parent_count',v_missing_parents,
    'active_cycle_count',v_cycle_count,
    'reused_existing',false
  );
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_populate_archive_branch_membership_batch(
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
  v_validation_state text;
  v_batch_count bigint;
  v_inserted bigint;
  v_remaining bigint;
BEGIN
  IF p_batch_conversations < 1 OR p_batch_conversations > 500 THEN
    RAISE EXCEPTION 'branch batch size must be between 1 and 500 conversations';
  END IF;

  SELECT import_id,result_state INTO v_import_id,v_state
  FROM comind.cm_archive_analysis_run
  WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND OR v_state <> 'building' THEN
    RAISE EXCEPTION 'analysis run must exist in building state';
  END IF;

  SELECT result_state INTO v_validation_state
  FROM comind.cm_archive_branch_validation
  WHERE analysis_run_id=p_analysis_run_id;
  IF NOT FOUND OR v_validation_state <> 'valid' THEN
    RAISE EXCEPTION 'a valid persisted branch-topology validation is required before materialization';
  END IF;

  WITH batch AS MATERIALIZED (
    SELECT c.source_conversation_id
    FROM comind.cm_archive_conversation_observation c
    WHERE c.import_id=v_import_id
      AND NOT EXISTS (
        SELECT 1
        FROM comind.cm_archive_branch_membership m
        WHERE m.analysis_run_id=p_analysis_run_id
          AND m.source_conversation_id=c.source_conversation_id
      )
    ORDER BY c.source_conversation_id
    LIMIT p_batch_conversations
  )
  SELECT count(*) INTO v_batch_count FROM batch;

  IF v_batch_count=0 THEN
    RETURN jsonb_build_object(
      'inserted_rows',0,
      'processed_conversations',0,
      'remaining_conversations',0,
      'done',true
    );
  END IF;

  WITH RECURSIVE batch AS MATERIALIZED (
    SELECT c.source_conversation_id
    FROM comind.cm_archive_conversation_observation c
    WHERE c.import_id=v_import_id
      AND NOT EXISTS (
        SELECT 1
        FROM comind.cm_archive_branch_membership m
        WHERE m.analysis_run_id=p_analysis_run_id
          AND m.source_conversation_id=c.source_conversation_id
      )
    ORDER BY c.source_conversation_id
    LIMIT p_batch_conversations
  ), roots AS MATERIALIZED (
    SELECT c.import_id,c.source_conversation_id,c.raw_conversation->>'current_node' AS current_node
    FROM comind.cm_archive_conversation_observation c
    JOIN batch b USING (source_conversation_id)
    WHERE c.import_id=v_import_id
  ), resolved AS MATERIALIZED (
    SELECT r.import_id,r.source_conversation_id,n.source_node_id,n.parent_source_node_id
    FROM roots r
    JOIN comind.cm_archive_node_observation n
      ON n.import_id=r.import_id
     AND n.source_conversation_id=r.source_conversation_id
     AND n.source_node_id=r.current_node
  ), active(import_id,source_conversation_id,source_node_id,parent_source_node_id) AS (
    SELECT import_id,source_conversation_id,source_node_id,parent_source_node_id
    FROM resolved
    UNION ALL
    SELECT a.import_id,a.source_conversation_id,p.source_node_id,p.parent_source_node_id
    FROM active a
    JOIN comind.cm_archive_node_observation p
      ON p.import_id=a.import_id
     AND p.source_conversation_id=a.source_conversation_id
     AND p.source_node_id=a.parent_source_node_id
  ), active_distinct AS MATERIALIZED (
    SELECT DISTINCT import_id,source_conversation_id,source_node_id FROM active
  )
  INSERT INTO comind.cm_archive_branch_membership(
    analysis_run_id,import_id,source_conversation_id,source_node_id,source_message_id,source_role,
    source_created_at,branch_state,membership_sha256
  )
  SELECT p_analysis_run_id,n.import_id,n.source_conversation_id,n.source_node_id,
         n.source_message_id,n.role,n.created_at,
         CASE WHEN a.source_node_id IS NULL THEN 'alternate' ELSE 'active' END,
         comind.cm_archive_analysis_sha256(concat_ws('|',
           p_analysis_run_id::text,n.import_id::text,n.source_conversation_id,n.source_node_id,
           CASE WHEN a.source_node_id IS NULL THEN 'alternate' ELSE 'active' END
         ))
  FROM comind.cm_archive_node_observation n
  JOIN batch b USING (source_conversation_id)
  LEFT JOIN active_distinct a
    ON a.import_id=n.import_id
   AND a.source_conversation_id=n.source_conversation_id
   AND a.source_node_id=n.source_node_id
  WHERE n.import_id=v_import_id
  ON CONFLICT (analysis_run_id,source_conversation_id,source_node_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM comind.cm_archive_conversation_observation c
  WHERE c.import_id=v_import_id
    AND NOT EXISTS (
      SELECT 1
      FROM comind.cm_archive_branch_membership m
      WHERE m.analysis_run_id=p_analysis_run_id
        AND m.source_conversation_id=c.source_conversation_id
    );

  RETURN jsonb_build_object(
    'inserted_rows',v_inserted,
    'processed_conversations',v_batch_count,
    'remaining_conversations',v_remaining,
    'done',v_remaining=0
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION comind.cm_populate_archive_branch_membership(uuid)
FROM comind_conversation_history_deriver;
REVOKE ALL ON FUNCTION comind.cm_validate_archive_branch_topology(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_populate_archive_branch_membership_batch(uuid,integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION comind.cm_validate_archive_branch_topology(uuid),
  comind.cm_populate_archive_branch_membership_batch(uuid,integer)
TO comind_conversation_history_deriver;

COMMENT ON TABLE comind.cm_archive_branch_validation IS
  'CHIST-A03 immutable topology-validation evidence required before branch membership materialization.';
COMMENT ON FUNCTION comind.cm_populate_archive_branch_membership_batch(uuid,integer) IS
  'CHIST-A03 idempotent bounded branch-membership writer. Each transaction processes only previously unmaterialized conversations.';

COMMIT;
