-- CINT-GOV-001: harden unit-economics views against multi-dimensional join fanout.
-- Issue: https://github.com/jlhogarth/CoMind/issues/274

BEGIN;

DO $$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_api_cost_receipt'),
            ('comind.cm_foundry_escalation_event'),
            ('comind.cm_foundry_deliverable_cost_allocation'),
            ('comind.cm_foundry_execution_outcome'),
            ('comind.cm_task'),
            ('comind.cm_project')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-GOV-001 unit-economics hardening requires relations: %', v_missing;
    END IF;
END;
$$;

-- Aggregate each one-to-many dimension independently before joining it to task cost.
-- This prevents a task with N escalations and M deliverables from multiplying receipt cost N*M times.
CREATE OR REPLACE VIEW comind.cm_foundry_task_economics_v
WITH (security_invoker = true)
AS
WITH receipt_rollup AS (
    SELECT
        r.project_id,
        r.task_id,
        r.currency,
        count(*) AS paid_execution_count,
        count(DISTINCT r.foundry_execution_context_id) AS foundry_execution_count,
        bool_or(o.terminal_status = 'succeeded') AS has_succeeded_execution,
        sum(r.actual_cost) AS total_api_cost,
        min(r.transaction_at) AS first_paid_execution_at,
        max(r.transaction_at) AS last_paid_execution_at
    FROM comind.cm_api_cost_receipt AS r
    LEFT JOIN comind.cm_foundry_execution_outcome AS o
      ON o.execution_context_id = r.foundry_execution_context_id
    WHERE r.task_id IS NOT NULL
    GROUP BY r.project_id, r.task_id, r.currency
), escalation_rollup AS (
    SELECT
        project_id,
        task_id,
        currency,
        count(*) AS escalation_event_count
    FROM comind.cm_foundry_escalation_event
    WHERE task_id IS NOT NULL
    GROUP BY project_id, task_id, currency
), deliverable_rollup AS (
    SELECT
        d.project_id,
        d.task_id,
        r.currency,
        count(DISTINCT d.deliverable_ref) FILTER (
            WHERE d.acceptance_status <> 'rejected'
        ) AS deliverable_count
    FROM comind.cm_foundry_deliverable_cost_allocation AS d
    JOIN comind.cm_api_cost_receipt AS r ON r.execution_id = d.execution_id
    WHERE d.task_id IS NOT NULL
    GROUP BY d.project_id, d.task_id, r.currency
)
SELECT
    rr.project_id,
    p.project_code,
    rr.task_id,
    t.title AS task_title,
    t.status AS task_status,
    rr.currency,
    rr.paid_execution_count,
    rr.foundry_execution_count,
    rr.has_succeeded_execution,
    (t.status = 'done' AND rr.has_succeeded_execution) AS successful_task,
    rr.total_api_cost,
    CASE
        WHEN t.status = 'done' AND rr.has_succeeded_execution THEN rr.total_api_cost
        ELSE NULL
    END AS successful_task_cost,
    rr.first_paid_execution_at,
    rr.last_paid_execution_at,
    COALESCE(er.escalation_event_count, 0) AS escalation_event_count,
    COALESCE(dr.deliverable_count, 0) AS deliverable_count
FROM receipt_rollup AS rr
JOIN comind.cm_project AS p ON p.project_id = rr.project_id
JOIN comind.cm_task AS t ON t.task_id = rr.task_id
LEFT JOIN escalation_rollup AS er
  ON er.project_id = rr.project_id
 AND er.task_id = rr.task_id
 AND er.currency = rr.currency
LEFT JOIN deliverable_rollup AS dr
  ON dr.project_id = rr.project_id
 AND dr.task_id = rr.task_id
 AND dr.currency = rr.currency;

-- Project economics deliberately use the independently aggregated task and deliverable views.
CREATE OR REPLACE VIEW comind.cm_foundry_project_unit_economics_v
WITH (security_invoker = true)
AS
WITH task_rollup AS (
    SELECT
        project_id,
        currency,
        count(*) AS paid_task_count,
        count(*) FILTER (WHERE successful_task) AS successful_task_count,
        sum(total_api_cost) AS total_api_cost
    FROM comind.cm_foundry_task_economics_v
    GROUP BY project_id, currency
), deliverable_rollup AS (
    SELECT
        project_id,
        currency,
        count(DISTINCT deliverable_ref) AS deliverable_count,
        sum(allocated_api_cost) AS allocated_deliverable_cost
    FROM comind.cm_foundry_deliverable_economics_v
    GROUP BY project_id, currency
), escalation_rollup AS (
    SELECT
        project_id,
        currency,
        count(*) AS escalation_event_count,
        count(DISTINCT task_id) FILTER (WHERE task_id IS NOT NULL) AS escalated_task_count
    FROM comind.cm_foundry_escalation_event
    GROUP BY project_id, currency
)
SELECT
    t.project_id,
    p.project_code,
    t.currency,
    t.paid_task_count,
    t.successful_task_count,
    t.total_api_cost,
    CASE WHEN t.paid_task_count = 0 THEN NULL
         ELSE t.total_api_cost / t.paid_task_count
    END AS cost_per_paid_task,
    CASE WHEN t.successful_task_count = 0 THEN NULL
         ELSE t.total_api_cost / t.successful_task_count
    END AS cost_per_successful_task,
    COALESCE(d.deliverable_count, 0) AS deliverable_count,
    COALESCE(d.allocated_deliverable_cost, 0) AS allocated_deliverable_cost,
    CASE WHEN COALESCE(d.deliverable_count, 0) = 0 THEN NULL
         ELSE d.allocated_deliverable_cost / d.deliverable_count
    END AS cost_per_deliverable,
    COALESCE(e.escalation_event_count, 0) AS escalation_event_count,
    COALESCE(e.escalated_task_count, 0) AS escalated_task_count,
    CASE WHEN t.paid_task_count = 0 THEN NULL
         ELSE COALESCE(e.escalated_task_count, 0)::numeric / t.paid_task_count::numeric
    END AS paid_task_escalation_rate
FROM task_rollup AS t
JOIN comind.cm_project AS p ON p.project_id = t.project_id
LEFT JOIN deliverable_rollup AS d
  ON d.project_id = t.project_id AND d.currency = t.currency
LEFT JOIN escalation_rollup AS e
  ON e.project_id = t.project_id AND e.currency = t.currency;

COMMENT ON VIEW comind.cm_foundry_task_economics_v IS
    'Foundry task economics with receipt cost, escalation count, and deliverable count aggregated independently to prevent join fanout.';
COMMENT ON VIEW comind.cm_foundry_project_unit_economics_v IS
    'Project-level unit economics derived from fanout-safe task, deliverable, and escalation aggregates.';

COMMIT;
