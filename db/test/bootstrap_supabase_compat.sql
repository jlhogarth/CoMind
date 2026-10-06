create schema if not exists extensions;

do $bootstrap$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        execute 'create role anon nologin';
    end if;

    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        execute 'create role authenticated nologin';
    end if;

    if not exists (select 1 from pg_roles where rolname = 'service_role') then
        execute 'create role service_role nologin';
    end if;
end;
$bootstrap$;
