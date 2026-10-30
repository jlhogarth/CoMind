#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for SEC-RLS-001 verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('SEC-RLS-001 requires PostgreSQL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in {'localhost','127.0.0.1','::1','db'} or parsed.path != '/comind_ci':
    print('Refusing SEC-RLS-001 verification outside isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_deriver') THEN
    CREATE ROLE comind_conversation_deriver NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='comind_conversation_reconciler') THEN
    CREATE ROLE comind_conversation_reconciler NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS comind;
CREATE SCHEMA IF NOT EXISTS comind_pm;
REVOKE ALL ON SCHEMA comind, comind_pm FROM PUBLIC;
REVOKE ALL ON SCHEMA comind, comind_pm FROM anon, authenticated;
GRANT USAGE ON SCHEMA comind, comind_pm TO service_role;
GRANT USAGE ON SCHEMA comind TO comind_conversation_deriver, comind_conversation_reconciler;

CREATE TABLE comind.cm_assistant_generation(id bigint PRIMARY KEY, body text);
CREATE TABLE comind.cm_conversation_capture_event(id bigint PRIMARY KEY, body text);
CREATE TABLE comind.cm_conversation_recovery_checkpoint(id bigint PRIMARY KEY, body text);
CREATE TABLE comind.cm_message_analytics(id bigint PRIMARY KEY, value_text text);
CREATE TABLE comind.cm_conversation_analytics(id bigint PRIMARY KEY, value_text text);
CREATE TABLE comind.sec_rls_001_unprotected_extra(id bigint PRIMARY KEY, body text);
CREATE TABLE comind_pm.pm_research_sessions(id bigint PRIMARY KEY, body text);
CREATE TABLE comind.sec_rls_001_policy_sentinel(id bigint PRIMARY KEY, body text);
ALTER TABLE comind.sec_rls_001_policy_sentinel ENABLE ROW LEVEL SECURITY;
CREATE POLICY sec_rls_001_existing_true_policy
ON comind.sec_rls_001_policy_sentinel
FOR SELECT TO service_role
USING (true);

REVOKE ALL ON ALL TABLES IN SCHEMA comind, comind_pm FROM PUBLIC, anon, authenticated;
GRANT SELECT ON comind.cm_assistant_generation, comind.cm_conversation_capture_event, comind.cm_conversation_recovery_checkpoint
TO comind_conversation_deriver, comind_conversation_reconciler;
GRANT SELECT, INSERT, UPDATE ON comind.cm_message_analytics, comind.cm_conversation_analytics
TO comind_conversation_deriver;
GRANT SELECT ON comind.sec_rls_001_policy_sentinel TO service_role;
GRANT SELECT, INSERT ON comind.sec_rls_001_unprotected_extra TO service_role;

INSERT INTO comind.cm_assistant_generation VALUES (1,'assistant');
INSERT INTO comind.cm_conversation_capture_event VALUES (1,'capture');
INSERT INTO comind.cm_conversation_recovery_checkpoint VALUES (1,'checkpoint');
INSERT INTO comind.sec_rls_001_unprotected_extra VALUES (1,'extra');
INSERT INTO comind.sec_rls_001_policy_sentinel VALUES (1,'sentinel');
SQL

pre_unprotected="$(psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('comind','comind_pm') and c.relkind in ('r','p') and not c.relrowsecurity")"
if [[ "$pre_unprotected" -lt 7 ]]; then
  echo "SEC-RLS-001 fixture did not establish the intended unprotected precondition: $pre_unprotected" >&2
  exit 1
fi

migration="${repository_root}/db/migrations/20261030_027_sec_rls_001_current_schema_hardening.sql"
if [[ ! -f "$migration" ]]; then
  echo "SEC-RLS-001 migration is intentionally absent at Test-first checkpoint." >&2
  exit 3
fi

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$migration"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$migration"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${repository_root}/db/migrations/verify_20261030_027_sec_rls_001_current_schema_hardening.sql"

# Prove the RLS policies work for the dedicated roles, not merely that ACLs survived.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE comind_conversation_deriver;
SELECT count(*) FROM comind.cm_assistant_generation;
SELECT count(*) FROM comind.cm_conversation_capture_event;
SELECT count(*) FROM comind.cm_conversation_recovery_checkpoint;
INSERT INTO comind.cm_message_analytics VALUES (1,'message');
UPDATE comind.cm_message_analytics SET value_text='message-updated' WHERE id=1;
INSERT INTO comind.cm_conversation_analytics VALUES (1,'conversation');
UPDATE comind.cm_conversation_analytics SET value_text='conversation-updated' WHERE id=1;
RESET ROLE;

SET ROLE comind_conversation_reconciler;
SELECT count(*) FROM comind.cm_assistant_generation;
SELECT count(*) FROM comind.cm_conversation_capture_event;
SELECT count(*) FROM comind.cm_conversation_recovery_checkpoint;
RESET ROLE;

SET ROLE service_role;
SELECT count(*) FROM comind.sec_rls_001_policy_sentinel;
SELECT count(*) FROM comind.sec_rls_001_unprotected_extra;
INSERT INTO comind.sec_rls_001_unprotected_extra VALUES (2,'service-role-bypass');
RESET ROLE;
SQL

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE comind_conversation_deriver;
DELETE FROM comind.cm_message_analytics WHERE id=1;
SQL
then
  echo "SEC-RLS-001 deriver unexpectedly deleted analytics data." >&2
  exit 1
fi

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE comind_conversation_reconciler;
SELECT count(*) FROM comind.cm_message_analytics;
SQL
then
  echo "SEC-RLS-001 reconciler unexpectedly gained analytics access." >&2
  exit 1
fi

if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
SET ROLE anon;
SELECT count(*) FROM comind.sec_rls_001_unprotected_extra;
SQL
then
  echo "SEC-RLS-001 anon unexpectedly reached custom-schema data." >&2
  exit 1
fi

policy_count="$(psql "$DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='comind' and c.relname='sec_rls_001_policy_sentinel' and p.polname='sec_rls_001_existing_true_policy'")"
if [[ "$policy_count" != "1" ]]; then
  echo "SEC-RLS-001 failed to preserve the pre-existing literal-true policy." >&2
  exit 1
fi

echo "SEC-RLS-001 isolated hardening proof passed."
