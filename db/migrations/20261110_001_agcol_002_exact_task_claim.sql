BEGIN;

-- Exact-task claim uses the existing lease and immutable event tables.
-- SECURITY INVOKER preserves the caller's existing table privileges.
CREATE OR REPLACE FUNCTION comind.cm_agcol_claim_task(
  p_task uuid, p_project uuid, p_worker text, p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE(task_id uuid, lease_token uuid, fencing_epoch bigint, lease_expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_prior text;
  v_epoch bigint;
  v_token uuid;
  v_expiry timestamptz;
BEGIN
  IF p_task IS NULL OR p_project IS NULL OR p_worker IS NULL
    OR char_length(p_worker) NOT BETWEEN 1 AND 128
    OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
    RAISE EXCEPTION 'invalid AGCOL claim parameters';
  END IF;
  SELECT l.state INTO v_prior
  FROM comind.cm_foundry_work_lease AS l
  JOIN comind.cm_task AS t ON t.task_id = l.task_id
  WHERE l.task_id = p_task AND t.project_id = p_project
    AND (l.state = 'ready' OR (l.state = 'leased' AND l.lease_expires_at <= clock_timestamp()))
    AND l.not_before <= clock_timestamp() AND l.attempt_count < l.max_attempts
    AND t.status NOT IN ('blocked', 'done')
  FOR UPDATE OF l SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  v_token := gen_random_uuid();
  v_expiry := clock_timestamp() + make_interval(secs => p_lease_seconds);
  UPDATE comind.cm_foundry_work_lease AS l
  SET state = 'leased', worker_instance_id = p_worker, lease_token = v_token,
      lease_expires_at = v_expiry, attempt_count = l.attempt_count + 1,
      fencing_epoch = l.fencing_epoch + 1,
      first_claimed_at = COALESCE(l.first_claimed_at, clock_timestamp()),
      last_claimed_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE l.task_id = p_task RETURNING l.fencing_epoch INTO v_epoch;
  INSERT INTO comind.cm_foundry_work_lease_event(task_id, event_type, fencing_epoch, worker_instance_id)
  VALUES (p_task, CASE WHEN v_prior = 'leased' THEN 'reclaimed' ELSE 'claimed' END, v_epoch, p_worker);
  RETURN QUERY SELECT p_task, v_token, v_epoch, v_expiry;
END $$;

REVOKE ALL ON FUNCTION comind.cm_agcol_claim_task(uuid,uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION comind.cm_agcol_claim_task(uuid,uuid,text,integer) TO service_role;
COMMIT;
