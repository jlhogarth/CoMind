#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261101_001_l4a_mp_007_lane_conversation_registry.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261101_002_l4a_mp_007_binding_event_clock.sql"

verification_output="$(
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At -f "${repository_root}/db/verification/20261101_l4a_mp_007_lane_conversation_registry_verification.sql"
)"

printf '%s\n' "${verification_output}"
if [[ "${verification_output}" != *'"status" : "pass"'* && "${verification_output}" != *'"status": "pass"'* && "${verification_output}" != *'"status":"pass"'* ]]; then
  printf 'L4A-MP-007 lane conversation registry verification did not report pass.\n' >&2
  exit 1
fi

printf 'L4A-MP-007 lane conversation registry verification passed.\n'
