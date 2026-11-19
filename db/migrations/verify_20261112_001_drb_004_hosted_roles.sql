do $verify$
begin
  if not has_function_privilege('comind_runbook_scheduler_login', 'comind_drb_test.record_scheduler_receipt(jsonb)', 'EXECUTE')
    or not has_function_privilege('comind_runbook_console_login', 'comind_drb_test.console_status()', 'EXECUTE')
    or has_function_privilege('comind_runbook_console_login', 'comind_drb_test.record_scheduler_receipt(jsonb)', 'EXECUTE')
    or has_function_privilege('comind_runbook_scheduler_login', 'comind_drb_test.console_status()', 'EXECUTE')
    or has_function_privilege('anon', 'comind_drb_test.console_status()', 'EXECUTE')
    or has_function_privilege('authenticated', 'comind_drb_test.console_status()', 'EXECUTE')
    or has_table_privilege('comind_runbook_console_login', 'comind_pm.pm_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('comind_runbook_scheduler_login', 'comind_pm.pm_events', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('comind_runbook_scheduler_login', 'comind_drb_test.runbook_binding', 'SELECT,INSERT,UPDATE,DELETE')
    or exists (
      select 1 from pg_roles r
      where r.rolname in ('comind_runbook_console_login', 'comind_runbook_scheduler_login')
        and (r.rolsuper or r.rolcreatedb or r.rolcreaterole or r.rolreplication or r.rolbypassrls or r.rolinherit
          or exists (select 1 from pg_auth_members m where m.member = r.oid))
    )
  then raise exception 'DRB-004 hosted role boundaries failed'; end if;
end
$verify$;
