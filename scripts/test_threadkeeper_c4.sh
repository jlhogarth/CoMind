#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated ThreadKeeper C4 verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing ThreadKeeper C4 isolated verification outside local comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

bash "${root}/scripts/test_threadkeeper_c3.sh"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261027_007_threadkeeper_c4_operational_events.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/verify_20261027_007_threadkeeper_c4_operational_events.sql"

(
  cd "${root}/server"
  THREADKEEPER_C4_DB_TEST=1 \
  PGOPTIONS='-c role=comind_threadkeeper_runtime' \
  node --test test/threadkeeper-c4-runtime-role.test.mjs

  THREADKEEPER_C4_DB_TEST=1 \
  THREADKEEPER_C4_RUN_ID=isolated \
  THREADKEEPER_C4_BASE_TIME=2026-10-27T21:00:00Z \
  THREADKEEPER_C4_ENVIRONMENT=isolated \
  PGOPTIONS='-c role=comind_threadkeeper_runtime' \
  node --test test/threadkeeper-c4-operational.integration.test.mjs
)

echo 'TK-007 isolated operational, least-privilege, authority, failure, recovery, and observability proof: PASS'
