-- Verification for TK-007 C4 operational event and runtime-role substrate.
DO $$
DECLARE
  runtime_attrs record;
  policy_count int;
  target_table text;
BEGIN
  IF to_regclass('comind.cm_threadkeeper_operation_event') IS NULL THEN
    RAISE EXCEPTION 'Missing comind.cm_threadkeeper_operation_event';
  END IF;
  IF to_regclass('comind.v_threadkeeper_operation_status') IS NULL THEN
    RAISE EXCEPTION 'Missing comind.v_threadkeeper_operation_status';
  END IF;

  SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    INTO runtime_attrs
    FROM pg_roles
   WHERE rolname='comind_threadkeeper_runtime';
  IF runtime_attrs IS NULL THEN
    RAISE EXCEPTION 'Missing comind_threadkeeper_runtime role';
  END IF;
  IF runtime_attrs.rolcanlogin OR runtime_attrs.rolinherit OR runtime_attrs.rolsuper
     OR runtime_attrs.rolcreatedb OR runtime_attrs.rolcreaterole
     OR runtime_attrs.rolreplication OR runtime_attrs.rolbypassrls THEN
    RAISE EXCEPTION 'comind_threadkeeper_runtime has prohibited role attributes';
  END IF;

  FOREACH target_table IN ARRAY ARRAY[
    'cm_threadkeeper_scope',
    'cm_threadkeeper_checkpoint',
    'cm_threadkeeper_assessment',
    'cm_threadkeeper_case',
    'cm_threadkeeper_case_transition',
    'cm_threadkeeper_operation_event'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='comind' AND c.relname=target_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS not enabled for comind.%', target_table;
    END IF;

    SELECT count(*)::int INTO policy_count
      FROM pg_policies
     WHERE schemaname='comind' AND tablename=target_table
       AND policyname IN ('threadkeeper_runtime_select','threadkeeper_runtime_insert')
       AND roles @> ARRAY['comind_threadkeeper_runtime']::name[];
    IF policy_count <> 2 THEN
      RAISE EXCEPTION 'Expected two ThreadKeeper runtime policies on %, found %', target_table, policy_count;
    END IF;

    IF NOT has_table_privilege('comind_threadkeeper_runtime', format('comind.%I',target_table), 'SELECT')
       OR NOT has_table_privilege('comind_threadkeeper_runtime', format('comind.%I',target_table), 'INSERT') THEN
      RAISE EXCEPTION 'ThreadKeeper runtime lacks SELECT/INSERT on %', target_table;
    END IF;
    IF has_table_privilege('comind_threadkeeper_runtime', format('comind.%I',target_table), 'UPDATE')
       OR has_table_privilege('comind_threadkeeper_runtime', format('comind.%I',target_table), 'DELETE')
       OR has_table_privilege('comind_threadkeeper_runtime', format('comind.%I',target_table), 'TRUNCATE') THEN
      RAISE EXCEPTION 'ThreadKeeper runtime has prohibited mutation privilege on %', target_table;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('comind_threadkeeper_runtime','comind.v_threadkeeper_operation_status','SELECT') THEN
    RAISE EXCEPTION 'ThreadKeeper runtime lacks operation-status view access';
  END IF;

  IF has_table_privilege('anon','comind.cm_threadkeeper_operation_event','SELECT')
     OR has_table_privilege('authenticated','comind.cm_threadkeeper_operation_event','SELECT')
     OR has_table_privilege('anon','comind.cm_threadkeeper_operation_event','INSERT')
     OR has_table_privilege('authenticated','comind.cm_threadkeeper_operation_event','INSERT') THEN
    RAISE EXCEPTION 'Ordinary Data API roles can access ThreadKeeper operational evidence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_threadkeeper_operation_event'
      AND t.tgname='trg_cm_threadkeeper_operation_event_validate' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Missing ThreadKeeper operation validation trigger';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_threadkeeper_operation_event'
      AND t.tgname='trg_cm_threadkeeper_operation_event_immutable' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Missing ThreadKeeper operation immutability trigger';
  END IF;
END
$$;

SELECT 'TK-007 C4 operational event security substrate verified' AS verification_result;
