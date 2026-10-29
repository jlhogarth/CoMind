-- MDO-001 verification.
-- Raises on any structural, authorization, dispatch, idempotency, or maturity-boundary failure.

DO $$
DECLARE
    v_table text;
    v_rls boolean;
    v_cap_count integer;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cm_module_registry',
        'cm_mdo_plan',
        'cm_mdo_plan_task',
        'cm_mdo_contribution',
        'cm_mdo_contribution_evidence'
    ] LOOP
        SELECT c.relrowsecurity
        INTO v_rls
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'comind' AND c.relname = v_table;

        IF v_rls IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'MDO RLS is not enabled on %', v_table;
        END IF;
    END LOOP;

    SELECT count(*) INTO v_cap_count
    FROM comind.cm_foundry_capability
    WHERE capability_code IN (
        've.lifecycle.activate',
        've.lifecycle.suspend',
        've.lifecycle.retire'
    );
    IF v_cap_count <> 3 THEN
        RAISE EXCEPTION 'Expected 3 VE lifecycle capabilities, found %', v_cap_count;
    END IF;

    SELECT count(*) INTO v_cap_count
    FROM comind.cm_foundry_capability
    WHERE capability_code IN (
        'mdo.plan.orchestrate',
        'mdo.plan.analyze',
        'mdo.plan.research',
        'mdo.plan.review',
        'mdo.plan.synthesize',
        'mdo.plan.portfolio'
    )
      AND max_authority = 'C1'
      AND cost_bearing = false
      AND adapter = 'mdo';
    IF v_cap_count <> 6 THEN
        RAISE EXCEPTION 'Expected 6 bounded MDO capabilities, found %', v_cap_count;
    END IF;

    IF has_function_privilege('anon', 'comind.cm_mdo_enqueue_plan(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'comind.cm_mdo_enqueue_plan(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'comind.cm_mdo_claim_work(uuid,text,integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'comind.cm_mdo_claim_work(uuid,text,integer)', 'EXECUTE')
       OR has_function_privilege('anon', 'comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])', 'EXECUTE')
       OR has_function_privilege('authenticated', 'comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'MDO client role function execution must remain revoked';
    END IF;

    IF NOT has_function_privilege('service_role', 'comind.cm_mdo_enqueue_plan(uuid,uuid,uuid,uuid,text,text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'comind.cm_mdo_claim_work(uuid,text,integer)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'comind.cm_mdo_submit_contribution(uuid,uuid,uuid,jsonb,text,uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'MDO service_role function execution is incomplete';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM comind.cm_foundry_capability_grant g
        JOIN comind.cm_foundry_capability c ON c.capability_id = g.capability_id
        WHERE c.capability_code LIKE 'mdo.%'
    ) THEN
        RAISE EXCEPTION 'MDO migration must not auto-grant planning capabilities';
    END IF;
END;
$$;

BEGIN;

DO $$
DECLARE
    v_suffix text := replace(gen_random_uuid()::text, '-', '');
    v_org uuid;
    v_requester uuid;
    v_agent_actor uuid;
    v_synth_actor uuid;
    v_agent uuid;
    v_synth_agent uuid;
    v_project uuid;
    v_module uuid;
    v_orchestrate_cap uuid;
    v_analyze_cap uuid;
    v_synth_cap uuid;
    v_profile uuid;
    v_synth_profile uuid;
    v_orchestration_request uuid;
    v_orchestration_decision uuid;
    v_plan uuid;
    v_task uuid;
    v_lease_token uuid;
    v_epoch bigint;
    v_execution_request uuid;
    v_execution_decision uuid;
    v_execution_context uuid;
    v_contribution uuid;
    v_count integer;
    v_created boolean;
    v_task_count integer;
    v_stage text;
    v_plan_status text;
BEGIN
    INSERT INTO comind.cm_org(name, slug)
    VALUES ('MDO verifier ' || v_suffix, ('mdo-verifier-' || v_suffix)::citext)
    RETURNING org_id INTO v_org;

    INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
    VALUES (v_org, 'person', 'mdo-requester-' || v_suffix, 'MDO synthetic requester')
    RETURNING actor_id INTO v_requester;

    INSERT INTO comind.cm_project(org_id, title, slug, status, created_by)
    VALUES (v_org, 'MDO isolated verifier', ('mdo-project-' || v_suffix)::citext, 'active', v_requester)
    RETURNING project_id INTO v_project;

    INSERT INTO comind.cm_module_registry(name, description, status, lifecycle_stage, source_system, source_ref)
    VALUES (
        ('MDO synthetic module ' || v_suffix)::citext,
        'Synthetic rollback-only module for MDO-001 verification.',
        'enabled',
        'conceived',
        'mdo-verifier',
        '#313'
    )
    RETURNING module_id INTO v_module;

    SELECT capability_id INTO v_orchestrate_cap
    FROM comind.cm_foundry_capability
    WHERE capability_code = 'mdo.plan.orchestrate';

    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id,
        authority_level, environment, target_kind, target_ref,
        reason, status, expires_at
    )
    VALUES (
        v_requester, v_orchestrate_cap, v_project,
        'C1', 'isolated', 'module', v_module::text,
        'MDO-001 rollback-only orchestration verification',
        'approved',
        clock_timestamp() + interval '1 hour'
    )
    RETURNING authorization_request_id INTO v_orchestration_request;

    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id,
        decision_basis, effective_until
    )
    VALUES (
        v_orchestration_request, 'approved', v_requester,
        'MDO-001 synthetic isolated verifier',
        clock_timestamp() + interval '1 hour'
    )
    RETURNING authorization_decision_id INTO v_orchestration_decision;

    SELECT e.plan_id, e.created, e.task_count
    INTO v_plan, v_created, v_task_count
    FROM comind.cm_mdo_enqueue_plan(
        v_module,
        v_project,
        v_requester,
        v_orchestration_decision,
        'Produce a complete governed implementation plan for the synthetic verification module.',
        'mdo-verifier-plan-' || v_suffix
    ) e;

    IF NOT v_created OR v_task_count <> 10 THEN
        RAISE EXCEPTION 'MDO enqueue did not create exactly one 10-role plan';
    END IF;

    SELECT e.created, e.task_count
    INTO v_created, v_task_count
    FROM comind.cm_mdo_enqueue_plan(
        v_module,
        v_project,
        v_requester,
        v_orchestration_decision,
        'Produce a complete governed implementation plan for the synthetic verification module.',
        'mdo-verifier-plan-' || v_suffix
    ) e;

    IF v_created OR v_task_count <> 10 THEN
        RAISE EXCEPTION 'MDO enqueue idempotent replay did not reuse the existing plan';
    END IF;

    SELECT count(*)::int INTO v_count
    FROM comind.cm_mdo_plan
    WHERE module_id = v_module;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'MDO idempotent replay duplicated the plan';
    END IF;

    SELECT count(*)::int INTO v_count
    FROM comind.cm_mdo_plan_task
    WHERE plan_id = v_plan;
    IF v_count <> 10 THEN
        RAISE EXCEPTION 'MDO plan must contain exactly 10 planning tasks';
    END IF;

    SELECT count(*)::int INTO v_count
    FROM comind.cm_foundry_claim_work('mdo-generic-negative-' || v_suffix, 60);
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Legacy generic claimant must not claim MDO work';
    END IF;

    INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
    VALUES (v_org, 'agent', 'mdo-agent-' || v_suffix, 'MDO synthetic module planner')
    RETURNING actor_id INTO v_agent_actor;

    INSERT INTO comind.cm_agent(org_id, name, description)
    VALUES (v_org, ('MDO synthetic module planner ' || v_suffix)::citext, 'Rollback-only MDO verifier profile')
    RETURNING agent_id INTO v_agent;

    INSERT INTO comind.cm_foundry_agent_profile(
        agent_id, actor_id, org_id, role_code, display_name,
        authority_floor, authority_ceiling, instruction_version,
        runtime_defaults, competencies, status, activated_at
    )
    VALUES (
        v_agent, v_agent_actor, v_org, 'module_planner', 'MDO synthetic module planner',
        'C0', 'C1', 'mdo-001-verifier-v1',
        '{"provider":"none","environment":"isolated"}'::jsonb,
        '["module_planning"]'::jsonb,
        'active', clock_timestamp()
    )
    RETURNING profile_id INTO v_profile;

    SELECT count(*)::int INTO v_count
    FROM comind.cm_mdo_claim_work(v_profile, 'mdo-unauthorized-' || v_suffix, 60);
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'MDO claimant without an active capability grant received work';
    END IF;

    SELECT capability_id INTO v_analyze_cap
    FROM comind.cm_foundry_capability
    WHERE capability_code = 'mdo.plan.analyze';

    INSERT INTO comind.cm_foundry_capability_grant(
        profile_id, capability_id, org_id, project_id,
        environment, authority_ceiling, scope,
        granted_by_actor_id, grant_reason, expires_at
    )
    VALUES (
        v_profile, v_analyze_cap, v_org, v_project,
        'isolated', 'C1',
        jsonb_build_object('module_ids', jsonb_build_array(v_module::text)),
        v_requester,
        'MDO-001 rollback-only capability-aware dispatch proof',
        clock_timestamp() + interval '1 hour'
    );

    SELECT c.task_id, c.lease_token, c.fencing_epoch
    INTO v_task, v_lease_token, v_epoch
    FROM comind.cm_mdo_claim_work(v_profile, 'mdo-authorized-' || v_suffix, 60) c;

    IF v_task IS NULL THEN
        RAISE EXCEPTION 'Authorized MDO planner did not receive an eligible planning task';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM comind.cm_mdo_plan_task pt
        WHERE pt.task_id = v_task
          AND pt.plan_id = v_plan
          AND pt.role_code = 'module_planner'
          AND pt.sequence_no = 1
          AND pt.required_capability_id = v_analyze_cap
    ) THEN
        RAISE EXCEPTION 'MDO capability-aware dispatch returned the wrong task';
    END IF;

    INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
    VALUES (v_org, 'agent', 'mdo-synth-' || v_suffix, 'MDO synthetic plan synthesizer')
    RETURNING actor_id INTO v_synth_actor;

    INSERT INTO comind.cm_agent(org_id, name, description)
    VALUES (v_org, ('MDO synthetic plan synthesizer ' || v_suffix)::citext, 'Rollback-only MDO phase-gating verifier')
    RETURNING agent_id INTO v_synth_agent;

    INSERT INTO comind.cm_foundry_agent_profile(
        agent_id, actor_id, org_id, role_code, display_name,
        authority_floor, authority_ceiling, instruction_version,
        runtime_defaults, competencies, status, activated_at
    )
    VALUES (
        v_synth_agent, v_synth_actor, v_org, 'plan_synthesizer', 'MDO synthetic plan synthesizer',
        'C0', 'C1', 'mdo-001-verifier-v1',
        '{"provider":"none","environment":"isolated"}'::jsonb,
        '["plan_synthesis"]'::jsonb,
        'active', clock_timestamp()
    )
    RETURNING profile_id INTO v_synth_profile;

    SELECT capability_id INTO v_synth_cap
    FROM comind.cm_foundry_capability
    WHERE capability_code = 'mdo.plan.synthesize';

    INSERT INTO comind.cm_foundry_capability_grant(
        profile_id, capability_id, org_id, project_id,
        environment, authority_ceiling, scope,
        granted_by_actor_id, grant_reason, expires_at
    )
    VALUES (
        v_synth_profile, v_synth_cap, v_org, v_project,
        'isolated', 'C1',
        jsonb_build_object('module_ids', jsonb_build_array(v_module::text)),
        v_requester,
        'MDO-001 rollback-only synthesis phase-gating proof',
        clock_timestamp() + interval '1 hour'
    );

    SELECT count(*)::int INTO v_count
    FROM comind.cm_mdo_claim_work(v_synth_profile, 'mdo-synth-blocked-' || v_suffix, 60);
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Plan synthesizer received work before prerequisite planning and reviews completed';
    END IF;

    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_profile_id, requesting_actor_id, capability_id,
        project_id, task_id, authority_level, environment,
        target_kind, target_ref, reason, status, expires_at
    )
    VALUES (
        v_profile, v_agent_actor, v_analyze_cap,
        v_project, v_task, 'C1', 'isolated',
        'module_plan', v_plan::text,
        'MDO-001 synthetic governed execution proof',
        'approved',
        clock_timestamp() + interval '1 hour'
    )
    RETURNING authorization_request_id INTO v_execution_request;

    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id,
        decision_basis, effective_until
    )
    VALUES (
        v_execution_request, 'approved', v_requester,
        'MDO-001 rollback-only execution authorization',
        clock_timestamp() + interval '1 hour'
    )
    RETURNING authorization_decision_id INTO v_execution_decision;

    INSERT INTO comind.cm_foundry_execution_context(
        profile_id, project_id, task_id, capability_id,
        authorization_decision_id, environment, execution_kind,
        idempotency_key, context, created_at, closed_at
    )
    VALUES (
        v_profile, v_project, v_task, v_analyze_cap,
        v_execution_decision, 'isolated', 'deliberation',
        'mdo-verifier-exec-' || v_suffix,
        '{"synthetic":true,"provider_call":false}'::jsonb,
        clock_timestamp(), clock_timestamp()
    )
    RETURNING execution_context_id INTO v_execution_context;

    INSERT INTO comind.cm_foundry_execution_outcome(
        execution_context_id, terminal_status, summary
    )
    VALUES (
        v_execution_context,
        'succeeded',
        'Synthetic MDO planning contribution generated without a provider call.'
    );

    SELECT comind.cm_mdo_submit_contribution(
        v_task,
        v_profile,
        v_execution_context,
        jsonb_build_object(
            'purpose', 'Verify governed MDO contribution capture.',
            'requirements', jsonb_build_array('capability-aware dispatch', 'immutable contribution provenance'),
            'provider_call', false
        ),
        'mdo-verifier-contribution-' || v_suffix,
        '{}'::uuid[]
    )
    INTO v_contribution;

    IF v_contribution IS NULL THEN
        RAISE EXCEPTION 'MDO contribution was not recorded';
    END IF;

    SELECT status INTO v_plan_status
    FROM comind.cm_mdo_plan
    WHERE plan_id = v_plan;
    IF v_plan_status <> 'in_review' THEN
        RAISE EXCEPTION 'MDO plan did not move to in_review after first governed contribution';
    END IF;

    SELECT lifecycle_stage INTO v_stage
    FROM comind.cm_module_registry
    WHERE module_id = v_module;
    IF v_stage <> 'conceived' THEN
        RAISE EXCEPTION 'MDO-001 must not silently promote module maturity';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM comind.cm_audit_log
        WHERE action = 'mdo.plan.queued'
          AND target_id = v_plan
    ) OR NOT EXISTS (
        SELECT 1
        FROM comind.cm_audit_log
        WHERE action = 'mdo.contribution.submitted'
          AND target_id = v_contribution
    ) THEN
        RAISE EXCEPTION 'MDO durable audit evidence is incomplete';
    END IF;

    IF NOT comind.cm_foundry_finish_work(
        v_task,
        'mdo-authorized-' || v_suffix,
        v_lease_token,
        v_epoch,
        true
    ) THEN
        RAISE EXCEPTION 'MDO lease could not be finalized with its fencing token';
    END IF;
END;
$$;

ROLLBACK;

SELECT 'pass|mdo-001|capabilities=9|roles=10|generic_claim_excluded=true|capability_claim=true|phase_gate=true|contribution=true|maturity_unchanged=true';
