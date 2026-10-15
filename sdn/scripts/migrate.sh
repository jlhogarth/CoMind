#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f compose.yaml)
for sql in migrations/*.sql; do
  echo "Applying ${sql}"
  "${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -v ON_ERROR_STOP=1 -f "/migrations/$(basename "$sql")"
done
