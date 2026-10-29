-- CHIST-A03 follow-up hardening: fail closed on missing parents or parent cycles.
-- Issue: https://github.com/jlhogarth/CoMind/issues/304

BEGIN;
SET search_path TO comind, public, extensions;

CREATE OR REPLACE FUNCTION comind.cm_populate_archive_branch_membership(p_analysis_run_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=pg_catalog,comind,extensions
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
         encode(extensions.digest(concat_ws('|',p_analysis_run_id::text,n.import_id::text,
           n.source_conversation_id,n.source_node_id,
           CASE WHEN a.source_node_id IS NULL THEN 'alternate' ELSE 'active' END),'sha256'),'hex')
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

REVOKE ALL ON FUNCTION comind.cm_populate_archive_branch_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_populate_archive_branch_membership(uuid)
TO comind_conversation_history_deriver;

COMMIT;
