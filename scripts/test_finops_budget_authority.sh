#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated budget-authority verification." >&2
  exit 2
fi

connection_identity="$(psql "${DATABASE_URL}" -X -Atc "SELECT current_database() || '|' || inet_server_addr()::text;")"
database_name="${connection_identity%%|*}"
server_address="${connection_identity#*|}"

if [[ "${database_name}" != "comind_ci" ]]; then
  echo "Refusing budget-authority verification outside comind_ci." >&2
  exit 2
fi

case "${server_address}" in
  127.0.0.1|::1)
    ;;
  *)
    echo "Refusing budget-authority verification against a non-local PostgreSQL server." >&2
    exit 2
    ;;
esac

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/test/finops_budget_authority_prerequisites.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20260910_001_comind_finops_resource_governor.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_001_paid_provider_budget_authority_hardening.sql"

# Prove the hardening migration itself is safe to reapply.
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_001_paid_provider_budget_authority_hardening.sql"

psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261008_001_paid_provider_budget_authority_hardening.sql"

provider_id="$(psql "${DATABASE_URL}" -X -Atc "SELECT id FROM public.comind_service_providers WHERE provider_code = 'openai';")"
agent_id="$(psql "${DATABASE_URL}" -X -Atc "SELECT id FROM public.agents WHERE name = 'FinOps and Resource Governor' ORDER BY id LIMIT 1;")"

if [[ -z "${provider_id}" || -z "${agent_id}" ]]; then
  echo "Required FinOps provider or agent seed was not created." >&2
  exit 1
fi

envelope_id="$(psql "${DATABASE_URL}" -X -Atc "
  INSERT INTO public.comind_workflow_cost_envelopes (
    owner_agent_id, objective, environment, capability_level,
    estimated_cost, soft_limit_amount, hard_limit_amount,
    max_iterations, max_duration_seconds, status
  ) VALUES (
    '${agent_id}'::uuid,
    'Issue 57 concurrent reservation race',
    'test',
    2,
    0,
    0.800000000000,
    1.000000000000,
    4,
    300,
    'authorized'
  ) RETURNING id;
")"

race_dir="$(mktemp -d)"
trap 'rm -rf "${race_dir}"' EXIT

reserve_one() {
  local key="$1"
  local output="$2"
  psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 >"${output}" <<SQL
SELECT approved::text || '|' || COALESCE(reservation_id::text, '') || '|' || COALESCE(reservation_status, '')
FROM public.comind_reserve_paid_provider_cost(
  ${envelope_id},
  ${provider_id},
  '${agent_id}'::uuid,
  'concurrent-paid-call',
  '${key}',
  0.600000000000,
  NOW() + INTERVAL '5 minutes'
);
SQL
}

reserve_one 'issue57-race-a' "${race_dir}/a.out" &
pid_a=$!
reserve_one 'issue57-race-b' "${race_dir}/b.out" &
pid_b=$!

wait "${pid_a}"
wait "${pid_b}"

mapfile -t race_results < <(cat "${race_dir}/a.out" "${race_dir}/b.out" | sed '/^[[:space:]]*$/d')

if [[ "${#race_results[@]}" -ne 2 ]]; then
  printf 'Expected two concurrent reservation results, got %s\n' "${#race_results[@]}" >&2
  printf '%s\n' "${race_results[@]}" >&2
  exit 1
fi

approved_count="$(printf '%s\n' "${race_results[@]}" | grep -c '^true|' || true)"
denied_count="$(printf '%s\n' "${race_results[@]}" | grep -c '^false|' || true)"

if [[ "${approved_count}" -ne 1 || "${denied_count}" -ne 1 ]]; then
  echo "Concurrent reservations did not serialize to exactly one approval and one denial." >&2
  printf '%s\n' "${race_results[@]}" >&2
  exit 1
fi

race_state="$(psql "${DATABASE_URL}" -X -Atc "
  SELECT
    reserved_cost::text || '|' ||
    actual_cost::text || '|' ||
    hard_limit_amount::text || '|' ||
    (SELECT COUNT(*) FROM public.comind_cost_reservations
      WHERE envelope_id = ${envelope_id} AND status = 'reserved')::text || '|' ||
    (SELECT COUNT(*) FROM public.comind_cost_reservation_events
      WHERE envelope_id = ${envelope_id} AND event_type = 'reserved')::text
  FROM public.comind_workflow_cost_envelopes
  WHERE id = ${envelope_id};
")"

IFS='|' read -r reserved_cost actual_cost hard_limit reservation_count event_count <<<"${race_state}"

if [[ "${reserved_cost}" != "0.600000000000" \
   || "${actual_cost}" != "0.000000000000" \
   || "${hard_limit}" != "1.000000000000" \
   || "${reservation_count}" != "1" \
   || "${event_count}" != "1" ]]; then
  echo "Concurrent reservation accounting is inconsistent: ${race_state}" >&2
  exit 1
fi

oversubscribed="$(psql "${DATABASE_URL}" -X -Atc "
  SELECT CASE WHEN actual_cost + reserved_cost > hard_limit_amount THEN 'true' ELSE 'false' END
  FROM public.comind_workflow_cost_envelopes
  WHERE id = ${envelope_id};
")"

if [[ "${oversubscribed}" != "false" ]]; then
  echo "Concurrent reservations oversubscribed the hard budget." >&2
  exit 1
fi

printf 'Paid-provider budget authority verification passed. Race results: %s ; %s\n' \
  "${race_results[0]}" "${race_results[1]}"
