BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_operator_console_read_capability (
  capability_name text PRIMARY KEY,
  capability_sha256 char(64) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz,
  CONSTRAINT cm_operator_console_read_capability_sha256_ck
    CHECK (capability_sha256 ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE comind.cm_operator_console_read_capability IS
  'Server-only hashed capabilities for narrowly scoped Operator Console read RPCs. Plaintext capabilities are never stored here.';

REVOKE ALL ON TABLE comind.cm_operator_console_read_capability FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW comind_pm.v_operator_console_activity
WITH (security_invoker = true)
AS
WITH latest_event AS (
  SELECT DISTINCT ON (e.work_item_id)
    e.work_item_id,
    e.id AS event_id,
    e.event_type,
    e.source_system,
    e.source_ref,
    e.summary,
    e.outcome,
    e.occurred_at,
    e.created_at
  FROM comind_pm.pm_events e
  WHERE e.work_item_id IS NOT NULL
  ORDER BY e.work_item_id, e.occurred_at DESC NULLS LAST, e.created_at DESC, e.id DESC
)
SELECT
  wi.id::text AS activity_id,
  wi.work_key AS activity_key,
  COALESCE(NULLIF(le.source_system, ''), NULLIF(wi.canonical_source, ''), NULLIF(p.source_system, ''), 'comind_pm') AS source_system,
  COALESCE(NULLIF(le.source_ref, ''), NULLIF(p.source_ref, ''), 'pm-work-item:' || wi.id::text) AS source_ref,
  wi.title,
  COALESCE(NULLIF(wi.assignee, ''), NULLIF(wi.owner, ''), NULLIF(p.owner, '')) AS owner_label,
  wi.created_at AS started_at,
  NULL::timestamptz AS expected_deadline_at,
  0::integer AS stale_after_seconds,
  le.event_id::text AS latest_observation_id,
  le.event_type AS latest_event_type,
  wi.status AS last_reported_status,
  COALESCE(NULLIF(le.source_ref, ''), CASE WHEN le.event_id IS NOT NULL THEN 'pm-event:' || le.event_id::text END) AS last_source_event_ref,
  COALESCE(le.occurred_at, le.created_at) AS last_source_occurred_at,
  COALESCE(le.occurred_at, wi.last_event_at, wi.updated_at, le.created_at) AS last_observed_at,
  COALESCE(NULLIF(le.summary, ''), NULLIF(wi.current_summary, ''), NULLIF(wi.description, ''), wi.title) AS last_observation_summary,
  jsonb_strip_nulls(jsonb_build_object(
    'project_key', p.project_key,
    'work_key', wi.work_key,
    'work_item_status', wi.status,
    'work_item_area', wi.area,
    'due_date', wi.due_date,
    'event_id', le.event_id,
    'event_type', le.event_type,
    'event_outcome', le.outcome,
    'source_system', le.source_system,
    'source_ref', le.source_ref
  )) AS last_evidence,
  CASE lower(COALESCE(wi.status, ''))
    WHEN 'done' THEN 'completed'
    WHEN 'completed' THEN 'completed'
    WHEN 'failed' THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'cancellation_requested' THEN 'cancellation_requested'
    WHEN 'in_progress' THEN 'running'
    WHEN 'review' THEN 'awaiting_review'
    WHEN 'blocked' THEN 'blocked'
    WHEN 'ready' THEN 'queued'
    WHEN 'backlog' THEN 'queued'
    ELSE 'unknown'
  END AS hud_state,
  CASE lower(COALESCE(wi.status, ''))
    WHEN 'done' THEN 'completed'
    WHEN 'completed' THEN 'completed'
    WHEN 'failed' THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE NULL
  END AS evidence_based_resolution,
  lower(COALESCE(wi.status, '')) IN ('done', 'completed', 'failed', 'cancelled') AS has_terminal_source_evidence,
  false AS is_synthetic,
  'Canonical PM work-item state with latest linked PM event only. This projection does not infer source SLA/staleness, complete history, a lossless feed, or snapshot consistency.'::text AS coverage_limit
FROM comind_pm.pm_work_items wi
JOIN comind_pm.pm_projects p ON p.id = wi.project_id
LEFT JOIN latest_event le ON le.work_item_id = wi.id;

COMMENT ON VIEW comind_pm.v_operator_console_activity IS
  'Bounded safe Activity HUD projection over canonical PM work items and each item''s latest linked PM event. No raw event details/evidence JSON is exposed.';

REVOKE ALL ON TABLE comind_pm.v_operator_console_activity FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.operator_console_activity_feed(
  p_capability text,
  p_scope text DEFAULT 'operational',
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  activity_id text,
  activity_key text,
  source_system text,
  source_ref text,
  title text,
  owner_label text,
  started_at timestamptz,
  expected_deadline_at timestamptz,
  stale_after_seconds integer,
  latest_observation_id text,
  latest_event_type text,
  last_reported_status text,
  last_source_event_ref text,
  last_source_occurred_at timestamptz,
  last_observed_at timestamptz,
  last_observation_summary text,
  last_evidence jsonb,
  hud_state text,
  evidence_based_resolution text,
  has_terminal_source_evidence boolean,
  is_synthetic boolean,
  coverage_limit text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_scope text := lower(COALESCE(NULLIF(btrim(p_scope), ''), 'operational'));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
  v_returned integer := 0;
BEGIN
  IF p_capability IS NULL OR length(p_capability) < 32 THEN
    RAISE EXCEPTION 'Operator Console activity capability denied' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM comind.cm_operator_console_read_capability c
    WHERE c.capability_name = 'activity_hud_v1'
      AND c.enabled
      AND (c.expires_at IS NULL OR c.expires_at > now())
      AND c.capability_sha256 = encode(extensions.digest(p_capability, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'Operator Console activity capability denied' USING ERRCODE = '42501';
  END IF;

  IF v_scope NOT IN ('operational', 'synthetic', 'all') THEN
    RAISE EXCEPTION 'Unsupported Activity HUD scope' USING ERRCODE = '22023';
  END IF;

  IF v_scope IN ('operational', 'all') THEN
    RETURN QUERY
    SELECT
      v.activity_id,
      v.activity_key,
      v.source_system,
      v.source_ref,
      v.title,
      v.owner_label,
      v.started_at,
      v.expected_deadline_at,
      v.stale_after_seconds,
      v.latest_observation_id,
      v.latest_event_type,
      v.last_reported_status,
      v.last_source_event_ref,
      v.last_source_occurred_at,
      v.last_observed_at,
      v.last_observation_summary,
      v.last_evidence,
      v.hud_state,
      v.evidence_based_resolution,
      v.has_terminal_source_evidence,
      v.is_synthetic,
      v.coverage_limit
    FROM comind_pm.v_operator_console_activity v
    ORDER BY v.last_observed_at DESC NULLS LAST, v.started_at DESC, v.activity_key
    LIMIT v_limit;

    GET DIAGNOSTICS v_returned = ROW_COUNT;
  END IF;

  IF v_scope IN ('synthetic', 'all') AND v_returned < v_limit THEN
    RETURN QUERY
    SELECT
      s.activity_id::text,
      s.activity_key,
      s.source_system,
      s.source_ref,
      s.title,
      s.owner_label,
      s.started_at,
      s.expected_deadline_at,
      s.stale_after_seconds::integer,
      s.latest_observation_id::text,
      s.latest_event_type,
      s.last_reported_status,
      s.last_source_event_ref,
      s.last_source_occurred_at,
      s.last_observed_at,
      s.last_observation_summary,
      s.last_evidence,
      s.hud_state,
      s.evidence_based_resolution,
      s.has_terminal_source_evidence,
      s.is_synthetic,
      s.coverage_limit
    FROM public.v_activity_hud_test s
    ORDER BY s.last_observed_at DESC NULLS LAST, s.started_at DESC, s.activity_key
    LIMIT (v_limit - v_returned);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.operator_console_activity_feed(text, text, integer) IS
  'Capability-gated, read-only, bounded Activity HUD feed for the authenticated Operator Console. Operational data remains inaccessible through ordinary browser table grants.';

REVOKE ALL ON FUNCTION public.operator_console_activity_feed(text, text, integer) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.operator_console_activity_feed(text, text, integer) TO anon;

COMMIT;
