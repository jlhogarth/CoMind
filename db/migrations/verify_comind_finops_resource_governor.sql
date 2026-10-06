-- Verification script for CoMind FinOps and Resource Governor v1.0
-- Run after the migration in an isolated development database.

BEGIN;

DO $$
DECLARE
    v_missing TEXT[];
BEGIN
    SELECT ARRAY_AGG(expected_name)
    INTO v_missing
    FROM (
        VALUES
            ('comind_service_providers'),
            ('comind_service_connections'),
            ('comind_service_rate_cards'),
            ('comind_budget_policies'),
            ('comind_workflow_cost_envelopes'),
            ('comind_cost_reservations'),
            ('comind_routing_decisions'),
            ('comind_usage_events'),
            ('comind_execution_checkpoints'),
            ('comind_budget_exceptions'),
            ('comind_cost_alerts')
    ) AS expected(expected_name)
    WHERE to_regclass('public.' || expected_name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing FinOps tables: %', v_missing;
    END IF;
END;
$$;

DO $$
DECLARE
    v_rls_missing TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.relname)
    INTO v_rls_missing
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
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
      )
      AND NOT c.relrowsecurity;

    IF v_rls_missing IS NOT NULL THEN
        RAISE EXCEPTION 'RLS is not enabled on: %', v_rls_missing;
    END IF;
END;
$$;

DO $$
DECLARE
    v_exposed TEXT[];
BEGIN
    SELECT ARRAY_AGG(c.relname)
    INTO v_exposed
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'comind_%'
      AND c.relname IN (
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
      )
      AND (
          has_table_privilege('anon', c.oid, 'SELECT')
          OR has_table_privilege('authenticated', c.oid, 'SELECT')
          OR has_table_privilege('anon', c.oid, 'INSERT')
          OR has_table_privilege('authenticated', c.oid, 'INSERT')
      );

    IF v_exposed IS NOT NULL THEN
        RAISE EXCEPTION 'FinOps tables exposed to API roles: %', v_exposed;
    END IF;
END;
$$;

DO $$
DECLARE
    v_provider_id BIGINT;
    v_agent_id UUID;
    v_envelope_id BIGINT;
    v_reservation_id BIGINT;
    v_approved BOOLEAN;
    v_remaining NUMERIC;
    v_reason TEXT;
    v_usage_id BIGINT;
    v_status TEXT;
    v_actual NUMERIC;
    v_checkpoint_id BIGINT;
    v_effective_decision TEXT;
BEGIN
    SELECT id INTO v_provider_id
    FROM comind_service_providers
    WHERE provider_code = 'replit';

    SELECT id INTO v_agent_id
    FROM agents
    WHERE name = 'FinOps and Resource Governor'
    LIMIT 1;

    INSERT INTO comind_workflow_cost_envelopes (
        owner_agent_id,
        objective,
        environment,
        capability_level,
        estimated_cost,
        soft_limit_amount,
        hard_limit_amount,
        max_iterations,
        max_duration_seconds,
        status
    ) VALUES (
        v_agent_id,
        'Verification replay of bounded PTSD development workflow',
        'test',
        2,
        0.50,
        0.75,
        1.00,
        3,
        300,
        'authorized'
    )
    RETURNING id INTO v_envelope_id;

    SELECT reservation_id, approved, remaining_budget, decision_reason
    INTO v_reservation_id, v_approved, v_remaining, v_reason
    FROM comind_reserve_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'verification-step-1',
        0.60,
        NOW() + INTERVAL '5 minutes'
    );

    IF NOT v_approved OR v_reservation_id IS NULL OR v_remaining <> 0.40 THEN
        RAISE EXCEPTION 'Expected first reservation approval; got approved=%, remaining=%, reason=%',
            v_approved, v_remaining, v_reason;
    END IF;

    SELECT reservation_id, approved, remaining_budget, decision_reason
    INTO v_reservation_id, v_approved, v_remaining, v_reason
    FROM comind_reserve_cost(
        v_envelope_id,
        v_provider_id,
        v_agent_id,
        'verification-step-2',
        0.50,
        NOW() + INTERVAL '5 minutes'
    );

    IF v_approved OR v_remaining <> 0.40 THEN
        RAISE EXCEPTION 'Expected second reservation denial; got approved=%, remaining=%, reason=%',
            v_approved, v_remaining, v_reason;
    END IF;

    UPDATE comind_workflow_cost_envelopes
    SET status = 'authorized'
    WHERE id = v_envelope_id;

    SELECT id INTO v_reservation_id
    FROM comind_cost_reservations
    WHERE envelope_id = v_envelope_id
      AND status = 'active'
    ORDER BY id
    LIMIT 1;

    v_usage_id := comind_record_usage(
        v_envelope_id,
        v_reservation_id,
        NULL,
        v_provider_id,
        NULL,
        v_agent_id,
        'verification-event-' || v_envelope_id,
        'ai_interaction',
        1,
        0.60,
        '{"verification":true}'::jsonb
    );

    IF v_usage_id IS NULL THEN
        RAISE EXCEPTION 'Usage event was not created';
    END IF;

    SELECT status, actual_cost
    INTO v_status, v_actual
    FROM comind_workflow_cost_envelopes
    WHERE id = v_envelope_id;

    IF v_actual <> 0.60 OR v_status <> 'authorized' THEN
        RAISE EXCEPTION 'Unexpected envelope result: status=%, actual=%', v_status, v_actual;
    END IF;

    SELECT checkpoint_id, effective_decision, envelope_status
    INTO v_checkpoint_id, v_effective_decision, v_status
    FROM comind_record_checkpoint(
        v_envelope_id,
        v_agent_id,
        0.70,
        0.01,
        0.80,
        'continue',
        'Verify diminishing-value halt behavior.',
        'No further action'
    );

    IF v_checkpoint_id IS NULL OR v_effective_decision <> 'halt' OR v_status <> 'halted_policy' THEN
        RAISE EXCEPTION 'Expected low-value checkpoint halt; got checkpoint=%, decision=%, status=%',
            v_checkpoint_id, v_effective_decision, v_status;
    END IF;
END;
$$;

-- Verification is intentionally non-persistent.
ROLLBACK;

SELECT
    'CoMind FinOps and Resource Governor verification passed' AS verification_result;

