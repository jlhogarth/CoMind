#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated ChatGPT archive verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse
p = urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres', 'postgresql') or p.hostname not in ('localhost', '127.0.0.1', '::1', 'db') or p.path != '/comind_ci':
    print('Refusing ChatGPT archive verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

db_name="$(psql "${DATABASE_URL}" -X -Atc 'SELECT current_database()')"
[[ "${db_name}" == "comind_ci" ]] || { echo 'Refusing non-isolated database' >&2; exit 2; }

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_001_chatgpt_archive_ingestion.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_002_chatgpt_archive_quarantine.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_001_chatgpt_archive_ingestion.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_002_chatgpt_archive_quarantine.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/verify_20261012_001_chatgpt_archive_ingestion.sql"

(
  cd "${root}/server"
  npm ci
  npm run build
  CHATGPT_ARCHIVE_DB_TEST=1 node --test --test-concurrency=1 \
    test/chatgpt-archive-ingestion.test.mjs \
    test/chatgpt-archive-ingestion.integration.test.mjs
)
