-- AGCOL-003: bounded, Test-only accountability projection. No worker is activated.
BEGIN;

CREATE OR REPLACE FUNCTION public.operator_console_agcol_work(p_capability text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE v_payload jsonb;
BEGIN
  IF p_capability IS NULL OR length(p_capability) < 32 OR NOT EXISTS (
    SELECT 1 FROM comind.cm_operator_console_read_capability c
    WHERE c.capability_name = 'l4a_management_v1' AND c.enabled
      AND (c.expires_at IS NULL OR c.expires_at > now())
      AND c.capability_sha256 = encode(extensions.digest(p_capability, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'Operator Console agent work capability denied' USING ERRCODE = '42501';
  END IF;

  WITH manifests AS (
    SELECT e.evidence_id, e.created_at, e.metadata ->> 'run_key' AS run_key,
           e.metadata -> 'manifest' AS tasks
    FROM comind.cm_evidence e
    WHERE e.source_type = 'agcol_manifest_test'
      AND e.metadata ->> 'schema_version' = 'comind.agcol-002.run-manifest.v1'
      AND jsonb_typeof(e.metadata -> 'manifest') = 'array'
    ORDER BY e.created_at DESC, e.evidence_id DESC LIMIT 20
  ), work AS (
    SELECT m.run_key, m.evidence_id AS manifest_id, m.created_at AS manifest_at,
           t.item ->> 'key' AS specialist_key, t.item ->> 'profileId' AS profile_id,
           t.item ->> 'taskId' AS task_id, t.item ->> 'capabilityCode' AS capability_code,
           p.evidence_id AS progress_id, p.created_at AS observed_at,
           p.metadata -> 'event' ->> 'phase' AS phase,
           p.metadata -> 'event' ->> 'code' AS blocker_code,
           p.metadata -> 'event' -> 'receipt' ->> 'evidenceRef' AS result_ref,
           l.state AS lease_state, l.lease_expires_at, l.updated_at AS lease_updated_at,
           l.fencing_epoch
    FROM manifests m
    CROSS JOIN LATERAL jsonb_array_elements(m.tasks) AS t(item)
    LEFT JOIN LATERAL (
      SELECT e.evidence_id, e.created_at, e.metadata
      FROM comind.cm_evidence e
      WHERE e.source_type = 'agcol_progress_test'
        AND e.metadata ->> 'schema_version' = 'comind.agcol-002.progress.v1'
        AND e.metadata -> 'event' ->> 'runKey' = m.run_key
        AND e.metadata -> 'event' ->> 'key' = t.item ->> 'key'
        AND e.metadata -> 'event' ->> 'taskId' = t.item ->> 'taskId'
      ORDER BY e.created_at DESC, e.evidence_id DESC LIMIT 1
    ) p ON true
    LEFT JOIN comind.cm_foundry_work_lease l
      ON l.task_id::text = t.item ->> 'taskId'
  )
  SELECT jsonb_build_object(
    'schema_version', 'comind.agcol-003.operator-work.v1',
    'generated_at', now(), 'coverage_limit', 'Latest 20 Test run manifests, up to 32 tasks each',
    'activation_mode', 'bounded_test_invocation', 'always_running', false,
    'work', COALESCE(jsonb_agg(jsonb_build_object(
      'run_key', w.run_key, 'manifest_id', w.manifest_id,
      'manifest_at', w.manifest_at, 'specialist_key', w.specialist_key,
      'profile_id', w.profile_id, 'task_id', w.task_id,
      'capability_code', w.capability_code, 'progress_id', w.progress_id,
      'observed_at', w.observed_at, 'phase', w.phase,
      'blocker_code', w.blocker_code, 'result_ref', w.result_ref,
      'lease_state', w.lease_state, 'lease_expires_at', w.lease_expires_at,
      'lease_updated_at', w.lease_updated_at, 'fencing_epoch', w.fencing_epoch,
      'attention', CASE
        WHEN w.phase = 'blocked' THEN 'reconcile'
        WHEN w.phase = 'completed' AND w.lease_state = 'completed' THEN 'complete'
        WHEN w.lease_state = 'leased' AND w.lease_expires_at <= now() THEN 'stale_claim'
        WHEN w.lease_state = 'leased' THEN 'in_progress'
        WHEN w.lease_state = 'exhausted' THEN 'reconcile'
        ELSE 'unknown'
      END
    ) ORDER BY w.manifest_at DESC, w.run_key, w.specialist_key), '[]'::jsonb)
  ) INTO v_payload FROM work w;
  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.operator_console_agcol_work(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.operator_console_agcol_work(text) TO anon;
COMMENT ON FUNCTION public.operator_console_agcol_work(text) IS
  'Capability-gated read-only AGCOL Test projection; excludes claim tokens and raw agent inputs.';
COMMIT;
