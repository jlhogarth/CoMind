#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated LF-2 Agent substrate verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('LF-2 verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing LF-2 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

database_name="$(psql "${DATABASE_URL}" -X -Atc "SELECT current_database();")"
if [[ "${database_name}" != "comind_ci" ]]; then
  echo "Refusing LF-2 verification outside comind_ci." >&2
  exit 2
fi

python3 "${repository_root}/scripts/verify_live_foundry_lf2_manifest.py"

# Reproduce the accepted LF-1 runtime shape using the already-governed Stage 1
# readiness path. LF-2 deliberately does not call migration 007.
bash "${repository_root}/scripts/test_live_foundry_stage1_readiness.sh"

# Supabase service_role bypasses RLS. The generic local compatibility role does
# not, so align this disposable fixture with the verified live role property.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
ALTER ROLE service_role BYPASSRLS;
SQL

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_006_foundry_agent_substrate.sql"

# Reapply LF-2 substrate only to prove idempotency without the LF-3 sweep.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_006_foundry_agent_substrate.sql"

substrate_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261008_006_foundry_agent_substrate.sql")"
if [[ "${substrate_output%%|*}" != "pass" ]]; then
  echo "LF-2 structural substrate verification failed: ${substrate_output}" >&2
  exit 1
fi

service_role_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/verify_live_foundry_lf2_service_role.sql")"
if [[ "${service_role_output%%|*}" != "pass" ]]; then
  echo "LF-2 service_role verification failed: ${service_role_output}" >&2
  exit 1
fi

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
    v_table text;
    v_count bigint;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cm_foundry_agent_profile',
        'cm_foundry_capability',
        'cm_foundry_capability_grant',
        'cm_foundry_authorization_request',
        'cm_foundry_authorization_decision',
        'cm_foundry_execution_context',
        'cm_foundry_deliberation',
        'cm_foundry_deliberation_participant',
        'cm_foundry_deliberation_event',
        'cm_foundry_deliberation_outcome',
        'cm_foundry_recovery_checkpoint',
        'cm_foundry_adapter_operation'
    ] LOOP
        EXECUTE format('SELECT count(*) FROM comind.%I', v_table) INTO v_count;
        IF v_count <> 0 THEN
            RAISE EXCEPTION 'LF-2 verification left persistent rows in comind.%: %', v_table, v_count;
        END IF;
    END LOOP;

    IF to_regclass('comind.cm_foundry_adapter_operation_result') IS NOT NULL
       OR to_regclass('comind.cm_foundry_execution_outcome') IS NOT NULL THEN
        RAISE EXCEPTION 'LF-2 verification crossed into migration 008 runtime orchestration';
    END IF;

    IF (SELECT count(*) FROM comind.cm_agent) <> 0
       OR (SELECT count(*) FROM comind.cm_agent_run) <> 0
       OR (SELECT count(*) FROM comind_pm.pm_agent_runs) <> 0 THEN
        RAISE EXCEPTION 'LF-2 verification left persistent Agent execution evidence';
    END IF;
END;
$$;
SQL

printf 'LF-2 Agent substrate verification passed: %s; %s\n' \
  "${substrate_output}" "${service_role_output}"
