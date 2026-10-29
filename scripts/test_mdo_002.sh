#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required}"

"${repository_root}/scripts/test_mdo_001.sh"

for pass in 1 2; do
  printf 'MDO-002 terminal-alignment migration pass %s\n' "${pass}"
  psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261029_007_mdo_002_foundry_terminal_alignment.sql"
done

psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261029_007_mdo_002_foundry_terminal_alignment.sql"
