#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated CINT-FINOPS-003 verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('CINT-FINOPS-003 verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing CINT-FINOPS-003 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

printf 'Reconstructing accepted CINT governance and FinOps foundation...\n'
bash "${repository_root}/scripts/test_cint_gov_001_paid_api_project_registry.sh"

printf 'Applying stable CINT identity/reconciliation guards...\n'
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261027_010_cint_identity_reconciliation_guards.sql"
done
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261027_010_cint_identity_reconciliation_guards.sql"

printf 'Reconstructing accepted Foundry execution runtime before unit economics...\n'
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261008_008_foundry_runtime_orchestration.sql"

printf 'Applying CINT unit-economics and receipt substrate...\n'
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261027_011_foundry_unit_economics_and_api_cost_register.sql"
done
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261027_012_foundry_unit_economics_fanout_hardening.sql"
done
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261027_011_foundry_unit_economics_and_api_cost_register.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261027_012_foundry_unit_economics_behavior.sql"
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261027_014_cint_finops_fk_index_hardening.sql"
done

printf 'Applying CINT-FINOPS-003 runtime bridge twice to prove replay safety...\n'
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261028_001_cint_paid_api_runtime_bridge.sql"
done
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261028_001_cint_paid_api_runtime_bridge.sql"

printf 'Applying CINT-FINOPS-003 reconciliation observability twice to prove replay safety...\n'
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261028_002_cint_paid_api_reconciliation_observability.sql"
done
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261028_002_cint_paid_api_reconciliation_observability.sql"

printf 'Building server TypeScript...\n'
(
  cd "${repository_root}/server"
  npm run build
)

project_row="$(psql "${DATABASE_URL}" -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  SELECT project_id::text, org_id::text
  FROM comind.cm_project
  WHERE project_code = 'CINT'::citext;
")"
IFS='|' read -r project_id org_id <<<"${project_row}"

provider_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  SELECT id
  FROM public.comind_service_providers
  WHERE provider_code = 'openai' AND active;
")"

if [[ -z "${project_id}" || -z "${org_id}" || -z "${provider_id}" ]]; then
  echo "CINT-FINOPS-003 fixture requires canonical CINT project/org and active OpenAI provider." >&2
  exit 1
fi

conversation_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO comind.cm_conversation (org_id, project_id, source, title, metadata)
  VALUES (
    '${org_id}'::uuid,
    '${project_id}'::uuid,
    'synthetic_cint_finops_003',
    'CINT-FINOPS-003 isolated provider bridge integration proof',
    jsonb_build_object('synthetic', true, 'provider_call', false)
  ) RETURNING conv_id;
")"

envelope_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO public.comind_workflow_cost_envelopes (
    objective, environment, capability_level, estimated_cost,
    soft_limit_amount, hard_limit_amount, actual_cost, reserved_cost,
    currency, permitted_provider_codes, max_iterations,
    max_duration_seconds, stop_conditions, status
  ) VALUES (
    'CINT-FINOPS-003 isolated synthetic provider bridge proof',
    'test',
    2,
    0.000020000000,
    0.000500000000,
    0.001000000000,
    0,
    0,
    'USD',
    '[\"openai\"]'::jsonb,
    1,
    300,
    '[\"one synthetic execution only\"]'::jsonb,
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

proposal_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO comind.cm_paid_api_access_proposal (
    project_id,
    purpose,
    expected_benefit,
    success_criteria,
    provider_id,
    model_or_service,
    pricing_source_url,
    pricing_source_version,
    pricing_verified_at,
    pricing_snapshot,
    expected_cost,
    max_spend,
    currency,
    max_requests,
    max_input_tokens,
    max_output_tokens,
    max_total_tokens,
    max_tool_calls,
    max_retries,
    stop_conditions,
    proposal_status,
    approval_source_system,
    approval_source_ref,
    approved_at
  ) VALUES (
    '${project_id}'::uuid,
    'Synthetic isolated CINT-FINOPS-003 integration verification',
    'Prove one founder-scoped governed provider execution yields one attributable internal API cost receipt',
    '[\"one admitted execution\",\"one authoritative usage event\",\"one internal receipt\"]'::jsonb,
    ${provider_id},
    'gpt-6-luna',
    'https://example.invalid/cint-finops-003-pricing',
    'synthetic-fixture',
    now(),
    jsonb_build_object('synthetic', true),
    0.000020000000,
    0.001000000000,
    'USD',
    1,
    500,
    512,
    1012,
    0,
    0,
    '[\"one synthetic execution only\"]'::jsonb,
    'approved',
    'synthetic_test',
    'ci:cint-finops-003:integration',
    now()
  ) RETURNING proposal_id;
")"

if [[ -z "${binding_id}" || -z "${conversation_id}" || -z "${proposal_id}" ]]; then
  echo "CINT-FINOPS-003 integration fixture did not create required identities." >&2
  exit 1
fi

printf 'Running adapter unit tests...\n'
(
  cd "${repository_root}/server"
  node --test \
    test/current-runtime-paid-api-ledger.test.mjs \
    test/current-runtime-paid-api-settlement.test.mjs
)

printf 'Running isolated PostgreSQL provider bridge integration...\n'
(
  cd "${repository_root}/server"
  COMIND_CINT_FINOPS_BINDING_ID="${binding_id}" \
  COMIND_CINT_FINOPS_CONVERSATION_ID="${conversation_id}" \
  COMIND_CINT_FINOPS_PROPOSAL_ID="${proposal_id}" \
  node --test test/integration/cint-paid-provider-runtime-bridge.test.mjs
)

final_counts="$(psql "${DATABASE_URL}" -X -Atq -F '|' -v ON_ERROR_STOP=1 -c "
  SELECT
    (SELECT count(*) FROM comind.cm_paid_api_execution WHERE proposal_id='${proposal_id}'::uuid),
    (SELECT count(*)
       FROM comind.cm_api_cost_receipt r
       JOIN comind.cm_paid_api_execution e ON e.execution_id=r.execution_id
      WHERE e.proposal_id='${proposal_id}'::uuid),
    (SELECT count(*)
       FROM comind.cm_unattributed_paid_usage_v u
       JOIN public.comind_cost_reservations cr ON cr.id=u.reservation_id
      WHERE cr.envelope_id=${envelope_id}),
    (SELECT count(*)
       FROM comind.cm_paid_api_reconciliation_pending_v p
      WHERE p.proposal_id='${proposal_id}'::uuid);
")"

if [[ "${final_counts}" != "1|1|0|0" ]]; then
  echo "CINT-FINOPS-003 final evidence mismatch: ${final_counts}" >&2
  exit 1
fi

printf 'CINT-FINOPS-003 isolated provider runtime bridge verification passed: executions|receipts|unattributed|pending=%s\n' "${final_counts}"
