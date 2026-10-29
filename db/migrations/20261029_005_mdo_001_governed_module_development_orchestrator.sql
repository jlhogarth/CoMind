-- MDO-001: governed Module Development Orchestrator foundation.
-- Issue #313. T2 because this adds bounded cross-agent work state in isolated environments.
-- No production activation, paid provider execution, autonomous merge, deploy, or maturity promotion.

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
            ('comind.cm_project'),
            ('comind.cm_task'),
            ('comind.cm_actor'),
            ('comind.cm_evidence'),
            ('comind.cm_audit_log'),
            ('comind.cm_foundry_agent_profile'),
            ('comind.cm_foundry_capability'),
            ('comind.cm_foundry_capability_grant'),
            ('comind.cm_foundry_authorization_request'),
            ('comind.cm_foundry_authorization_decision'),
            ('comind.cm_foundry_execution_context'),
            ('comind.cm_foundry_execution_outcome'),
            ('comind.cm_foundry_work_lease'),
            ('comind.cm_foundry_work_lease_event')
    ) AS required(name)
    WHERE to_regclass(name) IS NULL;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'MDO-001 requires existing CoMind/Foundry substrate: %', v_missing;
    END IF;
END;
$$;

-- Plain text avoids depending on the installation schema of the citext extension.
ALTER TABLE comind.cm_module_registry
    ADD COLUMN IF NOT EXISTS module_code text,
    ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'conceived',
    ADD COLUMN IF NOT EXISTS source_system text,
    ADD COLUMN IF NOT EXISTS source_ref text,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'comind.cm_module_registry'::regclass
          AND conname = 'cm_module_registry_module_code_ck'
    ) THEN
        ALTER TABLE comind.cm_module_registry
            ADD CONSTRAINT cm_module_registry_module_code_ck
            CHECK (module_code IS NULL OR module_code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'comind.cm_module_registry'::regclass
          AND conname = 'cm_module_registry_lifecycle_stage_ck'
    ) THEN
        ALTER TABLE comind.cm_module_registry
            ADD CONSTRAINT cm_module_registry_lifecycle_stage_ck
            CHECK (lifecycle_stage IN (
                'conceived','specified','prototyped','implemented',
                'integrated','operational','deprecated'
            ));
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_module_registry_module_code
    ON comind.cm_module_registry(module_code)
    WHERE module_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cm_module_registry_project
    ON comind.cm_module_registry(project_id)
    WHERE project_id IS NOT NULL;

ALTER TABLE comind.cm_module_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comind.cm_module_registry FROM PUBLIC, anon, authenticated;
GRANT SELECT ON comind.cm_module_registry TO service_role;

CREATE TABLE IF NOT EXISTS comind.cm_mdo_plan (
    plan_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL REFERENCES comind.cm_module_registry(module_id) ON DELETE RESTRICT,
    project_id uuid NOT NULL REFERENCES comind.cm_project(project_id) ON DELETE RESTRICT,
    requested_by_actor_id uuid NOT NULL REFERENCES comind.cm_actor(actor_id) ON DELETE RESTRICT,
    authorization_decision_id uuid NOT NULL REFERENCES comind.cm_foundry_authorization_decision(authorization_decision_id) ON DELETE RESTRICT,
    objective text NOT NULL,
    target_stage text NOT NULL DEFAULT 'specified',
    status text NOT NULL DEFAULT 'queued',
    version integer NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_mdo_plan_objective_ck CHECK (char_length(btrim(objective)) BETWEEN 1 AND 12000),
    CONSTRAINT cm_mdo_plan_target_stage_ck CHECK (target_stage IN ('specified','prototyped','implemented','integrated','operational','deprecated')),
    CONSTRAINT cm_mdo_plan_status_ck CHECK (status IN ('queued','in_review','accepted','blocked','superseded')),
    CONSTRAINT cm_mdo_plan_version_ck CHECK (version > 0),
    CONSTRAINT cm_mdo_plan_idempotency_ck CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'),
    CONSTRAINT cm_mdo_plan_module_version_uk UNIQUE (module_id, version)
);

CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_project ON comind.cm_mdo_plan(project_id);
CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_requester ON comind.cm_mdo_plan(requested_by_actor_id);
CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_authorization ON comind.cm_mdo_plan(authorization_decision_id);
CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_module_status ON comind.cm_mdo_plan(module_id, status);

CREATE TABLE IF NOT EXISTS comind.cm_mdo_plan_task (
    task_id uuid PRIMARY KEY REFERENCES comind.cm_task(task_id) ON DELETE RESTRICT,
    plan_id uuid NOT NULL REFERENCES comind.cm_mdo_plan(plan_id) ON DELETE RESTRICT,
    role_code text NOT NULL,
    deliverable_type text NOT NULL,
    required_capability_id uuid NOT NULL REFERENCES comind.cm_foundry_capability(capability_id) ON DELETE RESTRICT,
    sequence_no integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_mdo_plan_task_role_ck CHECK (role_code IN ('module_planner','architecture_analyst','external_capability_scout','lessons_learned_analyst','dependency_analyst','governance_reviewer','assumption_validator','integration_reviewer','plan_synthesizer','portfolio_coordinator')),
    CONSTRAINT cm_mdo_plan_task_deliverable_ck CHECK (deliverable_type ~ '^[a-z][a-z0-9._:-]{1,127}$'),
    CONSTRAINT cm_mdo_plan_task_sequence_ck CHECK (sequence_no BETWEEN 1 AND 100),
    CONSTRAINT cm_mdo_plan_task_role_uk UNIQUE (plan_id, role_code),
    CONSTRAINT cm_mdo_plan_task_sequence_uk UNIQUE (plan_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_task_plan ON comind.cm_mdo_plan_task(plan_id);
CREATE INDEX IF NOT EXISTS idx_cm_mdo_plan_task_capability ON comind.cm_mdo_plan_task(required_capability_id);

CREATE TABLE IF NOT EXISTS comind.cm_mdo_contribution (
    contribution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id uuid NOT NULL REFERENCES comind.cm_mdo_plan(plan_id) ON DELETE RESTRICT,
    task_id uuid NOT NULL UNIQUE REFERENCES comind.cm_mdo_plan_task(task_id) ON DELETE RESTRICT,
    profile_id uuid NOT NULL REFERENCES comind.cm_foundry_agent_profile(profile_id) ON DELETE RESTRICT,
    execution_context_id uuid NOT NULL UNIQUE REFERENCES comind.cm_foundry_execution_context(execution_context_id) ON DELETE RESTRICT,
    role_code text NOT NULL,
    payload jsonb NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cm_mdo_contribution_role_ck CHECK (role_code IN ('module_planner','architecture_analyst','external_capability_scout','lessons_learned_analyst','dependency_analyst','governance_reviewer','assumption_validator','integration_reviewer','plan_synthesizer','portfolio_coordinator')),
    CONSTRAINT cm_mdo_contribution_payload_ck CHECK (jsonb_typeof(payload) = 'object' AND payload <> '{}'::jsonb),
    CONSTRAINT cm_mdo_contribution_idempotency_ck CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$')
);

CREATE INDEX IF NOT EXISTS idx_cm_mdo_contribution_plan ON comind.cm_mdo_contribution(plan_id);
CREATE INDEX IF NOT EXISTS idx_cm_mdo_contribution_profile ON comind.cm_mdo_contribution(profile_id);

CREATE TABLE IF NOT EXISTS comind.cm_mdo_contribution_evidence (
    contribution_id uuid NOT NULL REFERENCES comind.cm_mdo_contribution(contribution_id) ON DELETE RESTRICT,
    evidence_id uuid NOT NULL REFERENCES comind.cm_evidence(evidence_id) ON DELETE RESTRICT,
    linked_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (contribution_id, evidence_id)
);
CREATE INDEX IF NOT EXISTS idx_cm_mdo_contribution_evidence_evidence ON comind.cm_mdo_contribution_evidence(evidence_id);

CREATE OR REPLACE FUNCTION comind.cm_reject_mdo_provenance_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION 'MDO provenance is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_cm_mdo_contribution_immutable ON comind.cm_mdo_contribution;
CREATE TRIGGER trg_cm_mdo_contribution_immutable BEFORE UPDATE OR DELETE ON comind.cm_mdo_contribution FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_mdo_provenance_mutation();
DROP TRIGGER IF EXISTS trg_cm_mdo_contribution_evidence_immutable ON comind.cm_mdo_contribution_evidence;
CREATE TRIGGER trg_cm_mdo_contribution_evidence_immutable BEFORE UPDATE OR DELETE ON comind.cm_mdo_contribution_evidence FOR EACH ROW EXECUTE FUNCTION comind.cm_reject_mdo_provenance_mutation();

ALTER TABLE comind.cm_mdo_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_mdo_plan_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_mdo_contribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE comind.cm_mdo_contribution_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comind.cm_mdo_plan, comind.cm_mdo_plan_task, comind.cm_mdo_contribution, comind.cm_mdo_contribution_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON comind.cm_mdo_plan, comind.cm_mdo_plan_task, comind.cm_mdo_contribution, comind.cm_mdo_contribution_evidence TO service_role;

INSERT INTO comind.cm_foundry_capability (capability_code, description, action, target_kind, max_authority, risk_class, cost_bearing, adapter)
VALUES
    ('ve.lifecycle.activate', 'Activate or reactivate one exact Foundry VE profile under C2 isolated authorization.', 'activate', 'foundry_agent_profile', 'C2', 'moderate', false, 've_lifecycle'),
    ('ve.lifecycle.suspend', 'Fail-close and suspend one exact Foundry VE profile under C2 isolated authorization.', 'suspend', 'foundry_agent_profile', 'C2', 'moderate', false, 've_lifecycle'),
    ('ve.lifecycle.retire', 'Fail-close and retire one exact Foundry VE profile while preserving provenance.', 'retire', 'foundry_agent_profile', 'C2', 'high', false, 've_lifecycle'),
    ('mdo.plan.orchestrate', 'Create one bounded module planning plan and its governed planning tasks.', 'orchestrate_plan', 'module', 'C1', 'moderate', false, 'mdo'),
    ('mdo.plan.analyze', 'Analyze module requirements, architecture, dependencies, and lessons learned.', 'analyze_module', 'module_plan', 'C1', 'low', false, 'mdo'),
    ('mdo.plan.research', 'Research external capabilities and prior CoMind evidence for a module plan.', 'research_module', 'module_plan', 'C1', 'low', false, 'mdo'),
    ('mdo.plan.review', 'Review a module plan for governance, assumptions, integration, and failure modes.', 'review_plan', 'module_plan', 'C1', 'low', false, 'mdo'),
    ('mdo.plan.synthesize', 'Synthesize reviewed planning contributions into a structured implementation plan.', 'synthesize_plan', 'module_plan', 'C1', 'moderate', false, 'mdo'),
    ('mdo.plan.portfolio', 'Review module plans across the portfolio for reuse, sequencing, and collisions.', 'portfolio_review', 'module_plan', 'C1', 'moderate', false, 'mdo')
ON CONFLICT (capability_code) DO UPDATE SET description=EXCLUDED.description, action=EXCLUDED.action, target_kind=EXCLUDED.target_kind, max_authority=EXCLUDED.max_authority, risk_class=EXCLUDED.risk_class, cost_bearing=EXCLUDED.cost_bearing, adapter=EXCLUDED.adapter;

CREATE OR REPLACE FUNCTION comind.cm_mdo_enqueue_plan(p_module_id uuid,p_project_id uuid,p_requested_by_actor_id uuid,p_authorization_decision_id uuid,p_objective text,p_idempotency_key text)
RETURNS TABLE(plan_id uuid, created boolean, task_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_existing comind.cm_mdo_plan%ROWTYPE;
    v_module comind.cm_module_registry%ROWTYPE;
    v_project comind.cm_project%ROWTYPE;
    v_plan_id uuid;
    v_version integer;
    v_task_id uuid;
    v_capability_id uuid;
    v_count integer := 0;
    v_role record;
    v_auth record;
BEGIN
    IF p_module_id IS NULL OR p_project_id IS NULL OR p_requested_by_actor_id IS NULL OR p_authorization_decision_id IS NULL THEN RAISE EXCEPTION 'MDO plan requires module, project, requester, and authorization decision'; END IF;
    IF p_objective IS NULL OR char_length(btrim(p_objective)) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'MDO plan objective must contain 1 to 12000 characters'; END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' THEN RAISE EXCEPTION 'Invalid MDO idempotency key'; END IF;
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
    SELECT * INTO v_existing FROM comind.cm_mdo_plan WHERE idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF v_existing.module_id<>p_module_id OR v_existing.project_id<>p_project_id OR v_existing.requested_by_actor_id<>p_requested_by_actor_id OR v_existing.authorization_decision_id<>p_authorization_decision_id OR v_existing.objective<>p_objective THEN RAISE EXCEPTION 'MDO idempotency key conflicts with an existing plan'; END IF;
        SELECT count(*)::int INTO v_count FROM comind.cm_mdo_plan_task WHERE cm_mdo_plan_task.plan_id=v_existing.plan_id;
        RETURN QUERY SELECT v_existing.plan_id,false,v_count;
        RETURN;
    END IF;
    SELECT ar.requesting_actor_id,ar.project_id,ar.authority_level,ar.environment,ar.target_kind,ar.target_ref,ar.status AS request_status,ar.expires_at AS request_expires_at,ad.decision,ad.effective_until,c.capability_code INTO v_auth
    FROM comind.cm_foundry_authorization_decision ad JOIN comind.cm_foundry_authorization_request ar ON ar.authorization_request_id=ad.authorization_request_id JOIN comind.cm_foundry_capability c ON c.capability_id=ar.capability_id WHERE ad.authorization_decision_id=p_authorization_decision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MDO orchestration authorization decision was not found'; END IF;
    IF v_auth.decision<>'approved' OR v_auth.request_status NOT IN ('pending','approved') OR v_auth.capability_code<>'mdo.plan.orchestrate' OR v_auth.requesting_actor_id<>p_requested_by_actor_id OR v_auth.project_id IS DISTINCT FROM p_project_id OR v_auth.authority_level<>'C1' OR v_auth.environment<>'isolated' OR v_auth.target_kind<>'module' OR v_auth.target_ref IS DISTINCT FROM p_module_id::text OR (v_auth.request_expires_at IS NOT NULL AND v_auth.request_expires_at<=clock_timestamp()) OR (v_auth.effective_until IS NOT NULL AND v_auth.effective_until<=clock_timestamp()) THEN RAISE EXCEPTION 'MDO orchestration authorization does not match the exact requested envelope'; END IF;
    SELECT * INTO v_project FROM comind.cm_project WHERE project_id=p_project_id FOR SHARE;
    IF NOT FOUND OR v_project.status<>'active' THEN RAISE EXCEPTION 'MDO project must resolve to one active project'; END IF;
    SELECT * INTO v_module FROM comind.cm_module_registry WHERE module_id=p_module_id FOR UPDATE;
    IF NOT FOUND OR v_module.status<>'enabled' THEN RAISE EXCEPTION 'MDO module must resolve to one enabled module'; END IF;
    IF v_module.project_id IS NOT NULL AND v_module.project_id<>p_project_id THEN RAISE EXCEPTION 'MDO module is already bound to another project'; END IF;
    IF v_project.org_id IS NULL THEN RAISE EXCEPTION 'MDO project must have an organization scope'; END IF;
    IF v_module.project_id IS NULL THEN UPDATE comind.cm_module_registry SET project_id=p_project_id,updated_at=clock_timestamp() WHERE module_id=p_module_id; END IF;
    SELECT COALESCE(max(version),0)+1 INTO v_version FROM comind.cm_mdo_plan WHERE module_id=p_module_id;
    INSERT INTO comind.cm_mdo_plan(module_id,project_id,requested_by_actor_id,authorization_decision_id,objective,target_stage,status,version,idempotency_key) VALUES(p_module_id,p_project_id,p_requested_by_actor_id,p_authorization_decision_id,p_objective,'specified','queued',v_version,p_idempotency_key) RETURNING cm_mdo_plan.plan_id INTO v_plan_id;
    FOR v_role IN SELECT * FROM (VALUES
        (1,'module_planner','mdo.plan.analyze','module_specification','Produce the module purpose, user value, requirements, constraints, acceptance criteria, and implementation phases.'),
        (2,'architecture_analyst','mdo.plan.analyze','architecture_reuse_analysis','Map reusable CoMind infrastructure, architecture boundaries, data flows, interfaces, and adaptations before proposing new substrate.'),
        (3,'external_capability_scout','mdo.plan.research','external_capability_research','Research trustworthy standards, open source implementations, libraries, services, APIs, and relevant competitors before custom development.'),
        (4,'lessons_learned_analyst','mdo.plan.research','lessons_learned_analysis','Mine prior CoMind decisions, evidence, failures, workarounds, tests, and successful patterns that materially affect this module.'),
        (5,'dependency_analyst','mdo.plan.analyze','dependency_sequence_analysis','Identify prerequisites, shared capabilities, module dependencies, sequencing constraints, collision risks, and reconsideration triggers.'),
        (6,'governance_reviewer','mdo.plan.review','governance_review','Review authority, RuleBook, privacy, security, provenance, retention, data classification, cost, and production boundaries.'),
        (7,'assumption_validator','mdo.plan.review','assumption_red_team','Challenge assumptions, hidden coupling, scaling limits, failure modes, opportunity costs, and unnecessarily irreversible decisions.'),
        (8,'integration_reviewer','mdo.plan.review','integration_review','Review integration with ThreadKeeper, Foundry, Conversation History, CDE, RuleBook, RunBook, HUD, Digital Twin, and relevant modules.'),
        (9,'plan_synthesizer','mdo.plan.synthesize','implementation_plan','Reconcile planning and review evidence into one structured implementation plan with phases, tests, recovery, observability, risks, and open questions.'),
        (10,'portfolio_coordinator','mdo.plan.portfolio','portfolio_review','Compare the module plan against the CoMind portfolio for duplicate capability, common services, sequencing, conflicts, and consolidation opportunities.')) AS roles(sequence_no,role_code,capability_code,deliverable_type,role_instruction) ORDER BY sequence_no
    LOOP
        SELECT capability_id INTO v_capability_id FROM comind.cm_foundry_capability WHERE capability_code=v_role.capability_code AND max_authority='C1' AND cost_bearing=false AND adapter='mdo';
        IF NOT FOUND THEN RAISE EXCEPTION 'Required MDO capability % is missing or unsafe',v_role.capability_code; END IF;
        INSERT INTO comind.cm_task(project_id,title,description,status,priority) VALUES(p_project_id,'MDO '||v_role.sequence_no::text||': '||v_module.name::text||' / '||replace(v_role.role_code,'_',' '),v_role.role_instruction||E'\n\nPlan objective: '||p_objective,'todo',CASE WHEN v_role.sequence_no<=5 THEN 4 WHEN v_role.sequence_no<=8 THEN 5 ELSE 6 END) RETURNING task_id INTO v_task_id;
        INSERT INTO comind.cm_mdo_plan_task(task_id,plan_id,role_code,deliverable_type,required_capability_id,sequence_no) VALUES(v_task_id,v_plan_id,v_role.role_code,v_role.deliverable_type,v_capability_id,v_role.sequence_no);
        INSERT INTO comind.cm_foundry_work_lease(task_id,max_attempts) VALUES(v_task_id,3);
        v_count:=v_count+1;
    END LOOP;
    INSERT INTO comind.cm_audit_log(actor_id,action,target_table,target_id,details) VALUES(p_requested_by_actor_id,'mdo.plan.queued','cm_mdo_plan',v_plan_id,jsonb_build_object('module_id',p_module_id,'project_id',p_project_id,'authorization_decision_id',p_authorization_decision_id,'idempotency_key',p_idempotency_key,'task_count',v_count,'authority','C1','environment','isolated'));
    RETURN QUERY SELECT v_plan_id,true,v_count;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_foundry_claim_work(p_worker text,p_lease_seconds integer DEFAULT 60)
RETURNS TABLE(task_id uuid,lease_token uuid,fencing_epoch bigint,lease_expires_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_task uuid; v_prior text; v_epoch bigint; v_token uuid; v_expiry timestamptz;
BEGIN
    IF p_worker IS NULL OR char_length(p_worker) NOT BETWEEN 1 AND 128 OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'invalid claim parameters'; END IF;
    SELECT l.task_id,l.state INTO v_task,v_prior FROM comind.cm_foundry_work_lease l JOIN comind.cm_task t ON t.task_id=l.task_id
    WHERE (l.state='ready' OR (l.state='leased' AND l.lease_expires_at<=clock_timestamp())) AND l.not_before<=clock_timestamp() AND l.attempt_count<l.max_attempts AND t.status NOT IN ('blocked','done') AND NOT EXISTS(SELECT 1 FROM comind.cm_mdo_plan_task mpt WHERE mpt.task_id=l.task_id)
    ORDER BY t.priority,l.not_before,l.task_id FOR UPDATE OF l SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
    v_token:=gen_random_uuid(); v_expiry:=clock_timestamp()+make_interval(secs=>p_lease_seconds);
    UPDATE comind.cm_foundry_work_lease l SET state='leased',worker_instance_id=p_worker,lease_token=v_token,lease_expires_at=v_expiry,attempt_count=l.attempt_count+1,fencing_epoch=l.fencing_epoch+1,first_claimed_at=COALESCE(l.first_claimed_at,clock_timestamp()),last_claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE l.task_id=v_task RETURNING l.fencing_epoch INTO v_epoch;
    INSERT INTO comind.cm_foundry_work_lease_event(task_id,event_type,fencing_epoch,worker_instance_id) VALUES(v_task,CASE WHEN v_prior='leased' THEN 'reclaimed' ELSE 'claimed' END,v_epoch,p_worker);
    RETURN QUERY SELECT v_task,v_token,v_epoch,v_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_mdo_claim_work(p_profile_id uuid,p_worker text,p_lease_seconds integer DEFAULT 60)
RETURNS TABLE(task_id uuid,lease_token uuid,fencing_epoch bigint,lease_expires_at timestamptz,plan_id uuid,capability_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_task uuid; v_plan uuid; v_capability_code text; v_prior text; v_epoch bigint; v_token uuid; v_expiry timestamptz;
BEGIN
    IF p_profile_id IS NULL OR p_worker IS NULL OR char_length(p_worker) NOT BETWEEN 1 AND 128 OR p_lease_seconds NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'invalid MDO claim parameters'; END IF;
    IF NOT EXISTS(SELECT 1 FROM comind.cm_foundry_agent_profile p WHERE p.profile_id=p_profile_id AND p.status='active' AND substring(p.authority_ceiling from 2)::int>=1) THEN RAISE EXCEPTION 'MDO claimant must be one active C1-capable Foundry profile'; END IF;
    SELECT l.task_id,l.state,mpt.plan_id,c.capability_code INTO v_task,v_prior,v_plan,v_capability_code
    FROM comind.cm_foundry_work_lease l JOIN comind.cm_task t ON t.task_id=l.task_id JOIN comind.cm_mdo_plan_task mpt ON mpt.task_id=l.task_id JOIN comind.cm_mdo_plan mp ON mp.plan_id=mpt.plan_id JOIN comind.cm_foundry_capability c ON c.capability_id=mpt.required_capability_id
    WHERE (l.state='ready' OR (l.state='leased' AND l.lease_expires_at<=clock_timestamp())) AND l.not_before<=clock_timestamp() AND l.attempt_count<l.max_attempts AND t.status NOT IN ('blocked','done') AND mp.status IN ('queued','in_review')
      AND (mpt.sequence_no<=5 OR (mpt.sequence_no BETWEEN 6 AND 8 AND NOT EXISTS(SELECT 1 FROM comind.cm_mdo_plan_task prior LEFT JOIN comind.cm_mdo_contribution pc ON pc.task_id=prior.task_id WHERE prior.plan_id=mpt.plan_id AND prior.sequence_no BETWEEN 1 AND 5 AND pc.contribution_id IS NULL)) OR (mpt.sequence_no=9 AND NOT EXISTS(SELECT 1 FROM comind.cm_mdo_plan_task prior LEFT JOIN comind.cm_mdo_contribution pc ON pc.task_id=prior.task_id WHERE prior.plan_id=mpt.plan_id AND prior.sequence_no BETWEEN 1 AND 8 AND pc.contribution_id IS NULL)) OR (mpt.sequence_no=10 AND NOT EXISTS(SELECT 1 FROM comind.cm_mdo_plan_task prior LEFT JOIN comind.cm_mdo_contribution pc ON pc.task_id=prior.task_id WHERE prior.plan_id=mpt.plan_id AND prior.sequence_no BETWEEN 1 AND 9 AND pc.contribution_id IS NULL)))
      AND EXISTS(SELECT 1 FROM comind.cm_foundry_capability_grant g JOIN comind.cm_foundry_agent_profile p ON p.profile_id=g.profile_id WHERE g.profile_id=p_profile_id AND g.capability_id=mpt.required_capability_id AND g.org_id=p.org_id AND p.status='active' AND g.environment='isolated' AND substring(g.authority_ceiling from 2)::int>=1 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp()) AND (g.project_id IS NULL OR g.project_id=mp.project_id) AND (NOT(g.scope ? 'module_ids') OR (jsonb_typeof(g.scope->'module_ids')='array' AND (g.scope->'module_ids') ? mp.module_id::text)))
    ORDER BY t.priority,mpt.sequence_no,l.not_before,l.task_id FOR UPDATE OF l SKIP LOCKED LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;
    v_token:=gen_random_uuid(); v_expiry:=clock_timestamp()+make_interval(secs=>p_lease_seconds);
    UPDATE comind.cm_foundry_work_lease l SET state='leased',worker_instance_id=p_worker,lease_token=v_token,lease_expires_at=v_expiry,attempt_count=l.attempt_count+1,fencing_epoch=l.fencing_epoch+1,first_claimed_at=COALESCE(l.first_claimed_at,clock_timestamp()),last_claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE l.task_id=v_task RETURNING l.fencing_epoch INTO v_epoch;
    INSERT INTO comind.cm_foundry_work_lease_event(task_id,event_type,fencing_epoch,worker_instance_id) VALUES(v_task,CASE WHEN v_prior='leased' THEN 'reclaimed' ELSE 'claimed' END,v_epoch,p_worker);
    RETURN QUERY SELECT v_task,v_token,v_epoch,v_expiry,v_plan,v_capability_code;
END;
$$;

CREATE OR REPLACE FUNCTION comind.cm_mdo_submit_contribution(p_task_id uuid,p_profile_id uuid,p_execution_context_id uuid,p_payload jsonb,p_idempotency_key text,p_evidence_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_mapping record; v_existing comind.cm_mdo_contribution%ROWTYPE; v_contribution_id uuid; v_evidence_id uuid;
BEGIN
    IF p_task_id IS NULL OR p_profile_id IS NULL OR p_execution_context_id IS NULL THEN RAISE EXCEPTION 'MDO contribution requires task, profile, and execution context'; END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload='{}'::jsonb THEN RAISE EXCEPTION 'MDO contribution payload must be a non-empty JSON object'; END IF;
    IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' THEN RAISE EXCEPTION 'Invalid MDO contribution idempotency key'; END IF;
    PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key,0));
    SELECT * INTO v_existing FROM comind.cm_mdo_contribution WHERE idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF v_existing.task_id<>p_task_id OR v_existing.profile_id<>p_profile_id OR v_existing.execution_context_id<>p_execution_context_id OR v_existing.payload<>p_payload THEN RAISE EXCEPTION 'MDO contribution idempotency key conflicts with existing evidence'; END IF;
        RETURN v_existing.contribution_id;
    END IF;
    SELECT mpt.plan_id,mpt.role_code,mpt.required_capability_id,mp.project_id INTO v_mapping FROM comind.cm_mdo_plan_task mpt JOIN comind.cm_mdo_plan mp ON mp.plan_id=mpt.plan_id WHERE mpt.task_id=p_task_id AND mp.status IN ('queued','in_review');
    IF NOT FOUND THEN RAISE EXCEPTION 'MDO task is not attached to an active plan'; END IF;
    IF NOT EXISTS(SELECT 1 FROM comind.cm_foundry_execution_context ec JOIN comind.cm_foundry_authorization_decision ad ON ad.authorization_decision_id=ec.authorization_decision_id JOIN comind.cm_foundry_authorization_request ar ON ar.authorization_request_id=ad.authorization_request_id JOIN comind.cm_foundry_execution_outcome eo ON eo.execution_context_id=ec.execution_context_id WHERE ec.execution_context_id=p_execution_context_id AND ec.profile_id=p_profile_id AND ec.task_id=p_task_id AND ec.project_id=v_mapping.project_id AND ec.capability_id=v_mapping.required_capability_id AND ec.environment='isolated' AND ec.closed_at IS NOT NULL AND ad.decision='approved' AND ar.requesting_profile_id=p_profile_id AND ar.project_id=v_mapping.project_id AND ar.task_id=p_task_id AND ar.capability_id=v_mapping.required_capability_id AND ar.authority_level='C1' AND ar.environment='isolated' AND ar.target_kind='module_plan' AND ar.target_ref=v_mapping.plan_id::text AND ar.status IN ('pending','approved') AND ar.requested_at<=ec.created_at AND (ar.expires_at IS NULL OR ar.expires_at>ec.created_at) AND ad.decided_at<=ec.created_at AND (ad.effective_until IS NULL OR ad.effective_until>ec.created_at) AND eo.terminal_status='succeeded') THEN RAISE EXCEPTION 'MDO contribution requires one closed governed execution context matching task, profile, project, and capability'; END IF;
    IF EXISTS(SELECT 1 FROM comind.cm_mdo_contribution WHERE task_id=p_task_id) THEN RAISE EXCEPTION 'MDO task already has a submitted contribution'; END IF;
    INSERT INTO comind.cm_mdo_contribution(plan_id,task_id,profile_id,execution_context_id,role_code,payload,idempotency_key) VALUES(v_mapping.plan_id,p_task_id,p_profile_id,p_execution_context_id,v_mapping.role_code,p_payload,p_idempotency_key) RETURNING contribution_id INTO v_contribution_id;
    FOREACH v_evidence_id IN ARRAY COALESCE(p_evidence_ids,'{}'::uuid[]) LOOP
        IF NOT EXISTS(SELECT 1 FROM comind.cm_evidence e WHERE e.evidence_id=v_evidence_id) THEN RAISE EXCEPTION 'Referenced MDO evidence % does not exist',v_evidence_id; END IF;
        INSERT INTO comind.cm_mdo_contribution_evidence(contribution_id,evidence_id) VALUES(v_contribution_id,v_evidence_id);
    END LOOP;
    UPDATE comind.cm_mdo_plan SET status=CASE WHEN status='queued' THEN 'in_review' ELSE status END,updated_at=clock_timestamp() WHERE plan_id=v_mapping.plan_id;
    INSERT INTO comind.cm_audit_log(actor_id,action,target_table,target_id,details) SELECT p.actor_id,'mdo.contribution.submitted','cm_mdo_contribution',v_contribution_id,jsonb_build_object('plan_id',v_mapping.plan_id,'task_id',p_task_id,'profile_id',p_profile_id,'execution_context_id',p_execution_context_id,'role_code',v_mapping.role_code,'idempotency_key',p_idempotency_key,'evidence_count',COALESCE(array_length(p_evidence_ids,1),0),'authority','C1','environment','isolated') FROM comind.cm_foundry_agent_profile p WHERE p.profile_id=p_profile_id;
    RETURN v_contribution_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION comind.cm_reject_mdo_provenance_mutation(), comind.cm_mdo_enqueue_plan(uuid,uuid,uuid,uuid,text,text), comind.cm_foundry_claim_work(text,integer), comind.cm_mdo_claim_work(uuid,text,integer), comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION comind.cm_foundry_claim_work(text,integer), comind.cm_mdo_enqueue_plan(uuid,uuid,uuid,uuid,text,text), comind.cm_mdo_claim_work(uuid,text,integer), comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[]) TO service_role;

COMMIT;
