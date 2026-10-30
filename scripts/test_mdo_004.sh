#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated MDO-004 verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
if parsed.scheme not in {'postgres', 'postgresql'} or parsed.hostname not in {'localhost', '127.0.0.1', '::1', 'db'} or parsed.path != '/comind_ci':
    print('Refusing MDO-004 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

DATABASE_URL="${DATABASE_URL}" bash "${repository_root}/scripts/test_mdo_001.sh"

for migration in \
  20261029_010_mdo_002_foundry_terminal_alignment.sql \
  20261030_024_mdo_003_plan_scoped_claim_hardening.sql
do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/${migration}"
done

for pass in 1 2; do
  printf 'MDO-004 migration pass %s\n' "${pass}"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261030_026_mdo_004_governed_plan_disposition.sql"
done

verification_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261030_026_mdo_004_governed_plan_disposition.sql")"
if [[ "${verification_output%%|*}" != "pass" ]]; then
  echo "MDO-004 structural verification failed: ${verification_output}" >&2
  exit 1
fi
printf 'MDO-004 structural verification passed: %s\n' "${verification_output}"

behavior_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261030_026_mdo_004_behavior.sql")"
if [[ "${behavior_output%%|*}" != "pass" ]]; then
  echo "MDO-004 behavior verification failed: ${behavior_output}" >&2
  exit 1
fi
printf 'MDO-004 behavior verification passed: %s\n' "${behavior_output}"
