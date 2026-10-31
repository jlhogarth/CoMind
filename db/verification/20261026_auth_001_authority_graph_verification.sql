\set ON_ERROR_STOP on

-- Structural contract.
do $$
declare
  missing text[];
  rls_missing text[];
begin
  select array_agg(name order by name) into missing
  from unnest(array[
    'pm_authority_scope_bindings',
    'pm_authority_basis_links',
    'pm_authority_relationships',
    'pm_authority_relationship_events',
    'pm_authority_requirements'
  ]) as t(name)
  where to_regclass('comind_pm.'||name) is null;
  if missing is not null then
    raise exception 'AUTH-001 missing tables: %',missing;
  end if;

  if to_regclass('comind_pm.v_authority_scope_current') is null
     or to_regclass('comind_pm.v_authority_requirement_current') is null
     or to_regclass('comind_pm.v_authority_relationship_current') is null
     or to_regclass('comind_pm.v_authority_delegation_lineage') is null then
    raise exception 'AUTH-001 required views are missing';
  end if;

  if to_regprocedure('comind_pm.resolve_authority_request(uuid,uuid,text,text,text,text,text,jsonb,timestamp with time zone)') is null then
    raise exception 'AUTH-001 resolver function is missing';
  end if;

  select array_agg(c.relname order by c.relname) into rls_missing
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='comind_pm'
    and c.relname=any(array[
      'pm_authority_scope_bindings',
      'pm_authority_basis_links',
      'pm_authority_relationships',
      'pm_authority_relationship_events',
      'pm_authority_requirements'
    ])
    and not c.relrowsecurity;
  if rls_missing is not null then
    raise exception 'AUTH-001 RLS missing: %',rls_missing;
  end if;

  if exists(
    select 1
    from information_schema.role_table_grants g
    where g.table_schema='comind_pm'
      and g.table_name=any(array[
        'pm_authority_scope_bindings',
        'pm_authority_basis_links',
        'pm_authority_relationships',
        'pm_authority_relationship_events',
        'pm_authority_requirements'
      ])
      and g.grantee in ('anon','authenticated','PUBLIC')
  ) then
    raise exception 'AUTH-001 public/authenticated table grants detected';
  end if;

  if not exists(
    select 1 from information_schema.columns
    where table_schema='comind_pm'
      and table_name='pm_authority_relationship_events'
      and column_name='event_seq'
      and data_type='bigint'
  ) then
    raise exception 'AUTH-001 deterministic event sequence is missing';
  end if;
end;
$$;

-- Real seed contract.
do $$
declare
  p uuid;
  founder uuid;
  n integer;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';
  if p is null then raise exception 'COMIND project missing'; end if;

  select id into founder
  from comind_pm.pm_rule_authorities
  where project_id=p and authority_key='AUTH-FOUNDER-001' and status='active';
  if founder is null then raise exception 'AUTH-FOUNDER-001 missing'; end if;

  select count(*) into n
  from comind_pm.pm_authority_scope_bindings
  where authority_id=founder
    and binding_key='founder-governance-nonproduction'
    and version=1
    and status='active'
    and environments @> array['development','test','staging']::text[]
    and not ('production'=any(environments))
    and authority_level is null
    and metadata @> '{"production_excluded":true,"c4_not_implied":true}'::jsonb;
  if n<>1 then raise exception 'Expected exactly one bounded founder scope, got %',n; end if;

  select count(*) into n
  from comind_pm.pm_authority_basis_links
  where authority_id=founder and basis_role='establishes' and authority_effect='governing';
  if n<>1 then raise exception 'Expected exactly one founder governing basis link, got %',n; end if;

  select count(*) into n
  from comind_pm.pm_authority_requirements
  where project_id=p
    and requirement_key like 'PRODUCTION-C4-HUMAN-%'
    and version=1
    and target_environment='production'
    and required_authority_level='C4'
    and human_required
    and status='active';
  if n<>6 then raise exception 'Expected six production C4/human requirements, got %',n; end if;
end;
$$;

-- Behavioral contract. Everything below is synthetic and rolled back.
begin;

do $$
declare
  p uuid;
  root_id uuid;
  delegated_id uuid;
  advisory_id uuid;
  conflict_id uuid;
  expired_id uuid;
  selector_id uuid;
  rel_id uuid;
  constraint_rel uuid;
  conflict_rel uuid;
  reverse_rel uuid;
  source_id uuid;
  case_id uuid;
  result jsonb;
begin
  select id into p from comind_pm.pm_projects where project_key='COMIND';

  insert into comind_pm.pm_rule_source_documents(
    project_id,source_system,source_ref,title,source_class,authority_status,
    ingestion_status,retrieval_completeness,notes
  ) values (
    p,'manual','ci:auth-001:canonical-source','AUTH-001 synthetic canonical source','other','canonical',
    'reviewed','complete','Synthetic rollback-only source for non-escalation proof.'
  ) returning id into source_id;

  insert into comind_pm.pm_rule_reconciliation_cases(
    project_id,case_key,case_type,title,status,severity,problem_statement,resolution_criteria,
    authority_owner,opened_by,evidence_refs
  ) values (
    p,'RC-AUTH-CI-001','authority','AUTH-001 synthetic unresolved authority conflict','open','high',
    'Synthetic rollback-only authority conflict.','Must be explicitly resolved; recency is insufficient.',
    'Founder','AUTH-001 CI',jsonb_build_array('ci:auth-001')
  ) returning id into case_id;

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status
  ) values
    (p,'AUTH-CI-ROOT','founder','human','Synthetic human root','{}',array['activate'],jsonb_build_array('ci:auth-001'),'active'),
    (p,'AUTH-CI-DELEGATED','delegated_authority','agent','Synthetic delegated agent','{}',array['activate'],jsonb_build_array('ci:auth-001'),'active'),
    (p,'AUTH-CI-ADVISORY','advisory','artifact','Synthetic advisory authority','{}',array['activate'],jsonb_build_array('ci:auth-001'),'active'),
    (p,'AUTH-CI-CONFLICT','approved_policy','policy','Synthetic conflicting policy','{}',array['activate'],jsonb_build_array('ci:auth-001'),'active');

  select id into root_id from comind_pm.pm_rule_authorities where project_id=p and authority_key='AUTH-CI-ROOT';
  select id into delegated_id from comind_pm.pm_rule_authorities where project_id=p and authority_key='AUTH-CI-DELEGATED';
  select id into advisory_id from comind_pm.pm_rule_authorities where project_id=p and authority_key='AUTH-CI-ADVISORY';
  select id into conflict_id from comind_pm.pm_rule_authorities where project_id=p and authority_key='AUTH-CI-CONFLICT';

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,
    status,valid_from,valid_until
  ) values (
    p,'AUTH-CI-EXPIRED','operational_authority','human','Synthetic expired operator','{}',
    array['activate'],jsonb_build_array('ci:auth-001'),'active',now()-interval '2 days',now()-interval '1 day'
  ) returning id into expired_id;

  insert into comind_pm.pm_rule_authorities(
    project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status
  ) values (
    p,'AUTH-CI-SELECTOR','operational_authority','human','Synthetic selector-bound operator','{}',
    array['activate'],jsonb_build_array('ci:auth-001'),'active'
  ) returning id into selector_id;

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,resource_classes,
    capabilities,authority_level,evidence_refs
  ) values
    (p,root_id,'ci-root',array['governance'],array['test','production'],array['rule_activation'],array['rule'],array['activate'],'C4',jsonb_build_array('ci:auth-001')),
    (p,delegated_id,'ci-delegated',array['governance'],array['test','production'],array['rule_activation'],array['rule'],array['activate'],'C2',jsonb_build_array('ci:auth-001')),
    (p,advisory_id,'ci-advisory',array['governance'],array['test'],array['rule_activation'],array['rule'],array['activate'],'C4',jsonb_build_array('ci:auth-001')),
    (p,conflict_id,'ci-conflict',array['governance'],array['test'],array['rule_activation'],array['rule'],array['activate'],'C4',jsonb_build_array('ci:auth-001')),
    (p,expired_id,'ci-expired',array['governance'],array['test'],array['rule_activation'],array['rule'],array['activate'],'C4',jsonb_build_array('ci:auth-001'));

  insert into comind_pm.pm_authority_scope_bindings(
    project_id,authority_id,binding_key,domains,environments,operation_classes,resource_classes,
    capabilities,authority_level,selector,evidence_refs
  ) values (
    p,selector_id,'ci-selector',array['governance'],array['test'],array['rule_activation'],array['rule'],array['activate'],'C4',
    jsonb_build_object('ticket_required',true),jsonb_build_array('ci:auth-001')
  );

  -- A canonical source may support evidence, but cannot promote advisory authority into permission.
  insert into comind_pm.pm_authority_basis_links(
    project_id,authority_id,basis_type,source_document_id,basis_role,authority_effect,rationale,evidence_refs
  ) values (
    p,advisory_id,'source_document',source_id,'supports','evidentiary_only',
    'Canonical source support is evidentiary only and must not grant authority.',jsonb_build_array('ci:auth-001')
  );

  -- Confirm a bounded delegation and prove positive resolution.
  insert into comind_pm.pm_authority_relationships(
    project_id,authority_id,related_authority_id,relationship_type,capabilities,domains,environments,
    operation_classes,resource_classes,rationale,evidence_refs,created_by
  ) values (
    p,root_id,delegated_id,'delegates_to',array['activate'],array['governance'],array['test','production'],
    array['rule_activation'],array['rule'],'Synthetic bounded delegation.',jsonb_build_array('ci:auth-001'),'AUTH-001 CI'
  ) returning id into rel_id;

  insert into comind_pm.pm_authority_relationship_events(relationship_id,event_type,actor,rationale,evidence_refs)
  values(rel_id,'confirmed','AUTH-001 CI','Confirm synthetic delegation.',jsonb_build_array('ci:auth-001'));

  result:=comind_pm.resolve_authority_request(p,delegated_id,'activate','rule_activation','rule','test','governance');
  if result->>'determination'<>'sufficient' then
    raise exception 'Expected sufficient delegated authority, got %',result;
  end if;

  -- Production/C4 remains explicitly human-only.
  result:=comind_pm.resolve_authority_request(p,delegated_id,'activate','rule_activation','rule','production','governance');
  if result->>'determination'<>'insufficient' or result->>'reason'<>'authority_requirements_not_satisfied' then
    raise exception 'Expected delegated production refusal, got %',result;
  end if;

  result:=comind_pm.resolve_authority_request(p,root_id,'activate','rule_activation','rule','production','governance');
  if result->>'determination'<>'sufficient' then
    raise exception 'Expected synthetic human C4 production authority sufficient, got %',result;
  end if;

  result:=comind_pm.resolve_authority_request(p,advisory_id,'activate','rule_activation','rule','test','governance');
  if result->>'determination'<>'inapplicable' or result->>'reason'<>'authority_class_cannot_grant_permission' then
    raise exception 'Canonical source improperly escalated advisory authority: %',result;
  end if;

  result:=comind_pm.resolve_authority_request(p,expired_id,'activate','rule_activation','rule','test','governance');
  if result->>'determination'<>'inapplicable' or result->>'reason'<>'authority_not_active' then
    raise exception 'Expired authority did not fail closed: %',result;
  end if;

  result:=comind_pm.resolve_authority_request(
    p,selector_id,'activate','rule_activation','rule','test','governance',jsonb_build_object('ticket_required',true)
  );
  if result->>'determination'<>'unresolved' or result->>'reason'<>'scope_selector_requires_policy_evaluator' then
    raise exception 'Selector was silently evaluated instead of remaining unresolved: %',result;
  end if;

  -- A stronger human-only constraint rejects the non-human delegate.
  insert into comind_pm.pm_authority_relationships(
    project_id,authority_id,related_authority_id,relationship_type,capabilities,domains,environments,
    operation_classes,resource_classes,constraint_effect,rationale,evidence_refs,created_by
  ) values (
    p,root_id,delegated_id,'constrains',array['activate'],array['governance'],array['test'],
    array['rule_activation'],array['rule'],'require_human','Synthetic human-only constraint.',
    jsonb_build_array('ci:auth-001'),'AUTH-001 CI'
  ) returning id into constraint_rel;

  insert into comind_pm.pm_authority_relationship_events(relationship_id,event_type,actor,rationale,evidence_refs)
  values(constraint_rel,'confirmed','AUTH-001 CI','Confirm synthetic human-only constraint.',jsonb_build_array('ci:auth-001'));

  result:=comind_pm.resolve_authority_request(p,delegated_id,'activate','rule_activation','rule','test','governance');
  if result->>'determination'<>'insufficient' or result->>'reason'<>'constraint_requires_human' then
    raise exception 'Human-only constraint was not enforced: %',result;
  end if;

  -- Open authority conflict wins over recency and remains unresolved.
  insert into comind_pm.pm_authority_relationships(
    project_id,authority_id,related_authority_id,relationship_type,capabilities,domains,environments,
    operation_classes,resource_classes,reconciliation_case_id,rationale,evidence_refs,created_by
  ) values (
    p,delegated_id,conflict_id,'conflicts_with',array['activate'],array['governance'],array['test'],
    array['rule_activation'],array['rule'],case_id,'Synthetic unresolved authority conflict.',
    jsonb_build_array('ci:auth-001'),'AUTH-001 CI'
  ) returning id into conflict_rel;

  insert into comind_pm.pm_authority_relationship_events(relationship_id,event_type,actor,rationale,evidence_refs)
  values(conflict_rel,'confirmed','AUTH-001 CI','Confirm synthetic unresolved conflict.',jsonb_build_array('ci:auth-001'));

  result:=comind_pm.resolve_authority_request(p,delegated_id,'activate','rule_activation','rule','test','governance');
  if result->>'determination'<>'unresolved' or result->>'reason'<>'open_authority_conflict' then
    raise exception 'Open authority conflict did not remain unresolved: %',result;
  end if;

  -- A reverse delegation would create a cycle and must be rejected on confirmation.
  insert into comind_pm.pm_authority_relationships(
    project_id,authority_id,related_authority_id,relationship_type,capabilities,domains,environments,
    operation_classes,resource_classes,rationale,evidence_refs,created_by
  ) values (
    p,delegated_id,root_id,'delegates_to',array['activate'],array['governance'],array['test'],
    array['rule_activation'],array['rule'],'Synthetic reverse delegation for cycle proof.',
    jsonb_build_array('ci:auth-001'),'AUTH-001 CI'
  ) returning id into reverse_rel;

  begin
    insert into comind_pm.pm_authority_relationship_events(relationship_id,event_type,actor,rationale,evidence_refs)
    values(reverse_rel,'confirmed','AUTH-001 CI','Attempt synthetic delegation cycle.',jsonb_build_array('ci:auth-001'));
    raise exception 'Expected delegation cycle rejection';
  exception when others then
    if position('cycle' in sqlerrm)=0 then raise; end if;
  end;

  -- Revocation must deterministically become current and cannot be resurrected.
  insert into comind_pm.pm_authority_relationship_events(relationship_id,event_type,actor,rationale,evidence_refs)
  values(rel_id,'revoked','AUTH-001 CI','Revoke synthetic delegation.',jsonb_build_array('ci:auth-001'));

  begin
    insert into comind_pm.pm_authority_relationship_events(relationship_id,event_type,actor,rationale,evidence_refs)
    values(rel_id,'confirmed','AUTH-001 CI','Illegal resurrection attempt.',jsonb_build_array('ci:auth-001'));
    raise exception 'Expected terminal relationship rejection';
  exception when others then
    if position('terminal' in sqlerrm)=0 then raise; end if;
  end;

  if (select relationship_status from comind_pm.v_authority_relationship_current where id=rel_id)<>'revoked' then
    raise exception 'Revocation is not the deterministic current relationship state';
  end if;

  result:=comind_pm.resolve_authority_request(p,delegated_id,'activate','rule_activation','rule','production','governance');
  if result->>'determination'<>'insufficient' or result->>'reason'<>'delegated_authority_has_no_valid_delegation_lineage' then
    raise exception 'Revoked delegation remained effective: %',result;
  end if;
end;
$$;

select 'AUTH-001 structural, seed, and behavioral verification passed' as result;
rollback;
