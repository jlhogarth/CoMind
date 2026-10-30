-- SCOUT-001 first governed developmental VE birth
-- CoMind Test DML only. No Production activation. No external provider mutation.
-- Idempotent and fail-closed on conflicting identity, lifecycle, authority, resource, or budget state.

BEGIN;

DO $$
DECLARE
    v_org_id uuid;
    v_project_id uuid;
    v_founder_actor_id uuid;
    v_scout_actor_id uuid;
    v_scout_agent_id uuid;
    v_profile_id uuid;
    v_profile_status text;
    v_evidence_id uuid;
    v_evidence_count integer;
    v_profile_match_count integer;
    v_grant_count integer;
    v_resource_count integer;
    v_budget_binding_count integer;
    v_lifecycle_audit_count integer;
    v_active_authorization_count integer;
    v_manifest_ref text := 'docs/ve/scout/SCOUT-001-MANIFEST.v0.1.json';
    v_manifest_blob_sha text := '647d287fe986acbfe4ca1ec1da89d23eae0e7a8e';
BEGIN
    SELECT org_id INTO v_org_id
    FROM comind.cm_org
    WHERE slug::text = 'comind';
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'SCOUT-001 requires canonical CoMind org slug comind';
    END IF;

    SELECT project_id INTO v_project_id
    FROM comind.cm_project
    WHERE org_id = v_org_id
      AND project_code::text = 'COMIND'
      AND status = 'active';
    IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'SCOUT-001 requires active canonical COMIND project';
    END IF;

    SELECT actor_id INTO v_founder_actor_id
    FROM comind.cm_actor
    WHERE org_id = v_org_id
      AND handle::text = 'joseph.hogarth'
      AND kind = 'person';
    IF v_founder_actor_id IS NULL THEN
        RAISE EXCEPTION 'SCOUT-001 requires canonical founder actor joseph.hogarth';
    END IF;

    SELECT count(*) INTO v_evidence_count
    FROM comind.cm_evidence
    WHERE source_type = 've_developmental_manifest'
      AND source_ref = 'github:jlhogarth/CoMind/' || v_manifest_ref;
    IF v_evidence_count > 1 THEN
        RAISE EXCEPTION 'SCOUT-001 found duplicate developmental manifest evidence records';
    END IF;

    SELECT evidence_id INTO v_evidence_id
    FROM comind.cm_evidence
    WHERE source_type = 've_developmental_manifest'
      AND source_ref = 'github:jlhogarth/CoMind/' || v_manifest_ref;

    IF v_evidence_id IS NULL THEN
        INSERT INTO comind.cm_evidence(title, source_type, source_ref, checksum, metadata)
        VALUES (
            'Scout developmental manifest v0.1',
            've_developmental_manifest',
            'github:jlhogarth/CoMind/' || v_manifest_ref,
            'git-blob-sha1:' || v_manifest_blob_sha,
            jsonb_build_object(
                'issue', 395,
                'control_id', 'SCOUT-001',
                'manifest_version', '0.1',
                'standard', 'VE-STD-001',
                'environment', 'Test',
                'production_authorized', false,
                'autonomous_developmental_mutation_enabled', false
            )
        )
        RETURNING evidence_id INTO v_evidence_id;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM comind.cm_evidence
            WHERE evidence_id = v_evidence_id
              AND checksum = 'git-blob-sha1:' || v_manifest_blob_sha
        ) THEN
            RAISE EXCEPTION 'SCOUT-001 existing manifest evidence checksum conflicts with canonical manifest';
        END IF;
    END IF;

    SELECT actor_id INTO v_scout_actor_id
    FROM comind.cm_actor
    WHERE handle::text = 'agent.scout';

    IF v_scout_actor_id IS NULL THEN
        INSERT INTO comind.cm_actor(org_id, kind, handle, display_name, meta)
        VALUES (
            v_org_id,
            'agent',
            'agent.scout',
            'Scout',
            jsonb_build_object(
                'control_id', 'SCOUT-001',
                'issue', 395,
                'identity_owner', 'CoMind Inc.',
                'accountable_sponsor_actor_id', v_founder_actor_id,
                'supervisor_actor_id', v_founder_actor_id,
                'developmental_manifest_ref', v_manifest_ref,
                'developmental_manifest_version', '0.1',
                'developmental_manifest_evidence_id', v_evidence_id,
                'environment', 'Test',
                'production_authorized', false,
                'autonomous_developmental_mutation_enabled', false
            )
        )
        RETURNING actor_id INTO v_scout_actor_id;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM comind.cm_actor
            WHERE actor_id = v_scout_actor_id
              AND org_id = v_org_id
              AND kind = 'agent'
              AND display_name = 'Scout'
              AND meta->>'control_id' = 'SCOUT-001'
              AND meta->>'identity_owner' = 'CoMind Inc.'
              AND meta->>'accountable_sponsor_actor_id' = v_founder_actor_id::text
              AND meta->>'supervisor_actor_id' = v_founder_actor_id::text
              AND meta->>'developmental_manifest_ref' = v_manifest_ref
              AND meta->>'developmental_manifest_version' = '0.1'
              AND meta->>'developmental_manifest_evidence_id' = v_evidence_id::text
              AND coalesce((meta->>'production_authorized')::boolean, false) = false
              AND coalesce((meta->>'autonomous_developmental_mutation_enabled')::boolean, false) = false
        ) THEN
            RAISE EXCEPTION 'SCOUT-001 existing actor conflicts with canonical Scout identity';
        END IF;
    END IF;

    SELECT agent_id INTO v_scout_agent_id
    FROM comind.cm_agent
    WHERE name::text = 'Scout';

    IF v_scout_agent_id IS NULL THEN
        INSERT INTO comind.cm_agent(org_id, name, description, config)
        VALUES (
            v_org_id,
            'Scout',
            'Governed developmental Emerging Technology Research Analyst for evidence-grounded CoMind research.',
            jsonb_build_object(
                'control_id', 'SCOUT-001',
                'issue', 395,
                'purpose', 'Emerging technology and standards research for CoMind',
                'role_code', 'emerging_technology_research_analyst',
                'developmental_manifest_ref', v_manifest_ref,
                'developmental_manifest_version', '0.1',
                'environment', 'isolated',
                'autonomous_growth_enabled', false,
                'delegation_enabled', false,
                'paid_provider_authorized', false,
                'external_provider_mutation_authorized', false,
                'production_mutation_authorized', false
            )
        )
        RETURNING agent_id INTO v_scout_agent_id;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM comind.cm_agent
            WHERE agent_id = v_scout_agent_id
              AND org_id = v_org_id
              AND description = 'Governed developmental Emerging Technology Research Analyst for evidence-grounded CoMind research.'
              AND config->>'control_id' = 'SCOUT-001'
              AND config->>'role_code' = 'emerging_technology_research_analyst'
              AND config->>'developmental_manifest_ref' = v_manifest_ref
              AND config->>'developmental_manifest_version' = '0.1'
              AND config->>'environment' = 'isolated'
              AND coalesce((config->>'autonomous_growth_enabled')::boolean, false) = false
              AND coalesce((config->>'delegation_enabled')::boolean, false) = false
              AND coalesce((config->>'paid_provider_authorized')::boolean, false) = false
              AND coalesce((config->>'external_provider_mutation_authorized')::boolean, false) = false
              AND coalesce((config->>'production_mutation_authorized')::boolean, false) = false
        ) THEN
            RAISE EXCEPTION 'SCOUT-001 existing agent conflicts with canonical Scout computational identity';
        END IF;
    END IF;

    SELECT count(*) INTO v_profile_match_count
    FROM comind.cm_foundry_agent_profile
    WHERE actor_id = v_scout_actor_id
       OR agent_id = v_scout_agent_id
       OR role_code = 'emerging_technology_research_analyst';
    IF v_profile_match_count > 1 THEN
        RAISE EXCEPTION 'SCOUT-001 found conflicting Foundry profile identities';
    END IF;

    SELECT profile_id, status
      INTO v_profile_id, v_profile_status
    FROM comind.cm_foundry_agent_profile
    WHERE actor_id = v_scout_actor_id
       OR agent_id = v_scout_agent_id
       OR role_code = 'emerging_technology_research_analyst';

    IF v_profile_id IS NULL THEN
        INSERT INTO comind.cm_foundry_agent_profile(
            agent_id, actor_id, org_id, role_code, display_name,
            authority_floor, authority_ceiling, instruction_version,
            runtime_defaults, competencies, status
        )
        VALUES (
            v_scout_agent_id,
            v_scout_actor_id,
            v_org_id,
            'emerging_technology_research_analyst',
            'Scout',
            'C0',
            'C1',
            'scout.v0.1',
            jsonb_build_object(
                'execution_mode', 'isolated',
                'developmental_manifest_ref', v_manifest_ref,
                'developmental_manifest_version', '0.1',
                'developmental_mutation_mode', 'disabled',
                'external_provider_mutation_allowed', false,
                'paid_provider_allowed', false,
                'production_target_allowed', false
            ),
            jsonb_build_array(
                'public_research',
                'source_evaluation',
                'standards_tracking',
                'technology_scouting',
                'evidence_synthesis'
            ),
            'draft'
        )
        RETURNING profile_id, status INTO v_profile_id, v_profile_status;
    ELSE
        IF v_profile_status <> 'draft' THEN
            RAISE EXCEPTION 'SCOUT-001 existing profile is %, refusing implicit lifecycle change', v_profile_status;
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM comind.cm_foundry_agent_profile
            WHERE profile_id = v_profile_id
              AND agent_id = v_scout_agent_id
              AND actor_id = v_scout_actor_id
              AND org_id = v_org_id
              AND role_code = 'emerging_technology_research_analyst'
              AND display_name = 'Scout'
              AND authority_floor = 'C0'
              AND authority_ceiling = 'C1'
              AND instruction_version = 'scout.v0.1'
              AND status = 'draft'
              AND activated_at IS NULL
              AND retired_at IS NULL
              AND runtime_defaults->>'execution_mode' = 'isolated'
              AND runtime_defaults->>'developmental_mutation_mode' = 'disabled'
              AND coalesce((runtime_defaults->>'external_provider_mutation_allowed')::boolean, false) = false
              AND coalesce((runtime_defaults->>'paid_provider_allowed')::boolean, false) = false
              AND coalesce((runtime_defaults->>'production_target_allowed')::boolean, false) = false
        ) THEN
            RAISE EXCEPTION 'SCOUT-001 existing profile conflicts with canonical draft authority or runtime contract';
        END IF;
    END IF;

    SELECT count(*) INTO v_grant_count
    FROM comind.cm_foundry_capability_grant
    WHERE profile_id = v_profile_id
      AND revoked_at IS NULL;
    IF v_grant_count <> 0 THEN
        RAISE EXCEPTION 'SCOUT-001 draft birth requires zero active capability grants, found %', v_grant_count;
    END IF;

    SELECT count(*) INTO v_resource_count
    FROM comind.cm_actor_external_resource
    WHERE actor_id = v_scout_actor_id;
    IF v_resource_count <> 0 THEN
        RAISE EXCEPTION 'SCOUT-001 draft birth requires zero external resources, found %', v_resource_count;
    END IF;

    SELECT count(*) INTO v_budget_binding_count
    FROM comind.cm_budget_authority_binding
    WHERE actor_id = v_scout_actor_id
       OR agent_id = v_scout_agent_id;
    IF v_budget_binding_count <> 0 THEN
        RAISE EXCEPTION 'SCOUT-001 draft birth requires zero budget authority bindings, found %', v_budget_binding_count;
    END IF;

    SELECT count(*) INTO v_lifecycle_audit_count
    FROM comind.cm_audit_log
    WHERE target_table = 'comind.cm_foundry_agent_profile'
      AND target_id = v_profile_id
      AND action LIKE 've.lifecycle.%';
    IF v_lifecycle_audit_count <> 0 THEN
        RAISE EXCEPTION 'SCOUT-001 draft birth requires zero lifecycle transition audits, found %', v_lifecycle_audit_count;
    END IF;

    SELECT count(*) INTO v_active_authorization_count
    FROM comind.cm_foundry_authorization_request
    WHERE target_kind = 'foundry_agent_profile'
      AND target_ref = v_profile_id::text
      AND status IN ('pending', 'approved')
      AND (expires_at IS NULL OR expires_at > clock_timestamp());
    IF v_active_authorization_count <> 0 THEN
        RAISE EXCEPTION 'SCOUT-001 draft birth requires zero active lifecycle authorization envelopes, found %', v_active_authorization_count;
    END IF;

    INSERT INTO comind.cm_audit_log(actor_id, action, target_table, target_id, details)
    SELECT
        v_founder_actor_id,
        'scout.ve.created_draft',
        'comind.cm_foundry_agent_profile',
        v_profile_id,
        jsonb_build_object(
            'control_id', 'SCOUT-001',
            'issue', 395,
            'actor_id', v_scout_actor_id,
            'agent_id', v_scout_agent_id,
            'profile_id', v_profile_id,
            'manifest_evidence_id', v_evidence_id,
            'manifest_ref', v_manifest_ref,
            'manifest_version', '0.1',
            'lifecycle_state', 'draft',
            'environment', 'isolated',
            'authority_floor', 'C0',
            'authority_ceiling', 'C1',
            'active_grants', 0,
            'external_resources', 0,
            'budget_authority_bindings', 0,
            'active_authorizations', 0,
            'production_authorized', false,
            'paid_provider_authorized', false,
            'autonomous_developmental_mutation_enabled', false
        )
    WHERE NOT EXISTS (
        SELECT 1
        FROM comind.cm_audit_log
        WHERE action = 'scout.ve.created_draft'
          AND target_table = 'comind.cm_foundry_agent_profile'
          AND target_id = v_profile_id
    );
END;
$$;

COMMIT;

SELECT
    a.actor_id::text AS actor_id,
    a.handle::text AS actor_handle,
    ag.agent_id::text AS agent_id,
    p.profile_id::text AS profile_id,
    p.role_code,
    p.status,
    p.authority_floor,
    p.authority_ceiling,
    p.instruction_version,
    p.activated_at,
    p.retired_at,
    (SELECT count(*) FROM comind.cm_foundry_capability_grant g WHERE g.profile_id = p.profile_id AND g.revoked_at IS NULL)::int AS active_grants,
    (SELECT count(*) FROM comind.cm_actor_external_resource r WHERE r.actor_id = a.actor_id)::int AS external_resources,
    (SELECT count(*) FROM comind.cm_budget_authority_binding b WHERE b.actor_id = a.actor_id OR b.agent_id = ag.agent_id)::int AS budget_authority_bindings,
    (SELECT count(*) FROM comind.cm_audit_log al WHERE al.target_table = 'comind.cm_foundry_agent_profile' AND al.target_id = p.profile_id AND al.action LIKE 've.lifecycle.%')::int AS lifecycle_transition_audits,
    (SELECT count(*) FROM comind.cm_audit_log al WHERE al.action = 'scout.ve.created_draft' AND al.target_id = p.profile_id)::int AS birth_audits,
    (SELECT evidence_id::text FROM comind.cm_evidence e WHERE e.source_type = 've_developmental_manifest' AND e.source_ref = 'github:jlhogarth/CoMind/docs/ve/scout/SCOUT-001-MANIFEST.v0.1.json') AS manifest_evidence_id
FROM comind.cm_actor a
JOIN comind.cm_foundry_agent_profile p ON p.actor_id = a.actor_id
JOIN comind.cm_agent ag ON ag.agent_id = p.agent_id
WHERE a.handle::text = 'agent.scout';
