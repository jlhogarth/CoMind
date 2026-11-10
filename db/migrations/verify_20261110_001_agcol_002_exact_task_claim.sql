BEGIN;
DO $$
DECLARE
  v_project uuid;
  v_task uuid;
  v_claim record;
  v_count integer;
BEGIN
  IF NOT has_function_privilege('service_role',
       'comind.cm_agcol_claim_task(uuid,uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'AGCOL exact-task claim grant missing';
  END IF;
  SELECT project_id INTO STRICT v_project FROM comind.cm_project
   WHERE project_code::text = 'COMIND' AND source_system = 'github'
     AND source_ref = 'github:repo:jlhogarth/CoMind' AND status = 'active';
  INSERT INTO comind.cm_task(project_id, title, status)
  VALUES (v_project, 'AGCOL-002 migration verifier synthetic task', 'todo')
  RETURNING task_id INTO v_task;
  INSERT INTO comind.cm_foundry_work_lease(task_id, max_attempts)
  VALUES (v_task, 1);
  SELECT count(*)::integer INTO v_count
  FROM comind.cm_agcol_claim_task(v_task, gen_random_uuid(), 'agcol-verifier', 60);
  IF v_count <> 0 THEN RAISE EXCEPTION 'Wrong project acquired a lease'; END IF;
  SELECT * INTO STRICT v_claim
  FROM comind.cm_agcol_claim_task(v_task, v_project, 'agcol-verifier', 60);
  IF v_claim.task_id <> v_task OR v_claim.fencing_epoch <> 1 THEN
    RAISE EXCEPTION 'Exact task claim failed';
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM comind.cm_agcol_claim_task(v_task, v_project, 'agcol-replay', 60);
  IF v_count <> 0 THEN RAISE EXCEPTION 'Active lease was claimed twice'; END IF;
  IF comind.cm_foundry_finish_work(v_task, 'agcol-verifier', gen_random_uuid(), 1, true) THEN
    RAISE EXCEPTION 'Wrong lease token finished work';
  END IF;
  IF NOT comind.cm_foundry_finish_work(v_task, 'agcol-verifier', v_claim.lease_token, 1, true) THEN
    RAISE EXCEPTION 'Fenced lease could not finish';
  END IF;
  SELECT count(*)::integer INTO v_count FROM comind.cm_foundry_work_lease_event
  WHERE task_id = v_task AND event_type IN ('claimed', 'completed');
  IF v_count <> 2 THEN RAISE EXCEPTION 'Claim and completion event lineage missing'; END IF;
END $$;
ROLLBACK;
