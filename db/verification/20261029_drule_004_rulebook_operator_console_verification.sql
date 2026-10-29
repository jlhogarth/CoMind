BEGIN;

DO $$
DECLARE
  v_conv_id uuid := '88888888-8888-4888-8888-888888888881'::uuid;
  v_org_id uuid := '88888888-8888-4888-8888-888888888882'::uuid;
  v_project_id uuid := '88888888-8888-4888-8888-888888888883'::uuid;
  v_rows integer;
  v_result jsonb;
  v_first_review uuid;
  v_second_review uuid;
  v_review_count integer;
  v_state text;
BEGIN
  IF has_function_privilege('PUBLIC','public.comind_rulebook_operator_conversation_status(integer)','EXECUTE')
     OR has_function_privilege('anon','public.comind_rulebook_operator_conversation_status(integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.comind_rulebook_operator_conversation_status(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'RuleBook operator status RPC leaked to ordinary roles';
  END IF;
  IF has_function_privilege('PUBLIC','public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'RuleBook operator review RPC leaked to ordinary roles';
  END IF;
  IF NOT has_function_privilege('service_role','public.comind_rulebook_operator_conversation_status(integer)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'service_role is missing RuleBook operator RPC authority';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('comind_rulebook_operator_conversation_status','comind_rulebook_operator_review_conversation')
      AND (NOT p.prosecdef OR p.proconfig IS NULL OR NOT ('search_path=pg_catalog, comind_pm, comind' = ANY(p.proconfig) OR 'search_path=pg_catalog, comind_pm' = ANY(p.proconfig)))
  ) THEN
    RAISE EXCEPTION 'RuleBook operator RPC security-definer/search-path contract is not pinned';
  END IF;

  INSERT INTO comind.cm_conversation(conv_id,org_id,project_id,source,title,metadata)
  VALUES (v_conv_id,v_org_id,v_project_id,'test','DRULE-004 private title must not be projected','{"synthetic":true}'::jsonb);

  PERFORM comind_pm.bind_conversation_governance(
    'COMIND',v_conv_id,'INTERNAL','COMIND-TEST-US','OPERATIONAL','assistant-response',
    '{"synthetic":true,"production_authority":false}'::jsonb
  );

  SET LOCAL ROLE service_role;

  SELECT count(*) INTO v_rows
  FROM public.comind_rulebook_operator_conversation_status(200)
  WHERE conversation_id = v_conv_id
    AND classification_key = 'INTERNAL'
    AND purpose = 'assistant-response'
    AND destination_key = 'OPENAI-API'
    AND egress_review_state = 'pending'
    AND human_approved = false;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'Service-only RuleBook operator status projection did not return the synthetic binding';
  END IF;

  BEGIN
    PERFORM public.comind_rulebook_operator_conversation_status(201);
    RAISE EXCEPTION 'Out-of-range operator status limit unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'RULEBOOK_OPERATOR_LIMIT_OUT_OF_RANGE' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.comind_rulebook_operator_review_conversation(
      v_conv_id,'approved','DRULE-004-TEST','bounded approval proof',25,NULL,gen_random_uuid()
    );
    RAISE EXCEPTION 'Approval longer than 24 hours unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'RULEBOOK_OPERATOR_APPROVAL_WINDOW_INVALID' THEN RAISE; END IF;
  END;

  v_result := public.comind_rulebook_operator_review_conversation(
    v_conv_id,'approved','DRULE-004-TEST','bounded approval proof',1,
    'db/verification/20261029_drule_004_rulebook_operator_console_verification.sql',gen_random_uuid()
  );
  v_first_review := (v_result->>'review_event_id')::uuid;
  IF v_result->>'project_key' <> 'COMIND'
     OR v_result->>'destination_key' <> 'OPENAI-API'
     OR v_result->>'decision' <> 'approved'
     OR v_result->>'expires_at' IS NULL THEN
    RAISE EXCEPTION 'Approved RuleBook operator result is malformed: %', v_result;
  END IF;

  SELECT egress_review_state INTO v_state
  FROM public.comind_rulebook_operator_conversation_status(200)
  WHERE conversation_id = v_conv_id;
  IF v_state <> 'approved' THEN
    RAISE EXCEPTION 'Approved operator review did not become latest status';
  END IF;

  v_result := public.comind_rulebook_operator_review_conversation(
    v_conv_id,'denied','DRULE-004-TEST','bounded denial proof',NULL,
    'db/verification/20261029_drule_004_rulebook_operator_console_verification.sql',gen_random_uuid()
  );
  v_second_review := (v_result->>'review_event_id')::uuid;
  IF v_result->>'decision' <> 'denied' OR v_result->>'expires_at' IS NOT NULL THEN
    RAISE EXCEPTION 'Denied RuleBook operator result is malformed: %', v_result;
  END IF;

  SELECT egress_review_state INTO v_state
  FROM public.comind_rulebook_operator_conversation_status(200)
  WHERE conversation_id = v_conv_id;
  IF v_state <> 'denied' THEN
    RAISE EXCEPTION 'Denied operator review did not become latest status';
  END IF;

  RESET ROLE;

  SELECT count(*) INTO v_review_count
  FROM comind_pm.pm_conversation_egress_review_events
  WHERE id IN (v_first_review, v_second_review);
  IF v_review_count <> 2 THEN
    RAISE EXCEPTION 'Operator review decisions did not preserve append-only history';
  END IF;

  BEGIN
    UPDATE comind_pm.pm_conversation_egress_review_events
    SET authority_basis = 'forbidden rewrite'
    WHERE id = v_first_review;
    RAISE EXCEPTION 'Append-only operator review evidence unexpectedly updated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Conversation egress review events are append-only' THEN RAISE; END IF;
  END;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comind_rulebook_operator_conversation_status'
      AND column_name IN ('content','message','prompt','raw_payload','authority_basis','evidence_ref')
  ) THEN
    RAISE EXCEPTION 'Operator status projection exposes forbidden content/evidence columns';
  END IF;
END $$;

ROLLBACK;
