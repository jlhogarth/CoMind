-- Issue #108: archive-specific Supabase/PostgreSQL access hardening.
-- Repository implementation only until separately authorized for live deployment.
--
-- The ChatGPT archive contains private source evidence. It is intentionally not
-- reachable through Supabase Data API roles. A dedicated NOLOGIN database role
-- provides the minimum table privileges required by the direct PostgreSQL
-- ingestion path. RLS is forced as defense in depth.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_archive_ingestor') THEN
    CREATE ROLE comind_archive_ingestor
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_archive_ingestor
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA comind TO comind_archive_ingestor;

-- The migration executor may grant its direct database session permission to
-- SET ROLE into the constrained ingestion role. This does not create a login
-- credential and does not grant the constrained role back into any API role.
GRANT comind_archive_ingestor TO CURRENT_USER;

DO $$
DECLARE
  v_table text;
  v_role text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_source',
    'cm_archive_source_file',
    'cm_archive_import',
    'cm_archive_conversation_observation',
    'cm_archive_node_observation',
    'cm_archive_attachment_reference',
    'cm_archive_parser_event',
    'cm_archive_diff_receipt',
    'cm_archive_quarantine'
  ]
  LOOP
    EXECUTE format('ALTER TABLE comind.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE comind.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE comind.%I FROM PUBLIC', v_table);

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE comind.%I FROM %I', v_table, v_role);
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- The ingestion role can append and reconcile evidence but cannot delete or
-- mutate immutable evidence rows. The import header alone needs UPDATE so one
-- PENDING attempt can be finalized exactly once by its trigger guard.
GRANT SELECT, INSERT ON TABLE
  comind.cm_archive_source,
  comind.cm_archive_source_file,
  comind.cm_archive_conversation_observation,
  comind.cm_archive_node_observation,
  comind.cm_archive_attachment_reference,
  comind.cm_archive_parser_event,
  comind.cm_archive_diff_receipt,
  comind.cm_archive_quarantine
TO comind_archive_ingestor;

GRANT SELECT, INSERT, UPDATE ON TABLE
  comind.cm_archive_import
TO comind_archive_ingestor;

GRANT USAGE, SELECT ON SEQUENCE
  comind.cm_archive_parser_event_parser_event_id_seq,
  comind.cm_archive_quarantine_quarantine_id_seq
TO comind_archive_ingestor;

-- No Data API policy is created. These policies apply only to the dedicated
-- direct-PostgreSQL ingestion role.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'cm_archive_source',
    'cm_archive_source_file',
    'cm_archive_import',
    'cm_archive_conversation_observation',
    'cm_archive_node_observation',
    'cm_archive_attachment_reference',
    'cm_archive_parser_event',
    'cm_archive_diff_receipt',
    'cm_archive_quarantine'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS cm_archive_ingestor_select ON comind.%I', v_table);
    EXECUTE format(
      'CREATE POLICY cm_archive_ingestor_select ON comind.%I FOR SELECT TO comind_archive_ingestor USING (true)',
      v_table
    );

    EXECUTE format('DROP POLICY IF EXISTS cm_archive_ingestor_insert ON comind.%I', v_table);
    EXECUTE format(
      'CREATE POLICY cm_archive_ingestor_insert ON comind.%I FOR INSERT TO comind_archive_ingestor WITH CHECK (true)',
      v_table
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS cm_archive_ingestor_update ON comind.cm_archive_import;
CREATE POLICY cm_archive_ingestor_update
  ON comind.cm_archive_import
  FOR UPDATE
  TO comind_archive_ingestor
  USING (true)
  WITH CHECK (true);

-- Trigger helpers are not application RPC surfaces.
REVOKE ALL ON FUNCTION comind.cm_reject_archive_evidence_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_finalization() FROM PUBLIC;
REVOKE ALL ON FUNCTION comind.cm_reject_archive_evidence_mutation() FROM comind_archive_ingestor;
REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_finalization() FROM comind_archive_ingestor;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION comind.cm_reject_archive_evidence_mutation() FROM %I',
        v_role
      );
      EXECUTE format(
        'REVOKE ALL ON FUNCTION comind.cm_guard_archive_import_finalization() FROM %I',
        v_role
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON ROLE comind_archive_ingestor IS
  'NOLOGIN least-privilege role for direct PostgreSQL ChatGPT archive ingestion. Not a Supabase Data API role.';

COMMIT;
