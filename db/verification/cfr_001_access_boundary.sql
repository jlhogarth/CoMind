-- CFR-001 access-boundary verification
-- Issue #176
-- Test only.

DO $$
DECLARE
  v_bad_count integer;
BEGIN
  SELECT count(*)
    INTO v_bad_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'comind'
    AND p.proname IN (
      'cm_record_conversation_capture_event',
      'cm_capture_user_message',
      'cm_start_assistant_generation',
      'cm_append_assistant_delta',
      'cm_complete_assistant_generation',
      'cm_interrupt_assistant_generation',
      'cm_fail_assistant_generation',
      'cm_create_recovery_checkpoint',
      'cm_assert_conversation_prunable'
    )
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
    );

  IF v_bad_count <> 0 THEN
    RAISE EXCEPTION 'CFR function privilege boundary failed for % function(s)', v_bad_count;
  END IF;

  IF has_schema_privilege('anon', 'comind', 'USAGE')
     OR has_schema_privilege('authenticated', 'comind', 'USAGE') THEN
    RAISE EXCEPTION 'public client roles unexpectedly have USAGE on private comind schema';
  END IF;
END;
$$;

BEGIN;
SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_conv_id uuid;
  v_user_msg_id uuid;
  v_generation_id uuid;
  v_checkpoint_id uuid;
  v_status text;
  v_partial text;
BEGIN
  INSERT INTO comind.cm_conversation (source, title, external_ref, metadata)
  VALUES (
    'cfr_service_role_test',
    'CFR-001 service role capture proof',
    'cfr-001:test:service-role:' || gen_random_uuid()::text,
    jsonb_build_object('synthetic', true, 'issue', 176, 'identity', 'service_role')
  )
  RETURNING conv_id INTO v_conv_id;

  v_user_msg_id := comind.cm_capture_user_message(
    v_conv_id,
    'Verify the private service identity can use CFR capture.',
    'cfr_service_role_test',
    'user-1',
    jsonb_build_object('synthetic', true),
    '{}'::jsonb
  );

  v_generation_id := comind.cm_start_assistant_generation(
    v_conv_id,
    v_user_msg_id,
    'synthetic_provider',
    'synthetic_model',
    'cfr_service_role_test',
    'generation-start',
    jsonb_build_object('identity', 'service_role')
  );

  PERFORM comind.cm_append_assistant_delta(
    v_generation_id,
    'Service-role capture works before interruption.',
    'cfr_service_role_test',
    'delta-1',
    '{}'::jsonb
  );

  PERFORM comind.cm_interrupt_assistant_generation(
    v_generation_id,
    'synthetic_service_role_test',
    'cfr_service_role_test',
    'generation-interrupted',
    '{}'::jsonb
  );

  v_checkpoint_id := comind.cm_create_recovery_checkpoint(
    v_conv_id,
    v_generation_id,
    'service_role_acceptance'
  );

  SELECT generation_status, partial_assistant_content
    INTO v_status, v_partial
  FROM comind.v_conversation_recovery_state
  WHERE generation_id = v_generation_id;

  IF v_status <> 'interrupted' THEN
    RAISE EXCEPTION 'service_role lifecycle status mismatch: %', v_status;
  END IF;

  IF v_partial <> 'Service-role capture works before interruption.' THEN
    RAISE EXCEPTION 'service_role recovery mismatch: %', v_partial;
  END IF;
END;
$$;

COMMIT;

SELECT 'PASS' AS cfr_001_access_boundary;
