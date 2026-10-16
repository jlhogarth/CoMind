#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated Stage 1 readiness verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('Stage 1 readiness verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing Stage 1 readiness verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

database_name="$(psql "${DATABASE_URL}" -X -Atc "SELECT current_database();")"
if [[ "${database_name}" != "comind_ci" ]]; then
  echo "Refusing Stage 1 readiness verification outside comind_ci." >&2
  exit 2
fi

python3 "${repository_root}/scripts/verify_live_foundry_stage1_manifest.py"

(
  cd "${repository_root}/db/sql/v2"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f MASTER.sql
)

# Model only Supabase platform roles needed by the reviewed migrations.
# Deliberately do not create public.projects, public.agents, or
# public.comind_governance_decisions. Those legacy identity surfaces do not
# exist in the live CoMind v2 database and must not be reintroduced.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN;
    END IF;
END;
$$;

DO $$
BEGIN
    IF to_regclass('public.projects') IS NOT NULL
       OR to_regclass('public.agents') IS NOT NULL
       OR to_regclass('public.comind_governance_decisions') IS NOT NULL THEN
        RAISE EXCEPTION 'Stage 1 readiness fixture unexpectedly contains legacy public identity/governance tables';
    END IF;
END;
$$;
SQL

# Reproduce the accepted live PM substrate using its canonical repository
# migrations. The post-deployment verifier intentionally checks PM Agent-run
# state because Stage 1 must not persist execution evidence as a side effect.
# Do not fabricate only pm_agent_runs as a test-only compatibility surface.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

# Reproduce the exact reviewed pre-Stage 1 live migration ledger. These rows
# model migration provenance only. They do not claim the Operator Console
# runtime is present in this isolated fixture.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text,
    statements text[],
    name text PRIMARY KEY
);
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES
    ('20261005213616', ARRAY[]::text[], 'comind_base_v2_initial_build'),
    ('20261006051527', ARRAY[]::text[], 'comind_pm_ledger_maintenance_package_v0_1'),
    ('20261006051627', ARRAY[]::text[], 'comind_pm_ledger_hardening_v0_1_1'),
    ('20261015211851', ARRAY[]::text[], 'operator_console_live_activation_v0_2'),
    ('20261015212201', ARRAY[]::text[], 'operator_console_service_role_least_privilege_v0_2_1'),
    ('20261015212719', ARRAY[]::text[], 'operator_console_explicit_deny_policies_v0_2_2')
ON CONFLICT (name) DO UPDATE
SET version = EXCLUDED.version,
    statements = EXCLUDED.statements;
SQL

preflight_output="${work_dir}/preflight.out"
psql "${DATABASE_URL}" -X -At -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/live_foundry_stage1_preflight.sql" \
  >"${preflight_output}"
if ! grep -q '"technical_preflight_pass": true' "${preflight_output}"; then
  echo "Stage 1 preflight did not accept the exact reviewed six-migration baseline." >&2
  cat "${preflight_output}" >&2
  exit 1
fi

# Missing expected migration must fail closed.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20261015212719'
  AND name = 'operator_console_explicit_deny_policies_v0_2_2';
SQL
missing_output="${work_dir}/preflight-missing.out"
psql "${DATABASE_URL}" -X -At -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/live_foundry_stage1_preflight.sql" \
  >"${missing_output}"
if ! grep -q '"technical_preflight_pass": false' "${missing_output}" \
   || ! grep -q 'missing_expected_migration' "${missing_output}" \
   || ! grep -q 'operator_console_explicit_deny_policies_v0_2_2' "${missing_output}"; then
  echo "Stage 1 preflight did not fail closed for a missing reviewed migration." >&2
  cat "${missing_output}" >&2
  exit 1
fi
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20261015212719', ARRAY[]::text[], 'operator_console_explicit_deny_policies_v0_2_2');
SQL

# Unexpected additional migration must fail closed.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20261015999999', ARRAY[]::text[], 'unknown_live_schema_drift_test_only');
SQL
unexpected_output="${work_dir}/preflight-unexpected.out"
psql "${DATABASE_URL}" -X -At -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/live_foundry_stage1_preflight.sql" \
  >"${unexpected_output}"
if ! grep -q '"technical_preflight_pass": false' "${unexpected_output}" \
   || ! grep -q 'unexpected_live_migration' "${unexpected_output}" \
   || ! grep -q 'unknown_live_schema_drift_test_only' "${unexpected_output}"; then
  echo "Stage 1 preflight did not fail closed for unexpected live migration drift." >&2
  cat "${unexpected_output}" >&2
  exit 1
fi
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20261015999999'
  AND name = 'unknown_live_schema_drift_test_only';
SQL

# Exact baseline must recover to PASS after the negative fixtures are removed.
recovered_preflight_output="${work_dir}/preflight-recovered.out"
psql "${DATABASE_URL}" -X -At -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/live_foundry_stage1_preflight.sql" \
  >"${recovered_preflight_output}"
if ! grep -q '"technical_preflight_pass": true' "${recovered_preflight_output}"; then
  echo "Stage 1 preflight did not recover after migration-drift fixtures were removed." >&2
  cat "${recovered_preflight_output}" >&2
  exit 1
fi

projection_sql="${work_dir}/20260910_001_live_foundry_stage1_finops_projection.sql"

python3 "${repository_root}/scripts/build_live_foundry_stage1_finops_projection.py" \
  --output "${projection_sql}"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${projection_sql}"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_001_paid_provider_budget_authority_hardening.sql"

# Verify the FinOps ledger works with the actual CoMind v2 production shape,
# not the old synthetic legacy identity fixture.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/verify_live_foundry_stage1_finops_current_runtime.sql"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_002_current_runtime_budget_authority_adapter.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_003_current_runtime_budget_authority_adapter_function_hardening.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_004_current_runtime_budget_authority_adapter_lifecycle_hardening.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_005_current_runtime_budget_authority_adapter_telemetry_role_hardening.sql"

# Reuse the existing deterministic current-runtime verification contracts.
# Each verifier owns its synthetic evidence inside a transaction and rolls it back.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261008_002_current_runtime_budget_authority_adapter.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261008_004_current_runtime_budget_authority_adapter_lifecycle_hardening.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261008_005_current_runtime_budget_authority_adapter_telemetry_role_hardening.sql"

# Model only the Stage 1 migration-history rows expected after a separately
# authorized deployment. The reviewed pre-Stage 1 baseline remains present.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES
    ('20261015100101', ARRAY[]::text[], 'live_foundry_stage1_finops_current_runtime_projection_v1'),
    ('20261015100102', ARRAY[]::text[], 'live_foundry_stage1_paid_provider_budget_authority_hardening_v1'),
    ('20261015100103', ARRAY[]::text[], 'live_foundry_stage1_current_runtime_budget_authority_adapter_v1'),
    ('20261015100104', ARRAY[]::text[], 'live_foundry_stage1_current_runtime_budget_authority_adapter_function_hardening_v1'),
    ('20261015100105', ARRAY[]::text[], 'live_foundry_stage1_current_runtime_budget_authority_adapter_lifecycle_hardening_v1'),
    ('20261015100106', ARRAY[]::text[], 'live_foundry_stage1_current_runtime_budget_authority_adapter_telemetry_role_hardening_v1')
ON CONFLICT (name) DO NOTHING;
SQL

postdeploy_output="${work_dir}/postdeploy.out"
psql "${DATABASE_URL}" -X -At -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/live_foundry_stage1_postdeploy.sql" \
  >"${postdeploy_output}"

if ! grep -q '"stage1_contract_pass": true' "${postdeploy_output}"; then
  echo "Stage 1 post-deployment contract verifier did not report PASS." >&2
  cat "${postdeploy_output}" >&2
  exit 1
fi

legacy_count="$(psql "${DATABASE_URL}" -X -Atc "
SELECT
  (CASE WHEN to_regclass('public.projects') IS NULL THEN 0 ELSE 1 END) +
  (CASE WHEN to_regclass('public.agents') IS NULL THEN 0 ELSE 1 END) +
  (CASE WHEN to_regclass('public.comind_governance_decisions') IS NULL THEN 0 ELSE 1 END);
")"
if [[ "${legacy_count}" != "0" ]]; then
  echo "Stage 1 readiness introduced a forbidden legacy identity/governance relation." >&2
  exit 1
fi

agent_state="$(psql "${DATABASE_URL}" -X -Atc "
SELECT
  (SELECT count(*) FROM comind.cm_agent)::text || '|' ||
  (SELECT count(*) FROM comind.cm_agent_run)::text || '|' ||
  (SELECT count(*) FROM comind_pm.pm_agent_runs)::text;
")"
if [[ "${agent_state}" != "0|0|0" ]]; then
  echo "Stage 1 readiness left persistent Agent execution evidence: ${agent_state}" >&2
  exit 1
fi

printf 'Live Foundry Stage 1 readiness verification passed. Agent state: %s\n' "${agent_state}"
