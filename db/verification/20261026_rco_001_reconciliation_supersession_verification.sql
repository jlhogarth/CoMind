\set ON_ERROR_STOP on

begin;

do $$
declare
  p uuid; authority_id uuid; policy_id uuid; aris_set_id uuid; eval_id uuid; comp_id uuid;
  r1 uuid; r2 uuid; case_id uuid; x jsonb;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';
  select id into policy_id from comind_pm.pm_rule_composition_policies where project_id=p and policy_key='constraint_guarded_composition' and version=1;
  select id into aris_set_id from comind_pm.pm_rule_composition_sets where project_id=p and set_key='ARIS-LIFECYCLE-READY' and version=1;
  select id into r1 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-001';
  select id into r2 from comind_pm.pm_rules where project_id=p and rule_key='RULE-ARIS-LC-002';

  insert into comind_pm.pm_rule_authorities(project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status)
  values(p,'AUTH-RCO-CI-RECON','operational_authority','human','RCO reconciliation CI authority','{}',array['activate'],jsonb_build_array('ci:rco-001'),'active') returning id into authority_id;
  insert into comind_pm.pm_authority_scope_bindings(project_id,authority_id,binding_key,domains,environments,operation_classes,resource_classes,capabilities,authority_level,evidence_refs)
  values(p,authority_id,'rco-ci-recon',array['ARIS'],array['test'],array['lifecycle_transition'],array['module'],array['activate'],'C2',jsonb_build_array('ci:rco-001'));

  insert into comind_pm.pm_rule_reconciliation_cases(project_id,case_key,case_type,title,status,severity,problem_statement,resolution_criteria,authority_owner,opened_by,evidence_refs)
  values(p,'RC-RCO-CI-BLOCK','activation_review','RCO synthetic blocking review','open','high','Synthetic rollback-only activation review.','Resolve before composition can allow.','RCO-001','RCO CI',jsonb_build_array('ci:rco-001')) returning id into case_id;
  insert into comind_pm.pm_rule_reconciliation_members(case_id,rule_id,role,position,metadata)
  values(case_id,r1,'subject','blocks evaluation','{}'::jsonb);

  insert into comind_pm.pm_rule_evaluation_requests(project_id,request_key,authority_id,capability,action,resource_class,environment,domain,subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type)
  values(p,'RCO-CI-RECON-EVAL',authority_id,'activate','lifecycle_transition','module','test','ARIS','module.lifecycle','module:rco-recon',jsonb_build_object('target_status','Specified'),jsonb_build_array(jsonb_build_object('evidence_type','approved_specification','evidence_ref','ci:rco-recon','approval_status','approved')),'{}','RCO CI','system') returning id into eval_id;
  perform comind_pm.ree_evaluate_request_rule(eval_id,r1,1);
  perform comind_pm.ree_evaluate_request_rule(eval_id,r2,1);
  insert into comind_pm.pm_rule_composition_requests(project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,requested_by,requested_by_type)
  values(p,'RCO-CI-RECON-COMP',eval_id,policy_id,aris_set_id,'RCO CI','system') returning id into comp_id;
  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'unresolved' or x->>'reason_code'<>'blocking_reconciliation_case' then
    raise exception 'Blocking reconciliation did not fail closed: %',x;
  end if;
end;
$$;

do $$
declare
  p uuid; authority_id uuid; policy_id uuid; set_id uuid; eval_id uuid; comp_id uuid;
  old_id uuid; new_id uuid; x jsonb;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';
  select id into policy_id from comind_pm.pm_rule_composition_policies where project_id=p and policy_key='constraint_guarded_composition' and version=1;

  insert into comind_pm.pm_rule_authorities(project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status)
  values(p,'AUTH-RCO-CI-SUPERSEDE','operational_authority','human','RCO supersession CI authority','{}',array['activate'],jsonb_build_array('ci:rco-001'),'active') returning id into authority_id;
  insert into comind_pm.pm_authority_scope_bindings(project_id,authority_id,binding_key,domains,environments,operation_classes,resource_classes,capabilities,authority_level,evidence_refs)
  values(p,authority_id,'rco-ci-supersede',array['RCO_SUPERSEDE'],array['test'],array['test_action'],array['test_resource'],array['activate'],'C2',jsonb_build_array('ci:rco-001'));

  insert into comind_pm.pm_rules(project_id,rule_key,title,domain,rule_type,modality,status,scope,enforcement_mode,machine_checkable,current_version,owner)
  values
    (p,'RULE-RCO-CI-OLD','Old active hard constraint','RCO_SUPERSEDE','verification','MUST','active','{}','hard_constraint',true,1,'RCO-001'),
    (p,'RULE-RCO-CI-NEW','New active successor','RCO_SUPERSEDE','verification','MUST','active','{}','automated_gate',true,1,'RCO-001');
  select id into old_id from comind_pm.pm_rules where project_id=p and rule_key='RULE-RCO-CI-OLD';
  select id into new_id from comind_pm.pm_rules where project_id=p and rule_key='RULE-RCO-CI-NEW';
  insert into comind_pm.pm_rule_versions(rule_id,version,rule_text,formal_rule,rationale,authority,authority_type,approval_status,decision_ref,source_refs,evidence_refs,validation)
  values
    (old_id,1,'Old hard constraint requires old_guard.',jsonb_build_object('subject','rco.subject','target_status','Ready','requires',jsonb_build_array(jsonb_build_object('evidence_type','old_guard','minimum_count',1))),'Synthetic predecessor.','RCO-001','founder_approved_rule','approved','ci:rco-001',jsonb_build_array('ci:rco-001'),jsonb_build_array('ci:rco-001'),jsonb_build_object('result','allow_only_if_requirement_satisfied')),
    (new_id,1,'New rule requires positive evidence.',jsonb_build_object('subject','rco.subject','target_status','Ready','requires',jsonb_build_array(jsonb_build_object('evidence_type','positive','minimum_count',1))),'Synthetic successor.','RCO-001','founder_approved_rule','approved','ci:rco-001',jsonb_build_array('ci:rco-001'),jsonb_build_array('ci:rco-001'),jsonb_build_object('result','allow_only_if_requirement_satisfied'));

  insert into comind_pm.pm_rule_relationships(project_id,rule_id,related_rule_id,relationship_type,relationship_status,confidence,rationale,evidence_refs,decided_by,decided_at)
  values(p,new_id,old_id,'supersedes','confirmed',1,'Supersession is explicit lineage and does not erase a still-active governed member.',jsonb_build_array('ci:rco-001'),'RCO CI',statement_timestamp());

  insert into comind_pm.pm_rule_composition_sets(project_id,set_key,version,title,selection_strategy,domain_scope,environment_scope,action_scope,resource_scope,completeness_status,status,evidence_refs,created_by)
  values(p,'RCO-CI-SUPERSEDE-SET',1,'Supersession semantics set','explicit_governed_membership',array['RCO_SUPERSEDE'],array['test'],array['test_action'],array['test_resource'],'complete_for_declared_scope','active',jsonb_build_array('ci:rco-001'),'RCO CI') returning id into set_id;
  insert into comind_pm.pm_rule_composition_set_members(set_id,rule_id,rule_version,evidence_refs)
  values(set_id,old_id,1,jsonb_build_array('ci:rco-001')),(set_id,new_id,1,jsonb_build_array('ci:rco-001'));

  insert into comind_pm.pm_rule_evaluation_requests(project_id,request_key,authority_id,capability,action,resource_class,environment,domain,subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type)
  values(p,'RCO-CI-SUPERSEDE-EVAL',authority_id,'activate','test_action','test_resource','test','RCO_SUPERSEDE','rco.subject','rco:supersede',jsonb_build_object('target_status','Ready'),jsonb_build_array(jsonb_build_object('evidence_type','positive','evidence_ref','ci:rco-positive')),'{}','RCO CI','system') returning id into eval_id;
  perform comind_pm.ree_evaluate_request_rule(eval_id,old_id,1);
  perform comind_pm.ree_evaluate_request_rule(eval_id,new_id,1);
  insert into comind_pm.pm_rule_composition_requests(project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,requested_by,requested_by_type)
  values(p,'RCO-CI-SUPERSEDE-COMP',eval_id,policy_id,set_id,'RCO CI','system') returning id into comp_id;
  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'deny' or x->>'reason_code'<>'deny_overrides' then
    raise exception 'Supersedes edge silently erased active predecessor: %',x;
  end if;

  update comind_pm.pm_rules set status='superseded' where id=old_id;
  insert into comind_pm.pm_rule_evaluation_requests(project_id,request_key,authority_id,capability,action,resource_class,environment,domain,subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type)
  values(p,'RCO-CI-SUPERSEDE-STALE-EVAL',authority_id,'activate','test_action','test_resource','test','RCO_SUPERSEDE','rco.subject','rco:supersede-stale',jsonb_build_object('target_status','Ready'),jsonb_build_array(jsonb_build_object('evidence_type','positive','evidence_ref','ci:rco-positive-2')),'{}','RCO CI','system') returning id into eval_id;
  perform comind_pm.ree_evaluate_request_rule(eval_id,old_id,1);
  perform comind_pm.ree_evaluate_request_rule(eval_id,new_id,1);
  insert into comind_pm.pm_rule_composition_requests(project_id,request_key,evaluation_request_id,composition_policy_id,composition_set_id,requested_by,requested_by_type)
  values(p,'RCO-CI-SUPERSEDE-STALE-COMP',eval_id,policy_id,set_id,'RCO CI','system') returning id into comp_id;
  x:=comind_pm.rco_compose_request(comp_id);
  if x->>'final_outcome'<>'unresolved' or x->>'reason_code'<>'composition_set_stale' then
    raise exception 'Lifecycle supersession did not require set refresh: %',x;
  end if;
end;
$$;

select 'RCO-001 reconciliation and supersession regression verification passed' as result;
rollback;
