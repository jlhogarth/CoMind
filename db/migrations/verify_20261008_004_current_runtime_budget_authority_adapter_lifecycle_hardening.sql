-- Verification for Issue #59 lifecycle hardening.
-- Runs only inside the isolated comind_ci harness after adapter migrations 002 through 004.

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
    v_released NUMERIC(24,12);
    v_idempotent BOOLEAN;
    v_reserved NUMERIC(24,12);
    v_failed_closed BOOLEAN;
BEGIN
    IF current_database() <> 'comind_ci' THEN
        RAISE EXCEPTION 'Lifecycle verification refuses to run outside comind_ci';
    END IF;

    IF to_regprocedure('comind.cm_close_unspent_paid_provider_execution(bigint,text,text)') IS NULL THEN
        RAISE EXCEPTION 'Missing current-runtime unspent-close adapter function';
    END IF;

    INSERT INTO comind.cm_org (name, slug)
    VALUES (
        'Issue 59 lifecycle org ' || gen_random_uuid()::text,
        'issue59-lifecycle-' || replace(gen_random_uuid()::text, '-', '')
    ) RETURNING org_id INTO v_org_id;

    INSERT INTO comind.cm_project (org_id, title)
    VALUES (v_org_id, 'Issue 59 lifecycle project')
    RETURNING project_id INTO v_project_id;

    INSERT INTO comind.cm_conversation (org_id, project_id, source, title)
    VALUES (v_org_id, v_project_id, 'live', 'Issue 59 lifecycle conversation')
    RETURNING conv_id INTO v_conversation_id;

    INSERT INTO public.comind_workflow_cost_envelopes (
        objective, environment, capability_level, estimated_cost,
        soft_limit_amount, hard_limit_amount, permitted_provider_codes,
        max_iterations, max_duration_seconds, status
    ) VALUES (
        'Issue 59 lifecycle verifier', 'test', 2, 0,
        4.000000000000, 5.000000000000, '["openai"]'::jsonb,
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

    -- A quality-gated message must settle its individual provider passes, never root metadata.
    SELECT reservation_id, approved
    INTO v_reservation_id, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'quality-root-reject', 'draft',
        'issue59-quality-root-reject-' || v_envelope_id,
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );
    IF NOT v_approved THEN
        RAISE EXCEPTION 'Could not reserve quality-root rejection fixture';
    END IF;

    INSERT INTO comind.cm_message (conv_id, role, content, meta)
    VALUES (
        v_conversation_id,
        'assistant',
        'Lifecycle quality fixture',
        jsonb_build_object(
            'provider', 'openai',
            'status', 'succeeded',
            'response_id', 'resp-quality-root-' || v_envelope_id,
            'cost', jsonb_build_object(
                'estimated_cost_usd', 0.010000000000,
                'currency', 'USD',
                'rate_card_version', 'openai-2026-10-07',
                'pricing_source', 'https://developers.openai.com/api/docs/pricing'
            ),
            'quality_gate', jsonb_build_object(
                'passes', jsonb_build_array(
                    jsonb_build_object(
                        'role', 'draft',
                        'provider', 'openai',
                        'status', 'succeeded',
                        'response_id', 'resp-quality-draft-' || v_envelope_id,
                        'cost', jsonb_build_object(
                            'estimated_cost_usd', 0.010000000000,
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
            v_reservation_id, v_message_id, 'root', 'quality_root_must_fail'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Quality-gated assistant telemetry must settle individual provider passes, not root metadata' THEN
            v_failed_closed := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_failed_closed THEN
        RAISE EXCEPTION 'Quality-gated root telemetry did not fail closed';
    END IF;

    -- Known cost without explicit rate-card provenance must not settle.
    SELECT reservation_id, approved
    INTO v_reservation_id, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'missing-pricing-provenance', 'root',
        'issue59-missing-pricing-' || v_envelope_id,
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );
    IF NOT v_approved THEN
        RAISE EXCEPTION 'Could not reserve missing-pricing fixture';
    END IF;

    INSERT INTO comind.cm_message (conv_id, role, content, meta)
    VALUES (
        v_conversation_id,
        'assistant',
        'Lifecycle pricing provenance fixture',
        jsonb_build_object(
            'provider', 'openai',
            'status', 'succeeded',
            'response_id', 'resp-missing-pricing-' || v_envelope_id,
            'cost', jsonb_build_object(
                'estimated_cost_usd', 0.010000000000,
                'currency', 'USD'
            )
        )
    ) RETURNING msg_id INTO v_message_id;

    v_failed_closed := FALSE;
    BEGIN
        PERFORM * FROM comind.cm_finalize_paid_provider_message_execution(
            v_reservation_id, v_message_id, 'root', 'missing_pricing_must_fail'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Known-cost settlement requires rate-card version and pricing-source provenance' THEN
            v_failed_closed := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_failed_closed THEN
        RAISE EXCEPTION 'Known cost without pricing provenance did not fail closed';
    END IF;

    -- Confirmed pre-provider cancellation must release exposure through the adapter surface.
    SELECT reservation_id, approved
    INTO v_reservation_id, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'pre-provider-cancel', 'tool.database',
        'issue59-pre-provider-cancel-' || v_envelope_id,
        0.300000000000,
        NOW() + INTERVAL '5 minutes'
    );
    IF NOT v_approved THEN
        RAISE EXCEPTION 'Could not reserve unspent-close fixture';
    END IF;

    SELECT reservation_id, reservation_status, released_amount, idempotent
    INTO v_reservation_id, v_status, v_released, v_idempotent
    FROM comind.cm_close_unspent_paid_provider_execution(
        v_reservation_id, 'cancelled', 'confirmed_pre_provider_cancel'
    );

    IF v_status <> 'cancelled' OR v_released <> 0.300000000000 OR v_idempotent THEN
        RAISE EXCEPTION 'Adapter unspent-close result is inconsistent';
    END IF;

    SELECT reserved_cost INTO v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;
    IF v_reserved <> 0.400000000000 THEN
        RAISE EXCEPTION 'Confirmed unspent close released the wrong exposure: %', v_reserved;
    END IF;

    -- Once provider telemetry is linked, the adapter must refuse the unspent-close path.
    SELECT reservation_id, approved
    INTO v_reservation_id, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'settled-provider-call', 'root',
        'issue59-settled-close-reject-' || v_envelope_id,
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );
    IF NOT v_approved THEN
        RAISE EXCEPTION 'Could not reserve settled close-rejection fixture';
    END IF;

    INSERT INTO comind.cm_message (conv_id, role, content, meta)
    VALUES (
        v_conversation_id,
        'assistant',
        'Lifecycle settled telemetry fixture',
        jsonb_build_object(
            'provider', 'openai',
            'status', 'succeeded',
            'response_id', 'resp-settled-close-' || v_envelope_id,
            'cost', jsonb_build_object(
                'estimated_cost_usd', 0.020000000000,
                'currency', 'USD',
                'rate_card_version', 'openai-2026-10-07',
                'pricing_source', 'https://developers.openai.com/api/docs/pricing'
            )
        )
    ) RETURNING msg_id INTO v_message_id;

    PERFORM * FROM comind.cm_finalize_paid_provider_message_execution(
        v_reservation_id, v_message_id, 'root', 'runtime_message_telemetry_settlement'
    );

    v_failed_closed := FALSE;
    BEGIN
        PERFORM * FROM comind.cm_close_unspent_paid_provider_execution(
            v_reservation_id, 'cancelled', 'invalid_post_provider_cancel'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Reservation % already has provider telemetry and cannot use the unspent-close path' THEN
            v_failed_closed := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_failed_closed THEN
        RAISE EXCEPTION 'Telemetry-linked reservation incorrectly used unspent-close path';
    END IF;
END;
$$;

ROLLBACK;

SELECT 'Current-runtime budget authority lifecycle hardening verification passed' AS verification_result;
