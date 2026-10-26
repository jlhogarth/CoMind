begin;

create table if not exists comind_pm.pm_authority_scope_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  authority_id uuid not null references comind_pm.pm_rule_authorities(id) on delete restrict,
  binding_key text not null,
  version integer not null default 1,
  domains text[] not null default array['*']::text[],
  environments text[] not null default array['*']::text[],
  operation_classes text[] not null default array['*']::text[],
  resource_classes text[] not null default array['*']::text[],
  capabilities text[] not null,
  authority_level text,
  selector jsonb not null default '{}'::jsonb,
  evidence_refs jsonb not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(authority_id,binding_key,version),
  check (version > 0),
  check (cardinality(domains) > 0),
  check (cardinality(environments) > 0),
  check (cardinality(operation_classes) > 0),
  check (cardinality(resource_classes) > 0),
  check (cardinality(capabilities) > 0),
  check (capabilities <@ array['approve','activate','supersede','override','revoke','recommend']::text[]),
  check (authority_level is null or authority_level in ('C0','C1','C2','C3','C4')),
  check (jsonb_typeof(selector) = 'object'),
  check (case when jsonb_typeof(evidence_refs)='array' then jsonb_array_length(evidence_refs)>0 else false end),
  check (status in ('active','proposed','suspended','expired','revoked','superseded')),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists comind_pm.pm_authority_basis_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  authority_id uuid not null references comind_pm.pm_rule_authorities(id) on delete restrict,
  basis_type text not null,
  rule_id uuid references comind_pm.pm_rules(id) on delete restrict,
  source_document_id uuid references comind_pm.pm_rule_source_documents(id) on delete restrict,
  event_id uuid references comind_pm.pm_events(id) on delete restrict,
  external_ref text,
  basis_role text not null,
  authority_effect text not null,
  rationale text not null,
  evidence_refs jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (basis_type in ('rule','source_document','event','external')),
  check (basis_role in ('establishes','constrains','supports','documents','implements','observes','historical_predecessor','proposes')),
  check (authority_effect in ('governing','evidentiary_only','advisory','historical','proposed')),
  check (num_nonnulls(rule_id,source_document_id,event_id,external_ref)=1),
  check ((basis_type='rule')=(rule_id is not null)),
  check ((basis_type='source_document')=(source_document_id is not null)),
  check ((basis_type='event')=(event_id is not null)),
  check ((basis_type='external')=(external_ref is not null)),
  check (nullif(btrim(rationale),'') is not null),
  check (case when jsonb_typeof(evidence_refs)='array' then jsonb_array_length(evidence_refs)>0 else false end)
);

create table if not exists comind_pm.pm_authority_relationships (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  authority_id uuid not null references comind_pm.pm_rule_authorities(id) on delete restrict,
  related_authority_id uuid not null references comind_pm.pm_rule_authorities(id) on delete restrict,
  relationship_type text not null,
  capabilities text[] not null default '{}'::text[],
  domains text[] not null default array['*']::text[],
  environments text[] not null default array['*']::text[],
  operation_classes text[] not null default array['*']::text[],
  resource_classes text[] not null default array['*']::text[],
  constraint_effect text,
  reconciliation_case_id uuid references comind_pm.pm_rule_reconciliation_cases(id) on delete restrict,
  rationale text not null,
  evidence_refs jsonb not null,
  created_by text not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (authority_id <> related_authority_id),
  check (relationship_type in ('delegates_to','constrains','supersedes','predecessor_of','derived_from','ratifies','conflicts_with')),
  check (capabilities <@ array['approve','activate','supersede','override','revoke','recommend']::text[]),
  check (cardinality(domains) > 0),
  check (cardinality(environments) > 0),
  check (cardinality(operation_classes) > 0),
  check (cardinality(resource_classes) > 0),
  check ((relationship_type='constrains' and constraint_effect in ('deny','require_human','limit')) or (relationship_type<>'constrains' and constraint_effect is null)),
  check (relationship_type<>'conflicts_with' or reconciliation_case_id is not null),
  check (nullif(btrim(rationale),'') is not null),
  check (case when jsonb_typeof(evidence_refs)='array' then jsonb_array_length(evidence_refs)>0 else false end),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists comind_pm.pm_authority_relationship_events (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references comind_pm.pm_authority_relationships(id) on delete restrict,
  event_type text not null,
  actor text not null,
  rationale text not null,
  evidence_refs jsonb not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (event_type in ('proposed','confirmed','rejected','superseded','revoked')),
  check (nullif(btrim(actor),'') is not null),
  check (nullif(btrim(rationale),'') is not null),
  check (case when jsonb_typeof(evidence_refs)='array' then jsonb_array_length(evidence_refs)>0 else false end)
);

create table if not exists comind_pm.pm_authority_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  requirement_key text not null,
  version integer not null default 1,
  operation_class text not null,
  target_environment text not null default '*',
  domain text not null default '*',
  resource_class text not null default '*',
  required_capability text not null,
  required_authority_level text,
  human_required boolean not null default false,
  required_authority_id uuid references comind_pm.pm_rule_authorities(id) on delete restrict,
  governing_rule_id uuid,
  governing_rule_version integer,
  selector jsonb not null default '{}'::jsonb,
  rationale text not null,
  evidence_refs jsonb not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id,requirement_key,version),
  foreign key (governing_rule_id,governing_rule_version)
    references comind_pm.pm_rule_versions(rule_id,version) on delete restrict,
  check (version > 0),
  check (nullif(btrim(operation_class),'') is not null),
  check (required_capability in ('approve','activate','supersede','override','revoke','recommend')),
  check (required_authority_level is null or required_authority_level in ('C0','C1','C2','C3','C4')),
  check ((governing_rule_id is null)=(governing_rule_version is null)),
  check (jsonb_typeof(selector)='object'),
  check (nullif(btrim(rationale),'') is not null),
  check (case when jsonb_typeof(evidence_refs)='array' then jsonb_array_length(evidence_refs)>0 else false end),
  check (status in ('active','proposed','superseded','revoked','expired')),
  check (valid_until is null or valid_until > valid_from)
);

create index if not exists idx_authority_scope_bindings_lookup
  on comind_pm.pm_authority_scope_bindings(project_id,authority_id,status,valid_from,valid_until);
create index if not exists idx_authority_basis_links_authority
  on comind_pm.pm_authority_basis_links(project_id,authority_id,basis_type,authority_effect);
create index if not exists idx_authority_relationships_from
  on comind_pm.pm_authority_relationships(project_id,authority_id,relationship_type,valid_from,valid_until);
create index if not exists idx_authority_relationships_to
  on comind_pm.pm_authority_relationships(project_id,related_authority_id,relationship_type,valid_from,valid_until);
create index if not exists idx_authority_relationship_events_latest
  on comind_pm.pm_authority_relationship_events(relationship_id,occurred_at desc,id desc);
create index if not exists idx_authority_requirements_lookup
  on comind_pm.pm_authority_requirements(project_id,operation_class,target_environment,domain,resource_class,status);

create or replace function comind_pm.reject_authority_graph_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  raise exception 'AUTH-001 graph history is append-only';
end;
$$;

create or replace function comind_pm.validate_authority_scope_binding()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_authority_project uuid;
  v_authority_capabilities text[];
begin
  select project_id,capabilities
  into v_authority_project,v_authority_capabilities
  from comind_pm.pm_rule_authorities
  where id=new.authority_id;

  if not found then
    raise exception 'Authority % does not exist',new.authority_id;
  end if;
  if v_authority_project<>new.project_id then
    raise exception 'Authority scope binding project does not match authority project';
  end if;
  if not (new.capabilities <@ v_authority_capabilities) then
    raise exception 'Scope binding capabilities exceed authority capabilities';
  end if;
  return new;
end;
$$;

create or replace function comind_pm.validate_authority_graph_project_links()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_left_project uuid;
  v_right_project uuid;
  v_case_project uuid;
begin
  select project_id into v_left_project from comind_pm.pm_rule_authorities where id=new.authority_id;
  select project_id into v_right_project from comind_pm.pm_rule_authorities where id=new.related_authority_id;
  if v_left_project is null or v_right_project is null or v_left_project<>new.project_id or v_right_project<>new.project_id then
    raise exception 'Authority relationship project mismatch';
  end if;
  if new.reconciliation_case_id is not null then
    select project_id into v_case_project from comind_pm.pm_rule_reconciliation_cases where id=new.reconciliation_case_id;
    if v_case_project is distinct from new.project_id then
      raise exception 'Authority relationship reconciliation case project mismatch';
    end if;
  end if;
  return new;
end;
$$;

create or replace function comind_pm.validate_authority_basis_link()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_authority_project uuid;
  v_basis_project uuid;
begin
  select project_id into v_authority_project from comind_pm.pm_rule_authorities where id=new.authority_id;
  if v_authority_project is distinct from new.project_id then
    raise exception 'Authority basis project does not match authority project';
  end if;

  if new.rule_id is not null then
    select project_id into v_basis_project from comind_pm.pm_rules where id=new.rule_id;
  elsif new.source_document_id is not null then
    select project_id into v_basis_project from comind_pm.pm_rule_source_documents where id=new.source_document_id;
  elsif new.event_id is not null then
    select project_id into v_basis_project from comind_pm.pm_events where id=new.event_id;
  else
    v_basis_project:=new.project_id;
  end if;

  if v_basis_project is distinct from new.project_id then
    raise exception 'Authority basis evidence project mismatch';
  end if;
  return new;
end;
$$;

create or replace function comind_pm.validate_authority_requirement()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_authority_project uuid;
  v_rule_project uuid;
begin
  if new.required_authority_id is not null then
    select project_id into v_authority_project from comind_pm.pm_rule_authorities where id=new.required_authority_id;
    if v_authority_project is distinct from new.project_id then
      raise exception 'Authority requirement project does not match required authority project';
    end if;
  end if;
  if new.governing_rule_id is not null then
    select project_id into v_rule_project from comind_pm.pm_rules where id=new.governing_rule_id;
    if v_rule_project is distinct from new.project_id then
      raise exception 'Authority requirement project does not match governing rule project';
    end if;
  end if;
  return new;
end;
$$;

create or replace function comind_pm.record_authority_relationship_proposal()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  insert into comind_pm.pm_authority_relationship_events(
    relationship_id,event_type,actor,rationale,evidence_refs,occurred_at,metadata
  ) values (
    new.id,'proposed',new.created_by,new.rationale,new.evidence_refs,new.created_at,
    jsonb_build_object('relationship_type',new.relationship_type)
  );
  return new;
end;
$$;

create or replace view comind_pm.v_authority_scope_current
with (security_invoker=true)
as
select s.*
from comind_pm.pm_authority_scope_bindings s
where s.version=(
  select max(s2.version)
  from comind_pm.pm_authority_scope_bindings s2
  where s2.authority_id=s.authority_id and s2.binding_key=s.binding_key
);

create or replace view comind_pm.v_authority_requirement_current
with (security_invoker=true)
as
select r.*
from comind_pm.pm_authority_requirements r
where r.version=(
  select max(r2.version)
  from comind_pm.pm_authority_requirements r2
  where r2.project_id=r.project_id and r2.requirement_key=r.requirement_key
);

create or replace view comind_pm.v_authority_relationship_current
with (security_invoker=true)
as
select
  r.*,
  e.event_type as relationship_status,
  e.actor as status_actor,
  e.rationale as status_rationale,
  e.evidence_refs as status_evidence_refs,
  e.occurred_at as status_at
from comind_pm.pm_authority_relationships r
join lateral (
  select e1.*
  from comind_pm.pm_authority_relationship_events e1
  where e1.relationship_id=r.id
  order by e1.occurred_at desc,e1.id desc
  limit 1
) e on true;

create or replace view comind_pm.v_authority_delegation_lineage
with (security_invoker=true)
as
with recursive delegation as (
  select
    r.project_id,
    r.authority_id as root_authority_id,
    r.related_authority_id as delegated_authority_id,
    1 as depth,
    array[r.authority_id,r.related_authority_id]::uuid[] as path
  from comind_pm.v_authority_relationship_current r
  where r.relationship_type='delegates_to'
    and r.relationship_status='confirmed'
  union all
  select
    d.project_id,
    d.root_authority_id,
    r.related_authority_id,
    d.depth+1,
    d.path||r.related_authority_id
  from delegation d
  join comind_pm.v_authority_relationship_current r
    on r.project_id=d.project_id
   and r.authority_id=d.delegated_authority_id
   and r.relationship_type='delegates_to'
   and r.relationship_status='confirmed'
  where not r.related_authority_id=any(d.path)
)
select * from delegation;

create or replace function comind_pm.authority_dimension_matches(p_values text[],p_requested text)
returns boolean
language sql
immutable
security invoker
set search_path=''
as $$
  select '*'=any(p_values) or p_requested=any(p_values)
$$;

create or replace function comind_pm.enforce_authority_relationship_event()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_relationship comind_pm.pm_authority_relationships%rowtype;
  v_cycle boolean;
begin
  select * into v_relationship
  from comind_pm.pm_authority_relationships
  where id=new.relationship_id;

  if not found then
    raise exception 'Authority relationship % does not exist',new.relationship_id;
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

create or replace function comind_pm.resolve_authority_request(
  p_project_id uuid,
  p_authority_id uuid,
  p_capability text,
  p_action text,
  p_resource_class text,
  p_environment text,
  p_domain text,
  p_context jsonb default '{}'::jsonb,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_authority comind_pm.pm_rule_authorities%rowtype;
  v_scope comind_pm.pm_authority_scope_bindings%rowtype;
  v_delegation_path uuid[];
  v_delegation_root uuid;
  v_conflicts jsonb;
  v_superseders jsonb;
  v_constraints jsonb;
  v_requirement_failures jsonb;
  v_requirement_count integer:=0;
  v_level text;
begin
  if p_capability not in ('approve','activate','supersede','override','revoke','recommend') then
    return jsonb_build_object('determination','inapplicable','reason','unknown_capability');
  end if;
  if jsonb_typeof(p_context)<>'object' then
    return jsonb_build_object('determination','inapplicable','reason','context_must_be_object');
  end if;

  select * into v_authority
  from comind_pm.pm_rule_authorities
  where id=p_authority_id and project_id=p_project_id;

  if not found then
    return jsonb_build_object('determination','inapplicable','reason','authority_not_found');
  end if;

  if v_authority.status<>'active'
     or v_authority.valid_from>p_at
     or (v_authority.valid_until is not null and v_authority.valid_until<=p_at)
  then
    return jsonb_build_object('determination','inapplicable','reason','authority_not_active','authority_key',v_authority.authority_key);
  end if;

  if v_authority.authority_class in ('advisory','evidentiary_only') then
    return jsonb_build_object('determination','inapplicable','reason','authority_class_cannot_grant_permission','authority_key',v_authority.authority_key,'authority_class',v_authority.authority_class);
  end if;

  if not (p_capability=any(v_authority.capabilities)) then
    return jsonb_build_object('determination','insufficient','reason','capability_not_granted','authority_key',v_authority.authority_key);
  end if;

  select s.* into v_scope
  from comind_pm.v_authority_scope_current s
  where s.project_id=p_project_id
    and s.authority_id=p_authority_id
    and s.status='active'
    and s.valid_from<=p_at
    and (s.valid_until is null or s.valid_until>p_at)
    and p_capability=any(s.capabilities)
    and comind_pm.authority_dimension_matches(s.domains,p_domain)
    and comind_pm.authority_dimension_matches(s.environments,p_environment)
    and comind_pm.authority_dimension_matches(s.operation_classes,p_action)
    and comind_pm.authority_dimension_matches(s.resource_classes,p_resource_class)
  order by s.version desc,s.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('determination','inapplicable','reason','no_matching_authority_scope','authority_key',v_authority.authority_key);
  end if;
  v_level:=v_scope.authority_level;

  if v_authority.authority_class='delegated_authority' then
    with recursive chain as (
      select p_authority_id as authority_id,array[p_authority_id]::uuid[] as path,0 as depth
      union all
      select r.authority_id,c.path||r.authority_id,c.depth+1
      from chain c
      join comind_pm.v_authority_relationship_current r
        on r.project_id=p_project_id
       and r.related_authority_id=c.authority_id
       and r.relationship_type='delegates_to'
       and r.relationship_status='confirmed'
       and r.valid_from<=p_at
       and (r.valid_until is null or r.valid_until>p_at)
       and (cardinality(r.capabilities)=0 or p_capability=any(r.capabilities))
       and comind_pm.authority_dimension_matches(r.domains,p_domain)
       and comind_pm.authority_dimension_matches(r.environments,p_environment)
       and comind_pm.authority_dimension_matches(r.operation_classes,p_action)
       and comind_pm.authority_dimension_matches(r.resource_classes,p_resource_class)
      where not r.authority_id=any(c.path)
    )
    select c.path,c.authority_id
    into v_delegation_path,v_delegation_root
    from chain c
    join comind_pm.pm_rule_authorities root on root.id=c.authority_id
    where c.depth>0
      and root.status='active'
      and root.valid_from<=p_at
      and (root.valid_until is null or root.valid_until>p_at)
      and root.authority_class<>'delegated_authority'
      and p_capability=any(root.capabilities)
      and exists(
        select 1
        from comind_pm.v_authority_scope_current rs
        where rs.authority_id=root.id
          and rs.project_id=p_project_id
          and rs.status='active'
          and rs.valid_from<=p_at
          and (rs.valid_until is null or rs.valid_until>p_at)
          and p_capability=any(rs.capabilities)
          and comind_pm.authority_dimension_matches(rs.domains,p_domain)
          and comind_pm.authority_dimension_matches(rs.environments,p_environment)
          and comind_pm.authority_dimension_matches(rs.operation_classes,p_action)
          and comind_pm.authority_dimension_matches(rs.resource_classes,p_resource_class)
      )
    order by c.depth
    limit 1;

    if v_delegation_path is null then
      return jsonb_build_object('determination','insufficient','reason','delegated_authority_has_no_valid_delegation_lineage','authority_key',v_authority.authority_key);
    end if;
  else
    v_delegation_path:=array[p_authority_id]::uuid[];
    v_delegation_root:=p_authority_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'relationship_id',r.id,
      'authority_key',a.authority_key,
      'case_key',c.case_key,
      'case_status',c.status
    ) order by a.authority_key),'[]'::jsonb)
  into v_conflicts
  from comind_pm.v_authority_relationship_current r
  join comind_pm.pm_rule_authorities a
    on a.id=case when r.authority_id=p_authority_id then r.related_authority_id else r.authority_id end
  join comind_pm.pm_rule_reconciliation_cases c on c.id=r.reconciliation_case_id
  where r.project_id=p_project_id
    and r.relationship_type='conflicts_with'
    and r.relationship_status='confirmed'
    and (r.authority_id=p_authority_id or r.related_authority_id=p_authority_id)
    and c.status in ('open','under_review','deferred')
    and r.valid_from<=p_at
    and (r.valid_until is null or r.valid_until>p_at)
    and (cardinality(r.capabilities)=0 or p_capability=any(r.capabilities))
    and comind_pm.authority_dimension_matches(r.domains,p_domain)
    and comind_pm.authority_dimension_matches(r.environments,p_environment)
    and comind_pm.authority_dimension_matches(r.operation_classes,p_action)
    and comind_pm.authority_dimension_matches(r.resource_classes,p_resource_class);

  if jsonb_array_length(v_conflicts)>0 then
    return jsonb_build_object('determination','unresolved','reason','open_authority_conflict','authority_key',v_authority.authority_key,'conflicts',v_conflicts,'delegation_path',to_jsonb(v_delegation_path));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('relationship_id',r.id,'authority_key',a.authority_key) order by a.authority_key),'[]'::jsonb)
  into v_superseders
  from comind_pm.v_authority_relationship_current r
  join comind_pm.pm_rule_authorities a on a.id=r.authority_id
  where r.project_id=p_project_id
    and r.relationship_type='supersedes'
    and r.relationship_status='confirmed'
    and r.related_authority_id=p_authority_id
    and a.status='active'
    and a.valid_from<=p_at
    and (a.valid_until is null or a.valid_until>p_at)
    and r.valid_from<=p_at
    and (r.valid_until is null or r.valid_until>p_at)
    and (cardinality(r.capabilities)=0 or p_capability=any(r.capabilities))
    and comind_pm.authority_dimension_matches(r.domains,p_domain)
    and comind_pm.authority_dimension_matches(r.environments,p_environment)
    and comind_pm.authority_dimension_matches(r.operation_classes,p_action)
    and comind_pm.authority_dimension_matches(r.resource_classes,p_resource_class);

  if jsonb_array_length(v_superseders)>0 then
    return jsonb_build_object('determination','inapplicable','reason','authority_superseded','authority_key',v_authority.authority_key,'superseded_by',v_superseders);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'relationship_id',r.id,
      'authority_key',a.authority_key,
      'effect',r.constraint_effect
    ) order by a.authority_key),'[]'::jsonb)
  into v_constraints
  from comind_pm.v_authority_relationship_current r
  join comind_pm.pm_rule_authorities a on a.id=r.authority_id
  where r.project_id=p_project_id
    and r.relationship_type='constrains'
    and r.relationship_status='confirmed'
    and r.related_authority_id=p_authority_id
    and a.status='active'
    and a.valid_from<=p_at
    and (a.valid_until is null or a.valid_until>p_at)
    and r.valid_from<=p_at
    and (r.valid_until is null or r.valid_until>p_at)
    and (cardinality(r.capabilities)=0 or p_capability=any(r.capabilities))
    and comind_pm.authority_dimension_matches(r.domains,p_domain)
    and comind_pm.authority_dimension_matches(r.environments,p_environment)
    and comind_pm.authority_dimension_matches(r.operation_classes,p_action)
    and comind_pm.authority_dimension_matches(r.resource_classes,p_resource_class);

  if exists(select 1 from jsonb_array_elements(v_constraints) e where e->>'effect'='deny') then
    return jsonb_build_object('determination','insufficient','reason','authority_constrained_deny','authority_key',v_authority.authority_key,'constraints',v_constraints);
  end if;
  if exists(select 1 from jsonb_array_elements(v_constraints) e where e->>'effect'='require_human') and v_authority.subject_type<>'human' then
    return jsonb_build_object('determination','insufficient','reason','constraint_requires_human','authority_key',v_authority.authority_key,'constraints',v_constraints);
  end if;
  if exists(select 1 from jsonb_array_elements(v_constraints) e where e->>'effect'='limit') then
    return jsonb_build_object('determination','unresolved','reason','authority_constraint_requires_further_evaluation','authority_key',v_authority.authority_key,'constraints',v_constraints);
  end if;

  select count(*),coalesce(jsonb_agg(failure order by failure->>'requirement_key'),'[]'::jsonb)
  into v_requirement_count,v_requirement_failures
  from (
    select jsonb_build_object(
      'requirement_key',req.requirement_key,
      'version',req.version,
      'reason',case
        when req.human_required and v_authority.subject_type<>'human' then 'human_required'
        when req.required_authority_level is not null and v_level is distinct from req.required_authority_level then 'authority_level_required:'||req.required_authority_level
        when req.required_authority_id is not null and not (req.required_authority_id=any(v_delegation_path)) then 'required_authority_not_in_delegation_lineage'
        else null
      end,
      'governing_rule_id',req.governing_rule_id,
      'governing_rule_version',req.governing_rule_version
    ) as failure
    from comind_pm.v_authority_requirement_current req
    where req.project_id=p_project_id
      and req.status='active'
      and req.valid_from<=p_at
      and (req.valid_until is null or req.valid_until>p_at)
      and req.required_capability=p_capability
      and (req.operation_class='*' or req.operation_class=p_action)
      and (req.target_environment='*' or req.target_environment=p_environment)
      and (req.domain='*' or req.domain=p_domain)
      and (req.resource_class='*' or req.resource_class=p_resource_class)
      and (
        (req.human_required and v_authority.subject_type<>'human')
        or (req.required_authority_level is not null and v_level is distinct from req.required_authority_level)
        or (req.required_authority_id is not null and not (req.required_authority_id=any(v_delegation_path)))
      )
  ) failures;

  if v_requirement_count>0 then
    return jsonb_build_object('determination','insufficient','reason','authority_requirements_not_satisfied','authority_key',v_authority.authority_key,'requirement_failures',v_requirement_failures,'delegation_path',to_jsonb(v_delegation_path),'scope_binding_key',v_scope.binding_key,'authority_level',v_level);
  end if;

  return jsonb_build_object(
    'determination','sufficient',
    'reason','authority_scope_and_constraints_satisfied',
    'authority_key',v_authority.authority_key,
    'authority_class',v_authority.authority_class,
    'subject_type',v_authority.subject_type,
    'subject_ref',v_authority.subject_ref,
    'capability',p_capability,
    'action',p_action,
    'resource_class',p_resource_class,
    'environment',p_environment,
    'domain',p_domain,
    'context',p_context,
    'scope_binding_key',v_scope.binding_key,
    'authority_level',v_level,
    'delegation_root_authority_id',v_delegation_root,
    'delegation_path',to_jsonb(v_delegation_path),
    'constraints',v_constraints
  );
end;
$$;

drop trigger if exists trg_authority_scope_binding_validate on comind_pm.pm_authority_scope_bindings;
create trigger trg_authority_scope_binding_validate
before insert on comind_pm.pm_authority_scope_bindings
for each row execute function comind_pm.validate_authority_scope_binding();

drop trigger if exists trg_authority_scope_binding_immutable on comind_pm.pm_authority_scope_bindings;
create trigger trg_authority_scope_binding_immutable
before update or delete on comind_pm.pm_authority_scope_bindings
for each row execute function comind_pm.reject_authority_graph_history_mutation();

drop trigger if exists trg_authority_basis_validate on comind_pm.pm_authority_basis_links;
create trigger trg_authority_basis_validate
before insert on comind_pm.pm_authority_basis_links
for each row execute function comind_pm.validate_authority_basis_link();

drop trigger if exists trg_authority_basis_immutable on comind_pm.pm_authority_basis_links;
create trigger trg_authority_basis_immutable
before update or delete on comind_pm.pm_authority_basis_links
for each row execute function comind_pm.reject_authority_graph_history_mutation();

drop trigger if exists trg_authority_relationship_validate on comind_pm.pm_authority_relationships;
create trigger trg_authority_relationship_validate
before insert on comind_pm.pm_authority_relationships
for each row execute function comind_pm.validate_authority_graph_project_links();

drop trigger if exists trg_authority_relationship_immutable on comind_pm.pm_authority_relationships;
create trigger trg_authority_relationship_immutable
before update or delete on comind_pm.pm_authority_relationships
for each row execute function comind_pm.reject_authority_graph_history_mutation();

drop trigger if exists trg_authority_relationship_proposal on comind_pm.pm_authority_relationships;
create trigger trg_authority_relationship_proposal
after insert on comind_pm.pm_authority_relationships
for each row execute function comind_pm.record_authority_relationship_proposal();

drop trigger if exists trg_authority_relationship_event_enforce on comind_pm.pm_authority_relationship_events;
create trigger trg_authority_relationship_event_enforce
before insert on comind_pm.pm_authority_relationship_events
for each row execute function comind_pm.enforce_authority_relationship_event();

drop trigger if exists trg_authority_relationship_event_immutable on comind_pm.pm_authority_relationship_events;
create trigger trg_authority_relationship_event_immutable
before update or delete on comind_pm.pm_authority_relationship_events
for each row execute function comind_pm.reject_authority_graph_history_mutation();

drop trigger if exists trg_authority_requirement_validate on comind_pm.pm_authority_requirements;
create trigger trg_authority_requirement_validate
before insert on comind_pm.pm_authority_requirements
for each row execute function comind_pm.validate_authority_requirement();

drop trigger if exists trg_authority_requirement_immutable on comind_pm.pm_authority_requirements;
create trigger trg_authority_requirement_immutable
before update or delete on comind_pm.pm_authority_requirements
for each row execute function comind_pm.reject_authority_graph_history_mutation();

alter table comind_pm.pm_authority_scope_bindings enable row level security;
alter table comind_pm.pm_authority_basis_links enable row level security;
alter table comind_pm.pm_authority_relationships enable row level security;
alter table comind_pm.pm_authority_relationship_events enable row level security;
alter table comind_pm.pm_authority_requirements enable row level security;

drop policy if exists service_role_full_access on comind_pm.pm_authority_scope_bindings;
create policy service_role_full_access on comind_pm.pm_authority_scope_bindings for all to service_role using(true) with check(true);
drop policy if exists service_role_full_access on comind_pm.pm_authority_basis_links;
create policy service_role_full_access on comind_pm.pm_authority_basis_links for all to service_role using(true) with check(true);
drop policy if exists service_role_full_access on comind_pm.pm_authority_relationships;
create policy service_role_full_access on comind_pm.pm_authority_relationships for all to service_role using(true) with check(true);
drop policy if exists service_role_full_access on comind_pm.pm_authority_relationship_events;
create policy service_role_full_access on comind_pm.pm_authority_relationship_events for all to service_role using(true) with check(true);
drop policy if exists service_role_full_access on comind_pm.pm_authority_requirements;
create policy service_role_full_access on comind_pm.pm_authority_requirements for all to service_role using(true) with check(true);

revoke all on table comind_pm.pm_authority_scope_bindings from public,anon,authenticated;
revoke all on table comind_pm.pm_authority_basis_links from public,anon,authenticated;
revoke all on table comind_pm.pm_authority_relationships from public,anon,authenticated;
revoke all on table comind_pm.pm_authority_relationship_events from public,anon,authenticated;
revoke all on table comind_pm.pm_authority_requirements from public,anon,authenticated;
revoke all on table comind_pm.v_authority_scope_current from public,anon,authenticated;
revoke all on table comind_pm.v_authority_requirement_current from public,anon,authenticated;
revoke all on table comind_pm.v_authority_relationship_current from public,anon,authenticated;
revoke all on table comind_pm.v_authority_delegation_lineage from public,anon,authenticated;

grant all on table comind_pm.pm_authority_scope_bindings to service_role;
grant all on table comind_pm.pm_authority_basis_links to service_role;
grant all on table comind_pm.pm_authority_relationships to service_role;
grant all on table comind_pm.pm_authority_relationship_events to service_role;
grant all on table comind_pm.pm_authority_requirements to service_role;
grant select on comind_pm.v_authority_scope_current to service_role;
grant select on comind_pm.v_authority_requirement_current to service_role;
grant select on comind_pm.v_authority_relationship_current to service_role;
grant select on comind_pm.v_authority_delegation_lineage to service_role;

revoke all on function comind_pm.reject_authority_graph_history_mutation() from public,anon,authenticated;
revoke all on function comind_pm.validate_authority_scope_binding() from public,anon,authenticated;
revoke all on function comind_pm.validate_authority_graph_project_links() from public,anon,authenticated;
revoke all on function comind_pm.validate_authority_basis_link() from public,anon,authenticated;
revoke all on function comind_pm.validate_authority_requirement() from public,anon,authenticated;
revoke all on function comind_pm.record_authority_relationship_proposal() from public,anon,authenticated;
revoke all on function comind_pm.authority_dimension_matches(text[],text) from public,anon,authenticated;
revoke all on function comind_pm.enforce_authority_relationship_event() from public,anon,authenticated;
revoke all on function comind_pm.resolve_authority_request(uuid,uuid,text,text,text,text,text,jsonb,timestamptz) from public,anon,authenticated;

grant execute on function comind_pm.reject_authority_graph_history_mutation() to service_role;
grant execute on function comind_pm.validate_authority_scope_binding() to service_role;
grant execute on function comind_pm.validate_authority_graph_project_links() to service_role;
grant execute on function comind_pm.validate_authority_basis_link() to service_role;
grant execute on function comind_pm.validate_authority_requirement() to service_role;
grant execute on function comind_pm.record_authority_relationship_proposal() to service_role;
grant execute on function comind_pm.authority_dimension_matches(text[],text) to service_role;
grant execute on function comind_pm.enforce_authority_relationship_event() to service_role;
grant execute on function comind_pm.resolve_authority_request(uuid,uuid,text,text,text,text,text,jsonb,timestamptz) to service_role;

commit;
