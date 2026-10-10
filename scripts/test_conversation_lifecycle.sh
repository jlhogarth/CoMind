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
  mapfile -t integration_tests < <(
    find test/integration -maxdepth 1 -type f -name '*.test.mjs' \
      ! -name 'foundry-work-lease-kernel.test.mjs' \
      ! -name 'foundry-runtime-orchestration.test.mjs' -print | sort
  )
  if [[ "${#integration_tests[@]}" -eq 0 ]]; then
    echo "No conversation-lifecycle integration tests were discovered." >&2
    exit 1
  fi
  node --test --test-concurrency=1 "${integration_tests[@]}"
)
