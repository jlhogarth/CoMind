BEGIN;

DO $$
DECLARE
  v_project_id uuid;
  v_census jsonb;
  v_lane jsonb;
BEGIN
  INSERT INTO comind_pm.pm_projects(project_key, name, status, priority, owner, source_system)
  VALUES ('L4A-MP-010-VERIFY', 'L4A MP 010 verification', 'active', 1, 'verification', 'supabase')
  RETURNING id INTO v_project_id;

  INSERT INTO comind_pm.pm_work_items(
    work_key, project_id, title, item_type, status, priority, canonical_source, confidence, last_event_at, metadata
  ) VALUES
    ('CENSUS-RETURN-WAIT', v_project_id, 'Synthetic return unavailable lane', 'lane', 'in_progress', 'high', 'supabase', 'high', current_timestamp,
      jsonb_build_object(
        'returnStatus','RETURN_UNAVAILABLE',
        'conversationReturned',false,
        'conversationReturnImpossible',true,
        'returnReason','conversation_actuator_unavailable',
        'returnWhy','Synthetic actuator unavailable proof'
      )),
    ('CENSUS-BLOCKER-WAIT', v_project_id, 'Synthetic explicit blocker lane', 'lane', 'in_progress', 'high', 'supabase', 'high', current_timestamp - interval '9 hours',
      jsonb_build_object('blocker','Awaiting exact external input')),
    ('CENSUS-STILL-ACTIVE', v_project_id, 'Synthetic active lane', 'lane', 'in_progress', 'high', 'supabase', 'high', current_timestamp, '{}'::jsonb),
    ('CENSUS-STILL-DORMANT', v_project_id, 'Synthetic dormant lane', 'lane', 'in_progress', 'medium', 'supabase', 'high', current_timestamp - interval '9 hours', '{}'::jsonb);

  PERFORM comind_pm.register_or_observe_lane_conversation(
    'CENSUS-RETURN-WAIT',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'https://chatgpt.com/c/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Synthetic Return Wait Conversation',
    'runtime_exact_id',
    'verification:mp010-return-wait',
    'verification',
    'mp010-return-wait-register',
    current_timestamp,
    jsonb_build_object('synthetic', true)
  );

  v_census := comind_pm.lane_continuity_census();
  IF v_census->>'schemaVersion' <> '2' THEN
    RAISE EXCEPTION 'Expected census schema version 2: %', v_census->>'schemaVersion';
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey'='CENSUS-RETURN-WAIT';
  IF v_lane->>'classification' <> 'WAITING'
     OR v_lane->>'classificationBasis' <> 'explicit_conversation_return_wait'
     OR v_lane->'conversation'->>'bindingState' <> 'active'
     OR v_lane->'recovery'->>'returnStatus' <> 'RETURN_UNAVAILABLE'
     OR v_lane->'recovery'->>'returnReason' <> 'conversation_actuator_unavailable' THEN
    RAISE EXCEPTION 'Return-unavailable lane did not classify WAITING: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey'='CENSUS-BLOCKER-WAIT';
  IF v_lane->>'classification' <> 'WAITING'
     OR v_lane->>'classificationBasis' <> 'explicit_blocker_wait'
     OR v_lane->'wait'->>'blocker' <> 'Awaiting exact external input' THEN
    RAISE EXCEPTION 'Explicit blocker lane did not classify WAITING: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey'='CENSUS-STILL-ACTIVE';
  IF v_lane->>'classification' <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Unblocked recent lane no longer classifies ACTIVE: %', v_lane;
  END IF;

  SELECT value INTO v_lane FROM jsonb_array_elements(v_census->'lanes') value WHERE value->>'workKey'='CENSUS-STILL-DORMANT';
  IF v_lane->>'classification' <> 'DORMANT' THEN
    RAISE EXCEPTION 'Unblocked stale lane no longer classifies DORMANT: %', v_lane;
  END IF;
END;
$$;

SELECT jsonb_build_object(
  'status','pass',
  'proof','L4A-MP-010 return-aware founder census classification',
  'production_change',false
)::text;

ROLLBACK;
