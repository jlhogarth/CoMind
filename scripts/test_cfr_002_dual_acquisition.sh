#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CFR-002 verification}"

DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in ('postgres', 'postgresql'):
    print('Refusing CFR-002 verification for a non-PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing CFR-002 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

printf 'Reconstructing accepted CoMind v2 substrate...\n'
(
  cd "${repository_root}/db/sql/v2"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f MASTER.sql
)

printf 'Applying CFR-002 dual-acquisition migration twice to prove replay safety...\n'
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261030_023_cfr_002_dual_acquisition_foundation.sql"
done

printf 'Running CFR-002 database evidence proof...\n'
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/cfr_002_dual_acquisition.sql"

printf 'Building server TypeScript...\n'
(
  cd "${repository_root}/server"
  npm run build
)

printf 'Running CFR-002 deterministic normalizer and comparison tests...\n'
(
  cd "${repository_root}/server"
  node --test test/conversation-acquisition.test.mjs
)

printf 'CFR-002 isolated dual-acquisition acceptance: PASS\n'
