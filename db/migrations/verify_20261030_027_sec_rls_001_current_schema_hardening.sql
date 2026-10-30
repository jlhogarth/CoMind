-- SEC-RLS-001 acceptance verifier.
-- Verifies the post-hardening contract without relying on policy-name heuristics alone.

DO $$
DECLARE
  v_unprotected bigint;
  v_anon_dml bigint;
  v_authenticated_dml bigint;
  v_policy_count bigint;
BEGIN
  SELECT count(*)
    INTO v_unprotected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname IN ('comind','comind_pm')
     AND c.relkind IN ('r','p')
     AND NOT c.relrowsecurity;
  IF v_unprotected <> 0 THEN
    RAISE EXCEPTION 'SEC-RLS-001 expected zero unprotected custom-schema tables, found %', v_unprotected;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    IF has_schema_privilege('anon','comind','USAGE')
       OR has_schema_privilege('anon','comind_pm','USAGE') THEN
      RAISE EXCEPTION 'SEC-RLS-001 anon unexpectedly has custom-schema USAGE';
    END IF;

    SELECT count(*) INTO v_anon_dml
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname IN ('comind','comind_pm')
       AND c.relkind IN ('r','p')
       AND (
         has_table_privilege('anon',c.oid,'SELECT')
         OR has_table_privilege('anon',c.oid,'INSERT')
         OR has_table_privilege('anon',c.oid,'UPDATE')
         OR has_table_privilege('anon',c.oid,'DELETE')
       );
    IF v_anon_dml <> 0 THEN
      RAISE EXCEPTION 'SEC-RLS-001 anon has DML privilege on % custom-schema tables', v_anon_dml;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    IF has_schema_privilege('authenticated','comind','USAGE')
       OR has_schema_privilege('authenticated','comind_pm','USAGE') THEN
      RAISE EXCEPTION 'SEC-RLS-001 authenticated unexpectedly has custom-schema USAGE';
    END IF;

    SELECT count(*) INTO v_authenticated_dml
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname IN ('comind','comind_pm')
       AND c.relkind IN ('r','p')
       AND (
         has_table_privilege('authenticated',c.oid,'SELECT')
         OR has_table_privilege('authenticated',c.oid,'INSERT')
         OR has_table_privilege('authenticated',c.oid,'UPDATE')
         OR has_table_privilege('authenticated',c.oid,'DELETE')
       );
    IF v_authenticated_dml <> 0 THEN
      RAISE EXCEPTION 'SEC-RLS-001 authenticated has DML privilege on % custom-schema tables', v_authenticated_dml;
    END IF;
  END IF;

  -- The fixture creates this sentinel before hardening. Its literal-true policy
  -- must survive, proving SEC-RLS-001 does not repeat migration 007's stale
  -- delete-all-TRUE-policy behavior.
  IF to_regclass('comind.sec_rls_001_policy_sentinel') IS NOT NULL THEN
    SELECT count(*) INTO v_policy_count
      FROM pg_policy p
      JOIN pg_class c ON c.oid=p.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='comind'
       AND c.relname='sec_rls_001_policy_sentinel'
       AND p.polname='sec_rls_001_existing_true_policy'
       AND COALESCE(pg_get_expr(p.polqual,p.polrelid),'')='true';
    IF v_policy_count <> 1 THEN
      RAISE EXCEPTION 'SEC-RLS-001 removed or changed an existing legitimate literal-true policy';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_deriver') THEN
    IF NOT has_schema_privilege('comind_conversation_deriver','comind','USAGE') THEN
      RAISE EXCEPTION 'SEC-RLS-001 deriver lost comind schema usage';
    END IF;

    IF to_regclass('comind.cm_assistant_generation') IS NOT NULL
       AND NOT has_table_privilege('comind_conversation_deriver','comind.cm_assistant_generation','SELECT') THEN
      RAISE EXCEPTION 'SEC-RLS-001 deriver lost assistant-generation read grant';
    END IF;
    IF to_regclass('comind.cm_conversation_capture_event') IS NOT NULL
       AND NOT has_table_privilege('comind_conversation_deriver','comind.cm_conversation_capture_event','SELECT') THEN
      RAISE EXCEPTION 'SEC-RLS-001 deriver lost capture-event read grant';
    END IF;
    IF to_regclass('comind.cm_conversation_recovery_checkpoint') IS NOT NULL
       AND NOT has_table_privilege('comind_conversation_deriver','comind.cm_conversation_recovery_checkpoint','SELECT') THEN
      RAISE EXCEPTION 'SEC-RLS-001 deriver lost recovery-checkpoint read grant';
    END IF;
    IF to_regclass('comind.cm_message_analytics') IS NOT NULL
       AND NOT has_table_privilege('comind_conversation_deriver','comind.cm_message_analytics','SELECT,INSERT,UPDATE') THEN
      RAISE EXCEPTION 'SEC-RLS-001 deriver lost message-analytics grant';
    END IF;
    IF to_regclass('comind.cm_conversation_analytics') IS NOT NULL
       AND NOT has_table_privilege('comind_conversation_deriver','comind.cm_conversation_analytics','SELECT,INSERT,UPDATE') THEN
      RAISE EXCEPTION 'SEC-RLS-001 deriver lost conversation-analytics grant';
    END IF;
    IF to_regclass('comind.cm_message_analytics') IS NOT NULL
       AND has_table_privilege('comind_conversation_deriver','comind.cm_message_analytics','DELETE') THEN
      RAISE EXCEPTION 'SEC-RLS-001 deriver unexpectedly gained message-analytics DELETE';
    END IF;
    IF to_regclass('comind.cm_conversation_analytics') IS NOT NULL
       AND has_table_privilege('comind_conversation_deriver','comind.cm_conversation_analytics','DELETE') THEN
      RAISE EXCEPTION 'SEC-RLS-001 deriver unexpectedly gained conversation-analytics DELETE';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_reconciler') THEN
    IF NOT has_schema_privilege('comind_conversation_reconciler','comind','USAGE') THEN
      RAISE EXCEPTION 'SEC-RLS-001 reconciler lost comind schema usage';
    END IF;
    IF to_regclass('comind.cm_assistant_generation') IS NOT NULL
       AND NOT has_table_privilege('comind_conversation_reconciler','comind.cm_assistant_generation','SELECT') THEN
      RAISE EXCEPTION 'SEC-RLS-001 reconciler lost assistant-generation read grant';
    END IF;
    IF to_regclass('comind.cm_conversation_capture_event') IS NOT NULL
       AND NOT has_table_privilege('comind_conversation_reconciler','comind.cm_conversation_capture_event','SELECT') THEN
      RAISE EXCEPTION 'SEC-RLS-001 reconciler lost capture-event read grant';
    END IF;
    IF to_regclass('comind.cm_conversation_recovery_checkpoint') IS NOT NULL
       AND NOT has_table_privilege('comind_conversation_reconciler','comind.cm_conversation_recovery_checkpoint','SELECT') THEN
      RAISE EXCEPTION 'SEC-RLS-001 reconciler lost recovery-checkpoint read grant';
    END IF;
    IF to_regclass('comind.cm_message_analytics') IS NOT NULL
       AND (
         has_table_privilege('comind_conversation_reconciler','comind.cm_message_analytics','SELECT')
         OR has_table_privilege('comind_conversation_reconciler','comind.cm_message_analytics','INSERT')
         OR has_table_privilege('comind_conversation_reconciler','comind.cm_message_analytics','UPDATE')
         OR has_table_privilege('comind_conversation_reconciler','comind.cm_message_analytics','DELETE')
       ) THEN
      RAISE EXCEPTION 'SEC-RLS-001 reconciler unexpectedly gained message-analytics privilege';
    END IF;
    IF to_regclass('comind.cm_conversation_analytics') IS NOT NULL
       AND (
         has_table_privilege('comind_conversation_reconciler','comind.cm_conversation_analytics','SELECT')
         OR has_table_privilege('comind_conversation_reconciler','comind.cm_conversation_analytics','INSERT')
         OR has_table_privilege('comind_conversation_reconciler','comind.cm_conversation_analytics','UPDATE')
         OR has_table_privilege('comind_conversation_reconciler','comind.cm_conversation_analytics','DELETE')
       ) THEN
      RAISE EXCEPTION 'SEC-RLS-001 reconciler unexpectedly gained conversation-analytics privilege';
    END IF;
  END IF;

  -- Required policy names are checked only when the corresponding roles/tables exist.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_deriver')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_reconciler') THEN
    IF to_regclass('comind.cm_assistant_generation') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='comind' AND c.relname='cm_assistant_generation' AND p.polname='sec_rls_001_conversation_source_select'
       ) THEN
      RAISE EXCEPTION 'SEC-RLS-001 missing assistant-generation source policy';
    END IF;
    IF to_regclass('comind.cm_conversation_capture_event') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='comind' AND c.relname='cm_conversation_capture_event' AND p.polname='sec_rls_001_conversation_source_select'
       ) THEN
      RAISE EXCEPTION 'SEC-RLS-001 missing capture-event source policy';
    END IF;
    IF to_regclass('comind.cm_conversation_recovery_checkpoint') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='comind' AND c.relname='cm_conversation_recovery_checkpoint' AND p.polname='sec_rls_001_conversation_source_select'
       ) THEN
      RAISE EXCEPTION 'SEC-RLS-001 missing recovery-checkpoint source policy';
    END IF;
  END IF;
END
$$;

SELECT 'pass' AS status,
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('comind','comind_pm') AND c.relkind IN ('r','p')) AS custom_schema_tables,
       (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('comind','comind_pm')) AS custom_schema_policies;