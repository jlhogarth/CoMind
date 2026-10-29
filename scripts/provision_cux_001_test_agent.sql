-- CUX-001 Console Usability Auditor Test provisioning
-- Scope: existing CoMind Test schema only. No DDL and no Production activation.
-- The script is idempotent for the canonical CoMind org/project and fails closed on conflicting state.

BEGIN;

DO $$
DECLARE
    v_org_id uuid;
    v_project_id uuid;
    v_founder_actor_id uuid;
    v_agent_actor_id uuid;
    v_agent_id uuid;
    v_profile_id uuid;
    v_profile_status text;
    v_capability record;
    v_grant_scope jsonb := jsonb_build_object(
        'target_refs', jsonb_build_array('apps/operator-console'),
        'max_tasks', 1
    );
    v_capability_count integer;
    v_grant_count integer;
BEGIN
    SELECT org_id
      INTO v_org_id
      FROM comind.cm_org
     WHERE slug::text = 'comind';
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'CUX-001 requires canonical CoMind org slug comind';
    END IF;

    SELECT project_id
      INTO v_project_id
      FROM comind.cm_project
     WHERE org_id = v_org_id
       AND project_code::text = 'COMIND'
       AND status = 'active';
    IF v_project_id IS NULL THEN
        RAISE EXCEPTION 'CUX-001 requires active canonical COMIND project';
    END IF;

    SELECT actor_id
      INTO v_founder_actor_id
      FROM comind.cm_actor
     WHERE org_id = v_org_id
       AND handle::text = 'joseph.hogarth'
       AND kind = 'person';
    IF v_founder_actor_id IS NULL THEN
        RAISE EXCEPTION 'CUX-001 requires canonical founder actor joseph.hogarth';
    END IF;

    SELECT actor_id
      INTO v_agent_actor_id
      FROM comind.cm_actor
     WHERE org_id = v_org_id
       AND handle::text = 'agent.console_usability_auditor';

    IF v_agent_actor_id IS NULL THEN
        INSERT INTO comind.cm_actor(org_id, kind, handle, display_name, meta)
        VALUES (
            v_org_id,
            'agent',
            'agent.console_usability_auditor',
            'Console Usability Auditor',
            jsonb_build_object(
                'project', 'CUX-001',
                'issue', 322,
                'environment', 'Test',
                'production_authorized', false
            )
        )
        RETURNING actor_id INTO v_agent_actor_id;
    END IF;

    SELECT agent_id
      INTO v_agent_id
      FROM comind.cm_agent
     WHERE org_id = v_org_id
       AND name::text = 'Console Usability Auditor';

    IF v_agent_id IS NULL THEN
        INSERT INTO comind.cm_agent(org_id, name, description, config)
        VALUES (
            v_org_id,
            'Console Usability Auditor',
            'Governed read-only and reversible browser usability reviewer for the CoMind Operator Console.',
            jsonb_build_object(
                'project', 'CUX-001',
                'issue', 322,
                'adapter', 'console_usability',
                'environment', 'isolated',
                'paid_provider_authorized', false,
                'production_mutation_authorized', false
            )
        )
        RETURNING agent_id INTO v_agent_id;
    END IF;

    SELECT profile_id, status
      INTO v_profile_id, v_profile_status
      FROM comind.cm_foundry_agent_profile
     WHERE org_id = v_org_id
       AND role_code = 'console_usability_auditor';

    IF v_profile_id IS NULL THEN
        INSERT INTO comind.cm_foundry_agent_profile(
            agent_id,
            actor_id,
            org_id,
            role_code,
            display_name,
            authority_floor,
            authority_ceiling,
            instruction_version,
            runtime_defaults,
            competencies,
            status,
            activated_at
        )
        VALUES (
            v_agent_id,
            v_agent_actor_id,
            v_org_id,
            'console_usability_auditor',
            'Console Usability Auditor',
            'C0',
            'C1',
            'cux-001.v1',
            jsonb_build_object(
                'adapter', 'console_usability',
                'execution_mode', 'isolated_local',
                'production_target_allowed', false,
                'paid_provider_allowed', false
            ),
            jsonb_build_array(
                'navigation_integrity',
                'interactive_control_integrity',
                'content_clarity',
                'readability',
                'keyboard_navigation',
                'responsive_layout',
                'touch_target_sizing',
                'browser_engine_compatibility'
            ),
            'active',
            clock_timestamp()
        )
        RETURNING profile_id, status INTO v_profile_id, v_profile_status;
    ELSE
        IF v_profile_status <> 'active' THEN
            RAISE EXCEPTION 'CUX-001 existing profile is %, refusing implicit activation', v_profile_status;
        END IF;

        IF NOT EXISTS (
            SELECT 1
              FROM comind.cm_foundry_agent_profile
             WHERE profile_id = v_profile_id
               AND agent_id = v_agent_id
               AND actor_id = v_agent_actor_id
               AND authority_floor = 'C0'
               AND authority_ceiling = 'C1'
               AND instruction_version = 'cux-001.v1'
        ) THEN
            RAISE EXCEPTION 'CUX-001 existing profile conflicts with canonical identity or authority';
        END IF;
    END IF;

    INSERT INTO comind.cm_foundry_capability(
        capability_code,
        description,
        action,
        target_kind,
        max_authority,
        risk_class,
        cost_bearing,
        adapter
    ) VALUES
        (
            'console.usability.inspect',
            'Inspect Operator Console structure, content, navigation, readability, and responsive behavior.',
            'inspect',
            'operator_console',
            'C1',
            'low',
            false,
            'console_usability'
        ),
        (
            'console.usability.browser_test',
            'Run the bounded deterministic Operator Console browser and mobile usability harness.',
            'browser_test',
            'operator_console',
            'C1',
            'low',
            false,
            'console_usability'
        ),
        (
            'console.usability.review',
            'Produce evidence-backed Operator Console usability findings for human acceptance.',
            'review',
            'operator_console',
            'C1',
            'low',
            false,
            'console_usability'
        )
    ON CONFLICT (capability_code) DO NOTHING;

    SELECT count(*)
      INTO v_capability_count
      FROM comind.cm_foundry_capability
     WHERE capability_code IN (
            'console.usability.inspect',
            'console.usability.browser_test',
            'console.usability.review'
       )
       AND target_kind = 'operator_console'
       AND max_authority = 'C1'
       AND risk_class = 'low'
       AND cost_bearing = false
       AND adapter = 'console_usability'
       AND (
            (capability_code = 'console.usability.inspect' AND action = 'inspect')
         OR (capability_code = 'console.usability.browser_test' AND action = 'browser_test')
         OR (capability_code = 'console.usability.review' AND action = 'review')
       );
    IF v_capability_count <> 3 THEN
        RAISE EXCEPTION 'CUX-001 capability definitions conflict with canonical bounded contract';
    END IF;

    FOR v_capability IN
        SELECT capability_id, capability_code
          FROM comind.cm_foundry_capability
         WHERE capability_code IN (
                'console.usability.inspect',
                'console.usability.browser_test',
                'console.usability.review'
           )
    LOOP
        IF NOT EXISTS (
            SELECT 1
              FROM comind.cm_foundry_capability_grant
             WHERE profile_id = v_profile_id
               AND capability_id = v_capability.capability_id
               AND environment = 'isolated'
               AND project_id = v_project_id
               AND revoked_at IS NULL
        ) THEN
            INSERT INTO comind.cm_foundry_capability_grant(
                profile_id,
                capability_id,
                org_id,
                project_id,
                environment,
                authority_ceiling,
                scope,
                granted_by_actor_id,
                grant_reason
            )
            VALUES (
                v_profile_id,
                v_capability.capability_id,
                v_org_id,
                v_project_id,
                'isolated',
                'C1',
                v_grant_scope,
                v_founder_actor_id,
                'CUX-001 Issue #322: bounded Test usability review for apps/operator-console'
            );
        END IF;
    END LOOP;

    SELECT count(*)
      INTO v_grant_count
      FROM comind.cm_foundry_capability_grant g
      JOIN comind.cm_foundry_capability c ON c.capability_id = g.capability_id
     WHERE g.profile_id = v_profile_id
       AND g.project_id = v_project_id
       AND g.environment = 'isolated'
       AND g.authority_ceiling = 'C1'
       AND g.scope = v_grant_scope
       AND g.revoked_at IS NULL
       AND c.capability_code IN (
            'console.usability.inspect',
            'console.usability.browser_test',
            'console.usability.review'
       );
    IF v_grant_count <> 3 THEN
        RAISE EXCEPTION 'CUX-001 isolated grant set is incomplete or conflicts with canonical scope';
    END IF;

    INSERT INTO comind.cm_audit_log(actor_id, action, target_table, target_id, details)
    SELECT
        v_founder_actor_id,
        'cux.agent.provisioned_test',
        'comind.cm_foundry_agent_profile',
        v_profile_id,
        jsonb_build_object(
            'issue', 322,
            'role_code', 'console_usability_auditor',
            'project_id', v_project_id,
            'environment', 'isolated',
            'authority_ceiling', 'C1',
            'capabilities', jsonb_build_array(
                'console.usability.inspect',
                'console.usability.browser_test',
                'console.usability.review'
            ),
            'production_authorized', false,
            'paid_provider_authorized', false
        )
    WHERE NOT EXISTS (
        SELECT 1
          FROM comind.cm_audit_log
         WHERE action = 'cux.agent.provisioned_test'
           AND target_table = 'comind.cm_foundry_agent_profile'
           AND target_id = v_profile_id
    );
END;
$$;

COMMIT;
