BEGIN;

DO $$
DECLARE
  v_project_id uuid;
  v_work_item_id uuid;
  v_registered jsonb;
  v_rename jsonb;
  v_duplicate jsonb;
  v_stale jsonb;
  v_resolved jsonb;
  v_history jsonb;
  v_event_id uuid;
  v_count integer;
  v_rls boolean;
BEGIN
  INSERT INTO comind_pm.pm_projects(project_key, name, status, priority, owner, source_system)
  VALUES ('L4A-MP-008-VERIFY', 'L4A MP 008 verification', 'active', 1, 'verification', 'supabase')
  RETURNING id INTO v_project_id;

  INSERT INTO comind_pm.pm_work_items(
    work_key, project_id, title, item_type, status, priority, canonical_source, confidence
  ) VALUES (
    'L4A-MP-008-VERIFY-LANE', v_project_id, 'Synthetic conversation title history proof',
    'task', 'in_progress', 'high', 'supabase', 'high'
  ) RETURNING id INTO v_work_item_id;

  BEGIN
    PERFORM comind_pm.observe_lane_conversation_title(
      'L4A-MP-008-VERIFY-LANE',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Title-only must not bind',
      'runtime_observed',
      'verification:title-only',
      'verification',
      'title-only'
    );
    RAISE EXCEPTION 'Title-only observation unexpectedly established a binding';
  EXCEPTION WHEN OTHERS THEN
    IF position('LANE_CONVERSATION_BINDING_MISSING' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  v_registered := comind_pm.register_or_observe_lane_conversation(
    'L4A-MP-008-VERIFY-LANE',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Original Conversation Name',
    'runtime_exact_id',
    'verification:exact-runtime-observation',
    'verification',
    'register-a',
    '2026-11-01T01:00:00Z'::timestamptz,
    jsonb_build_object('synthetic', true)
  );
  IF v_registered->>'status' <> 'active'
     OR v_registered->'binding'->>'externalConversationId' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     OR (v_registered->'binding'->>'created')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Automatic exact-identity registration failed: %', v_registered;
  END IF;

  v_resolved := comind_pm.resolve_lane_conversation_binding('L4A-MP-008-VERIFY-LANE');
  IF v_resolved->>'currentTitle' <> 'Original Conversation Name'
     OR (v_resolved->>'titleHistoryCount')::integer < 1 THEN
    RAISE EXCEPTION 'Initial title was not exposed by resolver: %', v_resolved;
  END IF;

  v_rename := comind_pm.observe_lane_conversation_title(
    'L4A-MP-008-VERIFY-LANE',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Renamed Conversation',
    'runtime_observed',
    'verification:rename',
    'verification',
    'rename-a',
    '2026-11-01T02:00:00Z'::timestamptz,
    jsonb_build_object('synthetic', true)
  );
  IF (v_rename->>'created')::boolean IS NOT TRUE OR (v_rename->>'isCurrent')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Rename observation was not current: %', v_rename;
  END IF;
  v_event_id := (v_rename->>'titleEventId')::uuid;

  v_duplicate := comind_pm.observe_lane_conversation_title(
    'L4A-MP-008-VERIFY-LANE',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Renamed Conversation',
    'runtime_observed',
    'verification:duplicate-same-title',
    'verification',
    'rename-a-different-key',
    '2026-11-01T02:05:00Z'::timestamptz,
    jsonb_build_object('synthetic', true)
  );
  IF (v_duplicate->>'created')::boolean IS NOT FALSE
     OR (v_duplicate->>'semanticDuplicate')::boolean IS NOT TRUE
     OR (v_duplicate->>'titleEventId')::uuid <> v_event_id THEN
    RAISE EXCEPTION 'Semantic duplicate title created another event: %', v_duplicate;
  END IF;

  v_stale := comind_pm.observe_lane_conversation_title(
    'L4A-MP-008-VERIFY-LANE',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Historical Earlier Name',
    'archive_observed',
    'verification:stale-history',
    'verification',
    'stale-a',
    '2026-11-01T01:30:00Z'::timestamptz,
    jsonb_build_object('synthetic', true)
  );
  IF (v_stale->>'created')::boolean IS NOT TRUE OR (v_stale->>'isCurrent')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Stale historical observation was not retained as non-current: %', v_stale;
  END IF;

  v_resolved := comind_pm.resolve_lane_conversation_binding('L4A-MP-008-VERIFY-LANE');
  IF v_resolved->>'externalConversationId' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     OR v_resolved->>'currentTitle' <> 'Renamed Conversation'
     OR (v_resolved->>'titleHistoryCount')::integer <> 3 THEN
    RAISE EXCEPTION 'Rename changed identity or current title selection failed: %', v_resolved;
  END IF;

  v_history := comind_pm.lane_conversation_title_history('L4A-MP-008-VERIFY-LANE');
  IF v_history->>'status' <> 'ok' OR (v_history->>'count')::integer <> 3 THEN
    RAISE EXCEPTION 'Title history did not preserve all semantic observations: %', v_history;
  END IF;

  BEGIN
    PERFORM comind_pm.register_or_observe_lane_conversation(
      'L4A-MP-008-VERIFY-LANE',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'https://chatgpt.com/c/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'Conflicting Identity',
      'runtime_exact_id',
      'verification:identity-conflict',
      'verification',
      'conflict-b'
    );
    RAISE EXCEPTION 'Conflicting exact conversation identity unexpectedly replaced the binding';
  EXCEPTION WHEN OTHERS THEN
    IF position('LANE_CONVERSATION_BINDING_CONFLICT' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_count
  FROM comind_pm.pm_lane_conversation_binding_events
  WHERE work_item_id = v_work_item_id AND event_type = 'bound';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Auto-registration created multiple identity bindings: %', v_count;
  END IF;

  BEGIN
    UPDATE comind_pm.pm_lane_conversation_title_events
    SET observed_title = 'forbidden mutation'
    WHERE id = v_event_id;
    RAISE EXCEPTION 'Append-only title update unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF position('append-only' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  BEGIN
    DELETE FROM comind_pm.pm_lane_conversation_title_events WHERE id = v_event_id;
    RAISE EXCEPTION 'Append-only title delete unexpectedly succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF position('append-only' in SQLERRM) = 0 THEN
      RAISE;
    END IF;
  END;

  SELECT c.relrowsecurity INTO v_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'comind_pm'
    AND c.relname = 'pm_lane_conversation_title_events';
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Conversation title event table does not have RLS enabled';
  END IF;

  IF to_regrole('anon') IS NOT NULL AND has_table_privilege('anon', 'comind_pm.pm_lane_conversation_title_events', 'SELECT') THEN
    RAISE EXCEPTION 'anon unexpectedly has direct SELECT on title history';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL AND has_table_privilege('authenticated', 'comind_pm.pm_lane_conversation_title_events', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has direct SELECT on title history';
  END IF;
  IF has_function_privilege('public', 'comind_pm.observe_lane_conversation_title(text,text,text,text,text,text,text,text,timestamptz,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC unexpectedly has title observer EXECUTE';
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'status', 'pass',
  'proof', 'L4A-MP-008 conversation title history and automatic registration',
  'production_change', false,
  'paid_service_commitment', false,
  'authority_expansion', false
)::text;

ROLLBACK;
