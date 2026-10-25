-- CFR-001F policy hardening.
-- Keep reconciler SELECT policies only on live CFR tables where RLS is already
-- enabled. Do not enable RLS here because that could change existing runtime
-- behavior outside this lane. Also make the NOLOGIN capability role NOINHERIT.
BEGIN;

ALTER ROLE comind_conversation_reconciler NOINHERIT;

DO $$
DECLARE
  v_table text;
  v_rls_enabled boolean;
BEGIN
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
     WHERE n.nspname='comind'
       AND c.relname=v_table
       AND c.relkind IN ('r','p');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Required CFR source table %.% is missing', 'comind', v_table;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS cm_conversation_reconciler_select ON comind.%I', v_table);
    IF v_rls_enabled THEN
      EXECUTE format(
        'CREATE POLICY cm_conversation_reconciler_select ON comind.%I FOR SELECT TO comind_conversation_reconciler USING (true)',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON ROLE comind_conversation_reconciler IS
  'NOLOGIN NOINHERIT least-privilege role for read-only live/archive comparison and append-only reconciliation evidence. Role-specific live CFR SELECT policies exist only where RLS is already enabled.';

COMMIT;
