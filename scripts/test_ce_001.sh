#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required}"

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('CE-001 verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing CE-001 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

database_name="$(psql "${DATABASE_URL}" -X -Atc "SELECT current_database();")"
if [[ "${database_name}" != "comind_ci" ]]; then
  echo "Refusing CE-001 verification outside comind_ci." >&2
  exit 2
fi

server_major="$(psql "${DATABASE_URL}" -X -Atc "SHOW server_version_num;" | cut -c1-2)"
if [[ "${server_major}" != "17" ]]; then
  echo "CE-001 requires PostgreSQL 17; found major version ${server_major}." >&2
  exit 1
fi

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/test/ce_001_prerequisites.sql"

for pass in 1 2; do
  printf 'CE-001 foundation migration pass %s\n' "${pass}"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261029_007_ce_001_continuous_excellence_foundation.sql"
done

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261029_007_ce_001_continuous_excellence_foundation.sql"

for pass in 1 2; do
  printf 'CE-001 event-ordering migration pass %s\n' "${pass}"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261029_008_ce_001_improvement_event_ordering.sql"
done

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261029_008_ce_001_improvement_event_ordering.sql"

for pass in 1 2; do
  printf 'CE-001 operator ACL migration pass %s\n' "${pass}"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261029_009_ce_001_operator_view_least_privilege.sql"
done

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261029_009_ce_001_operator_view_least_privilege.sql"

printf 'CE-001 isolated PostgreSQL 17 verification passed.\n'
