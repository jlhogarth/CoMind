do $verify$
begin
  if public.comind_runbook_lifecycle_due_at('2026-11-09 13:59:59+00') <> '2026-11-02 14:00:00+00'
    or public.comind_runbook_lifecycle_due_at('2026-11-09 14:00:00+00') <> '2026-11-09 14:00:00+00'
    or public.comind_runbook_lifecycle_due_at('2026-07-06 13:00:00+00') <> '2026-07-06 13:00:00+00'
    or public.comind_runbook_lifecycle_due_at('2026-03-09 12:59:59+00') <> '2026-03-02 14:00:00+00'
  then raise exception 'DRB-004 schedule boundary failed'; end if;

  if has_function_privilege('anon', 'public.comind_runbook_lifecycle_status(text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.comind_runbook_lifecycle_status(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.comind_runbook_lifecycle_due_at(timestamptz)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.comind_runbook_lifecycle_due_at(timestamptz)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.comind_runbook_lifecycle_status(text)', 'EXECUTE')
    or exists (select 1 from pg_proc where oid = 'public.comind_runbook_lifecycle_status(text)'::regprocedure and prosecdef)
  then raise exception 'DRB-004 status access boundary failed'; end if;
end
$verify$;
