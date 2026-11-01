#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/dbsec_001_search_path_fixture.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261101_005_dbsec_001_function_search_path_hardening.sql"
verification_output="$(psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -At -f "${repository_root}/db/verification/20261101_dbsec_001_function_search_path_verification.sql")"

printf '%s\n' "${verification_output}"
if [[ "${verification_output}" != *'"status" : "pass"'* && "${verification_output}" != *'"status": "pass"'* && "${verification_output}" != *'"status":"pass"'* ]]; then
  printf 'DBSEC-001 function search_path verification did not report pass.\n' >&2
  exit 1
fi

printf 'DBSEC-001 function search_path verification passed.\n'
