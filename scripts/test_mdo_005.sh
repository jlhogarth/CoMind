#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated MDO-005 verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
if parsed.scheme not in {'postgres', 'postgresql'} or parsed.hostname not in {'localhost', '127.0.0.1', '::1', 'db'} or parsed.path != '/comind_ci':
    print('Refusing MDO-005 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

DATABASE_URL="${DATABASE_URL}" bash "${repository_root}/scripts/test_mdo_004.sh"

for pass in 1 2; do
  printf 'MDO-005 migration pass %s\n' "${pass}"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261030_029_mdo_005_governed_module_maturity.sql"
done

verification_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261030_029_mdo_005_governed_module_maturity.sql")"
if [[ "${verification_output%%|*}" != "pass" ]]; then
  echo "MDO-005 structural verification failed: ${verification_output}" >&2
  exit 1
fi
printf 'MDO-005 structural verification passed: %s\n' "${verification_output}"

behavior_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261030_029_mdo_005_behavior.sql")"
if [[ "${behavior_output%%|*}" != "pass" ]]; then
  echo "MDO-005 behavior verification failed: ${behavior_output}" >&2
  exit 1
fi
printf 'MDO-005 behavior verification passed: %s\n' "${behavior_output}"
