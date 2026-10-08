-- Verification for CoMind durable paid-provider budget authority hardening.
-- Run only against isolated PostgreSQL after FinOps v1 and the v1.1 hardening migration.

BEGIN;

DO $$
DECLARE
    v_rls BOOLEAN;
    v_exposed BOOLEAN;
    v_sensitive_columns INTEGER;
BEGIN
    IF to_regclass('public.comind_cost_reservation_events') IS NULL THEN
        RAISE EXCEPTION 'Missing comind_cost_reservation_events';
    END IF;

    SELECT relrowsecurity INTO v_rls
    FROM pg_class
    WHERE oid = 'public.comind_cost_reservation_events'::regclass;

    IF NOT v_rls THEN
        RAISE EXCEPTION 'RLS must be enabled on comind_cost_reservation_events';
    END IF;

    SELECT
        has_table_privilege('anon', 'public.comind_cost_reservation_events', 'SELECT')
        OR has_table_privilege('authenticated', 'public.comind_cost_reservation_events', 'SELECT')
        OR has_table_privilege('anon', 'public.comind_cost_reservation_events', 'INSERT')
        OR has_table_privilege('authenticated', 'public.comind_cost_reservation_events', 'INSERT')
    INTO v_exposed;

    IF v_exposed THEN
        RAISE EXCEPTION 'Budget authority audit events are exposed to client API roles';
    END IF;

    SELECT COUNT(*) INTO v_sensitive_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comind_cost_reservation_events'
      AND column_name IN ('prompt', 'response', 'content', 'credential', 'secret', 'api_key');

    IF v_sensitive_columns <> 0 THEN
        RAISE EXCEPTION 'Budget authority audit ledger contains forbidden sensitive-payload columns';
    END IF;
END;
$$;

DO $$
DECLARE
    v_provider_id BIGINT;
    v_agent_id UUID;
    v_envelope_id BIGINT;
    v_reservation_id BIGINT;
    v_reservation_id_repeat BIGINT;
    v_second_reservation_id BIGINT;
    v_unknown_reservation_id BIGINT;
    v_cancel_reservation_id BIGINT;
    v_fail_reservation_id BIGINT;
    v_stale_reservation_id BIGINT;
    v_approved BOOLEAN;
    v_remaining NUMERIC;
    v_status TEXT;
    v_reason TEXT;
    v_idempotent BOOLEAN;
    v_usage_id BIGINT;
    v_usage_id_repeat BIGINT;
    v_accounted NUMERIC;
    v_reserved NUMERIC;
    v_actual NUMERIC;
    v_count INTEGER;
    v_conflict_seen BOOLEAN;
    v_event_id TEXT;
    v_telemetry_id TEXT;
BEGIN
    SELECT id INTO v_provider_id
    FROM public.comind_service_providers
    WHERE provider_code = 'openai';

    SELECT id INTO v_agent_id
    FROM public.agents
    WHERE name = 'FinOps and Resource Governor'
    LIMIT 1;

    IF v_provider_id IS NULL OR v_agent_id IS NULL THEN
        RAISE EXCEPTION 'FinOps base seed data is unavailable';
    END IF;

    INSERT INTO public.comind_workflow_cost_envelopes (
        owner_agent_id, objective, environment, capability_level,
        estimated_cost, soft_limit_amount, hard_limit_amount,
        max_iterations, max_duration_seconds, status
    ) VALUES (
        v_agent_id,
        'Issue 57 deterministic paid-provider authority verification',
        'test',
        2,
        0,
        0.800000000000,
        1.000000000000,
        10,
        600,
        'authorized'
    ) RETURNING id INTO v_envelope_id;

    SELECT reservation_id, approved, remaining_budget, reservation_status,
           decision_reason, idempotent
    INTO v_reservation_id, v_approved, v_remaining, v_status, v_reason, v_idempotent
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'known-cost-call',
        'issue57-known-cost',
        0.400000000000,
        NOW() + INTERVAL '5 minutes'
    );

    IF NOT v_approved OR v_idempotent OR v_status <> 'reserved'
       OR v_remaining <> 0.600000000000 THEN
        RAISE EXCEPTION 'Initial reservation failed: approved=%, idempotent=%, status=%, remaining=%, reason=%',
            v_approved, v_idempotent, v_status, v_remaining, v_reason;
    END IF;

    SELECT reservation_id, approved, remaining_budget, reservation_status,
           decision_reason, idempotent
    INTO v_reservation_id_repeat, v_approved, v_remaining, v_status, v_reason, v_idempotent
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'known-cost-call',
        'issue57-known-cost',
        0.400000000000,
        NOW() + INTERVAL '5 minutes'
    );

    IF NOT v_approved OR NOT v_idempotent OR v_reservation_id_repeat <> v_reservation_id THEN
        RAISE EXCEPTION 'Reservation retry was not idempotent';
    END IF;

    SELECT reserved_cost INTO v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;

    IF v_reserved <> 0.400000000000 THEN
        RAISE EXCEPTION 'Idempotent reservation retry changed held exposure: %', v_reserved;
    END IF;

    v_conflict_seen := FALSE;
    BEGIN
        PERFORM * FROM public.comind_reserve_paid_provider_cost(
            v_envelope_id,
            v_provider_id,
            v_agent_id,
            'known-cost-call',
            'issue57-known-cost',
            0.300000000000,
            NOW() + INTERVAL '5 minutes'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Idempotency key % conflicts with an existing reservation' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;

    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Conflicting idempotency-key reuse did not fail closed';
    END IF;

    v_event_id := 'resp-issue57-known-' || v_envelope_id;
    v_telemetry_id := 'msg-issue57-known-' || v_envelope_id;

    SELECT reservation_id, usage_event_id, reservation_status, accounted_cost, idempotent
    INTO v_reservation_id_repeat, v_usage_id, v_status, v_accounted, v_idempotent
    FROM public.comind_finalize_paid_provider_cost(
        v_reservation_id,
        v_event_id,
        v_telemetry_id,
        0.123456789012,
        'finalized',
        'provider_success'
    );

    IF v_idempotent OR v_status <> 'finalized'
       OR v_accounted <> 0.123456789012 OR v_usage_id IS NULL THEN
        RAISE EXCEPTION 'Known-cost finalization failed';
    END IF;

    SELECT reservation_id, usage_event_id, reservation_status, accounted_cost, idempotent
    INTO v_reservation_id_repeat, v_usage_id_repeat, v_status, v_accounted, v_idempotent
    FROM public.comind_finalize_paid_provider_cost(
        v_reservation_id,
        v_event_id,
        v_telemetry_id,
        0.123456789012,
        'finalized',
        'provider_success'
    );

    IF NOT v_idempotent OR v_usage_id_repeat <> v_usage_id THEN
        RAISE EXCEPTION 'Known-cost finalization retry was not idempotent';
    END IF;

    SELECT actual_cost, reserved_cost INTO v_actual, v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;

    IF v_actual <> 0.123456789012 OR v_reserved <> 0 THEN
        RAISE EXCEPTION 'Known-cost settlement totals are inconsistent: actual=%, reserved=%',
            v_actual, v_reserved;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.comind_usage_events
    WHERE reservation_id = v_reservation_id
      AND meter_code = 'provider_execution';

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one usage event for idempotent finalization, got %', v_count;
    END IF;

    -- A different reservation cannot claim the same provider execution identity.
    SELECT reservation_id, approved
    INTO v_second_reservation_id, v_approved
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'provider-event-conflict',
        'issue57-provider-event-conflict',
        0.100000000000,
        NOW() + INTERVAL '5 minutes'
    );

    IF NOT v_approved THEN
        RAISE EXCEPTION 'Provider-event conflict fixture could not reserve';
    END IF;

    v_conflict_seen := FALSE;
    BEGIN
        PERFORM * FROM public.comind_finalize_paid_provider_cost(
            v_second_reservation_id,
            v_event_id,
            'msg-issue57-conflict-' || v_envelope_id,
            0.010000000000,
            'finalized',
            'provider_success'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Provider event % is already bound to reservation %' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;

    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Provider-event identity reuse did not fail closed';
    END IF;

    PERFORM * FROM public.comind_close_unspent_paid_provider_reservation(
        v_second_reservation_id,
        'cancelled',
        'conflict_fixture_cleanup'
    );

    -- Unknown cost keeps the original reservation held until reconciliation.
    SELECT reservation_id, approved
    INTO v_unknown_reservation_id, v_approved
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'unknown-cost-call',
        'issue57-unknown-cost',
        0.300000000000,
        NOW() + INTERVAL '5 minutes'
    );

    IF NOT v_approved THEN
        RAISE EXCEPTION 'Unknown-cost fixture could not reserve';
    END IF;

    PERFORM * FROM public.comind_finalize_paid_provider_cost(
        v_unknown_reservation_id,
        'resp-issue57-unknown-' || v_envelope_id,
        'msg-issue57-unknown-' || v_envelope_id,
        NULL,
        'unknown_cost',
        'provider_cost_unavailable'
    );

    SELECT actual_cost, reserved_cost INTO v_actual, v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;

    IF v_actual <> 0.123456789012 OR v_reserved <> 0.300000000000 THEN
        RAISE EXCEPTION 'Unknown-cost exposure was not conservatively retained: actual=%, reserved=%',
            v_actual, v_reserved;
    END IF;

    SELECT reservation_id, usage_event_id, reservation_status, accounted_cost, idempotent
    INTO v_reservation_id_repeat, v_usage_id, v_status, v_accounted, v_idempotent
    FROM public.comind_finalize_paid_provider_cost(
        v_unknown_reservation_id,
        'resp-issue57-unknown-' || v_envelope_id,
        'msg-issue57-unknown-' || v_envelope_id,
        0.050000000001,
        'finalized',
        'provider_cost_reconciled'
    );

    IF v_status <> 'finalized' OR v_accounted <> 0.050000000001 OR v_idempotent THEN
        RAISE EXCEPTION 'Unknown-cost reconciliation failed';
    END IF;

    SELECT actual_cost, reserved_cost INTO v_actual, v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;

    IF v_actual <> 0.173456789013 OR v_reserved <> 0 THEN
        RAISE EXCEPTION 'Reconciliation totals are inconsistent: actual=%, reserved=%',
            v_actual, v_reserved;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.comind_cost_reservation_events
    WHERE reservation_id = v_unknown_reservation_id
      AND event_type IN ('unknown_cost', 'reconciled');

    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Unknown-cost reconciliation audit trail is incomplete';
    END IF;

    -- Explicit cancellation releases confirmed-unspent exposure.
    SELECT reservation_id, approved
    INTO v_cancel_reservation_id, v_approved
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'cancel-call',
        'issue57-cancel',
        0.100000000000,
        NOW() + INTERVAL '5 minutes'
    );

    PERFORM * FROM public.comind_close_unspent_paid_provider_reservation(
        v_cancel_reservation_id,
        'cancelled',
        'operator_cancelled_before_call'
    );

    -- Confirmed pre-provider failure is explicit and costs zero.
    SELECT reservation_id, approved
    INTO v_fail_reservation_id, v_approved
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'fail-call',
        'issue57-fail',
        0.100000000000,
        NOW() + INTERVAL '5 minutes'
    );

    PERFORM * FROM public.comind_close_unspent_paid_provider_reservation(
        v_fail_reservation_id,
        'failed',
        'failed_before_provider_call'
    );

    SELECT reserved_cost INTO v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;

    IF v_reserved <> 0 THEN
        RAISE EXCEPTION 'Cancelled/failed unspent reservations still hold exposure: %', v_reserved;
    END IF;

    -- Expiry is conservative: stale exposure remains held until evidence-backed closure.
    SELECT reservation_id, approved
    INTO v_stale_reservation_id, v_approved
    FROM public.comind_reserve_paid_provider_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'stale-call',
        'issue57-stale',
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );

    UPDATE public.comind_cost_reservations
    SET expires_at = NOW() - INTERVAL '1 second'
    WHERE id = v_stale_reservation_id;

    v_count := public.comind_mark_stale_cost_reservations(v_envelope_id);

    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one stale reservation transition, got %', v_count;
    END IF;

    SELECT status INTO v_status
    FROM public.comind_cost_reservations
    WHERE id = v_stale_reservation_id;

    SELECT reserved_cost INTO v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;

    IF v_status <> 'stale' OR v_reserved <> 0.200000000000 THEN
        RAISE EXCEPTION 'Stale reservation did not retain exposure: status=%, reserved=%',
            v_status, v_reserved;
    END IF;

    PERFORM * FROM public.comind_close_unspent_paid_provider_reservation(
        v_stale_reservation_id,
        'cancelled',
        'stale_verified_unspent'
    );

    SELECT reserved_cost INTO v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;

    IF v_reserved <> 0 THEN
        RAISE EXCEPTION 'Evidence-backed stale cancellation did not release exposure';
    END IF;

    -- Audit events are immutable.
    SELECT id INTO v_count
    FROM public.comind_cost_reservation_events
    WHERE reservation_id = v_reservation_id
    ORDER BY id
    LIMIT 1;

    v_conflict_seen := FALSE;
    BEGIN
        UPDATE public.comind_cost_reservation_events
        SET reason_code = 'mutation_should_fail'
        WHERE id = v_count;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Cost reservation events are append-only' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;

    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Append-only audit event mutation was not blocked';
    END IF;
END;
$$;

ROLLBACK;

SELECT 'Paid-provider budget authority deterministic verification passed' AS verification_result;
