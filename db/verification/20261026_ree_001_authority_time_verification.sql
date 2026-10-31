\set ON_ERROR_STOP on

begin;

do $$
declare
  p uuid;
  root_id uuid;
  delegated_id uuid;
  rel_id uuid;
  rule_id uuid;
  rule_version integer;
  request_id uuid;
  stored_requested_at timestamptz;
  historical_authority jsonb;
  result jsonb;
begin
  select id into p
  from comind_pm.pm_projects
  where project_key='COMIND';
  if p is null then raise exception 'COMIND project missing'; end if;

  select id,current_version into rule_id,rule_version
  from comind_pm.pm_rules
  where project_id=p and rule_key='RULE-ARIS-LC-001';
  if rule_id is null then raise exception 'RULE-ARIS-LC-001 missing'; end if;

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,
    evidence_refs,status,valid_from
  ) values (
    p,'AUTH-REE-TIME-ROOT','founder','human','REE authority-time root','{}',array['approve'],
    jsonb_build_array('ci:ree-001:authority-time'),'active','2000-01-01 00:00:00+00'
  ) returning id into root_id;

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,
    evidence_refs,status,valid_from
  ) values (
    p,'AUTH-REE-TIME-DELEGATED','delegated_authority','agent','REE authority-time delegate','{}',array['approve'],
    jsonb_build_array('ci:ree-001:authority-time'),'active','2000-01-01 00:00:00+00'
  ) returning id into delegated_id;

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,resource_classes,
    capabilities,authority_level,evidence_refs,valid_from
  ) values
    (p,root_id,'ree-time-root',array['ARIS'],array['production'],array['module_lifecycle_transition'],array['module'],
      array['approve'],'C4',jsonb_build_array('ci:ree-001:authority-time'),'2000-01-01 00:00:00+00'),
    (p,delegated_id,'ree-time-delegated',array['ARIS'],array['production'],array['module_lifecycle_transition'],array['module'],
      array['approve'],'C2',jsonb_build_array('ci:ree-001:authority-time'),'2000-01-01 00:00:00+00');

  insert into comind_pm.pm_authority_relationships(
    project_id,authority_id,related_authority_id,relationship_type,capabilities,domains,environments,
    operation_classes,resource_classes,rationale,evidence_refs,created_by,valid_from
  ) values (
    p,root_id,delegated_id,'delegates_to',array['approve'],array['ARIS'],array['production'],
    array['module_lifecycle_transition'],array['module'],
    'Synthetic delegation used to prove authority-time hardening.',
    jsonb_build_array('ci:ree-001:authority-time'),'REE-001 CI','2000-01-01 00:00:00+00'
  ) returning id into rel_id;

  insert into comind_pm.pm_authority_relationship_events(
    relationship_id,event_type,actor,rationale,evidence_refs
  ) values (
    rel_id,'confirmed','REE-001 CI','Confirm authority-time delegation.',
    jsonb_build_array('ci:ree-001:authority-time')
  );

  -- Demonstrate why caller-controlled historical evaluation time is unsafe:
  -- the production C4/human requirements did not exist in this synthetic year-2000 view.
  historical_authority:=comind_pm.resolve_authority_request(
    p,delegated_id,'approve','module_lifecycle_transition','module','production','ARIS','{}'::jsonb,
    '2000-01-02 00:00:00+00'
  );
  if historical_authority->>'determination'<>'sufficient' then
    raise exception 'Fixture failed to demonstrate historical authority difference: %',historical_authority;
  end if;

  -- A caller attempts to backdate the REE request to the same time.
  insert into comind_pm.pm_rule_evaluation_requests(
    project_id,request_key,authority_id,capability,action,resource_class,environment,domain,
    subject_type,subject_ref,facts,evidence_claims,context,requested_by,requested_by_type,requested_at
  ) values (
    p,'REE-AUTHORITY-TIME-CI',delegated_id,'approve','module_lifecycle_transition','module','production','ARIS',
    'module.lifecycle','MODULE-REE-AUTHORITY-TIME',jsonb_build_object('target_status','Specified'),
    jsonb_build_array(jsonb_build_object(
      'evidence_type','approved_specification',
      'evidence_ref','ci:ree-001:authority-time:spec',
      'approval_status','approved'
    )),
    '{}'::jsonb,'REE-001 CI','agent','2000-01-02 00:00:00+00'
  ) returning id,requested_at into request_id,stored_requested_at;

  if stored_requested_at < statement_timestamp()-interval '5 minutes'
     or stored_requested_at > statement_timestamp()+interval '5 minutes' then
    raise exception 'Caller-controlled requested_at was not replaced by database time: %',stored_requested_at;
  end if;

  result:=comind_pm.ree_evaluate_request_rule(request_id,rule_id,rule_version);
  if result->>'outcome'<>'deny' then
    raise exception 'Current production C4/human authority boundary was bypassed: %',result;
  end if;
  if result->>'reason_code' not like 'authority_%' then
    raise exception 'Expected authority denial reason, got %',result;
  end if;
  if result->'diagnostics'->>'authority_evaluated_at' is null then
    raise exception 'Authority evaluation timestamp was not preserved in diagnostics: %',result;
  end if;
end;
$$;

select 'REE-001 server-controlled authority-time verification passed' as result;
rollback;
