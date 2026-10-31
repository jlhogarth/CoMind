BEGIN;

CREATE OR REPLACE FUNCTION public.operator_console_l4a_management_plane()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
WITH authority AS (
  SELECT jsonb_build_object(
    'active', true,
    'authorization_type', a.authorization_type,
    'decision', a.decision,
    'scope', a.scope,
    'authorized_by', a.authorized_by,
    'effective_at', a.effective_at,
    'expires_at', a.expires_at,
    'authority_level', a.conditions ->> 'authority_level',
    'standing', COALESCE((a.conditions ->> 'standing')::boolean, false),
    'autonomous_merge', COALESCE((a.conditions ->> 'autonomous_merge')::boolean, false),
    'autonomous_recovery', COALESCE((a.conditions ->> 'autonomous_recovery')::boolean, false),
    'durable_evidence_precedence', COALESCE((a.conditions ->> 'durable_evidence_precedence')::boolean, false),
    'non_production_autonomy', COALESCE((a.conditions ->> 'non_production_autonomy')::boolean, false),
    'production_authority', false,
    'human_stop_boundaries', COALESCE(a.conditions -> 'mandatory_human_stops', '[]'::jsonb)
  ) AS payload
  FROM comind_pm.pm_authorizations a
  WHERE a.decision = 'granted'
    AND a.conditions ->> 'authority_level' = 'L4A'
    AND a.effective_at <= now()
    AND (a.expires_at IS NULL OR a.expires_at > now())
  ORDER BY a.effective_at DESC
  LIMIT 1
),
blockers AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'work_key', b.work_key,
    'title', b.title,
    'priority', b.priority,
    'area', b.area,
    'owner', b.owner,
    'assignee', b.assignee,
    'current_summary', b.current_summary,
    'last_event_at', b.last_event_at
  ) ORDER BY b.priority, b.last_event_at DESC NULLS LAST), '[]'::jsonb) AS payload
  FROM (SELECT * FROM comind_pm.v_open_blockers LIMIT 200) b
),
lane_rows AS (
  SELECT
    s.*,
    wi.metadata,
    le.details,
    le.source_system AS event_source_system,
    le.source_ref AS event_source_ref,
    le.evidence AS event_evidence,
    CASE
      WHEN lower(COALESCE(wi.metadata ->> 'freshness_reconciled', 'false')) = 'true' THEN 'reconciled'
      WHEN lower(COALESCE(le.details ->> 'main_fresh_at_merge', 'false')) = 'true' THEN 'fresh_at_merge'
      WHEN lower(COALESCE(wi.metadata ->> 'freshness', le.details ->> 'freshness', '')) IN ('stale','false') THEN 'stale'
      ELSE NULL
    END AS durable_freshness,
    COALESCE(
      wi.metadata ->> 'github_issue',
      le.details ->> 'issue'
    ) AS github_issue,
    COALESCE(
      wi.metadata ->> 'github_pr',
      wi.metadata ->> 'pull_number',
      le.details ->> 'pr',
      le.details ->> 'pull_number'
    ) AS github_pr,
    COALESCE(wi.metadata ->> 'branch', wi.metadata ->> 'github_branch', le.details ->> 'branch') AS github_branch,
    COALESCE(wi.metadata ->> 'head_sha', wi.metadata ->> 'engineering_head_sha', le.details ->> 'head_sha', le.details ->> 'exact_head') AS head_sha,
    COALESCE(wi.metadata ->> 'base_sha', wi.metadata ->> 'base_main_sha', le.details ->> 'base_sha', le.details ->> 'base_main_sha') AS base_sha,
    COALESCE(
      le.details ->> 'exact_head_checks_success',
      le.details ->> 'workflows_green',
      le.details ->> 'workflow_families_green',
      CASE WHEN wi.metadata ->> 'exact_head_checks' ~ '^[0-9]+/[0-9]+$' THEN split_part(wi.metadata ->> 'exact_head_checks','/',1) END
    ) AS checks_success,
    COALESCE(
      le.details ->> 'exact_head_checks_total',
      le.details ->> 'workflows_total',
      le.details ->> 'workflow_families_total',
      CASE WHEN wi.metadata ->> 'exact_head_checks' ~ '^[0-9]+/[0-9]+$' THEN split_part(wi.metadata ->> 'exact_head_checks','/',2) END
    ) AS checks_total,
    CASE
      WHEN lower(COALESCE(wi.metadata ->> 'mergeable', le.details ->> 'mergeable', '')) = 'true' THEN true
      WHEN lower(COALESCE(wi.metadata ->> 'mergeable', le.details ->> 'mergeable', '')) = 'false' THEN false
      ELSE NULL
    END AS mergeable,
    CASE
      WHEN lower(COALESCE(
        wi.metadata ->> 'production_change', wi.metadata ->> 'production_changed', wi.metadata ->> 'production_activation',
        le.details ->> 'production_change', le.details ->> 'production_changed', le.details ->> 'production_activation', 'false'
      )) = 'true' THEN true
      ELSE false
    END AS production_change
  FROM comind_pm.v_runbook_lane_state s
  JOIN comind_pm.pm_work_items wi ON wi.work_key = s.work_key
  LEFT JOIN LATERAL (
    SELECT e.details, e.source_system, e.source_ref, e.evidence
    FROM comind_pm.pm_events e
    WHERE e.work_item_id = wi.id
    ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
    LIMIT 1
  ) le ON true
  ORDER BY
    CASE s.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
    s.last_event_at DESC NULLS LAST,
    s.work_key
  LIMIT 200
),
lanes AS (
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'work_key', l.work_key,
    'title', l.title,
    'status', l.status,
    'priority', l.priority,
    'area', l.area,
    'owner', l.owner,
    'current_summary', l.current_summary,
    'last_event_at', l.last_event_at,
    'latest_event_type', l.latest_event_type,
    'latest_outcome', l.latest_outcome,
    'latest_result', l.latest_result,
    'next_action', l.next_action,
    'latest_actor', l.latest_actor,
    'latest_occurred_at', l.latest_occurred_at,
    'source_system', l.event_source_system,
    'source_ref', l.event_source_ref,
    'github', jsonb_strip_nulls(jsonb_build_object(
      'issue', l.github_issue,
      'pull_request', l.github_pr,
      'branch', l.github_branch,
      'head_sha', l.head_sha,
      'base_sha', l.base_sha,
      'checks_success', l.checks_success,
      'checks_total', l.checks_total,
      'freshness', l.durable_freshness,
      'mergeable', l.mergeable
    )),
    'production_change', l.production_change
  ))), '[]'::jsonb) AS payload
  FROM lane_rows l
),
controller_rows AS (
  SELECT
    wi.work_key,
    wi.title,
    wi.current_summary,
    wi.last_event_at,
    wi.metadata,
    le.event_type,
    le.outcome,
    le.details,
    le.source_ref,
    le.occurred_at
  FROM comind_pm.pm_work_items wi
  LEFT JOIN LATERAL (
    SELECT e.event_type, e.outcome, e.details, e.source_ref, e.occurred_at
    FROM comind_pm.pm_events e
    WHERE e.work_item_id = wi.id
    ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC
    LIMIT 1
  ) le ON true
  WHERE wi.item_type = 'audit'
    AND wi.work_key IN ('L4A-SUPERVISOR','L4A-RECOVERY')
),
controllers AS (
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'work_key', c.work_key,
    'title', c.title,
    'enabled', CASE WHEN lower(COALESCE(c.metadata ->> 'enabled','false')) = 'true' THEN true ELSE false END,
    'automation_id', c.metadata ->> 'automation_id',
    'cadence', c.metadata ->> 'cadence',
    'current_summary', c.current_summary,
    'last_event_at', c.last_event_at,
    'latest_event_type', c.event_type,
    'latest_outcome', c.outcome,
    'run_id', c.details ->> 'run_id',
    'recorded_status', c.details ->> 'recorded_status',
    'scheduled_for', c.details ->> 'scheduled_for',
    'started_at', c.details ->> 'started_at',
    'completed_at', c.details ->> 'completed_at',
    'selected_lane', c.details ->> 'selected_lane',
    'pull_request', c.details ->> 'pull_request',
    'requires_user_action', CASE WHEN lower(COALESCE(c.details ->> 'requires_user_action','false')) = 'true' THEN true ELSE false END,
    'source_ref', c.source_ref,
    'observed_at', c.occurred_at
  )) ORDER BY c.work_key), '[]'::jsonb) AS payload
  FROM controller_rows c
)
SELECT jsonb_build_object(
  'generated_at', clock_timestamp(),
  'coverage_limit', 'Latest durable CoMind management evidence only. GitHub, CI, freshness, mergeability, and controller fields are shown only when explicitly recorded; unknown values are not inferred. Controller heartbeats are observations and never override newer lane evidence.',
  'authority', COALESCE((SELECT payload FROM authority), jsonb_build_object('active', false, 'production_authority', false)),
  'blockers', (SELECT payload FROM blockers),
  'lanes', (SELECT payload FROM lanes),
  'controllers', (SELECT payload FROM controllers)
);
$$;

COMMENT ON FUNCTION public.operator_console_l4a_management_plane() IS
  'Service-role-only bounded L4A management-plane snapshot for the Operator Console. Returns safe current-state projections without exposing raw RunBook event payloads, credentials, private schema access, or authority beyond canonical durable records.';

REVOKE ALL ON FUNCTION public.operator_console_l4a_management_plane() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operator_console_l4a_management_plane() TO service_role;

COMMIT;
