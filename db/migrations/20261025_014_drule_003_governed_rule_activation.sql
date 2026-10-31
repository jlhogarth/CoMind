begin;

create table if not exists comind_pm.pm_rule_authorities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  authority_key text not null,
  authority_class text not null,
  subject_type text not null,
  subject_ref text not null,
  scope jsonb not null default '{}'::jsonb,
  capabilities text[] not null,
  precedence_rank integer,
  precedence_basis text,
  parent_authority_id uuid references comind_pm.pm_rule_authorities(id) on delete restrict,
  evidence_refs jsonb not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  status text not null default 'proposed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, authority_key),
  check (authority_class in ('founder','constitutional_policy','approved_policy','delegated_authority','domain_owner','operational_authority','advisory','evidentiary_only')),
  check (subject_type in ('human','role','policy','team','system','agent','artifact')),
  check (status in ('proposed','active','suspended','expired','revoked','superseded')),
  check (cardinality(capabilities) > 0),
  check (capabilities <@ array['approve','activate','supersede','override','revoke','recommend']::text[]),
  check (case when jsonb_typeof(evidence_refs) = 'array' then jsonb_array_length(evidence_refs) > 0 else false end),
  check (valid_until is null or valid_until > valid_from),
  check (precedence_rank is null or precedence_rank > 0),
  check (precedence_rank is null or nullif(btrim(precedence_basis),'') is not null),
  check (parent_authority_id is null or parent_authority_id <> id)
);

create table if not exists comind_pm.pm_rule_activation_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  request_key text not null,
  rule_id uuid not null references comind_pm.pm_rules(id) on delete restrict,
  rule_version integer not null,
  requested_state text not null default 'active',
  target_environment text not null default 'governance',
  target_scope jsonb not null default '{}'::jsonb,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  rationale text not null,
  evidence_refs jsonb not null,
  status text not null default 'pending_review',
  blocked_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, request_key),
  foreign key (rule_id, rule_version)
    references comind_pm.pm_rule_versions(rule_id, version) on delete restrict,
  check (requested_state in ('approved','active','superseded','revoked')),
  check (target_environment in ('governance','test','staging','production')),
  check (status in ('pending_review','blocked','approved','denied','deferred','activated','superseded','revoked','cancelled')),
  check (nullif(btrim(rationale),'') is not null),
  check (case when jsonb_typeof(evidence_refs) = 'array' then jsonb_array_length(evidence_refs) > 0 else false end)
);

create table if not exists comind_pm.pm_rule_activation_case_links (
  activation_request_id uuid not null references comind_pm.pm_rule_activation_requests(id) on delete cascade,
  reconciliation_case_id uuid not null references comind_pm.pm_rule_reconciliation_cases(id) on delete restrict,
  blocking boolean not null default true,
  rationale text,
  created_at timestamptz not null default now(),
  primary key (activation_request_id, reconciliation_case_id)
);

create table if not exists comind_pm.pm_rule_activation_authority_assessments (
  id uuid primary key default gen_random_uuid(),
  activation_request_id uuid not null references comind_pm.pm_rule_activation_requests(id) on delete cascade,
  authority_id uuid not null references comind_pm.pm_rule_authorities(id) on delete restrict,
  required_capability text not null,
  determination text not null,
  rationale text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  assessed_by text not null,
  assessed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (required_capability in ('approve','activate','supersede','override','revoke','recommend')),
  check (determination in ('pending','sufficient','insufficient','inapplicable','escalation_required')),
  check (nullif(btrim(rationale),'') is not null),
  check (jsonb_typeof(evidence_refs) = 'array'),
  check (determination not in ('sufficient','insufficient','escalation_required') or jsonb_array_length(evidence_refs) > 0)
);

create table if not exists comind_pm.pm_rule_activation_events (
  id uuid primary key default gen_random_uuid(),
  activation_request_id uuid not null references comind_pm.pm_rule_activation_requests(id) on delete cascade,
  event_type text not null,
  actor text not null,
  authority_id uuid references comind_pm.pm_rule_authorities(id) on delete restrict,
  rationale text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (event_type in ('submitted','blocked','approved','denied','deferred','activated','superseded','revoked')),
  check (nullif(btrim(rationale),'') is not null),
  check (jsonb_typeof(evidence_refs) = 'array'),
  check (event_type not in ('approved','denied','deferred','activated','superseded','revoked') or authority_id is not null),
  check (event_type not in ('approved','denied','deferred','activated','superseded','revoked') or jsonb_array_length(evidence_refs) > 0)
);

create index if not exists idx_rule_authorities_status
  on comind_pm.pm_rule_authorities(project_id,status,authority_class);
create index if not exists idx_rule_activation_requests_status
  on comind_pm.pm_rule_activation_requests(project_id,status,target_environment);
create index if not exists idx_rule_activation_requests_rule
  on comind_pm.pm_rule_activation_requests(rule_id,rule_version,status);
create index if not exists idx_rule_activation_case_links_case
  on comind_pm.pm_rule_activation_case_links(reconciliation_case_id,blocking);
create index if not exists idx_rule_activation_assessments_latest
  on comind_pm.pm_rule_activation_authority_assessments(activation_request_id,authority_id,required_capability,assessed_at desc,id desc);
create index if not exists idx_rule_activation_events_latest
  on comind_pm.pm_rule_activation_events(activation_request_id,occurred_at desc,id desc);

create or replace function comind_pm.reject_rule_governance_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'DRULE-003 governance history is append-only';
end;
$$;

create or replace function comind_pm.enforce_rule_activation_event_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request comind_pm.pm_rule_activation_requests%rowtype;
  v_authority comind_pm.pm_rule_authorities%rowtype;
  v_required_capability text;
  v_determination text;
begin
  select * into v_request
  from comind_pm.pm_rule_activation_requests
  where id = new.activation_request_id;

  if not found then
    raise exception 'Activation request % does not exist', new.activation_request_id;
  end if;

  if new.event_type in ('approved','denied','deferred','activated','superseded','revoked') then
    v_required_capability := case new.event_type
      when 'activated' then 'activate'
      when 'superseded' then 'supersede'
      when 'revoked' then 'revoke'
      else 'approve'
    end;

    if new.authority_id is null then
      raise exception 'Event % requires an authority', new.event_type;
    end if;

    select * into v_authority
    from comind_pm.pm_rule_authorities
    where id = new.authority_id
      and project_id = v_request.project_id;

    if not found then
      raise exception 'Authority % is not valid for activation request project', new.authority_id;
    end if;

    if v_authority.status <> 'active'
       or v_authority.valid_from > new.occurred_at
       or (v_authority.valid_until is not null and v_authority.valid_until <= new.occurred_at)
    then
      raise exception 'Authority % is not active at event time', new.authority_id;
    end if;

    if not (v_required_capability = any(v_authority.capabilities)) then
      raise exception 'Authority % lacks capability %', new.authority_id, v_required_capability;
    end if;

    select a.determination into v_determination
    from comind_pm.pm_rule_activation_authority_assessments a
    where a.activation_request_id = new.activation_request_id
      and a.authority_id = new.authority_id
      and a.required_capability = v_required_capability
    order by a.assessed_at desc, a.id desc
    limit 1;

    if v_determination is distinct from 'sufficient' then
      raise exception 'Latest authority assessment for % is not sufficient', v_required_capability;
    end if;
  end if;

  if new.event_type = 'activated' then
    if v_request.status <> 'approved' then
      raise exception 'Activation request must be approved before activation; current status=%', v_request.status;
    end if;

    if exists (
      select 1
      from comind_pm.pm_rule_activation_case_links l
      join comind_pm.pm_rule_reconciliation_cases c
        on c.id = l.reconciliation_case_id
      where l.activation_request_id = new.activation_request_id
        and l.blocking
        and c.status in ('open','under_review','deferred')
    ) then
      raise exception 'Activation request has unresolved blocking reconciliation cases';
    end if;

    if exists (
      select 1
      from comind_pm.pm_rule_activation_requests other
      join lateral (
        select e.event_type
        from comind_pm.pm_rule_activation_events e
        where e.activation_request_id = other.id
          and e.event_type in ('activated','superseded','revoked')
        order by e.occurred_at desc, e.id desc
        limit 1
      ) latest on true
      where other.id <> new.activation_request_id
        and other.project_id = v_request.project_id
        and other.rule_id = v_request.rule_id
        and other.target_environment = v_request.target_environment
        and other.target_scope = v_request.target_scope
        and latest.event_type = 'activated'
    ) then
      raise exception 'An activation already exists for this rule and exact target scope';
    end if;
  end if;

  if new.event_type in ('superseded','revoked')
     and not exists (
       select 1
       from comind_pm.pm_rule_activation_events e
       where e.activation_request_id = new.activation_request_id
         and e.event_type = 'activated'
         and e.occurred_at <= new.occurred_at
     )
  then
    raise exception '% requires a prior activation event', new.event_type;
  end if;

  return new;
end;
$$;

create or replace function comind_pm.sync_rule_activation_request_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update comind_pm.pm_rule_activation_requests
  set status = case new.event_type
    when 'submitted' then 'pending_review'
    when 'blocked' then 'blocked'
    when 'approved' then 'approved'
    when 'denied' then 'denied'
    when 'deferred' then 'deferred'
    when 'activated' then 'activated'
    when 'superseded' then 'superseded'
    when 'revoked' then 'revoked'
    else status
  end,
  blocked_reason = case
    when new.event_type = 'blocked' then new.rationale
    when new.event_type in ('approved','activated','superseded','revoked') then null
    else blocked_reason
  end,
  updated_at = pg_catalog.now()
  where id = new.activation_request_id;

  return new;
end;
$$;

create or replace function comind_pm.record_rule_activation_submission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into comind_pm.pm_rule_activation_events(
    activation_request_id,event_type,actor,rationale,evidence_refs,occurred_at,metadata
  ) values (
    new.id,'submitted',new.requested_by,'Activation request submitted',new.evidence_refs,new.requested_at,
    jsonb_build_object('request_key',new.request_key)
  );
  return new;
end;
$$;

drop trigger if exists trg_rule_activation_assessments_immutable on comind_pm.pm_rule_activation_authority_assessments;
create trigger trg_rule_activation_assessments_immutable
before update or delete on comind_pm.pm_rule_activation_authority_assessments
for each row execute function comind_pm.reject_rule_governance_history_mutation();

drop trigger if exists trg_rule_activation_events_enforce on comind_pm.pm_rule_activation_events;
create trigger trg_rule_activation_events_enforce
before insert on comind_pm.pm_rule_activation_events
for each row execute function comind_pm.enforce_rule_activation_event_insert();

drop trigger if exists trg_rule_activation_events_immutable on comind_pm.pm_rule_activation_events;
create trigger trg_rule_activation_events_immutable
before update or delete on comind_pm.pm_rule_activation_events
for each row execute function comind_pm.reject_rule_governance_history_mutation();

drop trigger if exists trg_rule_activation_events_sync_status on comind_pm.pm_rule_activation_events;
create trigger trg_rule_activation_events_sync_status
after insert on comind_pm.pm_rule_activation_events
for each row execute function comind_pm.sync_rule_activation_request_status();

drop trigger if exists trg_rule_activation_requests_submission on comind_pm.pm_rule_activation_requests;
create trigger trg_rule_activation_requests_submission
after insert on comind_pm.pm_rule_activation_requests
for each row execute function comind_pm.record_rule_activation_submission();

drop trigger if exists trg_pm_rule_authorities_touch on comind_pm.pm_rule_authorities;
create trigger trg_pm_rule_authorities_touch
before update on comind_pm.pm_rule_authorities
for each row execute function comind_pm.touch_updated_at();

drop trigger if exists trg_pm_rule_activation_requests_touch on comind_pm.pm_rule_activation_requests;
create trigger trg_pm_rule_activation_requests_touch
before update on comind_pm.pm_rule_activation_requests
for each row execute function comind_pm.touch_updated_at();

create or replace view comind_pm.v_rule_activation_readiness
with (security_invoker = true)
as
select
  ar.id as activation_request_id,
  ar.project_id,
  ar.request_key,
  ar.rule_id,
  r.rule_key,
  ar.rule_version,
  ar.requested_state,
  ar.target_environment,
  ar.target_scope,
  ar.status,
  ar.requested_by,
  ar.requested_at,
  ar.rationale,
  coalesce(blockers.blocking_case_count,0) as blocking_case_count,
  coalesce(blockers.blocking_cases,'[]'::jsonb) as blocking_cases,
  coalesce(auths.sufficient_activate_authority_count,0) as sufficient_activate_authority_count,
  (ar.status = 'approved'
    and coalesce(blockers.blocking_case_count,0) = 0
    and coalesce(auths.sufficient_activate_authority_count,0) > 0) as ready_to_activate,
  case
    when ar.status <> 'approved' then 'request_status:' || ar.status
    when coalesce(blockers.blocking_case_count,0) > 0 then 'blocking_reconciliation_case'
    when coalesce(auths.sufficient_activate_authority_count,0) = 0 then 'no_sufficient_activate_authority'
    else 'ready'
  end as readiness_reason
from comind_pm.pm_rule_activation_requests ar
join comind_pm.pm_rules r on r.id = ar.rule_id
left join lateral (
  select
    count(*) as blocking_case_count,
    jsonb_agg(jsonb_build_object(
      'case_id',c.id,
      'case_key',c.case_key,
      'case_type',c.case_type,
      'status',c.status,
      'title',c.title
    ) order by c.case_key) as blocking_cases
  from comind_pm.pm_rule_activation_case_links l
  join comind_pm.pm_rule_reconciliation_cases c on c.id = l.reconciliation_case_id
  where l.activation_request_id = ar.id
    and l.blocking
    and c.status in ('open','under_review','deferred')
) blockers on true
left join lateral (
  select count(*) as sufficient_activate_authority_count
  from (
    select distinct on (a.authority_id)
      a.authority_id,
      a.determination
    from comind_pm.pm_rule_activation_authority_assessments a
    where a.activation_request_id = ar.id
      and a.required_capability = 'activate'
    order by a.authority_id,a.assessed_at desc,a.id desc
  ) latest
  join comind_pm.pm_rule_authorities au on au.id = latest.authority_id
  where latest.determination = 'sufficient'
    and au.project_id = ar.project_id
    and au.status = 'active'
    and 'activate' = any(au.capabilities)
    and au.valid_from <= pg_catalog.now()
    and (au.valid_until is null or au.valid_until > pg_catalog.now())
) auths on true;

create or replace view comind_pm.v_active_rule_authority
with (security_invoker = true)
as
with lifecycle as (
  select distinct on (e.activation_request_id)
    e.activation_request_id,
    e.id as lifecycle_event_id,
    e.event_type,
    e.authority_id,
    e.actor,
    e.rationale as decision_rationale,
    e.evidence_refs as decision_evidence_refs,
    e.occurred_at
  from comind_pm.pm_rule_activation_events e
  where e.event_type in ('activated','superseded','revoked')
  order by e.activation_request_id,e.occurred_at desc,e.id desc
)
select
  ar.project_id,
  ar.id as activation_request_id,
  ar.request_key,
  ar.rule_id,
  r.rule_key,
  r.title,
  ar.rule_version,
  rv.rule_text,
  ar.target_environment,
  ar.target_scope,
  l.lifecycle_event_id,
  l.occurred_at as activated_at,
  l.actor as activated_by,
  l.authority_id,
  au.authority_key,
  au.authority_class,
  au.subject_type as authority_subject_type,
  au.subject_ref as authority_subject_ref,
  au.scope as authority_scope,
  au.evidence_refs as authority_evidence_refs,
  l.decision_rationale,
  l.decision_evidence_refs
from lifecycle l
join comind_pm.pm_rule_activation_requests ar on ar.id = l.activation_request_id
join comind_pm.pm_rules r on r.id = ar.rule_id
join comind_pm.pm_rule_versions rv on rv.rule_id = ar.rule_id and rv.version = ar.rule_version
join comind_pm.pm_rule_authorities au on au.id = l.authority_id
where l.event_type = 'activated';

alter table comind_pm.pm_rule_authorities enable row level security;
alter table comind_pm.pm_rule_activation_requests enable row level security;
alter table comind_pm.pm_rule_activation_case_links enable row level security;
alter table comind_pm.pm_rule_activation_authority_assessments enable row level security;
alter table comind_pm.pm_rule_activation_events enable row level security;

drop policy if exists service_role_full_access on comind_pm.pm_rule_authorities;
create policy service_role_full_access on comind_pm.pm_rule_authorities for all to service_role using (true) with check (true);
drop policy if exists service_role_full_access on comind_pm.pm_rule_activation_requests;
create policy service_role_full_access on comind_pm.pm_rule_activation_requests for all to service_role using (true) with check (true);
drop policy if exists service_role_full_access on comind_pm.pm_rule_activation_case_links;
create policy service_role_full_access on comind_pm.pm_rule_activation_case_links for all to service_role using (true) with check (true);
drop policy if exists service_role_full_access on comind_pm.pm_rule_activation_authority_assessments;
create policy service_role_full_access on comind_pm.pm_rule_activation_authority_assessments for all to service_role using (true) with check (true);
drop policy if exists service_role_full_access on comind_pm.pm_rule_activation_events;
create policy service_role_full_access on comind_pm.pm_rule_activation_events for all to service_role using (true) with check (true);

revoke all on table comind_pm.pm_rule_authorities from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_activation_requests from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_activation_case_links from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_activation_authority_assessments from public, anon, authenticated;
revoke all on table comind_pm.pm_rule_activation_events from public, anon, authenticated;
revoke all on table comind_pm.v_rule_activation_readiness from public, anon, authenticated;
revoke all on table comind_pm.v_active_rule_authority from public, anon, authenticated;

grant all on table comind_pm.pm_rule_authorities to service_role;
grant all on table comind_pm.pm_rule_activation_requests to service_role;
grant all on table comind_pm.pm_rule_activation_case_links to service_role;
grant all on table comind_pm.pm_rule_activation_authority_assessments to service_role;
grant all on table comind_pm.pm_rule_activation_events to service_role;
grant select on comind_pm.v_rule_activation_readiness to service_role;
grant select on comind_pm.v_active_rule_authority to service_role;

revoke all on function comind_pm.reject_rule_governance_history_mutation() from public, anon, authenticated;
revoke all on function comind_pm.enforce_rule_activation_event_insert() from public, anon, authenticated;
revoke all on function comind_pm.sync_rule_activation_request_status() from public, anon, authenticated;
revoke all on function comind_pm.record_rule_activation_submission() from public, anon, authenticated;
grant execute on function comind_pm.reject_rule_governance_history_mutation() to service_role;
grant execute on function comind_pm.enforce_rule_activation_event_insert() to service_role;
grant execute on function comind_pm.sync_rule_activation_request_status() to service_role;
grant execute on function comind_pm.record_rule_activation_submission() to service_role;

commit;
