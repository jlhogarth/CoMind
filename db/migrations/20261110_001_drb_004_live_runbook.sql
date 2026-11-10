begin;

create or replace function public.comind_runbook_lifecycle_due_at(observed_at timestamptz)
returns timestamptz
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  select (
    date_trunc('week', observed_at at time zone 'America/Indiana/Indianapolis' - interval '9 hours')
    + interval '9 hours'
  ) at time zone 'America/Indiana/Indianapolis'
$$;

create or replace function public.comind_runbook_lifecycle_status(volume_id text)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog
as $$
  with schedule as (
    select public.comind_runbook_lifecycle_due_at(now()) as due
    where volume_id ~ '^[A-Za-z0-9_-]{1,160}$'
  ), events as (
    select e.id, e.occurred_at, e.source_ref,
      case when starts_with(e.source_ref, 'drb-004:probe:') then 'probe' else 'scheduled' end as trigger,
      e.details
    from comind_pm.pm_events e
    join comind_pm.pm_projects p on p.id = e.project_id and p.project_key = 'COMIND'
    where e.source_system = 'supabase' and e.actor = 'DRB-004' and e.event_type = 'verification'
      and (starts_with(e.source_ref, 'drb-004:scheduled:' || volume_id || ':')
        or starts_with(e.source_ref, 'drb-004:probe:' || volume_id || ':'))
      and e.occurred_at <= now()
  ), latest as (
    select jsonb_build_object(
      'id', id, 'observed_at', occurred_at, 'trigger', trigger,
      'size', details->'size', 'units', details->'approximateUtf16Units',
      'rollover', details->'rollover', 'policy_version', details->'policyVersion'
    ) as receipt
    from events
    order by occurred_at desc, id desc
    limit 1
  ), scheduled as (
    select e.id, e.occurred_at, e.details
    from events e cross join schedule s
    where e.source_ref = 'drb-004:scheduled:' || volume_id || ':'
      || to_char(s.due at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  select jsonb_build_object(
    'due_at', s.due,
    'scheduled_receipt_id', (select id from scheduled limit 1),
    'state', case
      when (select count(*) from scheduled) > 1 then 'conflicting_receipts'
      when not exists (select 1 from scheduled) then
        case when now() < s.due + interval '30 minutes' then 'waiting' else 'missed' end
      when (select details->>'size' from scheduled limit 1) not in ('below_review', 'review', 'escalation')
        or (select details->>'size' from scheduled limit 1) is null then 'measurement_failed'
      when (select occurred_at from scheduled limit 1) >= s.due + interval '30 minutes' then 'late'
      else 'current'
    end,
    'latest', (select receipt from latest)
  )
  from schedule s
$$;

revoke all on function public.comind_runbook_lifecycle_due_at(timestamptz) from public, anon, authenticated;
revoke all on function public.comind_runbook_lifecycle_status(text) from public, anon, authenticated;
grant execute on function public.comind_runbook_lifecycle_due_at(timestamptz) to service_role;
grant execute on function public.comind_runbook_lifecycle_status(text) to service_role;

commit;
