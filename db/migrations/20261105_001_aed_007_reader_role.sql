BEGIN;

DO $role$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_aed_monitor_reader') THEN
    CREATE ROLE comind_aed_monitor_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2;
  END IF;
END $role$;

GRANT USAGE ON SCHEMA comind_pm TO comind_aed_monitor_reader;
GRANT SELECT ON comind_pm.pm_aed_monitor_execution, comind_pm.pm_aed_monitor_event TO comind_aed_monitor_reader;

DO $policies$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'comind_pm' AND tablename = 'pm_aed_monitor_execution' AND policyname = 'aed_monitor_reader_select') THEN
    CREATE POLICY aed_monitor_reader_select ON comind_pm.pm_aed_monitor_execution FOR SELECT TO comind_aed_monitor_reader USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'comind_pm' AND tablename = 'pm_aed_monitor_event' AND policyname = 'aed_monitor_reader_select') THEN
    CREATE POLICY aed_monitor_reader_select ON comind_pm.pm_aed_monitor_event FOR SELECT TO comind_aed_monitor_reader USING (true);
  END IF;
END $policies$;

COMMIT;
