-- CINT-FINOPS-003: post-settlement paid-API reconciliation observability.
-- Issue: https://github.com/jlhogarth/CoMind/issues/283
-- Parent: https://github.com/jlhogarth/CoMind/issues/274
--
-- A provider cost may be durably settled by the authoritative FinOps path before
-- the CINT paid-execution reconciliation transaction completes. That state is
-- recoverable and must be directly observable without misclassifying the usage
-- as unattributed. This private view exposes exactly that reconciliation backlog.

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
            ('public.comind_cost_reservations'),
            ('public.comind_usage_events'),
            ('public.comind_service_providers')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-FINOPS-003 reconciliation observability requires existing relations: %', v_missing;
    END IF;
END;
$$;

CREATE OR REPLACE VIEW comind.cm_paid_api_reconciliation_pending_v
WITH (security_invoker = true)
AS
SELECT
    e.execution_id,
    e.proposal_id,
    p.project_id,
    e.binding_id,
    e.reservation_id,
    e.routing_decision_id,
    e.foundry_execution_context_id,
    e.provider_execution_fingerprint,
    e.execution_status,
    e.attempt_number,
    p.provider_id,
    sp.provider_code,
    p.model_or_service,
    cr.status AS reservation_status,
    cr.finalized_cost,
    btrim(cr.currency::text) AS currency,
    ue.id AS usage_event_id,
    ue.provider_event_id,
    ue.measured_cost,
    ue.occurred_at AS usage_occurred_at,
    e.started_at,
    e.completed_at,
    e.reconciled_at,
    CASE
        WHEN r.receipt_id IS NULL THEN false
        ELSE true
    END AS receipt_exists,
    clock_timestamp() - ue.occurred_at AS reconciliation_age
FROM comind.cm_paid_api_execution AS e
JOIN comind.cm_paid_api_access_proposal AS p
  ON p.proposal_id = e.proposal_id
JOIN public.comind_service_providers AS sp
  ON sp.id = p.provider_id
JOIN public.comind_cost_reservations AS cr
  ON cr.id = e.reservation_id
JOIN public.comind_usage_events AS ue
  ON ue.reservation_id = e.reservation_id
 AND ue.meter_code = 'provider_execution'
LEFT JOIN comind.cm_api_cost_receipt AS r
  ON r.execution_id = e.execution_id
WHERE cr.status = 'finalized'
  AND e.execution_status <> 'reconciled';

COMMENT ON VIEW comind.cm_paid_api_reconciliation_pending_v IS
    'Private recovery queue for governed paid API executions whose authoritative FinOps provider cost is finalized but whose CINT execution has not yet reconciled. Presence requires recovery/reconciliation, not another provider call.';

REVOKE ALL ON TABLE comind.cm_paid_api_reconciliation_pending_v FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE comind.cm_paid_api_reconciliation_pending_v FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE comind.cm_paid_api_reconciliation_pending_v FROM authenticated;
    END IF;
END;
$$;

COMMIT;
