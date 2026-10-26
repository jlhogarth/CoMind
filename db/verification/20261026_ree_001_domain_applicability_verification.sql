\set ON_ERROR_STOP on

begin;

do $$
declare
  p uuid;
  authority_id uuid;
  aris_rule uuid;
  aris_version integer;
  request_id uuid;
  result jsonb;
begin
  select id into p
  from comind_pm.pm_projects
  where project_key='COMIND';
  if p is null then raise exception 'COMIND project missing'; end if;

  select id,current_version into aris_rule,aris_version
  from comind_pm.pm_rules
  where project_id=p and rule_key='RULE-ARIS-LC-001';
  if aris_rule is null then raise exception 'RULE-ARIS-LC-001 missing'; end if;

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status
  ) values (
    p,'AUTH-REE-DOMAIN-CI','founder','human','REE domain applicability fixture','{}',
    array['approve'],jsonb_build_array('ci:ree-001:domain'),'active'
  ) returning id into authority_id;

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,resource_classes,
    capabilities,authority_level,evidence_refs
  ) values (
    p,authority_id,'ree-domain-ci',array['*'],array['test'],array['module_lifecycle_transition'],array['module'],
    array['approve'],'C4',jsonb_build_array('ci:ree-001:domain')
  );

  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type
  ) values (
    p,'REE-DOMAIN-CI',authority_id,'approve','module_lifecycle_transition','module','test','OTHER',
    'module.lifecycle','MODULE-REE-DOMAIN-CI',jsonb_build_object('target_status','Specified'),
    jsonb_build_array(jsonb_build_object(
      'evidence_type','approved_specification',
      'evidence_ref','ci:ree-001:domain:spec',
      'approval_status','approved'
    )),
    '{}'::jsonb,'REE-001 CI','agent'
  ) returning id into request_id;

  result:=comind_pm.ree_evaluate_request_rule(request_id,aris_rule,aris_version);
  if result->>'outcome'<>'not_applicable'
     or result->>'reason_code'<>'rule_domain_mismatch' then
    raise exception 'Expected direct rule-domain mismatch, got %',result;
  end if;
end;
$$;

select 'REE-001 direct rule-domain applicability verification passed' as result;
rollback;
