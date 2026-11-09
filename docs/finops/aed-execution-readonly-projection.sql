-- Issue #550. Read-only, no database objects or grants created.
-- Run only through an already authorized private SQL connection.
-- AED evidence is not provider billing. NULL means unobserved.
WITH event_rollup AS (
 SELECT execution_id,
        count(*)::integer AS observed_events,
        count(DISTINCT sequence)::integer AS distinct_sequences,
        min(sequence) AS min_sequence, max(sequence) AS max_sequence,
        min(event_at) AS first_event_at, max(event_at) AS last_event_at,
        count(*) FILTER (WHERE provider IS NOT NULL)::integer AS provider_tagged_events,
        count(*) FILTER (WHERE actual_cost_usd IS NOT NULL)::integer AS priced_events,
        CASE WHEN count(*) FILTER (WHERE actual_cost_usd IS NOT NULL) = count(*)
             THEN sum(actual_cost_usd) ELSE NULL::numeric END AS actual_cost_usd
 FROM comind_pm.pm_aed_monitor_event
 GROUP BY execution_id
)
SELECT x.execution_id, x.lane_id, x.workflow_run_url,
       x.source_sha256, x.artifact_sha256,
       x.event_count AS declared_events,
       r.observed_events, r.distinct_sequences,
       r.min_sequence, r.max_sequence,
       r.first_event_at, r.last_event_at,
       r.provider_tagged_events, r.priced_events,
       r.actual_cost_usd,
       (r.observed_events = x.event_count
        AND r.distinct_sequences = x.event_count
        AND r.min_sequence = 1
        AND r.max_sequence = x.event_count) AS sequence_verified,
       'not_observed'::text AS work_allowance_status,
       NULL::numeric AS work_allowance_delta
FROM comind_pm.pm_aed_monitor_execution AS x
LEFT JOIN event_rollup AS r USING (execution_id)
ORDER BY x.execution_id;
