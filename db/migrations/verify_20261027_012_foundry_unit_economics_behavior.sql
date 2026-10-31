-- CINT-GOV-001 bounded behavior proof for unit economics and API cost receipts.
-- All fixtures are synthetic and rolled back. No provider call is made.

BEGIN;

DO $$
DECLARE
    v_project_id uuid;
    v_legacy_finops_project_id uuid;
    v_provider_id bigint;
    v_provider_code text;
    v_task_id uuid;
    v_proposal_id uuid;
    v_envelope_id bigint;
    v_binding_id uuid;
    v_reservation_id bigint;
    v_context_id uuid;
    v_execution_id uuid;
    v_receipt_id uuid;
    v_receipt_number text;
    v_invoice_id uuid;
    v_count integer;
    v_deliverable_count integer;
    v_numeric numeric;
    v_secondary_numeric numeric;
    v_rate numeric;
    v_bool boolean;
    v_overallocation_rejected boolean := false;
    v_receipt_mutation_rejected boolean := false;
BEGIN
    SELECT project_id INTO v_project_id
    FROM comind.cm_project
    WHERE project_code = 'CINT'::citext;

    INSERT INTO public.projects DEFAULT VALUES
    RETURNING id INTO v_legacy_finops_project_id;

    SELECT id, provider_code
    INTO v_provider_id, v_provider_code
    FROM public.comind_service_providers
    WHERE provider_code = 'openai';

    IF v_project_id IS NULL OR v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Unit-economics proof requires CINT project and OpenAI provider fixtures';
    END IF;

    INSERT INTO comind.cm_task (
        project_id, title, description, status, priority
    ) VALUES (
        v_project_id,
        'Synthetic CINT unit-economics task',
        'Transactionally isolated proof only',
        'in_progress',
        1
    ) RETURNING task_id INTO v_task_id;

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
        'Synthetic isolated unit-economics verification',
        'Prove immediate internal receipt generation and correct task/model/deliverable economics',
        jsonb_build_array('one reconciled execution produces one immutable internal receipt'),
        v_provider_id,
        'synthetic-unit-economics-model',
        'https://example.invalid/cint-unit-economics-pricing',
        'synthetic-fixture',
        now(),
        jsonb_build_object('fixture', true),
        0.00400000,
        0.01000000,
        'USD',
        1,
        1000,
        1000,
        2000,
        2,
        0,
        jsonb_build_array('one synthetic execution only'),
        'approved',
        'synthetic_test',
        'ci:cint-gov-001:unit-economics',
        now()
    ) RETURNING proposal_id INTO v_proposal_id;

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
        'Synthetic CINT unit-economics verification',
        'test',
        1,
        0.00400000,
        0.00800000,
        0.01000000,
        0,
        0,
        'USD',
        1,
        300,
        jsonb_build_array(v_provider_code),
        jsonb_build_array('one synthetic execution only'),
        'authorized'
    ) RETURNING id INTO v_envelope_id;

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
    ) RETURNING binding_id INTO v_binding_id;

    SELECT reservation_id
    INTO v_reservation_id
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        NULL,
        'cint_unit_economics_synthetic',
        'cint-gov-001:unit-economics:reservation',
        0.00400000,
        now() + interval '10 minutes'
    )
    WHERE approved;

    IF v_reservation_id IS NULL THEN
        RAISE EXCEPTION 'Synthetic unit-economics cost reservation was not approved';
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
        'cint_unit_economics_synthetic',
        'cint_unit_economics_test',
        'cint-gov-001:unit-economics:reservation'
    );

    INSERT INTO comind.cm_foundry_execution_context (
        project_id,
        task_id,
        budget_binding_id,
        environment,
        execution_kind,
        idempotency_key,
        context
    ) VALUES (
        v_project_id,
        v_task_id,
        v_binding_id,
        'isolated',
        'verification',
        'cint-gov-001:unit-economics:context',
        jsonb_build_object('synthetic', true, 'provider_call', false)
    ) RETURNING execution_context_id INTO v_context_id;

    INSERT INTO comind.cm_paid_api_execution (
        proposal_id,
        binding_id,
        reservation_id,
        foundry_execution_context_id,
        execution_status,
        currency
    ) VALUES (
        v_proposal_id,
        v_binding_id,
        v_reservation_id,
        v_context_id,
        'authorized',
        'USD'
    ) RETURNING execution_id INTO v_execution_id;

    INSERT INTO comind.cm_foundry_execution_outcome (
        execution_context_id,
        terminal_status,
        summary
    ) VALUES (
        v_context_id,
        'succeeded',
        'Synthetic unit-economics proof succeeded without any provider call.'
    );

    UPDATE comind.cm_task
    SET status = 'done', updated_at = now()
    WHERE task_id = v_task_id;

    UPDATE comind.cm_paid_api_execution
    SET execution_status = 'reconciled',
        requests_made = 1,
        retries_used = 0,
        actual_input_tokens = 120,
        actual_cached_input_tokens = 20,
        actual_output_tokens = 50,
        actual_reasoning_tokens = 10,
        actual_total_tokens = 180,
        tool_calls_made = 1,
        actual_expense = 0.00400000,
        provider_reported_expense = 0.00400000,
        provider_event_id = 'synthetic-provider-event',
        started_at = now(),
        completed_at = now(),
        reconciled_at = now()
    WHERE execution_id = v_execution_id;

    SELECT receipt_id, receipt_number
    INTO v_receipt_id, v_receipt_number
    FROM comind.cm_api_cost_receipt
    WHERE execution_id = v_execution_id;

    IF v_receipt_id IS NULL OR v_receipt_number !~ '^COMIND-API-[0-9]{8}-[0-9]{10}$' THEN
        RAISE EXCEPTION 'Reconciled paid execution did not immediately create a valid internal API cost receipt';
    END IF;

    SELECT count(*) INTO v_count
    FROM comind.cm_api_cost_receipt
    WHERE execution_id = v_execution_id
      AND task_id = v_task_id
      AND actual_cost = 0.00400000
      AND model_or_service = 'synthetic-unit-economics-model'
      AND drive_sync_status = 'pending';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Internal API cost receipt did not preserve expected task/model/cost/sync facts';
    END IF;

    BEGIN
        UPDATE comind.cm_api_cost_receipt
        SET actual_cost = 1.00000000
        WHERE receipt_id = v_receipt_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_receipt_mutation_rejected := true;
    END;
    IF NOT v_receipt_mutation_rejected THEN
        RAISE EXCEPTION 'Internal API receipt financial mutation was not rejected';
    END IF;

    UPDATE comind.cm_api_cost_receipt
    SET drive_sync_status = 'synced',
        drive_register_file_id = 'synthetic-sheet-id',
        drive_row_key = v_receipt_number,
        drive_synced_at = now()
    WHERE receipt_id = v_receipt_id;

    INSERT INTO comind.cm_foundry_escalation_event (
        project_id, task_id, execution_context_id, escalation_type,
        from_provider_id, from_model_or_service, to_provider_id, to_model_or_service,
        reason, estimated_cost_delta, actual_incremental_cost, currency,
        outcome, source_ref, reconciled_at
    ) VALUES
    (
        v_project_id, v_task_id, v_context_id, 'model',
        v_provider_id, 'synthetic-small-model', v_provider_id, 'synthetic-unit-economics-model',
        'Synthetic model escalation for fanout-safe metrics proof',
        0.00100000, 0.00100000, 'USD', 'accepted',
        'ci:cint-gov-001:escalation:model', now()
    ),
    (
        v_project_id, v_task_id, v_context_id, 'authority',
        NULL, NULL, NULL, NULL,
        'Synthetic authority escalation for frequency proof',
        0, 0, 'USD', 'accepted',
        'ci:cint-gov-001:escalation:authority', now()
    );

    INSERT INTO comind.cm_foundry_deliverable_cost_allocation (
        execution_id, project_id, task_id, deliverable_ref, deliverable_type,
        source_url, allocation_fraction, allocation_basis, acceptance_status,
        produced_at, accepted_at
    ) VALUES
    (
        v_execution_id, v_project_id, v_task_id,
        'synthetic-deliverable-a', 'evidence',
        'https://example.invalid/deliverable-a',
        0.6000000000, 'synthetic direct allocation', 'accepted', now(), now()
    ),
    (
        v_execution_id, v_project_id, v_task_id,
        'synthetic-deliverable-b', 'report',
        'https://example.invalid/deliverable-b',
        0.4000000000, 'synthetic direct allocation', 'accepted', now(), now()
    );

    BEGIN
        INSERT INTO comind.cm_foundry_deliverable_cost_allocation (
            execution_id, project_id, task_id, deliverable_ref, deliverable_type,
            allocation_fraction, allocation_basis, acceptance_status, accepted_at
        ) VALUES (
            v_execution_id, v_project_id, v_task_id,
            'synthetic-deliverable-overallocation', 'report',
            0.0100000000, 'should fail because accepted allocation already totals 1.0',
            'accepted', now()
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_overallocation_rejected := true;
    END;
    IF NOT v_overallocation_rejected THEN
        RAISE EXCEPTION 'Deliverable allocation above 100 percent was not rejected';
    END IF;

    SELECT total_api_cost, successful_task, escalation_event_count, deliverable_count
    INTO v_numeric, v_bool, v_count, v_deliverable_count
    FROM comind.cm_foundry_task_economics_v
    WHERE task_id = v_task_id AND currency = 'USD';

    IF v_numeric IS DISTINCT FROM 0.00400000
       OR NOT v_bool
       OR v_count <> 2
       OR v_deliverable_count <> 2 THEN
        RAISE EXCEPTION 'Fanout-safe task economics mismatch: cost %, success %, escalations %, deliverables %',
            v_numeric, v_bool, v_count, v_deliverable_count;
    END IF;

    SELECT total_api_cost, cost_per_successful_task
    INTO v_numeric, v_secondary_numeric
    FROM comind.cm_foundry_model_economics_v
    WHERE project_id = v_project_id
      AND model_or_service = 'synthetic-unit-economics-model'
      AND currency = 'USD';

    IF v_numeric IS DISTINCT FROM 0.00400000
       OR v_secondary_numeric IS DISTINCT FROM 0.00400000 THEN
        RAISE EXCEPTION 'Model economics mismatch: total %, cost/success %', v_numeric, v_secondary_numeric;
    END IF;

    SELECT sum(allocated_api_cost)
    INTO v_numeric
    FROM comind.cm_foundry_deliverable_economics_v
    WHERE task_id = v_task_id AND currency = 'USD';
    IF v_numeric IS DISTINCT FROM 0.004000000000000000 THEN
        RAISE EXCEPTION 'Deliverable allocated cost did not reconcile to execution actual cost: %', v_numeric;
    END IF;

    SELECT cost_per_successful_task, cost_per_deliverable, escalation_event_count, paid_task_escalation_rate
    INTO v_numeric, v_secondary_numeric, v_count, v_rate
    FROM comind.cm_foundry_project_unit_economics_v
    WHERE project_id = v_project_id AND currency = 'USD';

    IF v_numeric IS DISTINCT FROM 0.00400000
       OR v_secondary_numeric IS DISTINCT FROM 0.00200000
       OR v_count <> 2
       OR v_rate IS DISTINCT FROM 1.00000000000000000000 THEN
        RAISE EXCEPTION 'Project unit economics mismatch: successful task %, deliverable %, escalations %, escalation rate %',
            v_numeric, v_secondary_numeric, v_count, v_rate;
    END IF;

    INSERT INTO comind.cm_provider_invoice (
        provider_id,
        invoice_number,
        billing_period_start,
        billing_period_end,
        issued_at,
        currency,
        subtotal,
        tax_amount,
        total_amount,
        official_source_url,
        reconciliation_status,
        notes
    ) VALUES (
        v_provider_id,
        'SYNTHETIC-INVOICE-001',
        current_date,
        current_date,
        now(),
        'USD',
        0.00400000,
        0,
        0.00400000,
        'https://example.invalid/provider-invoice',
        'reconciled',
        'Synthetic fixture only'
    ) RETURNING provider_invoice_id INTO v_invoice_id;

    INSERT INTO comind.cm_provider_invoice_receipt_link (
        provider_invoice_id, receipt_id, matched_amount, currency, notes
    ) VALUES (
        v_invoice_id, v_receipt_id, 0.00400000, 'USD', 'Synthetic exact reconciliation'
    );

    SELECT reconciliation_delta
    INTO v_numeric
    FROM comind.cm_provider_invoice_reconciliation_v
    WHERE provider_invoice_id = v_invoice_id;
    IF v_numeric IS DISTINCT FROM 0.00000000 THEN
        RAISE EXCEPTION 'Provider invoice did not reconcile to internal receipt: delta %', v_numeric;
    END IF;

    SELECT count(*) INTO v_count
    FROM comind.cm_unattributed_paid_usage_v;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Synthetic isolated proof unexpectedly contains unattributed positive-cost usage: %', v_count;
    END IF;
END;
$$;

ROLLBACK;

SELECT
    'pass' AS status,
    'Automatic API receipt generation, Foundry task/model/project economics, escalation frequency, deliverable allocation, invoice reconciliation, and fanout protection verified' AS detail;
