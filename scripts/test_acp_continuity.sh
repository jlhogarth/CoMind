#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated ACP verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse
p = urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres', 'postgresql') or p.hostname not in ('localhost', '127.0.0.1', '::1', 'db') or p.path != '/comind_ci':
    print('Refusing ACP verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

db_name="$(psql "${DATABASE_URL}" -X -Atc 'SELECT current_database()')"
[[ "${db_name}" == "comind_ci" ]] || { echo 'Refusing non-isolated database' >&2; exit 2; }

bash "${root}/scripts/test_foundry_agent_substrate.sh"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261008_008_foundry_runtime_orchestration.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261009_009_foundry_work_lease_kernel.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261009_009_foundry_work_lease_kernel.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/verify_20261009_009_foundry_work_lease_kernel.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/test/conversation_lifecycle_fixtures.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261010_010_acp_continuity_checkpoints.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261010_010_acp_continuity_checkpoints.sql"

mkdir -p "${root}/artifacts"
(
  cd "${root}/server"
  npm ci
  npm run build
  ACP_ISOLATED_DB_TEST=1 node --test --test-concurrency=1 \
    test/continuity-checkpoint.test.mjs \
    test/continuity-confidence.test.mjs \
    test/continuity-recovery.test.mjs \
    test/continuity-scheduler.test.mjs \
    test/continuity-repository.integration.test.mjs \
    test/continuity-runtime.integration.test.mjs \
    test/continuity-foundry-reconciliation.integration.test.mjs \
    test/continuity-benchmark.integration.test.mjs
)
