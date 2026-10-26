begin;

-- DRULE-003 structural and behavioral verification. All synthetic rows roll back.

do $$
declare
  missing_tables text[];
  non_rls_tables text[];
  missing_views text[];
  service_role_missing text[];
begin
  select array_agg(required_name order by required_name)
  into missing_tables
  from unnest(array[
    'pm_rule_authorities',
    'pm_rule_activation_requests',
    'pm_rule_activation_case_links',
    'pm_rule_activation_authority_assessments',
    'pm_rule_activation_events'
  ]) required_name
  where to_regclass('comind_pm.' || required_name) is null;

  if missing_tables is not null then
    raise exception 'DRULE-003 missing tables: %', missing_tables;
  end if;

  select array_agg(c.relname order by c.relname)
  into non_rls_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'comind_pm'
    and c.relname = any(array[
      'pm_rule_authorities',
      'pm_rule_activation_requests',
      'pm_rule_activation_case_links',
      'pm_rule_activation_authority_assessments',
      'pm_rule_activation_events'
    ])
    and not c.relrowsecurity;

  if non_rls_tables is not null then
    raise exception 'DRULE-003 tables without RLS: %', non_rls_tables;
  end if;

  select array_agg(required_name order by required_name)
  into missing_views
  from unnest(array['v_rule_activation_readiness','v_active_rule_authority']) required_name
  where to_regclass('comind_pm.' || required_name) is null;

  if missing_views is not null then
    raise exception 'DRULE-003 missing views: %', missing_views;
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='comind_pm'
      and c.relname='v_rule_activation_readiness'
      and coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']::text[]
  ) or not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='comind_pm'
      and c.relname='v_active_rule_authority'
      and coalesce(c.reloptions,'{}'::text[]) @> array['security_invoker=true']::text[]
  ) then
    raise exception 'DRULE-003 views must be security_invoker';
  end if;

  select array_agg(t.table_name order by t.table_name)
  into service_role_missing
  from (values
    ('pm_rule_authorities'),
    ('pm_rule_activation_requests'),
    ('pm_rule_activation_case_links'),
    ('pm_rule_activation_authority_assessments'),
    ('pm_rule_activation_events')
  ) as t(table_name)
  where not exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema='comind_pm'
      and g.table_name=t.table_name
      and g.grantee='service_role'
      and g.privilege_type='SELECT'
  );

  if service_role_missing is not null then
    raise exception 'DRULE-003 service_role SELECT missing: %', service_role_missing;
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants g
    where g.table_schema='comind_pm'
      and g.table_name = any(array[
        'pm_rule_authorities',
        'pm_rule_activation_requests',
        'pm_rule_activation_case_links',
        'pm_rule_activation_authority_assessments',
        'pm_rule_activation_events',
        'v_rule_activation_readiness',
        'v_active_rule_authority'
      ])
      and g.grantee in ('anon','authenticated','PUBLIC')
  ) then
    raise exception 'DRULE-003 public/client grants detected';
  end if;

  if has_function_privilege('anon','comind_pm.enforce_rule_activation_event_insert()','EXECUTE')
     or has_function_privilege('authenticated','comind_pm.enforce_rule_activation_event_insert()','EXECUTE')
     or has_function_privilege('anon','comind_pm.record_rule_activation_submission()','EXECUTE')
     or has_function_privilege('authenticated','comind_pm.record_rule_activation_submission()','EXECUTE')
  then
    raise exception 'DRULE-003 helper function execute leaked to client roles';
  end if;
end $$;

do $$
declare
  v_project uuid;
  v_rule uuid;
  v_authority uuid;
  v_request uuid;
  v_case uuid;
  v_event uuid;
  v_blocked boolean := false;
  v_bad_version_blocked boolean := false;
  v_immutable boolean := false;
begin
  insert into comind_pm.pm_projects(project_key,name,summary,status,priority,owner,source_system,source_ref)
  values ('VERIFY-DRULE003','DRULE-003 Verification','Synthetic rollback-only project','active',5,'verification','manual','db:verification:drule-003')
  returning id into v_project;

  insert into comind_pm.pm_rules(
    project_id,rule_key,title,domain,rule_type,modality,status,scope,enforcement_mode,machine_checkable,current_version
  ) values (
    v_project,'VERIFY-RULE-001','Synthetic activation rule','verification','governance','MUST','approved','{}'::jsonb,'automated_gate',true,1
  ) returning id into v_rule;

  insert into comind_pm.pm_rule_versions(
    rule_id,version,rule_text,formal_rule,rationale,authority,authority_type,approval_status,source_refs,evidence_refs
  ) values (
    v_rule,1,'Synthetic rule for DRULE-003 verification.','{}'::jsonb,'Verification only','Synthetic verifier','verification','approved',
    '["db:verification:drule-003"]'::jsonb,'["db:verification:drule-003"]'::jsonb
  );

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status
  ) values (
    v_project,'VERIFY-AUTH-001','delegated_authority','role','DRULE-003 verifier','{}'::jsonb,
    array['approve','activate','supersede','revoke']::text[],
    '["db:verification:authority"]'::jsonb,'active'
  ) returning id into v_authority;

  begin
    insert into comind_pm.pm_rule_activation_requests(
      project_id,request_key,rule_id,rule_version,requested_state,target_environment,target_scope,requested_by,rationale,evidence_refs
    ) values (
      v_project,'VERIFY-BAD-VERSION',v_rule,99,'active','governance','{}'::jsonb,'verification','Must fail exact-version FK.',
      '["db:verification:bad-version"]'::jsonb
    );
  exception when foreign_key_violation then
    v_bad_version_blocked := true;
  end;

  if not v_bad_version_blocked then
    raise exception 'DRULE-003 failed to require exact rule version identity';
  end if;

  insert into comind_pm.pm_rule_activation_requests(
    project_id,request_key,rule_id,rule_version,requested_state,target_environment,target_scope,requested_by,rationale,evidence_refs
  ) values (
    v_project,'VERIFY-ACT-001',v_rule,1,'active','governance','{}'::jsonb,'verification','Exercise authority and blocker gates.',
    '["db:verification:request"]'::jsonb
  ) returning id into v_request;

  if (select status from comind_pm.pm_rule_activation_requests where id=v_request) <> 'pending_review' then
    raise exception 'DRULE-003 submission did not preserve pending_review status';
  end if;

  if not exists (
    select 1 from comind_pm.pm_rule_activation_events
    where activation_request_id=v_request and event_type='submitted'
  ) then
    raise exception 'DRULE-003 submission event not recorded';
  end if;

  insert into comind_pm.pm_rule_activation_authority_assessments(
    activation_request_id,authority_id,required_capability,determination,rationale,evidence_refs,assessed_by
  ) values (
    v_request,v_authority,'approve','sufficient','Synthetic authority is sufficient to approve.',
    '["db:verification:approve-assessment"]'::jsonb,'verification'
  );

  insert into comind_pm.pm_rule_activation_events(
    activation_request_id,event_type,actor,authority_id,rationale,evidence_refs
  ) values (
    v_request,'approved','verification',v_authority,'Synthetic request approved.',
    '["db:verification:approval"]'::jsonb
  );

  if (select status from comind_pm.pm_rule_activation_requests where id=v_request) <> 'approved' then
    raise exception 'DRULE-003 approved event did not synchronize request status';
  end if;

  insert into comind_pm.pm_rule_reconciliation_cases(
    project_id,case_key,case_type,title,status,severity,problem_statement,resolution_criteria,authority_owner,opened_by,evidence_refs
  ) values (
    v_project,'VERIFY-BLOCKER-001','activation_review','Synthetic activation blocker','open','high',
    'Synthetic open case must block activation.','Resolve the synthetic case.','verification','verification',
    '["db:verification:blocker"]'::jsonb
  ) returning id into v_case;

  insert into comind_pm.pm_rule_activation_case_links(
    activation_request_id,reconciliation_case_id,blocking,rationale
  ) values (v_request,v_case,true,'Synthetic blocker link.');

  insert into comind_pm.pm_rule_activation_authority_assessments(
    activation_request_id,authority_id,required_capability,determination,rationale,evidence_refs,assessed_by
  ) values (
    v_request,v_authority,'activate','sufficient','Synthetic authority is sufficient to activate after blockers clear.',
    '["db:verification:activate-assessment"]'::jsonb,'verification'
  );

  begin
    insert into comind_pm.pm_rule_activation_events(
      activation_request_id,event_type,actor,authority_id,rationale,evidence_refs
    ) values (
      v_request,'activated','verification',v_authority,'This activation must be blocked.',
      '["db:verification:blocked-activation"]'::jsonb
    );
  exception when others then
    if position('unresolved blocking reconciliation cases' in sqlerrm) > 0 then
      v_blocked := true;
    else
      raise;
    end if;
  end;

  if not v_blocked then
    raise exception 'DRULE-003 allowed activation with unresolved blocking reconciliation case';
  end if;

  if (select ready_to_activate from comind_pm.v_rule_activation_readiness where activation_request_id=v_request) then
    raise exception 'DRULE-003 readiness projection ignored blocking case';
  end if;

  update comind_pm.pm_rule_reconciliation_cases
  set status='resolved',resolution_summary='Synthetic blocker resolved.',resolved_by='verification',resolved_at=now()
  where id=v_case;

  if not (select ready_to_activate from comind_pm.v_rule_activation_readiness where activation_request_id=v_request) then
    raise exception 'DRULE-003 readiness projection did not become ready after blocker resolution';
  end if;

  insert into comind_pm.pm_rule_activation_events(
    activation_request_id,event_type,actor,authority_id,rationale,evidence_refs
  ) values (
    v_request,'activated','verification',v_authority,'Synthetic activation after blocker resolution.',
    '["db:verification:activation"]'::jsonb
  ) returning id into v_event;

  if (select status from comind_pm.pm_rule_activation_requests where id=v_request) <> 'activated' then
    raise exception 'DRULE-003 activation event did not synchronize request status';
  end if;

  if not exists (
    select 1 from comind_pm.v_active_rule_authority
    where activation_request_id=v_request
      and rule_id=v_rule
      and rule_version=1
      and authority_id=v_authority
  ) then
    raise exception 'DRULE-003 active authority projection missing exact activated version';
  end if;

  begin
    update comind_pm.pm_rule_activation_events
    set rationale='Mutation must fail.'
    where id=v_event;
  exception when others then
    if position('append-only' in sqlerrm) > 0 then
      v_immutable := true;
    else
      raise;
    end if;
  end;

  if not v_immutable then
    raise exception 'DRULE-003 activation event history is mutable';
  end if;
end $$;

select
  (select count(*) from comind_pm.pm_rule_authorities) as authority_count,
  (select count(*) from comind_pm.pm_rule_activation_requests) as activation_request_count,
  (select count(*) from comind_pm.pm_rule_activation_authority_assessments) as authority_assessment_count,
  (select count(*) from comind_pm.pm_rule_activation_events) as activation_event_count,
  (select count(*) from comind_pm.v_active_rule_authority) as active_rule_authority_count;

rollback;
