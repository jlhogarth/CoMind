#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required}"

bash "${repository_root}/scripts/test_drule_conversation_governance_binding.sh"

for pass in 1 2; do
  printf 'DRULE-004 operator RPC migration pass %s\n' "${pass}"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261029_006_drule_004_rulebook_operator_console.sql"
done

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/20261029_drule_004_rulebook_operator_console_verification.sql"
