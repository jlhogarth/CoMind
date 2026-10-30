#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for SCOUT-002 isolated acceptance." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('SCOUT-002 acceptance requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in {'localhost', '127.0.0.1', '::1', 'db'} or parsed.path != '/comind_ci':
    print('Refusing SCOUT-002 acceptance outside isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

python3 "${repository_root}/scripts/validate_scout_002_package.py"

bash "${repository_root}/scripts/test_foundry_agent_substrate.sh"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_008_foundry_runtime_orchestration.sql"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/scripts/provision_scout_001_draft.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/scripts/provision_scout_001_draft.sql"

first_registration="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/scripts/provision_scout_002_c1_research_package.sql")"
second_registration="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/scripts/provision_scout_002_c1_research_package.sql")"

expected='agent.scout|draft|C0|C1||research.evidence.synthesize|synthesize_evidence|research_assignment|C1|low|f|ollama_local|0'
if [[ "${first_registration}" != *"${expected}"* ]]; then
  echo "SCOUT-002 first registration returned unexpected state: ${first_registration}" >&2
  exit 1
fi
if [[ "${second_registration}" != *"${expected}"* ]]; then
  echo "SCOUT-002 idempotent replay returned unexpected state: ${second_registration}" >&2
  exit 1
fi

capability_count="$(psql "${DATABASE_URL}" -X -Atc "
  SELECT count(*)
  FROM comind.cm_foundry_capability
  WHERE capability_code='research.evidence.synthesize'
    AND action='synthesize_evidence'
    AND target_kind='research_assignment'
    AND max_authority='C1'
    AND risk_class='low'
    AND cost_bearing=false
    AND adapter='ollama_local';")"
[[ "${capability_count}" == "1" ]]

scout_state="$(psql "${DATABASE_URL}" -X -At -F '|' -c "
  SELECT p.status,p.authority_floor,p.authority_ceiling,p.activated_at,
         (SELECT count(*) FROM comind.cm_foundry_capability_grant g
           WHERE g.profile_id=p.profile_id
             AND g.revoked_at IS NULL
             AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp()))
  FROM comind.cm_actor a
  JOIN comind.cm_foundry_agent_profile p ON p.actor_id=a.actor_id
  WHERE a.handle::text='agent.scout';")"
[[ "${scout_state}" == "draft|C0|C1||0" ]]

(
  cd "${repository_root}/server"
  npm ci
  npm run build
  node --test --test-concurrency=1 test/integration/scout-002-c1-research.test.mjs
)

printf 'SCOUT-002 isolated acceptance passed: capability=%s scout=%s\n' "${capability_count}" "${scout_state}"
