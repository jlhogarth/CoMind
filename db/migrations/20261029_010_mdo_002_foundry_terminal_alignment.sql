-- MDO-002: align contribution acceptance with canonical Foundry terminal evidence.
-- Issue #316. Additive compatibility repair for the MDO-001 / Foundry terminal-lifecycle seam.
-- No Production activation, provider authority, maturity promotion, or client access is added.

BEGIN;

DO $$
BEGIN
    IF to_regprocedure('comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])') IS NULL
       OR to_regclass('comind.cm_foundry_execution_outcome') IS NULL
       OR to_regclass('comind.cm_foundry_adapter_operation') IS NULL
       OR to_regclass('comind.cm_foundry_adapter_operation_result') IS NULL THEN
        RAISE EXCEPTION 'MDO-002 terminal alignment requires the accepted MDO-001 and Foundry terminal substrate';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_mdo_submit_contribution(
    p_task_id uuid,
    p_profile_id uuid,
    p_execution_context_id uuid,
    p_payload jsonb,
    p_idempotency_key text,
    p_evidence_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_mapping record;
    v_existing comind.cm_mdo_contribution%ROWTYPE;
    v_contribution_id uuid;
    v_evidence_id uuid;
BEGIN
    IF p_task_id IS NULL OR p_profile_id IS NULL OR p_execution_context_id IS NULL THEN
        RAISE EXCEPTION 'MDO contribution requires task, profile, and execution context';
    END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR p_payload = '{}'::jsonb THEN
        RAISE EXCEPTION 'MDO contribution payload must be a non-empty JSON object';
    END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' THEN
        RAISE EXCEPTION 'Invalid MDO contribution idempotency key';
    END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

    SELECT *
    INTO v_existing
    FROM comind.cm_mdo_contribution
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        IF v_existing.task_id <> p_task_id
           OR v_existing.profile_id <> p_profile_id
           OR v_existing.execution_context_id <> p_execution_context_id
           OR v_existing.payload <> p_payload THEN
            RAISE EXCEPTION 'MDO contribution idempotency key conflicts with existing evidence';
        END IF;
        RETURN v_existing.contribution_id;
    END IF;

    SELECT mpt.plan_id,
           mpt.role_code,
           mpt.required_capability_id,
           mp.project_id
    INTO v_mapping
    FROM comind.cm_mdo_plan_task mpt
    JOIN comind.cm_mdo_plan mp ON mp.plan_id = mpt.plan_id
    WHERE mpt.task_id = p_task_id
      AND mp.status IN ('queued', 'in_review');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MDO task is not attached to an active plan';
    END IF;

    -- Foundry terminal lifecycle treats a persisted execution outcome as the
    -- canonical effective closed state. Require the matching adapter result as
    -- well, rather than relying on the older nullable execution-header closed_at.
    IF NOT EXISTS (
        SELECT 1
        FROM comind.cm_foundry_execution_context ec
        JOIN comind.cm_foundry_authorization_decision ad
          ON ad.authorization_decision_id = ec.authorization_decision_id
        JOIN comind.cm_foundry_authorization_request ar
          ON ar.authorization_request_id = ad.authorization_request_id
        JOIN comind.cm_foundry_execution_outcome eo
          ON eo.execution_context_id = ec.execution_context_id
        JOIN comind.cm_foundry_adapter_operation ao
          ON ao.execution_context_id = ec.execution_context_id
        JOIN comind.cm_foundry_adapter_operation_result aor
          ON aor.adapter_operation_id = ao.adapter_operation_id
         AND aor.adapter_operation_result_id = eo.adapter_operation_result_id
        WHERE ec.execution_context_id = p_execution_context_id
          AND ec.profile_id = p_profile_id
          AND ec.task_id = p_task_id
          AND ec.project_id = v_mapping.project_id
          AND ec.capability_id = v_mapping.required_capability_id
          AND ec.environment = 'isolated'
          AND ad.decision = 'approved'
          AND ar.requesting_profile_id = p_profile_id
          AND ar.project_id = v_mapping.project_id
          AND ar.task_id = p_task_id
          AND ar.capability_id = v_mapping.required_capability_id
          AND ar.authority_level = 'C1'
          AND ar.environment = 'isolated'
          AND ar.target_kind = 'module_plan'
          AND ar.target_ref = v_mapping.plan_id::text
          AND ar.status IN ('pending', 'approved')
          AND ar.requested_at <= ec.created_at
          AND (ar.expires_at IS NULL OR ar.expires_at > ec.created_at)
          AND ad.decided_at <= ec.created_at
          AND (ad.effective_until IS NULL OR ad.effective_until > ec.created_at)
          AND eo.terminal_status = 'succeeded'
          AND aor.terminal_status = 'succeeded'
    ) THEN
        RAISE EXCEPTION 'MDO contribution requires one canonically terminal governed execution matching task, profile, project, capability, authorization, and adapter result';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM comind.cm_mdo_contribution
        WHERE task_id = p_task_id
    ) THEN
        RAISE EXCEPTION 'MDO task already has a submitted contribution';
    END IF;

    INSERT INTO comind.cm_mdo_contribution(
        plan_id,
        task_id,
        profile_id,
        execution_context_id,
        role_code,
        payload,
        idempotency_key
    ) VALUES (
        v_mapping.plan_id,
        p_task_id,
        p_profile_id,
        p_execution_context_id,
        v_mapping.role_code,
        p_payload,
        p_idempotency_key
    )
    RETURNING contribution_id INTO v_contribution_id;

    FOREACH v_evidence_id IN ARRAY COALESCE(p_evidence_ids, '{}'::uuid[]) LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM comind.cm_evidence e
            WHERE e.evidence_id = v_evidence_id
        ) THEN
            RAISE EXCEPTION 'Referenced MDO evidence % does not exist', v_evidence_id;
        END IF;
        INSERT INTO comind.cm_mdo_contribution_evidence(contribution_id, evidence_id)
        VALUES (v_contribution_id, v_evidence_id);
    END LOOP;

    UPDATE comind.cm_mdo_plan
    SET status = CASE WHEN status = 'queued' THEN 'in_review' ELSE status END,
        updated_at = clock_timestamp()
    WHERE plan_id = v_mapping.plan_id;

    INSERT INTO comind.cm_audit_log(actor_id, action, target_table, target_id, details)
    SELECT p.actor_id,
           'mdo.contribution.submitted',
           'cm_mdo_contribution',
           v_contribution_id,
           jsonb_build_object(
               'plan_id', v_mapping.plan_id,
               'task_id', p_task_id,
               'profile_id', p_profile_id,
               'execution_context_id', p_execution_context_id,
               'role_code', v_mapping.role_code,
               'idempotency_key', p_idempotency_key,
               'evidence_count', COALESCE(array_length(p_evidence_ids, 1), 0),
               'terminal_evidence', 'execution_outcome+adapter_operation_result',
               'authority', 'C1',
               'environment', 'isolated'
           )
    FROM comind.cm_foundry_agent_profile p
    WHERE p.profile_id = p_profile_id;

    RETURN v_contribution_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])
TO service_role;

COMMIT;
