-- CHIST-002 / Issue #250: read-only verification for checkpointed differential ingestion.
-- Safe to run against CoMind Test after migrations 20261027_002 and 20261027_003.

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(required, ', ' ORDER BY required)
    INTO v_missing
    FROM unnest(ARRAY[
      'cm_archive_stream',
      'cm_archive_checkpoint',
      'cm_archive_snapshot_conversation',
      'cm_archive_snapshot_node'
    ]) required
   WHERE to_regclass(format('comind.%I', required)) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CHIST-002 missing differential tables: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema='comind'
       AND table_name='cm_archive_import'
       AND column_name='import_mode'
  ) THEN
    RAISE EXCEPTION 'CHIST-002 cm_archive_import.import_mode is missing';
  END IF;
END
$$;

DO $$
DECLARE
  v_mode_check text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_mode_check
    FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='comind'
     AND t.relname='cm_archive_import'
     AND c.conname='cm_archive_import_mode_check';
  IF v_mode_check IS NULL
     OR position('full_snapshot' in v_mode_check)=0
     OR position('differential' in v_mode_check)=0 THEN
    RAISE EXCEPTION 'CHIST-002 import_mode constraint is incomplete: %', v_mode_check;
  END IF;
END
$$;

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(required, ', ' ORDER BY required)
    INTO v_missing
    FROM unnest(ARRAY[
      'cm_archive_checkpoint_sequence',
      'cm_archive_checkpoint_shape'
    ]) required
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_constraint c
       JOIN pg_class t ON t.oid=c.conrelid
       JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='comind'
        AND t.relname='cm_archive_checkpoint'
        AND c.conname=required
   );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CHIST-002 missing checkpoint constraints: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='comind'
       AND tablename='cm_archive_checkpoint'
       AND indexname='idx_cm_archive_checkpoint_latest'
  ) THEN
    RAISE EXCEPTION 'CHIST-002 latest-checkpoint index is missing';
  END IF;
END
$$;

DO $$
DECLARE
  v_table text;
  v_rls boolean;
  v_force boolean;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_stream',
    'cm_archive_checkpoint',
    'cm_archive_snapshot_conversation',
    'cm_archive_snapshot_node'
  ] LOOP
    SELECT c.relrowsecurity,c.relforcerowsecurity
      INTO v_rls,v_force
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind' AND c.relname=v_table;
    IF NOT coalesce(v_rls,false) OR NOT coalesce(v_force,false) THEN
      RAISE EXCEPTION 'CHIST-002 RLS is not enabled and forced on comind.%', v_table;
    END IF;

    IF NOT has_table_privilege('comind_archive_ingestor',format('comind.%I',v_table),'SELECT')
       OR NOT has_table_privilege('comind_archive_ingestor',format('comind.%I',v_table),'INSERT') THEN
      RAISE EXCEPTION 'CHIST-002 archive ingestor lacks bounded SELECT/INSERT on comind.%', v_table;
    END IF;
    IF has_table_privilege('comind_archive_ingestor',format('comind.%I',v_table),'UPDATE')
       OR has_table_privilege('comind_archive_ingestor',format('comind.%I',v_table),'DELETE')
       OR has_table_privilege('comind_archive_ingestor',format('comind.%I',v_table),'TRUNCATE') THEN
      RAISE EXCEPTION 'CHIST-002 archive ingestor has destructive/mutation authority on comind.%', v_table;
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','SELECT') THEN
    RAISE EXCEPTION 'CHIST-002 archive ingestor cannot inspect the certified baseline anchor';
  END IF;
  IF has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','INSERT')
     OR has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','UPDATE')
     OR has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','DELETE')
     OR has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','TRUNCATE') THEN
    RAISE EXCEPTION 'CHIST-002 archive ingestor can mutate baseline certification evidence';
  END IF;
END
$$;

DO $$
DECLARE
  v_checkpoint_guard text;
  v_lineage_guard text;
BEGIN
  IF to_regprocedure('comind.cm_guard_archive_checkpoint_insert()') IS NULL THEN
    RAISE EXCEPTION 'CHIST-002 checkpoint guard function is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger tr
      JOIN pg_class t ON t.oid=tr.tgrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='comind'
       AND t.relname='cm_archive_checkpoint'
       AND tr.tgname='trg_cm_archive_checkpoint_guard'
       AND NOT tr.tgisinternal
  ) THEN
    RAISE EXCEPTION 'CHIST-002 checkpoint guard trigger is missing';
  END IF;

  SELECT pg_get_functiondef('comind.cm_guard_archive_checkpoint_insert()'::regprocedure)
    INTO v_checkpoint_guard;
  IF position('checkpoint must extend the latest accepted predecessor' in v_checkpoint_guard)=0
     OR position('parser/schema/hash version mismatch requires reviewed reprocessing' in v_checkpoint_guard)=0 THEN
    RAISE EXCEPTION 'CHIST-002 checkpoint guard is missing chain/version fail-closed behavior';
  END IF;

  SELECT pg_get_functiondef('comind.cm_guard_archive_import_lineage()'::regprocedure)
    INTO v_lineage_guard;
  IF position('NEW.import_mode := v_predecessor.import_mode' in v_lineage_guard)=0 THEN
    RAISE EXCEPTION 'CHIST-002 recovery lineage does not preserve differential import_mode';
  END IF;
END
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_stream',
    'cm_archive_checkpoint',
    'cm_archive_snapshot_conversation',
    'cm_archive_snapshot_node'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_trigger tr
        JOIN pg_class t ON t.oid=tr.tgrelid
        JOIN pg_namespace n ON n.oid=t.relnamespace
       WHERE n.nspname='comind'
         AND t.relname=v_table
         AND NOT tr.tgisinternal
         AND tr.tgname LIKE '%immutable%'
    ) THEN
      RAISE EXCEPTION 'CHIST-002 immutable trigger is missing on comind.%', v_table;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  v_severity_check text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_severity_check
    FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='comind'
     AND t.relname='cm_archive_parser_event'
     AND c.conname='cm_archive_parser_event_severity_check';
  IF v_severity_check IS NULL OR position('INFO' in v_severity_check)=0 THEN
    RAISE EXCEPTION 'CHIST-002 parser event severity contract does not include INFO: %', v_severity_check;
  END IF;
END
$$;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=v_role) THEN
      IF has_table_privilege(v_role,'comind.cm_archive_checkpoint','SELECT')
         OR has_table_privilege(v_role,'comind.cm_archive_checkpoint','INSERT')
         OR has_table_privilege(v_role,'comind.cm_archive_snapshot_conversation','SELECT')
         OR has_table_privilege(v_role,'comind.cm_archive_snapshot_conversation','INSERT') THEN
        RAISE EXCEPTION 'CHIST-002 API role % has direct differential evidence authority', v_role;
      END IF;
    END IF;
  END LOOP;
END
$$;

SELECT
  (SELECT count(*)::int FROM comind.cm_conversation_history_baseline) AS certified_baselines,
  (SELECT count(*)::int FROM comind.cm_archive_stream) AS archive_streams,
  (SELECT count(*)::int FROM comind.cm_archive_checkpoint) AS accepted_checkpoints,
  'CHIST-002 differential ingestion schema verification: PASS' AS result;
