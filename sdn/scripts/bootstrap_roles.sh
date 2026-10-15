#!/usr/bin/env bash
set -euo pipefail
: "${SDN_INGEST_PASSWORD:?required}"
: "${SDN_LIFECYCLE_PASSWORD:?required}"
: "${SDN_PURGE_PASSWORD:?required}"
for value in "$SDN_INGEST_PASSWORD" "$SDN_LIFECYCLE_PASSWORD" "$SDN_PURGE_PASSWORD"; do
  [[ "$value" =~ ^[A-Za-z0-9]+$ ]] || { echo "Runtime role passwords must be alphanumeric for isolated bootstrap." >&2; exit 2; }
done
cd "$(dirname "$0")/.."
docker compose -f compose.yaml exec -T db psql -U postgres -d comind_sdn_test -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_ingest_user') THEN CREATE ROLE sdn_ingest_user LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_lifecycle_user') THEN CREATE ROLE sdn_lifecycle_user LOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sdn_purge_user') THEN CREATE ROLE sdn_purge_user LOGIN; END IF;
END \$\$;
ALTER ROLE sdn_ingest_user PASSWORD '${SDN_INGEST_PASSWORD}';
ALTER ROLE sdn_lifecycle_user PASSWORD '${SDN_LIFECYCLE_PASSWORD}';
ALTER ROLE sdn_purge_user PASSWORD '${SDN_PURGE_PASSWORD}';
GRANT sdn_ingest_role TO sdn_ingest_user;
GRANT sdn_lifecycle_role TO sdn_lifecycle_user;
GRANT sdn_purge_role TO sdn_purge_user;
SQL
