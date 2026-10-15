\set ON_ERROR_STOP on

DO $$
DECLARE
    v_metadata jsonb;
    v_relation_count integer;
    v_fk_count integer;
BEGIN
    IF to_regclass('public.operator_console_relation_registry') IS NULL THEN
        RAISE EXCEPTION 'operator_console_relation_registry is missing';
    END IF;
    IF to_regclass('public.operator_console_verification_records') IS NULL THEN
        RAISE EXCEPTION 'operator_console_verification_records is missing';
    END IF;
    IF to_regclass('public.operator_console_mutation_audit') IS NULL THEN
        RAISE EXCEPTION 'operator_console_mutation_audit is missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
              'operator_console_relation_registry',
              'operator_console_verification_records',
              'operator_console_mutation_audit'
          )
          AND NOT c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'all Operator Console support tables must have RLS enabled';
    END IF;

    IF has_table_privilege('anon', 'public.operator_console_relation_registry', 'SELECT')
       OR has_table_privilege('authenticated', 'public.operator_console_relation_registry', 'SELECT')
       OR has_table_privilege('anon', 'public.operator_console_verification_records', 'SELECT')
       OR has_table_privilege('authenticated', 'public.operator_console_verification_records', 'SELECT')
       OR has_table_privilege('anon', 'public.operator_console_mutation_audit', 'SELECT')
       OR has_table_privilege('authenticated', 'public.operator_console_mutation_audit', 'SELECT') THEN
        RAISE EXCEPTION 'ordinary Data API roles must not read Operator Console support tables';
    END IF;

    IF NOT has_table_privilege('service_role', 'public.operator_console_relation_registry', 'SELECT')
       OR NOT has_table_privilege('service_role', 'public.operator_console_verification_records', 'INSERT')
       OR NOT has_table_privilege('service_role', 'public.operator_console_verification_records', 'DELETE')
       OR NOT has_table_privilege('service_role', 'public.operator_console_mutation_audit', 'INSERT') THEN
        RAISE EXCEPTION 'service_role is missing required Operator Console support privileges';
    END IF;

    IF has_table_privilege('service_role', 'public.operator_console_mutation_audit', 'UPDATE')
       OR has_table_privilege('service_role', 'public.operator_console_mutation_audit', 'DELETE') THEN
        RAISE EXCEPTION 'service_role must not receive direct audit UPDATE or DELETE privileges';
    END IF;

    IF has_function_privilege('anon', 'public.operator_console_schema_metadata()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.operator_console_schema_metadata()', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.operator_console_schema_metadata()', 'EXECUTE') THEN
        RAISE EXCEPTION 'schema metadata function execution grants are incorrect';
    END IF;

    IF has_function_privilege('anon', 'public.operator_console_apply_mutation(jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.operator_console_apply_mutation(jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.operator_console_apply_mutation(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'admin mutation function execution grants are incorrect';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.operator_console_relation_registry
        WHERE schema_name = 'public' AND relation_name = 'users'
          AND browser_read AND admin_insert AND admin_update
          AND NOT admin_delete AND NOT destructive_allowed AND enabled
    ) OR NOT EXISTS (
        SELECT 1 FROM public.operator_console_relation_registry
        WHERE schema_name = 'public' AND relation_name = 'posts'
          AND browser_read AND admin_insert AND admin_update
          AND NOT admin_delete AND NOT destructive_allowed AND enabled
    ) OR NOT EXISTS (
        SELECT 1 FROM public.operator_console_relation_registry
        WHERE schema_name = 'public' AND relation_name = 'comments'
          AND browser_read AND admin_insert AND admin_update
          AND NOT admin_delete AND NOT destructive_allowed AND enabled
    ) OR NOT EXISTS (
        SELECT 1 FROM public.operator_console_relation_registry
        WHERE schema_name = 'public' AND relation_name = 'operator_console_verification_records'
          AND NOT browser_read AND admin_insert AND admin_update
          AND admin_delete AND destructive_allowed AND enabled
    ) THEN
        RAISE EXCEPTION 'relation registry does not match the OC-002 authority boundary';
    END IF;

    v_metadata := public.operator_console_schema_metadata();
    SELECT jsonb_array_length(v_metadata->'relations'), jsonb_array_length(v_metadata->'foreignKeys')
    INTO v_relation_count, v_fk_count;

    IF v_relation_count <> 3 THEN
        RAISE EXCEPTION 'metadata must expose exactly 3 browser-readable relations, found %', v_relation_count;
    END IF;
    IF v_fk_count <> 3 THEN
        RAISE EXCEPTION 'metadata must expose exactly 3 fixture foreign keys, found %', v_fk_count;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_metadata->'relations') r
        WHERE r->>'schema' <> 'public'
           OR r->>'name' NOT IN ('users', 'posts', 'comments')
    ) THEN
        RAISE EXCEPTION 'metadata exposed a relation outside the browser allowlist';
    END IF;
END;
$$;

DO $$
DECLARE
    v_insert_request uuid := gen_random_uuid();
    v_update_request uuid := gen_random_uuid();
    v_delete_request uuid := gen_random_uuid();
    v_denied_request uuid := gen_random_uuid();
    v_record_key text := 'oc002-' || gen_random_uuid()::text;
    v_insert_result jsonb;
    v_replay_result jsonb;
    v_update_result jsonb;
    v_delete_result jsonb;
    v_denied_result jsonb;
    v_id uuid;
    v_audit_id uuid;
    v_append_only_blocked boolean := false;
BEGIN
    v_insert_result := public.operator_console_apply_mutation(jsonb_build_object(
        'requestId', v_insert_request,
        'actor', 'oc-002-isolated-verification',
        'operation', 'insert',
        'schema', 'public',
        'relation', 'operator_console_verification_records',
        'values', jsonb_build_object('record_key', v_record_key, 'payload', jsonb_build_object('stage', 'insert')),
        'provenance', jsonb_build_object('environment', 'isolated-postgresql', 'issue', 118)
    ));
    IF COALESCE((v_insert_result->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'verification insert failed: %', v_insert_result;
    END IF;
    v_id := (v_insert_result->'row'->>'id')::uuid;

    v_replay_result := public.operator_console_apply_mutation(jsonb_build_object(
        'requestId', v_insert_request,
        'actor', 'oc-002-isolated-verification',
        'operation', 'insert',
        'schema', 'public',
        'relation', 'operator_console_verification_records',
        'values', jsonb_build_object('record_key', v_record_key, 'payload', jsonb_build_object('stage', 'insert')),
        'provenance', jsonb_build_object('environment', 'isolated-postgresql', 'issue', 118)
    ));
    IF COALESCE((v_replay_result->>'success')::boolean, false) IS NOT TRUE
       OR COALESCE((v_replay_result->>'replayed')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'successful request replay was not idempotent: %', v_replay_result;
    END IF;
    IF (SELECT count(*) FROM public.operator_console_verification_records WHERE id = v_id) <> 1 THEN
        RAISE EXCEPTION 'request replay duplicated the verification record';
    END IF;

    v_update_result := public.operator_console_apply_mutation(jsonb_build_object(
        'requestId', v_update_request,
        'actor', 'oc-002-isolated-verification',
        'operation', 'update',
        'schema', 'public',
        'relation', 'operator_console_verification_records',
        'key', jsonb_build_object('id', v_id),
        'values', jsonb_build_object('payload', jsonb_build_object('stage', 'update')),
        'provenance', jsonb_build_object('environment', 'isolated-postgresql', 'issue', 118)
    ));
    IF COALESCE((v_update_result->>'success')::boolean, false) IS NOT TRUE
       OR v_update_result->'row'->'payload'->>'stage' <> 'update' THEN
        RAISE EXCEPTION 'verification update failed: %', v_update_result;
    END IF;

    v_denied_result := public.operator_console_apply_mutation(jsonb_build_object(
        'requestId', v_denied_request,
        'actor', 'oc-002-isolated-verification',
        'operation', 'delete',
        'schema', 'public',
        'relation', 'users',
        'key', jsonb_build_object('id', gen_random_uuid()),
        'provenance', jsonb_build_object('environment', 'isolated-postgresql', 'issue', 118)
    ));
    IF COALESCE((v_denied_result->>'success')::boolean, true) IS NOT FALSE
       OR v_denied_result->>'errorCode' <> '42501' THEN
        RAISE EXCEPTION 'non-delegated destructive mutation was not denied: %', v_denied_result;
    END IF;

    v_delete_result := public.operator_console_apply_mutation(jsonb_build_object(
        'requestId', v_delete_request,
        'actor', 'oc-002-isolated-verification',
        'operation', 'delete',
        'schema', 'public',
        'relation', 'operator_console_verification_records',
        'key', jsonb_build_object('id', v_id),
        'provenance', jsonb_build_object('environment', 'isolated-postgresql', 'issue', 118, 'testData', true)
    ));
    IF COALESCE((v_delete_result->>'success')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'verification cleanup delete failed: %', v_delete_result;
    END IF;
    IF EXISTS (SELECT 1 FROM public.operator_console_verification_records WHERE id = v_id) THEN
        RAISE EXCEPTION 'verification record remained after delegated test-data delete';
    END IF;

    IF (SELECT count(*) FROM public.operator_console_mutation_audit WHERE request_id IN (
        v_insert_request, v_update_request, v_delete_request, v_denied_request
    )) <> 4 THEN
        RAISE EXCEPTION 'expected one durable audit row per unique mutation request';
    END IF;

    SELECT audit_id INTO v_audit_id
    FROM public.operator_console_mutation_audit
    WHERE request_id = v_insert_request;

    BEGIN
        UPDATE public.operator_console_mutation_audit
        SET actor = 'tamper-attempt'
        WHERE audit_id = v_audit_id;
    EXCEPTION WHEN SQLSTATE '55000' THEN
        v_append_only_blocked := true;
    END;

    IF NOT v_append_only_blocked THEN
        RAISE EXCEPTION 'append-only audit trigger did not block UPDATE';
    END IF;
END;
$$;

SELECT 'OC-002 operator console database contract verified' AS verification_result;
