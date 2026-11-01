BEGIN;

DO $$
DECLARE
  v_project_id uuid;
  v_recovery_id uuid;
  v_census jsonb;
  v_lane jsonb;
BEGIN
  INSERT INTO comind_pm.pm_projects(project_key, name, status, priority, owner, source_system)
  VALUES ('L4A-MP-009-VERIFY', 'L4A MP 009 verification', 'active', 1, 'verification', 'supabase')
  RETURNING id INTO v_project_id;

  INSERT INTO comind_pm.pm_work_items(
    work_key, project_id, title, item_type, status, priority, canonical_source, confidence, last_event_at, metadata
  ) VALUES
    ('CENSUS-ACTIVE', v_project_id, 'Synthetic active lane', 'lane', 'in_progress', 'high', 'supabase', 'high', current_timestamp,
      jsonb_build_object('github_issue', 1, 'github_pr', 2, 'branch', 'synthetic-active')),
    ('CENSUS-WAITING', v_project_id, 'Synthetic waiting lane', 'lane', 'in_progress', 'medium', 'supabase', 'high', current_timestamp,
      jsonb_build_object('external_input_status', 'waiting')),
    ('CENSUS-DORMANT', v_project_id, 'Synthetic dormant lane', 'lane', 'in_progress', 'medium', 'supabase', 'high', current_timestamp - interval '7 hours', '{}'::jsonb),
    ('CENSUS-HUMAN', v_project_id, 'Synthetic human blocked lane', 'lane', 'in_progress', 'high', 'supabase', 'high', current_timestamp,
      jsonb_build_object('requires_joseph_action', true)),
    ('CENSUS-COMPLETE', v_project_id, 'Synthetic complete lane', 'lane', 'done', 'low', 'supabase', 'high', current_timestamp, '{}'::jsonb),
    ('CENSUS-SUPERSEDED', v_project_id, 'Synthetic superseded lane', 'lane', 'done', 'low', 'supabase', 'high', current_timestamp,
      jsonb_build_object('superseded', true, 'superseded_by', 'CENSUS-ACTIVE')),
    ('CENSUS-RECOVERY', v_project_id, 'Synthetic recovery owned lane', 'lane', 'in_progress', 'high', 'supabase', 'high', current_timestamp, '{}'::jsonb);

  INSERT INTO comind_pm.pm_work_items(
    work_key, project_id, title, item_type, status, priority, canonical_source, confidence, last_event_at, metadata
  ) VALUES (
    'L4A-RECOVERY', v_project_id, 'Synthetic Recovery Controller', 'audit', 'in_progress', 'high', 'supabase', 'high', current_timestamp,
    jsonb_build_object(
      'selected_lane', 'CENSUS-RECOVERY',
      'recoveryOwnershipReleased', false,
      'controllerMayContinueImplementation', false
    )
  ) RETURNING id INTO v_recovery_id;

  PERFORM comind_pm.register_or_observe_lane_conversation(
    'CENSUS-ACTIVE',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Original Active Conversation',
    'runtime_exact_id',
    'verification:census-active',
    'verification',
    'census-active-register',
    current_timestamp - interval '10 minutes',
    jsonb_build_object('synthetic', true)
  );

  PERFORM comind_pm.observe_lane_conversation_title(
    'CENSUS-ACTIVE',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'https://chatgpt.com/c/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Renamed Active Conversation',
    'runtime_observed',
    'verification:census-active-rename',
    'verification',
    'census-active-rename',
    current_timestamp,
    jsonb_build_object('synthetic', true)
  );

  v_census := comind_pm.lane_continuity_census();

  IF v_census->>'schemaVersion' <> '1' OR (v_census->>'dormantAfterHours')::integer <> 6 THEN
    RAISE EXCEPTION 'Unexpected census contract: %', v_census;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey' = 'CENSUS-ACTIVE';
  IF v_lane->>'classification' <> 'ACTIVE'
     OR v_lane->'conversation'->>'bindingState' <> 'active'
     OR v_lane->'conversation'->>'externalConversationId' <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
     OR v_lane->'conversation'->>'currentTitle' <> 'Renamed Active Conversation'
     OR (v_lane->'conversation'->>'titleHistoryCount')::integer <> 2
     OR v_lane->'recovery'->>'returnStatus' <> 'NOT_ATTEMPTED'
     OR (v_lane->'recovery'->>'conversationReturnImpossible')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Active bound lane census mismatch: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey' = 'CENSUS-WAITING';
  IF v_lane->>'classification' <> 'WAITING'
     OR v_lane->>'classificationBasis' <> 'explicit_external_input_wait'
     OR v_lane->'recovery'->>'returnStatus' <> 'RETURN_UNAVAILABLE'
     OR v_lane->'recovery'->>'returnReason' <> 'conversation_binding_missing' THEN
    RAISE EXCEPTION 'Waiting lane census mismatch: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey' = 'CENSUS-DORMANT';
  IF v_lane->>'classification' <> 'DORMANT' OR (v_lane->>'hoursSinceActivity')::numeric < 6 THEN
    RAISE EXCEPTION 'Dormant lane census mismatch: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey' = 'CENSUS-HUMAN';
  IF v_lane->>'classification' <> 'HUMAN_BLOCKED'
     OR (v_lane->'wait'->>'requiresJosephAction')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Human blocked lane census mismatch: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey' = 'CENSUS-COMPLETE';
  IF v_lane->>'classification' <> 'COMPLETE' THEN
    RAISE EXCEPTION 'Complete lane census mismatch: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey' = 'CENSUS-SUPERSEDED';
  IF v_lane->>'classification' <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'Superseded lane census mismatch: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey' = 'CENSUS-RECOVERY';
  IF v_lane->>'classification' <> 'RECOVERY_OWNED'
     OR (v_lane->'recovery'->>'ownershipReleased')::boolean IS NOT FALSE
     OR (v_lane->'recovery'->>'controllerMayContinueImplementation')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'Recovery-owned lane census mismatch: %', v_lane;
  END IF;

  IF (v_census->'summary'->>'total')::integer <> 7
     OR (v_census->'summary'->>'active')::integer <> 1
     OR (v_census->'summary'->>'waiting')::integer <> 1
     OR (v_census->'summary'->>'dormant')::integer <> 1
     OR (v_census->'summary'->>'humanBlocked')::integer <> 1
     OR (v_census->'summary'->>'complete')::integer <> 1
     OR (v_census->'summary'->>'superseded')::integer <> 1
     OR (v_census->'summary'->>'recoveryOwned')::integer <> 1 THEN
    RAISE EXCEPTION 'Census summary counts are incorrect: %', v_census->'summary';
  END IF;

  IF has_function_privilege('public', 'comind_pm.lane_continuity_census()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC unexpectedly has census EXECUTE';
  END IF;
  IF to_regrole('anon') IS NOT NULL AND has_function_privilege('anon', 'comind_pm.lane_continuity_census()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon unexpectedly has census EXECUTE';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL AND has_function_privilege('authenticated', 'comind_pm.lane_continuity_census()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated unexpectedly has census EXECUTE';
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'status', 'pass',
  'proof', 'L4A-MP-009 founder lane continuity census',
  'production_change', false,
  'paid_service_commitment', false,
  'authority_expansion', false
)::text;

ROLLBACK;
