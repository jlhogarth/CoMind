#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf 'Bootstrapping isolated PostgreSQL for AUTH-001...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_012_durable_rulebook_registry.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_013_drule_002_rule_archaeology_reconciliation.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_014_drule_003_governed_rule_activation.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_015_auth_001_authority_graph.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_016_auth_001_event_ordering_hardening.sql"

printf 'Creating minimum governed AUTH-001 fixture...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
insert into comind_pm.pm_projects(
  project_key,name,summary,status,priority,owner,source_system,source_ref
)
values (
  'COMIND','CoMind AUTH-001 CI','Synthetic isolated AUTH-001 project','active',5,
  'verification','manual','ci:auth-001'
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
  jsonb_build_object('scope','AUTH-001 isolated verification'),
  jsonb_build_array('github:issue/205')
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
  decision_ref,source_refs,evidence_refs
)
select
  r.id,1,
  'Production or C4 actions require explicit human authorization.',
  jsonb_build_object('environment','production','required_authority_level','C4','human_required',true),
  'Preserve explicit human authority over production and C4 actions.',
  'Founder','founder_approved_rule','approved','ci:auth-001',
  jsonb_build_array('chat:2026-10-25:seven-step-rulebook-authorization'),
  jsonb_build_array('github:issue/205')
from r
on conflict (rule_id,version) do nothing;
SQL

printf 'Seeding DRULE-003 founder authority...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261025_drule_003_founder_authority_seed.sql"

printf 'Seeding AUTH-001 graph twice to prove idempotency...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261026_auth_001_initial_authority_graph_seed.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261026_auth_001_initial_authority_graph_seed.sql"

printf 'Running AUTH-001 structural and behavioral verification...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261026_auth_001_authority_graph_verification.sql"

printf 'AUTH-001 authority graph verification passed.\n'
