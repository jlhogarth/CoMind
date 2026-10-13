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

# Model the Supabase Data API database roles so access revocations are proved in
# ordinary isolated PostgreSQL rather than assumed from the managed service.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;
SQL

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_001_chatgpt_archive_ingestion.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_002_chatgpt_archive_quarantine.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_003_chatgpt_archive_access_hardening.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_001_chatgpt_archive_ingestion.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_002_chatgpt_archive_quarantine.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/20261012_003_chatgpt_archive_access_hardening.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/verify_20261012_001_chatgpt_archive_ingestion.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/verify_20261012_003_chatgpt_archive_access_hardening.sql"

# Exercise the actual Node importer with a disposable LOGIN role that receives
# only the constrained archive group role. This password is test-only and the
# role exists only inside the disposable comind_ci service container.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_archive_test_login') THEN
    CREATE ROLE comind_archive_test_login
      LOGIN
      PASSWORD 'comind_archive_ci_only'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_archive_test_login
      LOGIN
      PASSWORD 'comind_archive_ci_only'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END;
$$;
GRANT comind_archive_ingestor TO comind_archive_test_login;
GRANT CONNECT ON DATABASE comind_ci TO comind_archive_test_login;
SQL

archive_database_url='postgresql://comind_archive_test_login:comind_archive_ci_only@localhost:5432/comind_ci'

(
  cd "${root}/server"
  npm ci
  npm run build
  DATABASE_URL="${archive_database_url}" CHATGPT_ARCHIVE_DB_TEST=1 node --test --test-concurrency=1 \
    test/chatgpt-archive-ingestion.test.mjs \
    test/chatgpt-archive-ingestion.integration.test.mjs
)
