begin;

with project_target as (
  select id as project_id
  from comind_pm.pm_projects
  where project_key='COMIND'
), founder as (
  select a.id as authority_id,a.project_id
  from comind_pm.pm_rule_authorities a
  join project_target p on p.project_id=a.project_id
  where a.authority_key='AUTH-FOUNDER-001'
    and a.status='active'
)
insert into comind_pm.pm_authority_scope_bindings(
  project_id,authority_id,binding_key,version,domains,environments,operation_classes,resource_classes,
  capabilities,authority_level,selector,evidence_refs,status,metadata
)
select
  f.project_id,f.authority_id,'founder-governance-nonproduction',1,
  array['governance']::text[],
  array['development','test','staging']::text[],
  array['rule_activation','authority_graph_management','rulebook_governance']::text[],
  array['rule','authority_graph','governance_record']::text[],
  array['approve','activate','supersede','override','revoke','recommend']::text[],
  null,
  '{}'::jsonb,
  jsonb_build_array('chat:2026-10-25:seven-step-rulebook-authorization','github:issue/205'),
  'active',
  jsonb_build_object(
    'purpose','Founder governance scope for the authorized Rulebook evolution work.',
    'production_excluded',true,
    'c4_not_implied',true
  )
from founder f
where not exists (
  select 1 from comind_pm.pm_authority_scope_bindings s
  where s.authority_id=f.authority_id
    and s.binding_key='founder-governance-nonproduction'
    and s.version=1
);

with project_target as (
  select id as project_id
  from comind_pm.pm_projects
  where project_key='COMIND'
), founder as (
  select a.id as authority_id,a.project_id
  from comind_pm.pm_rule_authorities a
  join project_target p on p.project_id=a.project_id
  where a.authority_key='AUTH-FOUNDER-001'
), authorization_event as (
  select e.id as event_id,e.project_id
  from comind_pm.pm_events e
  join project_target p on p.project_id=e.project_id
  where e.source_ref='chat:2026-10-25:seven-step-rulebook-authorization'
  order by e.occurred_at desc,e.created_at desc
  limit 1
)
insert into comind_pm.pm_authority_basis_links(
  project_id,authority_id,basis_type,event_id,basis_role,authority_effect,rationale,evidence_refs,metadata
)
select
  f.project_id,f.authority_id,'event',e.event_id,'establishes','governing',
  'Founder authorization establishes the bounded seven-step Rulebook evolution authority while preserving production/C4 boundaries.',
  jsonb_build_array('chat:2026-10-25:seven-step-rulebook-authorization','github:issue/205'),
  jsonb_build_object('scope','Rulebook evolution','production_c4_preserved',true)
from founder f
join authorization_event e on e.project_id=f.project_id
where not exists (
  select 1 from comind_pm.pm_authority_basis_links b
  where b.authority_id=f.authority_id
    and b.event_id=e.event_id
    and b.basis_role='establishes'
);

with project_target as (
  select id as project_id
  from comind_pm.pm_projects
  where project_key='COMIND'
), production_rule as (
  select r.project_id,r.id as rule_id,r.current_version as rule_version
  from comind_pm.pm_rules r
  join project_target p on p.project_id=r.project_id
  where r.rule_key='RULE-AUTH-001'
), capabilities(capability) as (
  values ('approve'::text),('activate'),('supersede'),('override'),('revoke'),('recommend')
)
insert into comind_pm.pm_authority_requirements(
  project_id,requirement_key,version,operation_class,target_environment,domain,resource_class,
  required_capability,required_authority_level,human_required,governing_rule_id,governing_rule_version,
  selector,rationale,evidence_refs,status,metadata
)
select
  p.project_id,
  'PRODUCTION-C4-HUMAN-'||upper(c.capability),
  1,
  '*','production','*','*',
  c.capability,'C4',true,
  pr.rule_id,pr.rule_version,
  '{}'::jsonb,
  'Production governance action requires explicit human C4 authority; AUTH-001 does not weaken or infer this boundary.',
  jsonb_build_array('RULE-AUTH-001','github:issue/205'),
  'active',
  jsonb_build_object('production_boundary',true,'human_only',true,'automatic_escalation',false)
from project_target p
join production_rule pr on pr.project_id=p.project_id
cross join capabilities c
where not exists (
  select 1 from comind_pm.pm_authority_requirements req
  where req.project_id=p.project_id
    and req.requirement_key='PRODUCTION-C4-HUMAN-'||upper(c.capability)
    and req.version=1
);

commit;
