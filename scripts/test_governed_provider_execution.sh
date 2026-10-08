#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated governed provider verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('Governed provider verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing governed provider verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

if [[ ! -f "${repository_root}/server/dist/providers/governed-provider-execution.js" ]]; then
  echo "Build server TypeScript before governed provider verification." >&2
  exit 2
fi

bash "${repository_root}/scripts/test_runtime_budget_authority_adapter.sh"

org_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO comind.cm_org (name, slug)
  VALUES (
    'Issue 68 governed execution org ' || gen_random_uuid()::text,
    'issue68-governed-' || replace(gen_random_uuid()::text, '-', '')
  ) RETURNING org_id;
")"

project_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO comind.cm_project (org_id, title)
  VALUES ('${org_id}'::uuid, 'Issue 68 governed execution project')
  RETURNING project_id;
")"

conversation_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO comind.cm_conversation (org_id, project_id, source, title)
  VALUES (
    '${org_id}'::uuid,
    '${project_id}'::uuid,
    'live',
    'Issue 68 governed execution conversation'
  ) RETURNING conv_id;
")"

envelope_id="$(psql "${DATABASE_URL}" -X -Atq -v ON_ERROR_STOP=1 -c "
  INSERT INTO public.comind_workflow_cost_envelopes (
    objective, environment, capability_level, estimated_cost,
    soft_limit_amount, hard_limit_amount, permitted_provider_codes,
    max_iterations, max_duration_seconds, status
  ) VALUES (
    'Issue 68 governed provider execution isolated proof',
    'test',
    2,
    0,
    0.008000000000,
    0.010000000000,
    '[\"openai\"]'::jsonb,
    16,
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

if [[ -z "${binding_id}" || -z "${conversation_id}" ]]; then
  echo "Governed provider verification fixture did not create runtime identities." >&2
  exit 1
fi

(
  cd "${repository_root}/server"
  COMIND_TEST_BINDING_ID="${binding_id}" \
  COMIND_TEST_CONVERSATION_ID="${conversation_id}" \
  node --test test/integration/governed-provider-execution.test.mjs
)

printf 'Governed provider execution verification passed for binding %s.\n' "${binding_id}"
