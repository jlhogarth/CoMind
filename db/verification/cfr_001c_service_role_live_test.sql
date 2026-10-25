-- CFR-001C live Test service-role acceptance verification
-- Date: 2026-10-25
-- Environment: Supabase Test only
-- Project ref: sbgfuanxiqepcoboxzcl
-- Provider/model call: none; proof is synthetic and non-cost-bearing.
--
-- This read-only verification targets the durable proof records created under
-- SET LOCAL ROLE service_role. It verifies the two application lifecycle paths
-- required by CFR-001C: completed streaming and interrupted streaming.

WITH proof_conversations AS (
  SELECT conv_id, external_ref
  FROM comind.cm_conversation
  WHERE conv_id IN (
    '9881599b-6bef-4ee9-baef-b7b8073532eb'::uuid,
    '1f0a2cd2-dc29-420f-a3f4-45a5b15200a0'::uuid
  )
), event_summary AS (
  SELECT
    e.conv_id,
    count(*)::int AS event_count,
    min(e.sequence_no)::bigint AS first_sequence,
    max(e.sequence_no)::bigint AS last_sequence,
    string_agg(e.event_type, ' -> ' ORDER BY e.sequence_no) AS event_path,
    string_agg(e.content_delta, '' ORDER BY e.sequence_no)
      FILTER (WHERE e.event_type='assistant_delta') AS reconstructed_stream,
    count(*) FILTER (WHERE e.event_type='user_message_observed')::int AS user_observation_events,
    count(*) FILTER (WHERE e.event_type='assistant_generation_started')::int AS generation_started_events,
    count(*) FILTER (WHERE e.event_type='assistant_delta')::int AS delta_events,
    count(*) FILTER (WHERE e.event_type='assistant_generation_completed')::int AS completion_events,
    count(*) FILTER (WHERE e.event_type='assistant_generation_interrupted')::int AS interruption_events
  FROM comind.cm_conversation_capture_event e
  JOIN proof_conversations p ON p.conv_id=e.conv_id
  GROUP BY e.conv_id
), message_summary AS (
  SELECT
    m.conv_id,
    count(*) FILTER (WHERE m.role='user')::int AS user_messages,
    count(*) FILTER (WHERE m.role='assistant')::int AS assistant_messages,
    string_agg(m.content, '' ORDER BY m.created_at, m.msg_id)
      FILTER (WHERE m.role='assistant') AS canonical_assistant_content
  FROM comind.cm_message m
  JOIN proof_conversations p ON p.conv_id=m.conv_id
  GROUP BY m.conv_id
), checks AS (
  SELECT
    c.external_ref,
    c.conv_id,
    g.generation_id,
    g.status,
    g.assistant_msg_id,
    es.event_count,
    es.first_sequence,
    es.last_sequence,
    es.event_path,
    es.reconstructed_stream,
    ms.user_messages,
    ms.assistant_messages,
    CASE
      WHEN c.external_ref='cfr-001c-service-proof-interrupted-20261025'
        THEN g.status='interrupted'
         AND g.assistant_msg_id IS NULL
         AND es.event_count=5
         AND es.first_sequence=1 AND es.last_sequence=5
         AND es.user_observation_events=1
         AND es.generation_started_events=1
         AND es.delta_events=2
         AND es.interruption_events=1
         AND es.completion_events=0
         AND ms.user_messages=1
         AND ms.assistant_messages=0
         AND es.reconstructed_stream='This partial response survived the synthetic interruption.'
      WHEN c.external_ref='cfr-001c-service-proof-completed-20261025'
        THEN g.status='completed'
         AND g.assistant_msg_id IS NOT NULL
         AND es.event_count=5
         AND es.first_sequence=1 AND es.last_sequence=5
         AND es.user_observation_events=1
         AND es.generation_started_events=1
         AND es.delta_events=2
         AND es.completion_events=1
         AND es.interruption_events=0
         AND ms.user_messages=1
         AND ms.assistant_messages=1
         AND es.reconstructed_stream='This completed response was captured before canonical completion.'
         AND ms.canonical_assistant_content=es.reconstructed_stream
      ELSE false
    END AS acceptance_pass
  FROM proof_conversations c
  JOIN comind.cm_assistant_generation g ON g.conv_id=c.conv_id
  JOIN event_summary es ON es.conv_id=c.conv_id
  JOIN message_summary ms ON ms.conv_id=c.conv_id
)
SELECT
  CASE WHEN count(*)=2 AND bool_and(acceptance_pass) THEN 'PASS' ELSE 'FAIL' END AS result,
  jsonb_agg(to_jsonb(checks) ORDER BY external_ref) AS evidence
FROM checks;