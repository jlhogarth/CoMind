-- SCOUT-001 verification.
-- Assumes SCOUT-001 migration and scripts/provision_scout_001_test_agent.sql have been applied.
-- Runs positive and negative developmental checks in one transaction and rolls them back.

BEGIN;

DO $$
DECLARE
  v_org_id uuid;
  v_founder_actor_id uuid;
  v_scout_actor_id uuid;
  v_profile_id uuid;
  v_manifest_id uuid;
  v_constitution_trait_id uuid;
  v_adaptive_trait_id uuid;
  v_initial_event_id uuid;
  v_replay_event_id uuid;
  v_policy_count integer;
  v_event_count integer;
  v_constitution_count integer;
  v_resource_count integer;
  v_grant_count integer;
  v_audit_count integer;
  v_weight real;
  v_failed boolean;
BEGIN
  SELECT org_id INTO v_org_id FROM comind.cm_org WHERE slug::text='comind';
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'SCOUT-001 verification missing CoMind org'; END IF;

  SELECT actor_id INTO v_founder_actor_id FROM comind.cm_actor
  WHERE org_id=v_org_id AND handle::text='joseph.hogarth' AND kind='person';
  IF v_founder_actor_id IS NULL THEN RAISE EXCEPTION 'SCOUT-001 verification missing founder actor'; END IF;

  SELECT actor_id INTO v_scout_actor_id FROM comind.cm_actor
  WHERE org_id=v_org_id AND handle::text='agent.scout' AND kind='agent';
  IF v_scout_actor_id IS NULL THEN RAISE EXCEPTION 'SCOUT-001 verification missing Scout actor'; END IF;

  SELECT profile_id INTO v_profile_id FROM comind.cm_foundry_agent_profile
  WHERE actor_id=v_scout_actor_id
    AND role_code='emerging_technology_research_analyst'
    AND authority_floor='C0'
    AND authority_ceiling='C1'
    AND instruction_version='scout-001.v1'
    AND status='draft'
    AND activated_at IS NULL
    AND retired_at IS NULL;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'SCOUT-001 profile is not canonical draft C0-C1'; END IF;

  SELECT manifest_id INTO v_manifest_id FROM comind.v_current_ve_developmental_manifest
  WHERE actor_id=v_scout_actor_id
    AND manifest_version=1
    AND org_id=v_org_id
    AND identity_owner_org_id=v_org_id
    AND accountable_human_actor_id=v_founder_actor_id
    AND supervisor_actor_id=v_founder_actor_id
    AND role_code='emerging_technology_research_analyst'
    AND standard_version='VE-STD-001.v0.1'
    AND constitution_version='scout-constitution.v1'
    AND growth_policy_version='scout-growth.v1'
    AND affective_model_mode='modeled_only';
  IF v_manifest_id IS NULL THEN RAISE EXCEPTION 'SCOUT-001 developmental manifest is incomplete or inconsistent'; END IF;

  SELECT count(*) INTO v_policy_count FROM comind.v_current_actor_trait_governance WHERE actor_id=v_scout_actor_id;
  SELECT count(*) INTO v_event_count FROM comind.cm_actor_trait_development_event WHERE actor_id=v_scout_actor_id AND event_type='initialize';
  SELECT count(*) INTO v_constitution_count FROM comind.v_current_actor_trait_governance WHERE actor_id=v_scout_actor_id AND characteristic_class='constitutional' AND plasticity='immutable';
  IF v_policy_count <> 11 OR v_event_count <> 11 OR v_constitution_count <> 5 THEN
    RAISE EXCEPTION 'SCOUT-001 developmental initialization counts are invalid: policies %, events %, constitutional %',v_policy_count,v_event_count,v_constitution_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM comind.v_current_actor_trait_governance
    WHERE actor_id=v_scout_actor_id
      AND plasticity='immutable'
      AND (characteristic_class<>'constitutional' OR min_weight<>initial_weight OR max_weight<>initial_weight OR max_delta_per_event<>0 OR self_modifiable)
  ) THEN
    RAISE EXCEPTION 'SCOUT-001 immutable characteristic contract is invalid';
  END IF;

  IF to_regclass('comind.cm_actor_external_resource') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM comind.cm_actor_external_resource WHERE actor_id=$1' INTO v_resource_count USING v_scout_actor_id;
    IF v_resource_count <> 0 THEN RAISE EXCEPTION 'SCOUT-001 draft Scout has external resources'; END IF;
  END IF;

  SELECT count(*) INTO v_grant_count FROM comind.cm_foundry_capability_grant WHERE profile_id=v_profile_id AND revoked_at IS NULL;
  IF v_grant_count <> 0 THEN RAISE EXCEPTION 'SCOUT-001 draft Scout has active capability grants'; END IF;

  SELECT count(*) INTO v_audit_count FROM comind.cm_audit_log
  WHERE action='scout.ve.provisioned_draft'
    AND target_table='comind.cm_foundry_agent_profile'
    AND target_id=v_profile_id;
  IF v_audit_count <> 1 THEN RAISE EXCEPTION 'SCOUT-001 provisioning audit count must be exactly one, got %',v_audit_count; END IF;

  SELECT trait_id INTO v_constitution_trait_id FROM comind.cm_trait WHERE name::text='epistemic_integrity';
  SELECT trait_id INTO v_adaptive_trait_id FROM comind.cm_trait WHERE name::text='communication_directness';

  SELECT event_id INTO v_initial_event_id FROM comind.cm_actor_trait_development_event
  WHERE actor_id=v_scout_actor_id AND trait_id=v_constitution_trait_id AND idempotency_key='scout-001:init:epistemic_integrity';

  SELECT comind.record_actor_trait_development_event(
    v_scout_actor_id,v_constitution_trait_id,'initialize',1.00::real,
    'SCOUT-001 governed initial characteristic assignment',
    jsonb_build_array('VE-STD-001.v0.1','github:issue/399'),
    v_founder_actor_id,v_founder_actor_id,'github:issue/399','scout-001:init:epistemic_integrity'
  ) INTO v_replay_event_id;
  IF v_replay_event_id <> v_initial_event_id THEN RAISE EXCEPTION 'SCOUT-001 initialization replay is not idempotent'; END IF;

  v_failed := false;
  BEGIN
    PERFORM comind.record_actor_trait_development_event(
      v_scout_actor_id,v_constitution_trait_id,'adapt',0.99::real,
      'Negative proof: immutable constitutional characteristic change must fail',
      jsonb_build_array('github:issue/399'),
      v_founder_actor_id,v_founder_actor_id,'github:issue/399','scout-001:negative:immutable'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'SCOUT-001 immutable characteristic mutation was not rejected'; END IF;

  v_failed := false;
  BEGIN
    PERFORM comind.record_actor_trait_development_event(
      v_scout_actor_id,v_adaptive_trait_id,'adapt',0.73::real,
      'Negative proof: Scout may not self-modify before Growth Engine authorization exists',
      jsonb_build_array('github:issue/399'),
      v_scout_actor_id,NULL,'github:issue/399','scout-001:negative:self-modification'
    );
  EXCEPTION WHEN check_violation THEN
    v_failed := true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'SCOUT-001 self-modification prohibition was not enforced'; END IF;

  PERFORM comind.record_actor_trait_development_event(
    v_scout_actor_id,v_adaptive_trait_id,'adapt',0.73::real,
    'Positive proof: bounded founder-initiated microplastic adaptation',
    jsonb_build_array('github:issue/399','test:bounded-adaptation'),
    v_founder_actor_id,NULL,'github:issue/399','scout-001:positive:bounded-adaptation'
  );
  SELECT weight INTO v_weight FROM comind.cm_actor_trait WHERE actor_id=v_scout_actor_id AND trait_id=v_adaptive_trait_id;
  IF abs(v_weight-0.73::real) > 0.0001 THEN RAISE EXCEPTION 'SCOUT-001 bounded adaptive projection did not update'; END IF;

  v_failed := false;
  BEGIN
    UPDATE comind.cm_ve_developmental_manifest SET purpose=purpose WHERE manifest_id=v_manifest_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'SCOUT-001 manifest append-only trigger failed'; END IF;

  v_failed := false;
  BEGIN
    DELETE FROM comind.cm_actor_trait_development_event WHERE event_id=v_initial_event_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%append-only%' THEN v_failed := true; ELSE RAISE; END IF;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'SCOUT-001 developmental event append-only trigger failed'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='comind'
      AND c.relname IN ('cm_ve_developmental_manifest','cm_actor_trait_governance','cm_actor_trait_development_event')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'SCOUT-001 developmental tables must have RLS enabled and forced';
  END IF;
END;
$$;

SELECT 'pass|SCOUT-001 developmental identity, draft VE, immutable constitution, bounded plasticity, idempotency, append-only history, RLS, and zero-grant boundary verified' AS result;

ROLLBACK;