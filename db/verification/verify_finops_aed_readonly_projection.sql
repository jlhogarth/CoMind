-- Issue #550 regression assertion. SELECT-only, no database mutation.
-- Historical baseline is a checkpoint, not a rule that future AED executions are forbidden.
WITH per_execution AS (
 SELECT x.execution_id, x.event_count AS declared_count,
        count(e.sequence)::integer AS observed_count,
        count(DISTINCT e.sequence)::integer AS distinct_count,
        min(e.sequence) AS first_sequence, max(e.sequence) AS last_sequence,
        count(e.actual_cost_usd)::integer AS priced_count,
        count(*) FILTER (WHERE e.sequence IS NOT NULL AND e.payload_sha256 IS NULL)::integer AS missing_payload_hashes
 FROM comind_pm.pm_aed_monitor_execution x
 LEFT JOIN comind_pm.pm_aed_monitor_event e ON e.execution_id=x.execution_id
 GROUP BY x.execution_id,x.event_count
)
SELECT count(*) AS executions,
       sum(observed_count) AS events,
       bool_and(declared_count=observed_count AND observed_count=distinct_count
                AND first_sequence=1 AND last_sequence=declared_count) AS sequence_integrity,
       sum(priced_count) AS priced_events,
       sum(missing_payload_hashes) AS missing_payload_hashes,
       CASE WHEN count(*)=3 AND sum(observed_count)=246
              AND bool_and(declared_count=observed_count AND observed_count=distinct_count
                           AND first_sequence=1 AND last_sequence=declared_count)
              AND sum(priced_count)=0 AND sum(missing_payload_hashes)=0
            THEN 'PASS: historical AED baseline' ELSE 'REVIEW: baseline changed or incomplete' END AS baseline_result
FROM per_execution;
