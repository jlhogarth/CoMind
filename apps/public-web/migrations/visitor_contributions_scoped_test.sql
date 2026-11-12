-- WEB-001 scoped synthetic Worker access after the visitor contribution migration.
begin;
do $$
begin
  if not exists (select from pg_roles where rolname = 'web001_ingest_ops') then
    create role web001_ingest_ops nologin noinherit nobypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'web001_ingest') then
    create role web001_ingest login noinherit nobypassrls connection limit 8;
  end if;
  if to_regprocedure('public.web001_submit(uuid,text,text,text,text,text,text)') is not null then
    alter function public.web001_submit(uuid,text,text,text,text,text,text) set schema web001_private;
    alter function public.web001_withdraw(uuid,text) set schema web001_private;
  end if;
end
$$;
grant web001_ingest_ops to postgres with inherit true, set true;
grant web001_ingest to postgres with set true;
grant usage, create on schema web001_private to web001_ingest_ops;
grant usage on schema web001_private to web001_ingest;
grant select, insert on web001_private.contributions to web001_ingest_ops;
grant update (status, scrubbed_at, question, why_it_matters, known_context, uncertainty, reviewed_problem_key)
  on web001_private.contributions to web001_ingest_ops;
drop policy if exists web001_ingest_operations on web001_private.contributions;
create policy web001_ingest_operations on web001_private.contributions
  for all to web001_ingest_ops using (true) with check (true);
alter function web001_private.web001_submit(uuid,text,text,text,text,text,text) security definer;
alter function web001_private.web001_withdraw(uuid,text) security definer;
alter function web001_private.web001_submit(uuid,text,text,text,text,text,text) owner to web001_ingest_ops;
alter function web001_private.web001_withdraw(uuid,text) owner to web001_ingest_ops;
revoke create on schema web001_private from web001_ingest_ops;
revoke all on schema web001_private from service_role;
revoke all on web001_private.contributions from service_role;
revoke update (status, scrubbed_at, question, why_it_matters, known_context, uncertainty, reviewed_problem_key)
  on web001_private.contributions from service_role;
revoke all on function web001_private.web001_submit(uuid,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function web001_private.web001_withdraw(uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function web001_private.web001_submit(uuid,text,text,text,text,text,text) to web001_ingest;
grant execute on function web001_private.web001_withdraw(uuid,text) to web001_ingest;
notify pgrst, 'reload schema';
commit;
