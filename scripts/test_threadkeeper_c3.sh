#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated ThreadKeeper C3 verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os, sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL'])
if p.scheme not in ('postgres','postgresql') or p.hostname not in ('localhost','127.0.0.1','::1','db') or p.path != '/comind_ci':
    print('Refusing ThreadKeeper C3 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

(
  cd "${root}/db/sql/v2"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f MASTER.sql
)

for migration in \
  20261012_001_chatgpt_archive_ingestion.sql \
  20261012_002_chatgpt_archive_quarantine.sql \
  20261012_003_chatgpt_archive_access_hardening.sql \
  20261025_007_native_chatgpt_live_reconciliation.sql \
  20261025_008_native_chatgpt_live_reconciliation_live_read_boundary.sql \
  20261025_009_native_chatgpt_live_reconciliation_ambiguity_hardening.sql \
  20261025_010_native_chatgpt_live_reconciliation_snapshot_identity.sql \
  20261025_011_native_chatgpt_live_reconciliation_policy_hardening.sql \
  20261026_001_conversation_history_reader.sql \
  20261026_002_conversation_history_baseline_certification.sql \
  20261027_002_chatgpt_differential_ingestion.sql \
  20261027_003_chatgpt_differential_recovery_access.sql \
  20261027_004_threadkeeper_c3_history_read_boundary.sql
 do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/${migration}"
 done
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/verify_20261027_004_threadkeeper_c3_history_read_boundary.sql"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS comind;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; ELSE ALTER ROLE service_role BYPASSRLS; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tk006_history_login') THEN DROP ROLE tk006_history_login; END IF;
  CREATE ROLE tk006_history_login LOGIN PASSWORD 'history-test-password'
    NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  GRANT comind_conversation_history_reader TO tk006_history_login WITH INHERIT FALSE, SET TRUE;
END
$$;
GRANT USAGE ON SCHEMA comind TO service_role;
SQL

for migration in \
  20261026_008_threadkeeper_persistence.sql \
  20261026_009_threadkeeper_scope_integrity.sql \
  20261026_010_threadkeeper_fk_indexes.sql
 do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${root}/db/migrations/${migration}"
 done

# C3 is a maturity/evidence regression, not a frozen historical-schema runtime.
# Current ThreadKeeper repository transactions deliberately require the bounded
# runtime role introduced for TK-007. Bootstrap the current runtime schema here
# before executing C3 integration tests so the regression proves C3 behavior
# remains compatible with the current least-privilege database boundary.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/20261027_007_threadkeeper_c4_operational_events.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${root}/db/migrations/verify_20261027_007_threadkeeper_c4_operational_events.sql"

node "${root}/scripts/threadkeeper_c3_matrix.mjs"

(
  cd "${root}/server"
  npm ci
  npm run build
  node --test test/threadkeeper-c3-evidence.test.mjs
  node --test test/threadkeeper-c3-service.test.mjs
  THREADKEEPER_C3_ISOLATED_DB_TEST=1 node --test test/threadkeeper-c3-postgres.integration.test.mjs
)

echo 'TK-006 C3 compatibility regression under current ThreadKeeper runtime schema: PASS'
