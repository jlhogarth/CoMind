#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
schema_dir="${repository_root}/db/sql/v2"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for the isolated development runtime." >&2
  exit 2
fi

node <<'NODE'
const raw = process.env.DATABASE_URL;
let parsed;
try {
  parsed = new URL(raw);
} catch {
  console.error('DATABASE_URL is not a valid URL.');
  process.exit(2);
}

const allowedProtocols = new Set(['postgres:', 'postgresql:']);
const allowedHosts = new Set(['db', 'localhost', '127.0.0.1']);
if (!allowedProtocols.has(parsed.protocol)) {
  console.error('DATABASE_URL must use the postgres or postgresql protocol.');
  process.exit(2);
}

if (!allowedHosts.has(parsed.hostname) || parsed.pathname !== '/comind_runtime') {
  console.error('Refusing database target outside the isolated comind_runtime development database.');
  process.exit(2);
}
NODE

for attempt in $(seq 1 30); do
  if pg_isready --dbname="${DATABASE_URL}" >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 30 ]]; then
    echo "Isolated PostgreSQL runtime did not become ready." >&2
    exit 1
  fi
  sleep 1
done

(
  cd "${schema_dir}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f MASTER.sql
)

psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -Atc \
  "SELECT current_database(), current_setting('server_version_num')::int >= 170000, EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector');"

echo "Isolated CoMind chat development database is initialized."
