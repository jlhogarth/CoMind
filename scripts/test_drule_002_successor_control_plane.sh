#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required}"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"

for pass in 1 2; do
  printf 'DRULE-002 successor control-plane migration pass %s\n' "${pass}"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261028_003_drule_002_successor_control_plane.sql"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261028_004_drule_002_successor_control_plane_hardening.sql"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261028_drule_002_successor_control_seed.sql"
done

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261028_drule_002_successor_control_plane_hardening_verification.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261028_drule_002_successor_control_plane_verification.sql"
