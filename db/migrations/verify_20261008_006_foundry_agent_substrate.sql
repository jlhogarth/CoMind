-- Verification for CoMind Foundry agent substrate.
-- Run only against isolated PostgreSQL after the current schema, FinOps authority,
-- current-runtime budget adapter, and the Foundry substrate migration.

BEGIN;

DO $$
DECLARE
    v_table TEXT;
    v_rls BOOLEAN;
    v_exposed BOOLEAN;
    v_count INTEGER;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cm_foundry_agent_profile',
        'cm_foundry_capability',
        'cm_foundry_capability_grant',
        'cm_foundry_authorization_request',
        'cm_foundry_authorization_decision',
        'cm_foundry_execution_context',
        'cm_foundry_deliberation',
        'cm_foundry_deliberation_participant',
        'cm_foundry_deliberation_event',
        'cm_foundry_deliberation_outcome',
        'cm_foundry_recovery_checkpoint',
        'cm_foundry_adapter_operation'
    ] LOOP
        IF to_regclass('comind.' || v_table) IS NULL THEN
            RAISE EXCEPTION 'Missing Foundry substrate table comind.%', v_table;
        END IF;

        SELECT relrowsecurity INTO v_rls
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
            RAISE EXCEPTION 'Foundry substrate table comind.% is exposed to client roles', v_table;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_count
    FROM pg_policies
    WHERE schemaname = 'comind'
      AND tablename LIKE 'cm_foundry_%'
      AND (
        COALESCE(qual, '') IN ('true', '(true)')
        OR COALESCE(with_check, '') IN ('true', '(true)')
      );
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Foundry substrate contains broad TRUE RLS policies';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'comind'
      AND table_name LIKE 'cm_foundry_%'
      AND column_name IN (
        'prompt', 'response', 'content', 'credential', 'credentials', 'secret',
        'api_key', 'token', 'estimated_cost_usd', 'actual_cost', 'reserved_cost'
      );
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Foundry substrate contains forbidden payload, secret, or duplicate accounting columns';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'comind'
      AND p.proname = 'cm_reject_foundry_substrate_mutation'
      AND NOT EXISTS (
          SELECT 1
          FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
          WHERE setting LIKE 'search_path=%'
      );
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Foundry substrate trigger function lacks fixed search_path';
    END IF;
END;
$$;

DO $$
DECLARE
    v_org_id UUID;
    v_operator_actor_id UUID;
    v_agent_actor_id UUID;
    v_agent_id UUID;
    v_profile_id UUID;
    v_project_id UUID;
    v_task_id UUID;
    v_conversation_id UUID;
    v_agent_run_id UUID;
    v_capability_id UUID;
    v_grant_id UUID;
    v_request_id UUID;
    v_decision_id UUID;
    v_envelope_id BIGINT;
    v_binding_id UUID;
    v_context_id UUID;
    v_deliberation_id UUID;
    v_participant_id UUID;
    v_event_id UUID;
    v_outcome_id UUID;
    v_checkpoint_id UUID;
    v_operation_id UUID;
    v_count INTEGER;
    v_blocked BOOLEAN;
BEGIN
    INSERT INTO comind.cm_org (name, slug)
    VALUES ('Issue 70 Foundry Org ' || gen_random_uuid()::text, 'issue70-foundry-' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING org_id INTO v_org_id;

    INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
    VALUES (v_org_id, 'person', 'issue70-joseph-' || replace(gen_random_uuid()::text, '-', ''), 'Issue 70 Joseph approver')
    RETURNING actor_id INTO v_operator_actor_id;

    INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
    VALUES (v_org_id, 'agent', 'issue70-agent-actor-' || replace(gen_random_uuid()::text, '-', ''), 'Issue 70 Foundry agent actor')
    RETURNING actor_id INTO v_agent_actor_id;

    INSERT INTO comind.cm_agent (org_id, name, description)
    VALUES (v_org_id, 'issue70-agent-' || replace(gen_random_uuid()::text, '-', ''), 'Issue 70 Foundry substrate agent')
    RETURNING agent_id INTO v_agent_id;

    INSERT INTO comind.cm_foundry_agent_profile (
        agent_id, actor_id, org_id, role_code, display_name,
        authority_floor, authority_ceiling, instruction_version,
        runtime_defaults, competencies, status, activated_at
    ) VALUES (
        v_agent_id, v_agent_actor_id, v_org_id, 'planning_agent', 'Planning Agent',
        'C0', 'C1', 'foundry-blueprint-2026-10-08',
        '{"mode":"isolated"}'::jsonb,
        '["planning", "verification"]'::jsonb,
        'active', NOW()
    ) RETURNING profile_id INTO v_profile_id;

    INSERT INTO comind.cm_project (org_id, title, slug, created_by)
    VALUES (v_org_id, 'Issue 70 Foundry Project', 'issue70-foundry-project-' || replace(gen_random_uuid()::text, '-', ''), v_operator_actor_id)
    RETURNING project_id INTO v_project_id;

    INSERT INTO comind.cm_task (project_id, title, status)
    VALUES (v_project_id, 'Verify Foundry substrate', 'in_progress')
    RETURNING task_id INTO v_task_id;

    INSERT INTO comind.cm_conversation (org_id, project_id, owner_actor_id, source, title)
    VALUES (v_org_id, v_project_id, v_operator_actor_id, 'live', 'Issue 70 Foundry verification')
    RETURNING conv_id INTO v_conversation_id;

    INSERT INTO comind.cm_agent_run (agent_id, status)
    VALUES (v_agent_id, 'running')
    RETURNING run_id INTO v_agent_run_id;

    INSERT INTO comind.cm_foundry_capability (
        capability_code, description, action, target_kind,
        max_authority, risk_class, cost_bearing, adapter
    ) VALUES (
        'github.issue.read', 'Read GitHub issue metadata for planning evidence.', 'read', 'github_issue',
        'C1', 'low', FALSE, 'github'
    ) RETURNING capability_id INTO v_capability_id;

    INSERT INTO comind.cm_foundry_capability_grant (
        profile_id, capability_id, org_id, project_id, environment,
        authority_ceiling, scope, granted_by_actor_id, grant_reason
    ) VALUES (
        v_profile_id, v_capability_id, v_org_id, v_project_id, 'isolated',
        'C1', '{"repository":"jlhogarth/CoMind"}'::jsonb, v_operator_actor_id,
        'Issue 70 isolated planning verification'
    ) RETURNING grant_id INTO v_grant_id;

    v_blocked := FALSE;
    BEGIN
        INSERT INTO comind.cm_foundry_capability_grant (
            profile_id, capability_id, org_id, project_id, environment,
            authority_ceiling, scope, granted_by_actor_id, grant_reason
        ) VALUES (
            v_profile_id, v_capability_id, v_org_id, v_project_id, 'isolated',
            'C1', '{}'::jsonb, v_operator_actor_id, 'Duplicate active grant should fail'
        );
    EXCEPTION WHEN unique_violation THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Duplicate active capability grants must be rejected';
    END IF;

    INSERT INTO comind.cm_foundry_authorization_request (
        requesting_profile_id, requesting_actor_id, capability_id, project_id,
        task_id, authority_level, environment, target_kind, target_ref,
        reason, evidence_refs
    ) VALUES (
        v_profile_id, v_agent_actor_id, v_capability_id, v_project_id,
        v_task_id, 'C1', 'isolated', 'github_issue', '70',
        'Verify isolated Foundry substrate planning authority.',
        jsonb_build_array(jsonb_build_object('kind', 'github_issue', 'ref', '70'))
    ) RETURNING authorization_request_id INTO v_request_id;

    INSERT INTO comind.cm_foundry_authorization_decision (
        authorization_request_id, decision, decided_by_actor_id,
        decision_basis, policy_refs
    ) VALUES (
        v_request_id, 'approved', v_operator_actor_id,
        'Isolated verification only. No live Supabase mutation and no provider spend.',
        jsonb_build_array(jsonb_build_object('policy', 'no_live_supabase_mutation'))
    ) RETURNING authorization_decision_id INTO v_decision_id;

    INSERT INTO public.comind_workflow_cost_envelopes (
        objective, environment, capability_level, estimated_cost,
        soft_limit_amount, hard_limit_amount, permitted_provider_codes,
        max_iterations, max_duration_seconds, status
    ) VALUES (
        'Issue 70 Foundry substrate verification', 'test', 1, 0,
        0.000000000000, 0.000000000000, '[]'::jsonb,
        1, 60, 'authorized'
    ) RETURNING id INTO v_envelope_id;

    SELECT comind.cm_bind_budget_authority_envelope(
        v_envelope_id,
        'agent_run',
        v_project_id,
        NULL,
        v_agent_id,
        v_agent_run_id,
        NULL
    ) INTO v_binding_id;

    INSERT INTO comind.cm_foundry_execution_context (
        profile_id, agent_run_id, project_id, task_id, conversation_id,
        capability_id, authorization_decision_id, budget_binding_id,
        environment, execution_kind, idempotency_key, context
    ) VALUES (
        v_profile_id, v_agent_run_id, v_project_id, v_task_id, v_conversation_id,
        v_capability_id, v_decision_id, v_binding_id,
        'isolated', 'verification', 'issue70-foundry-context-' || replace(gen_random_uuid()::text, '-', ''),
        jsonb_build_object('source_issue', 70, 'budget_binding_id', v_binding_id)
    ) RETURNING execution_context_id INTO v_context_id;

    INSERT INTO comind.cm_foundry_deliberation (
        project_id, task_id, opened_by_profile_id, topic, protocol, status
    ) VALUES (
        v_project_id, v_task_id, v_profile_id,
        'Foundry substrate isolated verification', 'parallel_planning', 'open'
    ) RETURNING deliberation_id INTO v_deliberation_id;

    INSERT INTO comind.cm_foundry_deliberation_participant (
        deliberation_id, profile_id, role
    ) VALUES (
        v_deliberation_id, v_profile_id, 'verifier'
    ) RETURNING participant_id INTO v_participant_id;

    INSERT INTO comind.cm_foundry_deliberation_event (
        deliberation_id, participant_id, execution_context_id,
        event_type, claim, evidence_refs
    ) VALUES (
        v_deliberation_id, v_participant_id, v_context_id,
        'verification_note', 'The Foundry substrate links profile, capability, authorization, execution, and budget authority.',
        jsonb_build_array(jsonb_build_object('kind', 'migration', 'ref', '20261008_006'))
    ) RETURNING deliberation_event_id INTO v_event_id;

    INSERT INTO comind.cm_foundry_deliberation_outcome (
        deliberation_id, execution_context_id, outcome, summary, required_next_decision
    ) VALUES (
        v_deliberation_id, v_context_id, 'accepted',
        'Isolated Foundry substrate contract is internally linkable and auditable.',
        'Joseph approval remains required before live Supabase deployment.'
    ) RETURNING outcome_id INTO v_outcome_id;

    INSERT INTO comind.cm_foundry_recovery_checkpoint (
        execution_context_id, project_id, checkpoint_kind, source_ref,
        durable_summary, evidence_refs, created_by_profile_id
    ) VALUES (
        v_context_id, v_project_id, 'provenance_snapshot',
        'github:jlhogarth/CoMind#70',
        'Issue 70 isolated verification inserted and linked Foundry substrate records.',
        jsonb_build_array(jsonb_build_object('kind', 'github_issue', 'ref', '70')),
        v_profile_id
    ) RETURNING recovery_checkpoint_id INTO v_checkpoint_id;

    INSERT INTO comind.cm_foundry_adapter_operation (
        execution_context_id, capability_id, adapter, operation_name,
        target_kind, target_ref, idempotency_key, request_fingerprint,
        status, result_ref
    ) VALUES (
        v_context_id, v_capability_id, 'github', 'issue.read',
        'github_issue', '70', 'issue70-adapter-op-' || replace(gen_random_uuid()::text, '-', ''),
        encode(digest('issue70-read-github-issue', 'sha256'), 'hex'),
        'succeeded', 'github:jlhogarth/CoMind#70'
    ) RETURNING adapter_operation_id INTO v_operation_id;

    SELECT COUNT(*) INTO v_count
    FROM comind.cm_foundry_execution_context c
    JOIN comind.cm_foundry_agent_profile p ON p.profile_id = c.profile_id
    JOIN comind.cm_foundry_capability cap ON cap.capability_id = c.capability_id
    JOIN comind.cm_foundry_authorization_decision d ON d.authorization_decision_id = c.authorization_decision_id
    JOIN comind.cm_budget_authority_binding b ON b.binding_id = c.budget_binding_id
    WHERE c.execution_context_id = v_context_id
      AND p.profile_id = v_profile_id
      AND cap.capability_id = v_capability_id
      AND d.authorization_decision_id = v_decision_id
      AND b.agent_run_id = v_agent_run_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Foundry execution context does not link profile, capability, decision, and budget authority';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM comind.cm_foundry_deliberation_event e
    JOIN comind.cm_foundry_deliberation_outcome o ON o.deliberation_id = e.deliberation_id
    JOIN comind.cm_foundry_recovery_checkpoint r ON r.execution_context_id = e.execution_context_id
    JOIN comind.cm_foundry_adapter_operation a ON a.execution_context_id = e.execution_context_id
    WHERE e.deliberation_event_id = v_event_id
      AND o.outcome_id = v_outcome_id
      AND r.recovery_checkpoint_id = v_checkpoint_id
      AND a.adapter_operation_id = v_operation_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Foundry deliberation, recovery, and adapter operation provenance is not linked';
    END IF;

    v_blocked := FALSE;
    BEGIN
        UPDATE comind.cm_foundry_execution_context
        SET closed_at = NOW()
        WHERE execution_context_id = v_context_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Foundry substrate provenance is append-only' THEN
            v_blocked := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Foundry execution context update must be rejected';
    END IF;

    v_blocked := FALSE;
    BEGIN
        DELETE FROM comind.cm_foundry_adapter_operation
        WHERE adapter_operation_id = v_operation_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Foundry substrate provenance is append-only' THEN
            v_blocked := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'Foundry adapter operation delete must be rejected';
    END IF;
END;
$$;

ROLLBACK;

SELECT 'pass' AS status, 'foundry agent substrate verification passed' AS detail;
