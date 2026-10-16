#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated LF-2 postdeploy contract evaluation." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('LF-2 postdeploy evaluation requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in {'localhost', '127.0.0.1', '::1', 'db'} or parsed.path != '/comind_ci':
    print('Refusing LF-2 postdeploy evaluation outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

# The live contract also protects the Operator Console authority registry and
# requires the LF-2 migration ledger record. The LF-2 isolated fixture does not
# otherwise install the Operator Console activation migration or record a live
# LF-2 migration, so add only those disposable boundary fixtures here.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.operator_console_relation_registry (
    schema_name text NOT NULL,
    relation_name text NOT NULL,
    browser_read boolean NOT NULL,
    admin_insert boolean NOT NULL,
    admin_update boolean NOT NULL,
    admin_delete boolean NOT NULL,
    destructive_allowed boolean NOT NULL,
    enabled boolean NOT NULL,
    PRIMARY KEY (schema_name, relation_name)
);

INSERT INTO public.operator_console_relation_registry (
    schema_name, relation_name, browser_read, admin_insert, admin_update,
    admin_delete, destructive_allowed, enabled
) VALUES
    ('public','comments',true,true,true,false,false,true),
    ('public','operator_console_verification_records',false,true,true,true,true,true),
    ('public','posts',true,true,true,false,false,true),
    ('public','users',true,true,true,false,false,true)
ON CONFLICT (schema_name, relation_name) DO UPDATE SET
    browser_read = EXCLUDED.browser_read,
    admin_insert = EXCLUDED.admin_insert,
    admin_update = EXCLUDED.admin_update,
    admin_delete = EXCLUDED.admin_delete,
    destructive_allowed = EXCLUDED.destructive_allowed,
    enabled = EXCLUDED.enabled;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20990101000000', 'live_foundry_lf2_agent_substrate_v1')
ON CONFLICT DO NOTHING;
SQL

contract_output="$(psql "${DATABASE_URL}" -X -q -At -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/live_foundry_lf2_postdeploy.sql")"

CONTRACT_OUTPUT="${contract_output}" python3 <<'PY'
import json
import os
import sys

raw = os.environ['CONTRACT_OUTPUT'].strip()
try:
    payload = json.loads(raw)
except json.JSONDecodeError as exc:
    print(f'LF-2 postdeploy contract did not return valid JSON: {exc}', file=sys.stderr)
    raise SystemExit(1)

checks = payload.get('checks')
if not isinstance(checks, dict):
    print('LF-2 postdeploy contract did not return a checks object.', file=sys.stderr)
    raise SystemExit(1)

# These checks intentionally bind the live production baseline and are allowed
# to differ in disposable comind_ci. Every object, privilege, provenance,
# protected-count, provider, migration-record, and Operator Console gate must
# still evaluate true here.
allowed_fixture_differences = {
    'database_ok',
    'server_version_ok',
    'known_warn_shape_ok',
    'expected_info_shape_ok',
}

failed = sorted(
    key for key, value in checks.items()
    if value is not True and key not in allowed_fixture_differences
)
if failed:
    print('LF-2 postdeploy portable gates failed: ' + ', '.join(failed), file=sys.stderr)
    raise SystemExit(1)

missing = sorted(key for key in allowed_fixture_differences if key not in checks)
if missing:
    print('LF-2 postdeploy contract is missing expected production-specific gates: ' + ', '.join(missing), file=sys.stderr)
    raise SystemExit(1)

print('LF-2 live postdeploy SQL evaluated successfully in isolated production shape.')
print('Portable postdeploy gates passed; production-specific baseline gates remain reserved for live readback.')
PY
