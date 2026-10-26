begin;

alter table comind_pm.pm_authority_relationship_events
  add column if not exists event_seq bigint generated always as identity;

create unique index if not exists uq_authority_relationship_event_seq
  on comind_pm.pm_authority_relationship_events(event_seq);

create or replace view comind_pm.v_authority_relationship_current
with (security_invoker=true)
as
select
  r.*,
  e.event_type as relationship_status,
  e.actor as status_actor,
  e.rationale as status_rationale,
  e.evidence_refs as status_evidence_refs,
  e.occurred_at as status_at,
  e.event_seq as status_event_seq
from comind_pm.pm_authority_relationships r
join lateral (
  select e1.*
  from comind_pm.pm_authority_relationship_events e1
  where e1.relationship_id=r.id
  order by e1.event_seq desc
  limit 1
) e on true;

create or replace function comind_pm.enforce_authority_relationship_event()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_relationship comind_pm.pm_authority_relationships%rowtype;
  v_previous text;
  v_cycle boolean;
begin
  select * into v_relationship
  from comind_pm.pm_authority_relationships
  where id=new.relationship_id;

  if not found then
    raise exception 'Authority relationship % does not exist',new.relationship_id;
  end if;

  select event_type into v_previous
  from comind_pm.pm_authority_relationship_events
  where relationship_id=new.relationship_id
  order by event_seq desc
  limit 1;

  if v_previous is null then
    if new.event_type<>'proposed' then
      raise exception 'Authority relationship must begin as proposed';
    end if;
  elsif v_previous='proposed' then
    if new.event_type not in ('confirmed','rejected','revoked') then
      raise exception 'Invalid authority relationship transition % -> %',v_previous,new.event_type;
    end if;
  elsif v_previous='confirmed' then
    if new.event_type not in ('superseded','revoked') then
      raise exception 'Invalid authority relationship transition % -> %',v_previous,new.event_type;
    end if;
  else
    raise exception 'Authority relationship state % is terminal',v_previous;
  end if;

  if new.event_type='confirmed' and v_relationship.relationship_type='delegates_to' then
    select exists(
      select 1
      from comind_pm.v_authority_delegation_lineage d
      where d.project_id=v_relationship.project_id
        and d.root_authority_id=v_relationship.related_authority_id
        and d.delegated_authority_id=v_relationship.authority_id
    ) into v_cycle;
    if v_cycle then
      raise exception 'Confirmed delegation would create an authority cycle';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function comind_pm.enforce_authority_relationship_event() from public,anon,authenticated;
grant execute on function comind_pm.enforce_authority_relationship_event() to service_role;

commit;
