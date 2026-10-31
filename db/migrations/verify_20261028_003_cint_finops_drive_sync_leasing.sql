-- CINT-FINOPS-002 structural and bounded state-machine verification.
-- Runs only against an isolated fixture database. No Google call and no provider call.

DO $$
DECLARE
    v_missing text[];
    v_public_grants integer;
BEGIN
    SELECT array_agg(name)
    INTO v_missing
    FROM (
        VALUES
            ('drive_sync_attempt_count'),
            ('drive_sync_claim_token'),
            ('drive_sync_claimed_at'),
            ('drive_sync_last_attempt_at'),
            ('drive_receipt_file_id'),
            ('drive_receipt_file_url')
    ) AS required(name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'comind'
          AND table_name = 'cm_api_cost_receipt'
          AND column_name = required.name
    );

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'CINT-FINOPS-002 verifier missing receipt sync columns: %', v_missing;
    END IF;

    IF to_regprocedure('comind.cm_claim_api_cost_drive_sync(integer,interval)') IS NULL
       OR to_regprocedure('comind.cm_complete_api_cost_drive_sync(uuid,uuid,text,text,text,text)') IS NULL
       OR to_regprocedure('comind.cm_fail_api_cost_drive_sync(uuid,uuid,text)') IS NULL THEN
        RAISE EXCEPTION 'CINT-FINOPS-002 verifier missing narrow sync functions';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_api_cost_receipt'::regclass
          AND conname = 'cm_api_cost_receipt_drive_claim_ck'
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'comind.cm_api_cost_receipt'::regclass
          AND conname = 'cm_api_cost_receipt_drive_complete_ck'
    ) THEN
        RAISE EXCEPTION 'Drive sync coherence constraints are missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'comind'
          AND tablename = 'cm_api_cost_receipt'
          AND indexname = 'cm_api_cost_receipt_drive_sync_idx'
          AND indexdef LIKE '%syncing%'
    ) THEN
        RAISE EXCEPTION 'Drive sync recovery index does not cover syncing work';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'comind'
          AND p.proname = 'cm_claim_api_cost_drive_sync'
          AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'comind'
          AND p.proname = 'cm_complete_api_cost_drive_sync'
          AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'comind'
          AND p.proname = 'cm_fail_api_cost_drive_sync'
          AND p.prosecdef
          AND p.proconfig @> ARRAY['search_path=pg_catalog']::text[]
    ) THEN
        RAISE EXCEPTION 'Drive sync privileged functions must pin search_path to pg_catalog';
    END IF;

    SELECT count(*)::integer
    INTO v_public_grants
    FROM information_schema.routine_privileges
    WHERE specific_schema = 'comind'
      AND routine_name IN (
          'cm_claim_api_cost_drive_sync',
          'cm_complete_api_cost_drive_sync',
          'cm_fail_api_cost_drive_sync'
      )
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type = 'EXECUTE';

    IF v_public_grants <> 0 THEN
        RAISE EXCEPTION 'Ordinary roles unexpectedly execute Drive sync functions';
    END IF;

    IF to_regrole('service_role') IS NOT NULL THEN
        IF NOT has_function_privilege(
            'service_role',
            'comind.cm_claim_api_cost_drive_sync(integer,interval)',
            'EXECUTE'
        ) OR NOT has_function_privilege(
            'service_role',
            'comind.cm_complete_api_cost_drive_sync(uuid,uuid,text,text,text,text)',
            'EXECUTE'
        ) OR NOT has_function_privilege(
            'service_role',
            'comind.cm_fail_api_cost_drive_sync(uuid,uuid,text)',
            'EXECUTE'
        ) THEN
            RAISE EXCEPTION 'service_role lacks the narrow Drive sync function boundary';
        END IF;

        IF has_table_privilege('service_role', 'comind.cm_api_cost_receipt', 'UPDATE')
           OR has_table_privilege('service_role', 'comind.cm_api_cost_receipt', 'DELETE')
           OR has_table_privilege('service_role', 'comind.cm_api_cost_receipt', 'TRUNCATE') THEN
            RAISE EXCEPTION 'CINT-FINOPS-002 must not grant service_role broad receipt-table mutation';
        END IF;
    END IF;
END;
$$;

BEGIN;

DO $$
DECLARE
    v_receipt_id uuid;
    v_receipt_number text;
    v_execution_id uuid;
    v_actual_cost numeric;
    v_claim_token uuid;
    v_second_claim_token uuid;
    v_prior_status text;
    v_attempt_count integer;
    v_count integer;
    v_applied boolean;
    v_rejected boolean := false;
BEGIN
    SELECT receipt_id, receipt_number, execution_id, actual_cost
    INTO v_receipt_id, v_receipt_number, v_execution_id, v_actual_cost
    FROM comind.cm_api_cost_receipt
    WHERE drive_sync_status = 'pending'
    ORDER BY transaction_at, receipt_id
    LIMIT 1;

    IF v_receipt_id IS NULL THEN
        RAISE EXCEPTION 'CINT-FINOPS-002 behavior proof requires one pending synthetic receipt from the isolated CINT-FINOPS-003 fixture';
    END IF;

    SELECT claim_token, prior_status, attempt_count
    INTO v_claim_token, v_prior_status, v_attempt_count
    FROM comind.cm_claim_api_cost_drive_sync(1, interval '30 minutes')
    WHERE receipt_id = v_receipt_id;

    IF v_claim_token IS NULL OR v_prior_status <> 'pending' OR v_attempt_count <> 1 THEN
        RAISE EXCEPTION 'Initial Drive sync claim mismatch: token %, prior %, attempts %',
            v_claim_token, v_prior_status, v_attempt_count;
    END IF;

    SELECT count(*)::integer
    INTO v_count
    FROM comind.cm_claim_api_cost_drive_sync(1, interval '30 minutes');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Fresh Drive sync claim was leased twice';
    END IF;

    SELECT comind.cm_fail_api_cost_drive_sync(
        v_receipt_id,
        v_claim_token,
        'synthetic forced Google write failure'
    ) INTO v_applied;
    IF NOT v_applied THEN
        RAISE EXCEPTION 'First forced Drive failure did not apply';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM comind.cm_api_cost_receipt
        WHERE receipt_id = v_receipt_id
          AND drive_sync_status = 'error'
          AND drive_sync_error = 'synthetic forced Google write failure'
          AND drive_sync_claim_token IS NULL
          AND drive_sync_claimed_at IS NULL
          AND drive_sync_attempt_count = 1
    ) THEN
        RAISE EXCEPTION 'Forced Drive failure did not preserve retryable error evidence';
    END IF;

    SELECT claim_token, prior_status, attempt_count
    INTO v_second_claim_token, v_prior_status, v_attempt_count
    FROM comind.cm_claim_api_cost_drive_sync(1, interval '30 minutes')
    WHERE receipt_id = v_receipt_id;

    IF v_second_claim_token IS NULL
       OR v_second_claim_token = v_claim_token
       OR v_prior_status <> 'error'
       OR v_attempt_count <> 2 THEN
        RAISE EXCEPTION 'Drive failure recovery claim mismatch';
    END IF;

    SELECT comind.cm_complete_api_cost_drive_sync(
        v_receipt_id,
        v_second_claim_token,
        'synthetic-private-sheet-id',
        'Cost Register!2',
        'synthetic-private-receipt-file-id',
        'https://drive.google.com/file/d/synthetic-private-receipt-file-id/view'
    ) INTO v_applied;
    IF NOT v_applied THEN
        RAISE EXCEPTION 'Recovered Drive sync completion did not apply';
    END IF;

    SELECT comind.cm_complete_api_cost_drive_sync(
        v_receipt_id,
        v_second_claim_token,
        'synthetic-private-sheet-id',
        'Cost Register!2',
        'synthetic-private-receipt-file-id',
        'https://drive.google.com/file/d/synthetic-private-receipt-file-id/view'
    ) INTO v_applied;
    IF v_applied THEN
        RAISE EXCEPTION 'Exact Drive completion replay should be idempotent, not a second mutation';
    END IF;

    BEGIN
        PERFORM comind.cm_complete_api_cost_drive_sync(
            v_receipt_id,
            v_second_claim_token,
            'different-sheet-id',
            'Cost Register!99',
            'different-receipt-file-id',
            'https://drive.google.com/file/d/different-receipt-file-id/view'
        );
    EXCEPTION WHEN OTHERS THEN
        v_rejected := true;
    END;
    IF NOT v_rejected THEN
        RAISE EXCEPTION 'Conflicting Drive completion replay was not rejected';
    END IF;

    SELECT count(*)::integer
    INTO v_count
    FROM comind.cm_claim_api_cost_drive_sync(1, interval '30 minutes');
    IF v_count <> 0 THEN
        RAISE EXCEPTION 'Synced receipt was re-claimed';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM comind.cm_api_cost_receipt
        WHERE receipt_id = v_receipt_id
          AND receipt_number = v_receipt_number
          AND execution_id = v_execution_id
          AND actual_cost = v_actual_cost
          AND drive_sync_status = 'synced'
          AND drive_register_file_id = 'synthetic-private-sheet-id'
          AND drive_row_key = 'Cost Register!2'
          AND drive_receipt_file_id = 'synthetic-private-receipt-file-id'
          AND drive_sync_attempt_count = 2
          AND drive_sync_error IS NULL
          AND drive_sync_claim_token IS NULL
          AND drive_sync_claimed_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Drive sync completion or immutable financial facts mismatch';
    END IF;
END;
$$;

ROLLBACK;
