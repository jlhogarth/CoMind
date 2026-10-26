\set ON_ERROR_STOP on

DO $$
DECLARE
  target_table text;
  table_count integer;
  bad_rls_count integer;
  service_bypass boolean;
BEGIN
  SELECT count(*)
    INTO table_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='comind'
     AND c.relkind='r'
     AND c.relname IN (
       'cm_threadkeeper_scope',
       'cm_threadkeeper_checkpoint',
       'cm_threadkeeper_assessment',
       'cm_threadkeeper_case',
       'cm_threadkeeper_case_transition'
     );
  IF table_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 ThreadKeeper tables, found %', table_count;
  END IF;

  SELECT count(*)
    INTO bad_rls_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='comind'
     AND c.relname IN (
       'cm_threadkeeper_scope',
       'cm_threadkeeper_checkpoint',
       'cm_threadkeeper_assessment',
       'cm_threadkeeper_case',
       'cm_threadkeeper_case_transition'
     )
     AND NOT c.relrowsecurity;
  IF bad_rls_count <> 0 THEN
    RAISE EXCEPTION 'ThreadKeeper tables without RLS: %', bad_rls_count;
  END IF;

  SELECT rolbypassrls INTO service_bypass FROM pg_roles WHERE rolname='service_role';
  IF service_bypass IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'service_role must retain BYPASSRLS for the policy-free private ThreadKeeper tables';
  END IF;

  FOREACH target_table IN ARRAY ARRAY[
    'cm_threadkeeper_scope',
    'cm_threadkeeper_checkpoint',
    'cm_threadkeeper_assessment',
    'cm_threadkeeper_case',
    'cm_threadkeeper_case_transition'
  ]
  LOOP
    IF NOT has_table_privilege('service_role', format('comind.%I', target_table), 'SELECT')
       OR NOT has_table_privilege('service_role', format('comind.%I', target_table), 'INSERT') THEN
      RAISE EXCEPTION 'service_role lacks required SELECT/INSERT on %', target_table;
    END IF;
    IF has_table_privilege('service_role', format('comind.%I', target_table), 'UPDATE')
       OR has_table_privilege('service_role', format('comind.%I', target_table), 'DELETE')
       OR has_table_privilege('service_role', format('comind.%I', target_table), 'TRUNCATE') THEN
      RAISE EXCEPTION 'service_role has prohibited mutation privilege on %', target_table;
    END IF;
    IF has_table_privilege('anon', format('comind.%I', target_table), 'SELECT')
       OR has_table_privilege('anon', format('comind.%I', target_table), 'INSERT')
       OR has_table_privilege('anon', format('comind.%I', target_table), 'UPDATE')
       OR has_table_privilege('anon', format('comind.%I', target_table), 'DELETE')
       OR has_table_privilege('anon', format('comind.%I', target_table), 'TRUNCATE')
       OR has_table_privilege('authenticated', format('comind.%I', target_table), 'SELECT')
       OR has_table_privilege('authenticated', format('comind.%I', target_table), 'INSERT')
       OR has_table_privilege('authenticated', format('comind.%I', target_table), 'UPDATE')
       OR has_table_privilege('authenticated', format('comind.%I', target_table), 'DELETE')
       OR has_table_privilege('authenticated', format('comind.%I', target_table), 'TRUNCATE') THEN
      RAISE EXCEPTION 'client role has ThreadKeeper table privilege on %', target_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM pg_policy p
      JOIN pg_class c ON c.oid=p.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind' AND c.relname LIKE 'cm_threadkeeper_%'
  ) THEN
    RAISE EXCEPTION 'ThreadKeeper C2 private tables should not expose RLS policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='comind' AND indexname='uq_cm_threadkeeper_checkpoint_root'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='comind' AND indexname='uq_cm_threadkeeper_checkpoint_successor'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='comind' AND indexname='uq_cm_threadkeeper_transition_root'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='comind' AND indexname='uq_cm_threadkeeper_transition_successor'
  ) THEN
    RAISE EXCEPTION 'ThreadKeeper linear-lineage unique indexes are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind'
       AND c.relname='cm_threadkeeper_case_transition'
       AND t.tgname='trg_cm_threadkeeper_transition_validate'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'ThreadKeeper case-transition validation trigger is missing';
  END IF;

  SELECT count(*)
    INTO table_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='comind'
     AND c.relname IN (
       'cm_threadkeeper_scope',
       'cm_threadkeeper_checkpoint',
       'cm_threadkeeper_assessment',
       'cm_threadkeeper_case',
       'cm_threadkeeper_case_transition'
     )
     AND t.tgname LIKE 'trg_cm_threadkeeper_%_immutable'
     AND NOT t.tgisinternal;
  IF table_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 ThreadKeeper immutability triggers, found %', table_count;
  END IF;

  IF NOT has_sequence_privilege('service_role', 'comind.cm_threadkeeper_checkpoint_persistence_seq_seq', 'USAGE')
     OR NOT has_sequence_privilege('service_role', 'comind.cm_threadkeeper_assessment_persistence_seq_seq', 'USAGE')
     OR NOT has_sequence_privilege('service_role', 'comind.cm_threadkeeper_case_transition_persistence_seq_seq', 'USAGE') THEN
    RAISE EXCEPTION 'service_role lacks required ThreadKeeper identity-sequence usage';
  END IF;
END;
$$;

SELECT 'ThreadKeeper persistence verification passed' AS result;
