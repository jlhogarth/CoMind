BEGIN;

CREATE OR REPLACE FUNCTION comind.cm_cbe_claim_return_work(
  p_task uuid,
  p_worker text,
  p_lease_seconds integer DEFAULT 90
)
RETURNS TABLE(task_id uuid, lease_token uuid, fencing_epoch bigint, lease_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, comind
AS $$
DECLARE
  v_prior text;
  v_epoch bigint;
  v_token uuid;
  v_expiry timestamptz;
BEGIN
  IF p_task IS NULL THEN
    RAISE EXCEPTION 'CBE_TASK_REQUIRED';
  END IF;
  IF p_worker IS NULL OR char_length(btrim(p_worker)) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'INVALID_CBE_WORKER';
  END IF;
  IF p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RAISE EXCEPTION 'INVALID_CBE_LEASE_DURATION';
  END IF;

  SELECT l.state
  INTO v_prior
  FROM comind.cm_foundry_work_lease l
  JOIN comind.cm_task t ON t.task_id = l.task_id
  WHERE l.task_id = p_task
    AND t.status = 'blocked'
    AND t.title LIKE 'CBE return:%'
    AND (l.state = 'ready' OR (l.state = 'leased' AND l.lease_expires_at <= clock_timestamp()))
    AND l.not_before <= clock_timestamp()
    AND l.attempt_count < l.max_attempts
  FOR UPDATE OF l;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_token := gen_random_uuid();
  v_expiry := clock_timestamp() + make_interval(secs => p_lease_seconds);

  UPDATE comind.cm_foundry_work_lease l
  SET state = 'leased',
      worker_instance_id = btrim(p_worker),
      lease_token = v_token,
      lease_expires_at = v_expiry,
      attempt_count = l.attempt_count + 1,
      fencing_epoch = l.fencing_epoch + 1,
      first_claimed_at = COALESCE(l.first_claimed_at, clock_timestamp()),
      last_claimed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE l.task_id = p_task
  RETURNING l.fencing_epoch INTO v_epoch;

  INSERT INTO comind.cm_foundry_work_lease_event(
    task_id,
    event_type,
    fencing_epoch,
    worker_instance_id
  ) VALUES (
    p_task,
    CASE WHEN v_prior = 'leased' THEN 'reclaimed' ELSE 'claimed' END,
    v_epoch,
    btrim(p_worker)
  );

  RETURN QUERY SELECT p_task, v_token, v_epoch, v_expiry;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_cbe_claim_return_work(uuid,text,integer) FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind.cm_cbe_claim_return_work(uuid,text,integer) FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION comind.cm_cbe_claim_return_work(uuid,text,integer) FROM authenticated;
  END IF;
  IF to_regrole('service_role') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION comind.cm_cbe_claim_return_work(uuid,text,integer) TO service_role;
  END IF;
END $$;

COMMENT ON FUNCTION comind.cm_cbe_claim_return_work(uuid,text,integer) IS
  'CBE-004 target-specific Foundry claim. Leases only the exact blocked CBE return task identified by the canonical RunBook event UUID; never selects from the general work queue.';

COMMIT;
