BEGIN;

DO $sec_rls_002$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['artifact', 'external_reference', 'journal_entry']
  LOOP
    IF to_regclass(format('comind_development.%I', target_table)) IS NULL THEN
      RAISE EXCEPTION 'SEC-RLS-002 required table comind_development.% is missing', target_table;
    END IF;

    EXECUTE format('ALTER TABLE comind_development.%I ENABLE ROW LEVEL SECURITY', target_table);

    -- These development-evidence relations are intentionally admin/service-only.
    -- No ordinary-role policy is created. Existing privileged maintenance paths
    -- continue through their already-governed PostgreSQL owner/BYPASSRLS identities.
    EXECUTE format('REVOKE ALL ON TABLE comind_development.%I FROM PUBLIC', target_table);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE comind_development.%I FROM anon', target_table);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE comind_development.%I FROM authenticated', target_table);
    END IF;
  END LOOP;
END
$sec_rls_002$;

COMMIT;
