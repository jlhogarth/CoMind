begin;

create schema if not exists comind_drb_test;
revoke all on schema comind_drb_test from public, anon, authenticated;
create table if not exists comind_drb_test.runbook_binding (
  singleton boolean primary key default true check (singleton),
  volume_id text not null check (volume_id ~ '^[A-Za-z0-9_-]{1,160}$')
);
revoke all on table comind_drb_test.runbook_binding from public, anon, authenticated;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'comind_runbook_scheduler_login') then
    create role comind_runbook_scheduler_login nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'comind_runbook_console_login') then
    create role comind_runbook_console_login nologin noinherit;
  end if;
end
$roles$;

create or replace function comind_drb_test.scheduler_receipt(wanted_volume text, wanted_slot timestamptz)
returns table(id uuid, details jsonb)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select e.id, e.details
  from comind_drb_test.runbook_binding b
  join comind_pm.pm_projects p on p.project_key = 'COMIND'
  join comind_pm.pm_events e on e.project_id = p.id
  where b.volume_id = wanted_volume
    and e.actor = 'DRB-004' and e.event_type = 'verification' and e.source_system = 'supabase'
    and e.source_ref = 'drb-004:scheduled:' || b.volume_id || ':'
      || to_char(wanted_slot at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  limit 2
$$;

create or replace function comind_drb_test.record_scheduler_receipt(observation jsonb)
returns table(id uuid, details jsonb)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  bound_volume text;
  due_slot timestamptz := public.comind_runbook_lifecycle_due_at(now());
  due_text text := to_char(due_slot at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  checked_at timestamptz;
  source_ref text;
  measurement text := observation->>'size';
  inserted_id uuid;
  receipt_count integer;
  receipt jsonb;
begin
  select b.volume_id into strict bound_volume from comind_drb_test.runbook_binding b;
  if (observation->>'volumeId') is distinct from bound_volume
    or (observation->>'scheduledFor') is distinct from due_text
    or measurement is null or measurement not in ('below_review', 'review', 'escalation', 'unavailable', 'invalid')
    or (observation->>'rollover') is distinct from 'blocked'
    or (observation->>'policyVersion') is distinct from '1'
    or (observation->>'checkedAt') is null
    or (observation->'retention'->>'status') is distinct from 'not_provided'
    or (observation->'evidence') is distinct from 'null'::jsonb
    or jsonb_typeof(observation->'blockers') is distinct from 'array'
  then
    raise exception 'RunBook scheduler receipt outside binding' using errcode = '22023';
  end if;
  checked_at := (observation->>'checkedAt')::timestamptz;
  if checked_at < due_slot or checked_at > clock_timestamp() + interval '1 minute'
    or (measurement in ('unavailable', 'invalid') and observation->'approximateUtf16Units' is distinct from 'null'::jsonb)
    or (measurement in ('below_review', 'review', 'escalation')
      and (observation->>'approximateUtf16Units' is null
        or observation->>'approximateUtf16Units' !~ '^[0-9]{1,16}$'))
    or exists (select 1 from jsonb_array_elements_text(observation->'blockers') item
      where item is null or item not in ('measurement_unverified', 'revision_unverified', 'rollover_evidence_incomplete'))
  then
    raise exception 'Invalid RunBook scheduler observation' using errcode = '22023';
  end if;
  source_ref := 'drb-004:scheduled:' || bound_volume || ':' || due_text;
  perform pg_advisory_xact_lock(hashtextextended('COMIND:supabase:' || source_ref, 0));
  select count(*) into receipt_count from comind_drb_test.scheduler_receipt(bound_volume, due_slot);
  if receipt_count > 1 then
    raise exception 'Conflicting RunBook lifecycle receipts';
  end if;
  if receipt_count = 1 then
    return query select r.id, r.details from comind_drb_test.scheduler_receipt(bound_volume, due_slot) r;
    return;
  end if;
  receipt := jsonb_build_object(
    'volumeId', bound_volume, 'scheduledFor', due_text,
    'checkedAt', to_char(checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'policyVersion', 1, 'approximateUtf16Units', observation->'approximateUtf16Units',
    'size', measurement, 'rollover', 'blocked', 'blockers', observation->'blockers',
    'retention', jsonb_build_object('status', 'not_provided'), 'evidence', null
  );
  inserted_id := comind_pm.record_runbook_event(
    'COMIND', 'verification', 'DRB-004', 'Scheduled Test RunBook lifecycle evaluation', null,
    'system', 'Size=' || measurement || '; rollover=blocked',
    case when measurement in ('unavailable', 'invalid') then 'fail' else 'blocked' end,
    null, null, null, 'supabase', source_ref, receipt, '[]'::jsonb, checked_at, false
  );
  return query select inserted_id, receipt;
end
$$;

create or replace function comind_drb_test.console_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.comind_runbook_lifecycle_status(b.volume_id)
  from comind_drb_test.runbook_binding b
$$;

revoke all on function comind_drb_test.scheduler_receipt(text,timestamptz) from public, anon, authenticated;
revoke all on function comind_drb_test.record_scheduler_receipt(jsonb) from public, anon, authenticated;
revoke all on function comind_drb_test.console_status() from public, anon, authenticated;
grant usage on schema comind_drb_test to comind_runbook_scheduler_login, comind_runbook_console_login;
grant execute on function public.comind_runbook_lifecycle_due_at(timestamptz) to comind_runbook_scheduler_login;
grant execute on function comind_drb_test.scheduler_receipt(text,timestamptz),
  comind_drb_test.record_scheduler_receipt(jsonb) to comind_runbook_scheduler_login;
grant execute on function comind_drb_test.console_status() to comind_runbook_console_login;
commit;
