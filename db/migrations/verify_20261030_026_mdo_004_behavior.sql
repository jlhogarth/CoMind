\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_suffix text := replace(gen_random_uuid()::text, '-', '');
    v_org uuid;
    v_person uuid;
    v_service uuid;
    v_agent_actor uuid;
    v_agent uuid;
    v_profile uuid;
    v_project uuid;
    v_module uuid;
    v_orchestrate_cap uuid;
    v_dispose_cap uuid;
    v_orchestration_request uuid;
    v_orchestration_decision uuid;
    v_plan uuid;
    v_bad_successor uuid;
    v_good_successor uuid;
    v_evidence uuid;
    v_request uuid;
    v_accept_decision uuid;
    v_block_decision uuid;
    v_resume_decision uuid;
    v_second_accept_decision uuid;
    v_expired_decision uuid;
    v_service_decision uuid;
    v_supersede_decision uuid;
    v_created boolean;
    v_event uuid;
    v_status text;
    v_stage text;
    v_role record;
    v_execution uuid;
    v_contribution uuid;
    v_count integer;
BEGIN
    INSERT INTO comind.cm_org(name, slug)
    VALUES ('MDO-004 verifier ' || v_suffix, ('mdo004-verifier-' || v_suffix)::citext)
    RETURNING org_id INTO v_org;

    INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
    VALUES (v_org, 'person', 'mdo004-person-' || v_suffix, 'MDO-004 synthetic human reviewer')
    RETURNING actor_id INTO v_person;

    INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
    VALUES (v_org, 'service', 'mdo004-service-' || v_suffix, 'MDO-004 synthetic nonhuman service')
    RETURNING actor_id INTO v_service;

    INSERT INTO comind.cm_project(org_id, title, slug, status, created_by)
    VALUES (v_org, 'MDO-004 isolated verifier', ('mdo004-project-' || v_suffix)::citext, 'active', v_person)
    RETURNING project_id INTO v_project;

    INSERT INTO comind.cm_module_registry(
        name, description, status, lifecycle_stage, source_system, source_ref
    ) VALUES (
        ('MDO-004 synthetic module ' || v_suffix)::citext,
        'Rollback-only module for plan disposition verification.',
        'enabled', 'conceived', 'mdo004-verifier', 'github:issue:377'
    ) RETURNING module_id INTO v_module;

    SELECT capability_id INTO v_orchestrate_cap
    FROM comind.cm_foundry_capability WHERE capability_code='mdo.plan.orchestrate';
    SELECT capability_id INTO v_dispose_cap
    FROM comind.cm_foundry_capability WHERE capability_code='mdo.plan.disposition';

    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, status, expires_at
    ) VALUES (
        v_person, v_orchestrate_cap, v_project, 'C1', 'isolated',
        'module', v_module::text, 'MDO-004 synthetic plan creation', 'approved',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_orchestration_request;

    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (
        v_orchestration_request, 'approved', v_person,
        'MDO-004 rollback-only orchestration authority', clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_decision_id INTO v_orchestration_decision;

    SELECT plan_id INTO v_plan
    FROM comind.cm_mdo_enqueue_plan(
        v_module, v_project, v_person, v_orchestration_decision,
        'Verify governed human plan disposition without changing module maturity.',
        'mdo004-plan-' || v_suffix
    );

    UPDATE comind.cm_mdo_plan SET status='in_review' WHERE plan_id=v_plan;

    INSERT INTO comind.cm_evidence(title, source_type, source_ref, checksum, metadata)
    VALUES (
        'MDO-004 rollback-only human review evidence',
        'mdo_plan_disposition_review',
        'mdo004-verifier:' || v_suffix,
        repeat('a', 64),
        jsonb_build_object('synthetic', true, 'issue', 377, 'plan_id', v_plan)
    ) RETURNING evidence_id INTO v_evidence;

    -- Exact human C2 acceptance authorization. This is created before completeness is satisfied
    -- so the first acceptance call proves the completeness gate rather than an authority gate.
    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_person, v_dispose_cap, v_project, 'C2', 'isolated',
        'module_plan', v_plan::text, 'MDO-004 synthetic human acceptance',
        jsonb_build_array(v_evidence::text), 'approved', clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (
        v_request, 'approved', v_person, 'MDO-004 synthetic human approval',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_decision_id INTO v_accept_decision;

    BEGIN
        PERFORM * FROM comind.cm_mdo_dispose_plan(
            v_plan, 'accept', v_person, v_accept_decision,
            'Incomplete plan must not be accepted.', 'github:issue:377', NULL,
            'mdo004-incomplete-' || v_suffix, ARRAY[v_evidence]
        );
        RAISE EXCEPTION 'Expected incomplete plan acceptance to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO plan is incomplete:%' THEN RAISE; END IF;
    END;

    SELECT status INTO v_status FROM comind.cm_mdo_plan WHERE plan_id=v_plan;
    IF v_status <> 'in_review' THEN RAISE EXCEPTION 'Incomplete acceptance mutated plan status'; END IF;

    -- Nonhuman service authority must fail even with otherwise exact C2 scope.
    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_service, v_dispose_cap, v_project, 'C2', 'isolated',
        'module_plan', v_plan::text, 'MDO-004 service negative proof',
        jsonb_build_array(v_evidence::text), 'approved', clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (
        v_request, 'approved', v_service, 'Synthetic nonhuman negative proof',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_decision_id INTO v_service_decision;

    BEGIN
        PERFORM * FROM comind.cm_mdo_dispose_plan(
            v_plan, 'block', v_service, v_service_decision,
            'Service actors cannot dispose plans.', 'github:issue:377', NULL,
            'mdo004-service-negative-' || v_suffix, ARRAY[v_evidence]
        );
        RAISE EXCEPTION 'Expected nonhuman disposition to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO plan disposition requires an attributable human person actor%' THEN RAISE; END IF;
    END;

    -- Expired human authorization must fail closed.
    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, requested_at, expires_at
    ) VALUES (
        v_person, v_dispose_cap, v_project, 'C2', 'isolated',
        'module_plan', v_plan::text, 'MDO-004 expired negative proof',
        jsonb_build_array(v_evidence::text), 'approved',
        clock_timestamp() - interval '10 minutes', clock_timestamp() - interval '5 minutes'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis,
        decided_at, effective_until
    ) VALUES (
        v_request, 'approved', v_person, 'Synthetic expired negative proof',
        clock_timestamp() - interval '9 minutes', clock_timestamp() - interval '5 minutes'
    ) RETURNING authorization_decision_id INTO v_expired_decision;

    BEGIN
        PERFORM * FROM comind.cm_mdo_dispose_plan(
            v_plan, 'block', v_person, v_expired_decision,
            'Expired authority cannot mutate a plan.', 'github:issue:377', NULL,
            'mdo004-expired-negative-' || v_suffix, ARRAY[v_evidence]
        );
        RAISE EXCEPTION 'Expected expired authorization to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO disposition authorization does not match the exact C2 plan envelope%' THEN RAISE; END IF;
    END;

    -- Block and resume are explicit, evidence-bearing state changes.
    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_person, v_dispose_cap, v_project, 'C2', 'isolated', 'module_plan', v_plan::text,
        'MDO-004 block proof', jsonb_build_array(v_evidence::text), 'approved',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (v_request, 'approved', v_person, 'Synthetic block approval', clock_timestamp() + interval '1 hour')
    RETURNING authorization_decision_id INTO v_block_decision;

    SELECT created INTO v_created FROM comind.cm_mdo_dispose_plan(
        v_plan, 'block', v_person, v_block_decision,
        'Pause review while preserving all work.', 'github:issue:377', NULL,
        'mdo004-block-' || v_suffix, ARRAY[v_evidence]
    );
    IF NOT v_created THEN RAISE EXCEPTION 'Block event was not created'; END IF;

    SELECT status INTO v_status FROM comind.cm_mdo_plan WHERE plan_id=v_plan;
    IF v_status <> 'blocked' THEN RAISE EXCEPTION 'Block did not project blocked status'; END IF;

    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_person, v_dispose_cap, v_project, 'C2', 'isolated', 'module_plan', v_plan::text,
        'MDO-004 resume proof', jsonb_build_array(v_evidence::text), 'approved',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (v_request, 'approved', v_person, 'Synthetic resume approval', clock_timestamp() + interval '1 hour')
    RETURNING authorization_decision_id INTO v_resume_decision;

    SELECT created INTO v_created FROM comind.cm_mdo_dispose_plan(
        v_plan, 'resume_review', v_person, v_resume_decision,
        'Resume explicit human review.', 'github:issue:377', NULL,
        'mdo004-resume-' || v_suffix, ARRAY[v_evidence]
    );
    IF NOT v_created THEN RAISE EXCEPTION 'Resume event was not created'; END IF;

    -- Satisfy the ten-role acceptance preconditions with rollback-only synthetic evidence.
    INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
    VALUES (v_org, 'agent', 'mdo004-agent-' || v_suffix, 'MDO-004 synthetic worker')
    RETURNING actor_id INTO v_agent_actor;
    INSERT INTO comind.cm_agent(org_id, name, description)
    VALUES (v_org, ('MDO-004 synthetic worker ' || v_suffix)::citext, 'Rollback-only worker identity')
    RETURNING agent_id INTO v_agent;
    INSERT INTO comind.cm_foundry_agent_profile(
        agent_id, actor_id, org_id, role_code, display_name,
        authority_floor, authority_ceiling, instruction_version,
        runtime_defaults, competencies, status, activated_at
    ) VALUES (
        v_agent, v_agent_actor, v_org, 'mdo004_verifier', 'MDO-004 synthetic worker',
        'C0', 'C1', 'mdo-004-verifier-v1', '{"provider":"none","environment":"isolated"}'::jsonb,
        '["verification"]'::jsonb, 'active', clock_timestamp()
    ) RETURNING profile_id INTO v_profile;

    FOR v_role IN
        SELECT mpt.task_id, mpt.role_code, mpt.required_capability_id
        FROM comind.cm_mdo_plan_task mpt
        WHERE mpt.plan_id=v_plan
        ORDER BY mpt.sequence_no
    LOOP
        UPDATE comind.cm_task SET status='done' WHERE task_id=v_role.task_id;
        UPDATE comind.cm_foundry_work_lease
        SET state='completed', worker_instance_id=NULL, lease_token=NULL,
            lease_expires_at=NULL, updated_at=clock_timestamp()
        WHERE task_id=v_role.task_id;

        INSERT INTO comind.cm_foundry_execution_context(
            profile_id, project_id, task_id, capability_id, environment,
            execution_kind, idempotency_key, context, created_at, closed_at
        ) VALUES (
            v_profile, v_project, v_role.task_id, v_role.required_capability_id, 'isolated',
            'deliberation', 'mdo004-exec-' || v_role.task_id::text,
            '{"synthetic":true,"provider_call":false}'::jsonb,
            clock_timestamp(), clock_timestamp()
        ) RETURNING execution_context_id INTO v_execution;

        INSERT INTO comind.cm_foundry_execution_outcome(execution_context_id, terminal_status, summary)
        VALUES (v_execution, 'succeeded', 'Rollback-only MDO-004 completeness fixture.');

        INSERT INTO comind.cm_mdo_contribution(
            plan_id, task_id, profile_id, execution_context_id, role_code,
            payload, idempotency_key
        ) VALUES (
            v_plan, v_role.task_id, v_profile, v_execution, v_role.role_code,
            jsonb_build_object('synthetic', true, 'issue', 377),
            'mdo004-contribution-' || v_role.task_id::text
        ) RETURNING contribution_id INTO v_contribution;

        INSERT INTO comind.cm_mdo_contribution_evidence(contribution_id, evidence_id)
        VALUES (v_contribution, v_evidence);
    END LOOP;

    SELECT lifecycle_stage INTO v_stage FROM comind.cm_module_registry WHERE module_id=v_module;
    IF v_stage <> 'conceived' THEN RAISE EXCEPTION 'Fixture module maturity drifted before acceptance'; END IF;

    SELECT disposition_event_id, created INTO v_event, v_created
    FROM comind.cm_mdo_dispose_plan(
        v_plan, 'accept', v_person, v_accept_decision,
        'Complete evidence-bearing plan accepted by explicit human review.',
        'github:issue:377', NULL, 'mdo004-accept-' || v_suffix, ARRAY[v_evidence]
    );
    IF NOT v_created OR v_event IS NULL THEN RAISE EXCEPTION 'Complete plan acceptance did not create an event'; END IF;

    SELECT status INTO v_status FROM comind.cm_mdo_plan WHERE plan_id=v_plan;
    IF v_status <> 'accepted' THEN RAISE EXCEPTION 'Accepted event did not project accepted plan status'; END IF;
    SELECT lifecycle_stage INTO v_stage FROM comind.cm_module_registry WHERE module_id=v_module;
    IF v_stage <> 'conceived' THEN RAISE EXCEPTION 'Plan acceptance changed module maturity'; END IF;

    -- Exact replay is idempotent.
    SELECT created INTO v_created FROM comind.cm_mdo_dispose_plan(
        v_plan, 'accept', v_person, v_accept_decision,
        'Complete evidence-bearing plan accepted by explicit human review.',
        'github:issue:377', NULL, 'mdo004-accept-' || v_suffix, ARRAY[v_evidence]
    );
    IF v_created THEN RAISE EXCEPTION 'Idempotent acceptance replay created duplicate history'; END IF;

    BEGIN
        PERFORM * FROM comind.cm_mdo_dispose_plan(
            v_plan, 'accept', v_person, v_accept_decision,
            'Conflicting replay rationale.', 'github:issue:377', NULL,
            'mdo004-accept-' || v_suffix, ARRAY[v_evidence]
        );
        RAISE EXCEPTION 'Expected conflicting idempotent replay to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO disposition idempotency key conflicts with existing event%' THEN RAISE; END IF;
    END;

    -- A second acceptance identity must fail because the plan is no longer in_review.
    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_person, v_dispose_cap, v_project, 'C2', 'isolated', 'module_plan', v_plan::text,
        'MDO-004 duplicate accept negative proof', jsonb_build_array(v_evidence::text), 'approved',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (v_request, 'approved', v_person, 'Synthetic duplicate accept approval', clock_timestamp() + interval '1 hour')
    RETURNING authorization_decision_id INTO v_second_accept_decision;

    BEGIN
        PERFORM * FROM comind.cm_mdo_dispose_plan(
            v_plan, 'accept', v_person, v_second_accept_decision,
            'Duplicate acceptance must fail.', 'github:issue:377', NULL,
            'mdo004-second-accept-' || v_suffix, ARRAY[v_evidence]
        );
        RAISE EXCEPTION 'Expected second acceptance to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'Only an in_review MDO plan can be accepted%' THEN RAISE; END IF;
    END;

    -- Historical events are immutable.
    BEGIN
        UPDATE comind.cm_mdo_plan_disposition_event
        SET rationale='illegal mutation' WHERE disposition_event_id=v_event;
        RAISE EXCEPTION 'Expected disposition event mutation to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO provenance is append-only%' THEN RAISE; END IF;
    END;

    -- Supersession rejects a nonaccepted successor, then accepts a later accepted same-module successor.
    INSERT INTO comind.cm_mdo_plan(
        module_id, project_id, requested_by_actor_id, authorization_decision_id,
        objective, target_stage, status, version, idempotency_key
    ) VALUES (
        v_module, v_project, v_person, v_orchestration_decision,
        'Invalid nonaccepted successor fixture.', 'specified', 'in_review', 2,
        'mdo004-bad-successor-' || v_suffix
    ) RETURNING plan_id INTO v_bad_successor;

    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_person, v_dispose_cap, v_project, 'C2', 'isolated', 'module_plan', v_plan::text,
        'MDO-004 supersession proof', jsonb_build_array(v_evidence::text), 'approved',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (v_request, 'approved', v_person, 'Synthetic supersession approval', clock_timestamp() + interval '1 hour')
    RETURNING authorization_decision_id INTO v_supersede_decision;

    BEGIN
        PERFORM * FROM comind.cm_mdo_dispose_plan(
            v_plan, 'supersede', v_person, v_supersede_decision,
            'A nonaccepted successor must fail.', 'github:issue:377', v_bad_successor,
            'mdo004-supersede-' || v_suffix, ARRAY[v_evidence]
        );
        RAISE EXCEPTION 'Expected nonaccepted successor to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO successor must be a later accepted plan for the same module%' THEN RAISE; END IF;
    END;

    INSERT INTO comind.cm_mdo_plan(
        module_id, project_id, requested_by_actor_id, authorization_decision_id,
        objective, target_stage, status, version, idempotency_key
    ) VALUES (
        v_module, v_project, v_person, v_orchestration_decision,
        'Valid later accepted successor fixture.', 'specified', 'accepted', 3,
        'mdo004-good-successor-' || v_suffix
    ) RETURNING plan_id INTO v_good_successor;

    SELECT created INTO v_created FROM comind.cm_mdo_dispose_plan(
        v_plan, 'supersede', v_person, v_supersede_decision,
        'Accepted plan superseded by a later accepted plan for the same module.',
        'github:issue:377', v_good_successor,
        'mdo004-supersede-' || v_suffix, ARRAY[v_evidence]
    );
    IF NOT v_created THEN RAISE EXCEPTION 'Valid supersession did not create an event'; END IF;

    SELECT status INTO v_status FROM comind.cm_mdo_plan WHERE plan_id=v_plan;
    IF v_status <> 'superseded' THEN RAISE EXCEPTION 'Supersession did not project superseded status'; END IF;
    SELECT lifecycle_stage INTO v_stage FROM comind.cm_module_registry WHERE module_id=v_module;
    IF v_stage <> 'conceived' THEN RAISE EXCEPTION 'Supersession changed module maturity'; END IF;

    SELECT count(*)::int INTO v_count
    FROM comind.cm_mdo_plan_disposition_event WHERE plan_id=v_plan;
    IF v_count <> 4 THEN
        RAISE EXCEPTION 'Expected block, resume, accept, and supersede event history; found %', v_count;
    END IF;
END;
$$;

ROLLBACK;

SELECT 'pass' AS result,
       'mdo-004-behavior' AS lane,
       'incomplete_rejected=true' AS incomplete,
       'person_only=true' AS human,
       'expired_rejected=true' AS expiry,
       'block_resume=true' AS review_lifecycle,
       'accept_replay=true' AS acceptance,
       'immutable=true' AS history,
       'supersession=true' AS supersession,
       'maturity_unchanged=true' AS maturity;
