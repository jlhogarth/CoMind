#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261016_001_durable_runbook_foundation.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261101_001_l4a_mp_007_lane_conversation_registry.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261101_002_l4a_mp_007_binding_event_clock.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261101_003_l4a_mp_008_conversation_title_history.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261101_004_l4a_mp_009_founder_lane_census.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261101_006_l4a_mp_010_return_aware_census.sql"

baseline_output="$(psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At -f "${repository_root}/db/verification/20261101_l4a_mp_009_founder_lane_census_verification.sql")"
printf '%s\n' "${baseline_output}"
if [[ "${baseline_output}" != *'"status" : "pass"'* && "${baseline_output}" != *'"status": "pass"'* && "${baseline_output}" != *'"status":"pass"'* ]]; then
  printf 'L4A-MP-009 baseline census proof regressed under MP-010.\n' >&2
  exit 1
fi

verification_output="$(psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At -f "${repository_root}/db/verification/20261101_l4a_mp_010_return_aware_census_verification.sql")"
printf '%s\n' "${verification_output}"
if [[ "${verification_output}" != *'"status" : "pass"'* && "${verification_output}" != *'"status": "pass"'* && "${verification_output}" != *'"status":"pass"'* ]]; then
  printf 'L4A-MP-010 return-aware census verification did not report pass.\n' >&2
  exit 1
fi

printf 'L4A-MP-010 return-aware census verification passed.\n'
