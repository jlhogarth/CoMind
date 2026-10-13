-- Deterministic verification for Issue #108 archive access hardening.

DO $$
DECLARE
  v_missing text;
  v_not_rls text;
BEGIN
  SELECT string_agg(expected, ', ' ORDER BY expected)
  INTO v_missing
  FROM (
    VALUES
      ('cm_archive_source'),
      ('cm_archive_source_file'),
      ('cm_archive_import'),
      ('cm_archive_conversation_observation'),
      ('cm_archive_node_observation'),
      ('cm_archive_attachment_reference'),
      ('cm_archive_parser_event'),
      ('cm_archive_diff_receipt'),
      ('cm_archive_quarantine')
  ) AS required(expected)
  WHERE to_regclass('comind.' || expected) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing archive tables before security verification: %', v_missing;
  END IF;

  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
  INTO v_not_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'comind'
    AND c.relname = ANY (ARRAY[
      'cm_archive_source',
      'cm_archive_source_file',
      'cm_archive_import',
      'cm_archive_conversation_observation',
      'cm_archive_node_observation',
      'cm_archive_attachment_reference',
      'cm_archive_parser_event',
      'cm_archive_diff_receipt',
      'cm_archive_quarantine'
    ])
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF v_not_rls IS NOT NULL THEN
    RAISE EXCEPTION 'Archive tables missing ENABLE/FORCE RLS: %', v_not_rls;
  END IF;
END;
$$;

DO $$
DECLARE
  v_role record;
BEGIN
  SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
  INTO v_role
  FROM pg_roles
  WHERE rolname = 'comind_archive_ingestor';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing comind_archive_ingestor role';
  END IF;

  IF v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb OR v_role.rolcreaterole
     OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'comind_archive_ingestor has privilege-bearing role attributes: %', row_to_json(v_role);
  END IF;
END;
$$;

DO $$
DECLARE
  v_table text;
  v_role text;
  v_privilege text;
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
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
        FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
        LOOP
          IF has_table_privilege(v_role, format('comind.%I', v_table), v_privilege) THEN
            RAISE EXCEPTION 'Supabase API role % unexpectedly has % on comind.%', v_role, v_privilege, v_table;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

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
    IF NOT has_table_privilege('comind_archive_ingestor', format('comind.%I', v_table), 'SELECT') THEN
      RAISE EXCEPTION 'Archive ingestor lacks SELECT on comind.%', v_table;
    END IF;
    IF NOT has_table_privilege('comind_archive_ingestor', format('comind.%I', v_table), 'INSERT') THEN
      RAISE EXCEPTION 'Archive ingestor lacks INSERT on comind.%', v_table;
    END IF;
    IF has_table_privilege('comind_archive_ingestor', format('comind.%I', v_table), 'DELETE')
       OR has_table_privilege('comind_archive_ingestor', format('comind.%I', v_table), 'TRUNCATE') THEN
      RAISE EXCEPTION 'Archive ingestor has destructive privilege on comind.%', v_table;
    END IF;
    IF v_table <> 'cm_archive_import'
       AND has_table_privilege('comind_archive_ingestor', format('comind.%I', v_table), 'UPDATE') THEN
      RAISE EXCEPTION 'Archive ingestor unexpectedly has UPDATE on immutable comind.%', v_table;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('comind_archive_ingestor', 'comind.cm_archive_import', 'UPDATE') THEN
    RAISE EXCEPTION 'Archive ingestor lacks one-way import finalization UPDATE privilege';
  END IF;

  IF NOT has_sequence_privilege('comind_archive_ingestor', 'comind.cm_archive_parser_event_parser_event_id_seq', 'USAGE')
     OR NOT has_sequence_privilege('comind_archive_ingestor', 'comind.cm_archive_quarantine_quarantine_id_seq', 'USAGE') THEN
    RAISE EXCEPTION 'Archive ingestor lacks required identity-sequence USAGE';
  END IF;
END;
$$;

DO $$
DECLARE
  v_bad_policy text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO v_bad_policy
  FROM pg_policies
  WHERE schemaname = 'comind'
    AND tablename = ANY (ARRAY[
      'cm_archive_source',
      'cm_archive_source_file',
      'cm_archive_import',
      'cm_archive_conversation_observation',
      'cm_archive_node_observation',
      'cm_archive_attachment_reference',
      'cm_archive_parser_event',
      'cm_archive_diff_receipt',
      'cm_archive_quarantine'
    ])
    AND roles <> ARRAY['comind_archive_ingestor']::name[];

  IF v_bad_policy IS NOT NULL THEN
    RAISE EXCEPTION 'Archive policy unexpectedly targets another role: %', v_bad_policy;
  END IF;
END;
$$;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role', 'comind_archive_ingestor']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
      IF has_function_privilege(v_role, 'comind.cm_reject_archive_evidence_mutation()', 'EXECUTE')
         OR has_function_privilege(v_role, 'comind.cm_guard_archive_import_finalization()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Role % can directly execute archive trigger helper functions', v_role;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Prove the constrained role can append source evidence and finalize one import.
SET ROLE comind_archive_ingestor;

DO $$
DECLARE
  v_archive_id uuid;
  v_import_id uuid;
  v_status text;
BEGIN
  INSERT INTO comind.cm_archive_source (
    source_archive_name,
    source_archive_sha256,
    source_archive_bytes
  ) VALUES (
    'security-fixture.zip',
    repeat('9', 64),
    9
  )
  ON CONFLICT (source_system, source_archive_sha256) DO NOTHING;

  SELECT source_archive_id
  INTO v_archive_id
  FROM comind.cm_archive_source
  WHERE source_system = 'chatgpt'
    AND source_archive_sha256 = repeat('9', 64);

  IF v_archive_id IS NULL THEN
    RAISE EXCEPTION 'Constrained archive role could not establish source identity';
  END IF;

  INSERT INTO comind.cm_archive_import (
    source_archive_id,
    parser_version,
    schema_version
  ) VALUES (
    v_archive_id,
    'security-fixture-v1',
    'security-fixture-v1'
  )
  ON CONFLICT (source_archive_id, parser_version, schema_version) DO NOTHING;

  SELECT import_id, status
  INTO v_import_id, v_status
  FROM comind.cm_archive_import
  WHERE source_archive_id = v_archive_id
    AND parser_version = 'security-fixture-v1'
    AND schema_version = 'security-fixture-v1';

  IF v_import_id IS NULL THEN
    RAISE EXCEPTION 'Constrained archive role could not establish import identity';
  END IF;

  IF v_status = 'PENDING' THEN
    UPDATE comind.cm_archive_import
    SET status = 'PASS',
        completed_at = now(),
        source_conversation_count = 0,
        source_message_count = 0,
        source_node_count = 0,
        source_attachment_count = 0,
        imported_conversation_count = 0,
        imported_message_count = 0,
        imported_node_count = 0,
        imported_attachment_count = 0,
        reconciliation = '{"security_fixture":true}'::jsonb,
        receipt = '{"status":"PASS","security_fixture":true}'::jsonb,
        receipt_sha256 = repeat('8', 64)
    WHERE import_id = v_import_id;
  END IF;
END;
$$;

RESET ROLE;
