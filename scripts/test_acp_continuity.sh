#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated ACP verification}"
DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os
from urllib.parse import urlparse
p = urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres', 'postgresql') or p.hostname not in ('localhost', '127.0.0.1', '::1') or p.path != '/comind_ci':
    raise SystemExit('Refusing ACP migration test outside local isolated comind_ci')
PY
db_name="$(psql "${DATABASE_URL}" -X -Atc 'SELECT current_database()')"
[[ "${db_name}" == "comind_ci" ]] || { echo 'Refusing non-isolated database' >&2; exit 2; }
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261009_acp_continuity_checkpoints.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261009_acp_continuity_checkpoints.sql"
(cd "${root}/server" && npm run build && ACP_ISOLATED_DB_TEST=1 node --test test/continuity-checkpoint.test.mjs test/continuity-confidence.test.mjs test/continuity-repository.integration.test.mjs)
