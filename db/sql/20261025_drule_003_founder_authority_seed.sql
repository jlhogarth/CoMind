begin;

with project_target as (
  select id
  from comind_pm.pm_projects
  where project_key = 'COMIND'
), authority_values as (
  select
    p.id as project_id,
    'AUTH-FOUNDER-001'::text as authority_key,
    'founder'::text as authority_class,
    'human'::text as subject_type,
    'Joseph Hogarth, Founder'::text as subject_ref,
    jsonb_build_object(
      'domain','CoMind governance',
      'boundary','Existing production, C4, security, and stronger authorization controls remain separately governed.'
    ) as scope,
    array['approve','activate','supersede','override','revoke','recommend']::text[] as capabilities,
    jsonb_build_array(
      'chat:2026-10-25:seven-step-rulebook-authorization',
      'github:issue/202'
    ) as evidence_refs,
    jsonb_build_object(
      'purpose','Minimal founder authority substrate for DRULE-003 activation gating.',
      'not_full_authority_graph',true
    ) as metadata
  from project_target p
)
insert into comind_pm.pm_rule_authorities(
  project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,status,metadata
)
select
  project_id,authority_key,authority_class,subject_type,subject_ref,scope,capabilities,evidence_refs,'active',metadata
from authority_values
on conflict (project_id,authority_key) do update
set authority_class=excluded.authority_class,
    subject_type=excluded.subject_type,
    subject_ref=excluded.subject_ref,
    scope=excluded.scope,
    capabilities=excluded.capabilities,
    evidence_refs=excluded.evidence_refs,
    status='active',
    metadata=excluded.metadata,
    updated_at=now();

commit;
