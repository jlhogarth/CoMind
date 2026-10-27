begin;

create table if not exists comind_pm.pm_rule_composition_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  policy_key text not null,
  version integer not null,
  algorithm_key text not null,
  status text not null default 'active',
  outcome_precedence jsonb not null,
  semantics jsonb not null,
  evidence_refs jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique(project_id,policy_key,version),
  check (version>0),
  check (nullif(btrim(policy_key),'') is not null),
  check (nullif(btrim(algorithm_key),'') is not null),
  check (status in ('active','proposed','superseded','retired')),
  check (jsonb_typeof(outcome_precedence)='array' and jsonb_array_length(outcome_precedence)>0),
  check (jsonb_typeof(semantics)='object'),
  check (jsonb_typeof(evidence_refs)='array' and jsonb_array_length(evidence_refs)>0),
  check (nullif(btrim(created_by),'') is not null)
);

create table if not exists comind_pm.pm_rule_composition_sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  set_key text not null,
  version integer not null,
  title text not null,
  selection_strategy text not null,
  domain_scope text[] not null default array['*']::text[],
  environment_scope text[] not null default array['*']::text[],
  action_scope text[] not null default array['*']::text[],
  resource_scope text[] not null default array['*']::text[],
  completeness_status text not null,
  status text not null default 'active',
  evidence_refs jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique(project_id,set_key,version),
  check (version>0),
  check (nullif(btrim(set_key),'') is not null),
  check (nullif(btrim(title),'') is not null),
  check (selection_strategy in ('formalization_ready_domain','explicit_governed_membership')),
  check (cardinality(domain_scope)>0),
  check (cardinality(environment_scope)>0),
  check (cardinality(action_scope)>0),
  check (cardinality(resource_scope)>0),
  check (completeness_status in ('complete_for_declared_scope','partial')),
  check (status in ('active','proposed','superseded','retired')),
  check (jsonb_typeof(evidence_refs)='array' and jsonb_array_length(evidence_refs)>0),
  check (jsonb_typeof(metadata)='object'),
  check (nullif(btrim(created_by),'') is not null)
);

create table if not exists comind_pm.pm_rule_composition_set_members (
  set_id uuid not null references comind_pm.pm_rule_composition_sets(id) on delete restrict,
  rule_id uuid not null references comind_pm.pm_rules(id) on delete restrict,
  rule_version integer not null,
  membership_role text not null default 'required',
  evidence_refs jsonb not null,
  created_at timestamptz not null default now(),
  primary key(set_id,rule_id,rule_version),
  foreign key(rule_id,rule_version) references comind_pm.pm_rule_versions(rule_id,version) on delete restrict,
  check (rule_version>0),
  check (membership_role='required'),
  check (jsonb_typeof(evidence_refs)='array' and jsonb_array_length(evidence_refs)>0)
);

create table if not exists comind_pm.pm_rule_composition_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  request_key text not null,
  evaluation_request_id uuid not null references comind_pm.pm_rule_evaluation_requests(id) on delete restrict,
  composition_policy_id uuid not null references comind_pm.pm_rule_composition_policies(id) on delete restrict,
  composition_set_id uuid not null references comind_pm.pm_rule_composition_sets(id) on delete restrict,
  requested_by text not null,
  requested_by_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(project_id,request_key),
  check (nullif(btrim(request_key),'') is not null),
  check (nullif(btrim(requested_by),'') is not null),
  check (nullif(btrim(requested_by_type),'') is not null),
  check (jsonb_typeof(metadata)='object')
);

create table if not exists comind_pm.pm_rule_composition_results (
  id uuid primary key default gen_random_uuid(),
  composition_request_id uuid not null references comind_pm.pm_rule_composition_requests(id) on delete restrict,
  project_id uuid not null references comind_pm.pm_projects(id) on delete restrict,
  composition_policy_id uuid not null references comind_pm.pm_rule_composition_policies(id) on delete restrict,
  composition_set_id uuid not null references comind_pm.pm_rule_composition_sets(id) on delete restrict,
  composer_version text not null,
  final_outcome text not null,
  reason_code text not null,
  contributing_result_ids uuid[] not null default '{}'::uuid[],
  determining_result_ids uuid[] not null default '{}'::uuid[],
  blocking_result_ids uuid[] not null default '{}'::uuid[],
  diagnostics jsonb not null default '{}'::jsonb,
  composed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(composition_request_id,composer_version),
  check (nullif(btrim(composer_version),'') is not null),
  check (final_outcome in ('allow','deny','require_review','not_applicable','insufficient_evidence','unresolved','not_machine_evaluable')),
  check (nullif(btrim(reason_code),'') is not null),
  check (jsonb_typeof(diagnostics)='object')
);

create index if not exists idx_rule_composition_set_members_rule
  on comind_pm.pm_rule_composition_set_members(rule_id,rule_version,set_id);
create index if not exists idx_rule_composition_requests_eval
  on comind_pm.pm_rule_composition_requests(project_id,evaluation_request_id,requested_at desc);
create index if not exists idx_rule_composition_results_outcome
  on comind_pm.pm_rule_composition_results(project_id,final_outcome,composed_at desc);

create or replace function comind_pm.rco_dimension_matches(p_values text[],p_requested text)
returns boolean
language sql
immutable
security invoker
set search_path=''
as $$
  select '*'=any(p_values) or p_requested=any(p_values)
$$;

create or replace function comind_pm.rco_enforcement_rank(p_mode text)
returns integer
language sql
immutable
security invoker
set search_path=''
as $$
  select case p_mode
    when 'hard_constraint' then 1
    when 'automated_gate' then 2
    when 'review_required' then 3
    when 'informational' then 4
    else 99
  end
$$;

create or replace function comind_pm.rco_specialization_depth(
  p_project_id uuid,
  p_set_id uuid,
  p_rule_id uuid
)
returns integer
language sql
stable
security invoker
set search_path=''
as $$
  with recursive lineage(rule_id,depth,path) as (
    select p_rule_id,0,array[p_rule_id]::uuid[]
    union all
    select rel.related_rule_id,l.depth+1,l.path||rel.related_rule_id
    from lineage l
    join comind_pm.pm_rule_relationships rel
      on rel.project_id=p_project_id
     and rel.rule_id=l.rule_id
     and rel.relationship_type='specializes'
     and rel.relationship_status='confirmed'
    where exists(
      select 1
      from comind_pm.pm_rule_composition_set_members m
      where m.set_id=p_set_id and m.rule_id=rel.related_rule_id
    )
      and not rel.related_rule_id=any(l.path)
  )
  select coalesce(max(depth),0) from lineage
$$;

create or replace function comind_pm.reject_rule_composition_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  raise exception 'RCO-001 composition governance/history is append-only';
end;
$$;

create or replace function comind_pm.validate_rule_composition_set_member()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_set_project uuid;
  v_rule_project uuid;
begin
  select project_id into v_set_project from comind_pm.pm_rule_composition_sets where id=new.set_id;
  select project_id into v_rule_project from comind_pm.pm_rules where id=new.rule_id;
  if v_set_project is null or v_rule_project is null or v_set_project<>v_rule_project then
    raise exception 'RCO-001 composition set/rule project mismatch';
  end if;
  return new;
end;
$$;

create or replace function comind_pm.validate_rule_composition_request()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_eval comind_pm.pm_rule_evaluation_requests%rowtype;
  v_policy comind_pm.pm_rule_composition_policies%rowtype;
  v_set comind_pm.pm_rule_composition_sets%rowtype;
begin
  select * into v_eval from comind_pm.pm_rule_evaluation_requests where id=new.evaluation_request_id;
  if not found then raise exception 'RCO-001 evaluation request does not exist'; end if;
  select * into v_policy from comind_pm.pm_rule_composition_policies where id=new.composition_policy_id;
  if not found then raise exception 'RCO-001 composition policy does not exist'; end if;
  select * into v_set from comind_pm.pm_rule_composition_sets where id=new.composition_set_id;
  if not found then raise exception 'RCO-001 composition set does not exist'; end if;
  if v_eval.project_id<>new.project_id or v_policy.project_id<>new.project_id or v_set.project_id<>new.project_id then
    raise exception 'RCO-001 project mismatch';
  end if;
  if v_policy.status<>'active' then raise exception 'RCO-001 composition policy is not active'; end if;
  if v_set.status<>'active' then raise exception 'RCO-001 composition set is not active'; end if;
  if not comind_pm.rco_dimension_matches(v_set.domain_scope,v_eval.domain)
     or not comind_pm.rco_dimension_matches(v_set.environment_scope,v_eval.environment)
     or not comind_pm.rco_dimension_matches(v_set.action_scope,v_eval.action)
     or not comind_pm.rco_dimension_matches(v_set.resource_scope,v_eval.resource_class) then
    raise exception 'RCO-001 composition set does not apply to evaluation request scope';
  end if;
  new.requested_at:=statement_timestamp();
  new.created_at:=statement_timestamp();
  return new;
end;
$$;

create or replace function comind_pm.rco_compose_request(p_composition_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_req comind_pm.pm_rule_composition_requests%rowtype;
  v_eval comind_pm.pm_rule_evaluation_requests%rowtype;
  v_policy comind_pm.pm_rule_composition_policies%rowtype;
  v_set comind_pm.pm_rule_composition_sets%rowtype;
  v_existing comind_pm.pm_rule_composition_results%rowtype;
  v_composer_version constant text:='rco-001/constraint-guarded-v1';
  v_ree_version constant text:='ree-001/evidence-requirements-v2';
  v_expected_precedence constant jsonb:='["deny","unresolved","not_machine_evaluable","insufficient_evidence","require_review","allow","not_applicable"]'::jsonb;
  v_compose_at timestamptz:=statement_timestamp();
  v_current_authority jsonb:='{}'::jsonb;
  v_member_count integer:=0;
  v_expected_ready_count integer:=0;
  v_unrepresented_ready_count integer:=0;
  v_extra_member_count integer:=0;
  v_missing_count integer:=0;
  v_stale_count integer:=0;
  v_confirmed_conflict_count integer:=0;
  v_proposed_conflict_count integer:=0;
  v_blocker_case_count integer:=0;
  v_outcome text;
  v_reason text;
  v_contributing uuid[]:='{}'::uuid[];
  v_determining uuid[]:='{}'::uuid[];
  v_blocking uuid[]:='{}'::uuid[];
  v_diagnostics jsonb:='{}'::jsonb;
  v_result_id uuid;
  v_count_deny integer:=0;
  v_count_unresolved integer:=0;
  v_count_not_eval integer:=0;
  v_count_insufficient integer:=0;
  v_count_review integer:=0;
  v_count_allow integer:=0;
  v_count_na integer:=0;
begin
  select * into v_existing
  from comind_pm.pm_rule_composition_results
  where composition_request_id=p_composition_request_id
    and composer_version=v_composer_version;
  if found then
    return jsonb_build_object(
      'result_id',v_existing.id,
      'final_outcome',v_existing.final_outcome,
      'reason_code',v_existing.reason_code,
      'reused',true
    );
  end if;

  select * into v_req from comind_pm.pm_rule_composition_requests where id=p_composition_request_id;
  if not found then raise exception 'RCO-001 composition request % does not exist',p_composition_request_id; end if;
  select * into v_eval from comind_pm.pm_rule_evaluation_requests where id=v_req.evaluation_request_id;
  if not found then raise exception 'RCO-001 evaluation request does not exist'; end if;
  select * into v_policy from comind_pm.pm_rule_composition_policies where id=v_req.composition_policy_id;
  select * into v_set from comind_pm.pm_rule_composition_sets where id=v_req.composition_set_id;

  v_current_authority:=comind_pm.resolve_authority_request(
    v_eval.project_id,
    v_eval.authority_id,
    v_eval.capability,
    v_eval.action,
    v_eval.resource_class,
    v_eval.environment,
    v_eval.domain,
    v_eval.context,
    v_compose_at
  );

  if v_current_authority->>'determination'='unresolved' then
    v_outcome:='unresolved';
    v_reason:='authority_unresolved_at_composition';
  elsif v_current_authority->>'determination'<>'sufficient' then
    v_outcome:='deny';
    v_reason:='authority_'||coalesce(v_current_authority->>'determination','unknown')||'_at_composition';
  elsif v_policy.status<>'active'
     or v_policy.algorithm_key<>'constraint_guarded_composition_v1'
     or v_policy.outcome_precedence<>v_expected_precedence then
    v_outcome:='unresolved';
    v_reason:='composition_policy_not_active_or_supported';
  elsif v_set.status<>'active' or v_set.completeness_status<>'complete_for_declared_scope' then
    v_outcome:='unresolved';
    v_reason:='composition_set_not_complete';
  else
    select count(*) into v_member_count
    from comind_pm.pm_rule_composition_set_members
    where set_id=v_set.id;

    if v_member_count=0 then
      v_outcome:='unresolved';
      v_reason:='composition_set_empty';
    else
      if v_set.selection_strategy='formalization_ready_domain' then
        if '*'=any(v_set.domain_scope) then
          v_outcome:='unresolved';
          v_reason:='formalization_ready_domain_requires_explicit_domain_scope';
        else
          select count(*) into v_expected_ready_count
          from comind_pm.v_rule_formalization_readiness rr
          where rr.project_id=v_req.project_id
            and rr.domain=any(v_set.domain_scope)
            and rr.readiness->>'status'='ready';

          select count(*) into v_unrepresented_ready_count
          from comind_pm.v_rule_formalization_readiness rr
          where rr.project_id=v_req.project_id
            and rr.domain=any(v_set.domain_scope)
            and rr.readiness->>'status'='ready'
            and not exists(
              select 1
              from comind_pm.pm_rule_composition_set_members m
              where m.set_id=v_set.id
                and m.rule_id=rr.rule_id
                and m.rule_version=rr.rule_version
            );

          select count(*) into v_extra_member_count
          from comind_pm.pm_rule_composition_set_members m
          join comind_pm.v_rule_formalization_readiness rr
            on rr.rule_id=m.rule_id and rr.rule_version=m.rule_version
          where m.set_id=v_set.id
            and (
              not (rr.domain=any(v_set.domain_scope))
              or rr.readiness->>'status'<>'ready'
            );

          if v_expected_ready_count<>v_member_count
             or v_unrepresented_ready_count>0
             or v_extra_member_count>0 then
            v_outcome:='unresolved';
            v_reason:='composition_set_stale_or_incomplete';
          end if;
        end if;
      end if;

      select count(*) into v_stale_count
      from comind_pm.pm_rule_composition_set_members m
      join comind_pm.pm_rules r on r.id=m.rule_id
      where m.set_id=v_set.id
        and (r.status<>'active' or r.current_version<>m.rule_version);

      select count(*) into v_missing_count
      from comind_pm.pm_rule_composition_set_members m
      where m.set_id=v_set.id
        and not exists(
          select 1
          from comind_pm.pm_rule_evaluation_results er
          where er.request_id=v_eval.id
            and er.rule_id=m.rule_id
            and er.rule_version=m.rule_version
            and er.evaluator_version=v_ree_version
        );

      select count(*) into v_confirmed_conflict_count
      from comind_pm.pm_rule_relationships rel
      where rel.project_id=v_req.project_id
        and rel.relationship_type='conflicts_with'
        and rel.relationship_status='confirmed'
        and exists(
          select 1 from comind_pm.pm_rule_composition_set_members m
          where m.set_id=v_set.id and m.rule_id=rel.rule_id
        )
        and exists(
          select 1 from comind_pm.pm_rule_composition_set_members m
          where m.set_id=v_set.id and m.rule_id=rel.related_rule_id
        );

      select count(*) into v_proposed_conflict_count
      from comind_pm.pm_rule_relationships rel
      where rel.project_id=v_req.project_id
        and rel.relationship_type='conflicts_with'
        and rel.relationship_status='proposed'
        and exists(
          select 1 from comind_pm.pm_rule_composition_set_members m
          where m.set_id=v_set.id and m.rule_id=rel.rule_id
        )
        and exists(
          select 1 from comind_pm.pm_rule_composition_set_members m
          where m.set_id=v_set.id and m.rule_id=rel.related_rule_id
        );

      select count(distinct c.id) into v_blocker_case_count
      from comind_pm.pm_rule_reconciliation_cases c
      join comind_pm.pm_rule_reconciliation_members rm on rm.case_id=c.id
      join comind_pm.pm_rule_composition_set_members m
        on m.rule_id=rm.rule_id and m.set_id=v_set.id
      where c.status in ('open','under_review','deferred')
        and (
          c.case_type in ('conflict','authority','supersession','activation_review')
          or lower(coalesce(c.metadata->>'blocks_evaluation','false'))='true'
        );

      select coalesce(
        array_agg(
          er.id
          order by
            comind_pm.rco_enforcement_rank(r.enforcement_mode),
            comind_pm.rco_specialization_depth(v_req.project_id,v_set.id,r.id) desc,
            r.rule_key,
            er.id
        ),
        '{}'::uuid[]
      ) into v_contributing
      from comind_pm.pm_rule_composition_set_members m
      join comind_pm.pm_rule_evaluation_results er
        on er.request_id=v_eval.id
       and er.rule_id=m.rule_id
       and er.rule_version=m.rule_version
       and er.evaluator_version=v_ree_version
      join comind_pm.pm_rules r on r.id=m.rule_id
      where m.set_id=v_set.id;

      if v_outcome is null then
        if v_stale_count>0 then
          v_outcome:='unresolved'; v_reason:='composition_set_stale';
        elsif v_missing_count>0 then
          v_outcome:='unresolved'; v_reason:='evaluation_set_incomplete';
        elsif v_confirmed_conflict_count>0 then
          v_outcome:='unresolved'; v_reason:='confirmed_rule_conflict';
        elsif v_blocker_case_count>0 then
          v_outcome:='unresolved'; v_reason:='blocking_reconciliation_case';
        else
          select
            count(*) filter(where er.outcome='deny'),
            count(*) filter(where er.outcome='unresolved'),
            count(*) filter(where er.outcome='not_machine_evaluable'),
            count(*) filter(where er.outcome='insufficient_evidence'),
            count(*) filter(where er.outcome='require_review'),
            count(*) filter(where er.outcome='allow'),
            count(*) filter(where er.outcome='not_applicable')
          into
            v_count_deny,
            v_count_unresolved,
            v_count_not_eval,
            v_count_insufficient,
            v_count_review,
            v_count_allow,
            v_count_na
          from comind_pm.pm_rule_composition_set_members m
          join comind_pm.pm_rule_evaluation_results er
            on er.request_id=v_eval.id
           and er.rule_id=m.rule_id
           and er.rule_version=m.rule_version
           and er.evaluator_version=v_ree_version
          where m.set_id=v_set.id;

          if v_count_deny>0 then
            v_outcome:='deny'; v_reason:='deny_overrides';
          elsif v_count_unresolved>0 then
            v_outcome:='unresolved'; v_reason:='unresolved_result_present';
          elsif v_count_not_eval>0 then
            v_outcome:='not_machine_evaluable'; v_reason:='non_machine_evaluable_result_present';
          elsif v_count_insufficient>0 then
            v_outcome:='insufficient_evidence'; v_reason:='insufficient_evidence_result_present';
          elsif v_count_review>0 then
            v_outcome:='require_review'; v_reason:='review_required_result_present';
          elsif v_count_allow>0 and v_count_allow+v_count_na=v_member_count then
            v_outcome:='allow'; v_reason:='all_applicable_rules_allow';
          elsif v_count_na=v_member_count then
            v_outcome:='not_applicable'; v_reason:='all_rules_not_applicable';
          else
            v_outcome:='unresolved'; v_reason:='unrecognized_composition_state';
          end if;
        end if;
      end if;

      if v_reason='confirmed_rule_conflict' then
        select coalesce(array_agg(distinct er.id),'{}'::uuid[])
        into v_determining
        from comind_pm.pm_rule_relationships rel
        join comind_pm.pm_rule_evaluation_results er
          on er.request_id=v_eval.id
         and er.evaluator_version=v_ree_version
         and er.rule_id in (rel.rule_id,rel.related_rule_id)
        where rel.project_id=v_req.project_id
          and rel.relationship_type='conflicts_with'
          and rel.relationship_status='confirmed'
          and exists(select 1 from comind_pm.pm_rule_composition_set_members m where m.set_id=v_set.id and m.rule_id=rel.rule_id)
          and exists(select 1 from comind_pm.pm_rule_composition_set_members m where m.set_id=v_set.id and m.rule_id=rel.related_rule_id);
        v_blocking:=v_determining;
      elsif v_reason='blocking_reconciliation_case' then
        select coalesce(array_agg(distinct er.id),'{}'::uuid[])
        into v_determining
        from comind_pm.pm_rule_reconciliation_cases c
        join comind_pm.pm_rule_reconciliation_members rm on rm.case_id=c.id
        join comind_pm.pm_rule_composition_set_members m on m.rule_id=rm.rule_id and m.set_id=v_set.id
        join comind_pm.pm_rule_evaluation_results er
          on er.request_id=v_eval.id
         and er.rule_id=m.rule_id
         and er.rule_version=m.rule_version
         and er.evaluator_version=v_ree_version
        where c.status in ('open','under_review','deferred')
          and (
            c.case_type in ('conflict','authority','supersession','activation_review')
            or lower(coalesce(c.metadata->>'blocks_evaluation','false'))='true'
          );
        v_blocking:=v_determining;
      else
        select coalesce(
          array_agg(
            er.id
            order by
              comind_pm.rco_enforcement_rank(r.enforcement_mode),
              comind_pm.rco_specialization_depth(v_req.project_id,v_set.id,r.id) desc,
              r.rule_key,
              er.id
          ),
          '{}'::uuid[]
        ) into v_determining
        from comind_pm.pm_rule_composition_set_members m
        join comind_pm.pm_rule_evaluation_results er
          on er.request_id=v_eval.id
         and er.rule_id=m.rule_id
         and er.rule_version=m.rule_version
         and er.evaluator_version=v_ree_version
        join comind_pm.pm_rules r on r.id=m.rule_id
        where m.set_id=v_set.id
          and er.outcome=v_outcome;

        select coalesce(
          array_agg(
            er.id
            order by
              comind_pm.rco_enforcement_rank(r.enforcement_mode),
              comind_pm.rco_specialization_depth(v_req.project_id,v_set.id,r.id) desc,
              r.rule_key,
              er.id
          ),
          '{}'::uuid[]
        ) into v_blocking
        from comind_pm.pm_rule_composition_set_members m
        join comind_pm.pm_rule_evaluation_results er
          on er.request_id=v_eval.id
         and er.rule_id=m.rule_id
         and er.rule_version=m.rule_version
         and er.evaluator_version=v_ree_version
        join comind_pm.pm_rules r on r.id=m.rule_id
        where m.set_id=v_set.id
          and er.outcome in ('deny','unresolved','not_machine_evaluable','insufficient_evidence','require_review');
      end if;
    end if;
  end if;

  v_diagnostics:=jsonb_build_object(
    'composition_evaluated_at',v_compose_at,
    'selection_strategy',v_set.selection_strategy,
    'decision_scope',jsonb_build_object(
      'domains',v_set.domain_scope,
      'environments',v_set.environment_scope,
      'actions',v_set.action_scope,
      'resources',v_set.resource_scope
    ),
    'current_authority_result',v_current_authority,
    'member_count',v_member_count,
    'expected_ready_count',v_expected_ready_count,
    'unrepresented_ready_count',v_unrepresented_ready_count,
    'extra_member_count',v_extra_member_count,
    'missing_result_count',v_missing_count,
    'stale_member_count',v_stale_count,
    'confirmed_conflict_count',v_confirmed_conflict_count,
    'proposed_conflict_count',v_proposed_conflict_count,
    'blocking_reconciliation_case_count',v_blocker_case_count,
    'outcome_counts',jsonb_build_object(
      'deny',v_count_deny,
      'unresolved',v_count_unresolved,
      'not_machine_evaluable',v_count_not_eval,
      'insufficient_evidence',v_count_insufficient,
      'require_review',v_count_review,
      'allow',v_count_allow,
      'not_applicable',v_count_na
    ),
    'diagnostic_order_note','Result composition is order-independent. Result arrays are ordered only for deterministic inspection: hard constraint, automated gate, review required, specialization depth, rule key. Position does not create authority.'
  );

  insert into comind_pm.pm_rule_composition_results(
    composition_request_id,project_id,composition_policy_id,composition_set_id,composer_version,
    final_outcome,reason_code,contributing_result_ids,determining_result_ids,blocking_result_ids,diagnostics,
    composed_at,created_at
  ) values (
    v_req.id,v_req.project_id,v_req.composition_policy_id,v_req.composition_set_id,v_composer_version,
    v_outcome,v_reason,v_contributing,v_determining,v_blocking,v_diagnostics,v_compose_at,v_compose_at
  ) returning id into v_result_id;

  return jsonb_build_object(
    'result_id',v_result_id,
    'final_outcome',v_outcome,
    'reason_code',v_reason,
    'contributing_result_ids',to_jsonb(v_contributing),
    'determining_result_ids',to_jsonb(v_determining),
    'blocking_result_ids',to_jsonb(v_blocking),
    'diagnostics',v_diagnostics,
    'reused',false
  );
end;
$$;

create or replace view comind_pm.v_rule_composition_history
with (security_invoker=true)
as
select
  cr.id as composition_result_id,
  cqr.request_key as composition_request_key,
  cqr.requested_at,
  erq.request_key as evaluation_request_key,
  p.policy_key,
  p.version as policy_version,
  s.set_key,
  s.version as set_version,
  s.selection_strategy,
  s.domain_scope,
  s.environment_scope,
  s.action_scope,
  s.resource_scope,
  cr.composer_version,
  cr.final_outcome,
  cr.reason_code,
  cr.contributing_result_ids,
  cr.determining_result_ids,
  cr.blocking_result_ids,
  cr.diagnostics,
  cr.composed_at
from comind_pm.pm_rule_composition_results cr
join comind_pm.pm_rule_composition_requests cqr on cqr.id=cr.composition_request_id
join comind_pm.pm_rule_evaluation_requests erq on erq.id=cqr.evaluation_request_id
join comind_pm.pm_rule_composition_policies p on p.id=cr.composition_policy_id
join comind_pm.pm_rule_composition_sets s on s.id=cr.composition_set_id;

with p as (select id from comind_pm.pm_projects where project_key='COMIND')
insert into comind_pm.pm_rule_composition_policies(
  project_id,policy_key,version,algorithm_key,status,outcome_precedence,semantics,evidence_refs,created_by
)
select p.id,'constraint_guarded_composition',1,'constraint_guarded_composition_v1','active',
  jsonb_build_array('deny','unresolved','not_machine_evaluable','insufficient_evidence','require_review','allow','not_applicable'),
  jsonb_build_object(
    'rule_rank_model','none_global',
    'deny_overrides',true,
    'conflict_behavior','unresolved',
    'specializes_behavior','diagnostic_specificity_only',
    'predecessor_behavior','lineage_only',
    'supports_behavior','no_runtime_precedence',
    'default_allow',false,
    'authority_rechecked_at_composition',true
  ),
  jsonb_build_array('github:issue/236','pm_event:628dcd49-638a-4d63-b31f-b4cab7f21e11'),
  'RCO-001'
from p
where not exists(
  select 1 from comind_pm.pm_rule_composition_policies x
  where x.project_id=p.id and x.policy_key='constraint_guarded_composition' and x.version=1
);

with p as (select id from comind_pm.pm_projects where project_key='COMIND')
insert into comind_pm.pm_rule_composition_sets(
  project_id,set_key,version,title,selection_strategy,domain_scope,environment_scope,action_scope,resource_scope,
  completeness_status,status,evidence_refs,metadata,created_by
)
select p.id,'ARIS-LIFECYCLE-READY',1,'ARIS lifecycle formally ready rules','formalization_ready_domain',
  array['ARIS']::text[],array['*']::text[],array['*']::text[],array['*']::text[],
  'complete_for_declared_scope','active',
  jsonb_build_array('github:issue/236','RULE-ARIS-LC-001','RULE-ARIS-LC-002'),
  jsonb_build_object(
    'scope_note','Complete for all currently formalization-ready rules in domain ARIS. It is not a claim that all ARIS or all CoMind rules are machine-evaluable.',
    'allow_scope','formalization_ready_domain_only'
  ),
  'RCO-001'
from p
where not exists(
  select 1 from comind_pm.pm_rule_composition_sets x
  where x.project_id=p.id and x.set_key='ARIS-LIFECYCLE-READY' and x.version=1
);

with s as (
  select s.id as set_id,s.project_id
  from comind_pm.pm_rule_composition_sets s
  join comind_pm.pm_projects p on p.id=s.project_id
  where p.project_key='COMIND' and s.set_key='ARIS-LIFECYCLE-READY' and s.version=1
), ready as (
  select rr.rule_id,rr.rule_version,rr.rule_key,rr.project_id
  from comind_pm.v_rule_formalization_readiness rr
  join s on s.project_id=rr.project_id
  where rr.domain='ARIS' and rr.readiness->>'status'='ready'
)
insert into comind_pm.pm_rule_composition_set_members(set_id,rule_id,rule_version,membership_role,evidence_refs)
select s.set_id,r.rule_id,r.rule_version,'required',jsonb_build_array(r.rule_key,'github:issue/236')
from s join ready r on r.project_id=s.project_id
where not exists(
  select 1 from comind_pm.pm_rule_composition_set_members m
  where m.set_id=s.set_id and m.rule_id=r.rule_id and m.rule_version=r.rule_version
);

do $$
declare v_member_count integer; v_ready_count integer; begin
  select count(*) into v_member_count
  from comind_pm.pm_rule_composition_set_members m
  join comind_pm.pm_rule_composition_sets s on s.id=m.set_id
  join comind_pm.pm_projects p on p.id=s.project_id
  where p.project_key='COMIND' and s.set_key='ARIS-LIFECYCLE-READY' and s.version=1;
  select count(*) into v_ready_count
  from comind_pm.v_rule_formalization_readiness rr
  join comind_pm.pm_projects p on p.id=rr.project_id
  where p.project_key='COMIND' and rr.domain='ARIS' and rr.readiness->>'status'='ready';
  if v_member_count<>v_ready_count or v_ready_count=0 then
    raise exception 'RCO-001 ARIS set completeness check failed: members %, ready %',v_member_count,v_ready_count;
  end if;
end; $$;

drop trigger if exists trg_rule_composition_policy_immutable on comind_pm.pm_rule_composition_policies;
create trigger trg_rule_composition_policy_immutable before update or delete on comind_pm.pm_rule_composition_policies for each row execute function comind_pm.reject_rule_composition_history_mutation();
drop trigger if exists trg_rule_composition_set_immutable on comind_pm.pm_rule_composition_sets;
create trigger trg_rule_composition_set_immutable before update or delete on comind_pm.pm_rule_composition_sets for each row execute function comind_pm.reject_rule_composition_history_mutation();
drop trigger if exists trg_rule_composition_set_member_validate on comind_pm.pm_rule_composition_set_members;
create trigger trg_rule_composition_set_member_validate before insert on comind_pm.pm_rule_composition_set_members for each row execute function comind_pm.validate_rule_composition_set_member();
drop trigger if exists trg_rule_composition_set_member_immutable on comind_pm.pm_rule_composition_set_members;
create trigger trg_rule_composition_set_member_immutable before update or delete on comind_pm.pm_rule_composition_set_members for each row execute function comind_pm.reject_rule_composition_history_mutation();
drop trigger if exists trg_rule_composition_request_validate on comind_pm.pm_rule_composition_requests;
create trigger trg_rule_composition_request_validate before insert on comind_pm.pm_rule_composition_requests for each row execute function comind_pm.validate_rule_composition_request();
drop trigger if exists trg_rule_composition_request_immutable on comind_pm.pm_rule_composition_requests;
create trigger trg_rule_composition_request_immutable before update or delete on comind_pm.pm_rule_composition_requests for each row execute function comind_pm.reject_rule_composition_history_mutation();
drop trigger if exists trg_rule_composition_result_immutable on comind_pm.pm_rule_composition_results;
create trigger trg_rule_composition_result_immutable before update or delete on comind_pm.pm_rule_composition_results for each row execute function comind_pm.reject_rule_composition_history_mutation();

alter table comind_pm.pm_rule_composition_policies enable row level security;
alter table comind_pm.pm_rule_composition_sets enable row level security;
alter table comind_pm.pm_rule_composition_set_members enable row level security;
alter table comind_pm.pm_rule_composition_requests enable row level security;
alter table comind_pm.pm_rule_composition_results enable row level security;

drop policy if exists service_role_select on comind_pm.pm_rule_composition_policies;
create policy service_role_select on comind_pm.pm_rule_composition_policies for select to service_role using(true);
drop policy if exists service_role_select on comind_pm.pm_rule_composition_sets;
create policy service_role_select on comind_pm.pm_rule_composition_sets for select to service_role using(true);
drop policy if exists service_role_select on comind_pm.pm_rule_composition_set_members;
create policy service_role_select on comind_pm.pm_rule_composition_set_members for select to service_role using(true);
drop policy if exists service_role_select on comind_pm.pm_rule_composition_requests;
create policy service_role_select on comind_pm.pm_rule_composition_requests for select to service_role using(true);
drop policy if exists service_role_insert on comind_pm.pm_rule_composition_requests;
create policy service_role_insert on comind_pm.pm_rule_composition_requests for insert to service_role with check(true);
drop policy if exists service_role_select on comind_pm.pm_rule_composition_results;
create policy service_role_select on comind_pm.pm_rule_composition_results for select to service_role using(true);

revoke all on table comind_pm.pm_rule_composition_policies,comind_pm.pm_rule_composition_sets,comind_pm.pm_rule_composition_set_members,comind_pm.pm_rule_composition_requests,comind_pm.pm_rule_composition_results,comind_pm.v_rule_composition_history from public,anon,authenticated;
revoke all on table comind_pm.pm_rule_composition_policies,comind_pm.pm_rule_composition_sets,comind_pm.pm_rule_composition_set_members,comind_pm.pm_rule_composition_requests,comind_pm.pm_rule_composition_results from service_role;
grant select on table comind_pm.pm_rule_composition_policies,comind_pm.pm_rule_composition_sets,comind_pm.pm_rule_composition_set_members to service_role;
grant select,insert on table comind_pm.pm_rule_composition_requests to service_role;
grant select on table comind_pm.pm_rule_composition_results,comind_pm.v_rule_composition_history to service_role;

revoke all on function comind_pm.rco_dimension_matches(text[],text) from public,anon,authenticated;
revoke all on function comind_pm.rco_enforcement_rank(text) from public,anon,authenticated;
revoke all on function comind_pm.rco_specialization_depth(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function comind_pm.reject_rule_composition_history_mutation() from public,anon,authenticated;
revoke all on function comind_pm.validate_rule_composition_set_member() from public,anon,authenticated;
revoke all on function comind_pm.validate_rule_composition_request() from public,anon,authenticated;
revoke all on function comind_pm.rco_compose_request(uuid) from public,anon,authenticated;
revoke all on function comind_pm.rco_compose_request(uuid) from service_role;
grant execute on function comind_pm.rco_dimension_matches(text[],text) to service_role;
grant execute on function comind_pm.rco_enforcement_rank(text) to service_role;
grant execute on function comind_pm.rco_specialization_depth(uuid,uuid,uuid) to service_role;
grant execute on function comind_pm.rco_compose_request(uuid) to service_role;

commit;
