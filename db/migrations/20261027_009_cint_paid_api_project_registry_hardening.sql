-- CINT-GOV-001 hardening: founder cap dominance, append-only evidence, policy revisions.
-- Issue: https://github.com/jlhogarth/CoMind/issues/274
-- Parent: https://github.com/jlhogarth/CoMind/issues/259
-- This migration remains private-schema governance only. It performs no provider call.

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
            ('comind.cm_agent_operating_policy'),
            ('comind.cm_budget_authority_binding'),
            ('comind.cm_budget_authority_reservation'),
            ('public.comind_cost_reservations'),
            ('public.comind_workflow_cost_envelopes')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-GOV-001 hardening requires existing relations: %', v_missing;
    END IF;
END;
$$;

-- Preserve actual tool-call usage when a provider exposes it. The proposal already
-- carries the corresponding ceiling.
ALTER TABLE comind.cm_paid_api_execution
    ADD COLUMN IF NOT EXISTS tool_calls_made integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_execution'::regclass
          AND conname = 'cm_paid_api_execution_tool_calls_ck'
    ) THEN
        ALTER TABLE comind.cm_paid_api_execution
            ADD CONSTRAINT cm_paid_api_execution_tool_calls_ck
            CHECK (tool_calls_made IS NULL OR tool_calls_made >= 0);
    END IF;
END;
$$;

-- A completed proposal must retain the approval provenance that authorized it.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_paid_api_access_proposal'::regclass
          AND conname = 'cm_paid_api_access_proposal_completed_approval_ck'
    ) THEN
        ALTER TABLE comind.cm_paid_api_access_proposal
            ADD CONSTRAINT cm_paid_api_access_proposal_completed_approval_ck
            CHECK (
                proposal_status <> 'completed'
                OR (
                    approved_at IS NOT NULL
                    AND approval_source_system IS NOT NULL
                    AND approval_source_ref IS NOT NULL
                )
            );
    END IF;
END;
$$;

-- Proposal evidence is durable. An approved or terminal scope cannot be rewritten,
-- and proposal rows cannot be deleted. A materially changed scope becomes a new,
-- superseding proposal with fresh approval.
CREATE OR REPLACE FUNCTION comind.cm_guard_paid_api_access_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Paid API proposals are durable governance evidence and cannot be deleted';
    END IF;

    IF OLD.proposal_status IN ('rejected', 'cancelled', 'expired', 'superseded', 'completed')
       AND NEW.proposal_status <> OLD.proposal_status THEN
        RAISE EXCEPTION 'Terminal paid API proposal status % is immutable', OLD.proposal_status;
    END IF;

    IF OLD.proposal_status = 'approved'
       AND NEW.proposal_status NOT IN ('approved', 'completed', 'cancelled', 'expired', 'superseded') THEN
        RAISE EXCEPTION 'Approved paid API proposal cannot return to pre-approval status';
    END IF;

    IF OLD.proposal_status IN ('approved', 'rejected', 'cancelled', 'expired', 'superseded', 'completed') AND (
        OLD.project_id IS DISTINCT FROM NEW.project_id
        OR OLD.requesting_agent_id IS DISTINCT FROM NEW.requesting_agent_id
        OR OLD.requesting_profile_id IS DISTINCT FROM NEW.requesting_profile_id
        OR OLD.purpose IS DISTINCT FROM NEW.purpose
        OR OLD.expected_benefit IS DISTINCT FROM NEW.expected_benefit
        OR OLD.success_criteria IS DISTINCT FROM NEW.success_criteria
        OR OLD.provider_id IS DISTINCT FROM NEW.provider_id
        OR OLD.model_or_service IS DISTINCT FROM NEW.model_or_service
        OR OLD.rate_card_id IS DISTINCT FROM NEW.rate_card_id
        OR OLD.pricing_source_url IS DISTINCT FROM NEW.pricing_source_url
        OR OLD.pricing_source_version IS DISTINCT FROM NEW.pricing_source_version
        OR OLD.pricing_verified_at IS DISTINCT FROM NEW.pricing_verified_at
        OR OLD.pricing_snapshot IS DISTINCT FROM NEW.pricing_snapshot
        OR OLD.expected_cost IS DISTINCT FROM NEW.expected_cost
        OR OLD.max_spend IS DISTINCT FROM NEW.max_spend
        OR OLD.currency IS DISTINCT FROM NEW.currency
        OR OLD.max_requests IS DISTINCT FROM NEW.max_requests
        OR OLD.max_input_tokens IS DISTINCT FROM NEW.max_input_tokens
        OR OLD.max_output_tokens IS DISTINCT FROM NEW.max_output_tokens
        OR OLD.max_total_tokens IS DISTINCT FROM NEW.max_total_tokens
        OR OLD.max_tool_calls IS DISTINCT FROM NEW.max_tool_calls
        OR OLD.max_retries IS DISTINCT FROM NEW.max_retries
        OR OLD.stop_conditions IS DISTINCT FROM NEW.stop_conditions
        OR OLD.authorization_request_id IS DISTINCT FROM NEW.authorization_request_id
        OR OLD.authorization_decision_id IS DISTINCT FROM NEW.authorization_decision_id
        OR OLD.approval_source_system IS DISTINCT FROM NEW.approval_source_system
        OR OLD.approval_source_ref IS DISTINCT FROM NEW.approval_source_ref
        OR OLD.approved_at IS DISTINCT FROM NEW.approved_at
        OR OLD.approval_expires_at IS DISTINCT FROM NEW.approval_expires_at
        OR OLD.supersedes_proposal_id IS DISTINCT FROM NEW.supersedes_proposal_id
        OR OLD.created_at IS DISTINCT FROM NEW.created_at
    ) THEN
        RAISE EXCEPTION 'Approved or terminal paid API proposal scope is immutable; create a superseding proposal and obtain fresh approval';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_access_proposal_guard
    ON comind.cm_paid_api_access_proposal;
CREATE TRIGGER trg_cm_paid_api_access_proposal_guard
BEFORE UPDATE OR DELETE ON comind.cm_paid_api_access_proposal
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_paid_api_access_proposal();

-- Strengthen the execution admission check so the founder-approved maximum spend
-- is an upper bound on the runtime budget authority, not merely an annotation.
CREATE OR REPLACE FUNCTION comind.cm_validate_paid_api_execution_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
DECLARE
    v_proposal_project_id uuid;
    v_proposal_agent_id uuid;
    v_proposal_provider_id bigint;
    v_proposal_currency text;
    v_proposal_status text;
    v_approval_expires_at timestamptz;
    v_proposal_max_spend numeric;
    v_binding_project_id uuid;
    v_binding_agent_id uuid;
    v_binding_envelope_id bigint;
    v_reservation_envelope_id bigint;
    v_reservation_provider_id bigint;
    v_reservation_amount numeric;
    v_reservation_currency text;
    v_reservation_status text;
    v_reservation_expires_at timestamptz;
    v_envelope_hard_limit numeric;
    v_envelope_currency text;
    v_envelope_status text;
    v_routing_envelope_id bigint;
    v_routing_provider_id bigint;
BEGIN
    SELECT
        project_id,
        requesting_agent_id,
        provider_id,
        currency,
        proposal_status,
        approval_expires_at,
        max_spend
    INTO
        v_proposal_project_id,
        v_proposal_agent_id,
        v_proposal_provider_id,
        v_proposal_currency,
        v_proposal_status,
        v_approval_expires_at,
        v_proposal_max_spend
    FROM comind.cm_paid_api_access_proposal
    WHERE proposal_id = NEW.proposal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paid API proposal % does not exist', NEW.proposal_id;
    END IF;
    IF v_proposal_status <> 'approved' THEN
        RAISE EXCEPTION 'Paid API execution requires approved proposal; current status is %', v_proposal_status;
    END IF;
    IF v_approval_expires_at IS NOT NULL AND v_approval_expires_at <= now() THEN
        RAISE EXCEPTION 'Paid API proposal approval has expired';
    END IF;
    IF NEW.currency <> v_proposal_currency THEN
        RAISE EXCEPTION 'Execution currency % conflicts with proposal currency %', NEW.currency, v_proposal_currency;
    END IF;

    SELECT project_id, agent_id, envelope_id
    INTO v_binding_project_id, v_binding_agent_id, v_binding_envelope_id
    FROM comind.cm_budget_authority_binding
    WHERE binding_id = NEW.binding_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Budget authority binding % does not exist', NEW.binding_id;
    END IF;
    IF v_binding_project_id IS NULL OR v_binding_project_id <> v_proposal_project_id THEN
        RAISE EXCEPTION 'Budget authority binding project does not match paid API proposal project';
    END IF;
    IF v_proposal_agent_id IS NOT NULL
       AND v_binding_agent_id IS NOT NULL
       AND v_binding_agent_id <> v_proposal_agent_id THEN
        RAISE EXCEPTION 'Budget authority binding agent conflicts with paid API proposal agent';
    END IF;

    SELECT
        r.envelope_id,
        r.provider_id,
        r.reserved_amount,
        btrim(r.currency::text),
        r.status,
        r.expires_at
    INTO
        v_reservation_envelope_id,
        v_reservation_provider_id,
        v_reservation_amount,
        v_reservation_currency,
        v_reservation_status,
        v_reservation_expires_at
    FROM public.comind_cost_reservations AS r
    JOIN comind.cm_budget_authority_reservation AS ar
      ON ar.reservation_id = r.id
    WHERE r.id = NEW.reservation_id
      AND ar.binding_id = NEW.binding_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation % is not linked to budget binding %', NEW.reservation_id, NEW.binding_id;
    END IF;
    IF v_reservation_envelope_id <> v_binding_envelope_id THEN
        RAISE EXCEPTION 'Reservation envelope does not match budget binding envelope';
    END IF;
    IF v_reservation_provider_id <> v_proposal_provider_id THEN
        RAISE EXCEPTION 'Reservation provider does not match paid API proposal provider';
    END IF;
    IF v_reservation_currency <> v_proposal_currency THEN
        RAISE EXCEPTION 'Reservation currency does not match paid API proposal currency';
    END IF;
    IF v_reservation_status <> 'reserved' THEN
        RAISE EXCEPTION 'Paid API execution requires a spendable reserved cost reservation; current status is %', v_reservation_status;
    END IF;
    IF v_reservation_expires_at <= now() THEN
        RAISE EXCEPTION 'Paid API cost reservation has expired';
    END IF;
    IF v_reservation_amount > v_proposal_max_spend THEN
        RAISE EXCEPTION 'Reserved amount % exceeds founder-approved proposal cap %', v_reservation_amount, v_proposal_max_spend;
    END IF;

    SELECT hard_limit_amount, btrim(currency::text), status
    INTO v_envelope_hard_limit, v_envelope_currency, v_envelope_status
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_binding_envelope_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Budget authority envelope % does not exist', v_binding_envelope_id;
    END IF;
    IF v_envelope_currency <> v_proposal_currency THEN
        RAISE EXCEPTION 'Budget authority envelope currency does not match paid API proposal currency';
    END IF;
    IF v_envelope_status NOT IN ('authorized', 'running') THEN
        RAISE EXCEPTION 'Budget authority envelope is not spendable; current status is %', v_envelope_status;
    END IF;
    IF v_envelope_hard_limit > v_proposal_max_spend THEN
        RAISE EXCEPTION 'Runtime hard limit % exceeds founder-approved proposal cap %', v_envelope_hard_limit, v_proposal_max_spend;
    END IF;

    IF NEW.routing_decision_id IS NOT NULL THEN
        SELECT envelope_id, selected_provider_id
        INTO v_routing_envelope_id, v_routing_provider_id
        FROM public.comind_routing_decisions
        WHERE id = NEW.routing_decision_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Routing decision % does not exist', NEW.routing_decision_id;
        END IF;
        IF v_routing_envelope_id <> v_binding_envelope_id THEN
            RAISE EXCEPTION 'Routing decision envelope does not match budget binding envelope';
        END IF;
        IF v_routing_provider_id IS DISTINCT FROM v_proposal_provider_id THEN
            RAISE EXCEPTION 'Routing decision provider does not match paid API proposal provider';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Execution receipts are durable. Identity links cannot be rebound after admission;
-- terminal receipts cannot be reopened; reconciled receipts are immutable.
CREATE OR REPLACE FUNCTION comind.cm_guard_paid_api_execution_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Paid API execution receipts are durable evidence and cannot be deleted';
    END IF;

    IF OLD.proposal_id IS DISTINCT FROM NEW.proposal_id
       OR OLD.binding_id IS DISTINCT FROM NEW.binding_id
       OR OLD.reservation_id IS DISTINCT FROM NEW.reservation_id
       OR OLD.routing_decision_id IS DISTINCT FROM NEW.routing_decision_id
       OR OLD.attempt_number IS DISTINCT FROM NEW.attempt_number
       OR OLD.currency IS DISTINCT FROM NEW.currency
       OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'Paid API execution identity and authority links are immutable';
    END IF;

    IF OLD.execution_status = 'reconciled' AND (
        OLD.provider_event_id IS DISTINCT FROM NEW.provider_event_id
        OR OLD.execution_status IS DISTINCT FROM NEW.execution_status
        OR OLD.requests_made IS DISTINCT FROM NEW.requests_made
        OR OLD.retries_used IS DISTINCT FROM NEW.retries_used
        OR OLD.actual_input_tokens IS DISTINCT FROM NEW.actual_input_tokens
        OR OLD.actual_cached_input_tokens IS DISTINCT FROM NEW.actual_cached_input_tokens
        OR OLD.actual_output_tokens IS DISTINCT FROM NEW.actual_output_tokens
        OR OLD.actual_reasoning_tokens IS DISTINCT FROM NEW.actual_reasoning_tokens
        OR OLD.actual_total_tokens IS DISTINCT FROM NEW.actual_total_tokens
        OR OLD.actual_expense IS DISTINCT FROM NEW.actual_expense
        OR OLD.provider_reported_expense IS DISTINCT FROM NEW.provider_reported_expense
        OR OLD.tool_calls_made IS DISTINCT FROM NEW.tool_calls_made
        OR OLD.failure_code IS DISTINCT FROM NEW.failure_code
        OR OLD.failure_report IS DISTINCT FROM NEW.failure_report
        OR OLD.started_at IS DISTINCT FROM NEW.started_at
        OR OLD.completed_at IS DISTINCT FROM NEW.completed_at
        OR OLD.reconciled_at IS DISTINCT FROM NEW.reconciled_at
        OR OLD.metadata IS DISTINCT FROM NEW.metadata
    ) THEN
        RAISE EXCEPTION 'Reconciled paid API execution receipts are immutable';
    END IF;

    IF OLD.execution_status IN ('completed', 'failed', 'cancelled')
       AND NEW.execution_status NOT IN (OLD.execution_status, 'reconciled') THEN
        RAISE EXCEPTION 'Terminal paid API execution status % may only remain terminal or advance to reconciled', OLD.execution_status;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_paid_api_execution_guard_mutation
    ON comind.cm_paid_api_execution;
CREATE TRIGGER trg_cm_paid_api_execution_guard_mutation
BEFORE UPDATE OR DELETE ON comind.cm_paid_api_execution
FOR EACH ROW EXECUTE FUNCTION comind.cm_guard_paid_api_execution_mutation();

-- Policy rows become immutable revisions. New policy versions are new rows rather
-- than in-place edits, preserving the exact authority/source/review contract used.
ALTER TABLE comind.cm_agent_operating_policy
    DROP CONSTRAINT IF EXISTS cm_agent_operating_policy_policy_key_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_agent_operating_policy'::regclass
          AND conname = 'cm_agent_operating_policy_key_version_uq'
    ) THEN
        ALTER TABLE comind.cm_agent_operating_policy
            ADD CONSTRAINT cm_agent_operating_policy_key_version_uq
            UNIQUE (policy_key, policy_version);
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS cm_agent_operating_policy_key_effective_idx
    ON comind.cm_agent_operating_policy(policy_key, effective_from DESC, created_at DESC);

CREATE OR REPLACE FUNCTION comind.cm_reject_agent_operating_policy_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = comind, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Agent operating policy revisions are append-only; create a new policy version';
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_agent_operating_policy_updated_at
    ON comind.cm_agent_operating_policy;
DROP TRIGGER IF EXISTS trg_cm_agent_operating_policy_immutable
    ON comind.cm_agent_operating_policy;
CREATE TRIGGER trg_cm_agent_operating_policy_immutable
BEFORE UPDATE OR DELETE ON comind.cm_agent_operating_policy
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_agent_operating_policy_mutation();

CREATE OR REPLACE VIEW comind.cm_agent_operating_policy_current_v
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (p.policy_key)
    p.*
FROM comind.cm_agent_operating_policy AS p
WHERE p.effective_from <= now()
  AND (p.effective_until IS NULL OR p.effective_until > now())
ORDER BY p.policy_key, p.effective_from DESC, p.created_at DESC;

REVOKE ALL ON TABLE comind.cm_agent_operating_policy_current_v FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE comind.cm_agent_operating_policy_current_v FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE comind.cm_agent_operating_policy_current_v FROM authenticated;
    END IF;
END;
$$;

-- Append new tool-call fields to the existing view shape. CREATE OR REPLACE permits
-- adding columns at the end without changing established column identity/order.
CREATE OR REPLACE VIEW comind.cm_paid_api_access_analysis_v
WITH (security_invoker = true)
AS
SELECT
    p.proposal_id,
    p.project_id,
    pr.project_code,
    pr.title AS project_title,
    p.proposal_status,
    p.purpose,
    p.expected_benefit,
    sp.provider_code,
    sp.provider_name,
    p.model_or_service,
    p.pricing_source_url,
    p.pricing_source_version,
    p.pricing_verified_at,
    p.expected_cost,
    p.max_spend,
    p.currency AS proposal_currency,
    p.max_requests,
    p.max_input_tokens,
    p.max_output_tokens,
    p.max_total_tokens,
    p.max_tool_calls,
    p.max_retries,
    p.approved_at,
    p.approval_expires_at,
    (
        p.proposal_status = 'approved'
        AND (p.approval_expires_at IS NULL OR p.approval_expires_at > now())
    ) AS approval_current,
    e.execution_id,
    e.attempt_number,
    e.execution_status,
    e.requests_made,
    e.retries_used,
    e.actual_input_tokens,
    e.actual_cached_input_tokens,
    e.actual_output_tokens,
    e.actual_reasoning_tokens,
    e.actual_total_tokens,
    e.actual_expense,
    e.provider_reported_expense,
    e.currency AS execution_currency,
    CASE
        WHEN e.actual_expense IS NULL THEN NULL
        ELSE e.actual_expense - p.expected_cost
    END AS expense_vs_estimate,
    CASE
        WHEN e.actual_expense IS NULL THEN NULL
        ELSE p.max_spend - e.actual_expense
    END AS spend_remaining,
    CASE
        WHEN e.actual_expense IS NULL THEN false
        ELSE e.actual_expense > p.max_spend
    END AS spend_cap_breached,
    CASE
        WHEN e.execution_id IS NULL THEN false
        ELSE e.requests_made > p.max_requests
    END AS request_cap_breached,
    CASE
        WHEN e.execution_id IS NULL THEN false
        ELSE e.retries_used > p.max_retries
    END AS retry_cap_breached,
    CASE
        WHEN e.execution_id IS NULL OR p.max_input_tokens IS NULL OR e.actual_input_tokens IS NULL THEN false
        ELSE e.actual_input_tokens > p.max_input_tokens
    END AS input_token_cap_breached,
    CASE
        WHEN e.execution_id IS NULL OR p.max_output_tokens IS NULL OR e.actual_output_tokens IS NULL THEN false
        ELSE e.actual_output_tokens > p.max_output_tokens
    END AS output_token_cap_breached,
    CASE
        WHEN e.execution_id IS NULL OR p.max_total_tokens IS NULL OR e.actual_total_tokens IS NULL THEN false
        ELSE e.actual_total_tokens > p.max_total_tokens
    END AS total_token_cap_breached,
    e.failure_code,
    e.failure_report,
    e.started_at,
    e.completed_at,
    e.reconciled_at,
    e.tool_calls_made,
    CASE
        WHEN e.execution_id IS NULL OR p.max_tool_calls IS NULL OR e.tool_calls_made IS NULL THEN false
        ELSE e.tool_calls_made > p.max_tool_calls
    END AS tool_call_cap_breached
FROM comind.cm_paid_api_access_proposal AS p
JOIN comind.cm_project AS pr
  ON pr.project_id = p.project_id
JOIN public.comind_service_providers AS sp
  ON sp.id = p.provider_id
LEFT JOIN comind.cm_paid_api_execution AS e
  ON e.proposal_id = p.proposal_id;

COMMENT ON COLUMN comind.cm_paid_api_execution.tool_calls_made IS
    'Observed provider/tool invocations for this execution when available; null means unavailable, not zero.';
COMMENT ON VIEW comind.cm_agent_operating_policy_current_v IS
    'Private current-revision projection over append-only agent operating policy versions.';

COMMIT;
