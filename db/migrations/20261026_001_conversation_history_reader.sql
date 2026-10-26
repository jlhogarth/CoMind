-- CHIST-001: governed read-only Conversation History capability.
-- This role can inspect preserved archive, reconciliation, and analytical evidence.
-- It cannot mutate source evidence, create reconciliation/derivation evidence, or promote memory.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_conversation_history_reader') THEN
    CREATE ROLE comind_conversation_history_reader
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_conversation_history_reader
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA comind TO comind_conversation_history_reader;
GRANT comind_conversation_history_reader TO CURRENT_USER;

GRANT SELECT ON TABLE
  comind.cm_archive_source,
  comind.cm_archive_source_file,
  comind.cm_archive_import,
  comind.cm_archive_conversation_observation,
  comind.cm_archive_node_observation,
  comind.cm_archive_attachment_reference,
  comind.cm_archive_parser_event,
  comind.cm_archive_quarantine,
  comind.cm_archive_diff_receipt,
  comind.cm_conversation_reconciliation_receipt,
  comind.cm_conversation_reconciliation_candidate,
  comind.cm_conversation_derivation_run,
  comind.cm_conversation_derivation,
  comind.cm_conversation_promotion_candidate,
  comind.cm_message_analytics,
  comind.cm_conversation_analytics
TO comind_conversation_history_reader;

-- Forced-RLS evidence requires an explicit reader policy.
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_source',
    'cm_archive_source_file',
    'cm_archive_import',
    'cm_archive_conversation_observation',
    'cm_archive_node_observation',
    'cm_archive_attachment_reference',
    'cm_archive_parser_event',
    'cm_archive_quarantine',
    'cm_archive_diff_receipt',
    'cm_conversation_reconciliation_receipt',
    'cm_conversation_reconciliation_candidate',
    'cm_conversation_derivation_run',
    'cm_conversation_derivation',
    'cm_conversation_promotion_candidate'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS cm_conversation_history_reader_select ON comind.%I', v_table);
    EXECUTE format(
      'CREATE POLICY cm_conversation_history_reader_select ON comind.%I FOR SELECT TO comind_conversation_history_reader USING (true)',
      v_table
    );
  END LOOP;
END
$$;

-- Keep all Conversation History evidence private from ordinary application/API identities.
REVOKE ALL ON TABLE
  comind.cm_archive_source,
  comind.cm_archive_source_file,
  comind.cm_archive_import,
  comind.cm_archive_conversation_observation,
  comind.cm_archive_node_observation,
  comind.cm_archive_attachment_reference,
  comind.cm_archive_parser_event,
  comind.cm_archive_quarantine,
  comind.cm_archive_diff_receipt,
  comind.cm_conversation_reconciliation_receipt,
  comind.cm_conversation_reconciliation_candidate,
  comind.cm_conversation_derivation_run,
  comind.cm_conversation_derivation,
  comind.cm_conversation_promotion_candidate,
  comind.cm_message_analytics,
  comind.cm_conversation_analytics
FROM PUBLIC;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_source FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_source_file FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_import FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_conversation_observation FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_node_observation FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_attachment_reference FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_parser_event FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_quarantine FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_archive_diff_receipt FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_conversation_reconciliation_receipt FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_conversation_reconciliation_candidate FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_conversation_derivation_run FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_conversation_derivation FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_conversation_promotion_candidate FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_message_analytics FROM %I', v_role);
      EXECUTE format('REVOKE ALL ON TABLE comind.cm_conversation_analytics FROM %I', v_role);
    END IF;
  END LOOP;
END
$$;

COMMENT ON ROLE comind_conversation_history_reader IS
  'CHIST-001 NOLOGIN/NOINHERIT read-only capability for private ChatGPT archive, reconciliation, and derived Conversation History evidence. Not a Data API role.';

COMMIT;
