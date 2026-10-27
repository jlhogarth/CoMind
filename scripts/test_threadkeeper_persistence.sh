#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated ThreadKeeper verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse
p = urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres', 'postgresql') or p.hostname not in ('localhost', '127.0.0.1', '::1', 'db') or p.path != '/comind_ci':
    print('Refusing ThreadKeeper verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

db_name="$(psql "${DATABASE_URL}" -X -Atc 'SELECT current_database()')"
[[ "${db_name}" == "comind_ci" ]] || { echo 'Refusing non-isolated database' >&2; exit 2; }

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS comind;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  ELSE
    ALTER ROLE service_role BYPASSRLS;
  END IF;
END;
$$;
GRANT USAGE ON SCHEMA comind TO service_role;
SQL

migration_008="${root}/db/migrations/20261026_008_threadkeeper_persistence.sql"
verification_008="${root}/db/migrations/verify_20261026_008_threadkeeper_persistence.sql"
migration_009="${root}/db/migrations/20261026_009_threadkeeper_scope_integrity.sql"
verification_009="${root}/db/migrations/verify_20261026_009_threadkeeper_scope_integrity.sql"
migration_010="${root}/db/migrations/20261026_010_threadkeeper_fk_indexes.sql"
verification_010="${root}/db/migrations/verify_20261026_010_threadkeeper_fk_indexes.sql"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${migration_008}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${migration_008}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${verification_008}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${migration_009}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${migration_009}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${verification_009}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${migration_010}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${migration_010}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${verification_010}"

(
  cd "${root}/server"
  npm ci
  npm run build
  THREADKEEPER_ISOLATED_DB_TEST=1 node --test --test-concurrency=1 \
    test/threadkeeper-core.test.mjs \
    test/threadkeeper-repository.integration.test.mjs \
    test/threadkeeper-competitive-proofs.integration.test.mjs
)
