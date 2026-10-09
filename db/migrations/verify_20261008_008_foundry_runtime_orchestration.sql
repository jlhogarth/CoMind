-- Verification for CoMind Foundry runtime orchestration support.
-- Run only against isolated PostgreSQL after Foundry substrate and Issue #73 migration.

BEGIN;

DO $$
DECLARE
    v_table TEXT;
    v_rls BOOLEAN;
    v_exposed BOOLEAN;
    v_count INTEGER;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cm_foundry_adapter_operation_result',
        'cm_foundry_execution_outcome'
    ] LOOP
        IF to_regclass('comind.' || v_table) IS NULL THEN
            RAISE EXCEPTION 'Missing Foundry runtime table comind.%', v_table;
        END IF;

        SELECT relrowsecurity
        INTO v_rls
        FROM pg_class
        WHERE oid = to_regclass('comind.' || v_table);
        IF NOT v_rls THEN
            RAISE EXCEPTION 'RLS must be enabled on comind.%', v_table;
        END IF;

        SELECT
            has_table_privilege('anon', 'comind.' || v_table, 'SELECT')
            OR has_table_privilege('authenticated', 'comind.' || v_table, 'SELECT')
            OR has_table_privilege('anon', 'comind.' || v_table, 'INSERT')
            OR has_table_privilege('authenticated', 'comind.' || v_table, 'INSERT')
            OR has_table_privilege('anon', 'comind.' || v_table, 'UPDATE')
            OR has_table_privilege('authenticated', 'comind.' || v_table, 'UPDATE')
            OR has_table_privilege('anon', 'comind.' || v_table, 'DELETE')
            OR has_table_privilege('authenticated', 'comind.' || v_table, 'DELETE')
        INTO v_exposed;
        IF v_exposed THEN
            RAISE EXCEPTION 'Foundry runtime table comind.% is exposed to client roles', v_table;
        END IF;

        IF NOT has_table_privilege('service_role', 'comind.' || v_table, 'SELECT')
           OR NOT has_table_privilege('service_role', 'comind.' || v_table, 'INSERT')
           OR has_table_privilege('service_role', 'comind.' || v_table, 'UPDATE')
           OR has_table_privilege('service_role', 'comind.' || v_table, 'DELETE') THEN
            RAISE EXCEPTION 'Foundry runtime service_role privileges are not append-only on comind.%', v_table;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'comind'
      AND table_name IN ('cm_foundry_adapter_operation_result', 'cm_foundry_execution_outcome')
      AND column_name IN (
        'prompt', 'response', 'content', 'credential', 'credentials', 'secret',
        'api_key', 'token', 'estimated_cost_usd', 'actual_cost', 'reserved_cost',
        'input_tokens', 'output_tokens', 'total_tokens'
      );
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Foundry runtime completion tables contain forbidden payload, secret, token, or duplicate accounting columns';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'comind'
      AND table_name = 'cm_foundry_deliberation_event'
      AND column_name IN ('round_number', 'arbitration_pass', 'reply_to_event_id');
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Foundry deliberation runtime metadata columns are incomplete';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgrelid IN (
          'comind.cm_foundry_adapter_operation_result'::regclass,
          'comind.cm_foundry_execution_outcome'::regclass
      )
      AND tgname IN (
          'trg_cm_foundry_adapter_operation_result_immutable',
          'trg_cm_foundry_execution_outcome_immutable'
      );
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Foundry runtime completion append-only triggers are incomplete';
    END IF;
END;
$$;

DO $$
DECLARE
    v_org_id UUID;
    v_person_actor_id UUID;
    v_agent_actor_id UUID;
    v_agent_id UUID;
    v_profile_id UUID;
    v_project_id UUID;
    v_task_id UUID;
    v_capability_id UUID;
    v_request_id UUID;
    v_decision_id UUID;
    v_context_id UUID;
    v_operation_id UUID;
    v_operation_result_id UUID;
    v_deliberation_id UUID;
    v_participant_id UUID;
    v_proposal_id UUID;
    v_blocked BOOLEAN;
BEGIN
    INSERT INTO comind.cm_org (name, slug)
    VALUES (
        'Issue 73 Runtime Org ' || gen_random_uuid()::text,
        'issue73-runtime-' || replace(gen_random_uuid()::text, '-', '')
    ) RETURNING org_id INTO v_org_id;

    INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
    VALUES (
        v_org_id,
        'person',
        'issue73-approver-' || replace(gen_random_uuid()::text, '-', ''),
        'Issue 73 approver'
    ) RETURNING actor_id INTO v_person_actor_id;

    INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
    VALUES (
        v_org_id,
        'agent',
        'issue73-agent-actor-' || replace(gen_random_uuid()::text, '-', ''),
        'Issue 73 agent actor'
    ) RETURNING actor_id INTO v_agent_actor_id;

    INSERT INTO comind.cm_agent (org_id, name, description)
    VALUES (
        v_org_id,
        'issue73-agent-' || replace(gen_random_uuid()::text, '-', ''),
        'Issue 73 runtime verification agent'
    ) RETURNING agent_id INTO v_agent_id;

    INSERT INTO comind.cm_foundry_agent_profile (
        agent_id, actor_id, org_id, role_code, display_name,
        authority_floor, authority_ceiling, instruction_version,
        status, activated_at
    ) VALUES (
        v_agent_id, v_agent_actor_id, v_org_id,
        'runtime_verifier', 'Runtime Verifier',
        'C0', 'C2', 'issue73-runtime-1',
        'active', NOW()
    ) RETURNING profile_id INTO v_profile_id;

    INSERT INTO comind.cm_project (org_id, title, slug, created_by)
    VALUES (
        v_org_id,
        'Issue 73 Runtime Project',
        'issue73-runtime-project-' || replace(gen_random_uuid()::text, '-', ''),
        v_person_actor_id
    ) RETURNING project_id INTO v_project_id;

    INSERT INTO comind.cm_task (project_id, title, status)
    VALUES (v_project_id, 'Verify Foundry runtime orchestration schema', 'in_progress')
    RETURNING task_id INTO v_task_id;

    INSERT INTO comind.cm_foundry_capability (
        capability_code, description, action, target_kind,
        max_authority, risk_class, cost_bearing, adapter
    ) VALUES (
        'issue73.fake.execute.' || replace(gen_random_uuid()::text, '-', ''),
        'Deterministic fake runtime schema verification.',
        'execute', 'repository', 'C2', 'low', FALSE, 'fake_local'
    ) RETURNING capability_id INTO v_capability_id;

    INSERT INTO comind.cm_foundry_authorization_request (
        requesting_profile_id, requesting_actor_id, capability_id,
        project_id, task_id, authority_level, environment,
        target_kind, target_ref, reason
    ) VALUES (
        v_profile_id, v_agent_actor_id, v_capability_id,
        v_project_id, v_task_id, 'C2', 'isolated',
        'repository', 'jlhogarth/CoMind',
        'Issue 73 deterministic schema verification.'
    ) RETURNING authorization_request_id INTO v_request_id;

    INSERT INTO comind.cm_foundry_authorization_decision (
        authorization_request_id, decision, decided_by_actor_id, decision_basis
    ) VALUES (
        v_request_id, 'approved', v_person_actor_id,
        'Repository-only deterministic verification.'
    ) RETURNING authorization_decision_id INTO v_decision_id;

    INSERT INTO comind.cm_foundry_execution_context (
        profile_id, project_id, task_id, capability_id,
        authorization_decision_id, environment, execution_kind,
        idempotency_key, context
    ) VALUES (
        v_profile_id, v_project_id, v_task_id, v_capability_id,
        v_decision_id, 'isolated', 'adapter_operation',
        'issue73-schema-' || replace(gen_random_uuid()::text, '-', ''),
        jsonb_build_object('request_fingerprint', repeat('a', 64))
    ) RETURNING execution_context_id INTO v_context_id;

    INSERT INTO comind.cm_foundry_adapter_operation (
        execution_context_id, capability_id, adapter, operation_name,
        target_kind, target_ref, idempotency_key, request_fingerprint, status
    ) VALUES (
        v_context_id, v_capability_id, 'fake_local', 'execute',
        'repository', 'jlhogarth/CoMind',
        'adapter:' || replace(gen_random_uuid()::text, '-', ''),
        repeat('b', 64), 'approved'
    ) RETURNING adapter_operation_id INTO v_operation_id;

    INSERT INTO comind.cm_foundry_adapter_operation_result (
        adapter_operation_id, terminal_status, result_ref,
        result_fingerprint, summary
    ) VALUES (
        v_operation_id, 'succeeded', 'fake://issue73/schema',
        repeat('c', 64), 'Deterministic fake adapter completed.'
    ) RETURNING adapter_operation_result_id INTO v_operation_result_id;

    INSERT INTO comind.cm_foundry_execution_outcome (
        execution_context_id, adapter_operation_result_id,
        terminal_status, summary
    ) VALUES (
        v_context_id, v_operation_result_id,
        'succeeded', 'Foundry runtime schema verification completed.'
    );

    v_blocked := FALSE;
    BEGIN
        INSERT INTO comind.cm_foundry_adapter_operation_result (
            adapter_operation_id, terminal_status, result_fingerprint, summary
        ) VALUES (
            v_operation_id, 'succeeded', repeat('d', 64), 'Duplicate should fail.'
        );
    EXCEPTION WHEN unique_violation THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'One adapter operation must not accept multiple terminal result records';
    END IF;

    v_blocked := FALSE;
    BEGIN
        UPDATE comind.cm_foundry_adapter_operation_result
        SET summary = 'Mutation must fail'
        WHERE adapter_operation_result_id = v_operation_result_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Foundry substrate provenance is append-only' THEN
            v_blocked := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Adapter operation result mutation must be rejected';
    END IF;

    v_blocked := FALSE;
    BEGIN
        DELETE FROM comind.cm_foundry_execution_outcome
        WHERE execution_context_id = v_context_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Foundry substrate provenance is append-only' THEN
            v_blocked := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Execution outcome deletion must be rejected';
    END IF;

    INSERT INTO comind.cm_foundry_deliberation (
        project_id, task_id, opened_by_profile_id, topic, protocol, status
    ) VALUES (
        v_project_id, v_task_id, v_profile_id,
        'Issue 73 bounded deliberation schema verification',
        'parallel_planning', 'open'
    ) RETURNING deliberation_id INTO v_deliberation_id;

    INSERT INTO comind.cm_foundry_deliberation_participant (
        deliberation_id, profile_id, role
    ) VALUES (v_deliberation_id, v_profile_id, 'verifier')
    RETURNING participant_id INTO v_participant_id;

    INSERT INTO comind.cm_foundry_deliberation_event (
        deliberation_id, participant_id, event_type, claim,
        round_number, arbitration_pass
    ) VALUES (
        v_deliberation_id, v_participant_id, 'proposal',
        'Use append-only completion records.', 1, 0
    ) RETURNING deliberation_event_id INTO v_proposal_id;

    INSERT INTO comind.cm_foundry_deliberation_event (
        deliberation_id, participant_id, event_type, claim,
        round_number, arbitration_pass, reply_to_event_id
    ) VALUES (
        v_deliberation_id, v_participant_id, 'dissent',
        'Record professional dissent explicitly.', 2, 1, v_proposal_id
    );

    INSERT INTO comind.cm_foundry_deliberation_outcome (
        deliberation_id, outcome, summary
    ) VALUES (
        v_deliberation_id,
        'accepted_with_dissent',
        'Bounded deliberation schema supports explicit dissent.'
    );

    v_blocked := FALSE;
    BEGIN
        INSERT INTO comind.cm_foundry_deliberation_event (
            deliberation_id, participant_id, event_type, claim,
            round_number, arbitration_pass
        ) VALUES (
            v_deliberation_id, v_participant_id, 'verification_note',
            'Third review round must fail.', 3, 0
        );
    EXCEPTION WHEN check_violation THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Deliberation review round greater than two must be rejected';
    END IF;

    v_blocked := FALSE;
    BEGIN
        INSERT INTO comind.cm_foundry_deliberation_event (
            deliberation_id, participant_id, event_type, claim,
            round_number, arbitration_pass
        ) VALUES (
            v_deliberation_id, v_participant_id, 'verification_note',
            'Second arbitration pass must fail.', 2, 2
        );
    EXCEPTION WHEN check_violation THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'More than one arbitration pass must be rejected';
    END IF;
END;
$$;

SELECT
    'pass' AS status,
    (SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'comind'
        AND table_name IN ('cm_foundry_adapter_operation_result', 'cm_foundry_execution_outcome')) AS completion_tables,
    (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'comind'
        AND table_name = 'cm_foundry_deliberation_event'
        AND column_name IN ('round_number', 'arbitration_pass', 'reply_to_event_id')) AS deliberation_runtime_columns;

ROLLBACK;
