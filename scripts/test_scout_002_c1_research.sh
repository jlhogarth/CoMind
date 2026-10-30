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

# Create the minimum canonical SCOUT-001 baseline directly on the accepted v2 +
# Foundry substrate. This is an isolated acceptance fixture, not a replay of the
# historical Test provisioning script. The historical script depends on later
# project-identity columns that are intentionally absent from a clean v2 bootstrap.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

WITH canonical AS (
  SELECT o.org_id, owner.actor_id AS owner_actor_id
  FROM comind.cm_org o
  JOIN comind.cm_actor owner ON owner.org_id=o.org_id
  WHERE o.slug::text='comind'
    AND owner.handle::text='joseph.hogarth'
    AND owner.kind='person'
), inserted_actor AS (
  INSERT INTO comind.cm_actor(org_id,kind,handle,display_name,meta)
  SELECT org_id,'agent','agent.scout','Scout',jsonb_build_object(
    'control_id','SCOUT-001',
    'issue',395,
    'identity_owner','CoMind Inc.',
    'accountable_sponsor_actor_id',owner_actor_id,
    'supervisor_actor_id',owner_actor_id,
    'environment','Test',
    'production_authorized',false,
    'autonomous_developmental_mutation_enabled',false
  )
  FROM canonical
  ON CONFLICT (handle) DO NOTHING
  RETURNING actor_id
)
SELECT count(*) FROM inserted_actor;

WITH canonical AS (
  SELECT org_id FROM comind.cm_org WHERE slug::text='comind'
), inserted_agent AS (
  INSERT INTO comind.cm_agent(org_id,name,description,config)
  SELECT org_id,'Scout',
    'Governed developmental Emerging Technology Research Analyst for evidence-grounded CoMind research.',
    jsonb_build_object(
      'control_id','SCOUT-001',
      'issue',395,
      'purpose','Emerging technology and standards research for CoMind',
      'role_code','emerging_technology_research_analyst',
      'environment','isolated',
      'autonomous_growth_enabled',false,
      'delegation_enabled',false,
      'paid_provider_authorized',false,
      'external_provider_mutation_authorized',false,
      'production_mutation_authorized',false
    )
  FROM canonical
  WHERE NOT EXISTS (SELECT 1 FROM comind.cm_agent WHERE name::text='Scout')
  RETURNING agent_id
)
SELECT count(*) FROM inserted_agent;

INSERT INTO comind.cm_foundry_agent_profile(
  agent_id,actor_id,org_id,role_code,display_name,
  authority_floor,authority_ceiling,instruction_version,
  runtime_defaults,competencies,status
)
SELECT
  ag.agent_id,
  a.actor_id,
  o.org_id,
  'emerging_technology_research_analyst',
  'Scout',
  'C0','C1','scout.v0.1',
  jsonb_build_object(
    'execution_mode','isolated',
    'developmental_mutation_mode','disabled',
    'external_provider_mutation_allowed',false,
    'paid_provider_allowed',false,
    'production_target_allowed',false
  ),
  jsonb_build_array(
    'public_research','source_evaluation','standards_tracking',
    'technology_scouting','evidence_synthesis'
  ),
  'draft'
FROM comind.cm_org o
JOIN comind.cm_actor a ON a.org_id=o.org_id AND a.handle::text='agent.scout'
JOIN comind.cm_agent ag ON ag.org_id=o.org_id AND ag.name::text='Scout'
WHERE o.slug::text='comind'
  AND NOT EXISTS (
    SELECT 1 FROM comind.cm_foundry_agent_profile p
    WHERE p.actor_id=a.actor_id OR p.agent_id=ag.agent_id
  );

COMMIT;
SQL

fixture_state="$(psql "${DATABASE_URL}" -X -At -F '|' -c "
  SELECT a.handle::text,p.status,p.authority_floor,p.authority_ceiling,p.activated_at,
         ag.config->>'control_id',
         coalesce((ag.config->>'paid_provider_authorized')::boolean,false),
         coalesce((ag.config->>'production_mutation_authorized')::boolean,false),
         (SELECT count(*) FROM comind.cm_foundry_capability_grant g
           WHERE g.profile_id=p.profile_id
             AND g.revoked_at IS NULL
             AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp()))
  FROM comind.cm_actor a
  JOIN comind.cm_foundry_agent_profile p ON p.actor_id=a.actor_id
  JOIN comind.cm_agent ag ON ag.agent_id=p.agent_id
  WHERE a.handle::text='agent.scout';")"
[[ "${fixture_state}" == "agent.scout|draft|C0|C1||SCOUT-001|f|f|0" ]]

first_registration="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/scripts/provision_scout_002_c1_research_package.sql")"
second_registration="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/scripts/provision_scout_002_c1_research_package.sql")"

validate_registration_state() {
  local label="$1"
  local state="$2"
  local actor_handle profile_id status authority_floor authority_ceiling activated_at
  local capability_code action target_kind max_authority risk_class cost_bearing adapter active_grants extra

  IFS='|' read -r actor_handle profile_id status authority_floor authority_ceiling activated_at \
    capability_code action target_kind max_authority risk_class cost_bearing adapter active_grants extra <<< "${state}"

  if [[ "${actor_handle}" != "agent.scout" \
     || ! "${profile_id}" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ \
     || "${status}" != "draft" \
     || "${authority_floor}" != "C0" \
     || "${authority_ceiling}" != "C1" \
     || -n "${activated_at}" \
     || "${capability_code}" != "research.evidence.synthesize" \
     || "${action}" != "synthesize_evidence" \
     || "${target_kind}" != "research_assignment" \
     || "${max_authority}" != "C1" \
     || "${risk_class}" != "low" \
     || "${cost_bearing}" != "f" \
     || "${adapter}" != "ollama_local" \
     || "${active_grants}" != "0" \
     || -n "${extra}" ]]; then
    echo "SCOUT-002 ${label} returned unexpected state: ${state}" >&2
    exit 1
  fi

  printf '%s' "${profile_id}"
}

first_profile_id="$(validate_registration_state 'first registration' "${first_registration}")"
second_profile_id="$(validate_registration_state 'idempotent replay' "${second_registration}")"
if [[ "${first_profile_id}" != "${second_profile_id}" ]]; then
  echo "SCOUT-002 idempotent replay changed Scout profile_id: ${first_profile_id} -> ${second_profile_id}" >&2
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
