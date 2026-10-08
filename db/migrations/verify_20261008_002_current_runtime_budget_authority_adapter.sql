-- Verification for CoMind current-runtime budget-authority adapter.
-- Run only against isolated PostgreSQL after the current schema, FinOps v1,
-- Issue #57 hardening, and the Issue #59 adapter migration.

BEGIN;

DO $$
DECLARE
    v_rls BOOLEAN;
    v_exposed BOOLEAN;
    v_sensitive_columns INTEGER;
    v_table TEXT;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'cm_budget_authority_binding',
        'cm_budget_authority_reservation',
        'cm_budget_authority_telemetry'
    ] LOOP
        IF to_regclass('comind.' || v_table) IS NULL THEN
            RAISE EXCEPTION 'Missing adapter table comind.%', v_table;
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
        INTO v_exposed;
        IF v_exposed THEN
            RAISE EXCEPTION 'Adapter table comind.% is exposed to client roles', v_table;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO v_sensitive_columns
    FROM information_schema.columns
    WHERE table_schema = 'comind'
      AND table_name IN (
        'cm_budget_authority_binding',
        'cm_budget_authority_reservation',
        'cm_budget_authority_telemetry'
      )
      AND column_name IN (
        'prompt', 'response', 'content', 'credential', 'secret', 'api_key',
        'estimated_cost_usd', 'actual_cost', 'reserved_cost'
      );

    IF v_sensitive_columns <> 0 THEN
        RAISE EXCEPTION 'Adapter provenance contains forbidden payload or duplicate accounting columns';
    END IF;
END;
$$;

DO $$
DECLARE
    v_org_id UUID;
    v_other_org_id UUID;
    v_actor_id UUID;
    v_project_id UUID;
    v_other_project_id UUID;
    v_agent_id UUID;
    v_other_agent_id UUID;
    v_agent_run_id UUID;
    v_conversation_id UUID;
    v_other_conversation_id UUID;
    v_conversation_envelope BIGINT;
    v_agent_envelope BIGINT;
    v_binding_id UUID;
    v_binding_repeat UUID;
    v_agent_binding_id UUID;
    v_reservation_id BIGINT;
    v_reservation_repeat BIGINT;
    v_quality_draft_reservation BIGINT;
    v_quality_verifier_reservation BIGINT;
    v_unknown_reservation BIGINT;
    v_stale_reservation BIGINT;
    v_message_id UUID;
    v_quality_message_id UUID;
    v_unknown_message_id UUID;
    v_approved BOOLEAN;
    v_remaining NUMERIC;
    v_status TEXT;
    v_reason TEXT;
    v_idempotent BOOLEAN;
    v_usage_id BIGINT;
    v_accounted NUMERIC;
    v_actual NUMERIC;
    v_reserved NUMERIC;
    v_count INTEGER;
    v_conflict_seen BOOLEAN;
BEGIN
    INSERT INTO comind.cm_org (name, slug)
    VALUES ('Issue 59 Org ' || gen_random_uuid()::text, 'issue59-' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING org_id INTO v_org_id;

    INSERT INTO comind.cm_org (name, slug)
    VALUES ('Issue 59 Other Org ' || gen_random_uuid()::text, 'issue59-other-' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING org_id INTO v_other_org_id;

    INSERT INTO comind.cm_actor (org_id, kind, handle, display_name)
    VALUES (v_org_id, 'service', 'issue59-service-' || replace(gen_random_uuid()::text, '-', ''), 'Issue 59 service')
    RETURNING actor_id INTO v_actor_id;

    INSERT INTO comind.cm_project (org_id, title, slug)
    VALUES (v_org_id, 'Issue 59 Project', 'issue59-project-' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING project_id INTO v_project_id;

    INSERT INTO comind.cm_project (org_id, title, slug)
    VALUES (v_other_org_id, 'Issue 59 Other Project', 'issue59-other-project-' || replace(gen_random_uuid()::text, '-', ''))
    RETURNING project_id INTO v_other_project_id;

    INSERT INTO comind.cm_agent (org_id, name, description)
    VALUES (v_org_id, 'issue59-agent-' || replace(gen_random_uuid()::text, '-', ''), 'Issue 59 governed agent')
    RETURNING agent_id INTO v_agent_id;

    INSERT INTO comind.cm_agent (org_id, name, description)
    VALUES (v_other_org_id, 'issue59-other-agent-' || replace(gen_random_uuid()::text, '-', ''), 'Issue 59 other agent')
    RETURNING agent_id INTO v_other_agent_id;

    INSERT INTO comind.cm_agent_run (agent_id, status)
    VALUES (v_agent_id, 'running')
    RETURNING run_id INTO v_agent_run_id;

    INSERT INTO comind.cm_conversation (org_id, project_id, source, title)
    VALUES (v_org_id, v_project_id, 'live', 'Issue 59 current runtime conversation')
    RETURNING conv_id INTO v_conversation_id;

    INSERT INTO comind.cm_conversation (org_id, project_id, source, title)
    VALUES (v_other_org_id, v_other_project_id, 'live', 'Issue 59 other conversation')
    RETURNING conv_id INTO v_other_conversation_id;

    INSERT INTO public.comind_workflow_cost_envelopes (
        objective, environment, capability_level, estimated_cost,
        soft_limit_amount, hard_limit_amount, permitted_provider_codes,
        max_iterations, max_duration_seconds, status
    ) VALUES (
        'Issue 59 conversation adapter verification', 'test', 2, 0,
        0.800000000000, 1.000000000000, '["openai"]'::jsonb,
        10, 600, 'authorized'
    ) RETURNING id INTO v_conversation_envelope;

    INSERT INTO public.comind_workflow_cost_envelopes (
        objective, environment, capability_level, estimated_cost,
        soft_limit_amount, hard_limit_amount, permitted_provider_codes,
        max_iterations, max_duration_seconds, status
    ) VALUES (
        'Issue 59 agent adapter verification', 'test', 2, 0,
        0.800000000000, 1.000000000000, '["openai"]'::jsonb,
        10, 600, 'authorized'
    ) RETURNING id INTO v_agent_envelope;

    SELECT comind.cm_bind_budget_authority_envelope(
        v_conversation_envelope,
        'conversation',
        NULL,
        NULL,
        NULL,
        NULL,
        v_conversation_id
    ) INTO v_binding_id;

    SELECT comind.cm_bind_budget_authority_envelope(
        v_conversation_envelope,
        'conversation',
        v_project_id,
        NULL,
        NULL,
        NULL,
        v_conversation_id
    ) INTO v_binding_repeat;

    IF v_binding_id <> v_binding_repeat THEN
        RAISE EXCEPTION 'Conversation binding retry was not idempotent';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM comind.cm_budget_authority_binding
    WHERE binding_id = v_binding_id
      AND project_id = v_project_id
      AND conversation_id = v_conversation_id
      AND execution_kind = 'conversation';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Conversation binding did not derive current project identity';
    END IF;

    SELECT comind.cm_bind_budget_authority_envelope(
        v_agent_envelope,
        'agent_run',
        v_project_id,
        NULL,
        NULL,
        v_agent_run_id,
        NULL
    ) INTO v_agent_binding_id;

    SELECT COUNT(*) INTO v_count
    FROM comind.cm_budget_authority_binding
    WHERE binding_id = v_agent_binding_id
      AND project_id = v_project_id
      AND agent_id = v_agent_id
      AND agent_run_id = v_agent_run_id
      AND execution_kind = 'agent_run';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Agent-run binding did not derive current agent identity';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM public.comind_workflow_cost_envelopes
    WHERE id IN (v_conversation_envelope, v_agent_envelope)
      AND project_id IS NULL
      AND owner_agent_id IS NULL;
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Adapter verification accidentally depends on legacy public project or agent identity';
    END IF;

    v_conflict_seen := FALSE;
    BEGIN
        PERFORM comind.cm_bind_budget_authority_envelope(
            v_conversation_envelope,
            'conversation',
            v_other_project_id,
            NULL,
            NULL,
            NULL,
            v_conversation_id
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Conversation project conflicts with requested runtime project' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Conflicting conversation/project identity did not fail closed';
    END IF;

    v_conflict_seen := FALSE;
    BEGIN
        PERFORM comind.cm_bind_budget_authority_envelope(
            v_agent_envelope,
            'agent_run',
            v_project_id,
            NULL,
            v_other_agent_id,
            v_agent_run_id,
            NULL
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Agent run conflicts with requested runtime agent' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Conflicting agent-run identity did not fail closed';
    END IF;

    SELECT reservation_id, approved, remaining_budget, reservation_status,
           decision_reason, idempotent
    INTO v_reservation_id, v_approved, v_remaining, v_status, v_reason, v_idempotent
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'assistant-response', 'root',
        'issue59-root-' || v_conversation_envelope,
        0.400000000000,
        NOW() + INTERVAL '5 minutes'
    );

    IF NOT v_approved OR v_idempotent OR v_status <> 'reserved'
       OR v_remaining <> 0.600000000000 THEN
        RAISE EXCEPTION 'Adapter initial reservation failed: approved=%, idempotent=%, status=%, remaining=%, reason=%',
            v_approved, v_idempotent, v_status, v_remaining, v_reason;
    END IF;

    SELECT reservation_id, approved, remaining_budget, reservation_status,
           decision_reason, idempotent
    INTO v_reservation_repeat, v_approved, v_remaining, v_status, v_reason, v_idempotent
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'assistant-response', 'root',
        'issue59-root-' || v_conversation_envelope,
        0.400000000000,
        NOW() + INTERVAL '5 minutes'
    );

    IF NOT v_approved OR NOT v_idempotent OR v_reservation_repeat <> v_reservation_id THEN
        RAISE EXCEPTION 'Adapter reservation retry was not idempotent';
    END IF;

    v_conflict_seen := FALSE;
    BEGIN
        PERFORM * FROM comind.cm_reserve_paid_provider_execution(
            v_binding_id, 'openai', 'assistant-response', 'verifier',
            'issue59-root-' || v_conversation_envelope,
            0.400000000000,
            NOW() + INTERVAL '5 minutes'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE 'Reservation % has conflicting current-runtime provenance' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Adapter-specific idempotency conflict did not fail closed';
    END IF;

    INSERT INTO comind.cm_message (conv_id, role, content, meta)
    VALUES (
        v_conversation_id,
        'assistant',
        'Issue 59 root telemetry fixture',
        jsonb_build_object(
            'provider', 'openai',
            'model', 'gpt-6-luna',
            'endpoint', 'responses.create',
            'response_id', 'resp-issue59-root-' || v_conversation_envelope,
            'status', 'succeeded',
            'cost', jsonb_build_object(
                'estimated_cost_usd', 0.123456789012,
                'currency', 'USD',
                'rate_card_version', 'openai-2026-10-07',
                'pricing_source', 'https://developers.openai.com/api/docs/pricing'
            )
        )
    ) RETURNING msg_id INTO v_message_id;

    SELECT reservation_id, usage_event_id, reservation_status, accounted_cost, idempotent
    INTO v_reservation_repeat, v_usage_id, v_status, v_accounted, v_idempotent
    FROM comind.cm_finalize_paid_provider_message_execution(
        v_reservation_id, v_message_id, 'root', 'runtime_message_telemetry_settlement'
    );

    IF v_status <> 'finalized' OR v_accounted <> 0.123456789012
       OR v_idempotent OR v_usage_id IS NULL THEN
        RAISE EXCEPTION 'Root message telemetry finalization failed';
    END IF;

    SELECT reservation_id, usage_event_id, reservation_status, accounted_cost, idempotent
    INTO v_reservation_repeat, v_usage_id, v_status, v_accounted, v_idempotent
    FROM comind.cm_finalize_paid_provider_message_execution(
        v_reservation_id, v_message_id, 'root', 'runtime_message_telemetry_settlement'
    );

    IF NOT v_idempotent THEN
        RAISE EXCEPTION 'Root message telemetry finalization replay was not idempotent';
    END IF;

    SELECT actual_cost, reserved_cost INTO v_actual, v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_conversation_envelope;
    IF v_actual <> 0.123456789012 OR v_reserved <> 0 THEN
        RAISE EXCEPTION 'Root telemetry settlement totals are inconsistent: actual=%, reserved=%',
            v_actual, v_reserved;
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM comind.cm_budget_authority_telemetry
    WHERE reservation_id = v_reservation_id
      AND message_id = v_message_id
      AND telemetry_locator = 'root'
      AND telemetry_identity = 'cm_message:' || v_message_id::text || ':root'
      AND rate_card_version = 'openai-2026-10-07';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Root telemetry provenance link is incomplete';
    END IF;

    SELECT reservation_id, approved
    INTO v_quality_draft_reservation, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'assistant-quality-draft', 'draft',
        'issue59-draft-' || v_conversation_envelope,
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );
    IF NOT v_approved THEN
        RAISE EXCEPTION 'Quality draft reservation failed';
    END IF;

    SELECT reservation_id, approved
    INTO v_quality_verifier_reservation, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'assistant-quality-verify', 'verifier',
        'issue59-verifier-' || v_conversation_envelope,
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );
    IF NOT v_approved THEN
        RAISE EXCEPTION 'Quality verifier reservation failed';
    END IF;

    INSERT INTO comind.cm_message (conv_id, role, content, meta)
    VALUES (
        v_conversation_id,
        'assistant',
        'Issue 59 quality telemetry fixture',
        jsonb_build_object(
            'provider', 'openai',
            'model', 'gpt-6-luna',
            'response_id', 'resp-issue59-final-' || v_conversation_envelope,
            'status', 'succeeded',
            'quality_gate', jsonb_build_object(
                'passes', jsonb_build_array(
                    jsonb_build_object(
                        'role', 'draft',
                        'provider', 'openai',
                        'model', 'gpt-6-luna',
                        'endpoint', 'responses.create',
                        'response_id', 'resp-issue59-draft-' || v_conversation_envelope,
                        'status', 'succeeded',
                        'cost', jsonb_build_object(
                            'estimated_cost_usd', 0.010000000001,
                            'currency', 'USD',
                            'rate_card_version', 'openai-2026-10-07',
                            'pricing_source', 'https://developers.openai.com/api/docs/pricing'
                        )
                    ),
                    jsonb_build_object(
                        'role', 'verifier',
                        'provider', 'openai',
                        'model', 'gpt-6-luna',
                        'endpoint', 'responses.create',
                        'response_id', 'resp-issue59-verifier-' || v_conversation_envelope,
                        'status', 'succeeded',
                        'cost', jsonb_build_object(
                            'estimated_cost_usd', 0.005000000002,
                            'currency', 'USD',
                            'rate_card_version', 'openai-2026-10-07',
                            'pricing_source', 'https://developers.openai.com/api/docs/pricing'
                        )
                    ),
                    jsonb_build_object('role', 'final', 'source_role', 'draft')
                )
            )
        )
    ) RETURNING msg_id INTO v_quality_message_id;

    PERFORM * FROM comind.cm_finalize_paid_provider_message_execution(
        v_quality_draft_reservation,
        v_quality_message_id,
        'quality_gate.passes.draft',
        'runtime_quality_pass_settlement'
    );
    PERFORM * FROM comind.cm_finalize_paid_provider_message_execution(
        v_quality_verifier_reservation,
        v_quality_message_id,
        'quality_gate.passes.verifier',
        'runtime_quality_pass_settlement'
    );

    SELECT COUNT(*) INTO v_count
    FROM comind.cm_budget_authority_telemetry
    WHERE message_id = v_quality_message_id
      AND telemetry_locator IN ('quality_gate.passes.draft', 'quality_gate.passes.verifier');
    IF v_count <> 2 THEN
        RAISE EXCEPTION 'Named quality-pass telemetry identities were not preserved independently';
    END IF;

    SELECT reservation_id, approved
    INTO v_unknown_reservation, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id, 'openai', 'assistant-unknown-cost', 'root',
        'issue59-unknown-' || v_conversation_envelope,
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );
    IF NOT v_approved THEN
        RAISE EXCEPTION 'Unknown-cost adapter reservation failed';
    END IF;

    INSERT INTO comind.cm_message (conv_id, role, content, meta)
    VALUES (
        v_conversation_id,
        'assistant',
        'Issue 59 unknown cost fixture',
        jsonb_build_object(
            'provider', 'openai',
            'response_id', 'resp-issue59-unknown-' || v_conversation_envelope,
            'status', 'succeeded',
            'cost', jsonb_build_object(
                'estimated_cost_usd', NULL,
                'currency', 'USD',
                'rate_card_version', 'openai-2026-10-07'
            )
        )
    ) RETURNING msg_id INTO v_unknown_message_id;

    SELECT reservation_id, usage_event_id, reservation_status, accounted_cost, idempotent
    INTO v_reservation_repeat, v_usage_id, v_status, v_accounted, v_idempotent
    FROM comind.cm_finalize_paid_provider_message_execution(
        v_unknown_reservation,
        v_unknown_message_id,
        'root',
        'runtime_message_cost_unknown'
    );
    IF v_status <> 'unknown_cost' OR v_accounted IS NOT NULL THEN
        RAISE EXCEPTION 'Unknown telemetry cost did not fail closed into unknown_cost';
    END IF;

    SELECT reserved_cost INTO v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_conversation_envelope;
    IF v_reserved <> 0.200000000000 THEN
        RAISE EXCEPTION 'Unknown-cost adapter reservation did not retain exposure: %', v_reserved;
    END IF;

    SELECT reservation_id, approved
    INTO v_stale_reservation, v_approved
    FROM comind.cm_reserve_paid_provider_execution(
        v_agent_binding_id, 'openai', 'agent-database-tool', 'tool.database',
        'issue59-agent-stale-' || v_agent_envelope,
        0.200000000000,
        NOW() + INTERVAL '5 minutes'
    );
    IF NOT v_approved THEN
        RAISE EXCEPTION 'Agent execution reservation failed';
    END IF;

    UPDATE public.comind_cost_reservations
    SET expires_at = NOW() - INTERVAL '1 second'
    WHERE id = v_stale_reservation;

    v_count := public.comind_mark_stale_cost_reservations(v_agent_envelope);
    SELECT status INTO v_status
    FROM public.comind_cost_reservations
    WHERE id = v_stale_reservation;
    SELECT reserved_cost INTO v_reserved
    FROM public.comind_workflow_cost_envelopes
    WHERE id = v_agent_envelope;
    IF v_count <> 1 OR v_status <> 'stale' OR v_reserved <> 0.200000000000 THEN
        RAISE EXCEPTION 'Adapter-linked stale agent reservation did not retain exposure';
    END IF;

    v_conflict_seen := FALSE;
    BEGIN
        PERFORM * FROM comind.cm_finalize_paid_provider_message_execution(
            v_stale_reservation,
            v_message_id,
            'root',
            'invalid_agent_message_settlement'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Message telemetry settlement requires a conversation-bound execution' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Agent-run reservation accepted unrelated conversation telemetry';
    END IF;

    PERFORM * FROM public.comind_close_unspent_paid_provider_reservation(
        v_stale_reservation, 'cancelled', 'stale_verified_unspent'
    );

    v_conflict_seen := FALSE;
    BEGIN
        UPDATE comind.cm_budget_authority_binding
        SET execution_kind = 'workflow'
        WHERE binding_id = v_binding_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Current-runtime budget authority adapter provenance is append-only' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Adapter binding mutation was not blocked';
    END IF;

    v_conflict_seen := FALSE;
    BEGIN
        DELETE FROM comind.cm_budget_authority_telemetry
        WHERE reservation_id = v_reservation_id;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM = 'Current-runtime budget authority adapter provenance is append-only' THEN
            v_conflict_seen := TRUE;
        ELSE
            RAISE;
        END IF;
    END;
    IF NOT v_conflict_seen THEN
        RAISE EXCEPTION 'Adapter telemetry deletion was not blocked';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM comind.cm_budget_authority_reservation AS ar
    JOIN comind.cm_budget_authority_binding AS b ON b.binding_id = ar.binding_id
    WHERE b.binding_id IN (v_binding_id, v_agent_binding_id);
    IF v_count < 5 THEN
        RAISE EXCEPTION 'Conversation and agent execution did not share the same accounting authority';
    END IF;
END;
$$;

ROLLBACK;

SELECT 'Current-runtime budget authority adapter deterministic verification passed' AS verification_result;
