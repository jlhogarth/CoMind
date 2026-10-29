#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required}"

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_cga_001_conversation_scope.sql"
for pass in 1 2; do
  printf 'CGA-001 conversation scope reconciliation pass %s\n' "${pass}"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/sql/20261029_cga_001_conversation_scope_reconciliation.sql"
done
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/verification/20261029_cga_001_conversation_scope_verification.sql"
