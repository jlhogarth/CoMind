#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

cat >"${tmpdir}/fake-psql" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:?PGHOST is required}"
: "${PGPORT:?PGPORT is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${EXPECTED_PASSWORD:?EXPECTED_PASSWORD is required}"

[[ "${PGHOST}" == "aws-0-us-east-1.pooler.supabase.com" ]]
[[ "${PGPORT}" == "5432" ]]
[[ "${PGUSER}" == "postgres.sbgfuanxiqepcoboxzcl" ]]
[[ "${PGDATABASE}" == "postgres" ]]
[[ "${PGPASSWORD}" == "${EXPECTED_PASSWORD}" ]]
[[ "${PGSSLMODE}" == "require" ]]
[[ "${PGOPTIONS}" == *"default_transaction_read_only=on"* ]]

for arg in "$@"; do
  if [[ "${arg}" == postgres://* || "${arg}" == postgresql://* ]]; then
    echo "Raw database URI must not be passed to psql." >&2
    exit 20
  fi
done

cat >/dev/null
printf 'connectivity_pass\n'
EOF
chmod 0700 "${tmpdir}/fake-psql"

run_case() {
  local uri="$1"
  local expected_password="$2"

  SUPABASE_SESSION_DATABASE_URL="${uri}" \
  EXPECTED_PASSWORD="${expected_password}" \
  PSQL_BIN="${tmpdir}/fake-psql" \
    bash "${repo_root}/scripts/verify_live_supabase_connectivity_readonly.sh" >/dev/null
}

run_case \
  'postgresql://postgres.sbgfuanxiqepcoboxzcl:synthetic@@aws-0-us-east-1.pooler.supabase.com:5432/postgres' \
  'synthetic@'

run_case \
  'postgresql://postgres.sbgfuanxiqepcoboxzcl:synthetic%40%3A%2F%3F%23%5B%5D@aws-0-us-east-1.pooler.supabase.com:5432/postgres' \
  'synthetic@:/?#[]'

printf 'Live Supabase read-only connectivity URI hardening tests passed.\n'
