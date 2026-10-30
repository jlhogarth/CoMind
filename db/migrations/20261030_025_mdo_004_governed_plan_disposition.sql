-- MDO-004: governed human plan disposition and supersession lifecycle.
-- Issue #377. Test-first, C2 exact-plan authority, no module maturity mutation.

BEGIN;

DO $$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_mdo_plan'),
            ('comind.cm_mdo_plan_task'),
            ('comind.cm_mdo_contribution'),
            ('comind.cm_mdo_contribution_evidence'),
            ('comind.cm_module_registry'),
            ('comind.cm_task'),
            ('comind.cm_foundry_work_lease'),
            ('comind.cm_foundry_capability'),
            ('comind.cm_foundry_authorization_request'),
            ('comind.cm_foundry_authorization_decision'),
            ('comind.cm_foundry_execution_outcome'),
            ('comind.cm_evidence'),
            ('comind.cm_actor'),
            ('comind.cm_audit_log')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'MDO-004 requires accepted MDO/Foundry substrate: %', v_missing;
    END IF;
END;
$$;

INSERT INTO comind.cm_foundry_capability (
    capability_code, description, action, target_kind,
    max_authority, risk_class, cost_bearing, adapter
)
VALUES (
    'mdo.plan.disposition',
    'Human-governed disposition of one exact MDO module plan.',
    'dispose_plan',
    'module_plan',
    'C2',
    'moderate',
    false,
    'mdo'
)
ON CONFLICT (capability_code) DO UPDATE
SET description = EXCLUDED.description,
    action = EXCLUDED.action,
    target_kind = EXCLUDED.target_kind,
    max_authority = EXCLUDED.max_authority,
    risk_class = EXCLUDED.risk_class,
    cost_bearing = EXCLUDED.cost_bearing,
    adapter = EXCLUDED.adapter;

CREATE TABLE IF NOT EXISTS comind.cm_mdo_plan_disposition_event (
    disposition_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL REFERENCES comind.cm_mdo_plan(plan_id) ON DELETE RESTRICT,
    event_type text NOT NULL,
    from_status text NOT NULL,
    to_status text NOT NULL,
    actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
    authorization_decision_id uuid NOT NULL UNIQUE
        REFERENCES comind.cm_foundry_authorization_decision(authorization_decision_id) ON DELETE RESTRICT,
    rationale text NOT NULL,
    source_ref text NOT NULL,
    successor_plan_id uuid REFERENCES comind.cm_mdo_plan(plan_id) ON DELETE RESTRICT,
    idempotency_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT cm_mdo_plan_disposition_event_type_ck
        CHECK (event_type IN ('accept','block','resume_review','supersede')),
    CONSTRAINT cm_mdo_plan_disposition_from_ck
        CHECK (from_status IN ('queued','in_review','accepted','blocked','superseded')),
    CONSTRAINT cm_mdo_plan_disposition_to_ck
        CHECK (to_status IN ('in_review','accepted','blocked','superseded')),
    CONSTRAINT cm_mdo_plan_disposition_rationale_ck
        CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 4000),
    CONSTRAINT cm_mdo_plan_disposition_source_ck
        CHECK (char_length(btrim(source_ref)) BETWEEN 1 AND 512),
    CONSTRAINT cm_mdo_plan_disposition_idempotency_ck
        CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'),
    CONSTRAINT cm_mdo_plan_disposition_successor_ck
        CHECK ((event_type = 'supersede') = (successor_plan_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_disposition_plan_created
    ON comind.cm_mdo_plan_disposition_event(plan_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_disposition_successor
    ON comind.cm_mdo_plan_disposition_event(successor_plan_id)
    WHERE successor_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_disposition_actor
    ON comind.cm_mdo_plan_disposition_event(actor_id, created_at);

CREATE TABLE IF NOT EXISTS comind.cm_mdo_plan_disposition_evidence (
    disposition_event_id uuid NOT NULL
        REFERENCES comind.cm_mdo_plan_disposition_event(disposition_event_id) ON DELETE RESTRICT,
    evidence_id uuid NOT NULL REFERENCES comind.cm_evidence(evidence_id) ON DELETE RESTRICT,
    linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (disposition_event_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_disposition_evidence_evidence
    ON comind.cm_mdo_plan_disposition_evidence(evidence_id);

DROP TRIGGER IF EXISTS trg_cm_mdo_plan_disposition_event_immutable
    ON comind.cm_mdo_plan_disposition_event;
CREATE TRIGGER trg_cm_mdo_plan_disposition_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_mdo_plan_disposition_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_mdo_provenance_mutation();

DROP TRIGGER IF EXISTS trg_cm_mdo_plan_disposition_evidence_immutable
    ON comind.cm_mdo_plan_disposition_evidence;
CREATE TRIGGER trg_cm_mdo_plan_disposition_evidence_immutable
BEFORE UPDATE OR DELETE ON comind.cm_mdo_plan_disposition_evidence
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_mdo_provenance_mutation();

ALTER TABLE comind.cm_mdo_plan_disposition_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_mdo_plan_disposition_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comind.cm_mdo_plan_disposition_event,
              comind.cm_mdo_plan_disposition_evidence
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON comind.cm_mdo_plan_disposition_event,
                comind.cm_mdo_plan_disposition_evidence
TO service_role;

CREATE OR REPLACE FUNCTION comind.cm_mdo_dispose_plan(
    p_plan_id uuid,
    p_event_type text,
    p_actor_id uuid,
    p_authorization_decision_id uuid,
    p_rationale text,
    p_source_ref text,
    p_successor_plan_id uuid,
    p_idempotency_key text,
    p_evidence_ids uuid[]
)
RETURNS TABLE(
    disposition_event_id uuid,
    created boolean,
    from_status text,
    to_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_existing comind.cm_mdo_plan_disposition_event%ROWTYPE;
    v_existing_evidence uuid[];
    v_evidence uuid[];
    v_plan record;
    v_auth record;
    v_successor record;
    v_to_status text;
    v_event_id uuid;
    v_task_count integer;
    v_done_count integer;
    v_lease_count integer;
    v_contribution_count integer;
    v_evidence_count integer;
    v_success_count integer;
BEGIN
    IF p_plan_id IS NULL OR p_actor_id IS NULL OR p_authorization_decision_id IS NULL THEN
        RAISE EXCEPTION 'MDO disposition requires plan, actor, and authorization decision';
    END IF;
    IF p_event_type IS NULL OR p_event_type NOT IN ('accept','block','resume_review','supersede') THEN
        RAISE EXCEPTION 'Unsupported MDO disposition event type';
    END IF;
    IF p_rationale IS NULL OR char_length(btrim(p_rationale)) NOT BETWEEN 1 AND 4000 THEN
        RAISE EXCEPTION 'MDO disposition rationale must contain 1 to 4000 characters';
    END IF;
    IF p_source_ref IS NULL OR char_length(btrim(p_source_ref)) NOT BETWEEN 1 AND 512 THEN
        RAISE EXCEPTION 'MDO disposition source_ref must contain 1 to 512 characters';
    END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' THEN
        RAISE EXCEPTION 'Invalid MDO disposition idempotency key';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT evidence_id ORDER BY evidence_id), ARRAY[]::uuid[])
    INTO v_evidence
    FROM unnest(COALESCE(p_evidence_ids, ARRAY[]::uuid[])) AS evidence_id;

    IF cardinality(v_evidence) = 0 THEN
        RAISE EXCEPTION 'MDO disposition requires canonical evidence';
    END IF;
    IF EXISTS (
        SELECT 1 FROM unnest(v_evidence) e(evidence_id)
        LEFT JOIN comind.cm_evidence ce ON ce.evidence_id = e.evidence_id
        WHERE ce.evidence_id IS NULL
    ) THEN
        RAISE EXCEPTION 'MDO disposition references unknown canonical evidence';
    END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_plan_id::text, 0));
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

    SELECT * INTO v_existing
    FROM comind.cm_mdo_plan_disposition_event
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        SELECT COALESCE(array_agg(evidence_id ORDER BY evidence_id), ARRAY[]::uuid[])
        INTO v_existing_evidence
        FROM comind.cm_mdo_plan_disposition_evidence
        WHERE disposition_event_id = v_existing.disposition_event_id;

        IF v_existing.plan_id IS DISTINCT FROM p_plan_id
           OR v_existing.event_type IS DISTINCT FROM p_event_type
           OR v_existing.actor_id IS DISTINCT FROM p_actor_id
           OR v_existing.authorization_decision_id IS DISTINCT FROM p_authorization_decision_id
           OR v_existing.rationale IS DISTINCT FROM p_rationale
           OR v_existing.source_ref IS DISTINCT FROM p_source_ref
           OR v_existing.successor_plan_id IS DISTINCT FROM p_successor_plan_id
           OR v_existing_evidence IS DISTINCT FROM v_evidence THEN
            RAISE EXCEPTION 'MDO disposition idempotency key conflicts with existing event';
        END IF;

        RETURN QUERY SELECT
            v_existing.disposition_event_id,
            false,
            v_existing.from_status,
            v_existing.to_status;
        RETURN;
    END IF;

    SELECT mp.plan_id, mp.module_id, mp.project_id, mp.version, mp.status,
           mr.lifecycle_stage
    INTO v_plan
    FROM comind.cm_mdo_plan mp
    JOIN comind.cm_module_registry mr ON mr.module_id = mp.module_id
    WHERE mp.plan_id = p_plan_id
    FOR UPDATE OF mp;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MDO disposition plan was not found';
    END IF;

    SELECT ar.requesting_actor_id,
           ar.project_id,
           ar.authority_level,
           ar.environment,
           ar.target_kind,
           ar.target_ref,
           ar.status AS request_status,
           ar.expires_at AS request_expires_at,
           ad.decision,
           ad.decided_by_actor_id,
           ad.effective_until,
           c.capability_code
    INTO v_auth
    FROM comind.cm_foundry_authorization_decision ad
    JOIN comind.cm_foundry_authorization_request ar
      ON ar.authorization_request_id = ad.authorization_request_id
    JOIN comind.cm_foundry_capability c
      ON c.capability_id = ar.capability_id
    WHERE ad.authorization_decision_id = p_authorization_decision_id;

    IF NOT FOUND
       OR v_auth.decision <> 'approved'
       OR v_auth.request_status NOT IN ('pending','approved')
       OR v_auth.capability_code <> 'mdo.plan.disposition'
       OR v_auth.requesting_actor_id IS DISTINCT FROM p_actor_id
       OR v_auth.decided_by_actor_id IS DISTINCT FROM p_actor_id
       OR v_auth.project_id IS DISTINCT FROM v_plan.project_id
       OR v_auth.authority_level <> 'C2'
       OR v_auth.environment <> 'isolated'
       OR v_auth.target_kind <> 'module_plan'
       OR v_auth.target_ref IS DISTINCT FROM p_plan_id::text
       OR (v_auth.request_expires_at IS NOT NULL AND v_auth.request_expires_at <= clock_timestamp())
       OR (v_auth.effective_until IS NOT NULL AND v_auth.effective_until <= clock_timestamp()) THEN
        RAISE EXCEPTION 'MDO disposition authorization does not match the exact C2 plan envelope';
    END IF;

    CASE p_event_type
        WHEN 'accept' THEN
            IF v_plan.status <> 'in_review' THEN
                RAISE EXCEPTION 'Only an in_review MDO plan can be accepted';
            END IF;
            IF p_successor_plan_id IS NOT NULL THEN
                RAISE EXCEPTION 'Accept disposition cannot name a successor plan';
            END IF;
            v_to_status := 'accepted';

            SELECT count(*)::int,
                   count(*) FILTER (WHERE t.status = 'done')::int,
                   count(*) FILTER (WHERE wl.state = 'completed')::int
            INTO v_task_count, v_done_count, v_lease_count
            FROM comind.cm_mdo_plan_task mpt
            JOIN comind.cm_task t ON t.task_id = mpt.task_id
            JOIN comind.cm_foundry_work_lease wl ON wl.task_id = mpt.task_id
            WHERE mpt.plan_id = p_plan_id;

            SELECT count(*)::int,
                   count(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM comind.cm_mdo_contribution_evidence ce
                       WHERE ce.contribution_id = c.contribution_id
                   ))::int,
                   count(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM comind.cm_foundry_execution_outcome eo
                       WHERE eo.execution_context_id = c.execution_context_id
                         AND eo.terminal_status = 'succeeded'
                   ))::int
            INTO v_contribution_count, v_evidence_count, v_success_count
            FROM comind.cm_mdo_contribution c
            WHERE c.plan_id = p_plan_id;

            IF v_task_count <> 10
               OR v_done_count <> 10
               OR v_lease_count <> 10
               OR v_contribution_count <> 10
               OR v_evidence_count <> 10
               OR v_success_count <> 10 THEN
                RAISE EXCEPTION
                    'MDO plan is incomplete: tasks %, done %, leases %, contributions %, evidence %, successes %',
                    v_task_count, v_done_count, v_lease_count,
                    v_contribution_count, v_evidence_count, v_success_count;
            END IF;

        WHEN 'block' THEN
            IF v_plan.status NOT IN ('queued','in_review') THEN
                RAISE EXCEPTION 'Only queued or in_review MDO plans can be blocked';
            END IF;
            IF p_successor_plan_id IS NOT NULL THEN
                RAISE EXCEPTION 'Block disposition cannot name a successor plan';
            END IF;
            v_to_status := 'blocked';

        WHEN 'resume_review' THEN
            IF v_plan.status <> 'blocked' THEN
                RAISE EXCEPTION 'Only a blocked MDO plan can resume review';
            END IF;
            IF p_successor_plan_id IS NOT NULL THEN
                RAISE EXCEPTION 'Resume-review disposition cannot name a successor plan';
            END IF;
            v_to_status := 'in_review';

        WHEN 'supersede' THEN
            IF v_plan.status <> 'accepted' THEN
                RAISE EXCEPTION 'Only an accepted MDO plan can be superseded';
            END IF;
            IF p_successor_plan_id IS NULL OR p_successor_plan_id = p_plan_id THEN
                RAISE EXCEPTION 'Supersession requires a distinct successor plan';
            END IF;

            SELECT plan_id, module_id, version, status
            INTO v_successor
            FROM comind.cm_mdo_plan
            WHERE plan_id = p_successor_plan_id
            FOR SHARE;

            IF NOT FOUND
               OR v_successor.module_id IS DISTINCT FROM v_plan.module_id
               OR v_successor.version <= v_plan.version
               OR v_successor.status <> 'accepted' THEN
                RAISE EXCEPTION 'MDO successor must be a later accepted plan for the same module';
            END IF;
            v_to_status := 'superseded';
    END CASE;

    INSERT INTO comind.cm_mdo_plan_disposition_event(
        plan_id, event_type, from_status, to_status, actor_id,
        authorization_decision_id, rationale, source_ref,
        successor_plan_id, idempotency_key
    ) VALUES (
        p_plan_id, p_event_type, v_plan.status, v_to_status, p_actor_id,
        p_authorization_decision_id, p_rationale, p_source_ref,
        p_successor_plan_id, p_idempotency_key
    )
    RETURNING cm_mdo_plan_disposition_event.disposition_event_id
    INTO v_event_id;

    INSERT INTO comind.cm_mdo_plan_disposition_evidence(disposition_event_id, evidence_id)
    SELECT v_event_id, evidence_id FROM unnest(v_evidence) AS evidence_id;

    UPDATE comind.cm_mdo_plan
    SET status = v_to_status,
        updated_at = clock_timestamp()
    WHERE plan_id = p_plan_id;

    INSERT INTO comind.cm_audit_log(actor_id, action, target_table, target_id, details)
    VALUES (
        p_actor_id,
        'mdo.plan.' || p_event_type,
        'cm_mdo_plan',
        p_plan_id,
        jsonb_build_object(
            'disposition_event_id', v_event_id,
            'from_status', v_plan.status,
            'to_status', v_to_status,
            'authorization_decision_id', p_authorization_decision_id,
            'source_ref', p_source_ref,
            'successor_plan_id', p_successor_plan_id,
            'evidence_ids', to_jsonb(v_evidence),
            'module_lifecycle_stage_unchanged', v_plan.lifecycle_stage,
            'authority', 'C2',
            'environment', 'isolated'
        )
    );

    RETURN QUERY SELECT v_event_id, true, v_plan.status, v_to_status;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_mdo_dispose_plan(
    uuid,text,uuid,uuid,text,text,uuid,text,uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_mdo_dispose_plan(
    uuid,text,uuid,uuid,text,text,uuid,text,uuid[]
) TO service_role;

COMMIT;
