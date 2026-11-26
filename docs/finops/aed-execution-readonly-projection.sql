-- Issue #550. Execute through an authorized private connection in a read-only transaction.
-- Export only these projected fields. No raw payloads, writes, grants, or Data API exposure.
WITH event_rollup AS (
    SELECT execution_id,
           count(*)::integer AS observed_events,
           count(DISTINCT sequence)::integer AS distinct_sequences,
           min(sequence) AS min_sequence,
           max(sequence) AS max_sequence,
           min(event_at) AS first_event_at,
           max(event_at) AS last_event_at,
           min(event_at) FILTER (WHERE sequence = 1) AS sequence_first_at,
           max(event_at) FILTER (WHERE kind IN ('exited', 'timeout')) AS terminal_at,
           count(*) FILTER (WHERE kind IN ('exited', 'timeout')) AS terminal_count,
           max(sequence) FILTER (WHERE kind IN ('exited', 'timeout')) AS terminal_sequence,
           max(elapsed_ms) FILTER (WHERE kind IN ('exited', 'timeout')) AS duration_ms,
           count(*) FILTER (WHERE payload_sha256 ~ '^[0-9a-f]{64}$')::integer AS hashed_events,
           array_agg(DISTINCT provider ORDER BY provider)
               FILTER (WHERE provider IS NOT NULL AND provider <> 'local') AS providers,
           sum(CASE WHEN payload->>'input_tokens' ~ '^[0-9]+$'
                    THEN (payload->>'input_tokens')::numeric END)
               FILTER (WHERE kind = 'aed_event' AND payload->>'phase' IN ('end', 'error')) AS input_tokens,
           sum(CASE WHEN payload->>'output_tokens' ~ '^[0-9]+$'
                    THEN (payload->>'output_tokens')::numeric END)
               FILTER (WHERE kind = 'aed_event' AND payload->>'phase' IN ('end', 'error')) AS output_tokens,
           count(actual_cost_usd)::integer AS priced_events,
           count(actual_cost_usd) FILTER (WHERE payload->>'usage_source' = 'provider_receipt')
               AS receipt_tagged_events
    FROM comind_pm.pm_aed_monitor_event
    GROUP BY execution_id
)
SELECT x.execution_id, x.lane_id, x.workflow_run_url,
       x.source_sha256, x.artifact_sha256,
       x.first_at, x.last_at,
       x.event_count AS declared_events,
       coalesce(r.observed_events, 0) AS observed_events,
       coalesce(r.hashed_events, 0) AS hashed_events,
       r.distinct_sequences, r.min_sequence, r.max_sequence,
       r.providers, NULL::text AS model,
       r.input_tokens, r.output_tokens, r.duration_ms,
       coalesce(r.priced_events, 0) AS priced_events,
       coalesce(r.receipt_tagged_events, 0) AS receipt_tagged_events,
       -- AED tags alone cannot authenticate a receipt or prove a complete billed total.
       NULL::numeric AS actual_cost_usd,
       NULL::numeric AS estimated_cost_usd,
       coalesce(r.observed_events = x.event_count
                AND r.distinct_sequences = x.event_count
                AND r.min_sequence = 1 AND r.max_sequence = x.event_count
                AND r.first_event_at = x.first_at AND r.sequence_first_at = x.first_at
                AND r.last_event_at = x.last_at AND r.terminal_at = x.last_at
                AND r.terminal_count = 1 AND r.terminal_sequence = x.event_count, false)
           AS sequence_verified
FROM comind_pm.pm_aed_monitor_execution AS x
LEFT JOIN event_rollup AS r USING (execution_id)
ORDER BY x.execution_id;
