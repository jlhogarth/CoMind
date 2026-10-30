-- MDO-005: governed module maturity transition and specification acceptance.
-- Issue #407. Exact C2 human authority, no implementation authorization.

BEGIN;

DO $$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_module_registry'),
            ('comind.cm_mdo_plan'),
            ('comind.cm_mdo_plan_disposition_event'),
            ('comind.cm_mdo_plan_disposition_evidence'),
            ('comind.cm_foundry_capability'),
            ('comind.cm_foundry_authorization_request'),
            ('comind.cm_foundry_authorization_decision'),
            ('comind.cm_evidence'),
            ('comind.cm_actor'),
            ('comind.cm_audit_log')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'MDO-005 requires accepted MDO/Foundry substrate: %', v_missing;
    END IF;

    IF to_regprocedure('comind.cm_reject_mdo_provenance_mutation()') IS NULL THEN
        RAISE EXCEPTION 'MDO-005 requires the accepted MDO append-only provenance guard';
    END IF;
END;
$$;

INSERT INTO comind.cm_foundry_capability (
    capability_code, description, action, target_kind,
    max_authority, risk_class, cost_bearing, adapter
)
VALUES (
    'mdo.module.maturity_transition',
    'Human-governed transition of one exact module maturity stage from accepted MDO evidence.',
    'transition_module_maturity',
    'module',
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

CREATE TABLE IF NOT EXISTS comind.cm_module_lifecycle_event (
    lifecycle_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL REFERENCES comind.cm_module_registry(module_id) ON DELETE RESTRICT,
    plan_id uuid NOT NULL REFERENCES comind.cm_mdo_plan(plan_id) ON DELETE RESTRICT,
    from_stage text NOT NULL,
    to_stage text NOT NULL,
    actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
    authorization_decision_id uuid NOT NULL UNIQUE
        REFERENCES comind.cm_foundry_authorization_decision(authorization_decision_id) ON DELETE RESTRICT,
    rationale text NOT NULL,
    source_ref text NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT cm_module_lifecycle_event_from_stage_ck
        CHECK (from_stage IN ('conceived','specified','prototyped','implemented','integrated','operational','deprecated')),
    CONSTRAINT cm_module_lifecycle_event_to_stage_ck
        CHECK (to_stage IN ('conceived','specified','prototyped','implemented','integrated','operational','deprecated')),
    CONSTRAINT cm_module_lifecycle_event_change_ck CHECK (from_stage <> to_stage),
    CONSTRAINT cm_module_lifecycle_event_rationale_ck
        CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 4000),
    CONSTRAINT cm_module_lifecycle_event_source_ck
        CHECK (char_length(btrim(source_ref)) BETWEEN 1 AND 512),
    CONSTRAINT cm_module_lifecycle_event_idempotency_ck
        CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$')
);

CREATE INDEX IF NOT EXISTS idx_cm_module_lifecycle_event_module_created
    ON comind.cm_module_lifecycle_event(module_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cm_module_lifecycle_event_plan
    ON comind.cm_module_lifecycle_event(plan_id);
CREATE INDEX IF NOT EXISTS idx_cm_module_lifecycle_event_actor
    ON comind.cm_module_lifecycle_event(actor_id, created_at);

CREATE TABLE IF NOT EXISTS comind.cm_module_lifecycle_event_evidence (
    lifecycle_event_id uuid NOT NULL
        REFERENCES comind.cm_module_lifecycle_event(lifecycle_event_id) ON DELETE RESTRICT,
    evidence_id uuid NOT NULL REFERENCES comind.cm_evidence(evidence_id) ON DELETE RESTRICT,
    linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (lifecycle_event_id, evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_module_lifecycle_event_evidence_evidence
    ON comind.cm_module_lifecycle_event_evidence(evidence_id);

DROP TRIGGER IF EXISTS trg_cm_module_lifecycle_event_immutable
    ON comind.cm_module_lifecycle_event;
CREATE TRIGGER trg_cm_module_lifecycle_event_immutable
BEFORE UPDATE OR DELETE ON comind.cm_module_lifecycle_event
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_mdo_provenance_mutation();

DROP TRIGGER IF EXISTS trg_cm_module_lifecycle_event_evidence_immutable
    ON comind.cm_module_lifecycle_event_evidence;
CREATE TRIGGER trg_cm_module_lifecycle_event_evidence_immutable
BEFORE UPDATE OR DELETE ON comind.cm_module_lifecycle_event_evidence
FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_mdo_provenance_mutation();

ALTER TABLE comind.cm_module_lifecycle_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_module_lifecycle_event_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comind.cm_module_lifecycle_event,
              comind.cm_module_lifecycle_event_evidence
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON comind.cm_module_lifecycle_event,
                comind.cm_module_lifecycle_event_evidence
TO service_role;

CREATE OR REPLACE FUNCTION comind.cm_mdo_transition_module_maturity(
    p_module_id uuid,
    p_plan_id uuid,
    p_actor_id uuid,
    p_authorization_decision_id uuid,
    p_target_stage text,
    p_rationale text,
    p_source_ref text,
    p_idempotency_key text,
    p_evidence_ids uuid[]
)
RETURNS TABLE(
    lifecycle_event_id uuid,
    created boolean,
    from_stage text,
    to_stage text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_existing comind.cm_module_lifecycle_event%ROWTYPE;
    v_existing_evidence uuid[];
    v_evidence uuid[];
    v_module comind.cm_module_registry%ROWTYPE;
    v_plan record;
    v_auth record;
    v_actor_kind text;
    v_accept_event_id uuid;
    v_accept_count integer;
    v_event_id uuid;
BEGIN
    IF p_module_id IS NULL OR p_plan_id IS NULL OR p_actor_id IS NULL
       OR p_authorization_decision_id IS NULL THEN
        RAISE EXCEPTION 'MDO maturity transition requires module, plan, actor, and authorization decision';
    END IF;
    IF p_target_stage IS NULL OR p_target_stage <> 'specified' THEN
        RAISE EXCEPTION 'MDO-005 supports only the verified conceived to specified transition';
    END IF;
    IF p_rationale IS NULL OR char_length(btrim(p_rationale)) NOT BETWEEN 1 AND 4000 THEN
        RAISE EXCEPTION 'MDO maturity rationale must contain 1 to 4000 characters';
    END IF;
    IF p_source_ref IS NULL OR char_length(btrim(p_source_ref)) NOT BETWEEN 1 AND 512 THEN
        RAISE EXCEPTION 'MDO maturity source_ref must contain 1 to 512 characters';
    END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' THEN
        RAISE EXCEPTION 'Invalid MDO maturity idempotency key';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT evidence_id ORDER BY evidence_id), ARRAY[]::uuid[])
    INTO v_evidence
    FROM unnest(COALESCE(p_evidence_ids, ARRAY[]::uuid[])) AS evidence_id;

    IF cardinality(v_evidence) = 0 THEN
        RAISE EXCEPTION 'MDO maturity transition requires canonical evidence';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM unnest(v_evidence) e(evidence_id)
        LEFT JOIN comind.cm_evidence ce ON ce.evidence_id = e.evidence_id
        WHERE ce.evidence_id IS NULL
    ) THEN
        RAISE EXCEPTION 'MDO maturity transition references unknown canonical evidence';
    END IF;

    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_module_id::text, 0));
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

    SELECT * INTO v_existing
    FROM comind.cm_module_lifecycle_event
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        SELECT COALESCE(array_agg(le.evidence_id ORDER BY le.evidence_id), ARRAY[]::uuid[])
        INTO v_existing_evidence
        FROM comind.cm_module_lifecycle_event_evidence AS le
        WHERE le.lifecycle_event_id = v_existing.lifecycle_event_id;

        IF v_existing.module_id IS DISTINCT FROM p_module_id
           OR v_existing.plan_id IS DISTINCT FROM p_plan_id
           OR v_existing.actor_id IS DISTINCT FROM p_actor_id
           OR v_existing.authorization_decision_id IS DISTINCT FROM p_authorization_decision_id
           OR v_existing.to_stage IS DISTINCT FROM p_target_stage
           OR v_existing.rationale IS DISTINCT FROM p_rationale
           OR v_existing.source_ref IS DISTINCT FROM p_source_ref
           OR v_existing_evidence IS DISTINCT FROM v_evidence THEN
            RAISE EXCEPTION 'MDO maturity idempotency key conflicts with existing event';
        END IF;

        RETURN QUERY SELECT
            v_existing.lifecycle_event_id,
            false,
            v_existing.from_stage,
            v_existing.to_stage;
        RETURN;
    END IF;

    SELECT kind INTO v_actor_kind
    FROM comind.cm_actor
    WHERE actor_id = p_actor_id;
    IF NOT FOUND OR v_actor_kind <> 'person' THEN
        RAISE EXCEPTION 'MDO maturity transition requires an attributable human person actor';
    END IF;

    SELECT * INTO v_module
    FROM comind.cm_module_registry
    WHERE module_id = p_module_id
    FOR UPDATE;
    IF NOT FOUND OR v_module.status <> 'enabled' THEN
        RAISE EXCEPTION 'MDO maturity module must resolve to one enabled module';
    END IF;

    SELECT mp.plan_id, mp.module_id, mp.project_id, mp.status, mp.target_stage
    INTO v_plan
    FROM comind.cm_mdo_plan mp
    WHERE mp.plan_id = p_plan_id;
    IF NOT FOUND
       OR v_plan.module_id IS DISTINCT FROM p_module_id
       OR v_plan.project_id IS DISTINCT FROM v_module.project_id
       OR v_plan.status <> 'accepted'
       OR v_plan.target_stage <> p_target_stage THEN
        RAISE EXCEPTION 'MDO maturity requires an accepted exact-module plan for the requested target stage';
    END IF;

    IF v_module.lifecycle_stage <> 'conceived' OR p_target_stage <> 'specified' THEN
        RAISE EXCEPTION 'Only a conceived module can transition to specified in MDO-005';
    END IF;

    SELECT count(*)::int,
           (array_agg(de.disposition_event_id ORDER BY de.created_at))[1]
    INTO v_accept_count, v_accept_event_id
    FROM comind.cm_mdo_plan_disposition_event de
    WHERE de.plan_id = p_plan_id
      AND de.event_type = 'accept'
      AND de.to_status = 'accepted';
    IF v_accept_count <> 1 OR v_accept_event_id IS NULL THEN
        RAISE EXCEPTION 'MDO maturity requires exactly one governed plan acceptance event';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM unnest(v_evidence) e(evidence_id)
        JOIN comind.cm_mdo_plan_disposition_evidence de
          ON de.evidence_id = e.evidence_id
        WHERE de.disposition_event_id = v_accept_event_id
    ) THEN
        RAISE EXCEPTION 'MDO maturity evidence must include evidence linked to the governed plan acceptance';
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
       OR v_auth.capability_code <> 'mdo.module.maturity_transition'
       OR v_auth.requesting_actor_id IS DISTINCT FROM p_actor_id
       OR v_auth.decided_by_actor_id IS DISTINCT FROM p_actor_id
       OR v_auth.project_id IS DISTINCT FROM v_plan.project_id
       OR v_auth.authority_level <> 'C2'
       OR v_auth.environment <> 'isolated'
       OR v_auth.target_kind <> 'module'
       OR v_auth.target_ref IS DISTINCT FROM p_module_id::text
       OR (v_auth.request_expires_at IS NOT NULL AND v_auth.request_expires_at <= clock_timestamp())
       OR (v_auth.effective_until IS NOT NULL AND v_auth.effective_until <= clock_timestamp()) THEN
        RAISE EXCEPTION 'MDO maturity authorization does not match the exact C2 module envelope';
    END IF;

    INSERT INTO comind.cm_module_lifecycle_event(
        module_id, plan_id, from_stage, to_stage, actor_id,
        authorization_decision_id, rationale, source_ref, idempotency_key
    ) VALUES (
        p_module_id, p_plan_id, v_module.lifecycle_stage, p_target_stage, p_actor_id,
        p_authorization_decision_id, btrim(p_rationale), btrim(p_source_ref), p_idempotency_key
    ) RETURNING cm_module_lifecycle_event.lifecycle_event_id INTO v_event_id;

    INSERT INTO comind.cm_module_lifecycle_event_evidence(lifecycle_event_id, evidence_id)
    SELECT v_event_id, evidence_id FROM unnest(v_evidence) AS evidence_id;

    UPDATE comind.cm_module_registry
    SET lifecycle_stage = p_target_stage,
        updated_at = clock_timestamp()
    WHERE module_id = p_module_id
      AND lifecycle_stage = 'conceived';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MDO maturity projection changed concurrently';
    END IF;

    INSERT INTO comind.cm_audit_log(actor_id, action, target_table, target_id, details)
    VALUES (
        p_actor_id,
        'mdo.module.maturity_transition',
        'cm_module_registry',
        p_module_id,
        jsonb_build_object(
            'lifecycle_event_id', v_event_id,
            'plan_id', p_plan_id,
            'from_stage', v_module.lifecycle_stage,
            'to_stage', p_target_stage,
            'authorization_decision_id', p_authorization_decision_id,
            'source_ref', btrim(p_source_ref)
        )
    );

    RETURN QUERY SELECT v_event_id, true, v_module.lifecycle_stage, p_target_stage;
END;
$$;

REVOKE ALL ON FUNCTION comind.cm_mdo_transition_module_maturity(
    uuid,uuid,uuid,uuid,text,text,text,text,uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_mdo_transition_module_maturity(
    uuid,uuid,uuid,uuid,text,text,text,text,uuid[]
) TO service_role;

COMMIT;