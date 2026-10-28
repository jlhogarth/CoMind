#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated CINT-FINOPS-002 verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('CINT-FINOPS-002 verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing CINT-FINOPS-002 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

printf 'Reconstructing accepted CINT-FINOPS-003 provider and receipt substrate...\n'
bash "${repository_root}/scripts/test_cint_finops_003_provider_runtime_bridge.sh"

printf 'Applying CINT-FINOPS-002 Drive mirror leasing twice to prove replay-safe DDL...\n'
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261028_003_cint_finops_drive_sync_leasing.sql"
done

printf 'Verifying bounded claim, forced failure, retry, completion, and replay semantics...\n'
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261028_003_cint_finops_drive_sync_leasing.sql"

final_counts="$(psql "${DATABASE_URL}" -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  SELECT
    (SELECT count(*) FROM comind.cm_api_cost_receipt WHERE drive_sync_status = 'pending'),
    (SELECT count(*) FROM comind.cm_api_cost_receipt WHERE drive_sync_status = 'syncing'),
    (SELECT count(*) FROM comind.cm_api_cost_receipt WHERE drive_sync_status = 'error'),
    (SELECT count(*) FROM comind.cm_api_cost_receipt WHERE drive_sync_status = 'synced');
")"

if [[ "${final_counts}" != "1|0|0|0" ]]; then
  echo "CINT-FINOPS-002 verifier leaked state outside its rollback: ${final_counts}" >&2
  exit 1
fi

printf 'CINT-FINOPS-002 isolated Drive mirror state-machine verification passed: pending|syncing|error|synced=%s\n' "${final_counts}"
