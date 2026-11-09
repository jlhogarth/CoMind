-- FinOps / FlowOps AED evidence projection, issue #550.
-- READ ONLY: execute as an authorized private reader, never grant public Data API access.
-- This query was run against CoMind Test on 2026-11-09; 3 executions, 246 events.
-- Cost is NULL unless EVERY event in the execution has a recorded cost.
-- Partial provider cost evidence is separately counted, never silently treated as a total.
WITH event_rollup AS (
 SELECT execution_id,
        count(*)::int AS observed_event_count,
        min(sequence) AS min_sequence,
        max(sequence) AS max_sequence,
        count(DISTINCT sequence)::int AS distinct_sequences,
        min(event_at) AS first_event_at,
        max(event_at) AS last_event_at,
        count(*) FILTER (WHERE payload_sha256 IS NOT NULL)::int AS hashed_events,
        count(*) FILTER (WHERE provider IS NOT NULL)::int AS provider_tagged_events,
        count(*) FILTER (WHERE actual_cost_usd IS NOT NULL)::int AS priced_events,
        sum(actual_cost_usd) AS observed_cost_usd
 FROM comind_pm.pm_aed_monitor_event
 GROUP BY execution_id
)
SELECT x.execution_id, x.lane_id,
       x.event_count AS declared_event_count,
       r.observed_event_count,
       (r.observed_event_count = x.event_count
         AND r.min_sequence = 1
         AND r.max_sequence = x.event_count
         AND r.distinct_sequences = x.event_count) AS sequence_complete,
       r.hashed_events, r.provider_tagged_events, r.priced_events,
       CASE WHEN r.priced_events = r.observed_event_count
            THEN r.observed_cost_usd ELSE NULL END AS complete_actual_cost_usd,
       CASE WHEN r.priced_events = 0 THEN 'unmeasured'
            WHEN r.priced_events < r.observed_event_count THEN 'partial'
            ELSE 'recorded_all_events' END AS cost_coverage,
       x.source_sha256, x.artifact_sha256, x.workflow_run_url,
       r.first_event_at, r.last_event_at
FROM comind_pm.pm_aed_monitor_execution x
JOIN event_rollup r USING (execution_id)
ORDER BY r.first_event_at, x.execution_id;
