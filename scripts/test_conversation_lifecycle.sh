#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for the isolated conversation lifecycle test." >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
schema_dir="$repo_root/db/sql/v2"
fixture_file="$repo_root/db/test/conversation_lifecycle_fixtures.sql"

(
  cd "$schema_dir"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f MASTER.sql
)

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$fixture_file"

(
  cd "$repo_root/server"
  npm ci
  npm run build
  node --test test/integration/conversation-lifecycle.test.mjs
)
