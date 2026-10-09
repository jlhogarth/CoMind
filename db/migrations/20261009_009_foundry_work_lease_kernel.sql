-- Issue #85: bounded PostgreSQL work dispatch and fenced leases.
-- Apply only to isolated PostgreSQL until separately authorized for production.
BEGIN;
DO $$ BEGIN
 IF to_regclass('comind.cm_task') IS NULL THEN
   RAISE EXCEPTION 'cm_task substrate required';
 END IF;
END $$;

CREATE TABLE comind.cm_foundry_work_lease (
 task_id uuid PRIMARY KEY REFERENCES comind.cm_task(task_id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready','leased','completed','exhausted')),
 not_before timestamptz NOT NULL DEFAULT now(),
 attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
 max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 100),
 fencing_epoch bigint NOT NULL DEFAULT 0 CHECK (fencing_epoch >= 0),
 worker_instance_id text,
 lease_token uuid,
 lease_expires_at timestamptz,
 first_claimed_at timestamptz,
 last_claimed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((state = 'leased') = (worker_instance_id IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
 CHECK (worker_instance_id IS NULL OR char_length(worker_instance_id) BETWEEN 1 AND 128)
);
CREATE INDEX idx_cm_foundry_work_dispatch ON comind.cm_foundry_work_lease
 (not_before, task_id) WHERE state IN ('ready','leased');
CREATE TABLE comind.cm_foundry_work_lease_event (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id uuid NOT NULL REFERENCES comind.cm_foundry_work_lease(task_id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK (event_type IN ('claimed','reclaimed','released','completed','exhausted')),
 fencing_epoch bigint NOT NULL,
 worker_instance_id text,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cm_foundry_work_lease_event_task ON comind.cm_foundry_work_lease_event(task_id, occurred_at);
CREATE TRIGGER trg_cm_foundry_work_lease_event_immutable
 BEFORE UPDATE OR DELETE ON comind.cm_foundry_work_lease_event
 FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_foundry_substrate_mutation();

CREATE FUNCTION comind.cm_foundry_claim_work(p_worker text, p_lease_seconds integer DEFAULT 60)
RETURNS TABLE(task_id uuid, lease_token uuid, fencing_epoch bigint, lease_expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_task uuid; v_prior text; v_epoch bigint; v_token uuid; v_expiry timestamptz;
BEGIN
 IF p_worker IS NULL OR char_length(p_worker) NOT BETWEEN 1 AND 128 OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
   RAISE EXCEPTION 'invalid claim parameters';
 END IF;
 SELECT l.task_id, l.state INTO v_task, v_prior
 FROM comind.cm_foundry_work_lease l
 JOIN comind.cm_task t ON t.task_id=l.task_id
 WHERE (l.state='ready' OR (l.state='leased' AND l.lease_expires_at <= clock_timestamp()))
   AND l.not_before <= clock_timestamp() AND l.attempt_count < l.max_attempts
   AND t.status NOT IN ('blocked','done')
 ORDER BY t.priority ASC, l.not_before ASC, l.task_id ASC
 FOR UPDATE OF l SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 v_token := gen_random_uuid();
 v_expiry := clock_timestamp() + make_interval(secs => p_lease_seconds);
 UPDATE comind.cm_foundry_work_lease l
 SET state='leased', worker_instance_id=p_worker, lease_token=v_token,
     lease_expires_at=v_expiry, attempt_count=l.attempt_count+1,
     fencing_epoch=l.fencing_epoch+1, first_claimed_at=COALESCE(l.first_claimed_at,clock_timestamp()),
     last_claimed_at=clock_timestamp(), updated_at=clock_timestamp()
 WHERE l.task_id=v_task RETURNING l.fencing_epoch INTO v_epoch;
 INSERT INTO comind.cm_foundry_work_lease_event(task_id,event_type,fencing_epoch,worker_instance_id)
 VALUES(v_task, CASE WHEN v_prior='leased' THEN 'reclaimed' ELSE 'claimed' END,v_epoch,p_worker);
 RETURN QUERY SELECT v_task,v_token,v_epoch,v_expiry;
END $$;

CREATE FUNCTION comind.cm_foundry_renew_work(p_task uuid,p_worker text,p_token uuid,p_epoch bigint,p_seconds integer DEFAULT 60)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_count integer;
BEGIN
 IF p_seconds NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'invalid lease duration'; END IF;
 UPDATE comind.cm_foundry_work_lease l
 SET lease_expires_at=clock_timestamp()+make_interval(secs => p_seconds),updated_at=clock_timestamp()
 WHERE l.task_id=p_task AND l.state='leased' AND l.worker_instance_id=p_worker
 AND l.lease_token=p_token AND l.fencing_epoch=p_epoch AND l.lease_expires_at>clock_timestamp();
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END $$;

CREATE FUNCTION comind.cm_foundry_finish_work(p_task uuid,p_worker text,p_token uuid,p_epoch bigint,p_complete boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_count integer; v_state text;
BEGIN
 UPDATE comind.cm_foundry_work_lease l SET
 state=CASE WHEN p_complete THEN 'completed' WHEN l.attempt_count>=l.max_attempts THEN 'exhausted' ELSE 'ready' END,
 worker_instance_id=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
 WHERE l.task_id=p_task AND l.state='leased' AND l.worker_instance_id=p_worker
 AND l.lease_token=p_token AND l.fencing_epoch=p_epoch AND l.lease_expires_at>clock_timestamp()
 RETURNING l.state INTO v_state;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count=0 THEN RETURN false; END IF;
 INSERT INTO comind.cm_foundry_work_lease_event(task_id,event_type,fencing_epoch,worker_instance_id)
 VALUES(p_task,CASE WHEN v_state='completed' THEN 'completed' WHEN v_state='exhausted' THEN 'exhausted' ELSE 'released' END,p_epoch,p_worker);
 RETURN true;
END $$;

ALTER TABLE comind.cm_foundry_work_lease ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_foundry_work_lease_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comind.cm_foundry_work_lease,comind.cm_foundry_work_lease_event FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON comind.cm_foundry_work_lease TO service_role;
GRANT SELECT,INSERT ON comind.cm_foundry_work_lease_event TO service_role;
GRANT EXECUTE ON FUNCTION comind.cm_foundry_claim_work(text,integer),comind.cm_foundry_renew_work(uuid,text,uuid,bigint,integer),comind.cm_foundry_finish_work(uuid,text,uuid,bigint,boolean) TO service_role;
COMMIT;
