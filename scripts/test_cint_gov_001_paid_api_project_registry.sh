#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for isolated CINT-GOV-001 verification." >&2
  exit 2
fi

DATABASE_URL="${DATABASE_URL}" python3 <<'PY'
import os
import sys
from urllib.parse import urlparse

parsed = urlparse(os.environ['DATABASE_URL'])
allowed_hosts = {'localhost', '127.0.0.1', '::1', 'db'}
if parsed.scheme not in {'postgres', 'postgresql'}:
    print('CINT-GOV-001 verification requires a PostgreSQL URL.', file=sys.stderr)
    raise SystemExit(2)
if parsed.hostname not in allowed_hosts or parsed.path != '/comind_ci':
    print('Refusing CINT-GOV-001 verification outside local isolated comind_ci.', file=sys.stderr)
    raise SystemExit(2)
PY

database_name="$(psql "${DATABASE_URL}" -X -Atc 'SELECT current_database();')"
if [[ "${database_name}" != "comind_ci" ]]; then
  echo "Refusing CINT-GOV-001 verification outside comind_ci." >&2
  exit 2
fi

printf 'Reconstructing Foundry and FinOps prerequisites...\n'
bash "${repository_root}/scripts/test_foundry_agent_substrate.sh"

printf 'Applying PM ledger prerequisites...\n'
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261006_001_comind_pm_ledger.sql"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261006_002_comind_pm_ledger_hardening.sql"

printf 'Applying CINT-GOV-001 base migration twice to prove replay safety...\n'
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261027_008_cint_paid_api_project_registry.sql"
done

printf 'Applying CINT-GOV-001 hardening migration twice to prove replay safety...\n'
for _ in 1 2; do
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
    -f "${repository_root}/db/migrations/20261027_009_cint_paid_api_project_registry_hardening.sql"
done

printf 'Running structural and privilege verification...\n'
verification_output="$(psql "${DATABASE_URL}" -X -q -At -F '|' -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/verify_20261027_008_cint_paid_api_project_registry.sql")"
verification_status="${verification_output%%|*}"
if [[ "${verification_status}" != "pass" ]]; then
  echo "CINT-GOV-001 verification failed: ${verification_output}" >&2
  exit 1
fi

printf 'Running bounded behavior checks...\n'
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

DO $$
DECLARE
    v_project_id uuid;
    v_legacy_finops_project_id uuid;
    v_provider_id bigint;
    v_provider_code text;
    v_proposal_id uuid;
    v_envelope_id bigint;
    v_binding_id uuid;
    v_reservation_id bigint;
    v_execution_id uuid;
    v_update_rejected boolean := false;
    v_delete_rejected boolean := false;
    v_cap_mismatch_rejected boolean := false;
    v_execution_identity_rejected boolean := false;
    v_execution_delete_rejected boolean := false;
    v_policy_update_rejected boolean := false;
BEGIN
    SELECT project_id INTO v_project_id
    FROM comind.cm_project
    WHERE project_code = 'CINT'::citext;

    INSERT INTO public.projects DEFAULT VALUES
    RETURNING id INTO v_legacy_finops_project_id;

    SELECT id, provider_code INTO v_provider_id, v_provider_code
    FROM public.comind_service_providers
    WHERE provider_code = 'openai';

    IF v_project_id IS NULL OR v_legacy_finops_project_id IS NULL OR v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Synthetic behavior check requires canonical CINT, legacy FinOps project, and OpenAI provider fixtures';
    END IF;

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
        v_project_id,
        'Synthetic isolated verification only',
        'Prove approved scope, founder cap, and execution evidence are fail-closed without making any provider call',
        jsonb_build_array(
            'approved scope cannot be silently changed',
            'runtime hard limit cannot exceed founder-approved cap',
            'reconciled receipts cannot be rewritten'
        ),
        v_provider_id,
        'synthetic-model',
        'https://example.invalid/cint-gov-001-pricing-fixture',
        'synthetic-isolated-fixture',
        now(),
        jsonb_build_object('fixture', true, 'input_per_million', 1, 'output_per_million', 2),
        0.00100000,
        0.00200000,
        'USD',
        1,
        1000,
        1000,
        2000,
        0,
        0,
        jsonb_build_array('stop after one request'),
        'approved',
        'synthetic_test',
        'ci:cint-gov-001',
        now()
    )
    RETURNING proposal_id INTO v_proposal_id;

    BEGIN
        UPDATE comind.cm_paid_api_access_proposal
        SET max_spend = 1.00000000
        WHERE proposal_id = v_proposal_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_update_rejected := true;
    END;
    IF NOT v_update_rejected THEN
        RAISE EXCEPTION 'Approved proposal scope mutation was not rejected';
    END IF;

    BEGIN
        DELETE FROM comind.cm_paid_api_access_proposal
        WHERE proposal_id = v_proposal_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_delete_rejected := true;
    END;
    IF NOT v_delete_rejected THEN
        RAISE EXCEPTION 'Approved proposal deletion was not rejected';
    END IF;

    INSERT INTO public.comind_workflow_cost_envelopes (
        project_id,
        objective,
        environment,
        capability_level,
        estimated_cost,
        soft_limit_amount,
        hard_limit_amount,
        actual_cost,
        reserved_cost,
        currency,
        max_iterations,
        max_duration_seconds,
        permitted_provider_codes,
        stop_conditions,
        status
    ) VALUES (
        v_legacy_finops_project_id,
        'Synthetic CINT-GOV-001 cap-dominance verification',
        'test',
        1,
        0.00100000,
        0.00900000,
        0.01000000,
        0,
        0,
        'USD',
        1,
        300,
        jsonb_build_array(v_provider_code),
        jsonb_build_array('single synthetic reservation only'),
        'authorized'
    )
    RETURNING id INTO v_envelope_id;

    INSERT INTO comind.cm_budget_authority_binding (
        envelope_id,
        workflow_run_id,
        execution_kind,
        project_id
    ) VALUES (
        v_envelope_id,
        gen_random_uuid(),
        'workflow',
        v_project_id
    )
    RETURNING binding_id INTO v_binding_id;

    SELECT reservation_id
    INTO v_reservation_id
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        NULL,
        'cint_gov_001_synthetic',
        'cint-gov-001:synthetic:reservation',
        0.00100000,
        now() + interval '10 minutes'
    )
    WHERE approved;

    IF v_reservation_id IS NULL THEN
        RAISE EXCEPTION 'Synthetic paid-provider reservation was not approved';
    END IF;

    INSERT INTO comind.cm_budget_authority_reservation (
        reservation_id,
        binding_id,
        provider_code,
        operation_name,
        execution_role,
        idempotency_key
    ) VALUES (
        v_reservation_id,
        v_binding_id,
        v_provider_code,
        'cint_gov_001_synthetic',
        'cint_governance_test',
        'cint-gov-001:synthetic:reservation'
    );

    BEGIN
        INSERT INTO comind.cm_paid_api_execution (
            proposal_id,
            binding_id,
            reservation_id,
            execution_status,
            currency
        ) VALUES (
            v_proposal_id,
            v_binding_id,
            v_reservation_id,
            'authorized',
            'USD'
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_cap_mismatch_rejected := true;
    END;
    IF NOT v_cap_mismatch_rejected THEN
        RAISE EXCEPTION 'Runtime envelope above founder-approved max spend was not rejected';
    END IF;

    UPDATE public.comind_workflow_cost_envelopes
    SET soft_limit_amount = 0.00150000,
        hard_limit_amount = 0.00200000
    WHERE id = v_envelope_id;

    INSERT INTO comind.cm_paid_api_execution (
        proposal_id,
        binding_id,
        reservation_id,
        execution_status,
        currency
    ) VALUES (
        v_proposal_id,
        v_binding_id,
        v_reservation_id,
        'authorized',
        'USD'
    )
    RETURNING execution_id INTO v_execution_id;

    UPDATE comind.cm_paid_api_execution
    SET execution_status = 'reconciled',
        requests_made = 1,
        retries_used = 0,
        actual_input_tokens = 100,
        actual_output_tokens = 40,
        actual_total_tokens = 140,
        tool_calls_made = 0,
        actual_expense = 0.00014000,
        provider_reported_expense = 0.00014000,
        started_at = now(),
        completed_at = now(),
        reconciled_at = now()
    WHERE execution_id = v_execution_id;

    BEGIN
        UPDATE comind.cm_paid_api_execution
        SET attempt_number = 2
        WHERE execution_id = v_execution_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_execution_identity_rejected := true;
    END;
    IF NOT v_execution_identity_rejected THEN
        RAISE EXCEPTION 'Execution identity mutation was not rejected';
    END IF;

    BEGIN
        DELETE FROM comind.cm_paid_api_execution
        WHERE execution_id = v_execution_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_execution_delete_rejected := true;
    END;
    IF NOT v_execution_delete_rejected THEN
        RAISE EXCEPTION 'Execution receipt deletion was not rejected';
    END IF;

    BEGIN
        UPDATE comind.cm_agent_operating_policy
        SET acceptance_status = 'accepted'
        WHERE policy_key = 'CINT-OPS-001'
          AND policy_version = '0.2';
    EXCEPTION
        WHEN OTHERS THEN
            v_policy_update_rejected := true;
    END;
    IF NOT v_policy_update_rejected THEN
        RAISE EXCEPTION 'Agent operating policy revision mutation was not rejected';
    END IF;
END;
$$;

ROLLBACK;
SQL

printf 'CINT-GOV-001 verification passed: %s\n' "${verification_output}"
