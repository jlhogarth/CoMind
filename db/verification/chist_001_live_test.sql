-- CHIST-001 reusable read-only verification for the pre-baseline Supabase Test state.
-- Expected before a real native OpenAI export is certified:
--   source fixtures may exist, but no certified baseline exists and the reader is certification-bounded.

WITH reader_role AS (
  SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
  FROM pg_roles WHERE rolname='comind_conversation_history_reader'
), certifier_role AS (
  SELECT rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
  FROM pg_roles WHERE rolname='comind_conversation_history_certifier'
), baseline_rls AS (
  SELECT relrowsecurity, relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='comind' AND c.relname='cm_conversation_history_baseline'
), checks AS (
  SELECT 'reader_role_least_privilege' AS check_name,
    EXISTS (SELECT 1 FROM reader_role WHERE NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls) AS passed
  UNION ALL SELECT 'certifier_role_least_privilege',
    EXISTS (SELECT 1 FROM certifier_role WHERE NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls)
  UNION ALL SELECT 'baseline_table_exists', to_regclass('comind.cm_conversation_history_baseline') IS NOT NULL
  UNION ALL SELECT 'baseline_forced_rls', EXISTS (SELECT 1 FROM baseline_rls WHERE relrowsecurity AND relforcerowsecurity)
  UNION ALL SELECT 'baseline_guard_trigger_exists', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_conversation_history_baseline' AND t.tgname='trg_cm_conversation_history_baseline_guard' AND NOT t.tgisinternal)
  UNION ALL SELECT 'baseline_immutable_trigger_exists', EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind' AND c.relname='cm_conversation_history_baseline' AND t.tgname='trg_cm_conversation_history_baseline_immutable' AND NOT t.tgisinternal)
  UNION ALL SELECT 'reader_baseline_select_only',
    has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_history_baseline','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_history_baseline','INSERT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_history_baseline','UPDATE')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_history_baseline','DELETE')
  UNION ALL SELECT 'certifier_baseline_append_only',
    has_table_privilege('comind_conversation_history_certifier','comind.cm_conversation_history_baseline','SELECT')
    AND has_table_privilege('comind_conversation_history_certifier','comind.cm_conversation_history_baseline','INSERT')
    AND NOT has_table_privilege('comind_conversation_history_certifier','comind.cm_conversation_history_baseline','UPDATE')
    AND NOT has_table_privilege('comind_conversation_history_certifier','comind.cm_conversation_history_baseline','DELETE')
  UNION ALL SELECT 'api_roles_no_baseline_access',
    NOT has_table_privilege('anon','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('service_role','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'other_capability_roles_no_baseline_access',
    NOT has_table_privilege('comind_archive_ingestor','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('comind_conversation_reconciler','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('comind_conversation_deriver','comind.cm_conversation_history_baseline','SELECT,INSERT,UPDATE,DELETE')
  UNION ALL SELECT 'reader_cannot_read_canonical_memory',
    NOT has_table_privilege('comind_conversation_history_reader','comind.cm_memory_node','SELECT')
  UNION ALL SELECT 'reader_cannot_read_generic_analytics_projections',
    NOT has_table_privilege('comind_conversation_history_reader','comind.cm_message_analytics','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_analytics','SELECT')
  UNION ALL SELECT 'pit_diff_withheld',
    NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_diff_receipt','SELECT')
  UNION ALL SELECT 'reader_archive_read_only_acl',
    has_table_privilege('comind_conversation_history_reader','comind.cm_archive_conversation_observation','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_conversation_observation','INSERT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_conversation_observation','UPDATE')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_archive_conversation_observation','DELETE')
  UNION ALL SELECT 'reader_reconciliation_read_only_acl',
    has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_reconciliation_receipt','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_reconciliation_receipt','INSERT')
  UNION ALL SELECT 'reader_derivation_read_only_acl',
    has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_derivation','SELECT')
    AND NOT has_table_privilege('comind_conversation_history_reader','comind.cm_conversation_derivation','INSERT')
  UNION ALL SELECT 'certification_bounded_policies_present',
    (SELECT count(*) FROM pg_policies WHERE schemaname='comind' AND policyname='cm_conversation_history_reader_select') >= 13
  UNION ALL SELECT 'no_real_baseline_certified_in_test',
    (SELECT count(*) FROM comind.cm_conversation_history_baseline)=0
  UNION ALL SELECT 'uncertified_archive_evidence_preserved',
    (SELECT count(*) FROM comind.cm_archive_import)>0
  UNION ALL SELECT 'source_archive_fk_indexed', EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='comind' AND tablename='cm_conversation_history_baseline'
      AND indexname='idx_cm_conversation_history_baseline_source_archive')
  UNION ALL SELECT 'all_chist_migrations_recorded',
    (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE name IN ('chist_001_conversation_history_reader','chist_001_conversation_history_baseline_certification','chist_001_conversation_history_baseline_index_hardening'))=3
)
SELECT check_name, passed FROM checks
UNION ALL
SELECT 'PASS_ALL', bool_and(passed) FROM checks
ORDER BY check_name;
