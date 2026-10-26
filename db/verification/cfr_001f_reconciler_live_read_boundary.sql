-- CFR-001F read-only verification for comind_conversation_reconciler.
-- Safe to run in isolated/Test environments after migrations 007 through 011.

DO $$
DECLARE
  v_table text;
  v_policy_count bigint;
  v_rls_enabled boolean;
  v_role record;
BEGIN
  SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    INTO v_role
    FROM pg_roles
   WHERE rolname='comind_conversation_reconciler';
  IF NOT FOUND OR v_role.rolcanlogin OR v_role.rolinherit OR v_role.rolsuper OR v_role.rolcreatedb
     OR v_role.rolcreaterole OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'Reconciler role is missing or over-privileged: %', row_to_json(v_role);
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'cm_conversation',
    'cm_message',
    'cm_conversation_capture_event',
    'cm_assistant_generation',
    'cm_conversation_recovery_checkpoint'
  ]
  LOOP
    SELECT c.relrowsecurity
      INTO v_rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind' AND c.relname=v_table AND c.relkind IN ('r','p');

    SELECT count(*) INTO v_policy_count
      FROM pg_policies
     WHERE schemaname='comind'
       AND tablename=v_table
       AND policyname='cm_conversation_reconciler_select'
       AND roles=ARRAY['comind_conversation_reconciler']::name[]
       AND cmd='SELECT';

    IF v_rls_enabled AND v_policy_count <> 1 THEN
      RAISE EXCEPTION 'RLS-enabled table % expected one reconciler SELECT policy, found %', v_table, v_policy_count;
    ELSIF NOT v_rls_enabled AND v_policy_count <> 0 THEN
      RAISE EXCEPTION 'RLS-disabled table % must not carry an inert reconciler policy, found %', v_table, v_policy_count;
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
