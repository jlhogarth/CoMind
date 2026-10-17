#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_SESSION_DATABASE_URL:?SUPABASE_SESSION_DATABASE_URL is required}"

mapfile -d '' -t connection_parts < <(
  SUPABASE_SESSION_DATABASE_URL="${SUPABASE_SESSION_DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import unquote, urlparse

raw = os.environ["SUPABASE_SESSION_DATABASE_URL"]
parsed = urlparse(raw)

expected = {
    "host": "aws-0-us-east-1.pooler.supabase.com",
    "port": 5432,
    "username": "postgres.sbgfuanxiqepcoboxzcl",
    "database": "postgres",
}

username = unquote(parsed.username or "")
password = unquote(parsed.password or "")
database = unquote(parsed.path.lstrip("/"))

if parsed.scheme not in {"postgres", "postgresql"}:
    print("Production connectivity proof requires a PostgreSQL URL.", file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname != expected["host"]:
    print("Production connectivity proof refused an unexpected database host.", file=sys.stderr)
    raise SystemExit(2)
if parsed.port != expected["port"]:
    print("Production connectivity proof refused an unexpected database port.", file=sys.stderr)
    raise SystemExit(2)
if username != expected["username"]:
    print("Production connectivity proof refused an unexpected database username.", file=sys.stderr)
    raise SystemExit(2)
if database != expected["database"]:
    print("Production connectivity proof refused an unexpected database name.", file=sys.stderr)
    raise SystemExit(2)
if password == "":
    print("Production connectivity proof requires a non-empty database credential.", file=sys.stderr)
    raise SystemExit(2)

for value in (parsed.hostname, str(parsed.port), username, password, database):
    sys.stdout.write(value)
    sys.stdout.write("\0")

print("Supabase Session pooler connection metadata validated without printing credentials.", file=sys.stderr)
PY
)

if [[ "${#connection_parts[@]}" -ne 5 ]]; then
  echo "Production connectivity proof could not derive the expected connection parameters." >&2
  exit 2
fi

export PGHOST="${connection_parts[0]}"
export PGPORT="${connection_parts[1]}"
export PGUSER="${connection_parts[2]}"
export PGPASSWORD="${connection_parts[3]}"
export PGDATABASE="${connection_parts[4]}"
unset SUPABASE_SESSION_DATABASE_URL

export PGCONNECT_TIMEOUT="10"
export PGSSLMODE="require"
export PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=5000"

PSQL_BIN="${PSQL_BIN:-psql}"

connectivity_output="$("${PSQL_BIN}" -X -q -At -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;

WITH expected_stage1(name) AS (
    VALUES
        ('live_foundry_stage1_finops_current_runtime_projection_v1'),
        ('live_foundry_stage1_paid_provider_budget_authority_hardening_v1'),
        ('live_foundry_stage1_current_runtime_budget_authority_adapter_v1'),
        ('live_foundry_stage1_current_runtime_budget_authority_adapter_function_hardening_v1'),
        ('live_foundry_stage1_current_runtime_budget_authority_adapter_lifecycle_hardening_v1'),
        ('live_foundry_stage1_current_runtime_budget_authority_adapter_telemetry_role_hardening_v1')
),
checks AS (
    SELECT
        current_database() = 'postgres' AS database_ok,
        current_user = 'postgres' AS current_user_ok,
        current_setting('server_version_num')::integer >= 170000 AS postgres_17_or_newer_ok,
        to_regclass('comind.cm_org') IS NOT NULL AS runtime_relation_ok,
        to_regclass('comind.cm_budget_authority_binding') IS NOT NULL AS budget_authority_relation_ok,
        NOT EXISTS (
            SELECT 1
            FROM expected_stage1 e
            WHERE NOT EXISTS (
                SELECT 1
                FROM supabase_migrations.schema_migrations m
                WHERE m.name = e.name
            )
        ) AS stage1_migrations_present_ok,
        current_setting('transaction_read_only') = 'on' AS transaction_read_only_ok
)
SELECT CASE
    WHEN database_ok
     AND current_user_ok
     AND postgres_17_or_newer_ok
     AND runtime_relation_ok
     AND budget_authority_relation_ok
     AND stage1_migrations_present_ok
     AND transaction_read_only_ok
    THEN 'connectivity_pass'
    ELSE 'connectivity_fail'
END
FROM checks;

COMMIT;
SQL
)"

if [[ "${connectivity_output}" != "connectivity_pass" ]]; then
  echo "Live Supabase read-only connectivity contract failed." >&2
  exit 1
fi

printf 'Live Supabase read-only connectivity contract passed.\n'
