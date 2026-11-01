BEGIN;

CREATE OR REPLACE FUNCTION comind_pm.lane_continuity_census()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, comind_pm, comind
AS $$
WITH recovery_controller AS (
  SELECT
    wi.metadata,
    le.details,
    COALESCE(le.occurred_at, wi.last_event_at, wi.updated_at) AS observed_at
  FROM comind_pm.pm_work_items wi
  LEFT JOIN LATERAL (
    SELECT e.details, e.occurred_at
    FROM comind_pm.pm_events e
    WHERE e.work_item_id = wi.id
    ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
    LIMIT 1
  ) le ON true
  WHERE wi.work_key = 'L4A-RECOVERY'
  LIMIT 1
),
lanes AS (
  SELECT wi.*
  FROM comind_pm.pm_work_items wi
  WHERE wi.item_type = 'lane'
),
resolved AS (
  SELECT
    wi.*,
    COALESCE(wi.last_event_at, wi.updated_at, wi.created_at) AS activity_at,
    le.event_type AS latest_event_type,
    le.outcome AS latest_event_outcome,
    le.details AS latest_event_details,
    le.evidence AS latest_event_evidence,
    le.occurred_at AS latest_event_occurred_at,
    b.id AS binding_event_id,
    b.event_type AS binding_event_type,
    b.execution_surface,
    b.external_conversation_id,
    b.registered_conversation_url,
    b.observed_title AS binding_observed_title,
    b.identity_evidence_ref,
    b.created_at AS binding_created_at,
    t.id AS title_event_id,
    t.observed_title AS current_title,
    t.observed_at AS current_title_observed_at,
    COALESCE(tc.title_history_count, 0) AS title_history_count,
    rc.metadata AS recovery_metadata,
    rc.details AS recovery_details,
    rc.observed_at AS recovery_observed_at
  FROM lanes wi
  LEFT JOIN LATERAL (
    SELECT e.event_type, e.outcome, e.details, e.evidence, e.occurred_at
    FROM comind_pm.pm_events e
    WHERE e.work_item_id = wi.id
    ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
    LIMIT 1
  ) le ON true
  LEFT JOIN LATERAL (
    SELECT e.*
    FROM comind_pm.pm_lane_conversation_binding_events e
    WHERE e.work_item_id = wi.id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  ) b ON true
  LEFT JOIN LATERAL (
    SELECT te.id, te.observed_title, te.observed_at
    FROM comind_pm.pm_lane_conversation_title_events te
    WHERE te.work_item_id = wi.id
      AND b.id IS NOT NULL
      AND te.external_conversation_id = b.external_conversation_id
      AND te.registered_conversation_url = b.registered_conversation_url
    ORDER BY te.observed_at DESC, te.created_at DESC, te.id DESC
    LIMIT 1
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS title_history_count
    FROM comind_pm.pm_lane_conversation_title_events te
    WHERE te.work_item_id = wi.id
      AND b.id IS NOT NULL
      AND te.external_conversation_id = b.external_conversation_id
      AND te.registered_conversation_url = b.registered_conversation_url
  ) tc ON true
  LEFT JOIN recovery_controller rc ON true
),
classified AS (
  SELECT
    r.*,
    CASE
      WHEN lower(COALESCE(r.metadata ->> 'superseded', 'false')) = 'true'
        OR r.metadata ? 'superseded_by'
        OR lower(COALESCE(r.metadata ->> 'repository_status', '')) = 'superseded'
        THEN 'SUPERSEDED'
      WHEN r.status IN ('done','cancelled') THEN 'COMPLETE'
      WHEN COALESCE(r.recovery_metadata ->> 'selected_lane', r.recovery_details ->> 'selected_lane') = r.work_key
        AND lower(COALESCE(r.recovery_metadata ->> 'recoveryOwnershipReleased', r.recovery_details ->> 'recoveryOwnershipReleased', 'true')) = 'false'
        THEN 'RECOVERY_OWNED'
      WHEN lower(COALESCE(
        r.metadata ->> 'requires_joseph_action',
        r.metadata ->> 'joseph_action_required',
        r.latest_event_details ->> 'requires_joseph_action',
        r.latest_event_details ->> 'requires_user_action',
        'false'
      )) = 'true' THEN 'HUMAN_BLOCKED'
      WHEN lower(COALESCE(r.latest_event_details ->> 'returnStatus', r.metadata ->> 'returnStatus', '')) IN ('return_unavailable','return_failed')
        THEN 'WAITING'
      WHEN COALESCE(
        NULLIF(btrim(COALESCE(r.latest_event_details ->> 'blocker', '')), ''),
        NULLIF(btrim(COALESCE(r.metadata ->> 'blocker', '')), '')
      ) IS NOT NULL THEN 'WAITING'
      WHEN r.status IN ('blocked','review','ready')
        OR lower(COALESCE(r.metadata ->> 'external_input_status','')) IN ('requested_awaiting_ready','waiting','pending','deferred')
        THEN 'WAITING'
      WHEN r.status = 'in_progress' AND r.activity_at < current_timestamp - interval '6 hours'
        THEN 'DORMANT'
      ELSE 'ACTIVE'
    END AS continuity_class,
    CASE
      WHEN lower(COALESCE(r.metadata ->> 'superseded', 'false')) = 'true' OR r.metadata ? 'superseded_by'
        THEN 'explicit_supersession_metadata'
      WHEN lower(COALESCE(r.metadata ->> 'repository_status', '')) = 'superseded'
        THEN 'repository_status_superseded'
      WHEN r.status IN ('done','cancelled') THEN 'canonical_pm_terminal_status'
      WHEN COALESCE(r.recovery_metadata ->> 'selected_lane', r.recovery_details ->> 'selected_lane') = r.work_key
        AND lower(COALESCE(r.recovery_metadata ->> 'recoveryOwnershipReleased', r.recovery_details ->> 'recoveryOwnershipReleased', 'true')) = 'false'
        THEN 'recovery_controller_claim_not_released'
      WHEN lower(COALESCE(
        r.metadata ->> 'requires_joseph_action',
        r.metadata ->> 'joseph_action_required',
        r.latest_event_details ->> 'requires_joseph_action',
        r.latest_event_details ->> 'requires_user_action',
        'false'
      )) = 'true' THEN 'explicit_human_action_required'
      WHEN lower(COALESCE(r.latest_event_details ->> 'returnStatus', r.metadata ->> 'returnStatus', '')) IN ('return_unavailable','return_failed')
        THEN 'explicit_conversation_return_wait'
      WHEN COALESCE(
        NULLIF(btrim(COALESCE(r.latest_event_details ->> 'blocker', '')), ''),
        NULLIF(btrim(COALESCE(r.metadata ->> 'blocker', '')), '')
      ) IS NOT NULL THEN 'explicit_blocker_wait'
      WHEN r.status IN ('blocked','review','ready') THEN 'canonical_pm_wait_status'
      WHEN lower(COALESCE(r.metadata ->> 'external_input_status','')) IN ('requested_awaiting_ready','waiting','pending','deferred')
        THEN 'explicit_external_input_wait'
      WHEN r.status = 'in_progress' AND r.activity_at < current_timestamp - interval '6 hours'
        THEN 'no_durable_lane_activity_for_six_hours'
      ELSE 'recent_nonterminal_durable_activity'
    END AS classification_basis,
    CASE
      WHEN r.binding_event_id IS NULL THEN 'missing'
      WHEN r.binding_event_type = 'retired' THEN 'inactive'
      ELSE 'active'
    END AS conversation_binding_state,
    CASE
      WHEN lower(COALESCE(r.latest_event_details ->> 'conversationReturned', r.metadata ->> 'conversationReturned', 'false')) = 'true'
        THEN 'RETURNED'
      WHEN r.binding_event_id IS NULL OR r.binding_event_type = 'retired'
        THEN 'RETURN_UNAVAILABLE'
      WHEN lower(COALESCE(r.latest_event_details ->> 'conversationReturnImpossible', r.metadata ->> 'conversationReturnImpossible', 'false')) = 'true'
        AND COALESCE(r.latest_event_details ->> 'returnReason', r.metadata ->> 'returnReason') IN (
          'conversation_binding_missing','conversation_binding_inactive','conversation_binding_invalid',
          'conversation_actuator_unavailable','authentication_required','browser_start_failed','actuator_configuration_invalid'
        ) THEN 'RETURN_UNAVAILABLE'
      WHEN lower(COALESCE(r.latest_event_details ->> 'conversationReturnImpossible', r.metadata ->> 'conversationReturnImpossible', 'false')) = 'true'
        THEN 'RETURN_FAILED'
      ELSE 'NOT_ATTEMPTED'
    END AS return_status,
    CASE
      WHEN lower(COALESCE(r.latest_event_details ->> 'conversationReturned', r.metadata ->> 'conversationReturned', 'false')) = 'true' THEN true
      ELSE false
    END AS conversation_returned,
    CASE
      WHEN r.binding_event_id IS NULL OR r.binding_event_type = 'retired' THEN true
      WHEN lower(COALESCE(r.latest_event_details ->> 'conversationReturnImpossible', r.metadata ->> 'conversationReturnImpossible', 'false')) = 'true' THEN true
      ELSE false
    END AS conversation_return_impossible,
    CASE
      WHEN r.binding_event_id IS NULL THEN 'conversation_binding_missing'
      WHEN r.binding_event_type = 'retired' THEN 'conversation_binding_inactive'
      ELSE COALESCE(r.latest_event_details ->> 'returnReason', r.metadata ->> 'returnReason')
    END AS return_reason,
    CASE
      WHEN r.binding_event_id IS NULL THEN 'No canonical originating ChatGPT conversation is registered for this lane.'
      WHEN r.binding_event_type = 'retired' THEN 'The latest canonical originating-conversation binding has been retired.'
      ELSE COALESCE(r.latest_event_details ->> 'returnWhy', r.metadata ->> 'returnWhy')
    END AS return_why
  FROM resolved r
),
rows AS (
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'workKey', c.work_key,
    'title', c.title,
    'classification', c.continuity_class,
    'classificationBasis', c.classification_basis,
    'pmStatus', c.status,
    'priority', c.priority,
    'area', c.area,
    'owner', c.owner,
    'assignee', c.assignee,
    'currentSummary', c.current_summary,
    'activityAt', c.activity_at,
    'hoursSinceActivity', round((extract(epoch FROM (current_timestamp - c.activity_at)) / 3600.0)::numeric, 2),
    'latestEvent', jsonb_strip_nulls(jsonb_build_object(
      'type', c.latest_event_type,
      'outcome', c.latest_event_outcome,
      'occurredAt', c.latest_event_occurred_at,
      'nextAction', c.latest_event_details ->> 'next_action'
    )),
    'conversation', jsonb_strip_nulls(jsonb_build_object(
      'bindingState', c.conversation_binding_state,
      'bindingEventId', c.binding_event_id,
      'executionSurface', c.execution_surface,
      'externalConversationId', c.external_conversation_id,
      'registeredConversationUrl', c.registered_conversation_url,
      'bindingObservedTitle', c.binding_observed_title,
      'currentTitle', COALESCE(c.current_title, c.binding_observed_title),
      'currentTitleEventId', c.title_event_id,
      'currentTitleObservedAt', c.current_title_observed_at,
      'titleHistoryCount', c.title_history_count,
      'identityEvidenceRef', c.identity_evidence_ref
    )),
    'github', jsonb_strip_nulls(jsonb_build_object(
      'issue', COALESCE(c.metadata ->> 'github_issue', c.metadata ->> 'issue'),
      'pullRequest', COALESCE(c.metadata ->> 'github_pr', c.metadata ->> 'active_pr', c.metadata ->> 'pull_number', c.metadata ->> 'pull_request'),
      'branch', COALESCE(c.metadata ->> 'github_branch', c.metadata ->> 'active_branch', c.metadata ->> 'branch'),
      'headSha', COALESCE(c.metadata ->> 'active_head_sha', c.metadata ->> 'head_sha', c.metadata ->> 'engineering_head_sha'),
      'mergeCommit', COALESCE(c.metadata ->> 'merge_commit_sha', c.metadata ->> 'merge_commit', c.metadata ->> 'merge_sha')
    )),
    'recovery', jsonb_strip_nulls(jsonb_build_object(
      'returnStatus', c.return_status,
      'conversationReturned', c.conversation_returned,
      'conversationReturnImpossible', c.conversation_return_impossible,
      'returnReason', c.return_reason,
      'returnWhy', c.return_why,
      'ownershipReleased', CASE
        WHEN COALESCE(c.recovery_metadata ->> 'selected_lane', c.recovery_details ->> 'selected_lane') = c.work_key
          THEN lower(COALESCE(c.recovery_metadata ->> 'recoveryOwnershipReleased', c.recovery_details ->> 'recoveryOwnershipReleased', 'true')) = 'true'
        ELSE true
      END,
      'controllerMayContinueImplementation', CASE
        WHEN COALESCE(c.recovery_metadata ->> 'selected_lane', c.recovery_details ->> 'selected_lane') = c.work_key
          THEN lower(COALESCE(c.recovery_metadata ->> 'controllerMayContinueImplementation', c.recovery_details ->> 'controllerMayContinueImplementation', 'false')) = 'true'
        ELSE false
      END,
      'controllerObservedAt', c.recovery_observed_at
    )),
    'wait', jsonb_strip_nulls(jsonb_build_object(
      'externalInputStatus', c.metadata ->> 'external_input_status',
      'requiresJosephAction', lower(COALESCE(c.metadata ->> 'requires_joseph_action', c.metadata ->> 'joseph_action_required', c.latest_event_details ->> 'requires_joseph_action', c.latest_event_details ->> 'requires_user_action', 'false')) = 'true',
      'blocker', COALESCE(c.latest_event_details ->> 'blocker', c.metadata ->> 'blocker'),
      'terminalReason', COALESCE(c.latest_event_details ->> 'terminal_reason', c.metadata ->> 'terminal_reason')
    )),
    'semanticVerification', jsonb_strip_nulls(jsonb_build_object(
      'latestOutcome', c.latest_event_outcome,
      'exactHeadChecks', c.metadata ->> 'exact_head_checks',
      'ciSuccess', c.metadata ->> 'ci_success',
      'ciFailure', c.metadata ->> 'ci_failure',
      'mergeable', c.metadata ->> 'mergeable',
      'freshness', COALESCE(c.metadata ->> 'freshness_state', c.metadata ->> 'freshness')
    )),
    'nextAction', COALESCE(c.latest_event_details ->> 'next_action', c.metadata ->> 'next_action')
  )) AS payload,
  c.continuity_class,
  c.priority,
  c.activity_at,
  c.work_key
  FROM classified c
),
summary AS (
  SELECT jsonb_build_object(
    'total', count(*),
    'active', count(*) FILTER (WHERE continuity_class = 'ACTIVE'),
    'waiting', count(*) FILTER (WHERE continuity_class = 'WAITING'),
    'dormant', count(*) FILTER (WHERE continuity_class = 'DORMANT'),
    'superseded', count(*) FILTER (WHERE continuity_class = 'SUPERSEDED'),
    'recoveryOwned', count(*) FILTER (WHERE continuity_class = 'RECOVERY_OWNED'),
    'humanBlocked', count(*) FILTER (WHERE continuity_class = 'HUMAN_BLOCKED'),
    'complete', count(*) FILTER (WHERE continuity_class = 'COMPLETE')
  ) AS payload
  FROM rows
),
aggregated AS (
  SELECT COALESCE(jsonb_agg(payload ORDER BY
    CASE continuity_class
      WHEN 'RECOVERY_OWNED' THEN 0
      WHEN 'HUMAN_BLOCKED' THEN 1
      WHEN 'ACTIVE' THEN 2
      WHEN 'WAITING' THEN 3
      WHEN 'DORMANT' THEN 4
      WHEN 'SUPERSEDED' THEN 5
      ELSE 6
    END,
    CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    activity_at DESC NULLS LAST,
    work_key
  ), '[]'::jsonb) AS payload
  FROM rows
)
SELECT jsonb_build_object(
  'schemaVersion', 2,
  'generatedAt', current_timestamp,
  'dormantAfterHours', 6,
  'identityRule', 'Exact ChatGPT conversation UUID and canonical URL are authoritative. Conversation titles are mutable metadata only.',
  'classificationPrecedence', jsonb_build_array('SUPERSEDED','COMPLETE','RECOVERY_OWNED','HUMAN_BLOCKED','WAITING','DORMANT','ACTIVE'),
  'summary', (SELECT payload FROM summary),
  'lanes', (SELECT payload FROM aggregated)
);
$$;

COMMENT ON FUNCTION comind_pm.lane_continuity_census() IS
  'Private founder/controller continuity census for canonical CoMind development lanes. Version 2 makes explicit conversation-return failures/unavailability and explicit blockers WAITING states before dormancy/recency classification.';

COMMIT;
