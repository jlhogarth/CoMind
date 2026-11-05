DO $verify$ BEGIN
  IF NOT has_schema_privilege('comind_aed_monitor_reader', 'comind_pm', 'USAGE')
    OR NOT has_table_privilege('comind_aed_monitor_reader', 'comind_pm.pm_aed_monitor_execution', 'SELECT')
    OR NOT has_table_privilege('comind_aed_monitor_reader', 'comind_pm.pm_aed_monitor_event', 'SELECT')
    OR has_table_privilege('comind_aed_monitor_reader', 'comind_pm.pm_aed_monitor_execution', 'INSERT,UPDATE,DELETE')
    OR has_table_privilege('comind_aed_monitor_reader', 'comind_pm.pm_aed_monitor_event', 'INSERT,UPDATE,DELETE')
    OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'comind_pm' AND policyname = 'aed_monitor_reader_select') <> 2
    OR (SELECT rolbypassrls OR rolsuper OR rolcreaterole FROM pg_roles WHERE rolname = 'comind_aed_monitor_reader')
  THEN RAISE EXCEPTION 'AED reader least privilege verification failed'; END IF;
END $verify$;
