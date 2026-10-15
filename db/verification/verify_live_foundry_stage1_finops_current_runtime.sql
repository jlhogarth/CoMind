-- Issue #116 isolated verification for the current-runtime FinOps live projection.
-- This test intentionally requires the legacy public identity/governance tables to remain absent.
-- It runs inside a transaction and leaves no test evidence behind.

BEGIN;

DO $$
DECLARE
    v_provider_id BIGINT;
    v_envelope_id BIGINT;
    v_reservation_id BIGINT;
    v_usage_event_id BIGINT;
    v_approved BOOLEAN;
    v_remaining NUMERIC;
    v_reservation_status TEXT;
    v_decision_reason TEXT;
    v_idempotent BOOLEAN;
    v_accounted_cost NUMERIC;
    v_provider_count INTEGER;
    v_event_count INTEGER;
    v_usage_count INTEGER;
BEGIN
    IF to_regclass('public.projects') IS NOT NULL
       OR to_regclass('public.agents') IS NOT NULL
       OR to_regclass('public.comind_governance_decisions') IS NOT NULL THEN
        RAISE EXCEPTION 'Issue #116 production-shape verification forbids legacy public identity/governance relations';
    END IF;

    IF to_regclass('public.comind_workflow_cost_envelopes') IS NULL
       OR to_regclass('public.comind_cost_reservations') IS NULL
       OR to_regclass('public.comind_cost_reservation_events') IS NULL THEN
        RAISE EXCEPTION 'Issue #116 FinOps projection or hardening tables are missing';
    END IF;

    SELECT count(*) INTO v_provider_count
    FROM public.comind_service_providers
    WHERE provider_code IN (
        'local_rtx5090', 'openai', 'google_gemini', 'supabase',
        'railway', 'vercel', 'replit'
    );

    IF v_provider_count <> 7 THEN
        RAISE EXCEPTION 'Expected seven reviewed provider seed rows, found %', v_provider_count;
    END IF;

    SELECT id INTO v_provider_id
    FROM public.comind_service_providers
    WHERE provider_code = 'openai' AND active;

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'OpenAI provider seed is unavailable or inactive';
    END IF;

    INSERT INTO public.comind_workflow_cost_envelopes (
        objective, environment, capability_level, estimated_cost,
        soft_limit_amount, hard_limit_amount, permitted_provider_codes,
        max_iterations, max_duration_seconds, status
    ) VALUES (
        'Issue 116 current-runtime FinOps projection verification',
        'test',
        2,
        0,
        0.800000000000,
        1.000000000000,
        '["openai"]'::jsonb,
        4,
        300,
        'authorized'
    ) RETURNING id INTO v_envelope_id;

    SELECT reservation_id, approved, remaining_budget, reservation_status,
           decision_reason, idempotent
    INTO v_reservation_id, v_approved, v_remaining, v_reservation_status,
         v_decision_reason, v_idempotent
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        NULL,
        'issue116-production-shape-call',
        'issue116-production-shape-reservation',
        0.400000000000,
        NOW() + INTERVAL '5 minutes'
    );

    IF v_reservation_id IS NULL
       OR NOT v_approved
       OR v_idempotent
       OR v_reservation_status <> 'reserved'
       OR v_remaining <> 0.600000000000 THEN
        RAISE EXCEPTION 'Current-runtime production-shape reservation failed: id=%, approved=%, idempotent=%, status=%, remaining=%, reason=%',
            v_reservation_id, v_approved, v_idempotent, v_reservation_status, v_remaining, v_decision_reason;
    END IF;

    SELECT reservation_id, usage_event_id, reservation_status, accounted_cost, idempotent
    INTO v_reservation_id, v_usage_event_id, v_reservation_status, v_accounted_cost, v_idempotent
    FROM public.comind_finalize_paid_provider_cost(
        v_reservation_id,
        'resp_issue116_projection',
        'issue116:projection:telemetry',
        0.123456789012,
        'finalized',
        'issue116_projection_verified'
    );

    IF v_usage_event_id IS NULL
       OR v_reservation_status <> 'finalized'
       OR v_accounted_cost <> 0.123456789012
       OR v_idempotent THEN
        RAISE EXCEPTION 'Current-runtime production-shape settlement failed: usage=%, status=%, cost=%, idempotent=%',
            v_usage_event_id, v_reservation_status, v_accounted_cost, v_idempotent;
    END IF;

    SELECT count(*) INTO v_event_count
    FROM public.comind_cost_reservation_events
    WHERE reservation_id = v_reservation_id;

    SELECT count(*) INTO v_usage_count
    FROM public.comind_usage_events
    WHERE id = v_usage_event_id
      AND reservation_id = v_reservation_id
      AND provider_event_id = 'resp_issue116_projection';

    IF v_event_count <> 2 OR v_usage_count <> 1 THEN
        RAISE EXCEPTION 'Expected one reservation event, one finalization event, and one usage event; got events=% usage=%',
            v_event_count, v_usage_count;
    END IF;
END;
$$;

ROLLBACK;
