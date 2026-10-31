#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must point to an isolated PostgreSQL 17 Test database}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_name="$(psql -X "${DATABASE_URL}" -Atc 'select current_database()')"
server_version="$(psql -X "${DATABASE_URL}" -Atc "select current_setting('server_version_num')::integer")"

if [[ "${database_name}" != "comind_ci" && "${database_name}" != "sdn_test_ci" ]]; then
  printf 'Refusing SDN Test acceptance on unexpected database name: %s\n' "${database_name}" >&2
  exit 1
fi

if (( server_version < 170000 )); then
  printf 'SDN Test acceptance requires PostgreSQL 17+, found server_version_num=%s\n' "${server_version}" >&2
  exit 1
fi

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c 'create extension if not exists pgcrypto with schema extensions'

migration="${repository_root}/db/migrations/20261019_001_sdn_test_synthetic_ingestion.sql"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration}"
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${migration}"

verification_output="$(psql -X "${DATABASE_URL}" -At -F '|' -f "${repository_root}/db/migrations/verify_20261019_001_sdn_test_synthetic_ingestion.sql")"
printf '%s\n' "${verification_output}"

if ! grep -q '^pass|' <<<"${verification_output}"; then
  printf 'SDN Test synthetic ingestion verification failed.\n' >&2
  exit 1
fi

printf 'SDN Test synthetic ingestion verification passed on %s (PostgreSQL %s).\n' \
  "${database_name}" "${server_version}"
