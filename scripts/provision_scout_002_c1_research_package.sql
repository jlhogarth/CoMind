-- SCOUT-002 minimum viable C1 research package registration.
-- Registers one non-cost-bearing capability only.
-- Does not activate Scout and does not create a live capability grant.

BEGIN;

DO $$
DECLARE
    v_org_id uuid;
    v_project_id uuid;
    v_founder_actor_id uuid;
    v_scout_actor_id uuid;
    v_scout_agent_id uuid;
    v_profile_id uuid;
    v_capability_id uuid;
    v_active_grant_count integer;
    v_resource_count integer := 0;
    v_budget_binding_count integer;
BEGIN
    SELECT org_id INTO v_org_id
    FROM comind.cm_org
    WHERE slug::text = 'comind';
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'SCOUT-002 requires canonical CoMind org slug comind';
    END IF;

    SELECT project_id INTO v_project_id
    FROM comind.cm_project
    WHERE org_id = v_org_id
      AND slug::text = 'comind'
      AND status = 'active';
    IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'SCOUT-002 requires active canonical CoMind project slug comind';
    END IF;

    SELECT actor_id INTO v_founder_actor_id
    FROM comind.cm_actor
    WHERE org_id = v_org_id
      AND handle::text = 'joseph.hogarth'
      AND kind = 'person';
    IF v_founder_actor_id IS NULL THEN
        RAISE EXCEPTION 'SCOUT-002 requires canonical accountable sponsor joseph.hogarth';
    END IF;

    SELECT a.actor_id, p.agent_id, p.profile_id
      INTO v_scout_actor_id, v_scout_agent_id, v_profile_id
    FROM comind.cm_actor a
    JOIN comind.cm_foundry_agent_profile p ON p.actor_id = a.actor_id
    WHERE a.org_id = v_org_id
      AND a.handle::text = 'agent.scout'
      AND a.kind = 'agent'
      AND p.role_code = 'emerging_technology_research_analyst';

    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'SCOUT-002 requires canonical Scout profile from SCOUT-001';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM comind.cm_foundry_agent_profile p
        JOIN comind.cm_agent ag ON ag.agent_id = p.agent_id
        WHERE p.profile_id = v_profile_id
          AND p.actor_id = v_scout_actor_id
          AND p.agent_id = v_scout_agent_id
          AND p.org_id = v_org_id
          AND p.role_code = 'emerging_technology_research_analyst'
          AND p.status = 'draft'
          AND p.authority_floor = 'C0'
          AND p.authority_ceiling = 'C1'
          AND p.activated_at IS NULL
          AND p.retired_at IS NULL
          AND ag.name::text = 'Scout'
          AND ag.config->>'control_id' = 'SCOUT-001'
          AND coalesce((ag.config->>'paid_provider_authorized')::boolean, false) = false
          AND coalesce((ag.config->>'external_provider_mutation_authorized')::boolean, false) = false
          AND coalesce((ag.config->>'production_mutation_authorized')::boolean, false) = false
    ) THEN
        RAISE EXCEPTION 'SCOUT-002 refuses Scout identity, lifecycle, authority, or runtime drift';
    END IF;

    SELECT count(*) INTO v_active_grant_count
    FROM comind.cm_foundry_capability_grant
    WHERE profile_id = v_profile_id
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > clock_timestamp());
    IF v_active_grant_count <> 0 THEN
        RAISE EXCEPTION 'SCOUT-002 requires Scout to remain at zero active capability grants before package registration, found %', v_active_grant_count;
    END IF;

    -- External provider-resource projection is a later VE substrate surface and is
    -- intentionally absent from the minimal v2 bootstrap. When present, it is an
    -- authoritative zero-resource gate. When absent, this lane still cannot create
    -- any provider resource and live Test readback supplies the authoritative check.
    IF to_regclass('comind.cm_actor_external_resource') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM comind.cm_actor_external_resource WHERE actor_id = $1'
        INTO v_resource_count
        USING v_scout_actor_id;
    END IF;
    IF v_resource_count <> 0 THEN
        RAISE EXCEPTION 'SCOUT-002 requires zero Scout external resources, found %', v_resource_count;
    END IF;

    SELECT count(*) INTO v_budget_binding_count
    FROM comind.cm_budget_authority_binding
    WHERE actor_id = v_scout_actor_id
       OR agent_id = v_scout_agent_id;
    IF v_budget_binding_count <> 0 THEN
        RAISE EXCEPTION 'SCOUT-002 requires zero Scout budget authority bindings, found %', v_budget_binding_count;
    END IF;

    INSERT INTO comind.cm_foundry_capability(
        capability_code, description, action, target_kind,
        max_authority, risk_class, cost_bearing, adapter
    ) VALUES (
        'research.evidence.synthesize',
        'Synthesize a bounded supplied evidence packet into an evidence-grounded research work product for governed human review.',
        'synthesize_evidence',
        'research_assignment',
        'C1',
        'low',
        false,
        'ollama_local'
    )
    ON CONFLICT (capability_code) DO NOTHING;

    SELECT capability_id INTO v_capability_id
    FROM comind.cm_foundry_capability
    WHERE capability_code = 'research.evidence.synthesize';

    IF v_capability_id IS NULL THEN
        RAISE EXCEPTION 'SCOUT-002 failed to resolve research.evidence.synthesize';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM comind.cm_foundry_capability
        WHERE capability_id = v_capability_id
          AND capability_code = 'research.evidence.synthesize'
          AND description = 'Synthesize a bounded supplied evidence packet into an evidence-grounded research work product for governed human review.'
          AND action = 'synthesize_evidence'
          AND target_kind = 'research_assignment'
          AND max_authority = 'C1'
          AND risk_class = 'low'
          AND cost_bearing = false
          AND adapter = 'ollama_local'
    ) THEN
        RAISE EXCEPTION 'SCOUT-002 existing capability definition conflicts with canonical minimum C1 research contract';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM comind.cm_foundry_capability_grant
        WHERE profile_id = v_profile_id
          AND capability_id = v_capability_id
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > clock_timestamp())
    ) THEN
        RAISE EXCEPTION 'SCOUT-002 must not create or preserve a live research.evidence.synthesize grant for Scout';
    END IF;

    INSERT INTO comind.cm_audit_log(actor_id, action, target_table, target_id, details)
    SELECT
        v_founder_actor_id,
        'scout.research_package.registered',
        'comind.cm_foundry_capability',
        v_capability_id,
        jsonb_build_object(
            'control_id', 'SCOUT-002',
            'issue', 409,
            'scout_actor_id', v_scout_actor_id,
            'scout_agent_id', v_scout_agent_id,
            'scout_profile_id', v_profile_id,
            'capability_code', 'research.evidence.synthesize',
            'target_kind', 'research_assignment',
            'initial_target_ref', 'scout-r001:ve-standards-operational-readiness',
            'environment', 'isolated',
            'authority_ceiling', 'C1',
            'cost_bearing', false,
            'live_grant_created', false,
            'scout_lifecycle_activated', false,
            'production_authorized', false,
            'paid_provider_authorized', false,
            'delegation_authorized', false
        )
    WHERE NOT EXISTS (
        SELECT 1
        FROM comind.cm_audit_log
        WHERE action = 'scout.research_package.registered'
          AND target_table = 'comind.cm_foundry_capability'
          AND target_id = v_capability_id
          AND details->>'control_id' = 'SCOUT-002'
    );
END;
$$;

COMMIT;

SELECT
    a.handle::text AS actor_handle,
    p.profile_id::text AS profile_id,
    p.status,
    p.authority_floor,
    p.authority_ceiling,
    p.activated_at,
    c.capability_code,
    c.action,
    c.target_kind,
    c.max_authority,
    c.risk_class,
    c.cost_bearing,
    c.adapter,
    (SELECT count(*) FROM comind.cm_foundry_capability_grant g
      WHERE g.profile_id = p.profile_id
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp()))::int AS active_grants
FROM comind.cm_actor a
JOIN comind.cm_foundry_agent_profile p ON p.actor_id = a.actor_id
CROSS JOIN comind.cm_foundry_capability c
WHERE a.handle::text = 'agent.scout'
  AND c.capability_code = 'research.evidence.synthesize';
