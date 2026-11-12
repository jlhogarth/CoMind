-- CoMind Test integration proof. Uses existing Test AGCOL receipt lineage and rolls back all changes.
BEGIN;
DO $$
DECLARE
  v_operator uuid;
  v_completed uuid;
  v_project uuid;
  v_stalled uuid;
  v_idea uuid;
  v_key uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_before_events integer;
BEGIN
  IF has_function_privilege('anon','public.operator_agent_operations()','EXECUTE')
    OR has_function_privilege('authenticated','comind.cm_agent_operations_tick()','EXECUTE')
    OR has_table_privilege('authenticated','comind.cm_agent_idea','INSERT') THEN
    RAISE EXCEPTION 'Agent operations privileges exceed the intended boundary';
  END IF;

  SELECT u.id INTO STRICT v_operator FROM auth.users u
    WHERE u.email_confirmed_at IS NOT NULL AND u.last_sign_in_at IS NOT NULL;
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  BEGIN
    PERFORM public.operator_agent_operations();
    RAISE EXCEPTION 'Unlisted identity was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO comind.cm_agent_operations_operator(user_id) VALUES (v_operator) ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', v_operator::text, true);
  v_idea := public.operator_submit_agent_idea(v_key, 'Test operations idea', 'Synthetic rollback-only Test submission.');
  IF v_idea <> public.operator_submit_agent_idea(v_key, 'Test operations idea', 'Synthetic rollback-only Test submission.') THEN
    RAISE EXCEPTION 'Repeated submission returned a different idea';
  END IF;
  BEGIN
    PERFORM public.operator_submit_agent_idea(v_key, 'Changed idea', 'Synthetic rollback-only Test submission.');
    RAISE EXCEPTION 'Changed content accepted on retry';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.operator_dispose_agent_idea(v_idea,'planning_candidate','Synthetic Test decision.');
    RAISE EXCEPTION 'Idea disposition bypassed intake';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  SELECT l.task_id, t.project_id INTO STRICT v_completed,v_project
  FROM comind.cm_foundry_work_lease l JOIN comind.cm_task t USING(task_id)
  JOIN comind.cm_foundry_execution_context x ON x.task_id=l.task_id
  JOIN comind.cm_foundry_execution_outcome o ON o.execution_context_id=x.execution_context_id
  JOIN comind.cm_foundry_adapter_operation_result ar ON ar.adapter_operation_result_id=o.adapter_operation_result_id
  JOIN comind.cm_evidence e ON e.evidence_id::text=ar.result_ref AND e.source_type='agcol_mcp_test'
  WHERE l.state='completed' AND l.fencing_epoch=1 AND l.max_attempts=1 AND o.terminal_status='succeeded'
  ORDER BY l.task_id LIMIT 1;

  SELECT count(*) INTO v_before_events FROM comind.cm_foundry_work_lease_event
    WHERE task_id=v_completed AND event_type='completed';
  UPDATE comind.cm_foundry_work_lease SET state='leased', worker_instance_id='rollback-proof',
    lease_token=gen_random_uuid(), lease_expires_at=now()-interval '1 minute' WHERE task_id=v_completed;
  INSERT INTO comind.cm_task(project_id,title,status)
    VALUES (v_project,'AGCOL synthetic expired claim verification','todo') RETURNING task_id INTO v_stalled;
  INSERT INTO comind.cm_foundry_work_lease(task_id,state,worker_instance_id,lease_token,lease_expires_at,attempt_count,max_attempts,fencing_epoch)
    VALUES (v_stalled,'leased','rollback-proof',gen_random_uuid(),now()-interval '1 minute',1,1,1);
  INSERT INTO comind.cm_evidence(title,source_type,source_ref,checksum,metadata) VALUES (
    'AGCOL synthetic expired claim verification','agcol_manifest_test', 'agcol-operations-proof:' || v_stalled,
    encode(extensions.digest(v_stalled::text, 'sha256'), 'hex'),
    jsonb_build_object('schema_version','comind.agcol-002.run-manifest.v1','run_key','agcol-operations-proof',
      'manifest', jsonb_build_array(jsonb_build_object('key','synthetic','taskId',v_stalled,
        'projectId',v_project,'capabilityCode','agcol.test.evidence.read','targetRef',v_stalled)))
  );
  PERFORM comind.cm_agent_operations_tick();
  PERFORM comind.cm_agent_operations_tick();

  IF (SELECT count(*) FROM comind.cm_agent_aed_observation
      WHERE (task_id=v_completed AND disposition='completion_confirmed' AND result_evidence_id IS NOT NULL)
        OR (task_id=v_stalled AND disposition='needs_review' AND result_evidence_id IS NULL)) <> 2
    OR (SELECT state FROM comind.cm_foundry_work_lease WHERE task_id=v_stalled) <> 'leased'
    OR (SELECT state FROM comind.cm_foundry_work_lease WHERE task_id=v_completed) <> 'completed'
    OR (SELECT count(*) FROM comind.cm_foundry_work_lease_event
        WHERE task_id=v_completed AND event_type='completed') <> v_before_events+1 THEN
    RAISE EXCEPTION 'AED reconciliation or safe no-replay behavior failed';
  END IF;

  PERFORM public.operator_dispose_agent_idea(v_idea,'planning_candidate','Synthetic Test decision.');
  PERFORM public.operator_dispose_agent_idea(v_idea,'planning_candidate','Synthetic Test decision.');
  v_snapshot := public.operator_agent_operations();
  IF v_snapshot->'worker'->>'state' IS DISTINCT FROM 'healthy'
    OR jsonb_typeof(v_snapshot->'approvals') IS DISTINCT FROM 'array'
    OR NOT (v_snapshot->'ideas' @> jsonb_build_array(jsonb_build_object('idea_id',v_idea,'decision','planning_candidate')))
    OR v_snapshot::text ~ 'token_hash|lease_token' THEN
    RAISE EXCEPTION 'Agent operations readback contract failed';
  END IF;
END;
$$;
ROLLBACK;
