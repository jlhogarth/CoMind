-- CHIST-001 reusable read-only verification for the pre-baseline Supabase Test state.
-- Expected before a real native OpenAI export is certified:
-- source fixtures may exist, but no certified baseline, archive derivation run, or PIT detail may exist.
-- This verifier reflects the complete CHIST schema through migrations 001-006.

WITH reader_role AS (
  SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
  FROM pg_roles WHERE rolname='comind_conversation_history_reader'
), certifier_role AS (
  SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
  FROM pg_roles WHERE rolname='comind_conversation_history_certifier'
), deriver_role AS (
  SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
  FROM pg_roles WHERE rolname='comind_conversation_history_deriver'
), checks AS (
  SELECT 'reader_role_least_privilege' AS check_name,
    EXISTS (SELECT 1 FROM reader_role WHERE NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) AS passed
  UNION ALL SELECT 'certifier_role_least_privilege',
    EXISTS (SELECT 1 FROM certifier_role WHERE NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
  UNION ALL SELECT 'archive_deriver_role_least_privilege',
    EXISTS (SELECT 1 FROM deriver_role WHERE NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)

  UNION ALL SELECT 'baseline_table_exists',
    to_regclass('comind.cm_conversation_history_baseline') IS NOT NULL
  UNION ALL SELECT 'archive_derivation_tables_exist',
    to_regclass('comind.cm_archive_derivation_run') IS NOT NULL
    AND to_regclass('comind.cm_archive_derivation') IS NOT NULL
    AND to_regclass('comind.cm_archive_promotion_candidate') IS NOT NULL
  UNION ALL SELECT 'pit_detail_table_exists',
    to_regclass('comind.cm_archive_diff_conversation_observation') IS NOT NULL

  UNION ALL SELECT 'history_evidence_forced_rls',
    (SELECT count(*)=5
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='comind'
        AND c.relname IN (
          'cm_conversation_history_baseline',
          'cm_archive_derivation_run',
          'cm_archive_derivation',
          'cm_archive_promotion_candidate',
          'cm_archive_diff_conversation_observation'
        )
        AND c.relrowsecurity AND c.relforcerowsecurity)

  UNION ALL SELECT 'baseline_guard_trigger_exists', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_conversation_history_baseline'
      AND t.tgname='trg_cm_conversation_history_baseline_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'baseline_immutable_trigger_exists', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_conversation_history_baseline'
      AND t.tgname='trg_cm_conversation_history_baseline_immutable' AND NOT t.tgisinternal)
  UNION ALL SELECT 'archive_derivation_guard_trigger_exists', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_archive_derivation_run'
      AND t.tgname='trg_cm_archive_derivation_run_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'pit_guard_trigger_exists', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_archive_diff_receipt'
      AND t.tgname='trg_cm_archive_diff_receipt_history_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'pit_detail_immutable_trigger_exists', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_archive_diff_conversation_observation'
      AND t.tgname='trg_cm_archive_diff_conversation_immutable' AND NOT t.tgisinternal)

  UNION ALL SELECT 'reader_baseline_select_only',
    has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_history_baseline','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_history_baseline','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'certifier_baseline_append_only',
    has_table_privilege('comind_conversation_history_certifier','comind.cm_conversation_history_baseline','SELECT,INSERT')
    AND NOT has_table_privilege('comind_conversation_history_certifier','comind.cm_conversation_history_baseline','UPDATE,DELETE')
  UNION ALL SELECT 'archive_ingestor_baseline_select_only',
    has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','SELECT')
    AND NOT has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'reconciler_and_live_deriver_no_baseline_access',
    NOT has_table_privilege('comind_conversation_reconciler','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('comind_conversation_deriver','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')

  UNION ALL SELECT 'reader_archive_source_read_only',
    has_table_privilege('comind_conversation_history_reader','comind.cm_archive_conversation_observation','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_conversation_observation','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'reader_reconciliation_read_only',
    has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_reconciliation_receipt','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_reconciliation_receipt','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'reader_archive_derivation_read_only',
    has_table_privilege('comind_conversation_history_reader','comind.cm_archive_derivation_run','SELECT')
    AND has_table_privilege('comind_conversation_history_reader','comind.cm_archive_derivation','SELECT')
    AND has_table_privilege('comind_conversation_history_reader','comind.cm_archive_promotion_candidate','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_derivation_run','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_derivation','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_promotion_candidate','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'reader_pit_read_only',
    has_table_privilege('comind_conversation_history_reader','comind.cm_archive_diff_receipt','SELECT')
    AND has_table_privilege('comind_conversation_history_reader','comind.cm_archive_diff_conversation_observation','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_diff_receipt','INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_diff_conversation_observation','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'reader_cannot_read_generic_analytics_projections',
    NOT has_table_privilege('comind_conversation_history_reader','comind.cm_message_analytics','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_analytics','SELECT')
  UNION ALL SELECT 'reader_cannot_read_canonical_memory',
    NOT has_table_privilege('comind_conversation_history_reader','comind.cm_memory_node','SELECT')

  UNION ALL SELECT 'archive_deriver_source_read_only',
    has_table_privilege('comind_conversation_history_deriver','comind.cm_conversation_history_baseline','SELECT')
    AND has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_import','SELECT')
    AND has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_conversation_observation','SELECT')
    AND has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_node_observation','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_conversation_observation','INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'archive_deriver_append_only',
    has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_derivation_run','SELECT,INSERT')
    AND has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_derivation','SELECT,INSERT')
    AND has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_promotion_candidate','SELECT,INSERT')
    AND NOT has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_derivation_run','UPDATE,DELETE')
    AND NOT has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_derivation','UPDATE,DELETE')
    AND NOT has_table_privilege('comind_conversation_history_deriver','comind.cm_archive_promotion_candidate','UPDATE,DELETE')
  UNION ALL SELECT 'archive_deriver_no_memory_access',
    NOT has_table_privilege('comind_conversation_history_deriver','comind.cm_memory_node','SELECT,INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'archive_ingestor_pit_append_only',
    has_table_privilege('comind_archive_ingestor','comind.cm_archive_diff_conversation_observation','SELECT,INSERT')
    AND NOT has_table_privilege('comind_archive_ingestor','comind.cm_archive_diff_conversation_observation','UPDATE,DELETE')

  UNION ALL SELECT 'api_roles_no_history_evidence_access',
    NOT has_table_privilege('anon','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('anon','comind.cm_archive_derivation_run','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated','comind.cm_archive_derivation_run','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','comind.cm_archive_derivation_run','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('anon','comind.cm_archive_diff_conversation_observation','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated','comind.cm_archive_diff_conversation_observation','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','comind.cm_archive_diff_conversation_observation','SELECT,INSERT,UPDATE,DELETE')

  UNION ALL SELECT 'baseline_source_archive_fk_indexed', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='comind'
      AND tablename='cm_conversation_history_baseline'
      AND indexname='idx_cm_conversation_history_baseline_source_archive')
  UNION ALL SELECT 'archive_derivation_composite_fk_indexed', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='comind'
      AND tablename='cm_archive_derivation'
      AND indexname='idx_cm_archive_derivation_run_scope_fk')
  UNION ALL SELECT 'archive_candidate_composite_fk_indexed', EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='comind'
      AND tablename='cm_archive_promotion_candidate'
      AND indexname='idx_cm_archive_candidate_run_scope_fk')

  UNION ALL SELECT 'no_real_baseline_certified_in_test',
    (SELECT count(*) FROM comind.cm_conversation_history_baseline)=0
  UNION ALL SELECT 'uncertified_archive_evidence_preserved',
    (SELECT count(*) FROM comind.cm_archive_import)>0
  UNION ALL SELECT 'no_archive_derivation_runs_without_baseline',
    (SELECT count(*) FROM comind.cm_archive_derivation_run)=0
  UNION ALL SELECT 'no_pit_details_without_baseline',
    (SELECT count(*) FROM comind.cm_archive_diff_conversation_observation)=0

  UNION ALL SELECT 'all_six_chist_migration_names_present',
    (SELECT count(DISTINCT name) FROM supabase_migrations.schema_migrations
      WHERE name IN (
        'chist_001_conversation_history_reader',
        'chist_001_conversation_history_baseline_certification',
        'chist_001_conversation_history_baseline_index_hardening',
        'chist_001_conversation_history_archive_derivation',
        'chist_001_conversation_history_pit_diff',
        'chist_001_conversation_history_archive_derivation_fk_indexes'
      ))=6
)
SELECT check_name,passed FROM checks
UNION ALL SELECT 'PASS_ALL',bool_and(passed) FROM checks
ORDER BY check_name;
