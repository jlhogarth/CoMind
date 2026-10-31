BEGIN;

DO $$
DECLARE
  v_project_id uuid;
  v_conv_id uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  v_unscoped_conv_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  v_org_id uuid := '22222222-2222-4222-8222-222222222222'::uuid;
  v_conversation_project_id uuid := '33333333-3333-4333-8333-333333333333'::uuid;
  v_other_project_id uuid := '44444444-4444-4444-8444-444444444444'::uuid;
  v_first jsonb;
  v_second jsonb;
  v_resolved jsonb;
  v_decision jsonb;
  v_review_id uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_project_id
  FROM comind_pm.pm_projects
  WHERE project_key = 'COMIND';
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'COMIND governance project is missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'comind_pm'
    AND c.relname IN ('pm_conversation_governance_bindings','pm_conversation_egress_review_events')
    AND c.relrowsecurity;
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Both conversation governance tables must have RLS enabled';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'comind_pm'
    AND tablename IN ('pm_conversation_governance_bindings','pm_conversation_egress_review_events')
    AND policyname = 'private_deny_all'
    AND permissive = 'RESTRICTIVE';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Both conversation governance tables must have restrictive deny-all policies';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants
    WHERE table_schema = 'comind_pm'
      AND table_name IN ('pm_conversation_governance_bindings','pm_conversation_egress_review_events')
      AND grantee IN ('PUBLIC','anon','authenticated','service_role')
  ) THEN
    RAISE EXCEPTION 'Conversation governance table grant leak detected';
  END IF;

  IF has_function_privilege('anon','comind_pm.resolve_conversation_execution_governance(text,uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','comind_pm.resolve_conversation_execution_governance(text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Conversation resolver is exposed to client roles';
  END IF;
  IF NOT has_function_privilege('service_role','comind_pm.resolve_conversation_execution_governance(text,uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Server role cannot execute the conversation governance resolver';
  END IF;
  IF has_function_privilege('service_role','comind_pm.bind_conversation_governance(text,uuid,text,text,text,text,jsonb)','EXECUTE')
     OR has_function_privilege('service_role','comind_pm.record_conversation_egress_review(text,uuid,text,text,text,text,timestamptz,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Server role must not receive conversation bind/review mutation authority';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'comind_pm.pm_conversation_governance_bindings'::regclass
      AND conname = 'pm_conversation_governance_binding_conversation_fk'
  ) THEN
    RAISE EXCEPTION 'Conversation governance binding FK is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'comind_pm.pm_conversation_egress_review_events'::regclass
      AND conname = 'pm_conversation_egress_review_approval_expiry_required'
  ) THEN
    RAISE EXCEPTION 'Time-bounded approval constraint is missing';
  END IF;

  INSERT INTO comind.cm_conversation(conv_id,org_id,project_id,source,title,metadata)
  VALUES (v_conv_id,v_org_id,v_conversation_project_id,'test','DRULE conversation governance proof','{"synthetic":true}'::jsonb);

  BEGIN
    PERFORM comind_pm.resolve_conversation_execution_governance('COMIND',v_conv_id,'OPENAI-API');
    RAISE EXCEPTION 'Resolver unexpectedly allowed an unbound conversation';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CONVERSATION_GOVERNANCE_BINDING_MISSING:%' THEN RAISE; END IF;
  END;

  v_first := comind_pm.bind_conversation_governance(
    'COMIND',v_conv_id,'INTERNAL','COMIND-TEST-US','OPERATIONAL','provider-execution-test',
    '{"synthetic":true,"production_authority":false}'::jsonb
  );
  v_second := comind_pm.bind_conversation_governance(
    'COMIND',v_conv_id,'INTERNAL','COMIND-TEST-US','OPERATIONAL','provider-execution-test',
    '{"synthetic":true,"production_authority":false}'::jsonb
  );
  IF v_first->>'binding_id' IS DISTINCT FROM v_second->>'binding_id'
     OR v_first->>'asset_key' IS DISTINCT FROM v_second->>'asset_key'
     OR (v_first->>'created')::boolean IS NOT TRUE
     OR (v_second->>'created')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Conversation governance binding is not idempotent: first %, second %', v_first, v_second;
  END IF;

  v_resolved := comind_pm.resolve_conversation_execution_governance('COMIND',v_conv_id,'OPENAI-API');
  IF v_resolved->>'classification_key' <> 'INTERNAL'
     OR (v_resolved->>'classification_rank')::integer <> 10
     OR v_resolved->>'egress_review_state' <> 'pending'
     OR (v_resolved->>'human_approved')::boolean THEN
    RAISE EXCEPTION 'Unreviewed conversation governance resolved incorrectly: %', v_resolved;
  END IF;

  PERFORM comind_pm.record_conversation_egress_review(
    'COMIND',v_conv_id,'OPENAI-API','denied','DRULE-TEST-REVIEWER','synthetic negative proof',
    NULL,'db/verification/20261029_drule_conversation_governance_binding_verification.sql',
    '{"synthetic":true}'::jsonb
  );
  v_resolved := comind_pm.resolve_conversation_execution_governance('COMIND',v_conv_id,'OPENAI-API');
  IF v_resolved->>'egress_review_state' <> 'denied'
     OR (v_resolved->>'human_approved')::boolean THEN
    RAISE EXCEPTION 'Denied egress review resolved incorrectly: %', v_resolved;
  END IF;

  v_first := comind_pm.record_conversation_egress_review(
    'COMIND',v_conv_id,'OPENAI-API','approved','DRULE-TEST-REVIEWER','synthetic bounded approval proof',
    now() + interval '1 hour','db/verification/20261029_drule_conversation_governance_binding_verification.sql',
    '{"synthetic":true}'::jsonb
  );
  v_review_id := (v_first->>'review_event_id')::uuid;
  v_resolved := comind_pm.resolve_conversation_execution_governance('COMIND',v_conv_id,'OPENAI-API');
  IF v_resolved->>'egress_review_state' <> 'approved'
     OR NOT (v_resolved->>'human_approved')::boolean
     OR v_resolved->>'egress_review_expires_at' IS NULL THEN
    RAISE EXCEPTION 'Approved egress review resolved incorrectly: %', v_resolved;
  END IF;

  v_decision := comind_pm.governance_preflight(
    'DRULE-C17',
    jsonb_build_object(
      'source_tenant',v_resolved->>'source_tenant',
      'target_tenant',v_resolved->>'target_tenant',
      'source_project',v_resolved->>'source_project',
      'target_project',v_resolved->>'target_project',
      'action','responses.create'
    ),
    false
  );
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'Resolved conversation scope did not pass C17: %', v_decision;
  END IF;

  v_decision := comind_pm.governance_preflight(
    'DRULE-C13',
    jsonb_build_object(
      'asset_key',v_resolved->>'asset_key',
      'destination_key',v_resolved->>'destination_key',
      'region','provider-managed',
      'tenant_key',v_resolved->>'tenant_key',
      'purpose',v_resolved->>'purpose',
      'human_approved',(v_resolved->>'human_approved')::boolean
    ),
    false
  );
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'Resolved conversation governance did not pass C13: %', v_decision;
  END IF;

  BEGIN
    PERFORM comind_pm.record_conversation_egress_review(
      'COMIND',v_conv_id,'OPENAI-API','approved','DRULE-TEST-REVIEWER','unbounded approval must fail',
      NULL,NULL,'{}'::jsonb
    );
    RAISE EXCEPTION 'Unbounded approved egress review unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM comind_pm.bind_conversation_governance(
      'COMIND',v_conv_id,'INTERNAL','COMIND-TEST-US','OPERATIONAL','provider-execution-test',
      '{"prompt":"must never enter governance metadata"}'::jsonb
    );
    RAISE EXCEPTION 'Raw-sensitive governance metadata unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CONVERSATION_GOVERNANCE_METADATA_CONTAINS_RAW_SENSITIVE_KEY%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE comind_pm.pm_conversation_egress_review_events
    SET evidence_ref = 'mutated'
    WHERE id = v_review_id;
    RAISE EXCEPTION 'Append-only egress review event unexpectedly updated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Conversation egress review events are append-only' THEN RAISE; END IF;
  END;

  UPDATE comind.cm_conversation SET project_id = v_other_project_id WHERE conv_id = v_conv_id;
  BEGIN
    PERFORM comind_pm.resolve_conversation_execution_governance('COMIND',v_conv_id,'OPENAI-API');
    RAISE EXCEPTION 'Scope drift unexpectedly resolved';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CONVERSATION_GOVERNANCE_SCOPE_MISMATCH:%' THEN RAISE; END IF;
  END;
  UPDATE comind.cm_conversation SET project_id = v_conversation_project_id WHERE conv_id = v_conv_id;

  INSERT INTO comind.cm_conversation(conv_id,org_id,project_id,source,title,metadata)
  VALUES (v_unscoped_conv_id,NULL,NULL,'test','Unscoped governance negative proof','{"synthetic":true}'::jsonb);
  BEGIN
    PERFORM comind_pm.bind_conversation_governance(
      'COMIND',v_unscoped_conv_id,'INTERNAL','COMIND-TEST-US','OPERATIONAL','provider-execution-test','{}'::jsonb
    );
    RAISE EXCEPTION 'Unscoped conversation unexpectedly bound';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE 'CONVERSATION_SCOPE_INCOMPLETE:%' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
