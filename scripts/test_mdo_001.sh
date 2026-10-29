#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated MDO-001 verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('MDO-001 verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing MDO-001 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

database_name="$(psql "${DATABASE_URL}" -X -Atc "SELECT current_database();")"
if [[ "${database_name}" != "comind_ci" ]]; then
  echo "Refusing MDO-001 verification outside comind_ci." >&2
  exit 2
fi

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/test/bootstrap_supabase_compat.sql"

(
  cd "${repository_root}/db/sql/v2"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f MASTER.sql
)

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/test/finops_budget_authority_prerequisites.sql"
for migration in \
  20260910_001_comind_finops_resource_governor.sql \
  20261008_001_paid_provider_budget_authority_hardening.sql \
  20261008_002_current_runtime_budget_authority_adapter.sql \
  20261008_003_current_runtime_budget_authority_adapter_function_hardening.sql \
  20261008_004_current_runtime_budget_authority_adapter_lifecycle_hardening.sql \
  20261008_005_current_runtime_budget_authority_adapter_telemetry_role_hardening.sql \
  20261008_006_foundry_agent_substrate.sql \
  20261008_007_foundry_security_prerequisites.sql \
  20261008_008_foundry_runtime_orchestration.sql \
  20261009_009_foundry_work_lease_kernel.sql \
  20261021_011_foundry_work_lease_rpc_acl_hardening.sql \
  20261029_005_mdo_001_governed_module_development_orchestrator.sql
do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/${migration}"
done

# Reapply MDO-001 to prove its schema/configuration migration is idempotent.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261029_005_mdo_001_governed_module_development_orchestrator.sql"

verification_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261029_005_mdo_001_governed_module_development_orchestrator.sql")"

if [[ "${verification_output%%|*}" != "pass" ]]; then
  echo "MDO-001 verification failed: ${verification_output}" >&2
  exit 1
fi

printf 'MDO-001 verification passed: %s\n' "${verification_output}"
