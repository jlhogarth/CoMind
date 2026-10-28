-- CINT-FINOPS-003: governed provider execution -> paid-access receipt bridge.
-- Issue: https://github.com/jlhogarth/CoMind/issues/283
-- Parent: https://github.com/jlhogarth/CoMind/issues/274
--
-- This migration adds a narrow private runtime boundary around the CINT paid-API
-- ledger. It does not perform a provider call, activate an agent, or alter
-- production. The existing FinOps usage/reservation substrate remains the
-- authoritative provider-cost meter.

BEGIN;

DO $$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_paid_api_access_proposal'),
            ('comind.cm_paid_api_execution'),
            ('comind.cm_api_cost_receipt'),
            ('comind.cm_budget_authority_binding'),
            ('comind.cm_budget_authority_reservation'),
            ('comind.cm_budget_authority_telemetry'),
            ('comind.cm_foundry_execution_context'),
            ('comind.cm_message'),
            ('public.comind_service_providers'),
            ('public.comind_cost_reservations'),
            ('public.comind_usage_events')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-FINOPS-003 requires existing relations: %', v_missing;
    END IF;
END;
$$;

-- The provider execution fingerprint is the immutable idempotency/provenance key
-- already produced by the governed provider envelope. One cost reservation and
-- one provider fingerprint may each bind to at most one CINT paid execution.
ALTER TABLE comind.cm_paid_api_execution
    ADD COLUMN IF NOT EXISTS provider_execution_fingerprint text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
          AND conname = 'cm_paid_api_execution_provider_fingerprint_ck'
    ) THEN
        ALTER TABLE comind.cm_paid_api_execution
            ADD CONSTRAINT cm_paid_api_execution_provider_fingerprint_ck
            CHECK (
                provider_execution_fingerprint IS NULL
                OR provider_execution_fingerprint ~ '^sha256:[0-9a-f]{64}$'
            );
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS cm_paid_api_execution_reservation_uq
    ON comind.cm_paid_api_execution(reservation_id);
CREATE UNIQUE INDEX IF NOT EXISTS cm_paid_api_execution_provider_fingerprint_uq
    ON comind.cm_paid_api_execution(provider_execution_fingerprint)
    WHERE provider_execution_fingerprint IS NOT NULL;

COMMENT ON COLUMN comind.cm_paid_api_execution.provider_execution_fingerprint IS
    'Immutable governed-provider envelope fingerprint. Used for replay-safe admission and reconciliation.';

CREATE OR REPLACE FUNCTION comind.cm_guard_paid_api_execution_provider_fingerprint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
BEGIN
    IF OLD.provider_execution_fingerprint IS DISTINCT FROM NEW.provider_execution_fingerprint THEN
        RAISE EXCEPTION 'Paid API provider-execution fingerprint is immutable after admission';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_execution_provider_fingerprint_immutable
    ON comind.cm_paid_api_execution;
CREATE TRIGGER trg_cm_paid_api_execution_provider_fingerprint_immutable
BEFORE UPDATE OF provider_execution_fingerprint
ON comind.cm_paid_api_execution
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_paid_api_execution_provider_fingerprint();

-- Runtime admission is deliberately SECURITY DEFINER because the trusted runtime
-- has no direct write grant on the private CINT financial tables. The function is
-- kept in the private schema, uses a fixed pg_catalog-only search_path, qualifies
-- every relation, validates all authority/identity inputs, and is executable only
-- by service_role after the explicit grants below.
CREATE OR REPLACE FUNCTION comind.cm_admit_paid_api_execution(
    p_proposal_id uuid,
    p_binding_id uuid,
    p_reservation_id bigint,
    p_provider_code text,
    p_model_or_service text,
    p_provider_execution_fingerprint text,
    p_attempt_number integer,
    p_input_tokens bigint,
    p_max_output_tokens bigint,
    p_max_retries integer,
    p_requested_tool_calls integer DEFAULT 0,
    p_foundry_execution_context_id uuid DEFAULT NULL,
    p_routing_decision_id bigint DEFAULT NULL
)
RETURNS TABLE (
    execution_id uuid,
    execution_status text,
    idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_proposal comind.cm_paid_api_access_proposal%ROWTYPE;
    v_provider_id bigint;
    v_existing comind.cm_paid_api_execution%ROWTYPE;
    v_execution_count integer;
    v_new_execution_id uuid;
BEGIN
    IF p_provider_code IS NULL OR btrim(p_provider_code) = '' THEN
        RAISE EXCEPTION 'Provider code is required';
    END IF;
    IF p_model_or_service IS NULL OR btrim(p_model_or_service) = '' THEN
        RAISE EXCEPTION 'Model/service identity is required';
    END IF;
    IF p_provider_execution_fingerprint IS NULL
       OR p_provider_execution_fingerprint !~ '^sha256:[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'A valid governed provider-execution fingerprint is required';
    END IF;
    IF p_attempt_number IS NULL OR p_attempt_number <= 0 THEN
        RAISE EXCEPTION 'Attempt number must be positive';
    END IF;
    IF p_input_tokens IS NULL OR p_input_tokens < 0 THEN
        RAISE EXCEPTION 'Trustworthy preflight input-token count is required';
    END IF;
    IF p_max_output_tokens IS NULL OR p_max_output_tokens < 0 THEN
        RAISE EXCEPTION 'Requested maximum output-token count is required';
    END IF;
    IF p_max_retries IS NULL OR p_max_retries < 0 THEN
        RAISE EXCEPTION 'Requested retry limit must be nonnegative';
    END IF;
    IF p_requested_tool_calls IS NULL OR p_requested_tool_calls < 0 THEN
        RAISE EXCEPTION 'Requested tool-call count must be nonnegative';
    END IF;

    SELECT p.*
    INTO v_proposal
    FROM comind.cm_paid_api_access_proposal AS p
    WHERE p.proposal_id = p_proposal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paid API proposal % does not exist', p_proposal_id;
    END IF;
    IF v_proposal.proposal_status <> 'approved' THEN
        RAISE EXCEPTION 'Paid API runtime admission requires approved proposal; current status is %',
            v_proposal.proposal_status;
    END IF;
    IF v_proposal.approval_expires_at IS NOT NULL
       AND v_proposal.approval_expires_at <= clock_timestamp() THEN
        RAISE EXCEPTION 'Paid API proposal approval has expired';
    END IF;

    SELECT sp.id
    INTO v_provider_id
    FROM public.comind_service_providers AS sp
    WHERE sp.provider_code = p_provider_code
      AND sp.active;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Provider % is not an active governed provider', p_provider_code;
    END IF;
    IF v_provider_id <> v_proposal.provider_id THEN
        RAISE EXCEPTION 'Runtime provider % conflicts with approved proposal provider', p_provider_code;
    END IF;
    IF p_model_or_service <> v_proposal.model_or_service THEN
        RAISE EXCEPTION 'Runtime model/service % conflicts with approved proposal model/service %',
            p_model_or_service, v_proposal.model_or_service;
    END IF;

    IF v_proposal.max_input_tokens IS NOT NULL
       AND p_input_tokens > v_proposal.max_input_tokens THEN
        RAISE EXCEPTION 'Preflight input tokens % exceed approved limit %',
            p_input_tokens, v_proposal.max_input_tokens;
    END IF;
    IF v_proposal.max_output_tokens IS NOT NULL
       AND p_max_output_tokens > v_proposal.max_output_tokens THEN
        RAISE EXCEPTION 'Requested max output tokens % exceed approved limit %',
            p_max_output_tokens, v_proposal.max_output_tokens;
    END IF;
    IF v_proposal.max_total_tokens IS NOT NULL
       AND p_input_tokens + p_max_output_tokens > v_proposal.max_total_tokens THEN
        RAISE EXCEPTION 'Maximum bounded token exposure % exceeds approved total-token limit %',
            p_input_tokens + p_max_output_tokens, v_proposal.max_total_tokens;
    END IF;
    IF p_max_retries > v_proposal.max_retries THEN
        RAISE EXCEPTION 'Requested retry limit % exceeds approved retry limit %',
            p_max_retries, v_proposal.max_retries;
    END IF;
    IF v_proposal.max_tool_calls IS NOT NULL
       AND p_requested_tool_calls > v_proposal.max_tool_calls THEN
        RAISE EXCEPTION 'Requested tool calls % exceed approved tool-call limit %',
            p_requested_tool_calls, v_proposal.max_tool_calls;
    END IF;

    -- Replays resolve to the already admitted immutable identity. Conflicting
    -- reservation/fingerprint reuse fails closed rather than creating a second row.
    SELECT e.*
    INTO v_existing
    FROM comind.cm_paid_api_execution AS e
    WHERE e.reservation_id = p_reservation_id
       OR e.provider_execution_fingerprint = p_provider_execution_fingerprint
    ORDER BY e.created_at, e.execution_id
    LIMIT 1;

    IF FOUND THEN
        IF v_existing.proposal_id <> p_proposal_id
           OR v_existing.binding_id <> p_binding_id
           OR v_existing.reservation_id <> p_reservation_id
           OR v_existing.routing_decision_id IS DISTINCT FROM p_routing_decision_id
           OR v_existing.attempt_number <> p_attempt_number
           OR v_existing.provider_execution_fingerprint IS DISTINCT FROM p_provider_execution_fingerprint
           OR v_existing.foundry_execution_context_id IS DISTINCT FROM p_foundry_execution_context_id THEN
            RAISE EXCEPTION 'Paid API runtime admission conflicts with an existing immutable execution identity';
        END IF;

        RETURN QUERY SELECT
            v_existing.execution_id,
            v_existing.execution_status,
            true;
        RETURN;
    END IF;

    SELECT count(*)::integer
    INTO v_execution_count
    FROM comind.cm_paid_api_execution AS e
    WHERE e.proposal_id = p_proposal_id;

    IF v_execution_count >= v_proposal.max_requests THEN
        RAISE EXCEPTION 'Approved proposal request limit % is exhausted', v_proposal.max_requests;
    END IF;

    INSERT INTO comind.cm_paid_api_execution (
        proposal_id,
        binding_id,
        reservation_id,
        routing_decision_id,
        attempt_number,
        execution_status,
        requests_made,
        retries_used,
        currency,
        started_at,
        metadata,
        tool_calls_made,
        foundry_execution_context_id,
        provider_execution_fingerprint
    ) VALUES (
        p_proposal_id,
        p_binding_id,
        p_reservation_id,
        p_routing_decision_id,
        p_attempt_number,
        'running',
        0,
        0,
        v_proposal.currency,
        clock_timestamp(),
        jsonb_build_object(
            'runtime_bridge', jsonb_build_object(
                'contract', 'CINT-FINOPS-003',
                'admission_version', 1,
                'provider_code', p_provider_code,
                'model_or_service', p_model_or_service,
                'provider_execution_fingerprint', p_provider_execution_fingerprint,
                'preflight_input_tokens', p_input_tokens,
                'max_output_tokens', p_max_output_tokens,
                'max_retries', p_max_retries,
                'requested_tool_calls', p_requested_tool_calls
            )
        ),
        NULL,
        p_foundry_execution_context_id,
        p_provider_execution_fingerprint
    )
    RETURNING cm_paid_api_execution.execution_id INTO v_new_execution_id;

    RETURN QUERY SELECT v_new_execution_id, 'running'::text, false;
END;
$$;

COMMENT ON FUNCTION comind.cm_admit_paid_api_execution(
    uuid, uuid, bigint, text, text, text, integer, bigint, bigint, integer, integer, uuid, bigint
) IS
    'Narrow trusted-runtime admission for one founder-approved paid provider execution. Validates proposal/provider/model/token/tool/retry scope and reuses existing budget/reservation enforcement before any provider request.';

-- Reconcile only from authoritative, already-persisted message telemetry plus the
-- existing FinOps usage event. This function never computes provider cost itself.
CREATE OR REPLACE FUNCTION comind.cm_reconcile_paid_api_execution_from_message(
    p_execution_id uuid,
    p_message_id uuid,
    p_telemetry_locator text
)
RETURNS TABLE (
    execution_id uuid,
    usage_event_id bigint,
    receipt_id uuid,
    receipt_number text,
    actual_expense numeric,
    provider_status text,
    idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_execution comind.cm_paid_api_execution%ROWTYPE;
    v_proposal comind.cm_paid_api_access_proposal%ROWTYPE;
    v_telemetry comind.cm_budget_authority_telemetry%ROWTYPE;
    v_message comind.cm_message%ROWTYPE;
    v_event_meta jsonb;
    v_pass_role text;
    v_pass_count integer;
    v_provider_code text;
    v_event_provider text;
    v_event_model text;
    v_event_fingerprint text;
    v_provider_status text;
    v_provider_event_id text;
    v_usage_id bigint;
    v_usage_provider_id bigint;
    v_usage_provider_event_id text;
    v_usage_cost numeric;
    v_usage_currency text;
    v_usage_occurred_at timestamptz;
    v_usage_count integer;
    v_input_tokens bigint;
    v_cached_input_tokens bigint;
    v_output_tokens bigint;
    v_reasoning_tokens bigint;
    v_total_tokens bigint;
    v_tool_calls integer;
    v_receipt_id uuid;
    v_receipt_number text;
    v_existing_message text;
    v_existing_locator text;
BEGIN
    IF p_telemetry_locator IS NULL OR btrim(p_telemetry_locator) = '' THEN
        RAISE EXCEPTION 'Telemetry locator is required';
    END IF;

    SELECT e.*
    INTO v_execution
    FROM comind.cm_paid_api_execution AS e
    WHERE e.execution_id = p_execution_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paid API execution % does not exist', p_execution_id;
    END IF;

    IF v_execution.execution_status = 'reconciled' THEN
        v_existing_message := v_execution.metadata#>>'{runtime_bridge,reconciliation,message_id}';
        v_existing_locator := v_execution.metadata#>>'{runtime_bridge,reconciliation,telemetry_locator}';
        IF v_existing_message IS DISTINCT FROM p_message_id::text
           OR v_existing_locator IS DISTINCT FROM p_telemetry_locator THEN
            RAISE EXCEPTION 'Reconciled paid API execution has conflicting message/telemetry provenance';
        END IF;

        SELECT r.receipt_id, r.receipt_number
        INTO v_receipt_id, v_receipt_number
        FROM comind.cm_api_cost_receipt AS r
        WHERE r.execution_id = p_execution_id;

        SELECT u.id
        INTO v_usage_id
        FROM public.comind_usage_events AS u
        WHERE u.reservation_id = v_execution.reservation_id
          AND u.meter_code = 'provider_execution'
        ORDER BY u.id
        LIMIT 1;

        RETURN QUERY SELECT
            v_execution.execution_id,
            v_usage_id,
            v_receipt_id,
            v_receipt_number,
            v_execution.actual_expense,
            COALESCE(v_execution.metadata#>>'{runtime_bridge,reconciliation,provider_status}', 'unknown'),
            true;
        RETURN;
    END IF;

    IF v_execution.execution_status NOT IN ('running', 'authorized', 'failed') THEN
        RAISE EXCEPTION 'Paid API execution cannot reconcile from status %', v_execution.execution_status;
    END IF;
    IF v_execution.provider_execution_fingerprint IS NULL THEN
        RAISE EXCEPTION 'Paid API execution lacks governed provider-execution fingerprint';
    END IF;

    SELECT p.*
    INTO v_proposal
    FROM comind.cm_paid_api_access_proposal AS p
    WHERE p.proposal_id = v_execution.proposal_id;

    SELECT sp.provider_code
    INTO v_provider_code
    FROM public.comind_service_providers AS sp
    WHERE sp.id = v_proposal.provider_id;

    SELECT t.*
    INTO v_telemetry
    FROM comind.cm_budget_authority_telemetry AS t
    WHERE t.reservation_id = v_execution.reservation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation % has no accepted budget-authority telemetry provenance',
            v_execution.reservation_id;
    END IF;
    IF v_telemetry.message_id <> p_message_id
       OR v_telemetry.telemetry_locator <> p_telemetry_locator THEN
        RAISE EXCEPTION 'Message/telemetry locator conflicts with accepted budget-authority telemetry provenance';
    END IF;

    SELECT m.*
    INTO v_message
    FROM comind.cm_message AS m
    WHERE m.msg_id = p_message_id;

    IF NOT FOUND OR v_message.role <> 'assistant' OR jsonb_typeof(v_message.meta) <> 'object' THEN
        RAISE EXCEPTION 'Authoritative assistant message telemetry is missing or malformed';
    END IF;

    IF p_telemetry_locator = 'root' THEN
        IF jsonb_typeof(v_message.meta->'quality_gate') = 'object' THEN
            RAISE EXCEPTION 'Quality-gated telemetry must reconcile an individual provider pass';
        END IF;
        v_event_meta := v_message.meta;
    ELSIF p_telemetry_locator ~ '^quality_gate[.]passes[.](draft|verifier|repair)$' THEN
        v_pass_role := substring(
            p_telemetry_locator
            FROM '^quality_gate[.]passes[.](draft|verifier|repair)$'
        );

        SELECT count(*)::integer
        INTO v_pass_count
        FROM jsonb_array_elements(
            CASE
                WHEN jsonb_typeof(v_message.meta#>'{quality_gate,passes}') = 'array'
                    THEN v_message.meta#>'{quality_gate,passes}'
                ELSE '[]'::jsonb
            END
        ) AS pass(item)
        WHERE pass.item->>'role' = v_pass_role;

        IF v_pass_count <> 1 THEN
            RAISE EXCEPTION 'Telemetry locator % resolved to % provider pass records',
                p_telemetry_locator, v_pass_count;
        END IF;

        SELECT pass.item
        INTO v_event_meta
        FROM jsonb_array_elements(v_message.meta#>'{quality_gate,passes}') AS pass(item)
        WHERE pass.item->>'role' = v_pass_role
        LIMIT 1;
    ELSE
        RAISE EXCEPTION 'Unsupported telemetry locator %', p_telemetry_locator;
    END IF;

    v_event_provider := NULLIF(v_event_meta->>'provider', '');
    v_event_model := COALESCE(
        NULLIF(v_event_meta->>'requested_model', ''),
        NULLIF(v_event_meta->>'model', '')
    );
    v_event_fingerprint := NULLIF(v_event_meta->>'request_fingerprint', '');
    v_provider_status := COALESCE(NULLIF(v_event_meta->>'status', ''), 'unknown');
    v_provider_event_id := COALESCE(
        NULLIF(v_event_meta->>'response_id', ''),
        NULLIF(v_event_meta->>'request_id', '')
    );

    IF v_event_provider IS DISTINCT FROM v_provider_code THEN
        RAISE EXCEPTION 'Authoritative telemetry provider conflicts with approved provider';
    END IF;
    IF v_event_model IS DISTINCT FROM v_proposal.model_or_service THEN
        RAISE EXCEPTION 'Authoritative telemetry model % conflicts with approved model %',
            v_event_model, v_proposal.model_or_service;
    END IF;
    IF v_event_fingerprint IS DISTINCT FROM v_execution.provider_execution_fingerprint THEN
        RAISE EXCEPTION 'Authoritative telemetry fingerprint conflicts with admitted paid execution';
    END IF;
    IF v_provider_status NOT IN ('succeeded', 'failed') THEN
        RAISE EXCEPTION 'Provider status % is not terminal enough for paid-execution reconciliation',
            v_provider_status;
    END IF;

    SELECT
        count(*)::integer,
        min(u.id),
        min(u.provider_id),
        min(u.provider_event_id),
        min(u.measured_cost),
        min(btrim(u.currency::text)),
        min(u.occurred_at)
    INTO
        v_usage_count,
        v_usage_id,
        v_usage_provider_id,
        v_usage_provider_event_id,
        v_usage_cost,
        v_usage_currency,
        v_usage_occurred_at
    FROM public.comind_usage_events AS u
    WHERE u.reservation_id = v_execution.reservation_id
      AND u.meter_code = 'provider_execution';

    IF v_usage_count <> 1 THEN
        RAISE EXCEPTION 'Reservation % must have exactly one authoritative provider_execution usage event; found %',
            v_execution.reservation_id, v_usage_count;
    END IF;
    IF v_usage_provider_id <> v_proposal.provider_id THEN
        RAISE EXCEPTION 'Usage-event provider conflicts with approved proposal provider';
    END IF;
    IF v_usage_currency IS DISTINCT FROM v_execution.currency THEN
        RAISE EXCEPTION 'Usage-event currency conflicts with paid execution currency';
    END IF;
    IF v_usage_cost IS NULL OR v_usage_cost < 0 THEN
        RAISE EXCEPTION 'Usage event lacks a nonnegative measured provider cost';
    END IF;
    IF v_usage_provider_event_id IS NOT NULL
       AND v_provider_event_id IS NOT NULL
       AND v_usage_provider_event_id <> v_provider_event_id THEN
        RAISE EXCEPTION 'Usage-event provider identity conflicts with message telemetry';
    END IF;

    IF COALESCE(v_event_meta#>>'{usage,input_tokens}', '') ~ '^[0-9]+$' THEN
        v_input_tokens := (v_event_meta#>>'{usage,input_tokens}')::bigint;
    END IF;
    IF COALESCE(v_event_meta#>>'{usage,cached_input_tokens}', '') ~ '^[0-9]+$' THEN
        v_cached_input_tokens := (v_event_meta#>>'{usage,cached_input_tokens}')::bigint;
    END IF;
    IF COALESCE(v_event_meta#>>'{usage,output_tokens}', '') ~ '^[0-9]+$' THEN
        v_output_tokens := (v_event_meta#>>'{usage,output_tokens}')::bigint;
    END IF;
    IF COALESCE(v_event_meta#>>'{usage,reasoning_tokens}', '') ~ '^[0-9]+$' THEN
        v_reasoning_tokens := (v_event_meta#>>'{usage,reasoning_tokens}')::bigint;
    END IF;
    IF COALESCE(v_event_meta#>>'{usage,total_tokens}', '') ~ '^[0-9]+$' THEN
        v_total_tokens := (v_event_meta#>>'{usage,total_tokens}')::bigint;
    END IF;
    IF COALESCE(v_event_meta->>'tool_calls', '') ~ '^[0-9]+$' THEN
        v_tool_calls := (v_event_meta->>'tool_calls')::integer;
    END IF;

    UPDATE comind.cm_paid_api_execution AS e
    SET provider_event_id = COALESCE(v_provider_event_id, v_usage_provider_event_id),
        execution_status = 'reconciled',
        requests_made = 1,
        retries_used = 0,
        actual_input_tokens = v_input_tokens,
        actual_cached_input_tokens = v_cached_input_tokens,
        actual_output_tokens = v_output_tokens,
        actual_reasoning_tokens = v_reasoning_tokens,
        actual_total_tokens = v_total_tokens,
        tool_calls_made = v_tool_calls,
        actual_expense = v_usage_cost,
        completed_at = COALESCE(v_usage_occurred_at, clock_timestamp()),
        reconciled_at = clock_timestamp(),
        failure_code = CASE
            WHEN v_provider_status = 'failed'
                THEN COALESCE(NULLIF(v_event_meta->>'error_code', ''), 'provider_failed')
            ELSE NULL
        END,
        failure_report = CASE
            WHEN v_provider_status = 'failed'
                THEN 'Provider execution failed; authoritative provider-cost evidence was reconciled from persisted message telemetry and FinOps usage.'
            ELSE NULL
        END,
        metadata = e.metadata || jsonb_build_object(
            'runtime_bridge',
            COALESCE(e.metadata->'runtime_bridge', '{}'::jsonb) || jsonb_build_object(
                'reconciliation', jsonb_build_object(
                    'version', 1,
                    'message_id', p_message_id::text,
                    'telemetry_locator', p_telemetry_locator,
                    'telemetry_identity', v_telemetry.telemetry_identity,
                    'usage_event_id', v_usage_id,
                    'provider_status', v_provider_status,
                    'cost_source', 'public.comind_usage_events.measured_cost'
                )
            )
        )
    WHERE e.execution_id = p_execution_id;

    SELECT r.receipt_id, r.receipt_number
    INTO v_receipt_id, v_receipt_number
    FROM comind.cm_api_cost_receipt AS r
    WHERE r.execution_id = p_execution_id;

    IF v_receipt_id IS NULL THEN
        RAISE EXCEPTION 'Reconciled paid execution did not issue an internal API cost receipt';
    END IF;

    RETURN QUERY SELECT
        p_execution_id,
        v_usage_id,
        v_receipt_id,
        v_receipt_number,
        v_usage_cost,
        v_provider_status,
        false;
END;
$$;

COMMENT ON FUNCTION comind.cm_reconcile_paid_api_execution_from_message(uuid, uuid, text) IS
    'Reconciles one admitted CINT paid execution from accepted message telemetry and the existing authoritative FinOps usage event, then lets the existing receipt trigger issue the immutable internal cost receipt.';

CREATE OR REPLACE FUNCTION comind.cm_fail_paid_api_execution(
    p_execution_id uuid,
    p_failure_code text,
    p_failure_report text
)
RETURNS TABLE (
    execution_id uuid,
    execution_status text,
    idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_execution comind.cm_paid_api_execution%ROWTYPE;
BEGIN
    IF p_failure_code IS NULL
       OR p_failure_code !~ '^[a-z][a-z0-9._:-]{0,127}$' THEN
        RAISE EXCEPTION 'A bounded machine-readable failure code is required';
    END IF;
    IF p_failure_report IS NULL OR btrim(p_failure_report) = '' THEN
        RAISE EXCEPTION 'A non-empty paid-execution failure report is required';
    END IF;

    SELECT e.*
    INTO v_execution
    FROM comind.cm_paid_api_execution AS e
    WHERE e.execution_id = p_execution_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paid API execution % does not exist', p_execution_id;
    END IF;

    IF v_execution.execution_status = 'failed' THEN
        IF v_execution.failure_code IS DISTINCT FROM p_failure_code
           OR v_execution.failure_report IS DISTINCT FROM p_failure_report THEN
            RAISE EXCEPTION 'Paid API execution already has conflicting failure evidence';
        END IF;
        RETURN QUERY SELECT v_execution.execution_id, 'failed'::text, true;
        RETURN;
    END IF;

    IF v_execution.execution_status = 'reconciled' THEN
        RAISE EXCEPTION 'Reconciled paid API execution cannot be rewritten as failed';
    END IF;
    IF v_execution.execution_status NOT IN ('authorized', 'running') THEN
        RAISE EXCEPTION 'Paid API execution cannot fail from status %', v_execution.execution_status;
    END IF;

    UPDATE comind.cm_paid_api_execution AS e
    SET execution_status = 'failed',
        failure_code = p_failure_code,
        failure_report = p_failure_report,
        completed_at = clock_timestamp(),
        metadata = e.metadata || jsonb_build_object(
            'runtime_bridge',
            COALESCE(e.metadata->'runtime_bridge', '{}'::jsonb) || jsonb_build_object(
                'failure_recorded_at', clock_timestamp()
            )
        )
    WHERE e.execution_id = p_execution_id;

    RETURN QUERY SELECT p_execution_id, 'failed'::text, false;
END;
$$;

COMMENT ON FUNCTION comind.cm_fail_paid_api_execution(uuid, text, text) IS
    'Records fail-closed provider/runtime failure evidence without fabricating zero cost. A later authoritative FinOps settlement may still reconcile the execution.';

-- Do not expose private financial tables. The trusted runtime receives only the
-- three narrow procedures required to admit, fail, and reconcile paid executions.
REVOKE ALL ON FUNCTION comind.cm_admit_paid_api_execution(
    uuid, uuid, bigint, text, text, text, integer, bigint, bigint, integer, integer, uuid, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_reconcile_paid_api_execution_from_message(uuid, uuid, text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION comind.cm_fail_paid_api_execution(uuid, text, text)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION comind.cm_admit_paid_api_execution(
    uuid, uuid, bigint, text, text, text, integer, bigint, bigint, integer, integer, uuid, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_reconcile_paid_api_execution_from_message(uuid, uuid, text)
    TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_fail_paid_api_execution(uuid, text, text)
    TO service_role;

COMMIT;
