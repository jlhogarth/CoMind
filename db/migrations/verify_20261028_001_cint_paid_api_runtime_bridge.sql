-- CINT-FINOPS-003 bounded verification.
-- Synthetic fixtures only. Entire behavior proof rolls back. No provider call.

DO $$
DECLARE
    v_missing text[];
    v_unsafe_privilege_count integer;
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('comind.cm_paid_api_execution.provider_execution_fingerprint'),
            ('comind.cm_admit_paid_api_execution(uuid,uuid,bigint,text,text,text,integer,bigint,bigint,integer,integer,uuid,bigint)'),
            ('comind.cm_reconcile_paid_api_execution_from_message(uuid,uuid,text)'),
            ('comind.cm_fail_paid_api_execution(uuid,text,text)')
    ) AS required(name)
    WHERE CASE
        WHEN name LIKE '%.provider_execution_fingerprint' THEN NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'comind'
              AND table_name = 'cm_paid_api_execution'
              AND column_name = 'provider_execution_fingerprint'
        )
        ELSE to_regprocedure(name) IS NULL
    END;

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-FINOPS-003 verifier missing objects: %', v_missing;
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'comind.cm_admit_paid_api_execution(uuid,uuid,bigint,text,text,text,integer,bigint,bigint,integer,integer,uuid,bigint)',
        'EXECUTE'
    ) OR NOT has_function_privilege(
        'service_role',
        'comind.cm_reconcile_paid_api_execution_from_message(uuid,uuid,text)',
        'EXECUTE'
    ) OR NOT has_function_privilege(
        'service_role',
        'comind.cm_fail_paid_api_execution(uuid,text,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'service_role lacks the narrow CINT-FINOPS-003 runtime function boundary';
    END IF;

    IF has_function_privilege(
        'anon',
        'comind.cm_admit_paid_api_execution(uuid,uuid,bigint,text,text,text,integer,bigint,bigint,integer,integer,uuid,bigint)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'comind.cm_admit_paid_api_execution(uuid,uuid,bigint,text,text,text,integer,bigint,bigint,integer,integer,uuid,bigint)',
        'EXECUTE'
    ) OR has_function_privilege(
        'anon',
        'comind.cm_reconcile_paid_api_execution_from_message(uuid,uuid,text)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'comind.cm_reconcile_paid_api_execution_from_message(uuid,uuid,text)',
        'EXECUTE'
    ) OR has_function_privilege(
        'anon',
        'comind.cm_fail_paid_api_execution(uuid,text,text)',
        'EXECUTE'
    ) OR has_function_privilege(
        'authenticated',
        'comind.cm_fail_paid_api_execution(uuid,text,text)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'Ordinary Data API roles unexpectedly execute CINT-FINOPS-003 runtime functions';
    END IF;

    SELECT count(*)::integer
    INTO v_unsafe_privilege_count
    FROM information_schema.role_table_grants
    WHERE table_schema = 'comind'
      AND table_name IN (
          'cm_paid_api_access_proposal',
          'cm_paid_api_execution',
          'cm_api_cost_receipt'
      )
      AND grantee = 'service_role'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

    IF v_unsafe_privilege_count <> 0 THEN
        RAISE EXCEPTION 'CINT-FINOPS-003 must not grant service_role broad financial-table mutation privileges';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'comind'
          AND p.proname = 'cm_admit_paid_api_execution'
          AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'comind'
          AND p.proname = 'cm_reconcile_paid_api_execution_from_message'
          AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'comind'
          AND p.proname = 'cm_fail_paid_api_execution'
          AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) THEN
        RAISE EXCEPTION 'Privileged runtime functions must use fixed pg_catalog-only search_path';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'comind'
          AND tablename = 'cm_paid_api_execution'
          AND indexname = 'cm_paid_api_execution_reservation_uq'
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'comind'
          AND tablename = 'cm_paid_api_execution'
          AND indexname = 'cm_paid_api_execution_provider_fingerprint_uq'
          AND indexdef LIKE 'CREATE UNIQUE INDEX%'
    ) THEN
        RAISE EXCEPTION 'Runtime bridge idempotency indexes are missing';
    END IF;
END;
$$;

BEGIN;

DO $$
DECLARE
    v_project_id uuid;
    v_org_id uuid;
    v_provider_id bigint;
    v_conversation_id uuid;
    v_proposal_id uuid;
    v_envelope_id bigint;
    v_binding_id uuid;
    v_reservation_id bigint;
    v_message_id uuid;
    v_execution_id uuid;
    v_execution_id_replay uuid;
    v_usage_event_id bigint;
    v_receipt_id uuid;
    v_receipt_number text;
    v_actual numeric;
    v_status text;
    v_idempotent boolean;
    v_count integer;
    v_fingerprint text := 'sha256:' || repeat('a', 64);
    v_conflicting_fingerprint text := 'sha256:' || repeat('b', 64);
    v_rejected boolean := false;
BEGIN
    SELECT project_id, org_id
    INTO v_project_id, v_org_id
    FROM comind.cm_project
    WHERE project_code = 'CINT'::citext;

    SELECT id
    INTO v_provider_id
    FROM public.comind_service_providers
    WHERE provider_code = 'openai'
      AND active;

    IF v_project_id IS NULL OR v_provider_id IS NULL THEN
        RAISE EXCEPTION 'CINT-FINOPS-003 proof requires canonical CINT and active OpenAI provider';
    END IF;

    INSERT INTO comind.cm_conversation (
        org_id, project_id, source, title, metadata
    ) VALUES (
        v_org_id,
        v_project_id,
        'synthetic_cint_finops_003',
        'Synthetic CINT-FINOPS-003 runtime bridge proof',
        jsonb_build_object('synthetic', true, 'provider_call', false)
    ) RETURNING conv_id INTO v_conversation_id;

    INSERT INTO comind.cm_paid_api_access_proposal (
        project_id,
        purpose,
        expected_benefit,
        success_criteria,
        provider_id,
        model_or_service,
        pricing_source_url,
        pricing_source_version,
        pricing_verified_at,
        pricing_snapshot,
        expected_cost,
        max_spend,
        currency,
        max_requests,
        max_input_tokens,
        max_output_tokens,
        max_total_tokens,
        max_tool_calls,
        max_retries,
        stop_conditions,
        proposal_status,
        approval_source_system,
        approval_source_ref,
        approved_at
    ) VALUES (
        v_project_id,
        'Synthetic CINT-FINOPS-003 runtime admission and reconciliation proof',
        'Prove founder-approved scope dominates runtime and exactly one internal receipt follows authoritative settlement',
        jsonb_build_array('one admitted request', 'one authoritative usage event', 'one internal receipt'),
        v_provider_id,
        'gpt-6-luna',
        'https://example.invalid/cint-finops-003-pricing',
        'synthetic-fixture',
        now(),
        jsonb_build_object('synthetic', true),
        0.00002000,
        0.00100000,
        'USD',
        1,
        500,
        512,
        1012,
        0,
        0,
        jsonb_build_array('one synthetic request only'),
        'approved',
        'synthetic_test',
        'ci:cint-finops-003',
        now()
    ) RETURNING proposal_id INTO v_proposal_id;

    INSERT INTO public.comind_workflow_cost_envelopes (
        objective,
        environment,
        capability_level,
        estimated_cost,
        soft_limit_amount,
        hard_limit_amount,
        actual_cost,
        reserved_cost,
        currency,
        max_iterations,
        max_duration_seconds,
        permitted_provider_codes,
        stop_conditions,
        status
    ) VALUES (
        'Synthetic CINT-FINOPS-003 runtime bridge proof',
        'test',
        2,
        0.00002000,
        0.00050000,
        0.00100000,
        0,
        0,
        'USD',
        1,
        300,
        jsonb_build_array('openai'),
        jsonb_build_array('one synthetic request only'),
        'authorized'
    ) RETURNING id INTO v_envelope_id;

    SELECT comind.cm_bind_budget_authority_envelope(
        v_envelope_id,
        'conversation',
        v_project_id,
        NULL,
        NULL,
        NULL,
        v_conversation_id
    ) INTO v_binding_id;

    SELECT reservation_id
    INTO v_reservation_id
    FROM comind.cm_reserve_paid_provider_execution(
        v_binding_id,
        'openai',
        'responses.create',
        'root',
        'provider-execution:' || v_fingerprint,
        0.00030000,
        now() + interval '10 minutes'
    )
    WHERE approved;

    IF v_reservation_id IS NULL THEN
        RAISE EXCEPTION 'Synthetic governed provider reservation was not approved';
    END IF;

    SELECT execution_id, execution_status, idempotent
    INTO v_execution_id, v_status, v_idempotent
    FROM comind.cm_admit_paid_api_execution(
        v_proposal_id,
        v_binding_id,
        v_reservation_id,
        'openai',
        'gpt-6-luna',
        v_fingerprint,
        1,
        100,
        512,
        0,
        0,
        NULL,
        NULL
    );

    IF v_execution_id IS NULL OR v_status <> 'running' OR v_idempotent THEN
        RAISE EXCEPTION 'Initial paid runtime admission returned unexpected result: %, %, %',
            v_execution_id, v_status, v_idempotent;
    END IF;

    SELECT execution_id, idempotent
    INTO v_execution_id_replay, v_idempotent
    FROM comind.cm_admit_paid_api_execution(
        v_proposal_id,
        v_binding_id,
        v_reservation_id,
        'openai',
        'gpt-6-luna',
        v_fingerprint,
        1,
        100,
        512,
        0,
        0,
        NULL,
        NULL
    );

    IF v_execution_id_replay <> v_execution_id OR NOT v_idempotent THEN
        RAISE EXCEPTION 'Exact admission replay was not idempotent';
    END IF;

    v_rejected := false;
    BEGIN
        PERFORM * FROM comind.cm_admit_paid_api_execution(
            v_proposal_id, v_binding_id, v_reservation_id,
            'openai', 'gpt-6-luna', v_fingerprint,
            1, 501, 512, 0, 0, NULL, NULL
        );
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Over-scope input-token admission was not rejected';
    END IF;

    v_rejected := false;
    BEGIN
        PERFORM * FROM comind.cm_admit_paid_api_execution(
            v_proposal_id, v_binding_id, v_reservation_id,
            'openai', 'gpt-6-luna', v_conflicting_fingerprint,
            1, 100, 512, 0, 0, NULL, NULL
        );
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Conflicting fingerprint reuse of one reservation was not rejected';
    END IF;

    -- Reconciliation is forbidden before authoritative FinOps settlement exists.
    v_rejected := false;
    BEGIN
        PERFORM * FROM comind.cm_reconcile_paid_api_execution_from_message(
            v_execution_id,
            gen_random_uuid(),
            'root'
        );
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Paid execution reconciled without authoritative telemetry/usage evidence';
    END IF;

    SELECT count(*)::integer INTO v_count
    FROM comind.cm_api_cost_receipt
    WHERE execution_id = v_execution_id;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Internal receipt was issued before authoritative settlement';
    END IF;

    INSERT INTO comind.cm_message (
        conv_id, role, content, meta
    ) VALUES (
        v_conversation_id,
        'assistant',
        'Synthetic CINT-FINOPS-003 response. No provider call occurred.',
        jsonb_build_object(
            'provider', 'openai',
            'model', 'gpt-6-luna',
            'requested_model', 'gpt-6-luna',
            'canonical_model', 'gpt-6-luna',
            'processing_mode', 'standard',
            'execution_role', 'root',
            'attempt_number', 1,
            'request_fingerprint', v_fingerprint,
            'max_retries', 0,
            'response_id', 'resp-cint-finops-003-synthetic-1',
            'status', 'succeeded',
            'usage', jsonb_build_object(
                'input_tokens', 100,
                'cached_input_tokens', 20,
                'output_tokens', 20,
                'reasoning_tokens', 5,
                'total_tokens', 120
            ),
            'cost', jsonb_build_object(
                'estimated_cost_usd', 0.00002000,
                'currency', 'USD',
                'rate_card_version', 'synthetic-cint-finops-003',
                'pricing_source', 'https://example.invalid/cint-finops-003-pricing'
            )
        )
    ) RETURNING msg_id INTO v_message_id;

    PERFORM *
    FROM comind.cm_finalize_paid_provider_message_execution(
        v_reservation_id,
        v_message_id,
        'root',
        'cint_finops_003_synthetic_settlement'
    );

    SELECT execution_id, usage_event_id, receipt_id, receipt_number,
           actual_expense, provider_status, idempotent
    INTO v_execution_id_replay, v_usage_event_id, v_receipt_id, v_receipt_number,
         v_actual, v_status, v_idempotent
    FROM comind.cm_reconcile_paid_api_execution_from_message(
        v_execution_id,
        v_message_id,
        'root'
    );

    IF v_execution_id_replay <> v_execution_id
       OR v_usage_event_id IS NULL
       OR v_receipt_id IS NULL
       OR v_receipt_number !~ '^COMIND-API-[0-9]{8}-[0-9]{10}$'
       OR v_actual IS DISTINCT FROM 0.000020000000
       OR v_status <> 'succeeded'
       OR v_idempotent THEN
        RAISE EXCEPTION 'Runtime reconciliation result mismatch: execution %, usage %, receipt %, amount %, status %, idempotent %',
            v_execution_id_replay, v_usage_event_id, v_receipt_id, v_actual, v_status, v_idempotent;
    END IF;

    SELECT count(*)::integer INTO v_count
    FROM comind.cm_api_cost_receipt
    WHERE execution_id = v_execution_id
      AND actual_cost = 0.00002000
      AND input_tokens = 100
      AND cached_input_tokens = 20
      AND output_tokens = 20
      AND reasoning_tokens = 5
      AND total_tokens = 120
      AND provider_event_id = 'resp-cint-finops-003-synthetic-1';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Exactly one internal receipt with expected cost/token/provider evidence was not issued';
    END IF;

    SELECT count(*)::integer INTO v_count
    FROM comind.cm_unattributed_paid_usage_v
    WHERE reservation_id = v_reservation_id;
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Governed reconciled usage remains unattributed after runtime bridge reconciliation';
    END IF;

    SELECT execution_id, receipt_id, actual_expense, provider_status, idempotent
    INTO v_execution_id_replay, v_receipt_id, v_actual, v_status, v_idempotent
    FROM comind.cm_reconcile_paid_api_execution_from_message(
        v_execution_id,
        v_message_id,
        'root'
    );

    IF v_execution_id_replay <> v_execution_id
       OR v_receipt_id IS NULL
       OR v_actual IS DISTINCT FROM 0.00002000
       OR v_status <> 'succeeded'
       OR NOT v_idempotent THEN
        RAISE EXCEPTION 'Reconciliation replay was not exactly idempotent';
    END IF;

    SELECT count(*)::integer INTO v_count
    FROM comind.cm_api_cost_receipt
    WHERE execution_id = v_execution_id;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'Reconciliation replay duplicated internal receipts';
    END IF;
END;
$$;

ROLLBACK;

SELECT
    'pass' AS status,
    'CINT-FINOPS-003 least-privilege runtime admission, scope enforcement, replay resistance, authoritative FinOps reconciliation, and exactly-once internal receipt issuance verified' AS detail;
