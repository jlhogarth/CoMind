-- Verification for Issue #59 telemetry-role hardening.
-- Runs only inside the isolated comind_ci harness after adapter migrations 002 through 005.

BEGIN;

DO $$
DECLARE
    v_org_id UUID;
    v_project_id UUID;
    v_conversation_id UUID;
    v_envelope_id BIGINT;
    v_binding_id UUID;
    v_reservation_id BIGINT;
    v_message_id UUID;
    v_approved BOOLEAN;
    v_status TEXT;
    v_accounted NUMERIC(24,12);
    v_idempotent BOOLEAN;
    v_reserved NUMERIC(24,12);
    v_actual NUMERIC(24,12);
    v_count INTEGER;
    v_failed_closed BOOLEAN;
BEGIN
    IF current_database() <> 'comind_ci' THEN
        RAISE EXCEPTION 'Telemetry-role verification refuses to run outside comind_ci';
    END IF;

    INSERT INTO comind.cm_org (name, slug)
    VALUES (
        'Issue 59 role org ' || gen_random_uuid()::text,
        'issue59-role-' || replace(gen_random_uuid()::text, '-', '')
    ) RETURNING org_id INTO v_org_id;

    INSERT INTO comind.cm_project (org_id, title)
    VALUES (v_org_id, 'Issue 59 role project')
    RETURNING project_id INTO v_project_id;

    INSERT INTO comind.cm_conversation (org_id, project_id, source, title)
    VALUES (v_org_id, v_project_id, 'live', 'Issue 59 telemetry-role conversation')
    RETURNING conv_id INTO v_conversation_id;

    INSERT INTO public.comind_workflow_cost_envelopes (
        objective, environment, capability_level, estimated_cost,
        soft_limit_amount, hard_limit_amount, permitted_provider_codes,
        max_iterations, max_duration_seconds, status
    ) VALUES (
        'Issue 59 telemetry-role verifier', 'test', 2, 0,
        0.800000000000, 1.000000000000, '["openai"]'::jsonb,
        10, 600, 'authorized'
    ) RETURNING id INTO v_envelope_id;

    SELECT comind.cm_bind_budget_authority_envelope(
        v_envelope_id,
        'conversation',
        v_project_id,
        NULL,
        NULL,
        NULL,
        v_conversation_id
    ) INTO v_binding_id;

    SELECT reservation_id, approved
    INTO v_reservation_id, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id,
        'openai',
        'assistant-quality-draft',
        'draft',
        'issue59-role-draft-' || v_envelope_id,
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );

    IF NOT v_approved THEN
        RAISE EXCEPTION 'Could not reserve telemetry-role fixture';
    END IF;

    INSERT INTO comind.cm_message (conv_id, role, content, meta)
    VALUES (
        v_conversation_id,
        'assistant',
        'Issue 59 telemetry-role fixture',
        jsonb_build_object(
            'provider', 'openai',
            'status', 'succeeded',
            'quality_gate', jsonb_build_object(
                'passes', jsonb_build_array(
                    jsonb_build_object(
                        'role', 'draft',
                        'provider', 'openai',
                        'status', 'succeeded',
                        'response_id', 'resp-role-draft-' || v_envelope_id,
                        'cost', jsonb_build_object(
                            'estimated_cost_usd', 0.010000000000,
                            'currency', 'USD',
                            'rate_card_version', 'openai-2026-10-07',
                            'pricing_source', 'https://developers.openai.com/api/docs/pricing'
                        )
                    ),
                    jsonb_build_object(
                        'role', 'verifier',
                        'provider', 'openai',
                        'status', 'succeeded',
                        'response_id', 'resp-role-verifier-' || v_envelope_id,
                        'cost', jsonb_build_object(
                            'estimated_cost_usd', 0.020000000000,
                            'currency', 'USD',
                            'rate_card_version', 'openai-2026-10-07',
                            'pricing_source', 'https://developers.openai.com/api/docs/pricing'
                        )
                    ),
                    jsonb_build_object('role', 'final', 'source_role', 'draft')
                )
            )
        )
    ) RETURNING msg_id INTO v_message_id;

    v_failed_closed := FALSE;
    BEGIN
        PERFORM * FROM comind.cm_finalize_paid_provider_message_execution(
            v_reservation_id,
            v_message_id,
            'quality_gate.passes.verifier',
            'role_mismatch_must_fail'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Reserved execution role draft conflicts with telemetry role verifier' THEN
            v_failed_closed := TRUE;
        ELSE
            RAISE;
        END IF;
    END;

    IF NOT v_failed_closed THEN
        RAISE EXCEPTION 'Draft reservation incorrectly settled verifier telemetry';
    END IF;

    SELECT status INTO v_status
    FROM public.comind_cost_reservations
    WHERE id = v_reservation_id;
    IF v_status <> 'reserved' THEN
        RAISE EXCEPTION 'Role mismatch changed reservation state to %', v_status;
    END IF;

    SELECT actual_cost, reserved_cost
    INTO v_actual, v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;
    IF v_actual <> 0 OR v_reserved <> 0.200000000000 THEN
        RAISE EXCEPTION 'Role mismatch changed accounting: actual=%, reserved=%', v_actual, v_reserved;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM comind.cm_budget_authority_telemetry
    WHERE reservation_id = v_reservation_id;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Role mismatch created telemetry provenance';
    END IF;

    SELECT reservation_status, accounted_cost, idempotent
    INTO v_status, v_accounted, v_idempotent
    FROM comind.cm_finalize_paid_provider_message_execution(
        v_reservation_id,
        v_message_id,
        'quality_gate.passes.draft',
        'runtime_message_telemetry_settlement'
    );

    IF v_status <> 'finalized' OR v_accounted <> 0.010000000000 OR v_idempotent THEN
        RAISE EXCEPTION 'Correct draft telemetry did not settle after rejected mismatch';
    END IF;

    SELECT actual_cost, reserved_cost
    INTO v_actual, v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;
    IF v_actual <> 0.010000000000 OR v_reserved <> 0 THEN
        RAISE EXCEPTION 'Correct role settlement totals are inconsistent: actual=%, reserved=%', v_actual, v_reserved;
    END IF;
END;
$$;

ROLLBACK;

SELECT 'Current-runtime budget authority telemetry-role hardening verification passed' AS verification_result;
