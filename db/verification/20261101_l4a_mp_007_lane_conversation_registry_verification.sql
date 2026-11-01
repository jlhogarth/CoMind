BEGIN;

DO $$
DECLARE
  v_project_id uuid;
  v_work_item_id uuid;
  v_first jsonb;
  v_replay jsonb;
  v_second jsonb;
  v_resolved jsonb;
  v_retired jsonb;
  v_first_event_id uuid;
  v_event_count integer;
  v_rls boolean;
BEGIN
  INSERT INTO comind_pm.pm_projects(project_key, name, status, priority, owner, source_system)
  VALUES ('L4A-MP-007-VERIFY', 'L4A MP 007 verification', 'active', 1, 'verification', 'supabase')
  RETURNING id INTO v_project_id;

  INSERT INTO comind_pm.pm_work_items(
    work_key, project_id, title, item_type, status, priority, canonical_source, confidence
  ) VALUES (
    'L4A-MP-007-VERIFY-LANE', v_project_id, 'Synthetic lane conversation registry proof',
    'task', 'in_progress', 'high', 'supabase', 'high'
  ) RETURNING id INTO v_work_item_id;

  v_resolved := comind_pm.resolve_lane_conversation_binding('L4A-MP-007-VERIFY-LANE');
  IF v_resolved->>'status' <> 'conversation_binding_missing' THEN
    RAISE EXCEPTION 'Expected missing binding, received %', v_resolved;
  END IF;

  BEGIN
    PERFORM comind_pm.bind_lane_conversation(
      'L4A-MP-007-VERIFY-LANE',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'https://chatgpt.com/c/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Synthetic wrong URL proof',
      'runtime_exact_id',
      'verification:wrong-url',
      'verification',
      'verify-wrong-url'
    );
    RAISE EXCEPTION 'Mismatched URL unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF position('CHATGPT_CONVERSATION_URL_ID_MISMATCH' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  v_first := comind_pm.bind_lane_conversation(
    'L4A-MP-007-VERIFY-LANE',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Synthetic originating conversation A',
    'runtime_exact_id',
    'verification:first-binding',
    'verification',
    'verify-bind-a'
  );
  IF v_first->>'status' <> 'active' OR (v_first->>'created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'First binding was not created as active: %', v_first;
  END IF;
  v_first_event_id := (v_first->>'bindingEventId')::uuid;

  v_replay := comind_pm.bind_lane_conversation(
    'L4A-MP-007-VERIFY-LANE',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Synthetic originating conversation A',
    'runtime_exact_id',
    'verification:exact-reregistration',
    'verification',
    'verify-bind-a-second-key'
  );
  IF (v_replay->>'replayed')::boolean IS NOT TRUE
     OR (v_replay->>'bindingEventId')::uuid <> v_first_event_id THEN
    RAISE EXCEPTION 'Exact re-registration was not idempotent: %', v_replay;
  END IF;

  BEGIN
    PERFORM comind_pm.bind_lane_conversation(
      'L4A-MP-007-VERIFY-LANE',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'https://chatgpt.com/c/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Synthetic originating conversation B',
      'runtime_exact_id',
      'verification:conflicting-binding',
      'verification',
      'verify-conflict-b',
      false
    );
    RAISE EXCEPTION 'Conflicting active binding unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF position('LANE_CONVERSATION_BINDING_CONFLICT' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  v_second := comind_pm.bind_lane_conversation(
    'L4A-MP-007-VERIFY-LANE',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'https://chatgpt.com/c/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Synthetic originating conversation B',
    'runtime_exact_id',
    'verification:superseded-binding',
    'verification',
    'verify-supersede-b',
    true,
    jsonb_build_object('reason', 'synthetic supersession proof')
  );
  IF (v_second->>'created')::boolean IS NOT TRUE
     OR (v_second->>'supersedesEventId')::uuid <> v_first_event_id THEN
    RAISE EXCEPTION 'Explicit supersession did not preserve predecessor: %', v_second;
  END IF;

  v_resolved := comind_pm.resolve_lane_conversation_binding('L4A-MP-007-VERIFY-LANE');
  IF v_resolved->>'status' <> 'active'
     OR v_resolved->>'externalConversationId' <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     OR v_resolved->>'registeredConversationUrl' <> 'https://chatgpt.com/c/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' THEN
    RAISE EXCEPTION 'Resolver did not return the superseding exact binding: %', v_resolved;
  END IF;

  v_retired := comind_pm.retire_lane_conversation_binding(
    'L4A-MP-007-VERIFY-LANE',
    'verification:explicit-retire',
    'verification',
    'verify-retire-b',
    jsonb_build_object('reason', 'synthetic retirement proof')
  );
  IF v_retired->>'status' <> 'conversation_binding_inactive'
     OR (v_retired->>'created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Retirement event was not created: %', v_retired;
  END IF;

  v_resolved := comind_pm.resolve_lane_conversation_binding('L4A-MP-007-VERIFY-LANE');
  IF v_resolved->>'status' <> 'conversation_binding_inactive' THEN
    RAISE EXCEPTION 'Resolver did not expose retired binding as inactive: %', v_resolved;
  END IF;

  SELECT count(*) INTO v_event_count
  FROM comind_pm.pm_lane_conversation_binding_events
  WHERE work_item_id = v_work_item_id;
  IF v_event_count <> 3 THEN
    RAISE EXCEPTION 'Expected exactly three append-only events, found %', v_event_count;
  END IF;

  BEGIN
    UPDATE comind_pm.pm_lane_conversation_binding_events
    SET observed_title = 'forbidden mutation'
    WHERE id = v_first_event_id;
    RAISE EXCEPTION 'Append-only update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF position('append-only' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'comind_pm'
    AND c.relname = 'pm_lane_conversation_binding_events';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Lane conversation binding event table does not have RLS enabled';
  END IF;

  IF to_regrole('anon') IS NOT NULL AND has_table_privilege('anon', 'comind_pm.pm_lane_conversation_binding_events', 'SELECT') THEN
    RAISE EXCEPTION 'anon unexpectedly has direct SELECT on lane conversation bindings';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL AND has_table_privilege('authenticated', 'comind_pm.pm_lane_conversation_binding_events', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has direct SELECT on lane conversation bindings';
  END IF;
  IF has_function_privilege('public', 'comind_pm.resolve_lane_conversation_binding(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC unexpectedly has resolver EXECUTE';
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'status', 'pass',
  'proof', 'L4A-MP-007 lane conversation registry',
  'production_change', false,
  'paid_service_commitment', false,
  'authority_expansion', false
)::text;

ROLLBACK;
