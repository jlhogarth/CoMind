-- CoMind FinOps and Resource Governor
-- Version: 1.0.0
-- Date: 2026-09-10
-- Purpose: Cost-aware routing, bounded autonomous execution, and auditable budget governance.
-- Target: PostgreSQL 15+ / Supabase
-- Dependency: CoMind base schema, including projects(id), agents(id), and
--             comind_governance_decisions(id).

BEGIN;

CREATE TABLE IF NOT EXISTS comind_service_providers (
    id BIGSERIAL PRIMARY KEY,
    provider_code TEXT NOT NULL UNIQUE,
    provider_name TEXT NOT NULL,
    provider_category TEXT NOT NULL,
    billing_currency CHAR(3) NOT NULL DEFAULT 'USD',
    billing_timezone TEXT NOT NULL DEFAULT 'UTC',
    supports_batch BOOLEAN NOT NULL DEFAULT FALSE,
    supports_deferred_processing BOOLEAN NOT NULL DEFAULT FALSE,
    supports_usage_api BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_service_providers_category_ck CHECK (
        provider_category IN ('model', 'compute', 'database', 'storage', 'network',
                              'deployment', 'development', 'communication', 'other')
    ),
    CONSTRAINT comind_service_providers_currency_ck CHECK (
        billing_currency ~ '^[A-Z]{3}$'
    )
);

CREATE TABLE IF NOT EXISTS comind_service_connections (
    id BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES comind_service_providers(id) ON DELETE RESTRICT,
    connection_name TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'development',
    credential_reference TEXT,
    permission_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    connection_status TEXT NOT NULL DEFAULT 'unverified',
    last_verified_at TIMESTAMPTZ,
    last_error TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_service_connections_uq UNIQUE (provider_id, connection_name, environment),
    CONSTRAINT comind_service_connections_environment_ck CHECK (
        environment IN ('local', 'development', 'test', 'staging', 'production')
    ),
    CONSTRAINT comind_service_connections_status_ck CHECK (
        connection_status IN ('unverified', 'connected', 'degraded', 'expired', 'revoked', 'error')
    ),
    CONSTRAINT comind_service_connections_no_secret_ck CHECK (
        credential_reference IS NULL
        OR credential_reference !~* '(token|password|secret|key)\s*[:=]\s*[^/ ]+'
    )
);

CREATE TABLE IF NOT EXISTS comind_service_rate_cards (
    id BIGSERIAL PRIMARY KEY,
    provider_id BIGINT NOT NULL REFERENCES comind_service_providers(id) ON DELETE CASCADE,
    service_code TEXT NOT NULL,
    meter_code TEXT NOT NULL,
    unit_name TEXT NOT NULL,
    unit_quantity NUMERIC(24,8) NOT NULL DEFAULT 1,
    unit_price NUMERIC(24,10) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    effective_from TIMESTAMPTZ NOT NULL,
    effective_until TIMESTAMPTZ,
    preferred_processing_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
    pricing_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_url TEXT,
    source_version TEXT,
    verified_at TIMESTAMPTZ NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_service_rate_cards_unit_quantity_ck CHECK (unit_quantity > 0),
    CONSTRAINT comind_service_rate_cards_unit_price_ck CHECK (unit_price >= 0),
    CONSTRAINT comind_service_rate_cards_period_ck CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT comind_service_rate_cards_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT comind_service_rate_cards_uq UNIQUE (
        provider_id, service_code, meter_code, effective_from
    )
);

CREATE TABLE IF NOT EXISTS comind_budget_policies (
    id BIGSERIAL PRIMARY KEY,
    policy_name TEXT NOT NULL UNIQUE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    environment TEXT NOT NULL DEFAULT 'development',
    period_type TEXT NOT NULL DEFAULT 'task',
    soft_limit_amount NUMERIC(20,6) NOT NULL,
    hard_limit_amount NUMERIC(20,6) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    warning_threshold_percent NUMERIC(5,2) NOT NULL DEFAULT 80,
    permitted_provider_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    prohibited_meter_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    autonomous_through_level SMALLINT NOT NULL DEFAULT 2,
    requires_human_above_amount NUMERIC(20,6),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_budget_policies_environment_ck CHECK (
        environment IN ('local', 'development', 'test', 'staging', 'production')
    ),
    CONSTRAINT comind_budget_policies_period_ck CHECK (
        period_type IN ('task', 'workflow', 'daily', 'weekly', 'monthly', 'project')
    ),
    CONSTRAINT comind_budget_policies_limits_ck CHECK (
        soft_limit_amount >= 0 AND hard_limit_amount >= soft_limit_amount
    ),
    CONSTRAINT comind_budget_policies_warning_ck CHECK (
        warning_threshold_percent > 0 AND warning_threshold_percent <= 100
    ),
    CONSTRAINT comind_budget_policies_authority_ck CHECK (
        autonomous_through_level BETWEEN 0 AND 4
    ),
    CONSTRAINT comind_budget_policies_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT comind_budget_policies_period_range_ck CHECK (
        effective_until IS NULL OR effective_until > effective_from
    )
);

CREATE TABLE IF NOT EXISTS comind_workflow_cost_envelopes (
    id BIGSERIAL PRIMARY KEY,
    workflow_run_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    owner_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    budget_policy_id BIGINT REFERENCES comind_budget_policies(id) ON DELETE SET NULL,
    objective TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'development',
    capability_level SMALLINT NOT NULL DEFAULT 1,
    estimated_cost NUMERIC(20,6) NOT NULL DEFAULT 0,
    soft_limit_amount NUMERIC(20,6) NOT NULL,
    hard_limit_amount NUMERIC(20,6) NOT NULL,
    actual_cost NUMERIC(20,6) NOT NULL DEFAULT 0,
    reserved_cost NUMERIC(20,6) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    max_iterations INTEGER NOT NULL DEFAULT 8,
    iterations_used INTEGER NOT NULL DEFAULT 0,
    max_duration_seconds INTEGER NOT NULL DEFAULT 1200,
    permitted_provider_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    required_quality_threshold NUMERIC(5,4),
    required_confidence_threshold NUMERIC(5,4),
    minimum_marginal_value NUMERIC(5,4) NOT NULL DEFAULT 0.0500,
    stop_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'planned',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_workflow_cost_envelopes_environment_ck CHECK (
        environment IN ('local', 'development', 'test', 'staging', 'production')
    ),
    CONSTRAINT comind_workflow_cost_envelopes_capability_ck CHECK (
        capability_level BETWEEN 0 AND 4
    ),
    CONSTRAINT comind_workflow_cost_envelopes_limits_ck CHECK (
        estimated_cost >= 0
        AND soft_limit_amount >= 0
        AND hard_limit_amount >= soft_limit_amount
        AND actual_cost >= 0
        AND reserved_cost >= 0
    ),
    CONSTRAINT comind_workflow_cost_envelopes_iteration_ck CHECK (
        max_iterations > 0 AND iterations_used >= 0 AND iterations_used <= max_iterations
    ),
    CONSTRAINT comind_workflow_cost_envelopes_duration_ck CHECK (max_duration_seconds > 0),
    CONSTRAINT comind_workflow_cost_envelopes_quality_ck CHECK (
        required_quality_threshold IS NULL
        OR required_quality_threshold BETWEEN 0 AND 1
    ),
    CONSTRAINT comind_workflow_cost_envelopes_confidence_ck CHECK (
        required_confidence_threshold IS NULL
        OR required_confidence_threshold BETWEEN 0 AND 1
    ),
    CONSTRAINT comind_workflow_cost_envelopes_marginal_value_ck CHECK (
        minimum_marginal_value BETWEEN 0 AND 1
    ),
    CONSTRAINT comind_workflow_cost_envelopes_status_ck CHECK (
        status IN ('planned', 'authorized', 'running', 'paused', 'halted_budget',
                   'halted_policy', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT comind_workflow_cost_envelopes_currency_ck CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS comind_cost_reservations (
    id BIGSERIAL PRIMARY KEY,
    envelope_id BIGINT NOT NULL REFERENCES comind_workflow_cost_envelopes(id) ON DELETE CASCADE,
    provider_id BIGINT NOT NULL REFERENCES comind_service_providers(id) ON DELETE RESTRICT,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    operation_name TEXT NOT NULL,
    reserved_amount NUMERIC(20,6) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ NOT NULL,
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_cost_reservations_amount_ck CHECK (reserved_amount > 0),
    CONSTRAINT comind_cost_reservations_status_ck CHECK (
        status IN ('active', 'consumed', 'released', 'expired', 'cancelled')
    ),
    CONSTRAINT comind_cost_reservations_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT comind_cost_reservations_release_ck CHECK (
        (status = 'active' AND released_at IS NULL)
        OR (status <> 'active')
    )
);

CREATE TABLE IF NOT EXISTS comind_routing_decisions (
    id BIGSERIAL PRIMARY KEY,
    envelope_id BIGINT NOT NULL REFERENCES comind_workflow_cost_envelopes(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    selected_provider_id BIGINT REFERENCES comind_service_providers(id) ON DELETE RESTRICT,
    selected_service_code TEXT,
    task_class TEXT NOT NULL,
    sensitivity_class TEXT NOT NULL DEFAULT 'internal',
    required_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    considered_routes JSONB NOT NULL DEFAULT '[]'::jsonb,
    selection_rationale TEXT NOT NULL,
    estimated_cost NUMERIC(20,6) NOT NULL DEFAULT 0,
    estimated_latency_ms BIGINT,
    expected_quality NUMERIC(5,4),
    local_execution_considered BOOLEAN NOT NULL DEFAULT FALSE,
    cache_considered BOOLEAN NOT NULL DEFAULT FALSE,
    batch_considered BOOLEAN NOT NULL DEFAULT FALSE,
    deferred_processing_considered BOOLEAN NOT NULL DEFAULT FALSE,
    decision_status TEXT NOT NULL DEFAULT 'selected',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_routing_decisions_cost_ck CHECK (estimated_cost >= 0),
    CONSTRAINT comind_routing_decisions_quality_ck CHECK (
        expected_quality IS NULL OR expected_quality BETWEEN 0 AND 1
    ),
    CONSTRAINT comind_routing_decisions_sensitivity_ck CHECK (
        sensitivity_class IN ('public', 'internal', 'confidential', 'restricted')
    ),
    CONSTRAINT comind_routing_decisions_status_ck CHECK (
        decision_status IN ('selected', 'rejected', 'superseded', 'blocked', 'executed')
    )
);

CREATE TABLE IF NOT EXISTS comind_usage_events (
    id BIGSERIAL PRIMARY KEY,
    envelope_id BIGINT NOT NULL REFERENCES comind_workflow_cost_envelopes(id) ON DELETE CASCADE,
    reservation_id BIGINT REFERENCES comind_cost_reservations(id) ON DELETE SET NULL,
    routing_decision_id BIGINT REFERENCES comind_routing_decisions(id) ON DELETE SET NULL,
    provider_id BIGINT NOT NULL REFERENCES comind_service_providers(id) ON DELETE RESTRICT,
    rate_card_id BIGINT REFERENCES comind_service_rate_cards(id) ON DELETE SET NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    provider_event_id TEXT,
    meter_code TEXT NOT NULL,
    quantity NUMERIC(24,8) NOT NULL,
    measured_cost NUMERIC(20,6) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reconciled_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_usage_events_quantity_ck CHECK (quantity >= 0),
    CONSTRAINT comind_usage_events_cost_ck CHECK (measured_cost >= 0),
    CONSTRAINT comind_usage_events_currency_ck CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT comind_usage_events_provider_event_uq UNIQUE (provider_id, provider_event_id)
);

CREATE TABLE IF NOT EXISTS comind_execution_checkpoints (
    id BIGSERIAL PRIMARY KEY,
    envelope_id BIGINT NOT NULL REFERENCES comind_workflow_cost_envelopes(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    iteration_number INTEGER NOT NULL,
    cumulative_cost NUMERIC(20,6) NOT NULL DEFAULT 0,
    progress_score NUMERIC(5,4),
    marginal_value_score NUMERIC(5,4),
    confidence_score NUMERIC(5,4),
    continuation_decision TEXT NOT NULL,
    continuation_rationale TEXT NOT NULL,
    next_action TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_execution_checkpoints_iteration_ck CHECK (iteration_number > 0),
    CONSTRAINT comind_execution_checkpoints_cost_ck CHECK (cumulative_cost >= 0),
    CONSTRAINT comind_execution_checkpoints_progress_ck CHECK (
        progress_score IS NULL OR progress_score BETWEEN 0 AND 1
    ),
    CONSTRAINT comind_execution_checkpoints_value_ck CHECK (
        marginal_value_score IS NULL OR marginal_value_score BETWEEN 0 AND 1
    ),
    CONSTRAINT comind_execution_checkpoints_confidence_ck CHECK (
        confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1
    ),
    CONSTRAINT comind_execution_checkpoints_decision_ck CHECK (
        continuation_decision IN ('continue', 'change_route', 'pause', 'complete', 'escalate', 'halt')
    ),
    CONSTRAINT comind_execution_checkpoints_uq UNIQUE (envelope_id, iteration_number)
);

CREATE TABLE IF NOT EXISTS comind_budget_exceptions (
    id BIGSERIAL PRIMARY KEY,
    envelope_id BIGINT NOT NULL REFERENCES comind_workflow_cost_envelopes(id) ON DELETE CASCADE,
    requested_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    governance_decision_id BIGINT REFERENCES comind_governance_decisions(id) ON DELETE SET NULL,
    requested_additional_amount NUMERIC(20,6) NOT NULL,
    requested_new_hard_limit NUMERIC(20,6) NOT NULL,
    expected_incremental_value TEXT NOT NULL,
    alternatives_attempted JSONB NOT NULL DEFAULT '[]'::jsonb,
    consequence_of_denial TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decided_by TEXT,
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_budget_exceptions_amount_ck CHECK (
        requested_additional_amount > 0 AND requested_new_hard_limit > 0
    ),
    CONSTRAINT comind_budget_exceptions_status_ck CHECK (
        status IN ('pending', 'approved', 'denied', 'withdrawn', 'expired')
    ),
    CONSTRAINT comind_budget_exceptions_decision_ck CHECK (
        (status = 'pending' AND decided_at IS NULL)
        OR (status <> 'pending')
    )
);

CREATE TABLE IF NOT EXISTS comind_cost_alerts (
    id BIGSERIAL PRIMARY KEY,
    envelope_id BIGINT REFERENCES comind_workflow_cost_envelopes(id) ON DELETE CASCADE,
    provider_id BIGINT REFERENCES comind_service_providers(id) ON DELETE SET NULL,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT comind_cost_alerts_type_ck CHECK (
        alert_type IN ('soft_limit', 'hard_limit', 'rate_change', 'anomaly', 'stale_rate_card',
                       'reservation_expiry', 'loop_risk', 'forecast_overrun')
    ),
    CONSTRAINT comind_cost_alerts_severity_ck CHECK (
        severity IN ('info', 'warning', 'high', 'critical')
    )
);

CREATE INDEX IF NOT EXISTS idx_comind_service_rate_cards_lookup
    ON comind_service_rate_cards (provider_id, service_code, meter_code, effective_from DESC)
    WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_comind_budget_policies_scope
    ON comind_budget_policies (project_id, agent_id, environment, period_type)
    WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_comind_workflow_envelopes_status
    ON comind_workflow_cost_envelopes (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comind_workflow_envelopes_project
    ON comind_workflow_cost_envelopes (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comind_cost_reservations_active
    ON comind_cost_reservations (envelope_id, expires_at)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_comind_usage_events_envelope_time
    ON comind_usage_events (envelope_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_comind_usage_events_provider_time
    ON comind_usage_events (provider_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_comind_routing_decisions_envelope
    ON comind_routing_decisions (envelope_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comind_execution_checkpoints_envelope
    ON comind_execution_checkpoints (envelope_id, iteration_number DESC);

CREATE INDEX IF NOT EXISTS idx_comind_budget_exceptions_pending
    ON comind_budget_exceptions (created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_comind_cost_alerts_open
    ON comind_cost_alerts (severity, created_at DESC)
    WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION comind_finops_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comind_service_providers_updated_at ON comind_service_providers;
CREATE TRIGGER trg_comind_service_providers_updated_at
BEFORE UPDATE ON comind_service_providers
FOR EACH ROW EXECUTE FUNCTION comind_finops_set_updated_at();

DROP TRIGGER IF EXISTS trg_comind_service_connections_updated_at ON comind_service_connections;
CREATE TRIGGER trg_comind_service_connections_updated_at
BEFORE UPDATE ON comind_service_connections
FOR EACH ROW EXECUTE FUNCTION comind_finops_set_updated_at();

DROP TRIGGER IF EXISTS trg_comind_budget_policies_updated_at ON comind_budget_policies;
CREATE TRIGGER trg_comind_budget_policies_updated_at
BEFORE UPDATE ON comind_budget_policies
FOR EACH ROW EXECUTE FUNCTION comind_finops_set_updated_at();

DROP TRIGGER IF EXISTS trg_comind_workflow_envelopes_updated_at ON comind_workflow_cost_envelopes;
CREATE TRIGGER trg_comind_workflow_envelopes_updated_at
BEFORE UPDATE ON comind_workflow_cost_envelopes
FOR EACH ROW EXECUTE FUNCTION comind_finops_set_updated_at();

CREATE OR REPLACE FUNCTION comind_reserve_cost(
    p_envelope_id BIGINT,
    p_provider_id BIGINT,
    p_agent_id UUID,
    p_operation_name TEXT,
    p_requested_amount NUMERIC,
    p_expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '15 minutes'
)
RETURNS TABLE (
    reservation_id BIGINT,
    approved BOOLEAN,
    remaining_budget NUMERIC,
    decision_reason TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_envelope comind_workflow_cost_envelopes%ROWTYPE;
    v_active_reservations NUMERIC(20,6);
    v_reservation_id BIGINT;
BEGIN
    IF p_requested_amount IS NULL OR p_requested_amount <= 0 THEN
        RAISE EXCEPTION 'Requested reservation amount must be greater than zero';
    END IF;

    SELECT * INTO v_envelope
    FROM comind_workflow_cost_envelopes
    WHERE id = p_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost envelope % does not exist', p_envelope_id;
    END IF;

    UPDATE comind_cost_reservations
    SET status = 'expired', released_at = NOW()
    WHERE envelope_id = p_envelope_id
      AND status = 'active'
      AND expires_at <= NOW();

    SELECT COALESCE(SUM(reserved_amount), 0)
    INTO v_active_reservations
    FROM comind_cost_reservations
    WHERE envelope_id = p_envelope_id
      AND status = 'active'
      AND expires_at > NOW();

    IF v_envelope.status NOT IN ('authorized', 'running') THEN
        RETURN QUERY SELECT NULL::BIGINT, FALSE,
            GREATEST(v_envelope.hard_limit_amount - v_envelope.actual_cost - v_active_reservations, 0),
            'Envelope is not authorized or running'::TEXT;
        RETURN;
    END IF;

    IF v_envelope.actual_cost + v_active_reservations + p_requested_amount
       > v_envelope.hard_limit_amount THEN
        UPDATE comind_workflow_cost_envelopes
        SET status = 'halted_budget', reserved_cost = v_active_reservations
        WHERE id = p_envelope_id;

        INSERT INTO comind_cost_alerts (
            envelope_id, provider_id, alert_type, severity, message, evidence
        ) VALUES (
            p_envelope_id,
            p_provider_id,
            'hard_limit',
            'high',
            'Cost reservation denied because it would exceed the workflow hard limit.',
            jsonb_build_object(
                'requested_amount', p_requested_amount,
                'actual_cost', v_envelope.actual_cost,
                'active_reservations', v_active_reservations,
                'hard_limit', v_envelope.hard_limit_amount
            )
        );

        RETURN QUERY SELECT NULL::BIGINT, FALSE,
            GREATEST(v_envelope.hard_limit_amount - v_envelope.actual_cost - v_active_reservations, 0),
            'Requested cost exceeds the hard limit'::TEXT;
        RETURN;
    END IF;

    INSERT INTO comind_cost_reservations (
        envelope_id, provider_id, agent_id, operation_name,
        reserved_amount, currency, expires_at
    ) VALUES (
        p_envelope_id, p_provider_id, p_agent_id, p_operation_name,
        p_requested_amount, v_envelope.currency, p_expires_at
    )
    RETURNING id INTO v_reservation_id;

    UPDATE comind_workflow_cost_envelopes
    SET reserved_cost = v_active_reservations + p_requested_amount
    WHERE id = p_envelope_id;

    RETURN QUERY SELECT v_reservation_id, TRUE,
        v_envelope.hard_limit_amount - v_envelope.actual_cost
            - v_active_reservations - p_requested_amount,
        'Reservation approved'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION comind_record_usage(
    p_envelope_id BIGINT,
    p_reservation_id BIGINT,
    p_routing_decision_id BIGINT,
    p_provider_id BIGINT,
    p_rate_card_id BIGINT,
    p_agent_id UUID,
    p_provider_event_id TEXT,
    p_meter_code TEXT,
    p_quantity NUMERIC,
    p_measured_cost NUMERIC,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_envelope comind_workflow_cost_envelopes%ROWTYPE;
    v_usage_event_id BIGINT;
    v_reservation_amount NUMERIC(20,6) := 0;
    v_active_reservations NUMERIC(20,6);
BEGIN
    IF p_quantity < 0 OR p_measured_cost < 0 THEN
        RAISE EXCEPTION 'Usage quantity and measured cost must be nonnegative';
    END IF;

    SELECT * INTO v_envelope
    FROM comind_workflow_cost_envelopes
    WHERE id = p_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost envelope % does not exist', p_envelope_id;
    END IF;

    IF p_reservation_id IS NOT NULL THEN
        SELECT reserved_amount INTO v_reservation_amount
        FROM comind_cost_reservations
        WHERE id = p_reservation_id
          AND envelope_id = p_envelope_id
          AND status = 'active'
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Active reservation % does not belong to envelope %',
                p_reservation_id, p_envelope_id;
        END IF;

        UPDATE comind_cost_reservations
        SET status = 'consumed', released_at = NOW()
        WHERE id = p_reservation_id;
    END IF;

    INSERT INTO comind_usage_events (
        envelope_id, reservation_id, routing_decision_id, provider_id,
        rate_card_id, agent_id, provider_event_id, meter_code,
        quantity, measured_cost, currency, metadata
    ) VALUES (
        p_envelope_id, p_reservation_id, p_routing_decision_id, p_provider_id,
        p_rate_card_id, p_agent_id, p_provider_event_id, p_meter_code,
        p_quantity, p_measured_cost, v_envelope.currency, COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_usage_event_id;

    SELECT COALESCE(SUM(reserved_amount), 0)
    INTO v_active_reservations
    FROM comind_cost_reservations
    WHERE envelope_id = p_envelope_id
      AND status = 'active'
      AND expires_at > NOW();

    UPDATE comind_workflow_cost_envelopes
    SET actual_cost = actual_cost + p_measured_cost,
        reserved_cost = v_active_reservations,
        status = CASE
            WHEN actual_cost + p_measured_cost >= hard_limit_amount THEN 'halted_budget'
            ELSE status
        END
    WHERE id = p_envelope_id;

    IF v_envelope.actual_cost + p_measured_cost >= v_envelope.hard_limit_amount THEN
        INSERT INTO comind_cost_alerts (
            envelope_id, provider_id, alert_type, severity, message, evidence
        ) VALUES (
            p_envelope_id,
            p_provider_id,
            'hard_limit',
            'critical',
            'Workflow reached or exceeded its hard cost limit.',
            jsonb_build_object(
                'previous_actual_cost', v_envelope.actual_cost,
                'usage_event_cost', p_measured_cost,
                'hard_limit', v_envelope.hard_limit_amount
            )
        );
    ELSIF v_envelope.actual_cost + p_measured_cost >= v_envelope.soft_limit_amount THEN
        INSERT INTO comind_cost_alerts (
            envelope_id, provider_id, alert_type, severity, message, evidence
        ) VALUES (
            p_envelope_id,
            p_provider_id,
            'soft_limit',
            'warning',
            'Workflow reached or exceeded its soft cost limit.',
            jsonb_build_object(
                'current_actual_cost', v_envelope.actual_cost + p_measured_cost,
                'soft_limit', v_envelope.soft_limit_amount
            )
        );
    END IF;

    RETURN v_usage_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION comind_record_checkpoint(
    p_envelope_id BIGINT,
    p_agent_id UUID,
    p_progress_score NUMERIC,
    p_marginal_value_score NUMERIC,
    p_confidence_score NUMERIC,
    p_requested_decision TEXT,
    p_rationale TEXT,
    p_next_action TEXT DEFAULT NULL
)
RETURNS TABLE (
    checkpoint_id BIGINT,
    effective_decision TEXT,
    envelope_status TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_envelope comind_workflow_cost_envelopes%ROWTYPE;
    v_next_iteration INTEGER;
    v_effective_decision TEXT;
    v_status TEXT;
    v_checkpoint_id BIGINT;
BEGIN
    IF p_requested_decision NOT IN ('continue', 'change_route', 'pause', 'complete', 'escalate', 'halt') THEN
        RAISE EXCEPTION 'Invalid checkpoint decision: %', p_requested_decision;
    END IF;

    SELECT * INTO v_envelope
    FROM comind_workflow_cost_envelopes
    WHERE id = p_envelope_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cost envelope % does not exist', p_envelope_id;
    END IF;

    v_next_iteration := v_envelope.iterations_used + 1;
    v_effective_decision := p_requested_decision;
    v_status := v_envelope.status;

    IF v_next_iteration >= v_envelope.max_iterations
       AND p_requested_decision IN ('continue', 'change_route') THEN
        v_effective_decision := 'halt';
        v_status := 'halted_policy';
    ELSIF v_envelope.started_at IS NOT NULL
       AND NOW() >= v_envelope.started_at + make_interval(secs => v_envelope.max_duration_seconds)
       AND p_requested_decision IN ('continue', 'change_route') THEN
        v_effective_decision := 'halt';
        v_status := 'halted_policy';
    ELSIF p_marginal_value_score IS NOT NULL
       AND p_marginal_value_score < v_envelope.minimum_marginal_value
       AND p_requested_decision IN ('continue', 'change_route') THEN
        v_effective_decision := 'halt';
        v_status := 'halted_policy';
    ELSIF p_requested_decision = 'pause' THEN
        v_status := 'paused';
    ELSIF p_requested_decision = 'complete' THEN
        v_status := 'completed';
    ELSIF p_requested_decision = 'halt' THEN
        v_status := 'halted_policy';
    END IF;

    INSERT INTO comind_execution_checkpoints (
        envelope_id, agent_id, iteration_number, cumulative_cost,
        progress_score, marginal_value_score, confidence_score,
        continuation_decision, continuation_rationale, next_action
    ) VALUES (
        p_envelope_id, p_agent_id, v_next_iteration, v_envelope.actual_cost,
        p_progress_score, p_marginal_value_score, p_confidence_score,
        v_effective_decision, p_rationale, p_next_action
    )
    RETURNING id INTO v_checkpoint_id;

    UPDATE comind_workflow_cost_envelopes
    SET iterations_used = v_next_iteration,
        status = v_status,
        completed_at = CASE
            WHEN v_status IN ('completed', 'halted_policy') THEN NOW()
            ELSE completed_at
        END
    WHERE id = p_envelope_id;

    IF v_effective_decision = 'halt' AND p_requested_decision <> 'halt' THEN
        INSERT INTO comind_cost_alerts (
            envelope_id, alert_type, severity, message, evidence
        ) VALUES (
            p_envelope_id,
            'loop_risk',
            'high',
            'Resource Governor halted continued execution at a checkpoint.',
            jsonb_build_object(
                'iteration', v_next_iteration,
                'max_iterations', v_envelope.max_iterations,
                'marginal_value', p_marginal_value_score,
                'minimum_marginal_value', v_envelope.minimum_marginal_value,
                'requested_decision', p_requested_decision
            )
        );
    END IF;

    RETURN QUERY SELECT v_checkpoint_id, v_effective_decision, v_status;
END;
$$;

CREATE OR REPLACE VIEW comind_workflow_cost_summary
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
FROM comind_workflow_cost_envelopes e
LEFT JOIN comind_usage_events u ON u.envelope_id = e.id
GROUP BY e.id;

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'comind_service_providers',
        'comind_service_connections',
        'comind_service_rate_cards',
        'comind_budget_policies',
        'comind_workflow_cost_envelopes',
        'comind_cost_reservations',
        'comind_routing_decisions',
        'comind_usage_events',
        'comind_execution_checkpoints',
        'comind_budget_exceptions',
        'comind_cost_alerts'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', v_table);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', v_table);
    END LOOP;
END;
$$;

REVOKE ALL ON TABLE comind_workflow_cost_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE comind_workflow_cost_summary TO service_role;

REVOKE ALL ON FUNCTION comind_finops_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind_reserve_cost(BIGINT, BIGINT, UUID, TEXT, NUMERIC, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind_record_usage(BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, JSONB)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind_record_checkpoint(BIGINT, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION comind_reserve_cost(BIGINT, BIGINT, UUID, TEXT, NUMERIC, TIMESTAMPTZ)
    TO service_role;
GRANT EXECUTE ON FUNCTION comind_record_usage(BIGINT, BIGINT, BIGINT, BIGINT, BIGINT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, JSONB)
    TO service_role;
GRANT EXECUTE ON FUNCTION comind_record_checkpoint(BIGINT, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT)
    TO service_role;
GRANT USAGE, SELECT ON SEQUENCE
    comind_service_providers_id_seq,
    comind_service_connections_id_seq,
    comind_service_rate_cards_id_seq,
    comind_budget_policies_id_seq,
    comind_workflow_cost_envelopes_id_seq,
    comind_cost_reservations_id_seq,
    comind_routing_decisions_id_seq,
    comind_usage_events_id_seq,
    comind_execution_checkpoints_id_seq,
    comind_budget_exceptions_id_seq,
    comind_cost_alerts_id_seq
TO service_role;

INSERT INTO agents (id, name, type)
SELECT gen_random_uuid(), 'FinOps and Resource Governor', 'governance_agent'
WHERE NOT EXISTS (
    SELECT 1 FROM agents WHERE name = 'FinOps and Resource Governor'
);

INSERT INTO comind_service_providers (
    provider_code, provider_name, provider_category, supports_usage_api, metadata
)
VALUES
    ('local_rtx5090', 'Local RTX 5090', 'compute', FALSE, '{"cost_basis":"allocated_local_compute"}'::jsonb),
    ('openai', 'OpenAI', 'model', TRUE, '{}'::jsonb),
    ('google_gemini', 'Google Gemini', 'model', TRUE, '{}'::jsonb),
    ('supabase', 'Supabase', 'database', TRUE, '{}'::jsonb),
    ('railway', 'Railway', 'compute', TRUE, '{}'::jsonb),
    ('vercel', 'Vercel', 'deployment', TRUE, '{}'::jsonb),
    ('replit', 'Replit', 'development', TRUE, '{"historical_case":"PTSD iteration cost-control lesson"}'::jsonb)
ON CONFLICT (provider_code) DO NOTHING;

INSERT INTO comind_governance_decisions (
    triad_nodes_invoked,
    issue_type,
    issue_payload,
    decision,
    rationale,
    downstream_actions
)
SELECT
    ARRAY['ThreadKeeper', 'Future Continuity Node'],
    'resource_governance_subsystem',
    jsonb_build_object(
        'component', 'FinOps and Resource Governor',
        'version', '1.0.0',
        'principle', 'Use the least expensive capability that reliably satisfies required quality, security, and latency.'
    ),
    'accepted',
    'Adds bounded autonomous execution, atomic cost reservations, dynamic rate cards, and causal cost lineage without granting unbounded spending authority.',
    '["deploy migration to a development branch", "connect provider usage sources", "calibrate budget policies", "review before production activation"]'::jsonb
WHERE NOT EXISTS (
    SELECT 1
    FROM comind_governance_decisions
    WHERE issue_type = 'resource_governance_subsystem'
      AND issue_payload ->> 'version' = '1.0.0'
);

COMMIT;

