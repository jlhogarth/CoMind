#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated differential ingestion verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing differential ingestion verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_archive_diff_test_login') THEN
    CREATE ROLE comind_archive_diff_test_login
      LOGIN NOINHERIT PASSWORD 'comind_archive_diff_ci_only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_archive_diff_test_login
      LOGIN NOINHERIT PASSWORD 'comind_archive_diff_ci_only'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;
REVOKE comind_archive_ingestor FROM comind_archive_diff_test_login;
GRANT comind_archive_ingestor TO comind_archive_diff_test_login WITH INHERIT FALSE, SET TRUE;
GRANT CONNECT ON DATABASE comind_ci TO comind_archive_diff_test_login;
SQL

archive_url='postgresql://comind_archive_diff_test_login:comind_archive_diff_ci_only@localhost:5432/comind_ci'
admin_url="${DATABASE_URL}"

cd "${root}/server"

env -u DATABASE_URL \
  COMIND_DATABASE_PURPOSE=chatgpt_archive \
  CHATGPT_ARCHIVE_DATABASE_URL="${archive_url}" \
  CHATGPT_ARCHIVE_DIFFERENTIAL_DB_TEST=1 \
  TEST_ADMIN_DATABASE_URL="${admin_url}" \
  node --test --test-concurrency=1 \
    test/chatgpt-differential-ingestion.integration.test.mjs \
    test/chatgpt-differential-recovery.integration.test.mjs

echo 'CHIST differential ingestion and recovery acceptance: PASS'
