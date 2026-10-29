BEGIN;

DO $$
DECLARE
  v_project uuid;
  v_asset_count integer;
  v_destination_count integer;
  v_decision jsonb;
BEGIN
  SELECT id INTO v_project
  FROM comind_pm.pm_projects
  WHERE project_key = 'COMIND';

  IF v_project IS NULL THEN
    RAISE EXCEPTION 'COMIND project registry entry is missing';
  END IF;

  SELECT count(*) INTO v_asset_count
  FROM comind_pm.pm_data_asset_governance a
  JOIN comind_pm.pm_data_classification_levels c ON c.id = a.classification_id
  WHERE a.project_id = v_project
    AND a.asset_key = 'PROVIDER-EXECUTION-TEST-INTERNAL'
    AND c.classification_key = 'INTERNAL'
    AND a.tenant_key = 'comind-test'
    AND a.project_scope_key = 'COMIND'
    AND a.allowed_purposes = ARRAY['provider-execution-test']::text[]
    AND coalesce((a.metadata->>'synthetic')::boolean, false)
    AND coalesce((a.metadata->>'production_authority')::boolean, true) = false;

  IF v_asset_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one bounded synthetic provider-execution Test asset';
  END IF;

  SELECT count(*) INTO v_destination_count
  FROM comind_pm.pm_egress_destinations
  WHERE project_id = v_project
    AND destination_key = 'OPENAI-API'
    AND destination_type = 'provider'
    AND host_pattern = 'api.openai.com'
    AND max_classification_rank = 10
    AND allowed_regions = ARRAY['provider-managed']::text[]
    AND requires_purpose
    AND requires_human_review
    AND active
    AND coalesce((metadata->>'production_authority')::boolean, true) = false;

  IF v_destination_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one bounded OpenAI Test destination policy';
  END IF;

  v_decision := comind_pm.governance_preflight(
    'DRULE-C11',
    '{"untrusted_input":false,"asks_for_secrets":false,"authority_escalation":false,"side_effect":true,"human_approved":true}'::jsonb,
    false
  );
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'Expected C11 provider Test preflight to allow, got %', v_decision;
  END IF;

  v_decision := comind_pm.governance_preflight(
    'DRULE-C17',
    '{"source_tenant":"comind-test","target_tenant":"comind-test","source_project":"COMIND","target_project":"COMIND","action":"responses.create"}'::jsonb,
    false
  );
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'Expected C17 provider Test preflight to allow, got %', v_decision;
  END IF;

  v_decision := comind_pm.governance_preflight(
    'DRULE-C13',
    '{"asset_key":"PROVIDER-EXECUTION-TEST-INTERNAL","destination_key":"OPENAI-API","region":"provider-managed","tenant_key":"comind-test","purpose":"provider-execution-test","human_approved":true}'::jsonb,
    false
  );
  IF v_decision->>'decision' <> 'allow' THEN
    RAISE EXCEPTION 'Expected approved C13 provider Test preflight to allow, got %', v_decision;
  END IF;

  v_decision := comind_pm.governance_preflight(
    'DRULE-C13',
    '{"asset_key":"PROVIDER-EXECUTION-TEST-INTERNAL","destination_key":"OPENAI-API","region":"provider-managed","tenant_key":"comind-test","purpose":"provider-execution-test","human_approved":false}'::jsonb,
    false
  );
  IF v_decision->>'decision' <> 'review' THEN
    RAISE EXCEPTION 'Expected unapproved C13 provider Test preflight to require review, got %', v_decision;
  END IF;

  v_decision := comind_pm.governance_preflight(
    'DRULE-C13',
    '{"asset_key":"PROVIDER-EXECUTION-TEST-INTERNAL","destination_key":"OPENAI-API","region":"wrong-region","tenant_key":"comind-test","purpose":"provider-execution-test","human_approved":true}'::jsonb,
    false
  );
  IF v_decision->>'decision' <> 'deny' THEN
    RAISE EXCEPTION 'Expected wrong-region C13 provider Test preflight to deny, got %', v_decision;
  END IF;
END $$;

ROLLBACK;
