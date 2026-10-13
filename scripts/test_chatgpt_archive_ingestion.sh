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
# only SET-only membership in the constrained archive group role. The password
# is test-only and the role exists only inside the disposable comind_ci service.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'comind_archive_test_login') THEN
    CREATE ROLE comind_archive_test_login
      LOGIN
      NOINHERIT
      PASSWORD 'comind_archive_ci_only'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE comind_archive_test_login
      LOGIN
      NOINHERIT
      PASSWORD 'comind_archive_ci_only'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END;
$$;
REVOKE comind_archive_ingestor FROM comind_archive_test_login;
GRANT comind_archive_ingestor TO comind_archive_test_login WITH INHERIT FALSE, SET TRUE;
GRANT CONNECT ON DATABASE comind_ci TO comind_archive_test_login;
SQL

archive_database_url='postgresql://comind_archive_test_login:comind_archive_ci_only@localhost:5432/comind_ci'

# The NOINHERIT login must remain blind to the private comind schema before the
# application explicitly assumes comind_archive_ingestor.
login_schema_usage="$(psql "${archive_database_url}" -X -Atc "SELECT has_schema_privilege(current_user, 'comind', 'USAGE')")"
[[ "${login_schema_usage}" == "f" ]] || {
  echo 'Archive test login unexpectedly inherited comind schema USAGE before SET ROLE' >&2
  exit 2
}

archive_row_count() {
  psql "${DATABASE_URL}" -X -Atc "
    SELECT
      (SELECT count(*) FROM comind.cm_archive_source)
      + (SELECT count(*) FROM comind.cm_archive_source_file)
      + (SELECT count(*) FROM comind.cm_archive_import)
      + (SELECT count(*) FROM comind.cm_archive_conversation_observation)
      + (SELECT count(*) FROM comind.cm_archive_node_observation)
      + (SELECT count(*) FROM comind.cm_archive_attachment_reference)
      + (SELECT count(*) FROM comind.cm_archive_parser_event)
      + (SELECT count(*) FROM comind.cm_archive_diff_receipt)
      + (SELECT count(*) FROM comind.cm_archive_quarantine);"
}

(
  cd "${root}/server"
  npm ci
  npm run build

  # The historical lossy importer is a tombstone. Prove it cannot write even
  # when handed an apparent source path.
  before_legacy_rows="$(archive_row_count)"
  set +e
  legacy_output="$(node dist/scripts/import_chatgpt_export.js /tmp/should-not-be-read.json 2>&1)"
  legacy_status=$?
  set -e
  after_legacy_rows="$(archive_row_count)"
  [[ ${legacy_status} -eq 2 ]] || {
    echo 'Retired legacy ChatGPT importer did not fail closed' >&2
    exit 2
  }
  [[ "${before_legacy_rows}" == "${after_legacy_rows}" ]] || {
    echo 'Retired legacy ChatGPT importer unexpectedly mutated archive evidence' >&2
    exit 2
  }
  grep -Fq 'Legacy ChatGPT projection importer is retired' <<<"${legacy_output}" || {
    echo 'Retired legacy ChatGPT importer missing expected tombstone message' >&2
    exit 2
  }

  # The governed CLI must fail closed when the archive-specific credential is
  # absent, even if a syntactically valid DATABASE_URL is present.
  set +e
  fallback_output="$(
    DATABASE_URL="${archive_database_url}" \
      env -u CHATGPT_ARCHIVE_DATABASE_URL \
      node dist/archive/chatgpt-export-cli.js --preflight 2>&1
  )"
  fallback_status=$?
  set -e
  [[ ${fallback_status} -ne 0 ]] || {
    echo 'Archive CLI unexpectedly accepted DATABASE_URL fallback' >&2
    exit 2
  }
  grep -Fq 'CHATGPT_ARCHIVE_DATABASE_URL is required' <<<"${fallback_output}" || {
    echo 'Archive CLI missing expected fail-closed credential error' >&2
    exit 2
  }

  before_preflight_rows="$(archive_row_count)"
  preflight_output="$(
    env -u DATABASE_URL \
      CHATGPT_ARCHIVE_DATABASE_URL="${archive_database_url}" \
      node dist/archive/chatgpt-export-cli.js --preflight
  )"
  after_preflight_rows="$(archive_row_count)"

  [[ "${before_preflight_rows}" == "${after_preflight_rows}" ]] || {
    echo 'Archive connection preflight unexpectedly mutated archive evidence' >&2
    exit 2
  }
  grep -Fq '"sessionUser": "comind_archive_test_login"' <<<"${preflight_output}" || {
    echo 'Archive preflight did not preserve the dedicated login as session_user' >&2
    exit 2
  }
  grep -Fq '"currentUser": "comind_archive_ingestor"' <<<"${preflight_output}" || {
    echo 'Archive preflight did not assume comind_archive_ingestor' >&2
    exit 2
  }

  env -u DATABASE_URL \
    COMIND_DATABASE_PURPOSE=chatgpt_archive \
    CHATGPT_ARCHIVE_DATABASE_URL="${archive_database_url}" \
    CHATGPT_ARCHIVE_DB_TEST=1 \
    node --test --test-concurrency=1 \
      test/chatgpt-archive-ingestion.test.mjs \
      test/chatgpt-archive-ingestion.integration.test.mjs \
      test/chatgpt-archive-load.integration.test.mjs
)
