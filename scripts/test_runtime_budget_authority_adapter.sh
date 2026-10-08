#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated runtime budget-adapter verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('Runtime budget-adapter verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing runtime budget-adapter verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

database_name="$(psql "${DATABASE_URL}" -X -Atc "SELECT current_database();")"
if [[ "${database_name}" != "comind_ci" ]]; then
  echo "Refusing runtime budget-adapter verification outside comind_ci." >&2
  exit 2
fi

(
  cd "${repository_root}/db/sql/v2"
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f MASTER.sql
)

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/test/finops_budget_authority_prerequisites.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20260910_001_comind_finops_resource_governor.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_001_paid_provider_budget_authority_hardening.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_002_current_runtime_budget_authority_adapter.sql"

# Reapply the adapter migration to prove migration idempotency.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_002_current_runtime_budget_authority_adapter.sql"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261008_002_current_runtime_budget_authority_adapter.sql"

org_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO comind.cm_org (name, slug)
  VALUES (
    'Issue 59 race org ' || gen_random_uuid()::text,
    'issue59-race-' || replace(gen_random_uuid()::text, '-', '')
  ) RETURNING org_id;
")"

project_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO comind.cm_project (org_id, title)
  VALUES ('${org_id}'::uuid, 'Issue 59 race project')
  RETURNING project_id;
")"

conversation_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO comind.cm_conversation (org_id, project_id, source, title)
  VALUES ('${org_id}'::uuid, '${project_id}'::uuid, 'live', 'Issue 59 race conversation')
  RETURNING conv_id;
")"

envelope_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO public.comind_workflow_cost_envelopes (
    objective, environment, capability_level, estimated_cost,
    soft_limit_amount, hard_limit_amount, permitted_provider_codes,
    max_iterations, max_duration_seconds, status
  ) VALUES (
    'Issue 59 adapter concurrent reservation race',
    'test',
    2,
    0,
    0.800000000000,
    1.000000000000,
    '[\"openai\"]'::jsonb,
    4,
    300,
    'authorized'
  ) RETURNING id;
")"

binding_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  SELECT comind.cm_bind_budget_authority_envelope(
    ${envelope_id},
    'conversation',
    '${project_id}'::uuid,
    NULL,
    NULL,
    NULL,
    '${conversation_id}'::uuid
  );
")"

if [[ -z "${binding_id}" ]]; then
  echo "Runtime budget adapter did not create the race binding." >&2
  exit 1
fi

race_dir="$(mktemp -d)"
trap 'rm -rf "${race_dir}"' EXIT

reserve_one() {
  local key="$1"
  local output="$2"
  psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 >"${output}" <<SQL
SELECT approved::text || '|' || COALESCE(reservation_id::text, '') || '|' || COALESCE(reservation_status, '')
FROM comind.cm_reserve_paid_provider_execution(
  '${binding_id}'::uuid,
  'openai',
  'concurrent-provider-call',
  'runtime.race',
  '${key}',
  0.600000000000,
  NOW() + INTERVAL '5 minutes'
);
SQL
}

reserve_one 'issue59-race-a' "${race_dir}/a.out" &
pid_a=$!
reserve_one 'issue59-race-b' "${race_dir}/b.out" &
pid_b=$!

wait "${pid_a}"
wait "${pid_b}"

mapfile -t race_results < <(cat "${race_dir}/a.out" "${race_dir}/b.out" | sed '/^[[:space:]]*$/d')

if [[ "${#race_results[@]}" -ne 2 ]]; then
  printf 'Expected two concurrent adapter reservation results, got %s\n' "${#race_results[@]}" >&2
  printf '%s\n' "${race_results[@]}" >&2
  exit 1
fi

approved_count="$(printf '%s\n' "${race_results[@]}" | grep -c '^true|' || true)"
denied_count="$(printf '%s\n' "${race_results[@]}" | grep -c '^false|' || true)"

if [[ "${approved_count}" -ne 1 || "${denied_count}" -ne 1 ]]; then
  echo "Concurrent adapter reservations did not serialize to exactly one approval and one denial." >&2
  printf '%s\n' "${race_results[@]}" >&2
  exit 1
fi

race_state="$(psql "${DATABASE_URL}" -X -Atc "
  SELECT
    e.reserved_cost::text || '|' ||
    e.actual_cost::text || '|' ||
    e.hard_limit_amount::text || '|' ||
    COALESCE(e.project_id::text, '') || '|' ||
    COALESCE(e.owner_agent_id::text, '') || '|' ||
    (SELECT COUNT(*) FROM public.comind_cost_reservations r
      WHERE r.envelope_id = e.id AND r.status = 'reserved')::text || '|' ||
    (SELECT COUNT(*) FROM comind.cm_budget_authority_reservation ar
      JOIN public.comind_cost_reservations r ON r.id = ar.reservation_id
      WHERE r.envelope_id = e.id)::text || '|' ||
    (SELECT COUNT(*) FROM public.comind_cost_reservation_events ev
      WHERE ev.envelope_id = e.id AND ev.event_type = 'reserved')::text
  FROM public.comind_workflow_cost_envelopes e
  WHERE e.id = ${envelope_id};
")"

IFS='|' read -r reserved_cost actual_cost hard_limit legacy_project legacy_agent reservation_count adapter_link_count event_count <<<"${race_state}"

if [[ "${reserved_cost}" != "0.600000000000" \
   || "${actual_cost}" != "0.000000000000" \
   || "${hard_limit}" != "1.000000000000" \
   || -n "${legacy_project}" \
   || -n "${legacy_agent}" \
   || "${reservation_count}" != "1" \
   || "${adapter_link_count}" != "1" \
   || "${event_count}" != "1" ]]; then
  echo "Concurrent adapter accounting or provenance is inconsistent: ${race_state}" >&2
  exit 1
fi

oversubscribed="$(psql "${DATABASE_URL}" -X -Atc "
  SELECT CASE WHEN actual_cost + reserved_cost > hard_limit_amount THEN 'true' ELSE 'false' END
  FROM public.comind_workflow_cost_envelopes
  WHERE id = ${envelope_id};
")"

if [[ "${oversubscribed}" != "false" ]]; then
  echo "Concurrent adapter reservations oversubscribed the hard budget." >&2
  exit 1
fi

printf 'Current-runtime budget authority adapter verification passed. Race results: %s ; %s\n' \
  "${race_results[0]}" "${race_results[1]}"
