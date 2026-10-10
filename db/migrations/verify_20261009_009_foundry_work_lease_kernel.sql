-- Isolated PostgreSQL verification for Issue #85.
BEGIN;
DO $$
DECLARE v_org uuid; v_actor uuid; v_project uuid; v_task uuid;
 v_first record; v_second record; v_count integer;
BEGIN
 INSERT INTO comind.cm_org(name,slug) VALUES ('Lease test '||gen_random_uuid(),'lease-test-'||replace(gen_random_uuid()::text,'-','')) RETURNING org_id INTO v_org;
 INSERT INTO comind.cm_actor(org_id,kind,handle,display_name)
 VALUES(v_org,'person','lease-test-'||gen_random_uuid(),'Lease verifier') RETURNING actor_id INTO v_actor;
 INSERT INTO comind.cm_project(org_id,title,slug,created_by)
 VALUES(v_org,'Lease verification','lease-project-'||replace(gen_random_uuid()::text,'-',''),v_actor) RETURNING project_id INTO v_project;
 INSERT INTO comind.cm_task(project_id,title,status,priority)
 VALUES(v_project,'Lease work','todo',1) RETURNING task_id INTO v_task;
 INSERT INTO comind.cm_foundry_work_lease(task_id,max_attempts) VALUES(v_task,2);
 SELECT * INTO v_first FROM comind.cm_foundry_claim_work('worker-a',30);
 IF v_first.task_id IS DISTINCT FROM v_task OR v_first.fencing_epoch<>1 THEN RAISE EXCEPTION 'initial claim failed'; END IF;
 SELECT * INTO v_second FROM comind.cm_foundry_claim_work('worker-b',30);
 IF v_second.task_id IS NOT NULL THEN RAISE EXCEPTION 'double claim'; END IF;
 IF comind.cm_foundry_renew_work(v_task,'worker-b',v_first.lease_token,1,30) THEN RAISE EXCEPTION 'foreign renewal'; END IF;
 IF NOT comind.cm_foundry_renew_work(v_task,'worker-a',v_first.lease_token,1,30) THEN RAISE EXCEPTION 'valid renewal failed'; END IF;
 UPDATE comind.cm_foundry_work_lease SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE task_id=v_task;
 IF comind.cm_foundry_finish_work(v_task,'worker-a',v_first.lease_token,1) THEN RAISE EXCEPTION 'expired owner finished'; END IF;
 SELECT * INTO v_second FROM comind.cm_foundry_claim_work('worker-b',30);
 IF v_second.task_id IS DISTINCT FROM v_task OR v_second.fencing_epoch<>2 THEN RAISE EXCEPTION 'reclaim fencing failed'; END IF;
 IF comind.cm_foundry_renew_work(v_task,'worker-a',v_first.lease_token,1,30) THEN RAISE EXCEPTION 'stale renewal accepted'; END IF;
 IF comind.cm_foundry_finish_work(v_task,'worker-a',v_first.lease_token,1) THEN RAISE EXCEPTION 'stale finish accepted'; END IF;
 IF NOT comind.cm_foundry_finish_work(v_task,'worker-b',v_second.lease_token,2,false) THEN RAISE EXCEPTION 'exhaustion failed'; END IF;
 SELECT count(*) INTO v_count FROM comind.cm_foundry_work_lease WHERE task_id=v_task AND state='exhausted';
 IF v_count<>1 THEN RAISE EXCEPTION 'exhausted state missing'; END IF;
 SELECT count(*) INTO v_count FROM comind.cm_foundry_work_lease_event WHERE task_id=v_task;
 IF v_count<>3 THEN RAISE EXCEPTION 'significant event count mismatch: %',v_count; END IF;
 RAISE NOTICE 'Issue #85 lease verification passed';
END $$;
ROLLBACK;
