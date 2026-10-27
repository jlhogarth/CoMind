\set ON_ERROR_STOP on

do $$
declare
  n integer;
  canonical_count integer;
  projection_count integer;
  x jsonb;
  p_config text;
begin
  if to_regclass('comind_development.entity') is null or to_regclass('comind_development.relationship') is null then
    raise exception 'EDG-002 graph foundation tables missing';
  end if;
  if to_regclass('comind_development.v_rulebook_graph') is null or to_regclass('comind_development.v_rule_graph_relationships') is null then
    raise exception 'EDG-002 rule graph views missing';
  end if;
  if to_regprocedure('comind_development.edg_sync_rulebook_projections(text,text)') is null then
    raise exception 'EDG-002 sync function missing';
  end if;

  select count(*) into n from information_schema.columns
  where table_schema='comind_development' and table_name='entity';
  if n<>15 then raise exception 'EDG entity contract drifted: expected 15 columns, got %',n; end if;
  select count(*) into n from information_schema.columns
  where table_schema='comind_development' and table_name='relationship';
  if n<>12 then raise exception 'EDG relationship contract drifted: expected 12 columns, got %',n; end if;

  if exists(
    select 1 from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='comind_development' and c.relname in ('entity','relationship') and not c.relrowsecurity
  ) then raise exception 'EDG-002 RLS is not enabled on all graph base tables'; end if;

  if exists(
    select 1 from information_schema.role_table_grants
    where table_schema='comind_development' and table_name in ('entity','relationship')
      and grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then raise exception 'EDG-002 base graph table grant leak detected'; end if;

  if not has_schema_privilege('service_role','comind_development','USAGE') then
    raise exception 'service_role lacks EDG schema usage';
  end if;
  if not has_table_privilege('service_role','comind_development.v_rulebook_graph','SELECT')
     or not has_table_privilege('service_role','comind_development.v_rule_graph_relationships','SELECT') then
    raise exception 'service_role lacks narrow EDG read views';
  end if;
  if has_table_privilege('anon','comind_development.v_rulebook_graph','SELECT')
     or has_table_privilege('authenticated','comind_development.v_rulebook_graph','SELECT') then
    raise exception 'public client role can read EDG Rulebook view';
  end if;
  if not has_function_privilege('service_role','comind_development.edg_sync_rulebook_projections(text,text)','EXECUTE')
     or has_function_privilege('anon','comind_development.edg_sync_rulebook_projections(text,text)','EXECUTE')
     or has_function_privilege('authenticated','comind_development.edg_sync_rulebook_projections(text,text)','EXECUTE') then
    raise exception 'EDG-002 sync function execute boundary is wrong';
  end if;

  select array_to_string(p.proconfig,',') into p_config
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='comind_development' and p.proname='edg_sync_rulebook_projections';
  if p_config is null or position('search_path=' in p_config)=0 then
    raise exception 'EDG-002 security-definer function search_path is not pinned';
  end if;
  if not exists(
    select 1 from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='comind_development' and p.proname='edg_sync_rulebook_projections' and p.prosecdef
  ) then raise exception 'EDG-002 sync function is not security definer'; end if;

  select count(*) into canonical_count
  from comind_pm.pm_rules r join comind_pm.pm_projects p on p.id=r.project_id
  where p.project_key='COMIND';
  select count(*) into projection_count
  from comind_development.entity
  where entity_type='rule' and source_of_truth='comind_pm.pm_rules' and project_key='COMIND' and status='projection_current';
  if canonical_count<>projection_count then
    raise exception 'EDG-002 projection completeness mismatch: canonical %, projected %',canonical_count,projection_count;
  end if;

  if exists(
    select 1
    from comind_pm.pm_rules r
    join comind_pm.pm_projects p on p.id=r.project_id and p.project_key='COMIND'
    left join comind_development.entity e
      on e.tracking_key=r.rule_key and e.entity_type='rule' and e.source_of_truth='comind_pm.pm_rules'
    where e.entity_id is null
       or e.current_version<>r.current_version
       or e.canonical_payload->>'canonical_rule_id'<>r.id::text
  ) then raise exception 'EDG-002 rule identity/version pointer mismatch'; end if;

  if exists(
    select 1
    from comind_development.entity e,
         lateral jsonb_object_keys(e.canonical_payload) k(key)
    where e.entity_type='rule' and e.source_of_truth='comind_pm.pm_rules'
      and k.key in ('rule_text','formal_rule','approval_status','authority','authority_type','canonical_rule_status','enforcement_mode','scope')
  ) then raise exception 'EDG-002 projection copied authoritative Rulebook content'; end if;

  if exists(
    select 1 from comind_development.v_rulebook_graph
    where projection_is_authoritative
       or canonical_rule_id is null
       or canonical_current_version is distinct from projection_current_version_pointer
  ) then raise exception 'EDG-002 joined view authority/version contract failed'; end if;

  select count(*) into n
  from comind_development.relationship rel
  join comind_development.entity s on s.entity_id=rel.subject_entity_id and s.tracking_key='RRR-001'
  join comind_development.entity o on o.entity_id=rel.object_entity_id and o.entity_type='rule'
  where rel.predicate='DESCRIBES' and rel.valid_to is null;
  if n<>35 then raise exception 'EDG-002 expected 35 current RRR-001 DESCRIBES Rule edges, got %',n; end if;

  if exists(
    select 1 from comind_development.v_rule_graph_relationships
    where subject_key='RRR-001' and predicate='DESCRIBES'
      and (evidence_key is distinct from 'RRR-001'
           or relationship_establishes_rule_authority
           or relationship_payload->>'assertion_type'<>'explicit_canonical_mapping_ledger'
           or jsonb_array_length(relationship_payload->'rrr_candidates')<1)
  ) then raise exception 'EDG-002 RRR relationship provenance/authority boundary failed'; end if;

  select count(*) into n
  from comind_development.relationship rel
  join comind_development.entity s on s.entity_id=rel.subject_entity_id and s.entity_type='concept'
  join comind_development.entity o on o.entity_id=rel.object_entity_id and o.entity_type='rule'
  where rel.valid_to is null;
  if n<>0 then raise exception 'EDG-002 inferred Concept-to-Rule edges detected: %',n; end if;

  x:=comind_development.edg_sync_rulebook_projections('ci:edg-002','EDG-002 CI');
  if (x->>'changed_projection_count')::integer<>0 or (x->>'orphaned_projection_updates')::integer<>0 then
    raise exception 'EDG-002 same-evidence replay was not idempotent: %',x;
  end if;
end;
$$;

set role service_role;
select count(*) as service_role_rule_projection_count from comind_development.v_rulebook_graph;
select count(*) as service_role_rule_relationship_count from comind_development.v_rule_graph_relationships;
select comind_development.edg_sync_rulebook_projections('ci:edg-002','EDG-002 CI') as service_role_sync_replay;
reset role;

begin;
insert into comind_development.entity(
  tracking_key,entity_type,title,status,project_key,lane_key,created_by,
  canonical_payload,current_version,source_of_truth,retention_class
) values (
  'RULE-EDG-CI-ORPHAN','rule','Synthetic orphan projection','projection_current','COMIND','RULEBOOK','EDG-002 CI',
  jsonb_build_object(
    'canonical_rule_id',gen_random_uuid(),
    'canonical_rule_key','RULE-EDG-CI-ORPHAN',
    'canonical_schema','comind_pm',
    'canonical_table','pm_rules',
    'canonical_version_table','pm_rule_versions',
    'projection_role','rule_index_pointer',
    'authority_boundary','Synthetic CI pointer',
    'last_sync_evidence_ref','ci:edg-002-orphan-fixture'
  ),1,'comind_pm.pm_rules','durable'
);

do $$
declare x jsonb; n integer;
begin
  x:=comind_development.edg_sync_rulebook_projections('ci:edg-002-orphan-check','EDG-002 CI');
  select count(*) into n from comind_development.entity
  where tracking_key='RULE-EDG-CI-ORPHAN' and status='projection_orphaned';
  if n<>1 then raise exception 'EDG-002 orphan projection was deleted or not retired in place: %',x; end if;
end;
$$;
rollback;

select 'EDG-002 Rulebook graph integration verification passed' as result;
