\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    v_suffix text := replace(gen_random_uuid()::text, '-', '');
    v_org uuid;
    v_person uuid;
    v_service uuid;
    v_project uuid;
    v_module uuid;
    v_orchestrate_cap uuid;
    v_dispose_cap uuid;
    v_maturity_cap uuid;
    v_request uuid;
    v_orchestration_decision uuid;
    v_accept_decision uuid;
    v_maturity_decision uuid;
    v_service_decision uuid;
    v_expired_decision uuid;
    v_second_decision uuid;
    v_plan uuid;
    v_accept_evidence uuid;
    v_unrelated_evidence uuid;
    v_accept_event uuid;
    v_lifecycle_event uuid;
    v_created boolean;
    v_stage text;
    v_plan_status text;
    v_count integer;
    v_task_before integer;
    v_task_after integer;
    v_plan_task_before integer;
    v_plan_task_after integer;
    v_lease_before integer;
    v_lease_after integer;
    v_execution_before integer;
    v_execution_after integer;
    v_contribution_before integer;
    v_contribution_after integer;
BEGIN
    INSERT INTO comind.cm_org(name, slug)
    VALUES ('MDO-005 verifier ' || v_suffix, ('mdo005-verifier-' || v_suffix)::citext)
    RETURNING org_id INTO v_org;

    INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
    VALUES (v_org, 'person', 'mdo005-person-' || v_suffix, 'MDO-005 synthetic human authority')
    RETURNING actor_id INTO v_person;

    INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
    VALUES (v_org, 'service', 'mdo005-service-' || v_suffix, 'MDO-005 synthetic nonhuman service')
    RETURNING actor_id INTO v_service;

    INSERT INTO comind.cm_project(org_id, title, slug, status, created_by)
    VALUES (v_org, 'MDO-005 isolated verifier', ('mdo005-project-' || v_suffix)::citext, 'active', v_person)
    RETURNING project_id INTO v_project;

    INSERT INTO comind.cm_module_registry(
        name, description, status, lifecycle_stage, source_system, source_ref
    ) VALUES (
        ('MDO-005 synthetic module ' || v_suffix)::citext,
        'Rollback-only module for governed maturity verification.',
        'enabled', 'conceived', 'mdo005-verifier', 'github:issue:407'
    ) RETURNING module_id INTO v_module;

    SELECT capability_id INTO v_orchestrate_cap
    FROM comind.cm_foundry_capability WHERE capability_code='mdo.plan.orchestrate';
    SELECT capability_id INTO v_dispose_cap
    FROM comind.cm_foundry_capability WHERE capability_code='mdo.plan.disposition';
    SELECT capability_id INTO v_maturity_cap
    FROM comind.cm_foundry_capability WHERE capability_code='mdo.module.maturity_transition';

    IF v_orchestrate_cap IS NULL OR v_dispose_cap IS NULL OR v_maturity_cap IS NULL THEN
        RAISE EXCEPTION 'Required MDO capabilities were not resolved';
    END IF;

    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, status, expires_at
    ) VALUES (
        v_person, v_orchestrate_cap, v_project, 'C1', 'isolated',
        'module', v_module::text, 'MDO-005 synthetic plan creation', 'approved',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (
        v_request, 'approved', v_person, 'MDO-005 rollback-only orchestration authority',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_decision_id INTO v_orchestration_decision;

    SELECT plan_id INTO v_plan
    FROM comind.cm_mdo_enqueue_plan(
        v_module, v_project, v_person, v_orchestration_decision,
        'Specify the synthetic module under MDO-005 verification.',
        'mdo005-plan-' || v_suffix
    );

    INSERT INTO comind.cm_evidence(title, source_type, source_ref, checksum, metadata)
    VALUES (
        'MDO-005 synthetic accepted-plan evidence',
        'mdo_plan_disposition_review',
        'mdo005-accept-evidence:' || v_suffix,
        repeat('a', 64),
        jsonb_build_object('synthetic', true, 'issue', 407, 'plan_id', v_plan)
    ) RETURNING evidence_id INTO v_accept_evidence;

    INSERT INTO comind.cm_evidence(title, source_type, source_ref, checksum, metadata)
    VALUES (
        'MDO-005 unrelated canonical evidence',
        'mdo_maturity_negative_proof',
        'mdo005-unrelated-evidence:' || v_suffix,
        repeat('b', 64),
        jsonb_build_object('synthetic', true, 'issue', 407, 'unrelated', true)
    ) RETURNING evidence_id INTO v_unrelated_evidence;

    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_person, v_maturity_cap, v_project, 'C2', 'isolated',
        'module', v_module::text, 'MDO-005 exact module maturity authority',
        jsonb_build_array(v_accept_evidence::text), 'approved', clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (
        v_request, 'approved', v_person, 'MDO-005 synthetic human maturity approval',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_decision_id INTO v_maturity_decision;

    -- Plan acceptance is a prerequisite and may not be inferred from target_stage alone.
    BEGIN
        PERFORM * FROM comind.cm_mdo_transition_module_maturity(
            v_module, v_plan, v_person, v_maturity_decision, 'specified',
            'Unaccepted plan must not move module maturity.', 'github:issue:407',
            'mdo005-unaccepted-' || v_suffix, ARRAY[v_accept_evidence]
        );
        RAISE EXCEPTION 'Expected unaccepted plan transition to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO maturity requires an accepted exact-module plan%' THEN RAISE; END IF;
    END;

    UPDATE comind.cm_mdo_plan SET status='in_review', updated_at=clock_timestamp() WHERE plan_id=v_plan;

    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_person, v_dispose_cap, v_project, 'C2', 'isolated',
        'module_plan', v_plan::text, 'MDO-005 fixture plan acceptance provenance',
        jsonb_build_array(v_accept_evidence::text), 'approved', clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (
        v_request, 'approved', v_person, 'MDO-005 fixture acceptance authority',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_decision_id INTO v_accept_decision;

    UPDATE comind.cm_mdo_plan SET status='accepted', updated_at=clock_timestamp() WHERE plan_id=v_plan;
    INSERT INTO comind.cm_mdo_plan_disposition_event(
        plan_id, event_type, from_status, to_status, actor_id,
        authorization_decision_id, rationale, source_ref, idempotency_key
    ) VALUES (
        v_plan, 'accept', 'in_review', 'accepted', v_person,
        v_accept_decision, 'Rollback-only accepted-plan fixture for MDO-005.',
        'github:issue:407#fixture-acceptance', 'mdo005-fixture-accept-' || v_suffix
    ) RETURNING disposition_event_id INTO v_accept_event;
    INSERT INTO comind.cm_mdo_plan_disposition_evidence(disposition_event_id, evidence_id)
    VALUES (v_accept_event, v_accept_evidence);

    -- Canonical evidence alone is insufficient. It must link to the governed plan acceptance.
    BEGIN
        PERFORM * FROM comind.cm_mdo_transition_module_maturity(
            v_module, v_plan, v_person, v_maturity_decision, 'specified',
            'Unrelated evidence must not satisfy the maturity gate.', 'github:issue:407',
            'mdo005-unrelated-' || v_suffix, ARRAY[v_unrelated_evidence]
        );
        RAISE EXCEPTION 'Expected unrelated evidence transition to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO maturity evidence must include evidence linked to the governed plan acceptance%' THEN RAISE; END IF;
    END;

    -- A nonhuman actor cannot perform the consequential maturity acceptance.
    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_service, v_maturity_cap, v_project, 'C2', 'isolated',
        'module', v_module::text, 'MDO-005 service negative proof',
        jsonb_build_array(v_accept_evidence::text), 'approved', clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (
        v_request, 'approved', v_service, 'Synthetic nonhuman negative proof',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_decision_id INTO v_service_decision;

    BEGIN
        PERFORM * FROM comind.cm_mdo_transition_module_maturity(
            v_module, v_plan, v_service, v_service_decision, 'specified',
            'Service actors cannot accept module maturity.', 'github:issue:407',
            'mdo005-service-' || v_suffix, ARRAY[v_accept_evidence]
        );
        RAISE EXCEPTION 'Expected nonhuman maturity transition to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO maturity transition requires an attributable human person actor%' THEN RAISE; END IF;
    END;

    -- Expired exact human authority fails closed.
    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, requested_at, expires_at
    ) VALUES (
        v_person, v_maturity_cap, v_project, 'C2', 'isolated',
        'module', v_module::text, 'MDO-005 expired negative proof',
        jsonb_build_array(v_accept_evidence::text), 'approved',
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
        PERFORM * FROM comind.cm_mdo_transition_module_maturity(
            v_module, v_plan, v_person, v_expired_decision, 'specified',
            'Expired authority cannot move module maturity.', 'github:issue:407',
            'mdo005-expired-' || v_suffix, ARRAY[v_accept_evidence]
        );
        RAISE EXCEPTION 'Expected expired maturity authorization to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO maturity authorization does not match the exact C2 module envelope%' THEN RAISE; END IF;
    END;

    BEGIN
        PERFORM * FROM comind.cm_mdo_transition_module_maturity(
            v_module, v_plan, v_person, v_maturity_decision, 'prototyped',
            'MDO-005 cannot skip the specified stage.', 'github:issue:407',
            'mdo005-skip-' || v_suffix, ARRAY[v_accept_evidence]
        );
        RAISE EXCEPTION 'Expected unsupported target stage to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO-005 supports only the verified conceived to specified transition%' THEN RAISE; END IF;
    END;

    SELECT count(*)::int INTO v_task_before
    FROM comind.cm_task WHERE project_id=v_project;
    SELECT count(*)::int INTO v_plan_task_before
    FROM comind.cm_mdo_plan_task WHERE plan_id=v_plan;
    SELECT count(*)::int INTO v_lease_before
    FROM comind.cm_foundry_work_lease wl
    JOIN comind.cm_mdo_plan_task pt ON pt.task_id=wl.task_id
    WHERE pt.plan_id=v_plan;
    SELECT count(*)::int INTO v_execution_before
    FROM comind.cm_foundry_execution_context WHERE project_id=v_project;
    SELECT count(*)::int INTO v_contribution_before
    FROM comind.cm_mdo_contribution WHERE plan_id=v_plan;

    SELECT lifecycle_event_id, created INTO v_lifecycle_event, v_created
    FROM comind.cm_mdo_transition_module_maturity(
        v_module, v_plan, v_person, v_maturity_decision, 'specified',
        'Accepted specification evidence is sufficient to mark this module specified, but not to authorize implementation.',
        'github:issue:407#isolated-acceptance', 'mdo005-transition-' || v_suffix,
        ARRAY[v_accept_evidence, v_accept_evidence]
    );
    IF NOT v_created OR v_lifecycle_event IS NULL THEN
        RAISE EXCEPTION 'Governed conceived to specified transition was not created';
    END IF;

    SELECT lifecycle_stage INTO v_stage FROM comind.cm_module_registry WHERE module_id=v_module;
    IF v_stage <> 'specified' THEN RAISE EXCEPTION 'Module maturity projection did not become specified'; END IF;
    SELECT status INTO v_plan_status FROM comind.cm_mdo_plan WHERE plan_id=v_plan;
    IF v_plan_status <> 'accepted' THEN RAISE EXCEPTION 'Maturity transition changed accepted plan status'; END IF;

    SELECT count(*)::int INTO v_task_after
    FROM comind.cm_task WHERE project_id=v_project;
    SELECT count(*)::int INTO v_plan_task_after
    FROM comind.cm_mdo_plan_task WHERE plan_id=v_plan;
    SELECT count(*)::int INTO v_lease_after
    FROM comind.cm_foundry_work_lease wl
    JOIN comind.cm_mdo_plan_task pt ON pt.task_id=wl.task_id
    WHERE pt.plan_id=v_plan;
    SELECT count(*)::int INTO v_execution_after
    FROM comind.cm_foundry_execution_context WHERE project_id=v_project;
    SELECT count(*)::int INTO v_contribution_after
    FROM comind.cm_mdo_contribution WHERE plan_id=v_plan;

    IF v_task_after <> v_task_before
       OR v_plan_task_after <> v_plan_task_before
       OR v_lease_after <> v_lease_before
       OR v_execution_after <> v_execution_before
       OR v_contribution_after <> v_contribution_before THEN
        RAISE EXCEPTION 'Maturity transition created implementation or execution side effects';
    END IF;

    SELECT count(*)::int INTO v_count
    FROM comind.cm_module_lifecycle_event_evidence
    WHERE lifecycle_event_id=v_lifecycle_event;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Lifecycle evidence was not deduplicated to one canonical link'; END IF;

    SELECT count(*)::int INTO v_count
    FROM comind.cm_audit_log
    WHERE action='mdo.module.maturity_transition'
      AND target_table='cm_module_registry'
      AND target_id=v_module
      AND details->>'lifecycle_event_id'=v_lifecycle_event::text;
    IF v_count <> 1 THEN RAISE EXCEPTION 'Expected exactly one maturity audit record'; END IF;

    -- Exact replay succeeds without duplicate history after the projection has advanced.
    SELECT created INTO v_created
    FROM comind.cm_mdo_transition_module_maturity(
        v_module, v_plan, v_person, v_maturity_decision, 'specified',
        'Accepted specification evidence is sufficient to mark this module specified, but not to authorize implementation.',
        'github:issue:407#isolated-acceptance', 'mdo005-transition-' || v_suffix,
        ARRAY[v_accept_evidence]
    );
    IF v_created THEN RAISE EXCEPTION 'Exact maturity replay created duplicate history'; END IF;

    BEGIN
        PERFORM * FROM comind.cm_mdo_transition_module_maturity(
            v_module, v_plan, v_person, v_maturity_decision, 'specified',
            'Conflicting replay rationale.', 'github:issue:407#isolated-acceptance',
            'mdo005-transition-' || v_suffix, ARRAY[v_accept_evidence]
        );
        RAISE EXCEPTION 'Expected conflicting maturity replay to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO maturity idempotency key conflicts with existing event%' THEN RAISE; END IF;
    END;

    -- A new authorization cannot repeat or skip past the now-specified projection.
    INSERT INTO comind.cm_foundry_authorization_request(
        requesting_actor_id, capability_id, project_id, authority_level, environment,
        target_kind, target_ref, reason, evidence_refs, status, expires_at
    ) VALUES (
        v_person, v_maturity_cap, v_project, 'C2', 'isolated',
        'module', v_module::text, 'MDO-005 duplicate transition negative proof',
        jsonb_build_array(v_accept_evidence::text), 'approved', clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_request_id INTO v_request;
    INSERT INTO comind.cm_foundry_authorization_decision(
        authorization_request_id, decision, decided_by_actor_id, decision_basis, effective_until
    ) VALUES (
        v_request, 'approved', v_person, 'Synthetic duplicate transition negative proof',
        clock_timestamp() + interval '1 hour'
    ) RETURNING authorization_decision_id INTO v_second_decision;

    BEGIN
        PERFORM * FROM comind.cm_mdo_transition_module_maturity(
            v_module, v_plan, v_person, v_second_decision, 'specified',
            'A specified module cannot be specified again.', 'github:issue:407',
            'mdo005-second-' || v_suffix, ARRAY[v_accept_evidence]
        );
        RAISE EXCEPTION 'Expected repeated stage transition to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'Only a conceived module can transition to specified in MDO-005%' THEN RAISE; END IF;
    END;

    BEGIN
        UPDATE comind.cm_module_lifecycle_event
        SET rationale='forbidden mutation'
        WHERE lifecycle_event_id=v_lifecycle_event;
        RAISE EXCEPTION 'Expected lifecycle history UPDATE to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO provenance is append-only%' THEN RAISE; END IF;
    END;

    BEGIN
        DELETE FROM comind.cm_module_lifecycle_event_evidence
        WHERE lifecycle_event_id=v_lifecycle_event;
        RAISE EXCEPTION 'Expected lifecycle evidence DELETE to fail';
    EXCEPTION WHEN others THEN
        IF SQLERRM NOT LIKE 'MDO provenance is append-only%' THEN RAISE; END IF;
    END;
END;
$$;

ROLLBACK;
SELECT 'pass|conceived_to_specified=1|implementation_side_effects=0|append_only=1|replay_safe=1';
