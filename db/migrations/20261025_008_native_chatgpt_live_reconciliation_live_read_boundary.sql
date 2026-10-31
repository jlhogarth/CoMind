-- CFR-001F: allow only the dedicated reconciliation role to read the live CFR
-- source tables required for retrospective archive reconciliation.
-- This migration does not enable or disable RLS and does not add write policies.
BEGIN;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_conversation',
    'cm_message',
    'cm_conversation_capture_event',
    'cm_assistant_generation',
    'cm_conversation_recovery_checkpoint'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS cm_conversation_reconciler_select ON comind.%I', v_table);
    EXECUTE format(
      'CREATE POLICY cm_conversation_reconciler_select ON comind.%I FOR SELECT TO comind_conversation_reconciler USING (true)',
      v_table
    );
  END LOOP;
END;
$$;

COMMENT ON ROLE comind_conversation_reconciler IS
  'NOLOGIN least-privilege role for read-only live/archive comparison and append-only reconciliation evidence. Live CFR reads are granted through role-specific SELECT policies where RLS applies.';

COMMIT;
