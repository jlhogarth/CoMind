\set ON_ERROR_STOP on

-- Structural and security contract.
do $$
declare
  missing text[];
  rls_missing text[];
begin
  select array_agg(name order by name) into missing
  from unnest(array[
    'pm_rule_evaluation_requests',
    'pm_rule_evaluation_results'
  ]) as t(name)
  where to_regclass('comind_pm.'||name) is null;
  if missing is not null then
    raise exception 'REE-001 missing tables: %',missing;
  end if;

  if to_regclass('comind_pm.v_rule_formalization_readiness') is null
     or to_regclass('comind_pm.v_rule_evaluation_history') is null then
    raise exception 'REE-001 required views are missing';
  end if;

  if to_regprocedure('comind_pm.ree_rule_formalization_readiness(uuid,integer)') is null
     or to_regprocedure('comind_pm.ree_evaluate_request_rule(uuid,uuid,integer)') is null then
    raise exception 'REE-001 required functions are missing';
  end if;

  select array_agg(c.relname order by c.relname) into rls_missing
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='comind_pm'
    and c.relname=any(array['pm_rule_evaluation_requests','pm_rule_evaluation_results'])
    and not c.relrowsecurity;
  if rls_missing is not null then
    raise exception 'REE-001 RLS missing: %',rls_missing;
  end if;

  if exists(
    select 1
    from information_schema.role_table_grants g
    where g.table_schema='comind_pm'
      and g.table_name=any(array['pm_rule_evaluation_requests','pm_rule_evaluation_results'])
      and g.grantee in ('anon','authenticated','PUBLIC')
  ) then
    raise exception 'REE-001 public/authenticated table grants detected';
  end if;

  if exists(
    select 1
    from information_schema.role_table_grants g
    where g.table_schema='comind_pm'
      and g.table_name='pm_rule_evaluation_results'
      and g.grantee='service_role'
      and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  ) then
    raise exception 'REE-001 result ledger exposes direct service-role mutation';
  end if;
end;
$$;

-- Formal-contract parser must fail closed.
do $$
begin
  if comind_pm.ree_supported_evidence_requirements_contract(
    '{"subject":"module.lifecycle","target_status":"Specified"}'::jsonb
  ) then
    raise exception 'Contract without requires was accepted';
  end if;

  if comind_pm.ree_supported_evidence_requirements_contract(
    '{"subject":"module.lifecycle","target_status":"Specified","requires":[],"extra":"x"}'::jsonb
  ) then
    raise exception 'Contract with unknown key was accepted';
  end if;

  if comind_pm.ree_supported_evidence_requirements_contract(
    '{"subject":"module.lifecycle","target_status":"Specified","requires":[{"evidence_type":"approved_specification","minimum_count":0}]}'::jsonb
  ) then
    raise exception 'Contract with non-positive minimum_count was accepted';
  end if;

  if not comind_pm.ree_supported_evidence_requirements_contract(
    '{"subject":"module.lifecycle","target_status":"Specified","requires":[{"evidence_type":"approved_specification","minimum_count":1,"approval_status":"approved"}]}'::jsonb
  ) then
    raise exception 'Supported evidence-requirement contract was rejected';
  end if;
end;
$$;

-- The two canonical ARIS contracts are expected to be machine-ready when present.
do $$
declare
  r record;
  readiness jsonb;
  seen integer:=0;
begin
  for r in
    select id,current_version,rule_key
    from comind_pm.pm_rules
    where rule_key in ('RULE-ARIS-LC-001','RULE-ARIS-LC-002')
    order by rule_key
  loop
    seen:=seen+1;
    readiness:=comind_pm.ree_rule_formalization_readiness(r.id,r.current_version);
    if readiness->>'status'<>'ready'
       or readiness->>'contract_kind'<>'evidence_requirements_v1' then
      raise exception '% expected ready evidence_requirements_v1, got %',r.rule_key,readiness;
    end if;
  end loop;
  if seen<>2 then
    raise exception 'Expected both ARIS lifecycle rules in verification fixture, found %',seen;
  end if;
end;
$$;

-- Behavioral contract. All synthetic writes are rolled back.
begin;

do $$
declare
  p uuid;
  root_id uuid;
  delegated_id uuid;
  selector_id uuid;
  root_delegate_rel uuid;
  auto_rule uuid;
  hard_rule uuid;
  review_rule uuid;
  unsupported_rule uuid;
  inactive_rule uuid;
  req_allow uuid;
  req_missing uuid;
  req_review uuid;
  req_hard uuid;
  req_unsupported uuid;
  req_inactive uuid;
  req_domain uuid;
  req_selector uuid;
  req_prod uuid;
  result jsonb;
  first_result uuid;
  aris1 uuid;
  aris1_version integer;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';
  if p is null then raise exception 'COMIND project missing'; end if;

  select id,current_version into aris1,aris1_version
  from comind_pm.pm_rules
  where project_id=p and rule_key='RULE-ARIS-LC-001';
  if aris1 is null then raise exception 'RULE-ARIS-LC-001 missing'; end if;

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status
  ) values (
    p,'AUTH-REE-CI-ROOT','founder','human','REE synthetic human authority','{}',
    array['approve'],jsonb_build_array('ci:ree-001'),'active'
  ) returning id into root_id;

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status
  ) values (
    p,'AUTH-REE-CI-DELEGATED','delegated_authority','agent','REE synthetic delegated authority','{}',
    array['approve'],jsonb_build_array('ci:ree-001'),'active'
  ) returning id into delegated_id;

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status
  ) values (
    p,'AUTH-REE-CI-SELECTOR','operational_authority','human','REE synthetic selector authority','{}',
    array['approve'],jsonb_build_array('ci:ree-001'),'active'
  ) returning id into selector_id;

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,resource_classes,
    capabilities,authority_level,evidence_refs
  ) values
    (p,root_id,'ree-ci-root',array['ARIS'],array['test','production'],array['module_lifecycle_transition'],array['module'],array['approve'],'C4',jsonb_build_array('ci:ree-001')),
    (p,delegated_id,'ree-ci-delegated',array['ARIS'],array['test','production'],array['module_lifecycle_transition'],array['module'],array['approve'],'C2',jsonb_build_array('ci:ree-001'));

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,resource_classes,
    capabilities,authority_level,selector,evidence_refs
  ) values (
    p,selector_id,'ree-ci-selector',array['ARIS'],array['test'],array['module_lifecycle_transition'],array['module'],
    array['approve'],'C4',jsonb_build_object('ticket_required',true),jsonb_build_array('ci:ree-001')
  );

  insert into comind_pm.pm_authority_relationships(
    project_id,authority_id,related_authority_id,relationship_type,capabilities,domains,environments,
    operation_classes,resource_classes,rationale,evidence_refs,created_by
  ) values (
    p,root_id,delegated_id,'delegates_to',array['approve'],array['ARIS'],array['test','production'],
    array['module_lifecycle_transition'],array['module'],'REE synthetic bounded delegation.',
    jsonb_build_array('ci:ree-001'),'REE-001 CI'
  ) returning id into root_delegate_rel;

  insert into comind_pm.pm_authority_relationship_events(
    relationship_id,event_type,actor,rationale,evidence_refs
  ) values (
    root_delegate_rel,'confirmed','REE-001 CI','Confirm synthetic REE delegation.',jsonb_build_array('ci:ree-001')
  );

  -- Synthetic rules exercise enforcement and readiness variants without altering canonical rules.
  insert into comind_pm.pm_rules(
    project_id,rule_key,title,domain,rule_type,modality,status,scope,enforcement_mode,machine_checkable,current_version,owner
  ) values
    (p,'RULE-REE-CI-AUTO','REE synthetic automated gate','ARIS','test','MUST','active','{}','automated_gate',true,1,'REE-001 CI'),
    (p,'RULE-REE-CI-HARD','REE synthetic hard constraint','ARIS','test','MUST','active','{}','hard_constraint',true,1,'REE-001 CI'),
    (p,'RULE-REE-CI-REVIEW','REE synthetic review rule','ARIS','test','MUST','active','{}','review_required',false,1,'REE-001 CI'),
    (p,'RULE-REE-CI-UNSUPPORTED','REE synthetic unsupported rule','ARIS','test','MUST','active','{}','automated_gate',true,1,'REE-001 CI'),
    (p,'RULE-REE-CI-INACTIVE','REE synthetic inactive rule','ARIS','test','MUST','candidate','{}','automated_gate',true,1,'REE-001 CI');

  select id into auto_rule from comind_pm.pm_rules where project_id=p and rule_key='RULE-REE-CI-AUTO';
  select id into hard_rule from comind_pm.pm_rules where project_id=p and rule_key='RULE-REE-CI-HARD';
  select id into review_rule from comind_pm.pm_rules where project_id=p and rule_key='RULE-REE-CI-REVIEW';
  select id into unsupported_rule from comind_pm.pm_rules where project_id=p and rule_key='RULE-REE-CI-UNSUPPORTED';
  select id into inactive_rule from comind_pm.pm_rules where project_id=p and rule_key='RULE-REE-CI-INACTIVE';

  insert into comind_pm.pm_rule_versions(
    rule_id,version,rule_text,formal_rule,rationale,authority,authority_type,approval_status,decision_ref,source_refs,evidence_refs,validation
  ) values
    (auto_rule,1,'Synthetic automated evidence gate.',
      '{"subject":"module.lifecycle","target_status":"Specified","requires":[{"evidence_type":"approved_specification","minimum_count":1,"approval_status":"approved"}]}'::jsonb,
      'REE CI','REE CI','test','approved','ci:ree-001','[]','[]','{"result":"allow_only_if_requirement_satisfied"}'),
    (hard_rule,1,'Synthetic hard evidence requirement.',
      '{"subject":"module.lifecycle","target_status":"Specified","requires":[{"evidence_type":"approved_specification","minimum_count":1,"approval_status":"approved"}]}'::jsonb,
      'REE CI','REE CI','test','approved','ci:ree-001','[]','[]','{"result":"allow_only_if_requirement_satisfied"}'),
    (review_rule,1,'Synthetic human review rule.','{}',
      'REE CI','REE CI','test','approved','ci:ree-001','[]','[]','{}'),
    (unsupported_rule,1,'Synthetic unsupported expression.',
      '{"subject":"module.lifecycle","target_status":"Specified","expression":"facts.score > 5"}'::jsonb,
      'REE CI','REE CI','test','approved','ci:ree-001','[]','[]','{"result":"allow_only_if_requirement_satisfied"}'),
    (inactive_rule,1,'Synthetic inactive evidence gate.',
      '{"subject":"module.lifecycle","target_status":"Specified","requires":[{"evidence_type":"approved_specification","minimum_count":1,"approval_status":"approved"}]}'::jsonb,
      'REE CI','REE CI','test','approved','ci:ree-001','[]','[]','{"result":"allow_only_if_requirement_satisfied"}');

  -- Positive canonical ARIS evaluation.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-ALLOW',root_id,'approve','module_lifecycle_transition','module','test','ARIS',
    'module.lifecycle','MODULE-CI-001',jsonb_build_object('target_status','Specified'),
    jsonb_build_array(jsonb_build_object('evidence_type','approved_specification','evidence_ref','ci:spec:1','approval_status','approved')),
    '{}'::jsonb,'REE-001 CI','agent'
  ) returning id into req_allow;

  result:=comind_pm.ree_evaluate_request_rule(req_allow,aris1,aris1_version);
  if result->>'outcome'<>'allow' or result->>'reason_code'<>'requirements_satisfied' then
    raise exception 'Expected canonical ARIS allow, got %',result;
  end if;
  first_result:=(result->>'result_id')::uuid;

  result:=comind_pm.ree_evaluate_request_rule(req_allow,aris1,aris1_version);
  if coalesce((result->>'reused')::boolean,false)<>true
     or (result->>'result_id')::uuid<>first_result then
    raise exception 'Expected idempotent evaluation reuse, got %',result;
  end if;

  -- Missing evidence on automated gate is explicit insufficiency, not allow.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-MISSING',root_id,'approve','module_lifecycle_transition','module','test','ARIS',
    'module.lifecycle','MODULE-CI-002',jsonb_build_object('target_status','Specified'),
    '[]'::jsonb,'{}'::jsonb,'REE-001 CI','agent'
  ) returning id into req_missing;

  result:=comind_pm.ree_evaluate_request_rule(req_missing,auto_rule,1);
  if result->>'outcome'<>'insufficient_evidence' then
    raise exception 'Expected automated-gate evidence insufficiency, got %',result;
  end if;

  -- Same missing evidence under hard constraint denies.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-HARD',root_id,'approve','module_lifecycle_transition','module','test','ARIS',
    'module.lifecycle','MODULE-CI-003',jsonb_build_object('target_status','Specified'),
    '[]'::jsonb,'{}'::jsonb,'REE-001 CI','agent'
  ) returning id into req_hard;

  result:=comind_pm.ree_evaluate_request_rule(req_hard,hard_rule,1);
  if result->>'outcome'<>'deny' or result->>'reason_code'<>'required_evidence_missing_hard_constraint' then
    raise exception 'Expected hard-constraint denial, got %',result;
  end if;

  -- Review-required remains human review even without executable formalization.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-REVIEW',root_id,'approve','module_lifecycle_transition','module','test','ARIS',
    'module.lifecycle','MODULE-CI-004',jsonb_build_object('target_status','Specified'),
    '[]'::jsonb,'{}'::jsonb,'REE-001 CI','agent'
  ) returning id into req_review;

  result:=comind_pm.ree_evaluate_request_rule(req_review,review_rule,1);
  if result->>'outcome'<>'require_review' then
    raise exception 'Expected require_review, got %',result;
  end if;

  -- Unsupported contract cannot execute.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-UNSUPPORTED',root_id,'approve','module_lifecycle_transition','module','test','ARIS',
    'module.lifecycle','MODULE-CI-005',jsonb_build_object('target_status','Specified'),
    '[]'::jsonb,'{}'::jsonb,'REE-001 CI','agent'
  ) returning id into req_unsupported;

  result:=comind_pm.ree_evaluate_request_rule(req_unsupported,unsupported_rule,1);
  if result->>'outcome'<>'not_machine_evaluable' or result->>'reason_code'<>'unsupported_formal_rule' then
    raise exception 'Expected unsupported contract refusal, got %',result;
  end if;

  -- Inactive rule cannot execute.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-INACTIVE',root_id,'approve','module_lifecycle_transition','module','test','ARIS',
    'module.lifecycle','MODULE-CI-006',jsonb_build_object('target_status','Specified'),
    '[]'::jsonb,'{}'::jsonb,'REE-001 CI','agent'
  ) returning id into req_inactive;

  result:=comind_pm.ree_evaluate_request_rule(req_inactive,inactive_rule,1);
  if result->>'outcome'<>'not_applicable' or result->>'reason_code'<>'rule_not_active' then
    raise exception 'Expected inactive rule not_applicable, got %',result;
  end if;

  -- Domain mismatch is not applicable.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-DOMAIN',root_id,'approve','module_lifecycle_transition','module','test','OTHER',
    'module.lifecycle','MODULE-CI-007',jsonb_build_object('target_status','Specified'),
    jsonb_build_array(jsonb_build_object('evidence_type','approved_specification','evidence_ref','ci:spec:2','approval_status','approved')),
    '{}'::jsonb,'REE-001 CI','agent'
  ) returning id into req_domain;

  -- Authority fails first because the authority is scoped to ARIS; that is the stronger boundary.
  result:=comind_pm.ree_evaluate_request_rule(req_domain,auto_rule,1);
  if result->>'outcome'<>'deny' then
    raise exception 'Expected authority/domain mismatch denial, got %',result;
  end if;

  -- Selector-bearing authority remains unresolved rather than guessed.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-SELECTOR',selector_id,'approve','module_lifecycle_transition','module','test','ARIS',
    'module.lifecycle','MODULE-CI-008',jsonb_build_object('target_status','Specified'),
    jsonb_build_array(jsonb_build_object('evidence_type','approved_specification','evidence_ref','ci:spec:3','approval_status','approved')),
    jsonb_build_object('ticket_required',true),'REE-001 CI','agent'
  ) returning id into req_selector;

  result:=comind_pm.ree_evaluate_request_rule(req_selector,auto_rule,1);
  if result->>'outcome'<>'unresolved' or result->>'reason_code'<>'authority_unresolved' then
    raise exception 'Expected selector authority unresolved, got %',result;
  end if;

  -- Production request by delegated C2 agent cannot bypass AUTH-001 human C4 boundary.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-CI-PROD',delegated_id,'approve','module_lifecycle_transition','module','production','ARIS',
    'module.lifecycle','MODULE-CI-009',jsonb_build_object('target_status','Specified'),
    jsonb_build_array(jsonb_build_object('evidence_type','approved_specification','evidence_ref','ci:spec:4','approval_status','approved')),
    '{}'::jsonb,'REE-001 CI','agent'
  ) returning id into req_prod;

  result:=comind_pm.ree_evaluate_request_rule(req_prod,auto_rule,1);
  if result->>'outcome'<>'deny' then
    raise exception 'Expected production C4 boundary denial, got %',result;
  end if;

  -- Request evidence validator rejects unbounded/unknown fields.
  begin
    insert into comind_pm.pm_rule_evaluation_requests(
      project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
      subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
    ) values (
      p,'REE-CI-BAD-EVIDENCE',root_id,'approve','module_lifecycle_transition','module','test','ARIS',
      'module.lifecycle','MODULE-CI-010',jsonb_build_object('target_status','Specified'),
      '[{"evidence_type":"approved_specification","evidence_ref":"ci:bad","invented":true}]'::jsonb,
      '{}'::jsonb,'REE-001 CI','agent'
    );
    raise exception 'Expected invalid evidence claim rejection';
  exception when others then
    if position('bounded typed evidence claims' in sqlerrm)=0 then raise; end if;
  end;

  -- Evaluation history is append-only.
  begin
    update comind_pm.pm_rule_evaluation_results
    set reason_code='tampered'
    where id=first_result;
    raise exception 'Expected evaluation result mutation rejection';
  exception when others then
    if position('append-only' in sqlerrm)=0 then raise; end if;
  end;

  begin
    update comind_pm.pm_rule_evaluation_requests
    set subject_ref='tampered'
    where id=req_allow;
    raise exception 'Expected evaluation request mutation rejection';
  exception when others then
    if position('append-only' in sqlerrm)=0 then raise; end if;
  end;
end;
$$;

select 'REE-001 structural, readiness, authority, evaluation, and immutability verification passed' as result;
rollback;
