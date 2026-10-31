#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf 'Bootstrapping isolated PostgreSQL for REE-001...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_012_durable_rulebook_registry.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_013_drule_002_rule_archaeology_reconciliation.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_014_drule_003_governed_rule_activation.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_015_auth_001_authority_graph.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_016_auth_001_event_ordering_hardening.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261026_001_ree_001_rule_evaluation_engine.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261026_002_ree_001_authority_time_hardening.sql"

printf 'Creating minimum governed REE-001 fixture...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
insert into comind_pm.pm_projects(
  project_key,name,summary,status,priority,owner,source_system,source_ref
)
values (
  'COMIND','CoMind REE-001 CI','Synthetic isolated REE-001 project','active',5,
  'verification','manual','ci:ree-001'
)
on conflict (project_key) do nothing;

with p as (
  select id from comind_pm.pm_projects where project_key='COMIND'
)
insert into comind_pm.pm_events(
  project_id,event_type,actor,actor_type,source_system,source_ref,summary,details,evidence
)
select
  p.id,'decision','Joseph Hogarth, Founder','human','chatgpt',
  'chat:2026-10-25:seven-step-rulebook-authorization',
  'Founder authorized completion of the seven-step Rulebook evolution sequence with existing production/C4 boundaries preserved.',
  jsonb_build_object('scope','REE-001 isolated verification'),
  jsonb_build_array('github:issue/211')
from p
where not exists (
  select 1 from comind_pm.pm_events e
  where e.project_id=p.id
    and e.source_ref='chat:2026-10-25:seven-step-rulebook-authorization'
);

with p as (
  select id from comind_pm.pm_projects where project_key='COMIND'
)
insert into comind_pm.pm_rules(
  project_id,rule_key,title,domain,rule_type,modality,status,scope,enforcement_mode,machine_checkable,current_version,owner
)
select
  p.id,'RULE-AUTH-001','Production C4 Human Authorization','governance','authority','MUST','active',
  jsonb_build_object('environment','production','authority_level','C4','human_required',true),
  'hard_constraint',true,1,'Founder'
from p
on conflict (project_id,rule_key) do nothing;

with r as (
  select id from comind_pm.pm_rules where rule_key='RULE-AUTH-001'
)
insert into comind_pm.pm_rule_versions(
  rule_id,version,rule_text,formal_rule,rationale,authority,authority_type,approval_status,
  decision_ref,source_refs,evidence_refs,validation
)
select
  r.id,1,
  'Production or C4 actions require explicit human authorization.',
  '{}'::jsonb,
  'Preserve explicit human authority over production and C4 actions.',
  'Founder','founder_approved_rule','approved','ci:ree-001',
  jsonb_build_array('chat:2026-10-25:seven-step-rulebook-authorization'),
  jsonb_build_array('github:issue/211'),
  '{}'::jsonb
from r
on conflict (rule_id,version) do nothing;

with p as (
  select id from comind_pm.pm_projects where project_key='COMIND'
)
insert into comind_pm.pm_rules(
  project_id,rule_key,title,domain,rule_type,modality,status,scope,enforcement_mode,machine_checkable,current_version,owner
)
select p.id,v.rule_key,v.title,'ARIS','lifecycle','MUST','active','{}'::jsonb,'automated_gate',true,1,'ARIS'
from p
cross join (values
  ('RULE-ARIS-LC-001'::text,'ARIS Specified Lifecycle Gate'::text),
  ('RULE-ARIS-LC-002'::text,'ARIS Prototyped Lifecycle Gate'::text)
) as v(rule_key,title)
on conflict (project_id,rule_key) do nothing;

with r as (
  select id,rule_key from comind_pm.pm_rules
  where rule_key in ('RULE-ARIS-LC-001','RULE-ARIS-LC-002')
)
insert into comind_pm.pm_rule_versions(
  rule_id,version,rule_text,formal_rule,rationale,authority,authority_type,approval_status,
  decision_ref,source_refs,evidence_refs,validation
)
select
  r.id,
  1,
  case r.rule_key
    when 'RULE-ARIS-LC-001' then 'An ARIS-managed module or capability may enter Specified status only when an approved specification is linked as evidence.'
    else 'An ARIS-managed module or capability may enter Prototyped status only when demonstrable prototype evidence is linked.'
  end,
  case r.rule_key
    when 'RULE-ARIS-LC-001' then '{"subject":"module.lifecycle","requires":[{"evidence_type":"approved_specification","minimum_count":1,"approval_status":"approved"}],"target_status":"Specified"}'::jsonb
    else '{"subject":"module.lifecycle","requires":[{"evidence_type":"prototype","minimum_count":1,"evidence_status":"verified"}],"target_status":"Prototyped"}'::jsonb
  end,
  case r.rule_key
    when 'RULE-ARIS-LC-001' then 'Lifecycle status must represent demonstrated maturity rather than assertion.'
    else 'Prototype status must be evidence-backed.'
  end,
  'Founder','founder_approved_rule','approved','ci:ree-001',
  jsonb_build_array('ci:ree-001:canonical-rule-fixture'),
  jsonb_build_array('github:issue/211'),
  '{"result":"allow_only_if_requirement_satisfied"}'::jsonb
from r
on conflict (rule_id,version) do nothing;
SQL

printf 'Seeding DRULE-003 founder authority...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261025_drule_003_founder_authority_seed.sql"

printf 'Seeding AUTH-001 graph twice to prove idempotency...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261026_auth_001_initial_authority_graph_seed.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261026_auth_001_initial_authority_graph_seed.sql"

printf 'Running REE-001 structural and adversarial verification...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261026_ree_001_rule_evaluation_engine_verification.sql"

printf 'Running REE-001 direct domain-applicability verification...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261026_ree_001_domain_applicability_verification.sql"

printf 'Running REE-001 server-controlled authority-time verification...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261026_ree_001_authority_time_verification.sql"

printf 'REE-001 rule evaluation engine verification passed.\n'
