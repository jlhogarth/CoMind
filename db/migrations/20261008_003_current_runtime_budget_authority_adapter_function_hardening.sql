-- CoMind current-runtime budget-authority adapter function hardening
-- Version: 1.0.1
-- Date: 2026-10-08
-- Purpose: Qualify PL/pgSQL table references and harden named quality-pass extraction.

BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_reserve_paid_provider_execution(
    p_binding_id UUID,
    p_provider_code TEXT,
    p_operation_name TEXT,
    p_execution_role TEXT,
    p_idempotency_key TEXT,
    p_bounded_exposure_usd NUMERIC,
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
SET search_path = comind, public, pg_temp
AS $$
DECLARE
    v_binding comind.cm_budget_authority_binding%ROWTYPE;
    v_provider_id BIGINT;
    v_provider_currency CHAR(3);
    v_provider_active BOOLEAN;
    v_envelope_currency CHAR(3);
    v_permitted JSONB;
    v_base RECORD;
    v_link comind.cm_budget_authority_reservation%ROWTYPE;
BEGIN
    IF p_provider_code IS NULL OR p_provider_code !~ '^[a-z0-9][a-z0-9._:-]{0,127}$' THEN
        RAISE EXCEPTION 'A bounded provider code is required';
    END IF;
    IF p_execution_role IS NULL OR p_execution_role !~ '^[a-z0-9][a-z0-9._:-]{0,127}$' THEN
        RAISE EXCEPTION 'A bounded execution role is required';
    END IF;

    SELECT b.* INTO v_binding
    FROM comind.cm_budget_authority_binding AS b
    WHERE b.binding_id = p_binding_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Current-runtime budget binding % does not exist', p_binding_id;
    END IF;

    SELECT sp.id, sp.billing_currency, sp.active
    INTO v_provider_id, v_provider_currency, v_provider_active
    FROM public.comind_service_providers AS sp
    WHERE sp.provider_code = p_provider_code;
    IF NOT FOUND OR NOT v_provider_active THEN
        RAISE EXCEPTION 'Paid provider % is unavailable or inactive', p_provider_code;
    END IF;

    SELECT e.currency, e.permitted_provider_codes
    INTO v_envelope_currency, v_permitted
    FROM public.comind_workflow_cost_envelopes AS e
    WHERE e.id = v_binding.envelope_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bound cost envelope % no longer exists', v_binding.envelope_id;
    END IF;

    IF v_provider_currency <> v_envelope_currency THEN
        RAISE EXCEPTION 'Provider currency % does not match envelope currency %',
            v_provider_currency, v_envelope_currency;
    END IF;

    IF jsonb_typeof(v_permitted) <> 'array' THEN
        RAISE EXCEPTION 'Envelope permitted-provider policy is malformed';
    END IF;
    IF jsonb_array_length(v_permitted) > 0
       AND NOT (v_permitted ? p_provider_code) THEN
        RAISE EXCEPTION 'Provider % is not permitted by the bound cost envelope', p_provider_code;
    END IF;

    SELECT * INTO v_base
    FROM public.comind_reserve_paid_provider_cost(
        v_binding.envelope_id,
        v_provider_id,
        NULL,
        p_operation_name,
        p_idempotency_key,
        p_bounded_exposure_usd,
        p_expires_at
    );

    IF v_base.reservation_id IS NOT NULL THEN
        SELECT ar.* INTO v_link
        FROM comind.cm_budget_authority_reservation AS ar
        WHERE ar.reservation_id = v_base.reservation_id;

        IF FOUND THEN
            IF v_link.binding_id <> p_binding_id
               OR v_link.provider_code <> p_provider_code
               OR v_link.operation_name <> p_operation_name
               OR v_link.execution_role <> p_execution_role
               OR v_link.idempotency_key <> p_idempotency_key THEN
                RAISE EXCEPTION 'Reservation % has conflicting current-runtime provenance', v_base.reservation_id;
            END IF;
        ELSIF v_base.idempotent THEN
            RAISE EXCEPTION 'Existing reservation % lacks current-runtime adapter provenance', v_base.reservation_id;
        ELSE
            INSERT INTO comind.cm_budget_authority_reservation (
                reservation_id, binding_id, provider_code, operation_name,
                execution_role, idempotency_key
            ) VALUES (
                v_base.reservation_id, p_binding_id, p_provider_code, p_operation_name,
                p_execution_role, p_idempotency_key
            );
        END IF;
    END IF;

    RETURN QUERY SELECT
        v_base.reservation_id,
        v_base.approved,
        v_base.remaining_budget,
        v_base.reservation_status,
        v_base.decision_reason,
        v_base.idempotent;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_finalize_paid_provider_message_execution(
    p_reservation_id BIGINT,
    p_message_id UUID,
    p_telemetry_locator TEXT,
    p_reason_code TEXT DEFAULT 'runtime_message_telemetry_settlement'
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
SET search_path = comind, public, pg_temp
AS $$
DECLARE
    v_reservation_link comind.cm_budget_authority_reservation%ROWTYPE;
    v_binding comind.cm_budget_authority_binding%ROWTYPE;
    v_message RECORD;
    v_event_meta JSONB;
    v_pass_role TEXT;
    v_pass_count INTEGER;
    v_provider TEXT;
    v_provider_event_id TEXT;
    v_telemetry_identity TEXT;
    v_status TEXT;
    v_cost NUMERIC(24,12);
    v_currency TEXT;
    v_outcome TEXT;
    v_rate_card_version TEXT;
    v_pricing_source TEXT;
    v_base RECORD;
    v_existing_telemetry comind.cm_budget_authority_telemetry%ROWTYPE;
BEGIN
    SELECT ar.* INTO v_reservation_link
    FROM comind.cm_budget_authority_reservation AS ar
    WHERE ar.reservation_id = p_reservation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation % lacks current-runtime adapter provenance', p_reservation_id;
    END IF;

    SELECT b.* INTO v_binding
    FROM comind.cm_budget_authority_binding AS b
    WHERE b.binding_id = v_reservation_link.binding_id;

    IF v_binding.conversation_id IS NULL THEN
        RAISE EXCEPTION 'Message telemetry settlement requires a conversation-bound execution';
    END IF;

    SELECT m.msg_id, m.conv_id, m.role, m.meta
    INTO v_message
    FROM comind.cm_message AS m
    WHERE m.msg_id = p_message_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Runtime telemetry message % does not exist', p_message_id;
    END IF;
    IF v_message.conv_id <> v_binding.conversation_id THEN
        RAISE EXCEPTION 'Telemetry message belongs to a different conversation than the budget binding';
    END IF;
    IF v_message.role <> 'assistant' THEN
        RAISE EXCEPTION 'Provider telemetry settlement requires an assistant message';
    END IF;
    IF jsonb_typeof(v_message.meta) <> 'object' THEN
        RAISE EXCEPTION 'Assistant message telemetry is missing or malformed';
    END IF;

    IF p_telemetry_locator = 'root' THEN
        v_event_meta := v_message.meta;
    ELSIF p_telemetry_locator ~ '^quality_gate[.]passes[.](draft|verifier|repair)$' THEN
        v_pass_role := substring(
            p_telemetry_locator
            FROM '^quality_gate[.]passes[.](draft|verifier|repair)$'
        );
        SELECT COUNT(*)::int, MIN(p.item::text)::jsonb
        INTO v_pass_count, v_event_meta
        FROM jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(v_message.meta#>'{quality_gate,passes}') = 'array'
                    THEN v_message.meta#>'{quality_gate,passes}'
                ELSE '[]'::jsonb
            END
        ) AS p(item)
        WHERE p.item->>'role' = v_pass_role;
        IF v_pass_count <> 1 THEN
            RAISE EXCEPTION 'Telemetry locator % resolved to % provider pass records',
                p_telemetry_locator, v_pass_count;
        END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported telemetry locator: %', p_telemetry_locator;
    END IF;

    v_provider := NULLIF(v_event_meta->>'provider', '');
    IF v_provider IS DISTINCT FROM v_reservation_link.provider_code THEN
        RAISE EXCEPTION 'Telemetry provider conflicts with reserved provider';
    END IF;

    v_provider_event_id := NULLIF(v_event_meta->>'response_id', '');
    v_status := COALESCE(NULLIF(v_event_meta->>'status', ''), 'unknown');
    v_currency := NULLIF(v_event_meta#>>'{cost,currency}', '');
    v_rate_card_version := NULLIF(v_event_meta#>>'{cost,rate_card_version}', '');
    v_pricing_source := NULLIF(v_event_meta#>>'{cost,pricing_source}', '');
    v_telemetry_identity := 'cm_message:' || p_message_id::text || ':' || p_telemetry_locator;

    IF v_currency IS NOT NULL AND v_currency <> 'USD' THEN
        RAISE EXCEPTION 'Current reviewed provider estimator settlement requires USD telemetry';
    END IF;

    IF jsonb_typeof(v_event_meta#>'{cost,estimated_cost_usd}') = 'number' THEN
        v_cost := (v_event_meta#>>'{cost,estimated_cost_usd}')::NUMERIC(24,12);
        IF v_cost < 0 THEN
            RAISE EXCEPTION 'Telemetry estimated cost must be nonnegative';
        END IF;
    ELSE
        v_cost := NULL;
    END IF;

    IF v_cost IS NULL THEN
        v_outcome := 'unknown_cost';
    ELSIF v_status = 'failed' THEN
        v_outcome := 'failed';
    ELSIF v_status = 'succeeded' THEN
        v_outcome := 'finalized';
    ELSE
        RAISE EXCEPTION 'Telemetry status % is not safe to settle with a known cost', v_status;
    END IF;

    SELECT * INTO v_base
    FROM public.comind_finalize_paid_provider_cost(
        p_reservation_id,
        v_provider_event_id,
        v_telemetry_identity,
        v_cost,
        v_outcome,
        p_reason_code
    );

    SELECT at.* INTO v_existing_telemetry
    FROM comind.cm_budget_authority_telemetry AS at
    WHERE at.reservation_id = p_reservation_id;

    IF FOUND THEN
        IF v_existing_telemetry.message_id <> p_message_id
           OR v_existing_telemetry.telemetry_locator <> p_telemetry_locator
           OR v_existing_telemetry.telemetry_identity <> v_telemetry_identity
           OR v_existing_telemetry.provider_event_id IS DISTINCT FROM v_provider_event_id THEN
            RAISE EXCEPTION 'Reservation % has conflicting telemetry provenance', p_reservation_id;
        END IF;
    ELSIF v_base.idempotent THEN
        RAISE EXCEPTION 'Finalized reservation % lacks current-runtime telemetry provenance', p_reservation_id;
    ELSE
        INSERT INTO comind.cm_budget_authority_telemetry (
            reservation_id, message_id, telemetry_locator, telemetry_identity,
            provider_event_id, rate_card_version, pricing_source
        ) VALUES (
            p_reservation_id, p_message_id, p_telemetry_locator, v_telemetry_identity,
            v_provider_event_id, v_rate_card_version, v_pricing_source
        );
    END IF;

    RETURN QUERY SELECT
        v_base.reservation_id,
        v_base.usage_event_id,
        v_base.reservation_status,
        v_base.accounted_cost,
        v_base.idempotent;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_reserve_paid_provider_execution(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_finalize_paid_provider_message_execution(BIGINT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_reserve_paid_provider_execution(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_finalize_paid_provider_message_execution(BIGINT, UUID, TEXT, TEXT) TO service_role;

COMMIT;
