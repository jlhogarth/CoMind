#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated Foundry terminal lifecycle verification." >&2
  exit 2
fi
DATABASE_URL="${DATABASE_URL}" python3 <<'PY2'
import os
import sys
from urllib.parse import urlparse
parsed = urlparse(os.environ['DATABASE_URL'])
if parsed.scheme not in {'postgres', 'postgresql'} or parsed.hostname not in {'localhost', '127.0.0.1', '::1', 'db'} or parsed.path != '/comind_ci':
    print('Refusing Foundry terminal lifecycle verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY2
if [[ "$(psql "${DATABASE_URL}" -X -Atc 'SELECT current_database();')" != "comind_ci" ]]; then
  echo "Refusing Foundry terminal lifecycle verification outside comind_ci." >&2
  exit 2
fi
bash "${repository_root}/scripts/test_foundry_agent_substrate.sh"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261008_008_foundry_runtime_orchestration.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261009_009_foundry_work_lease_kernel.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261021_011_foundry_work_lease_rpc_acl_hardening.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/20261021_012_foundry_work_lease_rpc_search_path_hardening.sql"
(
  cd "${repository_root}/server"
  npm ci
  npm run build
  npm test
  node --test --test-concurrency=1 test/integration/foundry-terminal-lifecycle.integration.test.mjs
)
printf 'Foundry terminal lifecycle verification passed.\n'
