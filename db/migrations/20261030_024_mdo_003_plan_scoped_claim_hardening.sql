-- MDO-003: align MDO work claiming with canonical Foundry target_refs scope.
-- Issue #370. Additive hardening only. No Production activation or authority expansion.

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('comind.cm_mdo_claim_work(uuid,text,integer)') IS NULL
       OR to_regclass('comind.cm_mdo_plan') IS NULL
       OR to_regclass('comind.cm_mdo_plan_task') IS NULL
       OR to_regclass('comind.cm_foundry_capability_grant') IS NULL THEN
        RAISE EXCEPTION 'MDO-003 plan-scoped claim hardening requires accepted MDO-001 substrate';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_mdo_claim_work(
    p_profile_id uuid,
    p_worker text,
    p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE(
    task_id uuid,
    lease_token uuid,
    fencing_epoch bigint,
    lease_expires_at timestamptz,
    plan_id uuid,
    capability_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_task uuid;
    v_plan uuid;
    v_capability_code text;
    v_prior text;
    v_epoch bigint;
    v_token uuid;
    v_expiry timestamptz;
BEGIN
    IF p_profile_id IS NULL
       OR p_worker IS NULL
       OR char_length(p_worker) NOT BETWEEN 1 AND 128
       OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN
        RAISE EXCEPTION 'invalid MDO claim parameters';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM comind.cm_foundry_agent_profile p
        WHERE p.profile_id = p_profile_id
          AND p.status = 'active'
          AND substring(p.authority_ceiling from 2)::int >= 1
    ) THEN
        RAISE EXCEPTION 'MDO claimant must be one active C1-capable Foundry profile';
    END IF;

    SELECT l.task_id, l.state, mpt.plan_id, c.capability_code
    INTO v_task, v_prior, v_plan, v_capability_code
    FROM comind.cm_foundry_work_lease l
    JOIN comind.cm_task t ON t.task_id = l.task_id
    JOIN comind.cm_mdo_plan_task mpt ON mpt.task_id = l.task_id
    JOIN comind.cm_mdo_plan mp ON mp.plan_id = mpt.plan_id
    JOIN comind.cm_foundry_capability c ON c.capability_id = mpt.required_capability_id
    WHERE (l.state = 'ready' OR (l.state = 'leased' AND l.lease_expires_at <= clock_timestamp()))
      AND l.not_before <= clock_timestamp()
      AND l.attempt_count < l.max_attempts
      AND t.status NOT IN ('blocked', 'done')
      AND mp.status IN ('queued', 'in_review')
      AND (
        mpt.sequence_no <= 5
        OR (
          mpt.sequence_no BETWEEN 6 AND 8
          AND NOT EXISTS (
            SELECT 1
            FROM comind.cm_mdo_plan_task prior
            LEFT JOIN comind.cm_mdo_contribution pc ON pc.task_id = prior.task_id
            WHERE prior.plan_id = mpt.plan_id
              AND prior.sequence_no BETWEEN 1 AND 5
              AND pc.contribution_id IS NULL
          )
        )
        OR (
          mpt.sequence_no = 9
          AND NOT EXISTS (
            SELECT 1
            FROM comind.cm_mdo_plan_task prior
            LEFT JOIN comind.cm_mdo_contribution pc ON pc.task_id = prior.task_id
            WHERE prior.plan_id = mpt.plan_id
              AND prior.sequence_no BETWEEN 1 AND 8
              AND pc.contribution_id IS NULL
          )
        )
        OR (
          mpt.sequence_no = 10
          AND NOT EXISTS (
            SELECT 1
            FROM comind.cm_mdo_plan_task prior
            LEFT JOIN comind.cm_mdo_contribution pc ON pc.task_id = prior.task_id
            WHERE prior.plan_id = mpt.plan_id
              AND prior.sequence_no BETWEEN 1 AND 9
              AND pc.contribution_id IS NULL
          )
        )
      )
      AND EXISTS (
        SELECT 1
        FROM comind.cm_foundry_capability_grant g
        JOIN comind.cm_foundry_agent_profile p ON p.profile_id = g.profile_id
        WHERE g.profile_id = p_profile_id
          AND g.capability_id = mpt.required_capability_id
          AND g.org_id = p.org_id
          AND p.status = 'active'
          AND g.environment = 'isolated'
          AND substring(g.authority_ceiling from 2)::int >= 1
          AND g.revoked_at IS NULL
          AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())
          AND (g.project_id IS NULL OR g.project_id = mp.project_id)
          -- Canonical Foundry operational scope. If target_refs is present,
          -- the exact MDO plan must be named. Empty or malformed arrays fail closed.
          AND (
            NOT (g.scope ? 'target_refs')
            OR (
              jsonb_typeof(g.scope->'target_refs') = 'array'
              AND jsonb_array_length(g.scope->'target_refs') > 0
              AND (g.scope->'target_refs') ? mp.plan_id::text
            )
          )
          -- Retain the accepted MDO-001 DB-level module restriction for backward compatibility.
          AND (
            NOT (g.scope ? 'module_ids')
            OR (
              jsonb_typeof(g.scope->'module_ids') = 'array'
              AND jsonb_array_length(g.scope->'module_ids') > 0
              AND (g.scope->'module_ids') ? mp.module_id::text
            )
          )
      )
    ORDER BY t.priority, mpt.sequence_no, l.not_before, l.task_id
    FOR UPDATE OF l SKIP LOCKED
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_token := gen_random_uuid();
    v_expiry := clock_timestamp() + make_interval(secs => p_lease_seconds);

    UPDATE comind.cm_foundry_work_lease l
    SET state = 'leased',
        worker_instance_id = p_worker,
        lease_token = v_token,
        lease_expires_at = v_expiry,
        attempt_count = l.attempt_count + 1,
        fencing_epoch = l.fencing_epoch + 1,
        first_claimed_at = COALESCE(l.first_claimed_at, clock_timestamp()),
        last_claimed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE l.task_id = v_task
    RETURNING l.fencing_epoch INTO v_epoch;

    INSERT INTO comind.cm_foundry_work_lease_event(
        task_id, event_type, fencing_epoch, worker_instance_id
    ) VALUES (
        v_task,
        CASE WHEN v_prior = 'leased' THEN 'reclaimed' ELSE 'claimed' END,
        v_epoch,
        p_worker
    );

    RETURN QUERY
    SELECT v_task, v_token, v_epoch, v_expiry, v_plan, v_capability_code;
END;
$$;

REVOKE EXECUTE ON FUNCTION comind.cm_mdo_claim_work(uuid,text,integer)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_mdo_claim_work(uuid,text,integer)
TO service_role;

COMMIT;
