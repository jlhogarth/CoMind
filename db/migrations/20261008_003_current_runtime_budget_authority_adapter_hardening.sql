-- CoMind current-runtime budget-authority adapter hardening
-- Version: 1.0.1
-- Date: 2026-10-08
-- Purpose: Fail closed on ambiguous quality telemetry and incomplete known-cost provenance.
-- Scope: Database contract only. No live provider wiring or live database deployment.

BEGIN;

DO $$
BEGIN
    IF to_regclass('comind.cm_budget_authority_telemetry') IS NULL
       OR to_regprocedure('comind.cm_finalize_paid_provider_message_execution(bigint,uuid,text,text)') IS NULL THEN
        RAISE EXCEPTION 'Current-runtime budget authority adapter v1.0.0 must be installed first';
    END IF;
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
    SELECT * INTO v_reservation_link
    FROM comind.cm_budget_authority_reservation
    WHERE reservation_id = p_reservation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation % lacks current-runtime adapter provenance', p_reservation_id;
    END IF;

    SELECT * INTO v_binding
    FROM comind.cm_budget_authority_binding
    WHERE binding_id = v_reservation_link.binding_id;

    IF v_binding.conversation_id IS NULL THEN
        RAISE EXCEPTION 'Message telemetry settlement requires a conversation-bound execution';
    END IF;

    SELECT msg_id, conv_id, role, meta
    INTO v_message
    FROM comind.cm_message
    WHERE msg_id = p_message_id;
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
        IF jsonb_typeof(v_message.meta->'quality_gate') = 'object' THEN
            RAISE EXCEPTION 'Quality-gated assistant telemetry must settle individual provider passes, not root metadata';
        END IF;
        v_event_meta := v_message.meta;
    ELSIF p_telemetry_locator ~ '^quality_gate[.]passes[.](draft|verifier|repair)$' THEN
        v_pass_role := substring(
            p_telemetry_locator
            from '^quality_gate[.]passes[.](draft|verifier|repair)$'
        );

        SELECT COUNT(*)::int
        INTO v_pass_count
        FROM jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(v_message.meta#>'{quality_gate,passes}') = 'array'
                    THEN v_message.meta#>'{quality_gate,passes}'
                ELSE '[]'::jsonb
            END
        ) AS pass
        WHERE pass->>'role' = v_pass_role;

        IF v_pass_count <> 1 THEN
            RAISE EXCEPTION 'Telemetry locator % resolved to % provider pass records',
                p_telemetry_locator, v_pass_count;
        END IF;

        SELECT pass
        INTO v_event_meta
        FROM jsonb_array_elements(v_message.meta#>'{quality_gate,passes}') AS pass
        WHERE pass->>'role' = v_pass_role
        LIMIT 1;
    ELSE
        RAISE EXCEPTION 'Unsupported telemetry locator: %', p_telemetry_locator;
    END IF;

    v_provider := NULLIF(v_event_meta->>'provider', '');
    IF v_provider IS DISTINCT FROM v_reservation_link.provider_code THEN
        RAISE EXCEPTION 'Telemetry provider conflicts with reserved provider';
    END IF;

    v_provider_event_id := COALESCE(
        NULLIF(v_event_meta->>'response_id', ''),
        NULLIF(v_event_meta->>'request_id', '')
    );
    v_status := COALESCE(NULLIF(v_event_meta->>'status', ''), 'unknown');
    v_currency := NULLIF(v_event_meta#>>'{cost,currency}', '');
    v_rate_card_version := NULLIF(v_event_meta#>>'{cost,rate_card_version}', '');
    v_pricing_source := NULLIF(v_event_meta#>>'{cost,pricing_source}', '');
    v_telemetry_identity := 'cm_message:' || p_message_id::text || ':' || p_telemetry_locator;

    IF jsonb_typeof(v_event_meta#>'{cost,estimated_cost_usd}') = 'number' THEN
        v_cost := (v_event_meta#>>'{cost,estimated_cost_usd}')::NUMERIC(24,12);
        IF v_cost < 0 THEN
            RAISE EXCEPTION 'Telemetry estimated cost must be nonnegative';
        END IF;
    ELSE
        v_cost := NULL;
    END IF;

    IF v_cost IS NOT NULL THEN
        IF v_currency IS DISTINCT FROM 'USD' THEN
            RAISE EXCEPTION 'Known-cost settlement requires explicit USD telemetry currency';
        END IF;
        IF v_rate_card_version IS NULL OR v_pricing_source IS NULL THEN
            RAISE EXCEPTION 'Known-cost settlement requires rate-card version and pricing-source provenance';
        END IF;
    ELSIF v_currency IS NOT NULL AND v_currency <> 'USD' THEN
        RAISE EXCEPTION 'Current reviewed provider estimator settlement requires USD telemetry';
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

    SELECT * INTO v_existing_telemetry
    FROM comind.cm_budget_authority_telemetry
    WHERE reservation_id = p_reservation_id;

    IF FOUND THEN
        IF v_existing_telemetry.message_id <> p_message_id
           OR v_existing_telemetry.telemetry_locator <> p_telemetry_locator
           OR v_existing_telemetry.telemetry_identity <> v_telemetry_identity
           OR v_existing_telemetry.provider_event_id IS DISTINCT FROM v_provider_event_id
           OR v_existing_telemetry.rate_card_version IS DISTINCT FROM v_rate_card_version
           OR v_existing_telemetry.pricing_source IS DISTINCT FROM v_pricing_source THEN
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

REVOKE ALL ON FUNCTION comind.cm_finalize_paid_provider_message_execution(BIGINT, UUID, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_finalize_paid_provider_message_execution(BIGINT, UUID, TEXT, TEXT)
TO service_role;

COMMENT ON FUNCTION comind.cm_finalize_paid_provider_message_execution(BIGINT, UUID, TEXT, TEXT) IS
    'Settles one hardened reservation from exactly one authoritative provider telemetry event in comind.cm_message.meta. Quality-gated messages must settle draft, verifier, or repair passes individually. Known costs require explicit estimator provenance.';

COMMIT;
