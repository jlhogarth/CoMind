DO $$
DECLARE
  v_failures text[] := ARRAY[]::text[];
BEGIN
  IF NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_checkpoint','SELECT') THEN
    v_failures := array_append(v_failures,'reader lacks SELECT on archive checkpoint');
  END IF;
  IF NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_snapshot_conversation','SELECT') THEN
    v_failures := array_append(v_failures,'reader lacks SELECT on snapshot conversation');
  END IF;

  IF has_table_privilege('comind_conversation_history_reader','comind.cm_archive_checkpoint','INSERT')
     OR has_table_privilege('comind_conversation_history_reader','comind.cm_archive_checkpoint','UPDATE')
     OR has_table_privilege('comind_conversation_history_reader','comind.cm_archive_checkpoint','DELETE')
     OR has_table_privilege('comind_conversation_history_reader','comind.cm_archive_checkpoint','TRUNCATE') THEN
    v_failures := array_append(v_failures,'reader has forbidden archive checkpoint mutation privilege');
  END IF;

  IF has_table_privilege('comind_conversation_history_reader','comind.cm_archive_snapshot_conversation','INSERT')
     OR has_table_privilege('comind_conversation_history_reader','comind.cm_archive_snapshot_conversation','UPDATE')
     OR has_table_privilege('comind_conversation_history_reader','comind.cm_archive_snapshot_conversation','DELETE')
     OR has_table_privilege('comind_conversation_history_reader','comind.cm_archive_snapshot_conversation','TRUNCATE') THEN
    v_failures := array_append(v_failures,'reader has forbidden snapshot conversation mutation privilege');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_archive_checkpoint'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    v_failures := array_append(v_failures,'archive checkpoint RLS is not enabled and forced');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_archive_snapshot_conversation'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    v_failures := array_append(v_failures,'snapshot conversation RLS is not enabled and forced');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='comind' AND tablename='cm_archive_checkpoint'
      AND policyname='cm_conversation_history_reader_select'
      AND roles @> ARRAY['comind_conversation_history_reader']::name[]
      AND cmd='SELECT'
  ) THEN
    v_failures := array_append(v_failures,'archive checkpoint reader policy missing');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='comind' AND tablename='cm_archive_snapshot_conversation'
      AND policyname='cm_conversation_history_reader_select'
      AND roles @> ARRAY['comind_conversation_history_reader']::name[]
      AND cmd='SELECT'
  ) THEN
    v_failures := array_append(v_failures,'snapshot conversation reader policy missing');
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') AND (
    has_table_privilege('anon','comind.cm_archive_checkpoint','SELECT')
    OR has_table_privilege('anon','comind.cm_archive_snapshot_conversation','SELECT')
  ) THEN
    v_failures := array_append(v_failures,'anon unexpectedly reads C3 history boundary tables');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') AND (
    has_table_privilege('authenticated','comind.cm_archive_checkpoint','SELECT')
    OR has_table_privilege('authenticated','comind.cm_archive_snapshot_conversation','SELECT')
  ) THEN
    v_failures := array_append(v_failures,'authenticated unexpectedly reads C3 history boundary tables');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') AND (
    has_table_privilege('service_role','comind.cm_archive_checkpoint','SELECT')
    OR has_table_privilege('service_role','comind.cm_archive_snapshot_conversation','SELECT')
  ) THEN
    v_failures := array_append(v_failures,'service_role unexpectedly reads C3 history boundary tables');
  END IF;

  IF cardinality(v_failures) > 0 THEN
    RAISE EXCEPTION 'TK-006 history read boundary verification failed: %', array_to_string(v_failures,'; ');
  END IF;
END
$$;

SELECT 'TK-006 history reader boundary verification: PASS' AS result;
