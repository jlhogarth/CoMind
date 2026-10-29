BEGIN;

DO $$
DECLARE
  v_conv_id uuid := '88888888-8888-4888-8888-888888888881'::uuid;
  v_org_id uuid := '88888888-8888-4888-8888-888888888882'::uuid;
  v_project_id uuid := '88888888-8888-4888-8888-888888888883'::uuid;
  v_result_signature text;
  v_public_status_execute boolean;
  v_public_review_execute boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE n.nspname = 'public'
      AND p.oid = 'public.comind_rulebook_operator_conversation_status(integer)'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) INTO v_public_status_execute;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
    WHERE n.nspname = 'public'
      AND p.oid = 'public.comind_rulebook_operator_review_conversation(uuid,text,text,text,integer,text,uuid)'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) INTO v_public_review_execute;

  IF v_public_status_execute
     OR has_function_privilege('anon','public.comind_rulebook_operator_conversation_status(integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.comind_rulebook_operator_conversation_status(integer)','EXECUTE') THEN
    RAISE EXCEPTION 'RuleBook operator status RPC leaked to ordinary roles';
  END IF;
  IF v_public_review_execute
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
      AND (NOT p.prosecdef OR p.proconfig IS NULL)
  ) THEN
    RAISE EXCEPTION 'RuleBook operator RPC must be SECURITY DEFINER with pinned configuration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='comind_rulebook_operator_conversation_status'
      AND 'search_path=pg_catalog, comind_pm, comind' = ANY(p.proconfig)
  ) THEN
    RAISE EXCEPTION 'RuleBook operator status RPC search_path is not pinned';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='comind_rulebook_operator_review_conversation'
      AND 'search_path=pg_catalog, comind_pm' = ANY(p.proconfig)
  ) THEN
    RAISE EXCEPTION 'RuleBook operator review RPC search_path is not pinned';
  END IF;

  SELECT pg_get_function_result('public.comind_rulebook_operator_conversation_status(integer)'::regprocedure)
    INTO v_result_signature;
  IF lower(v_result_signature) ~ '(content|message|prompt|raw_payload|authority_basis|evidence_ref)' THEN
    RAISE EXCEPTION 'Operator status projection exposes forbidden content/evidence fields: %', v_result_signature;
  END IF;

  INSERT INTO comind.cm_conversation(conv_id,org_id,project_id,source,title,metadata)
  VALUES (v_conv_id,v_org_id,v_project_id,'test','DRULE-004 private title must not be projected','{"synthetic":true}'::jsonb);

  PERFORM comind_pm.bind_conversation_governance(
    'COMIND',v_conv_id,'INTERNAL','COMIND-TEST-US','OPERATIONAL','assistant-response',
    '{"synthetic":true,"production_authority":false}'::jsonb
  );
END $$;

SET LOCAL ROLE service_role;

DO $$
DECLARE
  v_conv_id uuid := '88888888-8888-4888-8888-888888888881'::uuid;
  v_rows integer;
  v_result jsonb;
  v_state text;
BEGIN
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
  IF v_result->>'decision' <> 'denied' OR v_result->>'expires_at' IS NOT NULL THEN
    RAISE EXCEPTION 'Denied RuleBook operator result is malformed: %', v_result;
  END IF;

  SELECT egress_review_state INTO v_state
  FROM public.comind_rulebook_operator_conversation_status(200)
  WHERE conversation_id = v_conv_id;
  IF v_state <> 'denied' THEN
    RAISE EXCEPTION 'Denied operator review did not become latest status';
  END IF;
END $$;

RESET ROLE;

DO $$
DECLARE
  v_conv_id uuid := '88888888-8888-4888-8888-888888888881'::uuid;
  v_review_count integer;
  v_first_review uuid;
BEGIN
  SELECT count(*)
    INTO v_review_count
  FROM comind_pm.pm_conversation_egress_review_events e
  JOIN comind_pm.pm_conversation_governance_bindings b ON b.id=e.binding_id
  WHERE b.conversation_id=v_conv_id
    AND e.reviewed_by='DRULE-004-TEST';
  IF v_review_count <> 2 THEN
    RAISE EXCEPTION 'Operator review decisions did not preserve append-only history: %', v_review_count;
  END IF;

  SELECT e.id
    INTO v_first_review
  FROM comind_pm.pm_conversation_egress_review_events e
  JOIN comind_pm.pm_conversation_governance_bindings b ON b.id=e.binding_id
  WHERE b.conversation_id=v_conv_id
    AND e.reviewed_by='DRULE-004-TEST'
  ORDER BY e.reviewed_at, e.created_at, e.id
  LIMIT 1;
  IF v_first_review IS NULL THEN
    RAISE EXCEPTION 'Operator append-only proof could not resolve a review event';
  END IF;

  BEGIN
    UPDATE comind_pm.pm_conversation_egress_review_events
    SET authority_basis = 'forbidden rewrite'
    WHERE id = v_first_review;
    RAISE EXCEPTION 'Append-only operator review evidence unexpectedly updated';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Conversation egress review events are append-only' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
