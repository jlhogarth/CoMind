BEGIN;

CREATE TABLE IF NOT EXISTS comind.cm_agent_operations_operator (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comind.cm_agent_idea (
  idea_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES auth.users(id),
  submission_key uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 4000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  queued_for_review_at timestamptz,
  UNIQUE (submitted_by, submission_key)
);

CREATE TABLE IF NOT EXISTS comind.cm_agent_idea_disposition (
  idea_id uuid PRIMARY KEY REFERENCES comind.cm_agent_idea(idea_id),
  decided_by uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK (decision IN ('planning_candidate', 'declined')),
  basis text NOT NULL CHECK (char_length(basis) BETWEEN 3 AND 1000),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comind.cm_agent_aed_observation (
  task_id uuid NOT NULL REFERENCES comind.cm_task(task_id),
  fencing_epoch bigint NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('needs_review', 'completion_confirmed')),
  execution_outcome_id uuid REFERENCES comind.cm_foundry_execution_outcome(execution_outcome_id),
  result_evidence_id uuid REFERENCES comind.cm_evidence(evidence_id),
  observed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, fencing_epoch, disposition)
);

CREATE TABLE IF NOT EXISTS comind.cm_agent_worker_heartbeat (
  worker_name text PRIMARY KEY CHECK (worker_name = 'agcol-test-operations'),
  completed_at timestamptz NOT NULL,
  observations integer NOT NULL,
  ideas_prepared integer NOT NULL
);

ALTER TABLE comind.cm_agent_operations_operator ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_agent_idea ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_agent_idea_disposition ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_agent_aed_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_agent_worker_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comind.cm_agent_operations_operator, comind.cm_agent_idea,
  comind.cm_agent_idea_disposition, comind.cm_agent_aed_observation,
  comind.cm_agent_worker_heartbeat FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION comind.cm_agent_operations_assert_operator()
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM comind.cm_agent_operations_operator WHERE user_id = v_user
  ) THEN
    RAISE EXCEPTION 'Agent operations operator required' USING ERRCODE = '42501';
  END IF;
  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_agent_operations_tick()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE v_observations integer; v_ideas integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('comind.agcol.test.operations'), 0) THEN
    RETURN;
  END IF;
  -- AGCOL fixture tasks are one-attempt tasks. Only a verified success can repair a lease.
  WITH candidates AS (
    SELECT l.task_id, l.fencing_epoch, l.updated_at, e.metadata->>'run_key' AS run_key,
      item.data->>'key' AS specialist_key, item.data->>'targetRef' AS target_ref,
      item.data->>'profileId' AS profile_id, t.project_id
    FROM comind.cm_foundry_work_lease l
    JOIN comind.cm_task t ON t.task_id=l.task_id
    JOIN comind.cm_evidence e ON e.source_type='agcol_manifest_test'
      AND e.metadata->>'schema_version'='comind.agcol-002.run-manifest.v1'
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(e.metadata->'manifest')='array' THEN e.metadata->'manifest' ELSE '[]'::jsonb END
    ) item(data)
    WHERE item.data->>'taskId'=l.task_id::text AND item.data->>'projectId'=t.project_id::text
      AND item.data->>'capabilityCode'='agcol.test.evidence.read'
      AND l.max_attempts=1 AND l.attempt_count=1 AND l.fencing_epoch=1
      AND ((l.state='leased' AND l.lease_expires_at <= now()) OR l.state IN ('exhausted','completed'))
      AND NOT EXISTS (SELECT 1 FROM comind.cm_agent_aed_observation a
        WHERE a.task_id=l.task_id AND a.fencing_epoch=l.fencing_epoch
        AND a.disposition='completion_confirmed')
      AND NOT (l.state='completed' AND NOT EXISTS (SELECT 1 FROM comind.cm_agent_aed_observation a
        WHERE a.task_id=l.task_id AND a.fencing_epoch=l.fencing_epoch AND a.disposition='needs_review'))
  ), reconciled AS (
    SELECT DISTINCT c.task_id, c.fencing_epoch, c.updated_at, o.execution_outcome_id, proof.evidence_id
    FROM candidates c
    LEFT JOIN comind.cm_foundry_execution_context x ON x.task_id=c.task_id AND x.environment='isolated'
      AND x.idempotency_key=c.run_key || ':' || c.specialist_key
      AND x.project_id=c.project_id AND x.profile_id::text=c.profile_id
    LEFT JOIN comind.cm_foundry_execution_outcome o ON o.execution_context_id=x.execution_context_id
      AND o.terminal_status='succeeded'
    LEFT JOIN comind.cm_foundry_adapter_operation_result ar ON ar.adapter_operation_result_id=o.adapter_operation_result_id
      AND ar.terminal_status='succeeded'
    LEFT JOIN comind.cm_evidence proof ON proof.evidence_id::text=ar.result_ref AND proof.source_type='agcol_mcp_test'
      AND proof.metadata->>'schema_version'='comind.agcol-002.mcp-receipt.v1'
      AND proof.metadata->'receipt'->>'executionContextId'=x.execution_context_id::text
      AND proof.metadata->'receipt'->>'resource'=c.target_ref
      AND proof.metadata->'receipt'->>'adapterOperationId'=ar.adapter_operation_id::text
  )
  INSERT INTO comind.cm_agent_aed_observation(task_id, fencing_epoch, disposition, execution_outcome_id, result_evidence_id)
  SELECT task_id, fencing_epoch,
    CASE WHEN evidence_id IS NULL THEN 'needs_review' ELSE 'completion_confirmed' END,
    CASE WHEN evidence_id IS NOT NULL THEN execution_outcome_id END, evidence_id
  FROM reconciled r
  WHERE r.evidence_id IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM comind.cm_agent_aed_observation a
    WHERE a.task_id=r.task_id AND a.fencing_epoch=r.fencing_epoch AND a.disposition='needs_review')
  ORDER BY r.updated_at, r.task_id LIMIT 100
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_observations = ROW_COUNT;

  WITH repairable AS (
    SELECT l.task_id, l.fencing_epoch
    FROM comind.cm_foundry_work_lease l
    JOIN comind.cm_task t USING (task_id)
    JOIN comind.cm_agent_aed_observation a USING (task_id,fencing_epoch)
    WHERE a.disposition='completion_confirmed' AND l.max_attempts=1 AND l.attempt_count=1
      AND ((l.state='leased' AND l.lease_expires_at <= now()) OR l.state='exhausted')
      AND t.status IN ('todo','in_progress','done')
    ORDER BY l.updated_at,l.task_id LIMIT 100 FOR UPDATE OF l,t SKIP LOCKED
  ), repaired AS (
    UPDATE comind.cm_foundry_work_lease l SET state='completed', worker_instance_id=NULL,
      lease_token=NULL, lease_expires_at=NULL, updated_at=clock_timestamp()
    FROM repairable r WHERE l.task_id=r.task_id AND l.fencing_epoch=r.fencing_epoch
    RETURNING l.task_id,l.fencing_epoch
  ), completed_tasks AS (
    UPDATE comind.cm_task t SET status='done', updated_at=clock_timestamp()
    FROM repaired r WHERE t.task_id=r.task_id AND t.status IN ('todo','in_progress')
  )
  INSERT INTO comind.cm_foundry_work_lease_event(task_id,event_type,fencing_epoch,worker_instance_id)
  SELECT task_id,'completed',fencing_epoch,'agcol-test-operations' FROM repaired;

  WITH queue AS (
    SELECT idea_id FROM comind.cm_agent_idea WHERE queued_for_review_at IS NULL
    ORDER BY submitted_at, idea_id LIMIT 50 FOR UPDATE SKIP LOCKED
  )
  UPDATE comind.cm_agent_idea i SET queued_for_review_at=now()
  FROM queue WHERE i.idea_id=queue.idea_id;
  GET DIAGNOSTICS v_ideas = ROW_COUNT;

  INSERT INTO comind.cm_agent_worker_heartbeat(worker_name, completed_at, observations, ideas_prepared)
  VALUES ('agcol-test-operations', clock_timestamp(), v_observations, v_ideas)
  ON CONFLICT (worker_name) DO UPDATE SET completed_at=excluded.completed_at,
    observations=excluded.observations, ideas_prepared=excluded.ideas_prepared;
END;
$$;

CREATE OR REPLACE FUNCTION public.operator_agent_operations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = pg_catalog AS $$
BEGIN
  PERFORM comind.cm_agent_operations_assert_operator();
  RETURN jsonb_build_object(
    'worker', (SELECT to_jsonb(w) || jsonb_build_object(
      'state', CASE WHEN w.completed_at > now() - interval '3 minutes' THEN 'healthy' ELSE 'stale' END
    ) FROM comind.cm_agent_worker_heartbeat w WHERE worker_name='agcol-test-operations'),
    'aed', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.observed_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM comind.cm_agent_aed_observation ORDER BY observed_at DESC, task_id LIMIT 50) a),
    'approvals', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) FROM (
      SELECT p.proposal_id, left(p.purpose, 240) AS purpose, p.model_or_service, p.proposal_status, p.created_at,
        p.authorization_decision_id, l.expires_at AS link_expires_at,
        coalesce(l.consumed_at IS NULL AND l.expires_at > now() AND p.proposal_status='pending_approval'
          AND req.status='pending' AND (req.expires_at IS NULL OR req.expires_at>now()), false) AS awaiting_decision
      FROM comind.cm_paid_api_access_proposal p
      LEFT JOIN LATERAL (
        SELECT authorization_request_id, consumed_at, expires_at FROM comind.cm_api_approval_link
        WHERE proposal_id=p.proposal_id
        ORDER BY (consumed_at IS NULL AND expires_at > now()) DESC, created_at DESC LIMIT 1
      ) l ON true
      LEFT JOIN comind.cm_foundry_authorization_request req ON req.authorization_request_id=l.authorization_request_id
      ORDER BY (p.proposal_status='pending_approval') DESC, p.created_at DESC, p.proposal_id LIMIT 50
    ) a),
    'ideas', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.submitted_at DESC), '[]'::jsonb) FROM (
      SELECT s.idea_id, s.title, s.description, s.submitted_at, s.queued_for_review_at,
        d.decision, d.basis, d.decided_at
      FROM comind.cm_agent_idea s LEFT JOIN comind.cm_agent_idea_disposition d USING (idea_id)
      ORDER BY (d.idea_id IS NULL) DESC, s.submitted_at DESC, s.idea_id LIMIT 50
    ) i)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.operator_submit_agent_idea(p_submission_key uuid, p_title text, p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user uuid := comind.cm_agent_operations_assert_operator(); v_existing comind.cm_agent_idea%ROWTYPE;
BEGIN
  IF p_submission_key IS NULL OR p_title IS NULL OR p_description IS NULL
    OR char_length(btrim(p_title)) NOT BETWEEN 3 AND 120
    OR char_length(btrim(p_description)) NOT BETWEEN 10 AND 4000 THEN
    RAISE EXCEPTION 'Invalid idea submission' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('comind.agent.idea'), hashtext(v_user::text));
  SELECT * INTO v_existing FROM comind.cm_agent_idea WHERE submitted_by=v_user AND submission_key=p_submission_key;
  IF FOUND THEN
    IF v_existing.title <> btrim(p_title) OR v_existing.description <> btrim(p_description) THEN
      RAISE EXCEPTION 'Submission key already used with different content' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.idea_id;
  END IF;
  IF (SELECT count(*) FROM comind.cm_agent_idea i WHERE submitted_by=v_user AND NOT EXISTS
    (SELECT 1 FROM comind.cm_agent_idea_disposition d WHERE d.idea_id=i.idea_id)) >= 50 THEN
    RAISE EXCEPTION 'Idea review queue is full' USING ERRCODE = '22023';
  END IF;
  INSERT INTO comind.cm_agent_idea(submitted_by, submission_key, title, description)
  VALUES (v_user, p_submission_key, btrim(p_title), btrim(p_description)) RETURNING idea_id INTO v_existing.idea_id;
  RETURN v_existing.idea_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.operator_dispose_agent_idea(p_idea_id uuid, p_decision text, p_basis text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user uuid := comind.cm_agent_operations_assert_operator();
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('planning_candidate','declined') OR p_basis IS NULL
    OR char_length(btrim(p_basis)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Invalid idea disposition' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM comind.cm_agent_idea WHERE idea_id=p_idea_id AND queued_for_review_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Idea is not ready for review' USING ERRCODE = '22023'; END IF;
  INSERT INTO comind.cm_agent_idea_disposition(idea_id, decided_by, decision, basis)
  VALUES (p_idea_id, v_user, p_decision, btrim(p_basis)) ON CONFLICT DO NOTHING;
  IF NOT FOUND AND NOT EXISTS (
    SELECT 1 FROM comind.cm_agent_idea_disposition
    WHERE idea_id=p_idea_id AND decided_by=v_user AND decision=p_decision AND basis=btrim(p_basis)
  ) THEN
    RAISE EXCEPTION 'Idea already has a different disposition' USING ERRCODE = '23505';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_agent_operations_tick(), comind.cm_agent_operations_assert_operator()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.operator_agent_operations(), public.operator_submit_agent_idea(uuid,text,text),
  public.operator_dispose_agent_idea(uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.operator_agent_operations(), public.operator_submit_agent_idea(uuid,text,text),
  public.operator_dispose_agent_idea(uuid,text,text) TO authenticated;
COMMIT;
