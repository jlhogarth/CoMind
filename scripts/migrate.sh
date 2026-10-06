#!/usr/bin/env bash
# Run all schema migrations against DATABASE_URL.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/sql/v2/MASTER.sql"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20260910_001_comind_finops_resource_governor.sql"
psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20260913_001_comind_no_placeholder_policy.sql"
