-- SEC-RLS-001 current-schema RLS hardening and policy preservation.
-- Successor to LF-3 migration-007 readiness. This migration intentionally does
-- not delete existing policies based on predicate shape.
-- Production activation is not implied by repository acceptance.

BEGIN;

DO $$
DECLARE
  v_schema text;
  r record;
BEGIN
  FOREACH v_schema IN ARRAY ARRAY['comind','comind_pm'] LOOP
    IF to_regnamespace(v_schema) IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
      EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM anon', v_schema);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
      EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM authenticated', v_schema);
    END IF;

    FOR r IN
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=v_schema
        AND c.relkind IN ('r','p')
      ORDER BY c.relname
    LOOP
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_schema, r.relname);
      EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC', v_schema, r.relname);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon', v_schema, r.relname);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM authenticated', v_schema, r.relname);
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- The conversation derivation and reconciliation roles already hold explicit
-- ACLs on these source tables. RLS was historically absent, so enabling RLS
-- requires equally explicit row policies to preserve the accepted read boundary.
DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_deriver')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_reconciler') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'cm_assistant_generation',
      'cm_conversation_capture_event',
      'cm_conversation_recovery_checkpoint'
    ] LOOP
      IF to_regclass(format('comind.%I',v_table)) IS NOT NULL THEN
        EXECUTE format('DROP POLICY IF EXISTS sec_rls_001_conversation_source_select ON comind.%I',v_table);
        EXECUTE format(
          'CREATE POLICY sec_rls_001_conversation_source_select ON comind.%I FOR SELECT TO comind_conversation_deriver, comind_conversation_reconciler USING (true)',
          v_table
        );
      END IF;
    END LOOP;
  END IF;
END
$$;

-- Analytics tables are writable only by the dedicated derivation role. Keep
-- SELECT/INSERT/UPDATE distinct so DELETE remains denied by both ACL and RLS.
DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_deriver') THEN
    FOREACH v_table IN ARRAY ARRAY['cm_message_analytics','cm_conversation_analytics'] LOOP
      IF to_regclass(format('comind.%I',v_table)) IS NOT NULL THEN
        EXECUTE format('DROP POLICY IF EXISTS sec_rls_001_deriver_select ON comind.%I',v_table);
        EXECUTE format('DROP POLICY IF EXISTS sec_rls_001_deriver_insert ON comind.%I',v_table);
        EXECUTE format('DROP POLICY IF EXISTS sec_rls_001_deriver_update ON comind.%I',v_table);

        EXECUTE format(
          'CREATE POLICY sec_rls_001_deriver_select ON comind.%I FOR SELECT TO comind_conversation_deriver USING (true)',
          v_table
        );
        EXECUTE format(
          'CREATE POLICY sec_rls_001_deriver_insert ON comind.%I FOR INSERT TO comind_conversation_deriver WITH CHECK (true)',
          v_table
        );
        EXECUTE format(
          'CREATE POLICY sec_rls_001_deriver_update ON comind.%I FOR UPDATE TO comind_conversation_deriver USING (true) WITH CHECK (true)',
          v_table
        );
      END IF;
    END LOOP;
  END IF;
END
$$;

COMMENT ON SCHEMA comind IS
  'CoMind canonical application schema. SEC-RLS-001 requires RLS on every ordinary/partitioned table; ordinary Data API roles remain denied unless explicitly governed.';
COMMENT ON SCHEMA comind_pm IS
  'CoMind project-management and RuleBook schema. SEC-RLS-001 requires RLS on every ordinary/partitioned table; ordinary Data API roles remain denied unless explicitly governed.';

COMMIT;
