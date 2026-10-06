#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"

verification_output="$(
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At -F '|' -f "${repository_root}/db/migrations/verify_20261006_comind_pm_ledger.sql"
)"

printf '%s\n' "${verification_output}"

verification_status="${verification_output%%|*}"
if [[ "${verification_status}" != "pass" ]]; then
  printf 'PM Ledger migration verification failed with status: %s\n' "${verification_status}" >&2
  exit 1
fi

printf 'PM Ledger migration verification passed.\n'
