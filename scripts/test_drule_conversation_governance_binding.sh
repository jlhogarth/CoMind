#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required}"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261028_003_drule_002_successor_control_plane.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261028_004_drule_002_successor_control_plane_hardening.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261028_drule_002_successor_control_seed.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261029_drule_provider_egress_integration_seed.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_drule_conversation_governance.sql"

for pass in 1 2; do
  printf 'Conversation governance binding migration pass %s\n' "${pass}"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261029_001_drule_conversation_governance_binding.sql"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261029_002_drule_conversation_governance_binding_hardening.sql"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261029_003_drule_conversation_governance_binding_constraints.sql"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261029_004_drule_conversation_governance_function_hardening.sql"
done

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261029_drule_conversation_governance_binding_verification.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261029_drule_conversation_governance_function_hardening_verification.sql"
