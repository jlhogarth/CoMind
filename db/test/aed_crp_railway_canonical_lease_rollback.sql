-- Isolated Railway AED-CRP Test only. Preserve CRP outbox and JSONL evidence.
-- Refuse rollback if this minimal Test fixture has been reused by other work.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM comind.cm_task WHERE title NOT LIKE 'CBE return:%') THEN
    RAISE EXCEPTION 'Rollback refused: non-CBE task exists';
  END IF;
  IF EXISTS (SELECT 1 FROM comind.cm_foundry_work_lease l
             JOIN comind.cm_task t USING(task_id)
             WHERE t.title NOT LIKE 'CBE return:%') THEN
    RAISE EXCEPTION 'Rollback refused: non-CBE lease exists';
  END IF;
END $$;
DROP FUNCTION IF EXISTS comind.cm_cbe_claim_return_work(uuid,text,integer);
DROP FUNCTION IF EXISTS comind.cm_foundry_claim_work(text,integer);
DROP FUNCTION IF EXISTS comind.cm_foundry_renew_work(uuid,text,uuid,bigint,integer);
DROP FUNCTION IF EXISTS comind.cm_foundry_finish_work(uuid,text,uuid,bigint,boolean);
DROP TABLE IF EXISTS comind.cm_foundry_work_lease_event;
DROP TABLE IF EXISTS comind.cm_foundry_work_lease;
DROP TABLE IF EXISTS comind.cm_task;
DROP FUNCTION IF EXISTS comind.cm_reject_foundry_substrate_mutation();
COMMIT;
