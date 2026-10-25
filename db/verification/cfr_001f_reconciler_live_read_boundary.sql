-- CFR-001F read-only verification for comind_conversation_reconciler.
-- Safe to run in isolated/Test environments after migrations 007 and 008.

DO $$
DECLARE
  v_table text;
  v_policy_count bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_conversation',
    'cm_message',
    'cm_conversation_capture_event',
    'cm_assistant_generation',
    'cm_conversation_recovery_checkpoint'
  ]
  LOOP
    SELECT count(*) INTO v_policy_count
      FROM pg_policies
     WHERE schemaname='comind'
       AND tablename=v_table
       AND policyname='cm_conversation_reconciler_select'
       AND roles=ARRAY['comind_conversation_reconciler']::name[]
       AND cmd='SELECT';
    IF v_policy_count <> 1 THEN
      RAISE EXCEPTION 'Expected one reconciler SELECT policy on %, found %', v_table, v_policy_count;
    END IF;
  END LOOP;
END;
$$;

SET ROLE comind_conversation_reconciler;

DO $$
DECLARE
  v_count bigint;
  v_mutation_blocked boolean := false;
BEGIN
  SELECT count(*) INTO v_count FROM comind.cm_conversation;
  SELECT count(*) INTO v_count FROM comind.cm_message;
  SELECT count(*) INTO v_count FROM comind.cm_conversation_capture_event;
  SELECT count(*) INTO v_count FROM comind.cm_assistant_generation;
  SELECT count(*) INTO v_count FROM comind.cm_conversation_recovery_checkpoint;
  SELECT count(*) INTO v_count FROM comind.cm_archive_source;
  SELECT count(*) INTO v_count FROM comind.cm_archive_import;
  SELECT count(*) INTO v_count FROM comind.cm_archive_conversation_observation;
  SELECT count(*) INTO v_count FROM comind.cm_archive_node_observation;

  BEGIN
    INSERT INTO comind.cm_message (conv_id, role, content)
    VALUES (NULL, 'user', 'reconciler must not write source evidence');
  EXCEPTION WHEN insufficient_privilege THEN
    v_mutation_blocked := true;
  END;

  IF NOT v_mutation_blocked THEN
    RAISE EXCEPTION 'Reconciler unexpectedly mutated live source evidence';
  END IF;
END;
$$;

RESET ROLE;

SELECT 'PASS' AS cfr_001f_reconciler_live_read_boundary;
