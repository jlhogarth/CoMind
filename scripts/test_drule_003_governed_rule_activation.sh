#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_012_durable_rulebook_registry.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_013_drule_002_rule_archaeology_reconciliation.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261025_014_drule_003_governed_rule_activation.sql"

printf 'Running DRULE-003 structural and behavioral verification...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261025_drule_003_governed_rule_activation_verification.sql"

printf 'Verifying bounded founder authority seed is idempotent...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
insert into comind_pm.pm_projects(project_key,name,summary,status,priority,owner,source_system,source_ref)
values ('COMIND','CoMind CI','Synthetic isolated CI project','active',5,'verification','manual','ci:drule-003')
on conflict (project_key) do nothing;
SQL

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261025_drule_003_founder_authority_seed.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261025_drule_003_founder_authority_seed.sql"

seed_count="$(psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -Atc "
select count(*)
from comind_pm.pm_rule_authorities a
join comind_pm.pm_projects p on p.id=a.project_id
where p.project_key='COMIND'
  and a.authority_key='AUTH-FOUNDER-001'
  and a.authority_class='founder'
  and a.status='active'
  and a.capabilities @> array['approve','activate','supersede','override','revoke','recommend']::text[]
  and a.evidence_refs @> '[\"chat:2026-10-25:seven-step-rulebook-authorization\",\"github:issue/202\"]'::jsonb;
")"

if [[ "${seed_count}" != "1" ]]; then
  printf 'DRULE-003 founder authority seed verification failed; expected 1 matching row, got %s\n' "${seed_count}" >&2
  exit 1
fi

printf 'DRULE-003 governed rule activation verification passed.\n'
