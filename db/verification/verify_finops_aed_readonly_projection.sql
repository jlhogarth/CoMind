-- Issue #550. SELECT-only baseline and browser-role regression.
-- Run in a read-only transaction. Live SET LOCAL ROLE denial probes are in the runbook.
WITH baseline(execution_id, expected_events) AS (
    VALUES ('580f3fad73905c8230b2bfc8', 65),
           ('46a39216f4a41b89382a3fb1', 122),
           ('19a6a6fe965a0526017a656c', 59)
), per_execution AS (
    SELECT b.execution_id, b.expected_events, x.event_count AS declared_count,
           count(e.sequence)::integer AS observed_count,
           count(DISTINCT e.sequence)::integer AS distinct_count,
           min(e.sequence) AS first_sequence, max(e.sequence) AS last_sequence,
           count(e.actual_cost_usd)::integer AS priced_count,
           count(*) FILTER (WHERE e.sequence IS NOT NULL
                              AND NOT coalesce(e.payload_sha256 ~ '^[0-9a-f]{64}$', false))
               AS missing_or_invalid_payload_hashes
    FROM baseline b
    LEFT JOIN comind_pm.pm_aed_monitor_execution x USING (execution_id)
    LEFT JOIN comind_pm.pm_aed_monitor_event e ON e.execution_id = x.execution_id
    GROUP BY b.execution_id, b.expected_events, x.event_count
), checks AS (
    SELECT count(declared_count) AS executions, sum(observed_count) AS events,
           bool_and(coalesce(expected_events = declared_count
                             AND declared_count = observed_count AND observed_count = distinct_count
                             AND first_sequence = 1 AND last_sequence = declared_count, false))
               AS sequence_integrity,
           sum(priced_count) AS priced_events,
           sum(missing_or_invalid_payload_hashes) AS missing_or_invalid_payload_hashes
    FROM per_execution
), access_checks AS (
    SELECT bool_and(NOT has_schema_privilege(browser_role, 'comind_pm', 'USAGE')
                    AND NOT has_any_column_privilege(browser_role,
                        'comind_pm.pm_aed_monitor_execution', 'SELECT')
                    AND NOT has_any_column_privilege(browser_role,
                        'comind_pm.pm_aed_monitor_event', 'SELECT')) AS browser_roles_denied
    FROM (VALUES ('anon'), ('authenticated')) AS roles(browser_role)
)
SELECT checks.*, access_checks.browser_roles_denied,
       CASE WHEN executions = 3 AND events = 246 AND sequence_integrity
                     AND priced_events = 0 AND missing_or_invalid_payload_hashes = 0
                     AND browser_roles_denied
            THEN 'PASS: historical AED baseline and browser permissions'
            ELSE 'REVIEW: baseline or browser permissions changed' END AS baseline_result
FROM checks CROSS JOIN access_checks;
