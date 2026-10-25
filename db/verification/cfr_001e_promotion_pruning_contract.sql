-- CFR-001E read-only Test acceptance verification
-- Date: 2026-10-25
-- Issue #181 / PR #184
-- Environment: Supabase Test only
-- Production changed: no
-- Destructive pruning enabled: no
--
-- The time checks are anchored to the proof conversation's latest capture time
-- so this verifier remains stable after the real 36-hour wall clock expires.

WITH proof AS (
  SELECT
    c.conv_id,
    c.external_ref,
    g.generation_id,
    g.status AS generation_status,
    cp.checkpoint_id,
    cp.last_capture_sequence,
    cp.partial_assistant_content,
    pe.evaluation_id,
    pe.decision,
    pm.manifest_id,
    pm.first_sequence,
    pm.last_sequence,
    pm.event_count,
    pm.source_digest,
    pm.manifest_sha256,
    pm.durable_destinations,
    pm.manifest_snapshot,
    (SELECT max(captured_at)
       FROM comind.cm_conversation_capture_event e
      WHERE e.conv_id=c.conv_id) AS latest_capture_at,
    (SELECT encode(
       extensions.digest(
         string_agg(e.sequence_no::text || ':' || e.event_sha256::text, '|' ORDER BY e.sequence_no),
         'sha256'
       ),
       'hex'
     )
       FROM comind.cm_conversation_capture_event e
      WHERE e.conv_id=c.conv_id) AS recomputed_source_digest,
    encode(extensions.digest(pm.manifest_snapshot::text,'sha256'),'hex') AS recomputed_manifest_sha256
  FROM comind.cm_conversation c
  JOIN comind.cm_assistant_generation g
    ON g.conv_id=c.conv_id
  JOIN comind.cm_conversation_recovery_checkpoint cp
    ON cp.conv_id=c.conv_id
   AND cp.generation_id=g.generation_id
  JOIN comind.cm_conversation_promotion_evaluation pe
    ON pe.conv_id=c.conv_id
   AND pe.checkpoint_id=cp.checkpoint_id
  JOIN comind.cm_conversation_prune_manifest pm
    ON pm.conv_id=c.conv_id
   AND pm.evaluation_id=pe.evaluation_id
   AND pm.checkpoint_id=cp.checkpoint_id
  WHERE c.conv_id='e1810001-0000-4000-8000-000000000001'::uuid
), evals AS (
  SELECT
    proof.*,
    comind.cm_evaluate_conversation_prune_eligibility(
      proof.conv_id,
      proof.latest_capture_at + interval '1 hour'
    ) AS protected_eval,
    comind.cm_evaluate_conversation_prune_eligibility(
      proof.conv_id,
      proof.latest_capture_at + interval '40 hours'
    ) AS eligible_eval
  FROM proof
), bindings AS (
  SELECT
    array_agg(rb.target_table ORDER BY rb.target_table)
      FILTER (WHERE rp.name='conversation_raw_protected_36h'::extensions.citext) AS raw_targets,
    array_agg(rb.target_table ORDER BY rb.target_table)
      FILTER (WHERE rp.name='conversation_continuity_evidence_retained'::extensions.citext) AS evidence_targets,
    bool_and((rp.rules ->> 'destructive_pruning_enabled')::boolean = false)
      FILTER (WHERE rp.name='conversation_continuity_evidence_retained'::extensions.citext) AS evidence_policy_non_destructive,
    bool_and((rp.rules ->> 'prune_executor_enabled')::boolean = false)
      FILTER (WHERE rp.name='conversation_raw_protected_36h'::extensions.citext) AS raw_policy_executor_disabled
  FROM comind.cm_retention_policy rp
  JOIN comind.cm_retention_binding rb ON rb.rp_id=rp.rp_id
  WHERE rp.name IN (
    'conversation_raw_protected_36h'::extensions.citext,
    'conversation_continuity_evidence_retained'::extensions.citext
  )
), acl AS (
  SELECT
    NOT has_table_privilege(
      'anon','comind.cm_conversation_prune_manifest','SELECT,INSERT,UPDATE,DELETE'
    ) AS anon_table_blocked,
    NOT has_table_privilege(
      'authenticated','comind.cm_conversation_prune_manifest','SELECT,INSERT,UPDATE,DELETE'
    ) AS authenticated_table_blocked,
    has_table_privilege(
      'service_role','comind.cm_conversation_prune_manifest','SELECT,INSERT'
    ) AS service_table_allowed,
    NOT has_function_privilege(
      'anon',
      'comind.cm_evaluate_conversation_prune_eligibility(uuid,timestamp with time zone)',
      'EXECUTE'
    ) AS anon_function_blocked,
    NOT has_function_privilege(
      'authenticated',
      'comind.cm_evaluate_conversation_prune_eligibility(uuid,timestamp with time zone)',
      'EXECUTE'
    ) AS authenticated_function_blocked,
    has_function_privilege(
      'service_role',
      'comind.cm_evaluate_conversation_prune_eligibility(uuid,timestamp with time zone)',
      'EXECUTE'
    ) AS service_function_allowed
), manifest_count AS (
  SELECT count(*)::int AS count
  FROM comind.cm_conversation_prune_manifest
  WHERE conv_id='e1810001-0000-4000-8000-000000000001'::uuid
), checks AS (
  SELECT
    e.conv_id='e1810001-0000-4000-8000-000000000001'::uuid AS conversation_ok,
    e.external_ref='cfr-001e-live-prune-contract-20261025' AS external_ref_ok,
    e.generation_status='interrupted' AS generation_interrupted_ok,
    e.last_capture_sequence=5 AS checkpoint_sequence_ok,
    e.partial_assistant_content='Preserve this interrupted assistant text exactly.' AS partial_content_ok,
    e.decision='eligible_to_prune' AS promotion_decision_ok,
    e.first_sequence=1 AND e.last_sequence=5 AND e.event_count=5 AS manifest_range_ok,
    e.source_digest=e.recomputed_source_digest AS source_digest_ok,
    e.manifest_sha256=e.recomputed_manifest_sha256 AS manifest_digest_ok,
    jsonb_array_length(e.durable_destinations)=1
      AND e.durable_destinations->0->>'checkpoint_id'=e.checkpoint_id::text AS durable_destination_ok,
    (e.protected_eval->>'eligible')::boolean=false
      AND e.protected_eval->'hold_reasons' ? 'protected_window_active' AS protected_window_ok,
    (e.eligible_eval->>'eligible')::boolean=true
      AND jsonb_array_length(e.eligible_eval->'hold_reasons')=0 AS future_eligibility_ok,
    (e.eligible_eval->>'destructive_pruning_enabled')::boolean=false
      AND (e.manifest_snapshot->'eligibility'->>'destructive_pruning_enabled')::boolean=false AS non_destructive_ok,
    b.raw_targets=ARRAY['comind.cm_conversation_capture_event']::text[] AS raw_binding_ok,
    b.evidence_targets=ARRAY[
      'comind.cm_conversation_promotion_evaluation',
      'comind.cm_conversation_prune_manifest',
      'comind.cm_conversation_recovery_checkpoint'
    ]::text[] AS evidence_bindings_ok,
    b.evidence_policy_non_destructive=true
      AND b.raw_policy_executor_disabled=true AS policy_executor_disabled_ok,
    a.anon_table_blocked
      AND a.authenticated_table_blocked
      AND a.service_table_allowed
      AND a.anon_function_blocked
      AND a.authenticated_function_blocked
      AND a.service_function_allowed AS acl_ok,
    mc.count=1 AS manifest_idempotency_ok
  FROM evals e
  CROSS JOIN bindings b
  CROSS JOIN acl a
  CROSS JOIN manifest_count mc
)
SELECT
  CASE
    WHEN (
      SELECT bool_and(value::boolean)
      FROM jsonb_each_text(to_jsonb(checks)) kv(key,value)
    ) THEN 'PASS'
    ELSE 'FAIL'
  END AS result,
  to_jsonb(checks) AS checks
FROM checks;
