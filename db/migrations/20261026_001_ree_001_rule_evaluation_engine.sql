begin;

create table if not exists comind_pm.pm_rule_evaluation_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  request_key text not null,
  authority_id uuid not null references comind_pm.pm_rule_authorities(id) on delete restrict,
  capability text not null,
  action text not null,
  resource_class text not null,
  environment text not null,
  domain text not null,
  subject_type text not null,
  subject_ref text not null,
  facts jsonb not null default '{}'::jsonb,
  evidence_claims jsonb not null default '[]'::jsonb,
  context jsonb not null default '{}'::jsonb,
  requested_by text not null,
  requested_by_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(project_id,request_key),
  check (nullif(btrim(request_key),'') is not null),
  check (capability in ('approve','activate','supersede','override','revoke','recommend')),
  check (nullif(btrim(action),'') is not null),
  check (nullif(btrim(resource_class),'') is not null),
  check (nullif(btrim(environment),'') is not null),
  check (nullif(btrim(domain),'') is not null),
  check (nullif(btrim(subject_type),'') is not null),
  check (nullif(btrim(subject_ref),'') is not null),
  check (jsonb_typeof(facts)='object'),
  check (jsonb_typeof(context)='object'),
  check (jsonb_typeof(metadata)='object'),
  check (nullif(btrim(requested_by),'') is not null),
  check (nullif(btrim(requested_by_type),'') is not null)
);

create table if not exists comind_pm.pm_rule_evaluation_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references comind_pm.pm_rule_evaluation_requests(id) on delete restrict,
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  rule_id uuid not null references comind_pm.pm_rules(id) on delete restrict,
  rule_version integer not null,
  evaluator_version text not null,
  contract_kind text not null,
  formalization_status text not null,
  formalization_reason text not null,
  enforcement_mode text not null,
  authority_result jsonb not null,
  outcome text not null,
  reason_code text not null,
  diagnostics jsonb not null default '{}'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(request_id,rule_id,rule_version,evaluator_version),
  foreign key (rule_id,rule_version)
    references comind_pm.pm_rule_versions(rule_id,version) on delete restrict,
  check (rule_version>0),
  check (nullif(btrim(evaluator_version),'') is not null),
  check (contract_kind in ('empty','evidence_requirements_v1','unsupported','malformed','not_applicable')),
  check (formalization_status in ('ready','not_ready')),
  check (nullif(btrim(formalization_reason),'') is not null),
  check (enforcement_mode in ('automated_gate','hard_constraint','review_required','informational')),
  check (jsonb_typeof(authority_result)='object'),
  check (outcome in ('allow','deny','require_review','not_applicable','insufficient_evidence','unresolved','not_machine_evaluable')),
  check (nullif(btrim(reason_code),'') is not null),
  check (jsonb_typeof(diagnostics)='object'),
  check (jsonb_typeof(evidence_refs)='array')
);

create index if not exists idx_rule_evaluation_requests_lookup
  on comind_pm.pm_rule_evaluation_requests(project_id,requested_at desc,id desc);
create index if not exists idx_rule_evaluation_requests_authority
  on comind_pm.pm_rule_evaluation_requests(project_id,authority_id,environment,domain,action);
create index if not exists idx_rule_evaluation_results_request
  on comind_pm.pm_rule_evaluation_results(request_id,evaluated_at desc,id desc);
create index if not exists idx_rule_evaluation_results_rule
  on comind_pm.pm_rule_evaluation_results(project_id,rule_id,rule_version,evaluated_at desc);
create index if not exists idx_rule_evaluation_results_outcome
  on comind_pm.pm_rule_evaluation_results(project_id,outcome,evaluated_at desc);

create or replace function comind_pm.ree_object_has_only_keys(p_object jsonb,p_allowed text[])
returns boolean
language sql
immutable
security invoker
set search_path=''
as $$
  select case
    when jsonb_typeof(p_object)<>'object' then false
    else not exists(
      select 1
      from jsonb_object_keys(p_object) as k(key)
      where not (k.key=any(p_allowed))
    )
  end
$$;

create or replace function comind_pm.ree_valid_evidence_claims(p_evidence jsonb)
returns boolean
language sql
immutable
security invoker
set search_path=''
as $$
  select case
    when jsonb_typeof(p_evidence)<>'array' then false
    else not exists(
      select 1
      from jsonb_array_elements(p_evidence) as e(item)
      where jsonb_typeof(e.item)<>'object'
         or not comind_pm.ree_object_has_only_keys(
              e.item,
              array['evidence_type','evidence_ref','approval_status','evidence_status','metadata']::text[]
            )
         or nullif(btrim(e.item->>'evidence_type'),'') is null
         or nullif(btrim(e.item->>'evidence_ref'),'') is null
         or (e.item ? 'approval_status' and nullif(btrim(e.item->>'approval_status'),'') is null)
         or (e.item ? 'evidence_status' and nullif(btrim(e.item->>'evidence_status'),'') is null)
         or (e.item ? 'metadata' and jsonb_typeof(e.item->'metadata')<>'object')
    )
  end
$$;

create or replace function comind_pm.ree_supported_evidence_requirements_contract(p_formal_rule jsonb)
returns boolean
language sql
immutable
security invoker
set search_path=''
as $$
  select case
    when jsonb_typeof(p_formal_rule)<>'object' then false
    when not comind_pm.ree_object_has_only_keys(
      p_formal_rule,
      array['subject','target_status','requires']::text[]
    ) then false
    when nullif(btrim(p_formal_rule->>'subject'),'') is null then false
    when nullif(btrim(p_formal_rule->>'target_status'),'') is null then false
    when not (p_formal_rule ? 'requires') then false
    when jsonb_typeof(p_formal_rule->'requires')<>'array' then false
    when jsonb_array_length(p_formal_rule->'requires')=0 then false
    else not exists(
      select 1
      from jsonb_array_elements(p_formal_rule->'requires') as r(requirement)
      where jsonb_typeof(r.requirement)<>'object'
         or not comind_pm.ree_object_has_only_keys(
              r.requirement,
              array['evidence_type','minimum_count','approval_status','evidence_status']::text[]
            )
         or nullif(btrim(r.requirement->>'evidence_type'),'') is null
         or not (r.requirement ? 'minimum_count')
         or not ((r.requirement->>'minimum_count') ~ '^[1-9][0-9]*$')
         or (r.requirement ? 'approval_status' and nullif(btrim(r.requirement->>'approval_status'),'') is null)
         or (r.requirement ? 'evidence_status' and nullif(btrim(r.requirement->>'evidence_status'),'') is null)
    )
  end
$$;

create or replace function comind_pm.ree_contract_kind(p_formal_rule jsonb)
returns text
language sql
immutable
security invoker
set search_path=''
as $$
  select case
    when jsonb_typeof(p_formal_rule)<>'object' then 'malformed'
    when p_formal_rule='{}'::jsonb then 'empty'
    when comind_pm.ree_supported_evidence_requirements_contract(p_formal_rule) then 'evidence_requirements_v1'
    else 'unsupported'
  end
$$;

create or replace function comind_pm.ree_rule_formalization_readiness(p_rule_id uuid,p_version integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_rule comind_pm.pm_rules%rowtype;
  v_version comind_pm.pm_rule_versions%rowtype;
  v_kind text;
begin
  select * into v_rule
  from comind_pm.pm_rules
  where id=p_rule_id;
  if not found then
    return jsonb_build_object('status','not_ready','reason','rule_not_found','contract_kind','not_applicable');
  end if;

  select * into v_version
  from comind_pm.pm_rule_versions
  where rule_id=p_rule_id and version=p_version;
  if not found then
    return jsonb_build_object('status','not_ready','reason','rule_version_not_found','contract_kind','not_applicable');
  end if;

  if v_rule.status<>'active' then
    return jsonb_build_object('status','not_ready','reason','rule_not_active','contract_kind','not_applicable');
  end if;
  if v_rule.current_version<>p_version then
    return jsonb_build_object('status','not_ready','reason','rule_version_not_current','contract_kind','not_applicable');
  end if;
  if v_version.approval_status<>'approved' then
    return jsonb_build_object('status','not_ready','reason','rule_version_not_approved','contract_kind','not_applicable');
  end if;
  if not v_rule.machine_checkable then
    return jsonb_build_object('status','not_ready','reason','rule_not_machine_checkable','contract_kind','not_applicable');
  end if;

  v_kind:=comind_pm.ree_contract_kind(v_version.formal_rule);
  if v_kind='evidence_requirements_v1' and v_version.validation->>'result'='allow_only_if_requirement_satisfied' then
    return jsonb_build_object('status','ready','reason','supported_contract','contract_kind',v_kind);
  end if;
  if v_kind='evidence_requirements_v1' then
    return jsonb_build_object('status','not_ready','reason','unsupported_validation_semantics','contract_kind',v_kind);
  end if;
  if v_kind='empty' then
    return jsonb_build_object('status','not_ready','reason','empty_formal_rule','contract_kind',v_kind);
  end if;
  if v_kind='malformed' then
    return jsonb_build_object('status','not_ready','reason','malformed_formal_rule','contract_kind',v_kind);
  end if;
  return jsonb_build_object('status','not_ready','reason','unsupported_formal_rule','contract_kind',v_kind);
end;
$$;

create or replace function comind_pm.validate_rule_evaluation_request()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_authority_project uuid;
begin
  select project_id into v_authority_project
  from comind_pm.pm_rule_authorities
  where id=new.authority_id;
  if not found then
    raise exception 'REE-001 authority % does not exist',new.authority_id;
  end if;
  if v_authority_project<>new.project_id then
    raise exception 'REE-001 evaluation request authority project mismatch';
  end if;
  if not comind_pm.ree_valid_evidence_claims(new.evidence_claims) then
    raise exception 'REE-001 evidence_claims must be an array of bounded typed evidence claims';
  end if;
  return new;
end;
$$;

create or replace function comind_pm.reject_rule_evaluation_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  raise exception 'REE-001 evaluation history is append-only';
end;
$$;

create or replace function comind_pm.ree_evidence_requirement_diagnostics(
  p_formal_rule jsonb,
  p_evidence_claims jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path=''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requirement_index',req.ordinality,
        'evidence_type',req.requirement->>'evidence_type',
        'minimum_count',(req.requirement->>'minimum_count')::integer,
        'approval_status',req.requirement->>'approval_status',
        'evidence_status',req.requirement->>'evidence_status',
        'matched_count',matched.matched_count,
        'satisfied',matched.matched_count >= (req.requirement->>'minimum_count')::integer
      )
      order by req.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(p_formal_rule->'requires') with ordinality as req(requirement,ordinality)
  cross join lateral (
    select count(*)::integer as matched_count
    from jsonb_array_elements(p_evidence_claims) as ev(claim)
    where ev.claim->>'evidence_type'=req.requirement->>'evidence_type'
      and (
        not (req.requirement ? 'approval_status')
        or ev.claim->>'approval_status'=req.requirement->>'approval_status'
      )
      and (
        not (req.requirement ? 'evidence_status')
        or ev.claim->>'evidence_status'=req.requirement->>'evidence_status'
      )
  ) as matched
$$;

create or replace function comind_pm.ree_evaluate_request_rule(
  p_request_id uuid,
  p_rule_id uuid,
  p_rule_version integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request comind_pm.pm_rule_evaluation_requests%rowtype;
  v_rule comind_pm.pm_rules%rowtype;
  v_version comind_pm.pm_rule_versions%rowtype;
  v_existing comind_pm.pm_rule_evaluation_results%rowtype;
  v_readiness jsonb;
  v_contract_kind text;
  v_formalization_status text;
  v_formalization_reason text;
  v_authority_result jsonb:='{}'::jsonb;
  v_outcome text;
  v_reason text;
  v_diagnostics jsonb:='{}'::jsonb;
  v_evidence_refs jsonb:='[]'::jsonb;
  v_evaluator_version constant text:='ree-001/evidence-requirements-v1';
  v_result_id uuid;
  v_unsatisfied boolean:=false;
begin
  select * into v_existing
  from comind_pm.pm_rule_evaluation_results
  where request_id=p_request_id
    and rule_id=p_rule_id
    and rule_version=p_rule_version
    and evaluator_version=v_evaluator_version;
  if found then
    return jsonb_build_object(
      'result_id',v_existing.id,
      'outcome',v_existing.outcome,
      'reason_code',v_existing.reason_code,
      'reused',true
    );
  end if;

  select * into v_request
  from comind_pm.pm_rule_evaluation_requests
  where id=p_request_id;
  if not found then
    raise exception 'REE-001 evaluation request % does not exist',p_request_id;
  end if;

  select * into v_rule
  from comind_pm.pm_rules
  where id=p_rule_id;
  if not found then
    raise exception 'REE-001 rule % does not exist',p_rule_id;
  end if;
  if v_rule.project_id<>v_request.project_id then
    raise exception 'REE-001 rule/request project mismatch';
  end if;

  select * into v_version
  from comind_pm.pm_rule_versions
  where rule_id=p_rule_id and version=p_rule_version;
  if not found then
    raise exception 'REE-001 rule version %.% does not exist',p_rule_id,p_rule_version;
  end if;

  v_readiness:=comind_pm.ree_rule_formalization_readiness(p_rule_id,p_rule_version);
  v_contract_kind:=coalesce(v_readiness->>'contract_kind','not_applicable');
  v_formalization_status:=coalesce(v_readiness->>'status','not_ready');
  v_formalization_reason:=coalesce(v_readiness->>'reason','unknown_readiness');

  if v_formalization_reason='rule_not_active' then
    v_outcome:='not_applicable';
    v_reason:='rule_not_active';
  elsif v_formalization_reason in ('rule_version_not_current','rule_version_not_approved') then
    v_outcome:='not_machine_evaluable';
    v_reason:=v_formalization_reason;
  elsif v_formalization_status='not_ready' and v_rule.enforcement_mode<>'review_required' then
    v_outcome:='not_machine_evaluable';
    v_reason:=v_formalization_reason;
  else
    v_authority_result:=comind_pm.resolve_authority_request(
      v_request.project_id,
      v_request.authority_id,
      v_request.capability,
      v_request.action,
      v_request.resource_class,
      v_request.environment,
      v_request.domain,
      v_request.context,
      v_request.requested_at
    );

    if v_authority_result->>'determination'='unresolved' then
      v_outcome:='unresolved';
      v_reason:='authority_unresolved';
    elsif v_authority_result->>'determination'<>'sufficient' then
      v_outcome:='deny';
      v_reason:='authority_'||coalesce(v_authority_result->>'determination','unknown');
    elsif v_rule.enforcement_mode='review_required' then
      v_outcome:='require_review';
      v_reason:='human_review_required';
    elsif v_contract_kind<>'evidence_requirements_v1' then
      v_outcome:='not_machine_evaluable';
      v_reason:=v_formalization_reason;
    elsif v_rule.domain<>v_request.domain then
      v_outcome:='not_applicable';
      v_reason:='rule_domain_mismatch';
    elsif v_version.formal_rule->>'subject'<>v_request.subject_type then
      v_outcome:='not_applicable';
      v_reason:='subject_type_mismatch';
    elsif not (v_request.facts ? 'target_status') then
      v_outcome:='insufficient_evidence';
      v_reason:='missing_target_status_fact';
    elsif v_version.formal_rule->>'target_status'<>v_request.facts->>'target_status' then
      v_outcome:='not_applicable';
      v_reason:='target_status_mismatch';
    else
      v_diagnostics:=jsonb_build_object(
        'requirements',
        comind_pm.ree_evidence_requirement_diagnostics(
          v_version.formal_rule,
          v_request.evidence_claims
        )
      );
      select exists(
        select 1
        from jsonb_array_elements(v_diagnostics->'requirements') as d(item)
        where coalesce((d.item->>'satisfied')::boolean,false)=false
      ) into v_unsatisfied;

      select coalesce(jsonb_agg(distinct e.claim->>'evidence_ref'),'[]'::jsonb)
      into v_evidence_refs
      from jsonb_array_elements(v_request.evidence_claims) as e(claim)
      where nullif(btrim(e.claim->>'evidence_ref'),'') is not null;

      if v_unsatisfied then
        if v_rule.enforcement_mode='hard_constraint' then
          v_outcome:='deny';
          v_reason:='required_evidence_missing_hard_constraint';
        else
          v_outcome:='insufficient_evidence';
          v_reason:='required_evidence_missing';
        end if;
      else
        v_outcome:='allow';
        v_reason:='requirements_satisfied';
      end if;
    end if;
  end if;

  insert into comind_pm.pm_rule_evaluation_results(
    request_id,project_id,rule_id,rule_version,evaluator_version,contract_kind,
    formalization_status,formalization_reason,enforcement_mode,authority_result,
    outcome,reason_code,diagnostics,evidence_refs
  ) values (
    v_request.id,v_request.project_id,v_rule.id,p_rule_version,v_evaluator_version,v_contract_kind,
    v_formalization_status,v_formalization_reason,v_rule.enforcement_mode,v_authority_result,
    v_outcome,v_reason,v_diagnostics,v_evidence_refs
  )
  returning id into v_result_id;

  return jsonb_build_object(
    'result_id',v_result_id,
    'outcome',v_outcome,
    'reason_code',v_reason,
    'formalization_status',v_formalization_status,
    'formalization_reason',v_formalization_reason,
    'contract_kind',v_contract_kind,
    'authority_result',v_authority_result,
    'diagnostics',v_diagnostics,
    'reused',false
  );
end;
$$;

create or replace view comind_pm.v_rule_formalization_readiness
with (security_invoker=true)
as
select
  r.project_id,
  r.id as rule_id,
  r.rule_key,
  r.title,
  r.domain,
  r.status as rule_status,
  r.enforcement_mode,
  r.machine_checkable,
  r.current_version as rule_version,
  rv.approval_status,
  rv.formal_rule,
  rv.validation,
  comind_pm.ree_rule_formalization_readiness(r.id,r.current_version) as readiness
from comind_pm.pm_rules r
join comind_pm.pm_rule_versions rv
  on rv.rule_id=r.id and rv.version=r.current_version;

create or replace view comind_pm.v_rule_evaluation_history
with (security_invoker=true)
as
select
  er.id as result_id,
  er.project_id,
  req.request_key,
  req.requested_at,
  req.requested_by,
  req.requested_by_type,
  req.environment,
  req.domain,
  req.action,
  req.resource_class,
  req.subject_type,
  req.subject_ref,
  req.authority_id,
  r.rule_key,
  er.rule_version,
  er.evaluator_version,
  er.contract_kind,
  er.formalization_status,
  er.formalization_reason,
  er.enforcement_mode,
  er.authority_result,
  er.outcome,
  er.reason_code,
  er.diagnostics,
  er.evidence_refs,
  er.evaluated_at
from comind_pm.pm_rule_evaluation_results er
join comind_pm.pm_rule_evaluation_requests req on req.id=er.request_id
join comind_pm.pm_rules r on r.id=er.rule_id;

drop trigger if exists trg_rule_evaluation_request_validate on comind_pm.pm_rule_evaluation_requests;
create trigger trg_rule_evaluation_request_validate
before insert on comind_pm.pm_rule_evaluation_requests
for each row execute function comind_pm.validate_rule_evaluation_request();

drop trigger if exists trg_rule_evaluation_request_immutable on comind_pm.pm_rule_evaluation_requests;
create trigger trg_rule_evaluation_request_immutable
before update or delete on comind_pm.pm_rule_evaluation_requests
for each row execute function comind_pm.reject_rule_evaluation_history_mutation();

drop trigger if exists trg_rule_evaluation_result_immutable on comind_pm.pm_rule_evaluation_results;
create trigger trg_rule_evaluation_result_immutable
before update or delete on comind_pm.pm_rule_evaluation_results
for each row execute function comind_pm.reject_rule_evaluation_history_mutation();

alter table comind_pm.pm_rule_evaluation_requests enable row level security;
alter table comind_pm.pm_rule_evaluation_results enable row level security;

drop policy if exists service_role_select on comind_pm.pm_rule_evaluation_requests;
create policy service_role_select on comind_pm.pm_rule_evaluation_requests
for select to service_role using(true);
drop policy if exists service_role_insert on comind_pm.pm_rule_evaluation_requests;
create policy service_role_insert on comind_pm.pm_rule_evaluation_requests
for insert to service_role with check(true);

drop policy if exists service_role_select on comind_pm.pm_rule_evaluation_results;
create policy service_role_select on comind_pm.pm_rule_evaluation_results
for select to service_role using(true);

revoke all on table comind_pm.pm_rule_evaluation_requests from public,anon,authenticated;
revoke all on table comind_pm.pm_rule_evaluation_results from public,anon,authenticated;
revoke all on table comind_pm.v_rule_formalization_readiness from public,anon,authenticated;
revoke all on table comind_pm.v_rule_evaluation_history from public,anon,authenticated;

revoke all on table comind_pm.pm_rule_evaluation_requests from service_role;
revoke all on table comind_pm.pm_rule_evaluation_results from service_role;
grant select,insert on table comind_pm.pm_rule_evaluation_requests to service_role;
grant select on table comind_pm.pm_rule_evaluation_results to service_role;
grant select on table comind_pm.v_rule_formalization_readiness to service_role;
grant select on table comind_pm.v_rule_evaluation_history to service_role;

revoke all on function comind_pm.ree_object_has_only_keys(jsonb,text[]) from public,anon,authenticated;
revoke all on function comind_pm.ree_valid_evidence_claims(jsonb) from public,anon,authenticated;
revoke all on function comind_pm.ree_supported_evidence_requirements_contract(jsonb) from public,anon,authenticated;
revoke all on function comind_pm.ree_contract_kind(jsonb) from public,anon,authenticated;
revoke all on function comind_pm.ree_rule_formalization_readiness(uuid,integer) from public,anon,authenticated;
revoke all on function comind_pm.validate_rule_evaluation_request() from public,anon,authenticated;
revoke all on function comind_pm.reject_rule_evaluation_history_mutation() from public,anon,authenticated;
revoke all on function comind_pm.ree_evidence_requirement_diagnostics(jsonb,jsonb) from public,anon,authenticated;
revoke all on function comind_pm.ree_evaluate_request_rule(uuid,uuid,integer) from public,anon,authenticated;

revoke all on function comind_pm.ree_object_has_only_keys(jsonb,text[]) from service_role;
revoke all on function comind_pm.ree_valid_evidence_claims(jsonb) from service_role;
revoke all on function comind_pm.ree_supported_evidence_requirements_contract(jsonb) from service_role;
revoke all on function comind_pm.ree_contract_kind(jsonb) from service_role;
revoke all on function comind_pm.ree_rule_formalization_readiness(uuid,integer) from service_role;
revoke all on function comind_pm.ree_evidence_requirement_diagnostics(jsonb,jsonb) from service_role;
revoke all on function comind_pm.ree_evaluate_request_rule(uuid,uuid,integer) from service_role;

grant execute on function comind_pm.ree_object_has_only_keys(jsonb,text[]) to service_role;
grant execute on function comind_pm.ree_valid_evidence_claims(jsonb) to service_role;
grant execute on function comind_pm.ree_supported_evidence_requirements_contract(jsonb) to service_role;
grant execute on function comind_pm.ree_contract_kind(jsonb) to service_role;
grant execute on function comind_pm.ree_rule_formalization_readiness(uuid,integer) to service_role;
grant execute on function comind_pm.ree_evidence_requirement_diagnostics(jsonb,jsonb) to service_role;
grant execute on function comind_pm.ree_evaluate_request_rule(uuid,uuid,integer) to service_role;

commit;
