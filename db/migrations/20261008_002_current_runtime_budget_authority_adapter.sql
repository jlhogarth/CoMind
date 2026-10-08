-- CoMind current-runtime budget-authority adapter
-- Version: 1.0.0
-- Date: 2026-10-08
-- Purpose: Bind current comind.cm_* execution provenance to the hardened FinOps authority.
-- Scope: Database contract only. No live provider wiring or live database deployment.

BEGIN;

DO $$
DECLARE
    v_missing TEXT[];
BEGIN
    SELECT ARRAY_AGG(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_project'),
            ('comind.cm_actor'),
            ('comind.cm_agent'),
            ('comind.cm_agent_run'),
            ('comind.cm_conversation'),
            ('comind.cm_message'),
            ('public.comind_workflow_cost_envelopes'),
            ('public.comind_cost_reservations'),
            ('public.comind_service_providers'),
            ('public.comind_cost_reservation_events')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Current-runtime budget authority adapter requires existing tables: %', v_missing;
    END IF;

    IF to_regprocedure('public.comind_reserve_paid_provider_cost(bigint,bigint,uuid,text,text,numeric,timestamp with time zone)') IS NULL
       OR to_regprocedure('public.comind_finalize_paid_provider_cost(bigint,text,text,numeric,text,text)') IS NULL THEN
        RAISE EXCEPTION 'Current-runtime budget authority adapter requires the hardened Issue #57 authority functions';
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS comind.cm_budget_authority_binding (
    binding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id BIGINT NOT NULL UNIQUE
        REFERENCES public.comind_workflow_cost_envelopes(id) ON DELETE RESTRICT,
    workflow_run_id UUID NOT NULL UNIQUE,
    execution_kind TEXT NOT NULL,
    project_id UUID REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
    agent_id UUID REFERENCES comind.cm_agent(agent_id) ON DELETE RESTRICT,
    agent_run_id UUID REFERENCES comind.cm_agent_run(run_id) ON DELETE RESTRICT,
    conversation_id UUID REFERENCES comind.cm_conversation(conv_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_budget_authority_binding_kind_ck CHECK (
        execution_kind IN ('conversation', 'agent_run', 'workflow', 'service')
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_budget_authority_reservation (
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id BIGINT NOT NULL UNIQUE
        REFERENCES public.comind_cost_reservations(id) ON DELETE RESTRICT,
    binding_id UUID NOT NULL
        REFERENCES comind.cm_budget_authority_binding(binding_id) ON DELETE RESTRICT,
    provider_code TEXT NOT NULL,
    operation_name TEXT NOT NULL,
    execution_role TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_budget_authority_reservation_provider_ck CHECK (
        provider_code ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    ),
    CONSTRAINT cm_budget_authority_reservation_role_ck CHECK (
        execution_role ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
    ),
    CONSTRAINT cm_budget_authority_reservation_idempotency_ck CHECK (
        idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'
    ),
    CONSTRAINT cm_budget_authority_reservation_binding_idempotency_uq UNIQUE (
        binding_id, idempotency_key
    )
);

CREATE TABLE IF NOT EXISTS comind.cm_budget_authority_telemetry (
    telemetry_link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id BIGINT NOT NULL UNIQUE
        REFERENCES public.comind_cost_reservations(id) ON DELETE RESTRICT,
    message_id UUID NOT NULL
        REFERENCES comind.cm_message(msg_id) ON DELETE RESTRICT,
    telemetry_locator TEXT NOT NULL,
    telemetry_identity TEXT NOT NULL UNIQUE,
    provider_event_id TEXT,
    rate_card_version TEXT,
    pricing_source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cm_budget_authority_telemetry_locator_ck CHECK (
        telemetry_locator = 'root'
        OR telemetry_locator ~ '^quality_gate[.]passes[.](draft|verifier|repair)$'
    ),
    CONSTRAINT cm_budget_authority_telemetry_identity_ck CHECK (
        telemetry_identity ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
    ),
    CONSTRAINT cm_budget_authority_telemetry_provider_event_ck CHECK (
        provider_event_id IS NULL
        OR provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$'
    )
);

CREATE OR REPLACE FUNCTION comind.cm_reject_budget_authority_adapter_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Current-runtime budget authority adapter provenance is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_budget_authority_binding_immutable
    ON comind.cm_budget_authority_binding;
CREATE TRIGGER trg_cm_budget_authority_binding_immutable
BEFORE UPDATE OR DELETE ON comind.cm_budget_authority_binding
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_budget_authority_adapter_mutation();

DROP TRIGGER IF EXISTS trg_cm_budget_authority_reservation_immutable
    ON comind.cm_budget_authority_reservation;
CREATE TRIGGER trg_cm_budget_authority_reservation_immutable
BEFORE UPDATE OR DELETE ON comind.cm_budget_authority_reservation
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_budget_authority_adapter_mutation();

DROP TRIGGER IF EXISTS trg_cm_budget_authority_telemetry_immutable
    ON comind.cm_budget_authority_telemetry;
CREATE TRIGGER trg_cm_budget_authority_telemetry_immutable
BEFORE UPDATE OR DELETE ON comind.cm_budget_authority_telemetry
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_budget_authority_adapter_mutation();

CREATE OR REPLACE FUNCTION comind.cm_bind_budget_authority_envelope(
    p_envelope_id BIGINT,
    p_execution_kind TEXT,
    p_project_id UUID DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL,
    p_agent_id UUID DEFAULT NULL,
    p_agent_run_id UUID DEFAULT NULL,
    p_conversation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
DECLARE
    v_workflow_run_id UUID;
    v_project_id UUID := p_project_id;
    v_agent_id UUID := p_agent_id;
    v_conversation_project_id UUID;
    v_conversation_org_id UUID;
    v_agent_run_agent_id UUID;
    v_project_org_id UUID;
    v_actor_org_id UUID;
    v_actor_kind TEXT;
    v_agent_org_id UUID;
    v_existing comind.cm_budget_authority_binding%ROWTYPE;
    v_binding_id UUID;
BEGIN
    IF p_execution_kind NOT IN ('conversation', 'agent_run', 'workflow', 'service') THEN
        RAISE EXCEPTION 'Unsupported current-runtime execution kind: %', p_execution_kind;
    END IF;
    IF p_execution_kind = 'conversation' AND p_conversation_id IS NULL THEN
        RAISE EXCEPTION 'Conversation execution requires conversation_id';
    END IF;
    IF p_execution_kind = 'agent_run' AND p_agent_run_id IS NULL THEN
        RAISE EXCEPTION 'Agent-run execution requires agent_run_id';
    END IF;
    IF p_execution_kind = 'service' AND p_actor_id IS NULL THEN
        RAISE EXCEPTION 'Service execution requires actor_id';
    END IF;

    SELECT workflow_run_id
    INTO v_workflow_run_id
    FROM public.comind_workflow_cost_envelopes
    WHERE id = p_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost envelope % does not exist', p_envelope_id;
    END IF;

    IF p_conversation_id IS NOT NULL THEN
        SELECT project_id, org_id
        INTO v_conversation_project_id, v_conversation_org_id
        FROM comind.cm_conversation
        WHERE conv_id = p_conversation_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Current runtime conversation % does not exist', p_conversation_id;
        END IF;
        IF v_project_id IS NOT NULL
           AND v_conversation_project_id IS NOT NULL
           AND v_project_id <> v_conversation_project_id THEN
            RAISE EXCEPTION 'Conversation project conflicts with requested runtime project';
        END IF;
        v_project_id := COALESCE(v_project_id, v_conversation_project_id);
    END IF;

    IF p_agent_run_id IS NOT NULL THEN
        SELECT agent_id
        INTO v_agent_run_agent_id
        FROM comind.cm_agent_run
        WHERE run_id = p_agent_run_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Current runtime agent run % does not exist', p_agent_run_id;
        END IF;
        IF v_agent_id IS NOT NULL
           AND v_agent_run_agent_id IS NOT NULL
           AND v_agent_id <> v_agent_run_agent_id THEN
            RAISE EXCEPTION 'Agent run conflicts with requested runtime agent';
        END IF;
        v_agent_id := COALESCE(v_agent_id, v_agent_run_agent_id);
    END IF;

    IF v_project_id IS NOT NULL THEN
        SELECT org_id INTO v_project_org_id
        FROM comind.cm_project
        WHERE project_id = v_project_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Current runtime project % does not exist', v_project_id;
        END IF;
    END IF;

    IF p_actor_id IS NOT NULL THEN
        SELECT org_id, kind INTO v_actor_org_id, v_actor_kind
        FROM comind.cm_actor
        WHERE actor_id = p_actor_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Current runtime actor % does not exist', p_actor_id;
        END IF;
        IF p_execution_kind = 'service' AND v_actor_kind <> 'service' THEN
            RAISE EXCEPTION 'Service execution requires an actor of kind service';
        END IF;
    END IF;

    IF v_agent_id IS NOT NULL THEN
        SELECT org_id INTO v_agent_org_id
        FROM comind.cm_agent
        WHERE agent_id = v_agent_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Current runtime agent % does not exist', v_agent_id;
        END IF;
    END IF;

    IF v_project_org_id IS NOT NULL AND v_actor_org_id IS NOT NULL
       AND v_project_org_id <> v_actor_org_id THEN
        RAISE EXCEPTION 'Runtime project and actor belong to different organizations';
    END IF;
    IF v_project_org_id IS NOT NULL AND v_agent_org_id IS NOT NULL
       AND v_project_org_id <> v_agent_org_id THEN
        RAISE EXCEPTION 'Runtime project and agent belong to different organizations';
    END IF;
    IF v_project_org_id IS NOT NULL AND v_conversation_org_id IS NOT NULL
       AND v_project_org_id <> v_conversation_org_id THEN
        RAISE EXCEPTION 'Runtime project and conversation belong to different organizations';
    END IF;
    IF v_actor_org_id IS NOT NULL AND v_agent_org_id IS NOT NULL
       AND v_actor_org_id <> v_agent_org_id THEN
        RAISE EXCEPTION 'Runtime actor and agent belong to different organizations';
    END IF;

    SELECT * INTO v_existing
    FROM comind.cm_budget_authority_binding
    WHERE envelope_id = p_envelope_id;

    IF FOUND THEN
        IF v_existing.workflow_run_id <> v_workflow_run_id
           OR v_existing.execution_kind <> p_execution_kind
           OR v_existing.project_id IS DISTINCT FROM v_project_id
           OR v_existing.actor_id IS DISTINCT FROM p_actor_id
           OR v_existing.agent_id IS DISTINCT FROM v_agent_id
           OR v_existing.agent_run_id IS DISTINCT FROM p_agent_run_id
           OR v_existing.conversation_id IS DISTINCT FROM p_conversation_id THEN
            RAISE EXCEPTION 'Cost envelope % already has conflicting current-runtime provenance', p_envelope_id;
        END IF;
        RETURN v_existing.binding_id;
    END IF;

    INSERT INTO comind.cm_budget_authority_binding (
        envelope_id, workflow_run_id, execution_kind, project_id,
        actor_id, agent_id, agent_run_id, conversation_id
    ) VALUES (
        p_envelope_id, v_workflow_run_id, p_execution_kind, v_project_id,
        p_actor_id, v_agent_id, p_agent_run_id, p_conversation_id
    )
    RETURNING binding_id INTO v_binding_id;

    RETURN v_binding_id;
END;
$$;

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

    SELECT * INTO v_binding
    FROM comind.cm_budget_authority_binding
    WHERE binding_id = p_binding_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Current-runtime budget binding % does not exist', p_binding_id;
    END IF;

    SELECT id, billing_currency, active
    INTO v_provider_id, v_provider_currency, v_provider_active
    FROM public.comind_service_providers
    WHERE provider_code = p_provider_code;
    IF NOT FOUND OR NOT v_provider_active THEN
        RAISE EXCEPTION 'Paid provider % is unavailable or inactive', p_provider_code;
    END IF;

    SELECT currency, permitted_provider_codes
    INTO v_envelope_currency, v_permitted
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_binding.envelope_id;
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
        SELECT * INTO v_link
        FROM comind.cm_budget_authority_reservation
        WHERE reservation_id = v_base.reservation_id;

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
        v_event_meta := v_message.meta;
    ELSIF p_telemetry_locator ~ '^quality_gate[.]passes[.](draft|verifier|repair)$' THEN
        v_pass_role := substring(p_telemetry_locator from '^quality_gate[.]passes[.](draft|verifier|repair)$');
        SELECT COUNT(*)::int, MIN(pass)::jsonb
        INTO v_pass_count, v_event_meta
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

    SELECT * INTO v_existing_telemetry
    FROM comind.cm_budget_authority_telemetry
    WHERE reservation_id = p_reservation_id;

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

ALTER TABLE comind.cm_budget_authority_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_budget_authority_reservation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_budget_authority_telemetry ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE comind.cm_budget_authority_binding FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_budget_authority_reservation FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE comind.cm_budget_authority_telemetry FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE comind.cm_budget_authority_binding TO service_role;
GRANT SELECT, INSERT ON TABLE comind.cm_budget_authority_reservation TO service_role;
GRANT SELECT, INSERT ON TABLE comind.cm_budget_authority_telemetry TO service_role;
GRANT USAGE ON SCHEMA comind TO service_role;

REVOKE ALL ON FUNCTION comind.cm_reject_budget_authority_adapter_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_bind_budget_authority_envelope(BIGINT, TEXT, UUID, UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_reserve_paid_provider_execution(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_finalize_paid_provider_message_execution(BIGINT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION comind.cm_bind_budget_authority_envelope(BIGINT, TEXT, UUID, UUID, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_reserve_paid_provider_execution(UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_finalize_paid_provider_message_execution(BIGINT, UUID, TEXT, TEXT) TO service_role;

COMMENT ON TABLE comind.cm_budget_authority_binding IS
    'Append-only adapter binding from current CoMind runtime provenance to the single hardened FinOps cost envelope. Contains no provider pricing or message content.';
COMMENT ON TABLE comind.cm_budget_authority_reservation IS
    'Append-only adapter link from a hardened paid-provider reservation to current runtime execution provenance. Monetary authority remains in the FinOps ledger.';
COMMENT ON TABLE comind.cm_budget_authority_telemetry IS
    'Append-only provenance link from a hardened reservation to authoritative provider telemetry stored in comind.cm_message.meta. Does not duplicate cost values or message content.';

COMMIT;
