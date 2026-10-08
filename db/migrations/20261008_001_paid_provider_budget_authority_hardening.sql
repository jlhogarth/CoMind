-- CoMind durable paid-provider budget authority hardening
-- Version: 1.1.0
-- Date: 2026-10-08
-- Purpose: Idempotent, auditable, fail-closed reservation and settlement semantics.
-- Scope: Database contract only. No provider runtime wiring or live deployment.

BEGIN;

DO $$
DECLARE
    v_missing TEXT[];
BEGIN
    SELECT ARRAY_AGG(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind_workflow_cost_envelopes'),
            ('comind_cost_reservations'),
            ('comind_usage_events'),
            ('comind_service_providers'),
            ('comind_cost_alerts')
    ) AS required(name)
    WHERE to_regclass('public.' || name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Paid-provider budget authority requires existing FinOps tables: %', v_missing;
    END IF;
END;
$$;

-- The v1 summary view depends on envelope monetary columns. PostgreSQL correctly
-- blocks changing a referenced column typmod, so preserve the view contract by
-- dropping and recreating it inside this same transaction.
DROP VIEW IF EXISTS public.comind_workflow_cost_summary;

-- Preserve sub-micro-dollar provider cost precision used by the reviewed rate-card estimator.
ALTER TABLE public.comind_workflow_cost_envelopes
    ALTER COLUMN estimated_cost TYPE NUMERIC(24,12),
    ALTER COLUMN soft_limit_amount TYPE NUMERIC(24,12),
    ALTER COLUMN hard_limit_amount TYPE NUMERIC(24,12),
    ALTER COLUMN actual_cost TYPE NUMERIC(24,12),
    ALTER COLUMN reserved_cost TYPE NUMERIC(24,12);

ALTER TABLE public.comind_cost_reservations
    ALTER COLUMN reserved_amount TYPE NUMERIC(24,12);

ALTER TABLE public.comind_usage_events
    ALTER COLUMN measured_cost TYPE NUMERIC(24,12);

ALTER TABLE public.comind_cost_reservations
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS provider_event_id TEXT,
    ADD COLUMN IF NOT EXISTS telemetry_identity TEXT,
    ADD COLUMN IF NOT EXISTS finalized_cost NUMERIC(24,12),
    ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS state_reason_code TEXT;

ALTER TABLE public.comind_cost_reservations
    DROP CONSTRAINT IF EXISTS comind_cost_reservations_status_ck,
    DROP CONSTRAINT IF EXISTS comind_cost_reservations_finalized_cost_ck,
    DROP CONSTRAINT IF EXISTS comind_cost_reservations_idempotency_key_ck,
    DROP CONSTRAINT IF EXISTS comind_cost_reservations_provider_event_ck,
    DROP CONSTRAINT IF EXISTS comind_cost_reservations_telemetry_identity_ck,
    DROP CONSTRAINT IF EXISTS comind_cost_reservations_reason_code_ck;

ALTER TABLE public.comind_cost_reservations
    ADD CONSTRAINT comind_cost_reservations_status_ck CHECK (
        status IN (
            'active', 'consumed', 'released', 'expired',
            'reserved', 'finalized', 'cancelled', 'failed', 'stale', 'unknown_cost'
        )
    ),
    ADD CONSTRAINT comind_cost_reservations_finalized_cost_ck CHECK (
        finalized_cost IS NULL OR finalized_cost >= 0
    ),
    ADD CONSTRAINT comind_cost_reservations_idempotency_key_ck CHECK (
        idempotency_key IS NULL OR idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
    ),
    ADD CONSTRAINT comind_cost_reservations_provider_event_ck CHECK (
        provider_event_id IS NULL OR provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
    ),
    ADD CONSTRAINT comind_cost_reservations_telemetry_identity_ck CHECK (
        telemetry_identity IS NULL OR telemetry_identity ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
    ),
    ADD CONSTRAINT comind_cost_reservations_reason_code_ck CHECK (
        state_reason_code IS NULL OR state_reason_code ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    );

CREATE UNIQUE INDEX IF NOT EXISTS idx_comind_cost_reservations_idempotency
    ON public.comind_cost_reservations (envelope_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comind_cost_reservations_provider_event
    ON public.comind_cost_reservations (provider_id, provider_event_id)
    WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comind_cost_reservations_telemetry_identity
    ON public.comind_cost_reservations (provider_id, telemetry_identity)
    WHERE telemetry_identity IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.comind_cost_reservation_events (
    id BIGSERIAL PRIMARY KEY,
    reservation_id BIGINT NOT NULL
        REFERENCES public.comind_cost_reservations(id) ON DELETE RESTRICT,
    envelope_id BIGINT NOT NULL
        REFERENCES public.comind_workflow_cost_envelopes(id) ON DELETE RESTRICT,
    provider_id BIGINT NOT NULL
        REFERENCES public.comind_service_providers(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    resulting_status TEXT NOT NULL,
    amount NUMERIC(24,12),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    provider_event_id TEXT,
    telemetry_identity TEXT,
    reason_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_cost_reservation_events_type_ck CHECK (
        event_type IN (
            'reserved', 'finalized', 'cancelled', 'failed', 'stale',
            'unknown_cost', 'reconciled', 'override'
        )
    ),
    CONSTRAINT comind_cost_reservation_events_status_ck CHECK (
        resulting_status IN (
            'reserved', 'finalized', 'cancelled', 'failed', 'stale', 'unknown_cost'
        )
    ),
    CONSTRAINT comind_cost_reservation_events_amount_ck CHECK (
        amount IS NULL OR amount >= 0
    ),
    CONSTRAINT comind_cost_reservation_events_currency_ck CHECK (
        currency ~ '^[A-Z]{3}$'
    ),
    CONSTRAINT comind_cost_reservation_events_provider_event_ck CHECK (
        provider_event_id IS NULL OR provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
    ),
    CONSTRAINT comind_cost_reservation_events_telemetry_identity_ck CHECK (
        telemetry_identity IS NULL OR telemetry_identity ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
    ),
    CONSTRAINT comind_cost_reservation_events_reason_code_ck CHECK (
        reason_code ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    )
);

CREATE INDEX IF NOT EXISTS idx_comind_cost_reservation_events_reservation
    ON public.comind_cost_reservation_events (reservation_id, id);

CREATE INDEX IF NOT EXISTS idx_comind_cost_reservation_events_envelope
    ON public.comind_cost_reservation_events (envelope_id, id);

CREATE OR REPLACE FUNCTION public.comind_reject_cost_reservation_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Cost reservation events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_comind_cost_reservation_events_immutable
    ON public.comind_cost_reservation_events;
CREATE TRIGGER trg_comind_cost_reservation_events_immutable
BEFORE UPDATE OR DELETE ON public.comind_cost_reservation_events
FOR EACH ROW EXECUTE FUNCTION public.comind_reject_cost_reservation_event_mutation();

CREATE OR REPLACE FUNCTION public.comind_sync_envelope_reserved_cost(
    p_envelope_id BIGINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_held NUMERIC(24,12);
BEGIN
    SELECT COALESCE(SUM(reserved_amount), 0)
    INTO v_held
    FROM public.comind_cost_reservations
    WHERE envelope_id = p_envelope_id
      AND status IN ('active', 'reserved', 'stale', 'unknown_cost');

    UPDATE public.comind_workflow_cost_envelopes
    SET reserved_cost = v_held
    WHERE id = p_envelope_id;

    RETURN v_held;
END;
$$;

CREATE OR REPLACE FUNCTION public.comind_mark_stale_cost_reservations(
    p_envelope_id BIGINT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    PERFORM 1
    FROM public.comind_workflow_cost_envelopes
    WHERE id = p_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost envelope % does not exist', p_envelope_id;
    END IF;

    WITH stale AS (
        UPDATE public.comind_cost_reservations
        SET status = 'stale',
            state_reason_code = 'reservation_expired',
            released_at = NULL
        WHERE envelope_id = p_envelope_id
          AND status IN ('active', 'reserved')
          AND expires_at <= NOW()
        RETURNING id, envelope_id, provider_id, reserved_amount, currency,
                  provider_event_id, telemetry_identity
    ), inserted AS (
        INSERT INTO public.comind_cost_reservation_events (
            reservation_id, envelope_id, provider_id, event_type,
            resulting_status, amount, currency, provider_event_id,
            telemetry_identity, reason_code
        )
        SELECT id, envelope_id, provider_id, 'stale', 'stale',
               reserved_amount, currency, provider_event_id,
               telemetry_identity, 'reservation_expired'
        FROM stale
        RETURNING 1
    )
    SELECT COUNT(*)::int INTO v_count FROM inserted;

    PERFORM public.comind_sync_envelope_reserved_cost(p_envelope_id);
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.comind_reserve_paid_provider_cost(
    p_envelope_id BIGINT,
    p_provider_id BIGINT,
    p_agent_id UUID,
    p_operation_name TEXT,
    p_idempotency_key TEXT,
    p_requested_amount NUMERIC,
    p_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '15 minutes'
)
RETURNS TABLE (
    reservation_id BIGINT,
    approved BOOLEAN,
    remaining_budget NUMERIC,
    reservation_status TEXT,
    decision_reason TEXT,
    idempotent BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_envelope public.comind_workflow_cost_envelopes%ROWTYPE;
    v_existing public.comind_cost_reservations%ROWTYPE;
    v_held NUMERIC(24,12);
    v_reservation_id BIGINT;
BEGIN
    IF p_requested_amount IS NULL OR p_requested_amount <= 0 THEN
        RAISE EXCEPTION 'Requested reservation amount must be greater than zero';
    END IF;
    IF p_idempotency_key IS NULL
       OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' THEN
        RAISE EXCEPTION 'A bounded machine-readable idempotency key is required';
    END IF;
    IF p_operation_name IS NULL OR btrim(p_operation_name) = '' THEN
        RAISE EXCEPTION 'Operation name is required';
    END IF;
    IF p_expires_at IS NULL OR p_expires_at <= NOW() THEN
        RAISE EXCEPTION 'Reservation expiry must be in the future';
    END IF;

    SELECT * INTO v_envelope
    FROM public.comind_workflow_cost_envelopes
    WHERE id = p_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost envelope % does not exist', p_envelope_id;
    END IF;

    PERFORM public.comind_mark_stale_cost_reservations(p_envelope_id);

    SELECT * INTO v_existing
    FROM public.comind_cost_reservations
    WHERE envelope_id = p_envelope_id
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing.provider_id <> p_provider_id
           OR v_existing.operation_name <> p_operation_name
           OR v_existing.reserved_amount <> p_requested_amount
           OR v_existing.agent_id IS DISTINCT FROM p_agent_id THEN
            RAISE EXCEPTION 'Idempotency key % conflicts with an existing reservation', p_idempotency_key;
        END IF;

        v_held := public.comind_sync_envelope_reserved_cost(p_envelope_id);
        RETURN QUERY SELECT
            v_existing.id,
            (v_existing.status = 'reserved'),
            GREATEST(v_envelope.hard_limit_amount - v_envelope.actual_cost - v_held, 0),
            v_existing.status,
            CASE
                WHEN v_existing.status = 'reserved' THEN 'Existing reservation reused'
                ELSE 'Existing reservation is no longer spendable'
            END,
            TRUE;
        RETURN;
    END IF;

    SELECT COALESCE(SUM(reserved_amount), 0)
    INTO v_held
    FROM public.comind_cost_reservations
    WHERE envelope_id = p_envelope_id
      AND status IN ('active', 'reserved', 'stale', 'unknown_cost');

    IF v_envelope.status NOT IN ('authorized', 'running') THEN
        UPDATE public.comind_workflow_cost_envelopes
        SET reserved_cost = v_held
        WHERE id = p_envelope_id;

        RETURN QUERY SELECT
            NULL::BIGINT,
            FALSE,
            GREATEST(v_envelope.hard_limit_amount - v_envelope.actual_cost - v_held, 0),
            NULL::TEXT,
            'Envelope is not authorized or running'::TEXT,
            FALSE;
        RETURN;
    END IF;

    IF v_envelope.actual_cost + v_held + p_requested_amount > v_envelope.hard_limit_amount THEN
        UPDATE public.comind_workflow_cost_envelopes
        SET status = 'halted_budget', reserved_cost = v_held
        WHERE id = p_envelope_id;

        INSERT INTO public.comind_cost_alerts (
            envelope_id, provider_id, alert_type, severity, message, evidence
        ) VALUES (
            p_envelope_id,
            p_provider_id,
            'hard_limit',
            'high',
            'Paid-provider reservation denied because it would exceed the workflow hard limit.',
            jsonb_build_object(
                'requested_amount', p_requested_amount,
                'actual_cost', v_envelope.actual_cost,
                'held_exposure', v_held,
                'hard_limit', v_envelope.hard_limit_amount
            )
        );

        RETURN QUERY SELECT
            NULL::BIGINT,
            FALSE,
            GREATEST(v_envelope.hard_limit_amount - v_envelope.actual_cost - v_held, 0),
            NULL::TEXT,
            'Requested cost exceeds the hard limit'::TEXT,
            FALSE;
        RETURN;
    END IF;

    INSERT INTO public.comind_cost_reservations (
        envelope_id, provider_id, agent_id, operation_name,
        reserved_amount, currency, status, expires_at, idempotency_key,
        state_reason_code
    ) VALUES (
        p_envelope_id, p_provider_id, p_agent_id, p_operation_name,
        p_requested_amount, v_envelope.currency, 'reserved', p_expires_at,
        p_idempotency_key, 'reservation_approved'
    )
    RETURNING id INTO v_reservation_id;

    INSERT INTO public.comind_cost_reservation_events (
        reservation_id, envelope_id, provider_id, event_type,
        resulting_status, amount, currency, reason_code
    ) VALUES (
        v_reservation_id, p_envelope_id, p_provider_id, 'reserved',
        'reserved', p_requested_amount, v_envelope.currency, 'reservation_approved'
    );

    UPDATE public.comind_workflow_cost_envelopes
    SET reserved_cost = v_held + p_requested_amount
    WHERE id = p_envelope_id;

    RETURN QUERY SELECT
        v_reservation_id,
        TRUE,
        v_envelope.hard_limit_amount - v_envelope.actual_cost - v_held - p_requested_amount,
        'reserved'::TEXT,
        'Reservation approved'::TEXT,
        FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.comind_finalize_paid_provider_cost(
    p_reservation_id BIGINT,
    p_provider_event_id TEXT,
    p_telemetry_identity TEXT,
    p_actual_cost NUMERIC,
    p_outcome TEXT DEFAULT 'finalized',
    p_reason_code TEXT DEFAULT 'provider_settlement'
)
RETURNS TABLE (
    reservation_id BIGINT,
    usage_event_id BIGINT,
    reservation_status TEXT,
    accounted_cost NUMERIC,
    idempotent BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_envelope_id BIGINT;
    v_reservation public.comind_cost_reservations%ROWTYPE;
    v_envelope public.comind_workflow_cost_envelopes%ROWTYPE;
    v_usage_event_id BIGINT;
    v_event_type TEXT;
    v_existing_reservation BIGINT;
    v_held NUMERIC(24,12);
BEGIN
    IF p_outcome NOT IN ('finalized', 'failed', 'unknown_cost') THEN
        RAISE EXCEPTION 'Invalid paid-provider settlement outcome: %', p_outcome;
    END IF;
    IF p_reason_code IS NULL OR p_reason_code !~ '^[a-z0-9][a-z0-9._:-]{0,127}$' THEN
        RAISE EXCEPTION 'A bounded machine-readable reason code is required';
    END IF;
    IF p_provider_event_id IS NOT NULL
       AND p_provider_event_id !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' THEN
        RAISE EXCEPTION 'Provider event id is malformed';
    END IF;
    IF p_telemetry_identity IS NOT NULL
       AND p_telemetry_identity !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$' THEN
        RAISE EXCEPTION 'Telemetry identity is malformed';
    END IF;
    IF p_provider_event_id IS NULL AND p_telemetry_identity IS NULL THEN
        RAISE EXCEPTION 'Provider or telemetry identity is required for settlement';
    END IF;
    IF p_outcome = 'unknown_cost' AND p_actual_cost IS NOT NULL THEN
        RAISE EXCEPTION 'Unknown-cost settlement must not fabricate an actual cost';
    END IF;
    IF p_outcome <> 'unknown_cost' AND (p_actual_cost IS NULL OR p_actual_cost < 0) THEN
        RAISE EXCEPTION 'Known-cost settlement requires a nonnegative actual cost';
    END IF;

    -- All authority paths lock envelope first, then reservation, to avoid lock-order deadlocks.
    SELECT envelope_id INTO v_envelope_id
    FROM public.comind_cost_reservations
    WHERE id = p_reservation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost reservation % does not exist', p_reservation_id;
    END IF;

    SELECT * INTO v_envelope
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost envelope % does not exist', v_envelope_id;
    END IF;

    SELECT * INTO v_reservation
    FROM public.comind_cost_reservations
    WHERE id = p_reservation_id
      AND envelope_id = v_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation % changed while acquiring budget authority locks', p_reservation_id;
    END IF;

    IF p_provider_event_id IS NOT NULL THEN
        SELECT id INTO v_existing_reservation
        FROM public.comind_cost_reservations
        WHERE provider_id = v_reservation.provider_id
          AND provider_event_id = p_provider_event_id
          AND id <> p_reservation_id
        LIMIT 1;

        IF FOUND THEN
            RAISE EXCEPTION 'Provider event % is already bound to reservation %',
                p_provider_event_id, v_existing_reservation;
        END IF;
    END IF;

    IF p_telemetry_identity IS NOT NULL THEN
        SELECT id INTO v_existing_reservation
        FROM public.comind_cost_reservations
        WHERE provider_id = v_reservation.provider_id
          AND telemetry_identity = p_telemetry_identity
          AND id <> p_reservation_id
        LIMIT 1;

        IF FOUND THEN
            RAISE EXCEPTION 'Telemetry identity % is already bound to reservation %',
                p_telemetry_identity, v_existing_reservation;
        END IF;
    END IF;

    IF v_reservation.status IN ('finalized', 'failed', 'unknown_cost') THEN
        IF v_reservation.status = p_outcome
           AND v_reservation.provider_event_id IS NOT DISTINCT FROM p_provider_event_id
           AND v_reservation.telemetry_identity IS NOT DISTINCT FROM p_telemetry_identity
           AND v_reservation.finalized_cost IS NOT DISTINCT FROM p_actual_cost THEN
            SELECT id INTO v_usage_event_id
            FROM public.comind_usage_events
            WHERE reservation_id = p_reservation_id
              AND meter_code = 'provider_execution'
            ORDER BY id
            LIMIT 1;

            RETURN QUERY SELECT
                p_reservation_id,
                v_usage_event_id,
                v_reservation.status,
                v_reservation.finalized_cost,
                TRUE;
            RETURN;
        END IF;

        IF v_reservation.status <> 'unknown_cost' OR p_outcome = 'unknown_cost' THEN
            RAISE EXCEPTION 'Reservation % already has conflicting settlement state %',
                p_reservation_id, v_reservation.status;
        END IF;

        IF v_reservation.provider_event_id IS NOT NULL
           AND v_reservation.provider_event_id IS DISTINCT FROM p_provider_event_id THEN
            RAISE EXCEPTION 'Reconciliation provider identity conflicts with reservation %', p_reservation_id;
        END IF;
        IF v_reservation.telemetry_identity IS NOT NULL
           AND v_reservation.telemetry_identity IS DISTINCT FROM p_telemetry_identity THEN
            RAISE EXCEPTION 'Reconciliation telemetry identity conflicts with reservation %', p_reservation_id;
        END IF;

        v_event_type := 'reconciled';
    ELSIF v_reservation.status IN ('reserved', 'stale', 'active') THEN
        v_event_type := p_outcome;
    ELSE
        RAISE EXCEPTION 'Reservation % cannot settle from state %',
            p_reservation_id, v_reservation.status;
    END IF;

    IF p_outcome = 'unknown_cost' THEN
        UPDATE public.comind_cost_reservations
        SET status = 'unknown_cost',
            provider_event_id = COALESCE(provider_event_id, p_provider_event_id),
            telemetry_identity = COALESCE(telemetry_identity, p_telemetry_identity),
            finalized_cost = NULL,
            finalized_at = NOW(),
            state_reason_code = p_reason_code,
            released_at = NULL
        WHERE id = p_reservation_id;

        INSERT INTO public.comind_cost_reservation_events (
            reservation_id, envelope_id, provider_id, event_type,
            resulting_status, amount, currency, provider_event_id,
            telemetry_identity, reason_code
        ) VALUES (
            p_reservation_id, v_reservation.envelope_id, v_reservation.provider_id,
            'unknown_cost', 'unknown_cost', NULL, v_reservation.currency,
            p_provider_event_id, p_telemetry_identity, p_reason_code
        );

        PERFORM public.comind_sync_envelope_reserved_cost(v_reservation.envelope_id);

        RETURN QUERY SELECT
            p_reservation_id,
            NULL::BIGINT,
            'unknown_cost'::TEXT,
            NULL::NUMERIC,
            FALSE;
        RETURN;
    END IF;

    INSERT INTO public.comind_usage_events (
        envelope_id, reservation_id, routing_decision_id, provider_id,
        rate_card_id, agent_id, provider_event_id, meter_code,
        quantity, measured_cost, currency, metadata
    ) VALUES (
        v_reservation.envelope_id, p_reservation_id, NULL, v_reservation.provider_id,
        NULL, v_reservation.agent_id, p_provider_event_id, 'provider_execution',
        1, p_actual_cost, v_reservation.currency,
        jsonb_strip_nulls(jsonb_build_object(
            'telemetry_identity', p_telemetry_identity,
            'accounting_contract', 'paid_provider_v1_1'
        ))
    )
    RETURNING id INTO v_usage_event_id;

    UPDATE public.comind_cost_reservations
    SET status = p_outcome,
        provider_event_id = COALESCE(provider_event_id, p_provider_event_id),
        telemetry_identity = COALESCE(telemetry_identity, p_telemetry_identity),
        finalized_cost = p_actual_cost,
        finalized_at = NOW(),
        state_reason_code = p_reason_code,
        released_at = NOW()
    WHERE id = p_reservation_id;

    UPDATE public.comind_workflow_cost_envelopes
    SET actual_cost = actual_cost + p_actual_cost
    WHERE id = v_reservation.envelope_id;

    v_held := public.comind_sync_envelope_reserved_cost(v_reservation.envelope_id);

    UPDATE public.comind_workflow_cost_envelopes
    SET status = CASE
        WHEN actual_cost + reserved_cost >= hard_limit_amount THEN 'halted_budget'
        ELSE status
    END
    WHERE id = v_reservation.envelope_id;

    INSERT INTO public.comind_cost_reservation_events (
        reservation_id, envelope_id, provider_id, event_type,
        resulting_status, amount, currency, provider_event_id,
        telemetry_identity, reason_code
    ) VALUES (
        p_reservation_id, v_reservation.envelope_id, v_reservation.provider_id,
        v_event_type, p_outcome, p_actual_cost, v_reservation.currency,
        p_provider_event_id, p_telemetry_identity, p_reason_code
    );

    IF p_actual_cost > v_reservation.reserved_amount THEN
        INSERT INTO public.comind_cost_alerts (
            envelope_id, provider_id, alert_type, severity, message, evidence
        ) VALUES (
            v_reservation.envelope_id,
            v_reservation.provider_id,
            'forecast_overrun',
            'high',
            'Settled provider cost exceeded the pre-call reservation.',
            jsonb_build_object(
                'reservation_id', p_reservation_id,
                'reserved_amount', v_reservation.reserved_amount,
                'actual_cost', p_actual_cost
            )
        );
    END IF;

    IF v_envelope.actual_cost + p_actual_cost + v_held >= v_envelope.hard_limit_amount THEN
        INSERT INTO public.comind_cost_alerts (
            envelope_id, provider_id, alert_type, severity, message, evidence
        ) VALUES (
            v_reservation.envelope_id,
            v_reservation.provider_id,
            'hard_limit',
            'critical',
            'Workflow reached its hard cost limit after paid-provider settlement.',
            jsonb_build_object(
                'reservation_id', p_reservation_id,
                'previous_actual_cost', v_envelope.actual_cost,
                'settled_cost', p_actual_cost,
                'held_exposure', v_held,
                'hard_limit', v_envelope.hard_limit_amount
            )
        );
    END IF;

    RETURN QUERY SELECT
        p_reservation_id,
        v_usage_event_id,
        p_outcome,
        p_actual_cost,
        FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.comind_close_unspent_paid_provider_reservation(
    p_reservation_id BIGINT,
    p_terminal_status TEXT,
    p_reason_code TEXT
)
RETURNS TABLE (
    reservation_id BIGINT,
    reservation_status TEXT,
    released_amount NUMERIC,
    idempotent BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_envelope_id BIGINT;
    v_reservation public.comind_cost_reservations%ROWTYPE;
BEGIN
    IF p_terminal_status NOT IN ('cancelled', 'failed') THEN
        RAISE EXCEPTION 'Unspent reservation may close only as cancelled or failed';
    END IF;
    IF p_reason_code IS NULL OR p_reason_code !~ '^[a-z0-9][a-z0-9._:-]{0,127}$' THEN
        RAISE EXCEPTION 'A bounded machine-readable reason code is required';
    END IF;

    SELECT envelope_id INTO v_envelope_id
    FROM public.comind_cost_reservations
    WHERE id = p_reservation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost reservation % does not exist', p_reservation_id;
    END IF;

    PERFORM 1
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost envelope % does not exist', v_envelope_id;
    END IF;

    SELECT * INTO v_reservation
    FROM public.comind_cost_reservations
    WHERE id = p_reservation_id
      AND envelope_id = v_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation % changed while acquiring budget authority locks', p_reservation_id;
    END IF;

    IF v_reservation.status = p_terminal_status
       AND v_reservation.finalized_cost = 0
       AND v_reservation.provider_event_id IS NULL
       AND v_reservation.telemetry_identity IS NULL THEN
        RETURN QUERY SELECT
            p_reservation_id,
            p_terminal_status,
            v_reservation.reserved_amount,
            TRUE;
        RETURN;
    END IF;

    IF v_reservation.status NOT IN ('reserved', 'stale', 'active') THEN
        RAISE EXCEPTION 'Reservation % cannot close unspent from state %',
            p_reservation_id, v_reservation.status;
    END IF;

    IF v_reservation.provider_event_id IS NOT NULL OR v_reservation.telemetry_identity IS NOT NULL THEN
        RAISE EXCEPTION 'Reservation % has provider execution identity and cannot be closed as unspent',
            p_reservation_id;
    END IF;

    UPDATE public.comind_cost_reservations
    SET status = p_terminal_status,
        finalized_cost = 0,
        finalized_at = NOW(),
        released_at = NOW(),
        state_reason_code = p_reason_code
    WHERE id = p_reservation_id;

    INSERT INTO public.comind_cost_reservation_events (
        reservation_id, envelope_id, provider_id, event_type,
        resulting_status, amount, currency, reason_code
    ) VALUES (
        p_reservation_id, v_reservation.envelope_id, v_reservation.provider_id,
        p_terminal_status, p_terminal_status, 0, v_reservation.currency,
        p_reason_code
    );

    PERFORM public.comind_sync_envelope_reserved_cost(v_reservation.envelope_id);

    RETURN QUERY SELECT
        p_reservation_id,
        p_terminal_status,
        v_reservation.reserved_amount,
        FALSE;
END;
$$;

CREATE OR REPLACE VIEW public.comind_workflow_cost_summary
WITH (security_invoker = TRUE)
AS
SELECT
    e.id AS envelope_id,
    e.workflow_run_id,
    e.project_id,
    e.owner_agent_id,
    e.objective,
    e.environment,
    e.status,
    e.currency,
    e.estimated_cost,
    e.soft_limit_amount,
    e.hard_limit_amount,
    e.actual_cost,
    e.reserved_cost,
    GREATEST(e.hard_limit_amount - e.actual_cost - e.reserved_cost, 0) AS available_budget,
    CASE
        WHEN e.hard_limit_amount = 0 THEN 0
        ELSE ROUND((e.actual_cost / e.hard_limit_amount) * 100, 2)
    END AS hard_limit_percent_used,
    COUNT(u.id) AS usage_event_count,
    e.created_at,
    e.started_at,
    e.completed_at
FROM public.comind_workflow_cost_envelopes e
LEFT JOIN public.comind_usage_events u ON u.envelope_id = e.id
GROUP BY e.id;

ALTER TABLE public.comind_cost_reservation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.comind_cost_reservation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.comind_cost_reservation_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.comind_cost_reservation_events_id_seq TO service_role;

REVOKE ALL ON TABLE public.comind_workflow_cost_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.comind_workflow_cost_summary TO service_role;

REVOKE ALL ON FUNCTION public.comind_reject_cost_reservation_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comind_sync_envelope_reserved_cost(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comind_mark_stale_cost_reservations(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comind_reserve_paid_provider_cost(BIGINT, BIGINT, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comind_finalize_paid_provider_cost(BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comind_close_unspent_paid_provider_reservation(BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.comind_sync_envelope_reserved_cost(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.comind_mark_stale_cost_reservations(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.comind_reserve_paid_provider_cost(BIGINT, BIGINT, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.comind_finalize_paid_provider_cost(BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.comind_close_unspent_paid_provider_reservation(BIGINT, TEXT, TEXT) TO service_role;

COMMENT ON TABLE public.comind_cost_reservation_events IS
    'Append-only paid-provider budget authority transition ledger. Stores identities, monetary results, and machine reason codes only; never prompts, responses, credentials, or provider secrets.';

COMMENT ON FUNCTION public.comind_reserve_paid_provider_cost(BIGINT, BIGINT, UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) IS
    'Atomic idempotent paid-provider budget reservation. Stale and unknown-cost exposure remains held until evidence-backed closure or reconciliation.';

COMMENT ON FUNCTION public.comind_finalize_paid_provider_cost(BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT) IS
    'Idempotent paid-provider settlement. Known costs create one provider_execution usage event; unknown cost remains reserved exposure until reconciliation.';

COMMIT;
