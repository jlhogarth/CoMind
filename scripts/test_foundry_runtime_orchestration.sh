#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated Foundry runtime orchestration verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('Foundry runtime orchestration verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing Foundry runtime orchestration verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

database_name="$(psql "${DATABASE_URL}" -X -Atc "SELECT current_database();")"
if [[ "${database_name}" != "comind_ci" ]]; then
  echo "Refusing Foundry runtime orchestration verification outside comind_ci." >&2
  exit 2
fi

bash "${repository_root}/scripts/test_foundry_agent_substrate.sh"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_008_foundry_runtime_orchestration.sql"

# Reapply Issue #73 migration to prove idempotency.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_008_foundry_runtime_orchestration.sql"

runtime_schema_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261008_008_foundry_runtime_orchestration.sql")"
runtime_schema_status="${runtime_schema_output%%|*}"
if [[ "${runtime_schema_status}" != "pass" ]]; then
  echo "Foundry runtime orchestration schema verification failed: ${runtime_schema_output}" >&2
  exit 1
fi

(
  cd "${repository_root}/server"
  npm ci
  npm run build
  npm test
  node --test --test-concurrency=1 test/integration/foundry-runtime-orchestration.test.mjs
)

printf 'Foundry runtime orchestration verification passed: %s\n' "${runtime_schema_output}"
