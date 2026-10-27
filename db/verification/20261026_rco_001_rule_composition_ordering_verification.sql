\set ON_ERROR_STOP on

-- RCO-001 compact isolated verifier.
-- Real ARIS paths exercise REE -> RCO end to end. Composition-unit fixtures
-- use only values permitted by the governed REE result schema.

-- Structural, security, and seed integrity.
do $$
declare
  missing text[];
  rls_missing text[];
  p uuid;
  n integer;
  member_count integer;
  ready_count integer;
  strategy text;
  precedence jsonb;
begin
  select array_agg(name order by name) into missing
  from unnest(array[
    'pm_rule_composition_policies',
    'pm_rule_composition_sets',
    'pm_rule_composition_set_members',
    'pm_rule_composition_requests',
    'pm_rule_composition_results'
  ]) as t(name)
  where to_regclass('comind_pm.'||name) is null;
  if missing is not null then raise exception 'RCO-001 missing tables: %',missing; end if;

  if to_regclass('comind_pm.v_rule_composition_history') is null then
    raise exception 'RCO-001 history view missing';
  end if;
  if to_regprocedure('comind_pm.rco_compose_request(uuid)') is null then
    raise exception 'RCO-001 composer missing';
  end if;

  select array_agg(c.relname order by c.relname) into rls_missing
  from pg_class c
  join pg_namespace nsp on nsp.oid=c.relnamespace
  where nsp.nspname='comind_pm'
    and c.relname=any(array[
      'pm_rule_composition_policies','pm_rule_composition_sets','pm_rule_composition_set_members',
      'pm_rule_composition_requests','pm_rule_composition_results'
    ])
    and not c.relrowsecurity;
  if rls_missing is not null then raise exception 'RCO-001 RLS missing: %',rls_missing; end if;

  if exists(
    select 1
    from information_schema.role_table_grants g
    where g.table_schema='comind_pm'
      and g.table_name=any(array[
        'pm_rule_composition_policies','pm_rule_composition_sets','pm_rule_composition_set_members',
        'pm_rule_composition_requests','pm_rule_composition_results'
      ])
      and g.grantee in ('anon','authenticated','PUBLIC')
  ) then raise exception 'RCO-001 public/authenticated grants detected'; end if;

  if exists(
    select 1
    from information_schema.role_table_grants g
    where g.table_schema='comind_pm'
      and g.table_name='pm_rule_composition_results'
      and g.grantee='service_role'
      and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  ) then raise exception 'service_role can forge/mutate RCO results'; end if;

  select count(*) into n
  from information_schema.role_table_grants g
  where g.table_schema='comind_pm'
    and g.table_name='pm_rule_composition_requests'
    and g.grantee='service_role'
    and g.privilege_type='INSERT';
  if n<>1 then raise exception 'service_role request INSERT contract missing'; end if;

  select id into p from comind_pm.pm_projects where project_key='COMIND';
  if p is null then raise exception 'COMIND project missing'; end if;

  select count(*) into n
  from comind_pm.pm_rule_composition_policies
  where project_id=p
    and policy_key='constraint_guarded_composition'
    and version=1
    and status='active';
  if n<>1 then raise exception 'Expected one active RCO policy, got %',n; end if;

  select outcome_precedence into precedence
  from comind_pm.pm_rule_composition_policies
  where project_id=p
    and policy_key='constraint_guarded_composition'
    and version=1
    and status='active';
  if precedence<>'["deny","unresolved","not_machine_evaluable","insufficient_evidence","require_review","allow","not_applicable"]'::jsonb then
    raise exception 'RCO policy precedence drifted: %',precedence;
  end if;

  select selection_strategy into strategy
  from comind_pm.pm_rule_composition_sets
  where project_id=p
    and set_key='ARIS-LIFECYCLE-READY'
    and version=1
    and status='active';
  if strategy<>'formalization_ready_domain' then
    raise exception 'Unexpected ARIS selection strategy: %',strategy;
  end if;

  select count(*) into member_count
  from comind_pm.pm_rule_composition_set_members m
  join comind_pm.pm_rule_composition_sets s on s.id=m.set_id
  where s.project_id=p and s.set_key='ARIS-LIFECYCLE-READY' and s.version=1;

  select count(*) into ready_count
  from comind_pm.v_rule_formalization_readiness rr
  where rr.project_id=p
    and rr.domain='ARIS'
    and rr.readiness->>'status'='ready';

  if member_count<>ready_count or ready_count<>2 then
    raise exception 'ARIS set/readiness mismatch: members %, ready %',member_count,ready_count;
  end if;

  if comind_pm.rco_enforcement_rank('hard_constraint')<>1
     or comind_pm.rco_enforcement_rank('automated_gate')<>2
     or comind_pm.rco_enforcement_rank('review_required')<>3 then
    raise exception 'RCO diagnostic enforcement ordering drifted';
  end if;
end;
$$;

begin;

-- Direct RCO fixture helper. contract_kind is a value explicitly allowed by
-- REE's schema; diagnostics marks the row as an isolated composition fixture.
create or replace function pg_temp.rco_fixture_result(
  p_request uuid,
  p_project uuid,
  p_rule uuid,
  p_version integer,
  p_outcome text,
  p_reason text default 'rco_fixture'
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_mode text;
begin
  select enforcement_mode into v_mode
  from comind_pm.pm_rules
  where id=p_rule;

  insert into comind_pm.pm_rule_evaluation_results(
    request_id,project_id,rule_id,rule_version,evaluator_version,
    contract_kind,formalization_status,formalization_reason,enforcement_mode,
    authority_result,outcome,reason_code,diagnostics,evidence_refs,
    evaluated_at,created_at
  ) values (
    p_request,p_project,p_rule,p_version,'ree-001/evidence-requirements-v2',
    'evidence_requirements_v1','ready','RCO isolated composition fixture',v_mode,
    jsonb_build_object('determination','sufficient'),p_outcome,p_reason,
    jsonb_build_object('fixture',true,'fixture_owner','RCO-001'),
    jsonb_build_array('ci:rco-001'),statement_timestamp(),statement_timestamp()
  ) returning id into v_id;

  return v_id;
end;
$$;

-- Real ARIS end-to-end integration plus omission/evidence/not-applicable.
do $$
declare
  p uuid;
  authority_id uuid;
  policy_id uuid;
  set_id uuid;
  r1 uuid;
  r2 uuid;
  eval_id uuid;
  comp_id uuid;
  x jsonb;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';
  select id into policy_id from comind_pm.pm_rule_composition_policies
    where project_id=p and policy_key='constraint_guarded_composition' and version=1;
  select id into set_id from comind_pm.pm_rule_composition_sets
    where project_id=p and set_key='ARIS-LIFECYCLE-READY' and version=1;
  select id into r1 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-001';
  select id into r2 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-002';

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,
    capabilities,evidence_refs,status
  ) values (
    p,'AUTH-RCO-CI-ARIS','operational_authority','human','RCO CI ARIS authority','{}',
    array['activate'],jsonb_build_array('ci:rco-001'),'active'
  ) returning id into authority_id;

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,
    resource_classes,capabilities,authority_level,evidence_refs
  ) values (
    p,authority_id,'rco-ci-aris',array['ARIS'],array['test'],array['lifecycle_transition'],
    array['module'],array['activate'],'C2',jsonb_build_array('ci:rco-001')
  );

  -- Real allow: LC-001 allow + LC-002 not_applicable.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-ARIS-ALLOW',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:rco-ci',jsonb_build_object('target_status','Specified'),
    jsonb_build_array(jsonb_build_object(
      'evidence_type','approved_specification','evidence_ref','ci:rco-approved-spec','approval_status','approved'
    )),
    '{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform comind_pm.ree_evaluate_request_rule(eval_id,r1,1);
  perform comind_pm.ree_evaluate_request_rule(eval_id,r2,1);

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-COMP-ALLOW',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'allow' or x->>'reason_code'<>'all_applicable_rules_allow' then
    raise exception 'Expected ARIS allow, got %',x;
  end if;

  -- Omission cannot create allow.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-ARIS-OMIT',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:rco-ci-omit',jsonb_build_object('target_status','Specified'),
    jsonb_build_array(jsonb_build_object(
      'evidence_type','approved_specification','evidence_ref','ci:rco-approved-spec-2','approval_status','approved'
    )),
    '{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform comind_pm.ree_evaluate_request_rule(eval_id,r1,1);

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-COMP-OMIT',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'unresolved' or x->>'reason_code'<>'evaluation_set_incomplete' then
    raise exception 'Omission did not fail closed: %',x;
  end if;

  -- Missing evidence remains insufficient.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-ARIS-INSUFFICIENT',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:rco-ci-insufficient',jsonb_build_object('target_status','Specified'),
    '[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform comind_pm.ree_evaluate_request_rule(eval_id,r1,1);
  perform comind_pm.ree_evaluate_request_rule(eval_id,r2,1);

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-COMP-INSUFFICIENT',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'insufficient_evidence' then
    raise exception 'Expected insufficient_evidence, got %',x;
  end if;

  -- Nothing applicable never becomes allow.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-ARIS-NA',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:rco-ci-na',jsonb_build_object('target_status','Conceptual'),
    '[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform comind_pm.ree_evaluate_request_rule(eval_id,r1,1);
  perform comind_pm.ree_evaluate_request_rule(eval_id,r2,1);

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-COMP-NA',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'not_applicable' then
    raise exception 'Expected not_applicable, got %',x;
  end if;
end;
$$;

-- Explicit governed set used for direct composition-unit cases.
do $$
declare
  p uuid;
  policy_id uuid;
  set_id uuid;
  authority_id uuid;
  r1 uuid;
  r2 uuid;
  eval_id uuid;
  comp_id uuid;
  x jsonb;
  specialized_result uuid;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';
  select id into policy_id from comind_pm.pm_rule_composition_policies
    where project_id=p and policy_key='constraint_guarded_composition' and version=1;
  select id into r1 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-001';
  select id into r2 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-002';

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,
    capabilities,evidence_refs,status
  ) values (
    p,'AUTH-RCO-CI-DIRECT','operational_authority','human','RCO direct fixture authority','{}',
    array['activate'],jsonb_build_array('ci:rco-001'),'active'
  ) returning id into authority_id;

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,
    resource_classes,capabilities,authority_level,evidence_refs
  ) values (
    p,authority_id,'rco-ci-direct',array['ARIS'],array['test'],array['lifecycle_transition'],
    array['module'],array['activate'],'C2',jsonb_build_array('ci:rco-001')
  );

  insert into comind_pm.pm_rule_composition_sets(
    project_id,set_key,version,title,selection_strategy,domain_scope,environment_scope,
    action_scope,resource_scope,completeness_status,status,evidence_refs,created_by
  ) values (
    p,'RCO-CI-EXPLICIT',1,'RCO direct fixture set','explicit_governed_membership',
    array['ARIS'],array['test'],array['lifecycle_transition'],array['module'],
    'complete_for_declared_scope','active',jsonb_build_array('ci:rco-001'),'RCO CI'
  ) returning id into set_id;

  insert into comind_pm.pm_rule_composition_set_members(set_id,rule_id,rule_version,evidence_refs)
  values
    (set_id,r1,1,jsonb_build_array('ci:rco-001')),
    (set_id,r2,1,jsonb_build_array('ci:rco-001'));

  -- deny + allow => deny.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-DIRECT-DENY',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:direct-deny','{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform pg_temp.rco_fixture_result(eval_id,p,r1,1,'deny','fixture_deny');
  perform pg_temp.rco_fixture_result(eval_id,p,r2,1,'allow','fixture_allow');

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-DIRECT-DENY-COMP',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'deny' or x->>'reason_code'<>'deny_overrides' then
    raise exception 'Deny did not override allow: %',x;
  end if;

  -- review + allow => require_review.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-DIRECT-REVIEW',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:direct-review','{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform pg_temp.rco_fixture_result(eval_id,p,r1,1,'require_review','fixture_review');
  perform pg_temp.rco_fixture_result(eval_id,p,r2,1,'allow','fixture_allow');

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-DIRECT-REVIEW-COMP',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'require_review' then
    raise exception 'Review collapsed into allow: %',x;
  end if;

  -- not-machine-evaluable + allow => not_machine_evaluable.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-DIRECT-NME',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:direct-nme','{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform pg_temp.rco_fixture_result(eval_id,p,r1,1,'not_machine_evaluable','fixture_nme');
  perform pg_temp.rco_fixture_result(eval_id,p,r2,1,'allow','fixture_allow');

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-DIRECT-NME-COMP',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'not_machine_evaluable' then
    raise exception 'Non-machine-evaluable result was ignored: %',x;
  end if;

  -- Relationship types that are not authority precedence must not alter outcome.
  insert into comind_pm.pm_rule_relationships(
    project_id,rule_id,related_rule_id,relationship_type,relationship_status,
    confidence,rationale,evidence_refs,decided_by,decided_at
  ) values
    (p,r2,r1,'specializes','confirmed',1,'RCO specialization diagnostic fixture.',jsonb_build_array('ci:rco-001'),'RCO CI',statement_timestamp()),
    (p,r2,r1,'supports','confirmed',1,'RCO support fixture.',jsonb_build_array('ci:rco-001'),'RCO CI',statement_timestamp()),
    (p,r1,r2,'predecessor_of','confirmed',1,'RCO lineage fixture.',jsonb_build_array('ci:rco-001'),'RCO CI',statement_timestamp());

  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-DIRECT-REL',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:direct-rel','{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform pg_temp.rco_fixture_result(eval_id,p,r1,1,'allow','fixture_allow');
  specialized_result:=pg_temp.rco_fixture_result(eval_id,p,r2,1,'allow','fixture_allow');

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-DIRECT-REL-COMP',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'allow' then
    raise exception 'Non-precedence relationships changed safe outcome: %',x;
  end if;
  if (x->'contributing_result_ids'->>0)::uuid<>specialized_result then
    raise exception 'Specialized rule was not first in deterministic diagnostic order: %',x;
  end if;

  -- Proposed conflict is diagnostic only.
  insert into comind_pm.pm_rule_relationships(
    project_id,rule_id,related_rule_id,relationship_type,relationship_status,
    confidence,rationale,evidence_refs
  ) values (
    p,r1,r2,'conflicts_with','proposed',0.8,
    'RCO proposed conflict fixture.',jsonb_build_array('ci:rco-001')
  );

  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-PROP-CONFLICT',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:prop-conflict','{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform pg_temp.rco_fixture_result(eval_id,p,r1,1,'allow','fixture_allow');
  perform pg_temp.rco_fixture_result(eval_id,p,r2,1,'allow','fixture_allow');

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-PROP-CONFLICT-COMP',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'allow'
     or (x->'diagnostics'->>'proposed_conflict_count')::integer<>1 then
    raise exception 'Proposed conflict governed incorrectly: %',x;
  end if;

  -- Confirmed conflict fails closed.
  insert into comind_pm.pm_rule_relationships(
    project_id,rule_id,related_rule_id,relationship_type,relationship_status,
    confidence,rationale,evidence_refs,decided_by,decided_at
  ) values (
    p,r2,r1,'conflicts_with','confirmed',1,
    'RCO confirmed conflict fixture.',jsonb_build_array('ci:rco-001'),'RCO CI',statement_timestamp()
  );

  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-CONF-CONFLICT',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:conf-conflict','{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform pg_temp.rco_fixture_result(eval_id,p,r1,1,'allow','fixture_allow');
  perform pg_temp.rco_fixture_result(eval_id,p,r2,1,'allow','fixture_allow');

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-CONF-CONFLICT-COMP',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'unresolved' or x->>'reason_code'<>'confirmed_rule_conflict' then
    raise exception 'Confirmed conflict did not fail closed: %',x;
  end if;
end;
$$;

-- Fresh authority is re-resolved at composition time.
do $$
declare
  p uuid;
  authority_id uuid;
  blocker_id uuid;
  policy_id uuid;
  set_id uuid;
  r1 uuid;
  r2 uuid;
  eval_id uuid;
  comp_id uuid;
  rel_id uuid;
  x jsonb;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';
  select id into policy_id from comind_pm.pm_rule_composition_policies
    where project_id=p and policy_key='constraint_guarded_composition' and version=1;
  select id into set_id from comind_pm.pm_rule_composition_sets
    where project_id=p and set_key='ARIS-LIFECYCLE-READY' and version=1;
  select id into r1 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-001';
  select id into r2 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-002';

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,
    capabilities,evidence_refs,status
  ) values (
    p,'AUTH-RCO-CI-FRESH','operational_authority','human','RCO freshness authority','{}',
    array['activate'],jsonb_build_array('ci:rco-001'),'active'
  ) returning id into authority_id;

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,
    resource_classes,capabilities,authority_level,evidence_refs
  ) values (
    p,authority_id,'rco-ci-fresh',array['ARIS'],array['test'],array['lifecycle_transition'],
    array['module'],array['activate'],'C2',jsonb_build_array('ci:rco-001')
  );

  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-FRESH-EVAL',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:fresh','{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform pg_temp.rco_fixture_result(eval_id,p,r1,1,'allow','fixture_allow');
  perform pg_temp.rco_fixture_result(eval_id,p,r2,1,'not_applicable','fixture_na');

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,
    capabilities,evidence_refs,status
  ) values (
    p,'AUTH-RCO-CI-FRESH-BLOCKER','approved_policy','policy','RCO post-evaluation blocker','{}',
    array['activate'],jsonb_build_array('ci:rco-001'),'active'
  ) returning id into blocker_id;

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,
    resource_classes,capabilities,authority_level,evidence_refs
  ) values (
    p,blocker_id,'rco-ci-fresh-blocker',array['ARIS'],array['test'],array['lifecycle_transition'],
    array['module'],array['activate'],'C4',jsonb_build_array('ci:rco-001')
  );

  insert into comind_pm.pm_authority_relationships(
    project_id,authority_id,related_authority_id,relationship_type,capabilities,
    domains,environments,operation_classes,resource_classes,constraint_effect,
    rationale,evidence_refs,created_by
  ) values (
    p,blocker_id,authority_id,'constrains',array['activate'],array['ARIS'],array['test'],
    array['lifecycle_transition'],array['module'],'deny',
    'Post-REE RCO authority change.',jsonb_build_array('ci:rco-001'),'RCO CI'
  ) returning id into rel_id;

  insert into comind_pm.pm_authority_relationship_events(
    relationship_id,event_type,actor,rationale,evidence_refs
  ) values (
    rel_id,'confirmed','RCO CI','Confirm post-REE authority deny.',jsonb_build_array('ci:rco-001')
  );

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-FRESH-COMP',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'deny' or position('_at_composition' in x->>'reason_code')=0 then
    raise exception 'RCO trusted stale authority: %',x;
  end if;
end;
$$;

-- Dynamic formalization-ready set becomes stale when a new ready rule appears.
do $$
declare
  p uuid;
  authority_id uuid;
  policy_id uuid;
  set_id uuid;
  r1 uuid;
  r2 uuid;
  new_rule uuid;
  eval_id uuid;
  comp_id uuid;
  x jsonb;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';
  select id into authority_id from comind_pm.pm_rule_authorities
    where project_id=p and authority_key='AUTH-RCO-CI-ARIS';
  select id into policy_id from comind_pm.pm_rule_composition_policies
    where project_id=p and policy_key='constraint_guarded_composition' and version=1;
  select id into set_id from comind_pm.pm_rule_composition_sets
    where project_id=p and set_key='ARIS-LIFECYCLE-READY' and version=1;
  select id into r1 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-001';
  select id into r2 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-002';

  insert into comind_pm.pm_rules(
    project_id,rule_key,title,domain,rule_type,modality,status,scope,
    enforcement_mode,machine_checkable,current_version,owner
  ) values (
    p,'RULE-RCO-CI-NEW-ARIS','New ready ARIS rule','ARIS','verification','MUST','active','{}',
    'automated_gate',true,1,'RCO-001'
  ) returning id into new_rule;

  insert into comind_pm.pm_rule_versions(
    rule_id,version,rule_text,formal_rule,rationale,authority,authority_type,
    approval_status,decision_ref,source_refs,evidence_refs,validation
  ) values (
    new_rule,1,'New ready ARIS rule.',
    jsonb_build_object(
      'subject','module.lifecycle','target_status','Specified','requires',
      jsonb_build_array(jsonb_build_object(
        'evidence_type','approved_specification','minimum_count',1,'approval_status','approved'
      ))
    ),
    'Synthetic readiness drift.','RCO-001','founder_approved_rule','approved','ci:rco-001',
    jsonb_build_array('ci:rco-001'),jsonb_build_array('ci:rco-001'),
    jsonb_build_object('result','allow_only_if_requirement_satisfied')
  );

  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'RCO-CI-STALE-EVAL',authority_id,'activate','lifecycle_transition','module','test','ARIS',
    'module.lifecycle','module:stale','{}'::jsonb,'[]'::jsonb,'{}'::jsonb,'RCO CI','system'
  ) returning id into eval_id;

  perform pg_temp.rco_fixture_result(eval_id,p,r1,1,'allow','fixture_allow');
  perform pg_temp.rco_fixture_result(eval_id,p,r2,1,'not_applicable','fixture_na');

  insert into comind_pm.pm_rule_composition_requests(
    project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,
    requested_by,requested_by_type
  ) values (
    p,'RCO-CI-STALE-COMP',eval_id,policy_id,set_id,'RCO CI','system'
  ) returning id into comp_id;

  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'unresolved'
     or x->>'reason_code'<>'composition_set_stale_or_incomplete' then
    raise exception 'Dynamic set drift was not detected: %',x;
  end if;
end;
$$;

-- Result history is immutable.
do $$
declare
  rid uuid;
begin
  select id into rid
  from comind_pm.pm_rule_composition_results
  order by created_at desc
  limit 1;

  begin
    update comind_pm.pm_rule_composition_results
    set reason_code='tampered'
    where id=rid;
    raise exception 'Expected immutable composition result update rejection';
  exception when others then
    if position('append-only' in sqlerrm)=0 then raise; end if;
  end;
end;
$$;

select 'RCO-001 structural, integration, composition, relationships, conflict, freshness, completeness, and immutability verification passed' as result;
rollback;
